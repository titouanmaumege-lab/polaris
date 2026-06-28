import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { monthBounds } from "../../../utils/date";

// Budgets mensuels récurrents + dépensé du mois courant (calcul client).
export function useFinanceBudgets(userId) {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const [first, last] = monthBounds();
    const [{ data: budData }, { data: txData }] = await Promise.all([
      supabase.from("finance_budgets").select("*").eq("user_id", userId),
      supabase.from("finance_transactions").select("amount, category_id")
        .eq("user_id", userId).eq("type", "depense").gte("date", first).lte("date", last),
    ]);
    const spentByCat = {}; let spentTotal = 0;
    (txData || []).forEach(t => {
      const amt = Number(t.amount);
      spentTotal += amt;
      if (t.category_id) spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + amt;
    });
    setBudgets((budData || []).map(b => ({
      ...b,
      amount: Number(b.amount),
      spent: b.category_id ? (spentByCat[b.category_id] || 0) : spentTotal,
    })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("finance-data-changed", handler);
    return () => window.removeEventListener("finance-data-changed", handler);
  }, [fetch]);

  // upsert sur (user_id, category_id) — category_id null = budget global
  const upsertBudget = async ({ category_id = null, amount }) => {
    const { error } = await supabase.from("finance_budgets")
      .upsert({ user_id: userId, category_id, amount }, { onConflict: "user_id,category_id" });
    if (error) { console.error("upsertBudget error:", error); return null; }
    await fetch();
  };

  const deleteBudget = async (id) => {
    await supabase.from("finance_budgets").delete().eq("id", id);
    setBudgets(b => b.filter(x => x.id !== id));
  };

  return { budgets, loading, upsertBudget, deleteBudget, refetch: fetch };
}
