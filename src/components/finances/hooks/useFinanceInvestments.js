import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

// Positions d'investissement tenues manuellement (prix actuel mis à jour à la main).
export function useFinanceInvestments(userId) {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("finance_investments").select("*")
      .eq("user_id", userId).eq("archived", false).order("created_at");
    setInvestments((data || []).map(i => {
      const quantity = Number(i.quantity), avg = Number(i.avg_buy_price), cur = Number(i.current_price);
      const invested = quantity * avg;
      const market_value = quantity * cur;
      const pnl = market_value - invested;
      return { ...i, quantity, avg_buy_price: avg, current_price: cur, invested, market_value, pnl, pnl_pct: invested > 0 ? pnl / invested : 0 };
    }));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  const createInvestment = async (inv) => {
    const { data, error } = await supabase.from("finance_investments").insert({
      user_id: userId, account_id: inv.account_id ?? null, label: inv.label,
      ticker: inv.ticker ?? null,
      quantity: inv.quantity ?? 0, avg_buy_price: inv.avg_buy_price ?? 0,
      current_price: inv.current_price ?? 0, currency: inv.currency ?? "EUR",
    }).select().single();
    if (error) { console.error("createInvestment error:", error); return null; }
    await fetch();
    return data;
  };

  const updateInvestment = async (id, patch) => {
    const { error } = await supabase.from("finance_investments").update(patch).eq("id", id);
    if (error) { console.error("updateInvestment error:", error); return; }
    await fetch();
  };

  const archiveInvestment = async (id) => {
    await supabase.from("finance_investments").update({ archived: true }).eq("id", id);
    setInvestments(i => i.filter(x => x.id !== id));
  };

  const totalMarketValue = investments.reduce((s, i) => s + i.market_value, 0);
  const totalInvested = investments.reduce((s, i) => s + i.invested, 0);
  const totalPnl = totalMarketValue - totalInvested;
  // Valeur de marché par compte d'investissement
  const marketValueByAccount = {};
  investments.forEach(i => { if (i.account_id) marketValueByAccount[i.account_id] = (marketValueByAccount[i.account_id] || 0) + i.market_value; });

  return { investments, totalMarketValue, totalInvested, totalPnl, marketValueByAccount, loading, createInvestment, updateInvestment, archiveInvestment, refetch: fetch };
}
