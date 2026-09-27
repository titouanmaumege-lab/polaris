import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { setFinanceError } from "./financeError";

// Comptes financiers + soldes courants.
// Solde calculé CÔTÉ CLIENT depuis les transactions (source de vérité, indépendant
// de la vue SQL) : initial + revenus - dépenses - transferts sortants + transferts entrants.
export function useFinanceAccounts(userId) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const [{ data: accData }, { data: txData }] = await Promise.all([
      supabase.from("finance_accounts").select("*")
        .eq("user_id", userId).eq("archived", false).order("sort_order"),
      supabase.from("finance_transactions")
        .select("account_id, transfer_account_id, type, amount")
        .eq("user_id", userId)
        .range(0, 49999), // sinon plafond Supabase à 1000 lignes → solde faux

    ]);

    // Agrège les mouvements par compte
    const delta = {}; // account_id -> variation de solde
    (txData || []).forEach(t => {
      const amt = Number(t.amount);
      if (t.type === "revenu") {
        delta[t.account_id] = (delta[t.account_id] || 0) + amt;
      } else if (t.type === "depense") {
        delta[t.account_id] = (delta[t.account_id] || 0) - amt;
      } else if (t.type === "transfert") {
        delta[t.account_id] = (delta[t.account_id] || 0) - amt;
        if (t.transfer_account_id) delta[t.transfer_account_id] = (delta[t.transfer_account_id] || 0) + amt;
      }
    });

    setAccounts((accData || []).map(a => ({
      ...a,
      balance: Number(a.initial_balance) + (delta[a.id] || 0),
    })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("finance-data-changed", handler);
    return () => window.removeEventListener("finance-data-changed", handler);
  }, [fetch]);

  const createAccount = async ({ name, type = "courant", nature = "liquidite", initial_balance = 0, currency = "EUR", color = null, icon = null }) => {
    const { data, error } = await supabase.from("finance_accounts").insert({
      user_id: userId, name, type, nature, initial_balance, currency, color, icon,
      sort_order: accounts.length,
    }).select().single();
    if (error) { setFinanceError("createAccount error:", error); return null;  }
    await fetch();
    return data;
  };

  const updateAccount = async (id, patch) => {
    const { data, error } = await supabase.from("finance_accounts")
      .update(patch).eq("id", id).select().single();
    if (error) { setFinanceError("updateAccount error:", error); return null;  }
    await fetch();
    return data;
  };

  const archiveAccount = async (id) => {
    await supabase.from("finance_accounts").update({ archived: true }).eq("id", id);
    setAccounts(a => a.filter(x => x.id !== id));
  };

  // Ce qu'une suppression détruirait réellement — à montrer AVANT de confirmer.
  const getAccountImpact = async (id) => {
    // Un décompte silencieusement faux avant une suppression définitive est pire
    // que pas de décompte : on remonte l'échec au lieu de l'avaler.
    let partial = false;
    const n = async (table, col) => {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq(col, id);
      if (error) { setFinanceError(`getAccountImpact ${table}.${col}:`, error); partial = true; return 0;  }
      return count || 0;
    };
    const [tx, txIn, rec, recIn, subs, goals, invs, moves] = await Promise.all([
      n("finance_transactions", "account_id"),
      n("finance_transactions", "transfer_account_id"),
      n("finance_recurring", "account_id"),
      n("finance_recurring", "transfer_account_id"),
      n("finance_subscriptions", "account_id"),
      n("finance_goals", "account_id"),
      n("finance_investments", "account_id"),
      n("finance_investment_moves", "cash_account_id"),
    ]);
    return { tx, txIn, rec, recIn, subs, goals, invs, moves, detached: subs + goals + invs + moves, partial };
  };

  // Suppression définitive. Irréversible : aucune corbeille, aucun undo.
  //
  // Les transactions du compte tombent via ON DELETE CASCADE. En revanche les
  // virements ENTRANTS passent à transfer_account_id = NULL : le compte source
  // resterait débité sans que personne ne soit crédité, et le patrimoine total
  // baisserait sans trace. On les supprime donc explicitement AVANT, ce qui
  // rend leur montant aux comptes sources.
  const deleteAccount = async (id) => {
    const orphan = async (table) => {
      const { error } = await supabase.from(table).delete()
        .eq("user_id", userId).eq("transfer_account_id", id);
      if (error) throw error;
    };
    try {
      await orphan("finance_transactions");
      await orphan("finance_recurring");
    } catch (e) {
      console.error("deleteAccount (virements entrants):", e);
      return { ok: false, error: e.message };
    }
    const { error } = await supabase.from("finance_accounts").delete().eq("id", id);
    if (error) { setFinanceError("deleteAccount error:", error); return { ok: false, error: error.message  }; }
    setAccounts(a => a.filter(x => x.id !== id));
    window.dispatchEvent(new Event("finance-data-changed"));
    return { ok: true };
  };

  const reorderAccounts = async (orderedIds) => {
    setAccounts(prev => orderedIds.map((id, i) => ({ ...prev.find(a => a.id === id), sort_order: i })));
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("finance_accounts").update({ sort_order: i }).eq("id", id)
    ));
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  return { accounts, totalBalance, loading, createAccount, updateAccount, archiveAccount, deleteAccount, getAccountImpact, reorderAccounts, refetch: fetch };
}
