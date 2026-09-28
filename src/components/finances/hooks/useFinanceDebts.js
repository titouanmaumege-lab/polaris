import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { setFinanceError } from "./financeError";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Remboursements : créances (dir='in', on me doit) & dettes (dir='out', je dois).
// Purement visuel : un remboursement ne crée JAMAIS d'opération sur un compte.
// L'argent qui bouge réellement arrive déjà par la synchro bancaire (ou une
// saisie), le recréer ici le compterait deux fois.
export function useFinanceDebts(userId) {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("finance_debts").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false });
    if (error) { setFinanceError("fetch debts error:", error); setLoading(false); return;  }
    setDebts((data || []).map(d => ({ ...d, amount: Number(d.amount) })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  const createDebt = async (d) => {
    const { data, error } = await supabase.from("finance_debts").insert({
      user_id: userId, person: d.person, description: d.description || null,
      amount: d.amount, dir: d.dir, due_date: d.due_date || null, status: "pending",
    }).select().single();
    if (error) { setFinanceError("createDebt error:", error); return null;  }
    await fetch();
    return data;
  };

  const updateDebt = async (id, patch) => {
    const { error } = await supabase.from("finance_debts").update(patch).eq("id", id);
    if (error) { setFinanceError("updateDebt error:", error); return;  }
    await fetch();
  };

  // Règle une dette : change seulement son statut.
  const settleDebt = async (debt, { date }) => {
    const { error } = await supabase.from("finance_debts").update({ status: "settled", settled_date: date }).eq("id", debt.id);
    if (error) { setFinanceError("settleDebt error:", error); return; }
    await fetch();
  };

  const deleteDebt = async (id) => {
    await supabase.from("finance_debts").delete().eq("id", id);
    setDebts(d => d.filter(x => x.id !== id));
  };

  return { debts, loading, createDebt, updateDebt, settleDebt, deleteDebt, refetch: fetch };
}
