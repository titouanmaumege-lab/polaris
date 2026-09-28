import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../supabase";
import { setFinanceError } from "./financeError";
import { pad, todayStr, monthKey, monthBounds } from "../../../utils/date";
import { advanceOccurrence } from "../../../utils/recurrence";

const emitChange = () => window.dispatchEvent(new Event("finance-data-changed"));

// Calcul d'échéance partagé avec la fonction serveur (détection des récurrences).
export { advanceOccurrence };

// Coût ramené au mois (utilisé pour le total Abonnements).
export function monthlyCostOf(r) {
  const iv = Math.max(1, r.interval || 1);
  const base = r.freq === "mois" ? 1 : r.freq === "annee" ? 1 / 12 : r.freq === "semaine" ? 52 / 12 : 365 / 12;
  return (Number(r.amount) * base) / iv;
}

// « semaine » est féminin et « mois » invariable : une seule table de libellés
// évite les « Tous les semaines » et « Tous les moiss » de la version précédente.
const FREQ_LABEL = {
  jour:    { one: "Tous les jours",      many: n => `Tous les ${n} jours` },
  semaine: { one: "Toutes les semaines", many: n => `Toutes les ${n} semaines` },
  mois:    { one: "Tous les mois",       many: n => `Tous les ${n} mois` },
  annee:   { one: "Tous les ans",        many: n => `Tous les ${n} ans` },
};
export function recurrenceLabel(r) {
  const iv = Math.max(1, r.interval || 1);
  const f = FREQ_LABEL[r.freq] || FREQ_LABEL.mois;
  return iv === 1 ? f.one : f.many(iv);
}

