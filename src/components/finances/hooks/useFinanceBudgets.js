import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { monthBounds, monthKey } from "../../../utils/date";

// Budgets PAR MOIS (year + month 1-12) + dépensé du mois (calcul client).
// ym = 'YYYY-MM' ; défaut = mois courant.
export function useFinanceBudgets(userId, ym = monthKey()) {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [y, m] = ym.split("-").map(Number);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const [first, last] = monthBounds(ym);
    const [{ data: budData }, { data: txData }] = await Promise.all([
      supabase.from("finance_budgets").select("*")
        .eq("user_id", userId).eq("year", y).eq("month", m),
      supabase.from("finance_transactions").select("amount, category_id")
        .eq("user_id", userId).eq("type", "depense").gte("date", first).lte("date", last),
    ]);
    const spentByCat = {};
    (txData || []).forEach(t => {
      if (t.category_id) spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + Number(t.amount);
    });
    setBudgets((budData || []).map(b => ({
      ...b, amount: Number(b.amount), spent: spentByCat[b.category_id] || 0,
    })));
    setLoading(false);
  }, [userId, ym, y, m]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const handler = () => fetch();
    window.addEventListener("finance-data-changed", handler);
    return () => window.removeEventListener("finance-data-changed", handler);
  }, [fetch]);

  // upsert sur (user_id, category_id, year, month)
  const upsertBudget = async ({ category_id, amount }) => {
    const { error } = await supabase.from("finance_budgets")
      .upsert({ user_id: userId, category_id, amount, year: y, month: m },
        { onConflict: "user_id,category_id,year,month" });
    if (error) { console.error("upsertBudget error:", error); return null; }
    await fetch();
  };

  const deleteBudget = async (id) => {
    await supabase.from("finance_budgets").delete().eq("id", id);
    setBudgets(b => b.filter(x => x.id !== id));
  };

  return { budgets, loading, upsertBudget, deleteBudget, refetch: fetch };
}
