import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { monthBounds } from "../../../utils/date";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Transactions filtrables (mois, compte, catégorie, type).
// filters = { month?: 'YYYY-MM', accountId?, categoryId?, type?, limit? }
export function useFinanceTransactions(userId, filters = {}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { month, accountId, categoryId, type, limit } = filters;

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    let q = supabase.from("finance_transactions").select("*")
      .eq("user_id", userId).order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (month) { const [a, b] = monthBounds(month); q = q.gte("date", a).lte("date", b); }
    if (accountId)  q = q.or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId}`);
    if (categoryId) q = q.eq("category_id", categoryId);
    if (type)       q = q.eq("type", type);
    if (limit)      q = q.limit(limit);
    else            q = q.range(0, 49999); // sinon plafond Supabase à 1000 lignes
    const { data, error } = await q;
    if (error) console.error("fetch transactions error:", error);
    setTransactions((data || []).map(t => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  }, [userId, month, accountId, categoryId, type, limit]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("finance-data-changed", handler);
    return () => window.removeEventListener("finance-data-changed", handler);
  }, [fetch]);

  const createTransaction = async (tx) => {
    const payload = {
      user_id: userId,
      account_id: tx.account_id,
      transfer_account_id: tx.type === "transfert" ? (tx.transfer_account_id ?? null) : null,
      category_id: tx.type === "transfert" ? null : (tx.category_id ?? null),
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      note: tx.note?.trim() || null,
      source: tx.source ?? "manuel",
      recurring_id: tx.recurring_id ?? null,
    };
    const { data, error } = await supabase.from("finance_transactions").insert(payload).select().single();
    if (error) { console.error("createTransaction error:", error); return null; }
    await fetch(); emitChange();
    return data;
  };

  const updateTransaction = async (id, tx) => {
    const patch = {
      account_id: tx.account_id,
      transfer_account_id: tx.type === "transfert" ? (tx.transfer_account_id ?? null) : null,
      category_id: tx.type === "transfert" ? null : (tx.category_id ?? null),
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      note: tx.note?.trim() || null,
    };
    const { data, error } = await supabase.from("finance_transactions").update(patch).eq("id", id).select().single();
    if (error) { console.error("updateTransaction error:", error); return null; }
    await fetch(); emitChange();
    return data;
  };

  const deleteTransaction = async (id) => {
    const { error } = await supabase.from("finance_transactions").delete().eq("id", id);
    if (error) { console.error("deleteTransaction error:", error); return; }
    setTransactions(t => t.filter(x => x.id !== id));
    emitChange();
  };

  return { transactions, loading, createTransaction, updateTransaction, deleteTransaction, refetch: fetch };
}