export function useFinanceRecurring(userId) {
  const [recurring, setRecurring] = useState([]);
  const [paidByRecurring, setPaidByRecurring] = useState({}); // recId -> txId (passé ce mois)
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!userId) return;
    const [first, last] = monthBounds();
    const [{ data }, { data: txs }] = await Promise.all([
      supabase.from("finance_recurring").select("*").eq("user_id", userId).order("next_occurrence"),
      supabase.from("finance_transactions").select("id, recurring_id")
        .eq("user_id", userId).not("recurring_id", "is", null).gte("date", first).lte("date", last),
    ]);
    const paid = {};
    (txs || []).forEach(t => { if (t.recurring_id) paid[t.recurring_id] = t.id; });
    setPaidByRecurring(paid);
    setRecurring((data || []).map(r => ({ ...r, amount: Number(r.amount), monthly_cost: monthlyCostOf(r) })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const h = () => fetch();
    window.addEventListener("finance-data-changed", h);
    return () => window.removeEventListener("finance-data-changed", h);
  }, [fetch]);

  const createRecurring = async (r) => {
    const { data, error } = await supabase.from("finance_recurring").insert({
      user_id: userId, label: r.label, type: r.type, amount: r.amount,
      account_id: r.account_id, transfer_account_id: r.type === "transfert" ? (r.transfer_account_id ?? null) : null,
      category_id: r.category_id ?? null,
      is_subscription: r.is_subscription ?? false,
      freq: r.freq, interval: r.interval ?? 1,
      day_of_month: r.day_of_month ?? null, weekday: r.weekday ?? null, month_of_year: r.month_of_year ?? null,
      next_occurrence: r.next_occurrence, active: r.active ?? true,
      match_key: r.match_key || null,
      revenu_kind: r.type === "revenu" ? (r.revenu_kind || null) : null,
      employer_id: r.type === "revenu" && r.revenu_kind === "salaire" ? (r.employer_id || null) : null,
      aide_type_id: r.type === "revenu" && r.revenu_kind === "aides_sociales" ? (r.aide_type_id || null) : null,
    }).select().single();
    if (error) { setFinanceError("createRecurring error:", error); return null;  }
    await fetch();
    return data;
  };

  const updateRecurring = async (id, patch) => {
    const { error } = await supabase.from("finance_recurring").update(patch).eq("id", id);
    if (error) { setFinanceError("updateRecurring error:", error); return;  }
    await fetch();
  };

  const toggleActive = async (rec) => updateRecurring(rec.id, { active: !rec.active });

  const deleteRecurring = async (id) => {
    await supabase.from("finance_recurring").delete().eq("id", id);
    setRecurring(r => r.filter(x => x.id !== id));
  };

  // Génération idempotente : crée les transactions manquantes pour chaque récurrent échu,
  // puis avance next_occurrence. À appeler à l'ouverture du module.
  const runRecurringCatchup = useCallback(async () => {
    if (!userId) return;
    const today = todayStr();
    // Les abonnements (is_subscription) sont validés MANUELLEMENT depuis l'Aperçu — exclus de l'auto.
    const { data: recs } = await supabase.from("finance_recurring").select("*")
      .eq("user_id", userId).eq("active", true).eq("is_subscription", false).lte("next_occurrence", today)
      // Récurrence liée à une opération bancaire : c'est la synchro qui apporte
      // chaque échéance. La générer ici la compterait deux fois.
      .is("match_key", null);
    if (!recs || recs.length === 0) return;

    let changed = false;
    for (const rec of recs) {
      const { data: existing } = await supabase.from("finance_transactions")
        .select("date").eq("recurring_id", rec.id);
      const dates = new Set((existing || []).map(e => e.date));
      const inserts = [];
      let nextOcc = rec.next_occurrence;
      let guard = 0;
      while (nextOcc <= today && guard < 500) {
        if (!dates.has(nextOcc)) {
          inserts.push({
            user_id: userId, account_id: rec.account_id,
            transfer_account_id: rec.type === "transfert" ? rec.transfer_account_id : null,
            category_id: rec.category_id,
            type: rec.type, amount: rec.amount, date: nextOcc,
            note: rec.label, source: "recurrent", recurring_id: rec.id,
            // Un revenu récurrent transmet sa nature, sinon il arriverait
            // « non classé » dans le bilan à chaque échéance.
            revenu_kind: rec.type === "revenu" ? (rec.revenu_kind || null) : null,
            employer_id: rec.type === "revenu" && rec.revenu_kind === "salaire" ? (rec.employer_id || null) : null,
            aide_type_id: rec.type === "revenu" && rec.revenu_kind === "aides_sociales" ? (rec.aide_type_id || null) : null,
          });
          dates.add(nextOcc);
        }
        nextOcc = advanceOccurrence(rec, nextOcc);
        guard++;
      }
      if (inserts.length) { await supabase.from("finance_transactions").insert(inserts); changed = true; }
      if (nextOcc !== rec.next_occurrence) { await supabase.from("finance_recurring").update({ next_occurrence: nextOcc }).eq("id", rec.id); changed = true; }
    }
    if (changed) { await fetch(); emitChange(); }
  }, [userId, fetch]);

  // Validation manuelle d'un abonnement pour le mois courant : crée/supprime la transaction.
  const toggleSubscriptionPaid = async (rec) => {
    const existingTxId = paidByRecurring[rec.id];
    if (existingTxId) {
      await supabase.from("finance_transactions").delete().eq("id", existingTxId);
      await fetch(); emitChange();
      return false;
    }
    const [, last] = monthBounds();
    const ym = monthKey();
    const day = rec.day_of_month ? Math.min(rec.day_of_month, Number(last.split("-")[2])) : new Date().getDate();
    const date = `${ym}-${pad(day)}`;
    const { error } = await supabase.from("finance_transactions").insert({
      user_id: userId, account_id: rec.account_id,
      transfer_account_id: rec.type === "transfert" ? rec.transfer_account_id : null,
      category_id: rec.category_id,
      type: rec.type, amount: rec.amount, date, note: rec.label, source: "recurrent", recurring_id: rec.id,
    });
    if (error) { setFinanceError("toggleSubscriptionPaid insert error:", error); return null;  }
    await fetch(); emitChange();
    return true;
  };

  return { recurring, paidByRecurring, loading, createRecurring, updateRecurring, toggleActive, deleteRecurring, toggleSubscriptionPaid, runRecurringCatchup, refetch: fetch };
}
