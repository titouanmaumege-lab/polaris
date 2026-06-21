import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));
const pad = n => String(n).padStart(2, "0");
// Date de prélèvement pour le mois courant ('YYYY-MM') selon billing_day (sinon aujourd'hui).
const billingDate = (ym, billingDay) => {
  const today = new Date().toISOString().split("T")[0];
  if (!billingDay) return today;
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(billingDay, lastDay))}`;
};

// Abonnements récurrents liés à un compte. Total mensuel = somme des abonnements actifs.
export function useFinanceSubscriptions(userId) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("finance_subscriptions").select("*")
      .eq("user_id", userId).order("amount", { ascending: false });
    setSubscriptions((data || []).map(s => ({ ...s, amount: Number(s.amount) })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createSubscription = async (sub) => {
    const { data, error } = await supabase.from("finance_subscriptions").insert({
      user_id: userId,
      name: sub.name,
      amount: sub.amount,
      account_id: sub.account_id ?? null,
      category_id: sub.category_id ?? null,
      billing_day: sub.billing_day ?? null,
      active: sub.active ?? true,
      color: sub.color ?? null,
      icon: sub.icon ?? null,
    }).select().single();
    if (error) { console.error("createSubscription error:", error); return null; }
    if (data) setSubscriptions(s => [...s, { ...data, amount: Number(data.amount) }]);
    return data;
  };

  const updateSubscription = async (id, patch) => {
    const { data, error } = await supabase.from("finance_subscriptions").update(patch).eq("id", id).select().single();
    if (error) { console.error("updateSubscription error:", error); return null; }
    if (data) setSubscriptions(s => s.map(x => x.id === id ? { ...data, amount: Number(data.amount) } : x));
    return data;
  };

  const deleteSubscription = async (id) => {
    await supabase.from("finance_subscriptions").delete().eq("id", id);
    setSubscriptions(s => s.filter(x => x.id !== id));
  };

  // Valide / dévalide un abonnement pour le mois `ym` ('YYYY-MM').
  // Valider = créer une transaction dépense sur le compte lié (déduit le solde).
  // Dévalider = supprimer cette transaction. Reset auto chaque mois (comparaison à ym).
  const toggleValidation = async (sub, ym) => {
    if (!sub.account_id) { console.warn("Abonnement sans compte lié — validation impossible"); return; }
    const isValid = sub.last_paid_month === ym;

    if (isValid) {
      if (sub.last_payment_tx_id) {
        await supabase.from("finance_transactions").delete().eq("id", sub.last_payment_tx_id);
      }
      await updateSubscription(sub.id, { last_paid_month: null, last_payment_tx_id: null });
      emitChange();
      return false;
    }

    const { data: tx, error } = await supabase.from("finance_transactions").insert({
      user_id: userId,
      account_id: sub.account_id,
      category_id: sub.category_id ?? null,
      type: "depense",
      amount: sub.amount,
      date: billingDate(ym, sub.billing_day),
      note: `Abonnement · ${sub.name}`,
      source: "abonnement",
    }).select().single();
    if (error) { console.error("toggleValidation insert error:", error); return null; }

    await updateSubscription(sub.id, { last_paid_month: ym, last_payment_tx_id: tx.id });
    emitChange();
    return true;
  };

  const monthlyTotal = subscriptions.filter(s => s.active).reduce((sum, s) => sum + s.amount, 0);

  return { subscriptions, monthlyTotal, loading, createSubscription, updateSubscription, deleteSubscription, toggleValidation, refetch: fetch };
}
