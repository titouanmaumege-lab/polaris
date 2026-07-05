// Droits RGPD exercés in-app : export complet (art. 20) et suppression de
// compte réelle (art. 17 + Apple 5.1.1(v), RPC delete_account — migration 008).
import { supabase } from "../supabase";
import { clearConsentCache } from "./consent";

// table → colonne propriétaire (pour l'export ; RLS filtre déjà côté serveur)
const EXPORT_TABLES = {
  user_data: "id",
  user_consents: "user_id",
  profiles: "id",
  finance_accounts: "user_id",
  finance_categories: "user_id",
  finance_transactions: "user_id",
  finance_budgets: "user_id",
  finance_subscriptions: "user_id",
  finance_goals: "user_id",
  finance_recurring: "user_id",
  finance_investments: "user_id",
  finance_investment_moves: "user_id",
  finance_debts: "user_id",
  knowledge_bases: "owner_id",
  knowledge_pages: "owner_id",
  knowledge_tags: "owner_id",
  knowledge_links: "owner_id",
  knowledge_base_members: "user_id",
};

/** Export JSON complet : base (toutes tables) + copie locale. Portabilité art. 20. */
export async function exportAllData(userId, email) {
  const out = {
    app: "POLARIS",
    exportedAt: new Date().toISOString(),
    account: { id: userId, email },
    database: {},
    localData: {},
  };
  for (const [table, col] of Object.entries(EXPORT_TABLES)) {
    const { data, error } = await supabase.from(table).select("*").eq(col, userId);
    out.database[table] = error ? { _error: error.message } : data;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("lp_") || k.startsWith("leplan_"))) {
      try { out.localData[k] = JSON.parse(localStorage.getItem(k)); }
      catch { out.localData[k] = localStorage.getItem(k); }
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `polaris-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** Purge toute trace locale (données + session + consentements). */
export function purgeLocalData() {
  const doomed = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("lp_") || k.startsWith("leplan_") || k.startsWith("LE_PLAN_") || k.startsWith("sb-"))) doomed.push(k);
  }
  doomed.forEach(k => localStorage.removeItem(k));
  clearConsentCache();
}

/**
 * Suppression définitive du compte. Re-authentification par mot de passe
 * (étape de confirmation exigée par la CNIL et Apple), puis RPC serveur.
 */
export async function deleteAccount(email, password) {
  const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) return { error: "Mot de passe incorrect." };

  const { error } = await supabase.rpc("delete_account");
  if (error) {
    console.error("delete_account:", error);
    return { error: "La suppression a échoué. Réessaie ou contacte le support." };
  }
  purgeLocalData();
  await supabase.auth.signOut().catch(() => {});
  return { success: true };
}
