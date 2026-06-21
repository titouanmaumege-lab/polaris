import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Objectifs d'épargne. Si account_id défini, current_amount peut suivre le solde du compte
// (hydraté côté UI via la map des soldes), sinon current_amount manuel (contributions).
export function useFinanceGoals(userId) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("finance_goals").select("*")
      .eq("user_id", userId).eq("archived", false).order("sort_order");
    setGoals((data || []).map(g => ({
      ...g,
      target_amount: Number(g.target_amount),
      current_amount: Number(g.current_amount),
      progress: Number(g.target_amount) > 0 ? Number(g.current_amount) / Number(g.target_amount) : 0,
    })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  const createGoal = async (g) => {
    const { data, error } = await supabase.from("finance_goals").insert({
      user_id: userId, name: g.name, target_amount: g.target_amount,
      current_amount: g.current_amount ?? 0, account_id: g.account_id ?? null,
      deadline: g.deadline ?? null, color: g.color ?? null, icon: g.icon ?? null,
      sort_order: goals.length,
    }).select().single();
    if (error) { console.error("createGoal error:", error); return null; }
    await fetch();
    return data;
  };

  const updateGoal = async (id, patch) => {
    const { error } = await supabase.from("finance_goals").update(patch).eq("id", id);
    if (error) { console.error("updateGoal error:", error); return; }
    await fetch();
  };

  const contribute = async (goal, amount) => {
    const next = Number(goal.current_amount) + Number(amount);
    await updateGoal(goal.id, { current_amount: Math.max(0, next) });
    emitChange();
  };

  const archiveGoal = async (id) => {
    await supabase.from("finance_goals").update({ archived: true }).eq("id", id);
    setGoals(g => g.filter(x => x.id !== id));
  };

  return { goals, loading, createGoal, updateGoal, contribute, archiveGoal, refetch: fetch };
}
