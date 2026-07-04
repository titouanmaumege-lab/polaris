import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

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

  const createAccount = async ({ name, type = "courant", initial_balance = 0, currency = "EUR", color = null, icon = null }) => {
    const { data, error } = await supabase.from("finance_accounts").insert({
      user_id: userId, name, type, initial_balance, currency, color, icon,
      sort_order: accounts.length,
    }).select().single();
    if (error) { console.error("createAccount error:", error); return null; }
    await fetch();
    return data;
  };

  const updateAccount = async (id, patch) => {
    const { data, error } = await supabase.from("finance_accounts")
      .update(patch).eq("id", id).select().single();
    if (error) { console.error("updateAccount error:", error); return null; }
    await fetch();
    return data;
  };

  const archiveAccount = async (id) => {
    await supabase.from("finance_accounts").update({ archived: true }).eq("id", id);
    setAccounts(a => a.filter(x => x.id !== id));
  };

  // Suppression définitive (les transactions liées tombent via ON DELETE CASCADE)
  const deleteAccount = async (id) => {
    const { error } = await supabase.from("finance_accounts").delete().eq("id", id);
    if (error) { console.error("deleteAccount error:", error); return; }
    setAccounts(a => a.filter(x => x.id !== id));
    window.dispatchEvent(new Event("finance-data-changed"));
  };

  const reorderAccounts = async (orderedIds) => {
    setAccounts(prev => orderedIds.map((id, i) => ({ ...prev.find(a => a.id === id), sort_order: i })));
    await Promise.all(orderedIds.map((id, i) =>
      supabase.from("finance_accounts").update({ sort_order: i }).eq("id", id)
    ));
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);

  return { accounts, totalBalance, loading, createAccount, updateAccount, archiveAccount, deleteAccount, reorderAccounts, refetch: fetch };
}
