import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Remboursements : créances (dir='in', on me doit) & dettes (dir='out', je dois).
// Régler une dette crée optionnellement une transaction sur un compte.
export function useFinanceDebts(userId) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("finance_debts").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (error) { console.error("fetch debts error:", error); setLoading(false); return; }
    setDebts((data || []).map(d => ({ ...d, amount: Number(d.amount) })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  // Crée une dette. Si accountId fourni, impacte aussi un compte (transaction immédiate).
  // À la CRÉATION le mouvement est l'inverse du règlement : une créance (dir='in',
  // je viens de prêter) fait SORTIR l'argent (dépense) ; une dette (dir='out',
  // je viens de recevoir) le fait ENTRER (revenu).
  const createDebt = async (d, accountId = null) => {
    const { data, error } = await supabase.from("finance_debts").insert({
      user_id: userId, person: d.person, description: d.description || null,
      amount: d.amount, dir: d.dir, due_date: d.due_date || null, status: "pending",
    }).select().single();
    if (error) { console.error("createDebt error:", error); return null; }
    if (accountId) {
      const isIn = d.dir === "in";
      const { error: txError } = await supabase.from("finance_transactions").insert({
        user_id: userId, account_id: accountId, type: isIn ? "depense" : "revenu",
        amount: d.amount, date: new Date().toISOString().slice(0, 10),
        note: isIn ? `Prêt → ${d.person}` : `Emprunt ← ${d.person}`, source: "manuel",
      });
      if (txError) console.error("createDebt tx error:", txError);
    }
    await fetch(); emitChange();
    return data;
  };

  const updateDebt = async (id, patch) => {
    const { error } = await supabase.from("finance_debts").update(patch).eq("id", id);
    if (error) { console.error("updateDebt error:", error); return; }
    await fetch();
  };

  // Règle une dette : statut settled + transaction de règlement optionnelle.
  // Au RÈGLEMENT : une créance réglée fait rentrer l'argent (revenu),
  // une dette réglée le fait sortir (dépense).
  const settleDebt = async (debt, { accountId = null, date }) => {
    if (accountId) {
      const isIn = debt.dir === "in";
      const { error: txError } = await supabase.from("finance_transactions").insert({
        user_id: userId, account_id: accountId, type: isIn ? "revenu" : "depense",
        amount: debt.amount, date, note: `Règlement ${debt.person}`, source: "manuel",
      });
      if (txError) { console.error("settleDebt tx error:", txError); return; }
    }
    await supabase.from("finance_debts").update({ status: "settled", settled_date: date }).eq("id", debt.id);
    await fetch(); emitChange();
  };

  const deleteDebt = async (id) => {
    await supabase.from("finance_debts").delete().eq("id", id);
    setDebts(d => d.filter(x => x.id !== id));
  };

  return { debts, loading, createDebt, updateDebt, settleDebt, deleteDebt, refetch: fetch };
}
