import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Mouvements d'investissement (achats/ventes). createMove applique le PRU + la quantité
// sur la position et crée, si un compte cash est fourni, la transaction liée.
export function useFinanceInvestmentMoves(userId, investmentId = null) {
  const [moves, setMoves] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    let q = supabase.from("finance_investment_moves").select("*")
      .eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false });
    if (investmentId) q = q.eq("investment_id", investmentId);
    const { data } = await q;
    setMoves((data || []).map(m => ({ ...m, quantity: Number(m.quantity), price: Number(m.price) })));
    setLoading(false);
  }, [userId, investmentId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  // investment = position courante { id, quantity, avg_buy_price, label }
  const createMove = async (investment, m) => {
    const q = Number(m.quantity), price = Number(m.price);
    const curQty = Number(investment.quantity), curAvg = Number(investment.avg_buy_price);

    let newQty, newAvg;
    if (m.kind === "achat") {
      newQty = curQty + q;
      newAvg = newQty > 0 ? (curQty * curAvg + q * price) / newQty : 0;
    } else {
      newQty = Math.max(0, curQty - q);
      newAvg = curAvg; // PRU inchangé à la vente
    }

    const { data: move, error } = await supabase.from("finance_investment_moves").insert({
      user_id: userId, investment_id: investment.id, kind: m.kind,
      quantity: q, price, date: m.date, cash_account_id: m.cash_account_id ?? null, note: m.note?.trim() || null,
    }).select().single();
    if (error) { console.error("createMove error:", error); return null; }

    await supabase.from("finance_investments").update({ quantity: newQty, avg_buy_price: newAvg }).eq("id", investment.id);

    // Transaction cash liée (optionnelle) : achat => dépense, vente => revenu
    if (m.cash_account_id) {
      await supabase.from("finance_transactions").insert({
        user_id: userId, account_id: m.cash_account_id, type: m.kind === "achat" ? "depense" : "revenu",
        amount: q * price, date: m.date, note: `${m.kind === "achat" ? "Achat" : "Vente"} · ${investment.label}`, source: "invest",
      });
    }

    await fetch(); emitChange();
    return move;
  };

  const deleteMove = async (id) => {
    await supabase.from("finance_investment_moves").delete().eq("id", id);
    setMoves(m => m.filter(x => x.id !== id));
    emitChange();
  };

  return { moves, loading, createMove, deleteMove, refetch: fetch };
}
