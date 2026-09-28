import { useState, useMemo, useEffect } from "react";
import { useFinanceAccounts } from "./hooks/useFinanceAccounts";
import { useFinanceEmployers } from "./hooks/useFinanceEmployers";
import { onFinanceError, getFinanceError, clearFinanceError, isSchemaError, financeErrorText } from "./hooks/financeError";
import { useFinanceCategories } from "./hooks/useFinanceCategories";
import { useFinanceTransactions } from "./hooks/useFinanceTransactions";
import { useFinanceBudgets } from "./hooks/useFinanceBudgets";
import { useFinanceGoals } from "./hooks/useFinanceGoals";
import { useFinanceInvestments } from "./hooks/useFinanceInvestments";
import { useFinanceDebts } from "./hooks/useFinanceDebts";
import { useFinanceRecurring, advanceOccurrence, recurrenceLabel } from "./hooks/useFinanceRecurring";
import { supabase } from "../../supabase";
import { matchKeyOf, recKeys, nextAfter } from "../../utils/recurrence";
import { todayStr, monthKey } from "../../utils/date";
import BankPanel, { BANK_CALLBACK_PATH, autoSyncBanks } from "./BankPanel";
import { C, GRAD } from "../../ui/tokens";

// DA partagée avec le reste de l'app : tokens `C` + thème `.theme-light`
// (fond #0b0714 + halo violet/magenta, police Space Grotesk) — voir src/index.css.
// Les chiffres utilisent la police display, comme les autres écrans.
const MONO = "var(--font-display)";
const SHADOW_CARD = "0 2px 16px rgba(0,0,0,0.40)";

const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const fmtEUR = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtN = (n, d = 2) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const parseAmount = (s) => { const n = parseFloat(String(s).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : Math.round(n * 100) / 100; };
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTH_FR[m - 1]} ${y}`; };
const shiftMonth = (ym, delta) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return monthKey(d); };

const COLORS = ["#8b5cf6","#6366f1","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#818cf8","#ec4899","#94a3b8","#a3e635"];
const ESETS = {
  Argent:["💰","💵","💳","🏦","💸","📈","📉","📊","🪙","💎"],
  Objectifs:["🎯","🏆","🎁","🎉","🚀","⭐","🌟","✨","🔥","💪"],
  Voyage:["✈️","🏖️","⛰️","🌍","🗺️","🏕️","🚢","🏨","🌅","⛺"],
  Maison:["🏠","🏡","🔑","🛋️","🛁","🪴","🛏️","🚿"],
  Transport:["🚗","🚙","🏎️","🛵","🚲","🚌","🚆","⛽"],
  Conso:["🛒","🍽️","🍕","☕","👕","💊","📱","🎮"],
};
const ALL_E = Object.values(ESETS).flat();

// Nature d'un revenu. Volontairement figée en dur : c'est la clé du dashboard,
// contrairement aux catégories que l'utilisateur peut renommer.
const REVENU_KINDS = [
  ["salaire",          "Salaire",          "💼"],
  ["aides_sociales",   "Aides sociales",   "🏛"],
  ["aides_familiales", "Aides familiales", "👨‍👩‍👧"],
  ["entreprise",       "Entreprise",       "🏢"],
  ["autre",            "Autre",            "•"],
];
const REVENU_KIND_LABEL = Object.fromEntries(REVENU_KINDS.map(([v, l]) => [v, l]));

const UIFREQ = [["monthly","Mensuelle"],["weekly","Hebdomadaire"],["nweeks","Toutes les N semaines"],["quarterly","Trimestrielle"],["yearly","Annuelle"]];
// `weeks` ne sert que pour "nweeks" (toutes les N semaines). Le reste du
// modèle gérait déjà n'importe quel interval : seule l'UI le verrouillait à 1.
const toFreq = (ui, weeks = 2) =>
  ui==="weekly"    ? {freq:"semaine",interval:1} :
  ui==="nweeks"    ? {freq:"semaine",interval:Math.min(52,Math.max(1,parseInt(weeks,10)||1))} :
  ui==="quarterly" ? {freq:"mois",interval:3} :
  ui==="yearly"    ? {freq:"annee",interval:1} :
                     {freq:"mois",interval:1};
const fromFreq = (r) =>
  r.freq==="semaine" ? ((r.interval ?? 1) > 1 ? "nweeks" : "weekly") :
  r.freq==="annee"   ? "yearly" :
  (r.freq==="mois" && r.interval===3) ? "quarterly" : "monthly";

// ─── Donut SVG ────────────────────────────────────────────────────────────────
function Donut({ data, total, size = 160 }) {
  if (!total || !data.length)
    return <div style={{ color: C.faint, fontSize: 12, padding: "56px 0", textAlign: "center" }}>Aucune dépense</div>;
  const r = 54, cx = size/2, cy = size/2, CIRC = 2*Math.PI*r;
  let acc = 0;
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface3} strokeWidth="20" />
      {data.map((d, i) => {
        const len = (d.value/total)*CIRC, off = CIRC-acc; acc += len;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="20"
          strokeDasharray={`${len.toFixed(2)} ${(CIRC-len).toFixed(2)}`} strokeDashoffset={off.toFixed(2)}
          style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px`, transition: "stroke-dasharray .5s" }} />;
      })}
    </svg>
  );
}

// ─── Primitives DA ────────────────────────────────────────────────────────────
const cardSt = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 22, boxShadow: SHADOW_CARD };
const statSt = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: SHADOW_CARD };
const titleSt = { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 16 };

function Btn({ children, onClick, kind = "p", small, style }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, borderRadius: small ? 9 : 11, padding: small ? "8px 16px" : "13px", fontSize: small ? 13 : 14, transition: "all .15s" };
  const kinds = {
    p: { background: GRAD, color: "#fff" },
    g: { background: C.surface2, color: C.muted, border: `1px solid ${C.border}` },
  };
  return <button onClick={onClick} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</label>
      {children}
    </div>
  );
}
const inputSt = { width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 14px", color: C.text, fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };
function TextIn(props) { return <input {...props} style={{ ...inputSt, ...(props.type === "number" ? { fontFamily: MONO } : {}), ...props.style }} />; }
function SelectIn({ value, onChange, children, style }) {
  return <select value={value} onChange={onChange} style={{ ...inputSt, ...style }}>{children}</select>;
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.borderMid}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: wide ? 540 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: C.text }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function TypeToggle({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {options.map(o => {
        const on = value === o.v;
        const col = o.c;
        return <button key={o.v} onClick={() => onChange(o.v)} style={{ flex: 1, padding: 10, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: on ? `${col}22` : C.surface2, border: `1px solid ${on ? col : C.border}`, color: on ? col : C.muted }}>{o.label}</button>;
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function FinancesModule({ userId }) {
  // Retour de la banque après consentement : on atterrit directement sur Banques.
  const [section, setSection] = useState(() => window.location.pathname === BANK_CALLBACK_PATH ? "banks" : "dash");
  const [ym, setYm] = useState(monthKey());
  const [toast, setToast] = useState("");
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };
  // Une écriture qui échoue doit se voir : avant, l'UI disait « Modifié » quand
  // Supabase avait refusé l'écriture.
  const [dbError, setDbError] = useState(getFinanceError());
  useEffect(() => onFinanceError(setDbError), []);
  // Renvoie true si l'opération a réussi, sinon affiche la vraie raison.
  const ok = (result) => {
    const e = getFinanceError();
    if (result === null || result === false || result === undefined) {
      if (e) { showToast(financeErrorText(e)); return false; }
    }
    return true;
  };

  const acc = useFinanceAccounts(userId);
  const emp = useFinanceEmployers(userId);
  const cat = useFinanceCategories(userId);
  const tx = useFinanceTransactions(userId);
  const bud = useFinanceBudgets(userId, ym);
  const goal = useFinanceGoals(userId);
  const inv = useFinanceInvestments(userId);
  const debt = useFinanceDebts(userId);
  const rec = useFinanceRecurring(userId);

  useEffect(() => { rec.runRecurringCatchup?.(); }, [rec.runRecurringCatchup]);
  // Pas au retour de la banque : BankPanel y lance déjà sa propre synchro.
  useEffect(() => { if (window.location.pathname !== BANK_CALLBACK_PATH) autoSyncBanks(userId); }, [userId]);

  const getCat = (id) => cat.categories.find(c => c.id === id) || { name: "—", icon: "📦", color: C.muted };
  const getAcc = (id) => acc.accounts.find(a => a.id === id);
  const expCats  = cat.categories.filter(c => c.kind === "depense");
  const incCats  = cat.categories.filter(c => c.kind === "revenu");
  const aideCats = cat.categories.filter(c => c.kind === "aide");
  const trfCats  = cat.categories.filter(c => c.kind === "transfert");
  // Classée en transfert (intercompte) : ni revenu ni dépense du mois.
  const trfIds = useMemo(() => new Set(trfCats.map(c => c.id)), [trfCats.map(c => c.id).join()]);
  const isTrf = t => t.type === "transfert" || trfIds.has(t.category_id);
  const liquidAcc = acc.accounts.filter(a => (a.nature || "liquidite") === "liquidite");
  const investAcc = acc.accounts.filter(a => a.nature === "investissement");
  const proAcc = acc.accounts.filter(a => a.nature === "pro");
  const proIds = useMemo(() => new Set(proAcc.map(a => a.id)), [proAcc.map(a => a.id).join()]);
  const liquidTotal = liquidAcc.reduce((s, a) => s + (a.balance ?? 0), 0);
  const investTotal = investAcc.reduce((s, a) => s + (a.balance ?? 0), 0);
  const proTotal = proAcc.reduce((s, a) => s + (a.balance ?? 0), 0);

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const [yNum, mNum] = ym.split("-").map(Number);
  const monthTx = useMemo(() =>
    tx.transactions.filter(t => { const d = new Date(t.date); return d.getFullYear() === yNum && d.getMonth() + 1 === mNum; }),
    [tx.transactions, yNum, mNum]);
  const income = monthTx.filter(t => t.type === "revenu" && !isTrf(t)).reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === "depense" && !isTrf(t)).reduce((s, t) => s + t.amount, 0);
  const pocketsTotal = goal.goals.reduce((s, g) => s + g.current_amount, 0);
  // Le compte pro appartient à l'entreprise, pas à l'utilisateur : hors patrimoine.
  const netWorth = acc.totalBalance - proTotal + pocketsTotal + inv.totalMarketValue;

  // Revenus par nature — base du bloc « Revenus » du bilan.
  // Les transactions antérieures à la migration 010 ont revenu_kind = null :
  // elles sont comptées à part et signalées, jamais silencieusement ignorées.
  const revStats = useMemo(() => {
    const inYear = t => new Date(t.date).getFullYear() === yNum;
    const inMonth = t => { const d = new Date(t.date); return d.getFullYear() === yNum && d.getMonth() + 1 === mNum; };
    const revenus = tx.transactions.filter(t => t.type === "revenu" && !trfIds.has(t.category_id));
    const sum = a => a.reduce((s, t) => s + t.amount, 0);
    // Tout revenu encaissé sur un compte pro est du CA, quelle que soit sa nature
    // saisie. Un transfert depuis un compte perso n'est pas un revenu : exclu.
    const isCA = t => proIds.has(t.account_id) || t.revenu_kind === "entreprise";
    const of = k => k === "entreprise"
      ? revenus.filter(isCA)
      : revenus.filter(t => t.revenu_kind === k && !proIds.has(t.account_id));

    const kind = {};
    REVENU_KINDS.forEach(([k]) => {
      const all = of(k);
      kind[k] = { month: sum(all.filter(inMonth)), year: sum(all.filter(inYear)) };
    });

    // Salaires détaillés par employeur (+ ligne « non précisé »)
    const sal = of("salaire");
    const byEmp = emp.employers.map(e2 => ({
      id: e2.id, name: e2.name, color: e2.color,
      month: sum(sal.filter(t => t.employer_id === e2.id && inMonth(t))),
      year:  sum(sal.filter(t => t.employer_id === e2.id && inYear(t))),
    }));
    const known = new Set(emp.employers.map(e2 => e2.id));
    const orphan = sal.filter(t => !t.employer_id || !known.has(t.employer_id));
    if (orphan.some(inYear)) byEmp.push({ id: "_none", name: "Non précisé", color: C.muted, month: sum(orphan.filter(inMonth)), year: sum(orphan.filter(inYear)) });

    // CA entreprise mois par mois sur l'année sélectionnée
    const ent = of("entreprise");
    const caMonths = Array.from({ length: 12 }, (_, i) =>
      sum(ent.filter(t => { const d = new Date(t.date); return d.getFullYear() === yNum && d.getMonth() === i; })));

    // Aides sociales ventilées par sous-type créé par l'utilisateur
    const aidesTx = of("aides_sociales");
    const byAide = aideCats.map(c => ({
      id: c.id, name: c.name, icon: c.icon, color: c.color,
      month: sum(aidesTx.filter(t => t.aide_type_id === c.id && inMonth(t))),
      year:  sum(aidesTx.filter(t => t.aide_type_id === c.id && inYear(t))),
    })).filter(x => x.year > 0);
    const knownAide = new Set(aideCats.map(c => c.id));
    const aideOrphan = aidesTx.filter(t => !t.aide_type_id || !knownAide.has(t.aide_type_id));
    if (aideOrphan.some(inYear)) byAide.push({ id: "_none", name: "Non précisé", color: C.muted, month: sum(aideOrphan.filter(inMonth)), year: sum(aideOrphan.filter(inYear)) });

    const unclassified = revenus.filter(t => !t.revenu_kind && !proIds.has(t.account_id) && inYear(t));
    return { kind, byEmp, byAide, caMonths, unclassified: unclassified.length, unclassifiedSum: sum(unclassified) };
  }, [tx.transactions, emp.employers, aideCats, yNum, mNum, proIds, trfIds]);

  const today0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const recDue = rec.recurring.filter(r => r.active && new Date(r.next_occurrence) <= new Date(today0.getTime() + 7 * 864e5));
  const recOverdue = recDue.filter(r => new Date(r.next_occurrence) < today0);
  const debtsPending = debt.debts.filter(d => d.status === "pending");

  // ── Modales (état générique) ────────────────────────────────────────────────
  const [modal, setModal] = useState(null);   // kind string | null
  const [settingsOpen, setSettingsOpen] = useState("dep");
  const [delAcc, setDelAcc] = useState(null); // { account, impact } | null
  const [delConfirm, setDelConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [editing, setEditing] = useState(null); // objet édité | null
  const [f, setF] = useState({});
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const close = () => { setModal(null); setEditing(null); };
  const [emojiTarget, setEmojiTarget] = useState(null);
  const [emojiBack, setEmojiBack] = useState(null);
  // États de filtre/onglet remontés ici : les sous-sections sont re-montées à chaque
  // rendu du parent, ils perdraient leur état local sinon.
  const [txFilter, setTxFilter] = useState("all");
  const [recTab, setRecTab] = useState("upcoming");
  const [debtTab, setDebtTab] = useState("pending");
  // Changement rapide de catégorie (clic sur l'émoji d'une opération)
  const [catPick, setCatPick] = useState(null);   // transaction | null
  // Remise à zéro des opérations
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const setTxCategory = async (t, categoryId) => {
    setCatPick(null);
    if (categoryId === t.category_id) return;
    const r = await tx.updateTransaction(t.id, { ...t, category_id: categoryId });
    if (ok(r)) showToast("Catégorie modifiée");
  };

  // Aucune catégorie de transfert encore : « Intercompte » est créée au vol.
  const setTxIntercompte = async (t) => {
    const c = await cat.createCategory({ name: "Intercompte", kind: "transfert", icon: "⇄", color: "#94a3b8" });
    if (!c) { setCatPick(null); showToast("Exécute d'abord la migration 021 dans Supabase."); return; }
    setTxCategory(t, c.id);
  };

  // Nature d'un revenu depuis la fenêtre rapide (alimente le bloc Revenus du
  // Bilan). Salaire et aides sociales ont un second choix (employeur, type
  // d'aide) : la fenêtre reste ouverte pour le faire. Re-cliquer retire.
  const setTxKind = async (t, kind, sub = {}) => {
    const next = { ...t, revenu_kind: kind, employer_id: null, aide_type_id: null, ...sub };
    const r = await tx.updateTransaction(t.id, next);
    if (!ok(r)) return;
    const needsSub = (kind === "salaire" && !sub.employer_id && emp.employers.length)
                  || (kind === "aides_sociales" && !sub.aide_type_id && aideCats.length);
    if (needsSub) setCatPick(next);
    else { setCatPick(null); showToast(kind ? "Revenu classé" : "Nature retirée"); }
  };

  // Rattacher à la main une opération que la synchro n'a pas reconnue. Son
  // libellé est ajouté aux variantes de la récurrence : la prochaine fois, elle
  // sera reconnue toute seule.
  const linkTxToRec = async (t, r) => {
    // Hérite de la catégorie / nature de la récurrence si elle n'en a pas.
    const txPatch = { recurring_id: r.id };
    if (!t.category_id && r.category_id) txPatch.category_id = r.category_id;
    if (t.type === "revenu" && !t.revenu_kind && r.revenu_kind) Object.assign(txPatch, { revenu_kind: r.revenu_kind, employer_id: r.employer_id || null, aide_type_id: r.aide_type_id || null });
    const { error } = await supabase.from("finance_transactions").update(txPatch).eq("id", t.id);
    if (error) { showToast(`Échec : ${error.message}`); return; }
    const key = matchKeyOf(t.bank_label || t.note);
    const keys = recKeys(r);
    const recPatch = {};
    if (key && !keys.includes(key)) recPatch.match_keys = [...keys, key];
    // Récurrence saisie à la main, liée à une opération de la banque : c'est
    // désormais la synchro qui apporte ses échéances (le rattrapage ne doit
    // plus en générer, sinon doublons).
    if (!r.match_key && t.source === "sync") recPatch.match_key = key || "*";
    // Opération de l'échéance en cours (ou plus tard) : l'échéance avance.
    const soonest = new Date(new Date(r.next_occurrence + "T12:00:00").getTime() - 15 * 864e5).toISOString().slice(0, 10);
    if (t.date >= soonest) recPatch.next_occurrence = nextAfter(r, t);
    if (Object.keys(recPatch).length) {
      const { error: eR } = await supabase.from("finance_recurring").update(recPatch).eq("id", r.id);
      // Migration 020 absente : le rattachement reste fait, seul l'apprentissage manque.
      if (eR && recPatch.match_keys) {
        delete recPatch.match_keys;
        if (Object.keys(recPatch).length) await supabase.from("finance_recurring").update(recPatch).eq("id", r.id);
      }
    }
    setCatPick(null);
    window.dispatchEvent(new Event("finance-data-changed"));
    showToast(recPatch.match_keys ? "Liée · ce libellé sera reconnu la prochaine fois" : "Liée à la récurrence");
  };
  const unlinkTx = async (t) => {
    const { error } = await supabase.from("finance_transactions").update({ recurring_id: null }).eq("id", t.id);
    if (error) { showToast(`Échec : ${error.message}`); return; }
    setCatPick(null);
    window.dispatchEvent(new Event("finance-data-changed"));
    showToast("Détachée de la récurrence");
  };

  const resetOperations = async () => {
    setResetBusy(true);
    const { data, error } = await supabase.rpc("finance_reset_operations");
    setResetBusy(false);
    if (error) {
      showToast(/finance_reset_operations/.test(error.message) ? "Exécute d'abord la migration 017 dans Supabase." : `Échec : ${error.message}`);
      return;
    }
    setResetOpen(false); setResetText("");
    window.dispatchEvent(new Event("finance-data-changed"));
    showToast(`${data ?? 0} opérations supprimées, soldes conservés`);
  };

  // Émoji de catégorie cliquable : ouvre le choix de catégorie.
  // Sans catégorie (typiquement une opération qui vient d'arriver de la banque) :
  // un « ? » rouge pâle, à cliquer pour la classer.
  const TODO_BG = "rgba(248,113,113,0.16)", TODO_FG = "#fca5a5";
  // Ce qu'on affiche pour une opération : sa catégorie ; à défaut, pour un
  // revenu, « CA » s'il arrive sur un compte pro, sinon sa nature ; sinon « ? ».
  const KIND_INFO = Object.fromEntries(REVENU_KINDS.map(([k, l, ic]) => [k, { name: l, icon: ic }]));
  const txDisplay = (t, c) => {
    if (t.category_id) return c;
    if (t.type === "revenu" && proIds.has(t.account_id)) return { icon: "📈", name: "CA", color: C.amber };
    if (t.type === "revenu" && KIND_INFO[t.revenu_kind]) {
      const k = KIND_INFO[t.revenu_kind];
      const who = t.revenu_kind === "salaire" ? emp.employers.find(e2 => e2.id === t.employer_id)?.name
                : t.revenu_kind === "aides_sociales" ? aideCats.find(a2 => a2.id === t.aide_type_id)?.name : null;
      return { icon: k.icon, name: who ? `${k.name} · ${who}` : k.name, color: C.green };
    }
    return null;
  };
  const CatEmoji = ({ t, c: cat0, size = 34, badge }) => {
    const shown = txDisplay(t, cat0);
    const todo = !shown;
    const c = shown || cat0;
    if (badge) return todo
      ? <button onClick={() => setCatPick(t)} title="Choisir la catégorie" style={{ ...badgeSt(TODO_FG), background: TODO_BG, border: "none", cursor: "pointer", fontFamily: "inherit" }}><b>?</b> À classer</button>
      : <button onClick={() => setCatPick(t)} title="Changer" style={{ ...badgeSt(c.color), border: "none", cursor: "pointer", fontFamily: "inherit" }}>{c.icon} {c.name}</button>;
    return (
      <button onClick={() => setCatPick(t)} title={todo ? "Choisir la catégorie" : "Changer la catégorie"}
        aria-label={todo ? "Sans catégorie. Choisir" : `Catégorie : ${c.name}. Changer`}
        style={{ ...txIconSt, width: size, height: size, border: "none", cursor: "pointer",
          background: todo ? TODO_BG : (c.color || C.muted) + "22", color: TODO_FG, fontWeight: 800, fontSize: todo ? 16 : txIconSt.fontSize }}>
        {todo ? "?" : c.icon}
      </button>
    );
  };

  // Renommer une opération en cliquant sur son libellé.
  // Champ NON contrôlé : les vues sont recréées à chaque rendu du parent, un
  // champ contrôlé perdrait le focus à chaque frappe.
  const [renaming, setRenaming] = useState(null);   // id de l'opération | null
  const renameTx = async (t, value) => {
    setRenaming(null);
    const note = value.trim();
    if (note === (t.note || "")) return;
    const r = await tx.updateTransaction(t.id, { ...t, note });
    if (ok(r)) showToast("Opération renommée");
  };
  const RecTag = ({ t }) => {
    if (!t.recurring_id) return null;
    const r = rec.recurring.find(x => x.id === t.recurring_id);
    return <span title={r ? `Récurrence : ${r.label} (${recurrenceLabel(r)})` : "Récurrence"} style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 600, color: C.accent, background: C.accentBg, padding: "2px 7px", borderRadius: 6, verticalAlign: "middle", whiteSpace: "nowrap" }}>↻ Récurrence</span>;
  };
  const TxLabel = ({ t, fallback }) => renaming === t.id
    ? <input autoFocus defaultValue={t.note || ""} placeholder={fallback} aria-label="Nom de l'opération"
        onFocus={e => e.currentTarget.select()}
        onBlur={e => { if (e.currentTarget.dataset.cancel) return; renameTx(t, e.currentTarget.value); }}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { e.currentTarget.dataset.cancel = "1"; setRenaming(null); }
        }}
        style={{ width: "100%", maxWidth: 360, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 7, padding: "5px 8px", color: C.text, fontFamily: "inherit", fontSize: 13, outline: "none" }} />
    : <span onClick={() => setRenaming(t.id)} title="Cliquer pour renommer" style={{ cursor: "text" }}>{t.note || fallback}</span>;

  // ── Ouvertures ──────────────────────────────────────────────────────────────
  const openTx = (t = null) => {
    setEditing(t);
    setF(t
      ? { type: t.type, amount: String(t.amount), note: t.note || "", category_id: t.category_id, account_id: t.account_id, transfer_account_id: t.transfer_account_id || null, date: t.date, revenu_kind: t.revenu_kind || "salaire", employer_id: t.employer_id || null, aide_type_id: t.aide_type_id || null }
      : { type: "depense", amount: "", note: "", category_id: expCats[0]?.id || null, account_id: acc.accounts[0]?.id || null, transfer_account_id: acc.accounts[1]?.id || null, date: todayStr(), revenu_kind: "salaire", employer_id: emp.employers[0]?.id || null, aide_type_id: null });
    setModal("tx");
  };
  const openRec = (r = null) => {
    setEditing(r);
    setF(r
      ? { type: r.type, label: r.label, amount: String(r.amount), category_id: r.category_id, uifreq: fromFreq(r), weeks: String(r.freq === "semaine" ? (r.interval ?? 1) : 2), next: r.next_occurrence, account_id: r.account_id }
      : { type: "depense", label: "", amount: "", category_id: expCats[0]?.id || null, uifreq: "monthly", weeks: "2", next: todayStr(), account_id: acc.accounts[0]?.id || null });
    setModal("rec");
  };
  // Récurrence créée à partir d'une opération réelle : pré-remplie, mensuelle
  // au même jour, et liée à son libellé bancaire pour la détection automatique.
  const openRecFromTx = (t) => {
    const day = Number(t.date.slice(8, 10));
    setEditing(null);
    setF({
      type: t.type === "revenu" ? "revenu" : "depense", label: t.note || t.bank_label || "", amount: String(t.amount),
      category_id: t.category_id, uifreq: "monthly", weeks: "2", account_id: t.account_id,
      next: advanceOccurrence({ freq: "mois", interval: 1, day_of_month: day }, t.date), sourceTx: t,
      revenu_kind: t.revenu_kind || null, employer_id: t.employer_id || null, aide_type_id: t.aide_type_id || null,
    });
    setModal("rec");
  };
  const openDebt = (d = null) => {
    setEditing(d);
    setF(d
      ? { dir: d.dir, person: d.person, description: d.description || "", amount: String(d.amount), due_date: d.due_date || "", account_id: "" }
      : { dir: "in", person: "", description: "", amount: "", due_date: "", account_id: "" });
    setModal("debt");
  };
  const openBudget = (b = null) => { setEditing(b); setF(b ? { category_id: b.category_id, amount: String(b.amount) } : { category_id: expCats[0]?.id || null, amount: "" }); setModal("budget"); };
  const openPocket = (p = null) => {
    setEditing(p);
    setF(p
      ? { emoji: p.icon || "🎯", name: p.name, target: String(p.target_amount), current: String(p.current_amount), deadline: p.deadline || "" }
      : { emoji: "🎯", name: "", target: "", current: "", deadline: "" });
    setModal("pocket");
  };
  const openPocketAct = (p, action) => { setEditing(p); setF({ action, amount: "" }); setModal("pocketAct"); };
  const openPea = (p = null) => {
    setEditing(p);
    setF(p
      ? { label: p.label, ticker: p.ticker || "", qty: String(p.quantity), buy: String(p.avg_buy_price), cur: String(p.current_price) }
      : { label: "", ticker: "", qty: "", buy: "", cur: "" });
    setModal("pea");
  };
  const openAccount = (a = null) => {
    setEditing(a);
    setF(a ? { name: a.name, balance: String(a.balance), nature: a.nature || "liquidite" } : { name: "", balance: "", nature: "liquidite" });
    setModal("account");
  };
  const openSettle = (d) => { setEditing(d); setF({ account_id: "", date: todayStr() }); setModal("settle"); };
  const openCat = (c = null) => { setEditing(c); setF(c ? { kind: c.kind, emoji: c.icon || "📦", name: c.name, color: c.color || COLORS[0] } : { kind: "depense", emoji: "📦", name: "", color: COLORS[0] }); setModal("cat"); };
  const openEmoji = (target) => { setEmojiTarget(target); setEmojiBack(modal); setModal("emoji"); };

  // ── Soumissions ───────────────────────────────────────────────────────────
  const submitTx = async () => {
    const amount = parseAmount(f.amount);
    if (!amount || amount <= 0) return showToast("Montant invalide");
    if (!f.account_id) return showToast("Compte requis");
    if (f.type === "transfert") {
      if (!f.transfer_account_id) return showToast("Compte destination requis");
      if (f.transfer_account_id === f.account_id) return showToast("Comptes identiques");
    }
    const payload = {
      account_id: f.account_id,
      transfer_account_id: f.type === "transfert" ? f.transfer_account_id : null,
      category_id: f.category_id || null,
      type: f.type, amount, date: f.date, note: f.note,
      revenu_kind: f.revenu_kind, employer_id: f.employer_id, aide_type_id: f.aide_type_id,
    };
    clearFinanceError();
    const r = editing ? await tx.updateTransaction(editing.id, payload) : await tx.createTransaction(payload);
    if (!ok(r)) return;
    close(); showToast(editing ? "Modifié" : "Opération ajoutée");
  };
  const submitRec = async () => {
    const amount = parseAmount(f.amount);
    if (!f.label?.trim()) return showToast("Nom requis");
    if (!amount || amount <= 0) return showToast("Montant invalide");
    const { freq, interval } = toFreq(f.uifreq, f.weeks);
    const payload = { label: f.label.trim(), type: f.type, amount, category_id: f.category_id, account_id: f.account_id, freq, interval, next_occurrence: f.next, is_subscription: false };
    const src = !editing && f.sourceTx;
    if (src) {
      // « * » : liée mais libellé trop générique pour être reconnu. Reste non
      // nul pour que le rattrapage ne génère pas d'opération en double.
      payload.match_key = matchKeyOf(src.bank_label || src.note) || "*";
      payload.match_keys = payload.match_key === "*" ? null : [payload.match_key];
      // Un salaire garde sa nature et son employeur sur les échéances suivantes.
      Object.assign(payload, { revenu_kind: f.revenu_kind, employer_id: f.employer_id, aide_type_id: f.aide_type_id });
      if (freq === "mois") payload.day_of_month = Number(src.date.slice(8, 10));
    }
    if (editing) { await rec.updateRecurring(editing.id, payload); close(); showToast("Modifié"); return; }
    const created = await rec.createRecurring(payload);
    if (!ok(created)) return;
    if (src) {
      await supabase.from("finance_transactions").update({ recurring_id: created.id }).eq("id", src.id);
      window.dispatchEvent(new Event("finance-data-changed"));
    }
    close();
    showToast(src && payload.match_key === "*" ? "Récurrence créée, mais libellé trop générique pour la détection automatique" : "Récurrence créée");
  };
  const payRec = async (r) => {
    await tx.createTransaction({
      account_id: r.account_id, transfer_account_id: r.transfer_account_id || null,
      category_id: r.category_id, type: r.type, amount: r.amount, date: todayStr(),
      note: r.label, source: "recurrent", recurring_id: r.id,
    });
    await rec.updateRecurring(r.id, { next_occurrence: advanceOccurrence(r, r.next_occurrence) });
    showToast("Payé · transaction créée");
  };
  const submitDebt = async () => {
    const amount = parseAmount(f.amount);
    if (!f.person?.trim()) return showToast("Personne requise");
    if (!amount || amount <= 0) return showToast("Montant invalide");
    const payload = { person: f.person.trim(), description: f.description, amount, dir: f.dir, due_date: f.due_date };
    if (editing) await debt.updateDebt(editing.id, { person: payload.person, description: payload.description || null, amount, dir: f.dir, due_date: f.due_date || null });
    else await debt.createDebt(payload);
    close(); showToast(editing ? "Modifié" : "Ajouté");
  };
  const confirmSettle = async () => {
    await debt.settleDebt(editing, { date: f.date });
    close(); showToast("Réglé");
  };
  const submitBudget = async () => {
    const amount = parseAmount(f.amount);
    if (!amount || amount <= 0) return showToast("Montant invalide");
    await bud.upsertBudget({ category_id: f.category_id, amount });
    close(); showToast("Budget défini");
  };
  const submitPocket = async () => {
    const target = parseAmount(f.target);
    if (!f.name?.trim()) return showToast("Nom requis");
    if (!target || target <= 0) return showToast("Objectif invalide");
    const payload = { name: f.name.trim(), target_amount: target, current_amount: parseAmount(f.current), deadline: f.deadline || null, icon: f.emoji, color: COLORS[goal.goals.length % COLORS.length] };
    if (editing) await goal.updateGoal(editing.id, { name: payload.name, target_amount: target, current_amount: payload.current_amount, deadline: payload.deadline, icon: f.emoji });
    else await goal.createGoal(payload);
    close(); showToast(editing ? "Modifié" : "Poche créée");
  };
  const submitPocketAct = async () => {
    const amount = parseAmount(f.amount);
    if (!amount || amount <= 0) return showToast("Montant invalide");
    if (f.action === "wit" && amount > editing.current_amount) return showToast("Solde insuffisant");
    await goal.contribute(editing, f.action === "dep" ? amount : -amount);
    close(); showToast(f.action === "dep" ? `+${fmtEUR(amount)}` : "Retrait effectué");
  };
  const submitPea = async () => {
    const qty = parseAmount(f.qty), buy = parseAmount(f.buy);
    const cur = f.cur === "" ? buy : parseAmount(f.cur);
    if (!f.label?.trim()) return showToast("Nom requis");
    if (!qty || qty <= 0) return showToast("Quantité invalide");
    if (!buy || buy <= 0) return showToast("Prix requis");
    if (editing) await inv.updateInvestment(editing.id, { label: f.label.trim(), ticker: f.ticker || null, quantity: qty, avg_buy_price: buy, current_price: cur });
    else await inv.createInvestment({ label: f.label.trim(), ticker: f.ticker || null, quantity: qty, avg_buy_price: buy, current_price: cur });
    close(); showToast(editing ? "Modifié" : "Position ajoutée");
  };
  const openEmployer = (e = null) => { setEditing(e); setF(e ? { name: e.name } : { name: "" }); setModal("employer"); };
  const submitEmployer = async () => {
    if (!f.name?.trim()) return showToast("Nom requis");
    clearFinanceError();
    const r = editing
      ? await emp.updateEmployer(editing.id, { name: f.name.trim() })
      : await emp.createEmployer({ name: f.name.trim(), color: COLORS[emp.employers.length % COLORS.length] });
    if (!ok(r)) return;
    close(); showToast(editing ? "Modifié" : "Employeur ajouté");
  };

  const askDeleteAccount = async (account) => {
    const impact = await acc.getAccountImpact(account.id);
    setDelConfirm(""); setDelAcc({ account, impact }); setModal("delAccount");
  };
  const doArchiveAccount = async () => {
    await acc.archiveAccount(delAcc.account.id);
    setDelAcc(null); close(); showToast("Compte archivé");
  };
  const doDeleteAccount = async () => {
    setDelBusy(true);
    const r = await acc.deleteAccount(delAcc.account.id);
    setDelBusy(false);
    if (!r?.ok) return showToast(r?.error ? `Échec : ${r.error}` : "Échec de la suppression");
    setDelAcc(null); close(); showToast("Compte supprimé");
  };

  const submitAccount = async () => {
    const bal = parseAmount(f.balance);
    if (!f.name?.trim()) return showToast("Nom requis");
    if (editing) {
      const delta = editing.balance - Number(editing.initial_balance);
      clearFinanceError();
      const r = await acc.updateAccount(editing.id, { name: f.name.trim(), initial_balance: bal - delta, nature: f.nature || "liquidite" });
      if (!ok(r)) return;
    } else {
      clearFinanceError();
      const r = await acc.createAccount({ name: f.name.trim(), initial_balance: bal, nature: f.nature || "liquidite", color: COLORS[acc.accounts.length % COLORS.length] });
      if (!ok(r)) return;
    }
    close(); showToast(editing ? "Modifié" : "Compte ajouté");
  };
  const submitCat = async () => {
    if (!f.name?.trim()) return showToast("Nom requis");
    clearFinanceError();
    const r = editing
      ? await cat.updateCategory(editing.id, { name: f.name.trim(), kind: f.kind, color: f.color, icon: f.emoji })
      : await cat.createCategory({ name: f.name.trim(), kind: f.kind, color: f.color, icon: f.emoji });
    if (!ok(r)) return;
    close(); showToast(editing ? "Modifié" : "Catégorie créée");
  };

  const NAV = [
    { grp: "Principal" },
    { id: "dash", label: "Vue d'ensemble", icon: "▦" },
    { id: "tx", label: "Opérations", icon: "≣" },
    { id: "rec", label: "Récurrences", icon: "↻", badge: recDue.length },
    { id: "debts", label: "Remboursements", icon: "⇄", badge: debtsPending.length },
    { grp: "Finances" },
    { id: "budget", label: "Budgets", icon: "▭" },
    { id: "pockets", label: "Poches", icon: "🪣" },
    { id: "pea", label: "PEA / Bourse", icon: "📈" },
    { id: "bilan", label: "Bilan", icon: "◉" },
    { sep: true },
    { id: "banks", label: "Banques", icon: "🏦" },
    { id: "settings", label: "Paramètres", icon: "⚙" },
  ];

  return (
    <div className="theme-light" style={{ display: "flex", minHeight: "100vh", color: C.text, fontFamily: "var(--font-body)" }}>
      {/* ── SIDEBAR ── */}
      <nav style={{ width: 220, flexShrink: 0, background: "linear-gradient(to right, rgba(139,92,246,0.035), rgba(139,92,246,0))", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto", paddingBottom: 90 }}>
        <div style={{ padding: "22px 18px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: C.accentBg, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>💼</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Budget</div>
        </div>
        <div style={{ padding: "4px 10px", flex: 1 }}>
          {NAV.map((n, i) => {
            if (n.grp) return <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".1em", padding: "10px 10px 5px" }}>{n.grp}</div>;
            if (n.sep) return <div key={i} style={{ height: 1, background: C.border, margin: "6px 10px" }} />;
            const on = section === n.id;
            return (
              <button key={i} onClick={() => setSection(n.id)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 10px", borderRadius: 9, border: "none", background: on ? C.accentBg : "none", color: on ? C.accent : C.muted, fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", fontFamily: "inherit", marginBottom: 1, position: "relative" }}>
                <span style={{ width: 16, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>{n.label}
                {n.badge > 0 && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: C.red, color: "#fff", fontSize: 10, fontWeight: 700, minWidth: 17, height: 17, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n.badge}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".1em", padding: "10px 10px 5px" }}>Comptes</div>
        <div>
          {acc.accounts.map(a => (
            <div key={a.id} onClick={() => openAccount(a)} title="Modifier le compte" style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", cursor: "pointer", borderRadius: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.color || C.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 12, flex: 1, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</span>
            </div>
          ))}
        </div>
        <button onClick={() => openAccount()} style={{ display: "flex", alignItems: "center", gap: 6, width: "calc(100% - 20px)", margin: "6px 10px", padding: "7px 10px", borderRadius: 8, border: `1px dashed ${C.border}`, background: "none", color: C.faint, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Nouveau compte</button>
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 18px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 3 }}>Patrimoine net</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: netWorth >= 0 ? C.green : C.red }}>{fmtEUR(netWorth)}</div>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 32, paddingBottom: 100 }}>
        {dbError && isSchemaError(dbError) && (
          <div style={{ marginBottom: 18, padding: "14px 18px", borderRadius: 12,
            background: `${C.red}14`, border: `1px solid ${C.red}55`, lineHeight: 1.65 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.red, marginBottom: 6 }}>
              Base de données pas à jour — rien ne s'enregistre
            </div>
            <div style={{ fontSize: 12.5, color: C.muted }}>
              Les colonnes ajoutées par les dernières fonctionnalités n'existent pas encore.
              Applique dans le SQL Editor Supabase, dans l'ordre :
              <b style={{ color: C.text }}> 010_finance_revenu_kind.sql</b>, puis
              <b style={{ color: C.text }}> 011_finance_natures_aides.sql</b> (dossier <code>supabase/migrations/</code>).
              <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: C.faint, wordBreak: "break-word" }}>
                {dbError.where} — {dbError.message}
              </div>
            </div>
          </div>
        )}
        {dbError && !isSchemaError(dbError) && (
          <div style={{ marginBottom: 18, padding: "12px 16px", borderRadius: 11,
            background: `${C.amber}14`, border: `1px solid ${C.amber}44`, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
            <b style={{ color: C.amber }}>Dernière écriture refusée.</b>{" "}
            <span style={{ fontFamily: MONO, fontSize: 11 }}>{dbError.where} — {dbError.message}</span>
            <button onClick={clearFinanceError} style={{ marginLeft: 10, background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 11, textDecoration: "underline" }}>Masquer</button>
          </div>
        )}
        {section === "dash" && <Dash />}
        {section === "tx" && <TxView />}
        {section === "rec" && <RecView />}
        {section === "debts" && <DebtsView />}
        {section === "budget" && <BudgetView />}
        {section === "pockets" && <PocketsView />}
        {section === "pea" && <PeaView />}
        {section === "bilan" && <BilanView />}
        {section === "settings" && <SettingsView />}
        {section === "banks" && <BankPanel userId={userId} getAcc={getAcc} onSynced={() => acc.refetch()} />}
      </div>

      {/* ── TOAST ── */}
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: C.surface, border: `1px solid ${C.borderMid}`, borderRadius: 99, padding: "9px 20px", fontSize: 13, fontWeight: 500, zIndex: 999, boxShadow: "0 8px 30px rgba(0,0,0,.5)" }}>{toast}</div>}

      {/* ── MODALES ── */}
      {renderModals()}
    </div>
  );

  // ════════ SECTIONS (closures sur l'état) ════════
  function PageHead({ title, sub, action }) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.01em" }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{sub}</div>}
        </div>
        {action}
      </div>
    );
  }
  function MonthNav() {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setYm(shiftMonth(ym, -1))} style={monthBtnSt}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, minWidth: 130, textAlign: "center" }}>{monthLabel(ym)}</div>
        <button onClick={() => setYm(shiftMonth(ym, 1))} style={monthBtnSt}>›</button>
      </div>
    );
  }

  function Dash() {
    const byCat = {};
    // Les opérations importées de la banque arrivent sans catégorie : on les
    // compte à part au lieu de les ignorer (sinon le donut se croyait vide).
    monthTx.filter(t => t.type === "depense" && !isTrf(t)).forEach(t => { const k = t.category_id || "_none"; byCat[k] = (byCat[k] || 0) + t.amount; });
    const UNCAT = { name: "Sans catégorie", icon: "❔", color: "#94a3b8" };
    const cd = Object.entries(byCat).map(([id, v]) => ({ ...(id === "_none" ? UNCAT : getCat(id)), value: v })).sort((a, b) => b.value - a.value);
    const recent = tx.transactions.slice(0, 6);
    return (
      <>
        <PageHead title="Vue d'ensemble" sub={monthLabel(ym)} action={<Btn small onClick={() => openTx()}>+ Opération</Btn>} />
        {(recOverdue.length > 0 || recDue.length - recOverdue.length > 0 || debtsPending.length > 0) && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {recOverdue.length > 0 && <AlertBox c={C.red}>⚠️ <b>{recOverdue.length} récurrence(s)</b> en retard</AlertBox>}
            {recDue.length - recOverdue.length > 0 && <AlertBox c={C.amber}>📅 <b>{recDue.length - recOverdue.length} récurrence(s)</b> dues sous 7j</AlertBox>}
            {debtsPending.length > 0 && <AlertBox c={C.accent}>💬 <b>{debtsPending.length} remboursement(s)</b> en attente</AlertBox>}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
          <Stat label="Solde total" value={fmtEUR(acc.totalBalance)} c={acc.totalBalance >= 0 ? C.green : C.red} />
          <Stat label="Revenus du mois" value={fmtEUR(income)} c={C.green} />
          <Stat label="Dépenses du mois" value={fmtEUR(expense)} c={C.red} />
          <Stat label="Solde du mois" value={fmtEUR(income - expense)} c={income - expense >= 0 ? C.green : C.red} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, marginBottom: 22 }}>
          <div style={cardSt}>
            <div style={titleSt}>Répartition des dépenses</div>
            <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <Donut data={cd} total={expense} />
              {/* Sans dépense, le donut affiche son message vide : pas de « 0,00 € » par-dessus. */}
              {expense > 0 && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{fmtEUR(expense)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>ce mois</div>
                </div>
              )}
            </div>
            {cd.slice(0, 5).map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: d.color }} />
                <span style={{ fontSize: 12, flex: 1 }}>{d.icon} {d.name}</span>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: MONO, width: 30, textAlign: "right" }}>{expense > 0 ? Math.round(d.value / expense * 100) : 0}%</span>
                <span style={{ fontSize: 12, fontFamily: MONO, fontWeight: 600, width: 78, textAlign: "right" }}>{fmtEUR(d.value)}</span>
              </div>
            ))}
          </div>
          <div style={cardSt}>
            <div style={titleSt}>Dernières opérations</div>
            {recent.length === 0 ? <Empty icon="📭" text="Aucune transaction" /> : recent.map(t => {
              const isT = t.type === "transfert"; const c = getCat(t.category_id); const d = new Date(t.date);
              const icon = isT ? "⇄" : c.icon; const col = isT ? C.accent : (c.color || C.muted);
              const meta = isT ? `${getAcc(t.account_id)?.name || "—"} → ${getAcc(t.transfer_account_id)?.name || "—"}` : (txDisplay(t, c)?.name || "À classer");
              return (
                <div key={t.id} style={txRowSt}>
                  {isT && !t.category_id
                    ? <button onClick={() => setCatPick(t)} title="Choisir une catégorie" style={{ ...txIconSt, background: col + "22", border: "none", cursor: "pointer", color: C.accent }}>{icon}</button>
                    : <CatEmoji t={t} c={c} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><TxLabel t={t} fallback={isT ? "Transfert" : (t.category_id ? c.name : "Opération")} /><RecTag t={t} /></div>
                    <div style={{ fontSize: 11, color: C.muted }}>{meta} · {d.getDate()} {MONTH_FR[d.getMonth()].slice(0, 3)}.</div>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: isT ? C.muted : t.type === "revenu" ? C.green : C.text }}>{isT ? "" : t.type === "revenu" ? "+" : "-"}{fmtEUR(t.amount)}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ ...titleSt, marginBottom: 12 }}>Poches d'épargne</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          {goal.goals.length === 0 ? <div style={{ color: C.faint, fontSize: 12, gridColumn: "1/-1" }}>Aucune poche</div> : goal.goals.map(p => {
            const pct = p.target_amount > 0 ? Math.min(100, p.current_amount / p.target_amount * 100) : 0;
            return (
              <div key={p.id} style={{ ...statSt, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{p.icon || "🎯"}</span>
                  <div style={{ fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: p.color || C.accent }}>{Math.round(pct)}%</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: p.color || C.accent, marginBottom: 8 }}>{fmtEUR(p.current_amount)}</div>
                <Progress pct={pct} color={p.color || C.accent} />
                <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>sur {fmtEUR(p.target_amount)}</div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function TxView() {
    const filter = txFilter, setFilter = setTxFilter;
    let list = [...monthTx].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (filter === "income") list = list.filter(t => t.type === "revenu");
    if (filter === "expense") list = list.filter(t => t.type === "depense");
    return (
      <>
        <PageHead title="Opérations" action={<Btn small onClick={() => openTx()}>+ Ajouter</Btn>} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
          <MonthNav />
          <div style={{ display: "flex", gap: 7 }}>
            {[["all", "Tout"], ["income", "💰 Revenus"], ["expense", "💸 Dépenses"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={chipSt(filter === k)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
          {!list.length ? <Empty icon="📭" text="Aucune transaction ce mois" /> : (
            <table style={tblSt}>
              <thead><tr>{["Date", "Description", "Catégorie", "Compte", "Montant", ""].map((h, i) => <th key={i} style={{ ...thSt, textAlign: i === 4 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map(t => {
                  const isT = t.type === "transfert"; const c = getCat(t.category_id); const a = getAcc(t.account_id); const dst = getAcc(t.transfer_account_id); const d = new Date(t.date);
                  return (
                    <tr key={t.id}>
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{d.getDate()} {MONTH_FR[d.getMonth()].slice(0, 3)}.</td>
                      <td style={{ ...tdSt, fontWeight: 500 }}><TxLabel t={t} fallback={isT ? "Transfert" : "—"} /><RecTag t={t} /></td>
                      <td style={tdSt}>{isT && !t.category_id
                        ? <button onClick={() => setCatPick(t)} title="Choisir une catégorie" style={{ ...badgeSt(C.accent), border: "none", cursor: "pointer", fontFamily: "inherit" }}>⇄ Transfert</button>
                        : <CatEmoji t={t} c={c} badge />}</td>
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{isT ? `${a ? a.name : "—"} → ${dst ? dst.name : "—"}` : (a ? a.name : "—")}</td>
                      <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: isT ? C.muted : t.type === "revenu" ? C.green : C.text }}>{isT ? "" : t.type === "revenu" ? "+" : "-"}{fmtEUR(t.amount)}</td>
                      <td style={tdSt}><RowActions>{!isT && !t.recurring_id && <span title="En faire une récurrence">{rowBtn("↻", () => openRecFromTx(t))}</span>}{rowBtn("✏️", () => openTx(t))}{rowBtn("✕", () => { tx.deleteTransaction(t.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  }

  function RecView() {
    const tab = recTab, setTab = setRecTab;
    const in30 = new Date(today0.getTime() + 30 * 864e5);
    let list = rec.recurring;
    if (tab === "upcoming") list = list.filter(r => r.active && new Date(r.next_occurrence) <= in30);
    else if (tab === "inactive") list = list.filter(r => !r.active);
    else list = list.filter(r => r.active);
    list = [...list].sort((a, b) => new Date(a.next_occurrence) - new Date(b.next_occurrence));
    return (
      <>
        <PageHead title="Récurrences" sub="Dépenses & revenus récurrents" action={<Btn small onClick={() => setModal("recPick")}>+ Ajouter</Btn>} />
        {(() => {
          // Bandeau : coût mensuel des dépenses récurrentes actives et son équivalent
          // annuel (un abonnement annuel compte pour 1/12 par mois).
          const items = rec.recurring.filter(r => r.active && r.type === "depense");
          const month = items.reduce((s2, r) => s2 + r.monthly_cost, 0);
          if (!items.length) return null;
          return (
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, padding: "22px 26px 20px", marginBottom: 20,
              background: "linear-gradient(120deg, rgba(139,92,246,0.18), rgba(236,72,153,0.08) 60%, rgba(255,255,255,0.02))", paddingRight: 110 }}>
              {/* Filigrane tenu dans le bandeau : centré verticalement, jamais rogné. */}
              <span aria-hidden="true" style={{ position: "absolute", right: 22, top: "50%", transform: "translateY(-50%)", fontSize: 72, lineHeight: 1, color: "rgba(255,255,255,0.06)", fontWeight: 800, pointerEvents: "none" }}>↻</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px 28px", flexWrap: "wrap", position: "relative" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 6 }}>Tes récurrences te coûtent</div>
                  <div style={{ fontFamily: MONO, fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {fmtEUR(month)}<span style={{ fontSize: 17, fontWeight: 600, color: C.muted, marginLeft: 6 }}>/ mois</span>
                  </div>
                </div>
                <div style={{ paddingBottom: 4, display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span style={{ fontSize: 13, color: C.muted }}>soit</span>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#f0abfc", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {fmtEUR(month * 12)}<span style={{ fontSize: 13, fontWeight: 600, color: C.muted, marginLeft: 5 }}>/ an</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        <Tabs tabs={[["upcoming", "À venir (30j)"], ["all", "Toutes"], ["inactive", "Inactives"]]} value={tab} onChange={setTab} />
        <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
          {!list.length ? <Empty icon="🔁" text="Aucune récurrence" /> : (
            <table style={tblSt}>
              <thead><tr>{["Nom", "Catégorie", "Fréquence", "Prochaine", "Montant", ""].map((h, i) => <th key={i} style={{ ...thSt, textAlign: i === 4 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map(r => {
                  const c = getCat(r.category_id); const nd = new Date(r.next_occurrence); const diff = Math.ceil((nd - today0) / 864e5);
                  const col = diff < 0 ? C.red : diff <= 3 ? C.amber : C.muted;
                  const dtxt = diff < 0 ? `Retard ${Math.abs(diff)}j` : diff === 0 ? "Aujourd'hui" : `Dans ${diff}j`;
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdSt, fontWeight: 500 }}>{r.label}</td>
                      <td style={tdSt}><span style={badgeSt(c.color)}>{c.icon} {c.name}</span></td>
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{recurrenceLabel(r)}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{nd.toLocaleDateString("fr-FR")} <span style={{ color: col }}>{dtxt}</span></td>
                      <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: r.type === "revenu" ? C.green : C.text }}>{r.type === "revenu" ? "+" : "-"}{fmtEUR(r.amount)}</td>
                      <td style={tdSt}><RowActions>{r.match_key
                        ? <span title="Détectée automatiquement à chaque synchro bancaire" style={{ ...badgeSt(C.accent), alignSelf: "center" }}>Auto</span>
                        : rowBtn("✓ Payer", () => payRec(r), C.green)}{rowBtn("✏️", () => openRec(r))}{rowBtn(r.active ? "⏸" : "▶", () => rec.toggleActive(r))}{rowBtn("✕", () => { rec.deleteRecurring(r.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  }

  function DebtsView() {
    const tab = debtTab, setTab = setDebtTab;
    const pend = debt.debts.filter(d => d.status === "pending");
    const list = debt.debts.filter(d => d.status === tab);
    const now = new Date();
    return (
      <>
        <PageHead title="Remboursements" sub="Créances & dettes" action={<Btn small onClick={() => openDebt()}>+ Ajouter</Btn>} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <Stat label="On me doit" value={fmtEUR(pend.filter(d => d.dir === "in").reduce((s, d) => s + d.amount, 0))} c={C.green} />
          <Stat label="Je dois" value={fmtEUR(pend.filter(d => d.dir === "out").reduce((s, d) => s + d.amount, 0))} c={C.red} />
        </div>
        <Tabs tabs={[["pending", "En attente"], ["settled", "Réglés"]]} value={tab} onChange={setTab} />
        <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
          {!list.length ? <Empty icon="🤝" text="Aucun remboursement" /> : (
            <table style={tblSt}>
              <thead><tr>{["", "Personne", "Description", "Échéance", "Montant", ""].map((h, i) => <th key={i} style={{ ...thSt, textAlign: i === 4 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map(d => {
                  const isIn = d.dir === "in"; const due = d.due_date ? new Date(d.due_date) : null; const od = due && due < now && d.status === "pending";
                  return (
                    <tr key={d.id}>
                      <td style={{ ...tdSt, fontSize: 18 }}>{isIn ? "📥" : "📤"}</td>
                      <td style={{ ...tdSt, fontWeight: 600 }}>{d.person}</td>
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{d.description || "—"}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{due ? <span style={{ color: od ? C.red : C.muted }}>{due.toLocaleDateString("fr-FR")}{od ? " ⚠️" : ""}</span> : "—"}</td>
                      <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: isIn ? C.green : C.text }}>{fmtEUR(d.amount)}</td>
                      <td style={tdSt}><RowActions>{d.status === "pending" && rowBtn("✓ Régler", () => openSettle(d), C.green)}{rowBtn("✏️", () => openDebt(d))}{rowBtn("✕", () => { debt.deleteDebt(d.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  }

  function BudgetView() {
    return (
      <>
        <PageHead title="Budgets" action={<Btn small onClick={openBudget}>+ Budget</Btn>} />
        <div style={{ marginBottom: 20 }}><MonthNav /></div>
        {!bud.budgets.length ? <Empty icon="📊" text="Cliquez sur + Budget pour créer une enveloppe" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
            {bud.budgets.map(b => {
              const c = getCat(b.category_id); const pct = b.amount > 0 ? Math.min(100, b.spent / b.amount * 100) : 0; const over = b.spent > b.amount;
              const col = over ? C.red : pct > 75 ? C.amber : (c.color || C.accent);
              return (
                <div key={b.id} onClick={() => openBudget(b)} title="Modifier le budget" style={{ ...statSt, position: "relative", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{c.icon} {c.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: MONO }}>{fmtEUR(b.spent)} / {fmtEUR(b.amount)}</div>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: col }}>{Math.round(pct)}%</div>
                  </div>
                  <Progress pct={pct} color={col} h={7} />
                  {over && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>⚠️ Dépassé de {fmtEUR(b.spent - b.amount)}</div>}
                  <button onClick={(e) => { e.stopPropagation(); bud.deleteBudget(b.id); showToast("Supprimé"); }} style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function PocketsView() {
    return (
      <>
        <PageHead title="Poches d'épargne" sub={<>Total : <span style={{ fontFamily: MONO }}>{fmtEUR(pocketsTotal)}</span></>} action={<Btn small onClick={() => openPocket()}>+ Nouvelle poche</Btn>} />
        {!goal.goals.length ? <Empty icon="🪣" text="Créez votre première poche" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 18 }}>
            {goal.goals.map(p => {
              const pct = p.target_amount > 0 ? Math.min(100, p.current_amount / p.target_amount * 100) : 0;
              const dl = p.deadline ? Math.ceil((new Date(p.deadline) - new Date()) / 864e5) : null;
              const rem = p.target_amount - p.current_amount;
              return (
                <div key={p.id} style={cardSt}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ fontSize: 30 }}>{p.icon || "🎯"}</div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                      {p.deadline && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{dl > 0 ? `${dl}j restants` : "Échéance dépassée"}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <div><div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: p.color || C.accent }}>{fmtEUR(p.current_amount)}</div><div style={{ fontSize: 11, color: C.muted }}>économisé</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{fmtEUR(p.target_amount)}</div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: p.color || C.accent }}>{Math.round(pct)}%</div></div>
                  </div>
                  <Progress pct={pct} color={p.color || C.accent} h={7} />
                  {rem > 0 ? <div style={{ fontSize: 11, color: C.faint, marginTop: 7 }}>Il reste {fmtEUR(rem)}</div> : <div style={{ fontSize: 11, color: C.green, marginTop: 7 }}>🎉 Objectif atteint !</div>}
                  <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
                    <PktBtn onClick={() => openPocketAct(p, "dep")} c={C.green}>+ Déposer</PktBtn>
                    <PktBtn onClick={() => openPocketAct(p, "wit")} c={C.red}>- Retirer</PktBtn>
                    <PktBtn onClick={() => openPocket(p)}>✏️</PktBtn>
                    <PktBtn onClick={() => { goal.archiveGoal(p.id); showToast("Supprimé"); }}>🗑️</PktBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function PeaView() {
    return (
      <>
        <PageHead title="PEA / Bourse" sub="Cours saisis manuellement" action={<Btn small onClick={() => openPea()}>+ Position</Btn>} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
          <Stat label="Investi" value={fmtEUR(inv.totalInvested)} />
          <Stat label="Valeur actuelle" value={fmtEUR(inv.totalMarketValue)} c={inv.totalMarketValue >= inv.totalInvested ? C.green : C.red} />
          <Stat label="P&L" value={`${inv.totalPnl >= 0 ? "+" : ""}${fmtEUR(inv.totalPnl)}`} c={inv.totalPnl >= 0 ? C.green : C.red} />
          <Stat label="Performance" value={`${inv.totalInvested > 0 ? (inv.totalPnl / inv.totalInvested >= 0 ? "+" : "") + fmtN(inv.totalPnl / inv.totalInvested * 100, 2) : "0,00"}%`} c={inv.totalPnl >= 0 ? C.green : C.red} />
        </div>
        <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
          {!inv.investments.length ? <Empty icon="📈" text="Ajoutez vos positions avec + Position" /> : (
            <table style={tblSt}>
              <thead><tr>{["Titre", "Ticker", "Qté", "PRU", "Cours", "Valeur", "P&L", "%", ""].map((h, i) => <th key={i} style={{ ...thSt, textAlign: i >= 5 && i <= 7 ? "right" : "left" }}>{h}</th>)}</tr></thead>
              <tbody>
                {inv.investments.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{p.label}</td>
                    <td style={tdSt}><span style={{ fontFamily: MONO, fontSize: 11, background: C.surface2, padding: "2px 7px", borderRadius: 5, color: C.muted }}>{p.ticker || "—"}</span></td>
                    <td style={{ ...tdSt, fontFamily: MONO }}>{fmtN(p.quantity, 3)}</td>
                    <td style={{ ...tdSt, fontFamily: MONO, color: C.muted }}>{fmtN(p.avg_buy_price, 2)} €</td>
                    <td style={{ ...tdSt, fontFamily: MONO }}>{fmtN(p.current_price, 2)} €</td>
                    <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{fmtEUR(p.market_value)}</td>
                    <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: p.pnl >= 0 ? C.green : C.red }}>{p.pnl >= 0 ? "+" : ""}{fmtEUR(p.pnl)}</td>
                    <td style={{ ...tdSt, fontFamily: MONO, textAlign: "right", color: p.pnl >= 0 ? C.green : C.red }}>{p.pnl_pct >= 0 ? "+" : ""}{fmtN(p.pnl_pct * 100, 2)}%</td>
                    <td style={tdSt}><RowActions>{rowBtn("✏️", () => openPea(p))}{rowBtn("✕", () => { inv.archiveInvestment(p.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </>
    );
  }

  function BilanView() {
    return (
      <>
        <PageHead title="Bilan patrimonial" />
        <div style={{ background: "linear-gradient(135deg,rgba(139,92,246,.16),rgba(99,102,241,.08))", border: `1px solid ${C.borderMid}`, borderRadius: 20, padding: 36, textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", marginBottom: 10 }}>Patrimoine net total</div>
          <div style={{ fontFamily: MONO, fontSize: 52, fontWeight: 800, letterSpacing: "-.02em", color: netWorth >= 0 ? C.green : C.red }}>{fmtEUR(netWorth)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${proAcc.length ? 4 : 3},1fr)`, gap: 18, alignItems: "stretch" }}>
          <div style={{ ...cardSt, display: "flex", flexDirection: "column" }}>
            <div style={titleSt}>Comptes liquidité</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: liquidTotal >= 0 ? C.green : C.red, marginBottom: 12 }}>{fmtEUR(liquidTotal)}</div>
            <div style={{ flex: 1 }}>
              {!liquidAcc.length
                ? <div style={{ color: C.faint, fontSize: 12 }}>Aucun compte de liquidité</div>
                : liquidAcc.map(a => (
                  <div key={a.id} style={bilRowSt}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color || C.accent }} />
                    <div style={{ flex: 1 }}>{a.name}</div>
                    {rowBtn("✏️", () => openAccount(a))}
                    <div style={{ fontFamily: MONO, fontWeight: 700, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</div>
                  </div>
                ))}
            </div>
            <Btn kind="g" small style={{ marginTop: 14 }} onClick={() => openAccount()}>+ Compte</Btn>
          </div>

          <div style={{ ...cardSt, display: "flex", flexDirection: "column" }}>
            <div style={titleSt}>Comptes investissement</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: C.accent, marginBottom: 12 }}>{fmtEUR(investTotal + inv.totalMarketValue)}</div>
            <div style={{ flex: 1 }}>
              {!investAcc.length && !inv.investments.length
                ? <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.6 }}>Aucun compte d'investissement. Change la nature d'un compte dans Paramètres.</div>
                : (<>
                  {investAcc.map(a => (
                    <div key={a.id} style={bilRowSt}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color || C.accent }} />
                      <div style={{ flex: 1 }}>{a.name}</div>
                      {rowBtn("✏️", () => openAccount(a))}
                      <div style={{ fontFamily: MONO, fontWeight: 700, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</div>
                    </div>
                  ))}
                  {inv.investments.length > 0 && (
                    <div style={{ ...bilRowSt, borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 12 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.green }} />
                      <div style={{ flex: 1 }}>Titres PEA <span style={{ color: C.faint, fontSize: 11 }}>({inv.investments.length})</span></div>
                      <div style={{ fontFamily: MONO, fontWeight: 700, color: C.green }}>{fmtEUR(inv.totalMarketValue)}</div>
                    </div>
                  )}
                </>)}
            </div>
          </div>

          {proAcc.length > 0 && (
            <div style={{ ...cardSt, display: "flex", flexDirection: "column" }}>
              <div style={titleSt}>Comptes pro</div>
              <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: C.amber, marginBottom: 12 }}>{fmtEUR(proTotal)}</div>
              <div style={{ flex: 1 }}>
                {proAcc.map(a => (
                  <div key={a.id} style={bilRowSt}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color || C.amber }} />
                    <div style={{ flex: 1 }}>{a.name}</div>
                    {rowBtn("✏️", () => openAccount(a))}
                    <div style={{ fontFamily: MONO, fontWeight: 700, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 12, lineHeight: 1.5 }}>Argent de l'entreprise : hors patrimoine net.</div>
            </div>
          )}

          <div style={{ ...cardSt, display: "flex", flexDirection: "column" }}>
            <div style={titleSt}>Poches</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: C.green, marginBottom: 12 }}>{fmtEUR(pocketsTotal)}</div>
            <div style={{ flex: 1 }}>
              {!goal.goals.length
                ? <div style={{ color: C.faint, fontSize: 12 }}>Aucune poche</div>
                : goal.goals.map(p => (
                  <div key={p.id} style={bilRowSt}>
                    <span>{p.icon || "🎯"}</span>
                    <div style={{ flex: 1 }}>{p.name}</div>
                    <div style={{ fontFamily: MONO, color: p.color || C.accent }}>{fmtEUR(p.current_amount)}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ── REVENUS ─────────────────────────────────────────────────────── */}
        {(() => {
          const k = revStats.kind;
          const monthName = new Date(yNum, mNum - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
          const Big = ({ v, c }) => <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", color: c || C.text }}>{fmtEUR(v)}</div>;
          const Sub = ({ children }) => <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>{children}</div>;
          const Row = ({ dot, label, value }) => (
            <div style={bilRowSt}>
              {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
              <div style={{ flex: 1, fontSize: 13 }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{fmtEUR(value)}</div>
            </div>
          );
          const caMax = Math.max(1, ...revStats.caMonths);
          return (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".12em" }}>Revenus</div>
                <div style={{ fontSize: 12, color: C.faint, textTransform: "capitalize" }}>{monthName}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
                {/* Revenus professionnels = somme des salaires */}
                <div style={cardSt}>
                  <div style={titleSt}>Revenus professionnels</div>
                  <Big v={k.salaire.month} c={C.green} />
                  <Sub>Cumul {yNum} : <b style={{ color: C.muted }}>{fmtEUR(k.salaire.year)}</b></Sub>
                  <div style={{ marginTop: 14 }}>
                    {!revStats.byEmp.length
                      ? <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>Aucun employeur. Ajoute-en dans Réglages pour séparer plusieurs salaires.</div>
                      : revStats.byEmp.map(e2 => <Row key={e2.id} dot={e2.color || C.green} label={e2.name} value={e2.month} />)}
                  </div>
                </div>

                {/* Aides sociales, ventilées par sous-type */}
                <div style={cardSt}>
                  <div style={titleSt}>Aides sociales</div>
                  <Big v={k.aides_sociales.month} c={C.accent} />
                  <Sub>Cumul {yNum} : <b style={{ color: C.muted }}>{fmtEUR(k.aides_sociales.year)}</b></Sub>
                  <div style={{ marginTop: 14 }}>
                    {!revStats.byAide.length
                      ? <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>Aucune aide enregistrée cette année. Crée tes types d'aide dans Paramètres.</div>
                      : revStats.byAide.map(a2 => <Row key={a2.id} dot={a2.color || C.accent} label={`${a2.icon ? a2.icon + " " : ""}${a2.name}`} value={a2.month} />)}
                  </div>
                </div>

                {/* CA encaissé de l'entreprise */}
                <div style={cardSt}>
                  <div style={titleSt}>CA entreprise · encaissé</div>
                  {proAcc.length === 0 && <div style={{ fontSize: 11, color: C.faint, margin: "-4px 0 8px" }}>Astuce : passe le compte de ta boîte en nature « Pro » pour compter ses encaissements automatiquement.</div>}
                  <Big v={k.entreprise.month} />
                  <Sub>Cumul {yNum} : <b style={{ color: C.muted }}>{fmtEUR(k.entreprise.year)}</b></Sub>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 54, marginTop: 16 }}>
                    {revStats.caMonths.map((v, i) => (
                      <div key={i} title={`${new Date(yNum, i, 1).toLocaleDateString("fr-FR", { month: "long" })} · ${fmtEUR(v)}`}
                        style={{ flex: 1, height: `${Math.max(2, v / caMax * 100)}%`, borderRadius: "3px 3px 0 0",
                          background: i + 1 === mNum ? C.accent : `${C.accent}4d` }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: C.faint, marginTop: 5 }}>
                    <span>janv.</span><span>déc.</span>
                  </div>
                </div>
              </div>

              {revStats.unclassified > 0 && (
                <div style={{ marginTop: 14, padding: "11px 14px", borderRadius: 11, fontSize: 12.5, lineHeight: 1.6,
                  background: `${C.amber}14`, border: `1px solid ${C.amber}44`, color: C.muted }}>
                  <b style={{ color: C.amber }}>{revStats.unclassified} revenus sans nature</b> en {yNum}
                  ({fmtEUR(revStats.unclassifiedSum)}) — ils ne sont comptés dans aucun bloc ci-dessus.
                  Ouvre-les depuis Opérations pour leur donner une nature.
                </div>
              )}
            </div>
          );
        })()}
      </>
    );
  }

  // Toutes les listes que tu crées toi-même, chacune dépliable.
  function SettingsList({ id, title, hint, items, count, onAdd, addLabel, children }) {
    const open = settingsOpen === id;
    return (
      <div style={{ ...cardSt, marginBottom: 12, padding: 0, overflow: "hidden" }}>
        <button onClick={() => setSettingsOpen(open ? null : id)}
          aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "16px 20px",
            background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{count}</span>
          <span style={{ fontSize: 11, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
        </button>
        {open && (
          <div style={{ padding: "0 20px 18px" }}>
            {hint && <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6, marginBottom: 12 }}>{hint}</div>}
            {items}
            {!count && <div style={{ fontSize: 12.5, color: C.faint, padding: "8px 0" }}>Liste vide.</div>}
            {children}
            <Btn kind="g" small style={{ marginTop: 14 }} onClick={onAdd}>{addLabel}</Btn>
          </div>
        )}
      </div>
    );
  }

  function SettingsView() {
    const catRow = (c) => (
      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color || C.muted }} />
        <span style={{ fontSize: 17 }}>{c.icon}</span>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.name}</div>
        <RowActions>{rowBtn("✏️", () => openCat(c))}{rowBtn("✕", () => { cat.archiveCategory(c.id); showToast("Supprimé"); }, C.red)}</RowActions>
      </div>
    );
    const openCatKind = (kind) => { setEditing(null); setF({ kind, emoji: "📦", name: "", color: COLORS[0] }); setModal("cat"); };

    return (
      <>
        <PageHead title="Paramètres" sub="Tes listes personnalisées" />

        <SettingsList id="dep" title="Types de dépense" count={expCats.length}
          hint="Les catégories proposées quand tu saisis une dépense."
          items={expCats.map(catRow)} onAdd={() => openCatKind("depense")} addLabel="+ Type de dépense" />

        <SettingsList id="rev" title="Types de revenu" count={incCats.length}
          hint="Les catégories proposées quand tu saisis un revenu. À ne pas confondre avec la nature du revenu (salaire, aides, entreprise…), qui est figée et pilote le bilan."
          items={incCats.map(catRow)} onAdd={() => openCatKind("revenu")} addLabel="+ Type de revenu" />

        <SettingsList id="trf" title="Types de transfert" count={trfCats.length}
          hint="Mouvements entre tes propres comptes (épargne, compte joint…). Une opération classée ici sort des revenus, des dépenses, de la répartition du mois et des budgets."
          items={trfCats.map(catRow)} onAdd={() => openCatKind("transfert")} addLabel="+ Type de transfert" />

        <SettingsList id="aide" title="Types d'aide sociale" count={aideCats.length}
          hint="Sous-types du revenu « Aides sociales » : APL, RSA, prime d'activité… Ils détaillent le bloc Aides du bilan."
          items={aideCats.map(catRow)} onAdd={() => openCatKind("aide")} addLabel="+ Type d'aide" />

        <SettingsList id="emp" title="Employeurs" count={emp.employers.length}
          hint="Chaque salaire peut être rattaché à un employeur. Le bilan les détaille puis les additionne."
          items={emp.employers.map(e2 => (
            <div key={e2.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: e2.color || C.green }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{e2.name}</div>
              <RowActions>{rowBtn("✏️", () => openEmployer(e2))}{rowBtn("✕", async () => { await emp.archiveEmployer(e2.id); showToast("Archivé"); }, C.red)}</RowActions>
            </div>
          ))} onAdd={() => openEmployer()} addLabel="+ Employeur" />

        <SettingsList id="acc" title="Comptes" count={acc.accounts.length}
          hint="Chaque compte est une liquidité, un support d'investissement ou le compte pro de ton entreprise. Le bilan les sépare ; les encaissements sur un compte pro comptent comme CA."
          items={acc.accounts.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: a.color || C.accent }} />
              <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{a.name}</div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: a.nature === "investissement" ? C.accent : a.nature === "pro" ? C.amber : C.muted,
                background: a.nature === "investissement" ? `${C.accent}1f` : a.nature === "pro" ? `${C.amber}1f` : C.surface2,
                border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>
                {a.nature === "investissement" ? "Investissement" : a.nature === "pro" ? "Pro" : "Liquidité"}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</span>
              <RowActions>{rowBtn("✏️", () => openAccount(a))}</RowActions>
            </div>
          ))} onAdd={() => openAccount()} addLabel="+ Compte" />

        <div style={{ ...cardSt, marginTop: 22, border: `1px solid ${C.red}44` }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Repartir de zéro</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
            Supprime toutes tes opérations ({tx.transactions.length}). Le solde de chaque compte est conservé tel quel.
            Les comptes bancaires reliés ne réimportent que les opérations du jour. Récurrences, budgets, poches et comptes ne changent pas.
          </div>
          <Btn kind="g" small onClick={() => { setResetText(""); setResetOpen(true); }} style={{ color: C.red, borderColor: `${C.red}55` }}>Supprimer toutes les opérations</Btn>
        </div>
      </>
    );
  }

  // ════════ MODALES ════════
  const GROUP_LABEL = { depense: "Dépenses", revenu: "Revenus", transfert: "Transferts · hors totaux du mois" };
  function CatGrid({ kind, value, onPick, first = "depense", kinds }) {
    // Toutes les catégories, où qu'on soit : un virement reçu peut très bien
    // relever d'une catégorie de dépense (remboursement d'un ami…), et l'inverse.
    // `kinds` restreint et ordonne les sections affichées.
    if (kind === "all") {
      const order = kinds || (first === "revenu" ? ["revenu", "depense", "transfert"] : first === "transfert" ? ["transfert", "depense", "revenu"] : ["depense", "revenu", "transfert"]);
      const groups = order.map(k => [k, cat.categories.filter(c => c.kind === k)]).filter(([, l]) => l.length);
      if (!groups.length) return <div style={{ fontSize: 13, color: C.faint, marginBottom: 14 }}>Aucune catégorie. Crée-en dans Paramètres.</div>;
      return groups.map(([k, l]) => (
        <div key={k}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: "0 0 6px" }}>{GROUP_LABEL[k]}</div>
          <CatGrid kind={k} value={value} onPick={onPick} />
        </div>
      ));
    }
    const list = cat.categories.filter(c => c.kind === kind);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 14 }}>
        {list.map(c => {
          const on = c.id === value;
          return <div key={c.id} onClick={() => onPick(c.id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "9px 4px", borderRadius: 8, cursor: "pointer", fontSize: 10, textAlign: "center", background: on ? C.accentBg : C.surface2, border: `1px solid ${on ? C.accent : C.border}`, color: on ? C.accent : C.muted }}>
            <div style={{ fontSize: 18 }}>{c.icon}</div><div>{c.name}</div>
          </div>;
        })}
      </div>
    );
  }

  function renderModals() {
    return (
      <>
        <Modal open={!!catPick} onClose={() => setCatPick(null)} title={catPick?.type === "revenu" ? "Classer ce revenu" : "Changer la catégorie"}>
          {catPick && (<>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              {catPick.note || "Opération"} · <span style={{ fontFamily: MONO }}>{fmtEUR(catPick.amount)}</span>
            </div>
            {catPick.type === "revenu" && proIds.has(catPick.account_id) && !trfIds.has(catPick.category_id) && (
              <div style={{ fontSize: 13, background: `${C.amber}1a`, color: C.text, borderRadius: 10, padding: "10px 12px", marginBottom: 16, lineHeight: 1.5 }}>
                📈 Encaissement sur un compte pro : compté automatiquement comme <b>CA</b> dans le Bilan. Une catégorie reste possible ci-dessous.
              </div>
            )}
            {catPick.type === "revenu" && !proIds.has(catPick.account_id) && !trfIds.has(catPick.category_id) && (() => {
              const chip = (on, onClick, children, key) => (
                <button key={key} onClick={onClick} aria-pressed={on}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 36, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${on ? C.green : C.border}`, background: on ? `${C.green}1f` : C.surface2, color: on ? C.green : C.text }}>{children}</button>
              );
              const label = txt => <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: "0 0 6px" }}>{txt}</div>;
              const k = catPick.revenu_kind;
              return (
                <div style={{ marginBottom: 16 }}>
                  {label("Nature du revenu")}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {REVENU_KINDS.map(([v, l, ic]) => chip(k === v, () => setTxKind(catPick, k === v ? null : v), <><span aria-hidden="true">{ic}</span>{l}</>, v))}
                  </div>
                  {k === "salaire" && (
                    <div style={{ marginTop: 12 }}>
                      {label("Versé par")}
                      {emp.employers.length === 0
                        ? <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>Aucun employeur. Ajoute-les dans Paramètres → Employeurs.</div>
                        : <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                            {emp.employers.map(e2 => chip(catPick.employer_id === e2.id, () => setTxKind(catPick, "salaire", { employer_id: e2.id }),
                              <><span style={{ width: 8, height: 8, borderRadius: "50%", background: e2.color || C.green }} />{e2.name}</>, e2.id))}
                          </div>}
                    </div>
                  )}
                  {k === "aides_sociales" && aideCats.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {label("Type d'aide")}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        {aideCats.map(a2 => chip(catPick.aide_type_id === a2.id, () => setTxKind(catPick, "aides_sociales", { aide_type_id: a2.id }),
                          <>{a2.icon ? <span aria-hidden="true">{a2.icon}</span> : null}{a2.name}</>, a2.id))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Entrée d'argent : revenus ou transfert. Sortie : dépenses ou transfert. */}
            <CatGrid kind="all" kinds={catPick.type === "revenu" ? ["revenu", "transfert"] : catPick.type === "depense" ? ["depense", "transfert"] : ["transfert", "depense", "revenu"]}
              value={catPick.category_id} onPick={id => setTxCategory(catPick, id)} />
            {trfCats.length === 0 && (<>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: "0 0 6px" }}>{GROUP_LABEL.transfert}</div>
              <button onClick={() => setTxIntercompte(catPick)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.border}`, background: C.surface2, color: C.text, marginBottom: 14 }}>
                ⇄ Intercompte
              </button>
            </>)}
            {catPick.category_id && <Btn kind="g" small onClick={() => setTxCategory(catPick, null)}>Retirer la catégorie</Btn>}
            {(() => {
              const linked = catPick.recurring_id && rec.recurring.find(r => r.id === catPick.recurring_id);
              // Toutes les récurrences actives du même sens ; celles du compte de
              // l'opération d'abord (seules celles-là sont reconnues à la synchro).
              const candidates = rec.recurring.filter(r => r.active && r.type === catPick.type)
                .sort((a, b) => (b.account_id === catPick.account_id) - (a.account_id === catPick.account_id));
              if (!linked && !candidates.length) return null;
              return (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, margin: "0 0 8px" }}>Récurrence</div>
                  {linked ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                      <span style={{ ...badgeSt(C.accent) }}>↻ {linked.label}</span>
                      <Btn kind="g" small onClick={() => unlinkTx(catPick)}>Détacher</Btn>
                    </div>
                  ) : (<>
                    <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 8, lineHeight: 1.5 }}>Pas reconnue automatiquement ? Lie-la : son libellé sera reconnu la prochaine fois.</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {candidates.map(r => (
                        <button key={r.id} onClick={() => linkTxToRec(catPick, r)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, border: `1px solid ${C.border}`, background: C.surface2, color: C.text }}>
                          ↻ {r.label} <span style={{ color: C.muted, fontWeight: 500, fontFamily: MONO }}>{fmtEUR(r.amount)}</span>
                        </button>
                      ))}
                    </div>
                  </>)}
                </div>
              );
            })()}
          </>)}
        </Modal>

        <Modal open={resetOpen} onClose={() => !resetBusy && setResetOpen(false)} title="Supprimer toutes les opérations ?">
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Les <b style={{ color: C.text }}>{tx.transactions.length} opérations</b> seront supprimées définitivement, sans retour possible.
            Les soldes de tes comptes restent identiques.
          </div>
          <Field label="Tape EFFACER pour confirmer">
            <TextIn value={resetText} onChange={e => setResetText(e.target.value)} placeholder="EFFACER" autoFocus />
          </Field>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn kind="g" small onClick={() => setResetOpen(false)}>Annuler</Btn>
            <Btn small onClick={() => resetText.trim() === "EFFACER" && !resetBusy && resetOperations()}
              style={{ background: C.red, opacity: resetText.trim() === "EFFACER" && !resetBusy ? 1 : 0.4, cursor: resetText.trim() === "EFFACER" ? "pointer" : "default" }}>
              {resetBusy ? "Suppression…" : "Supprimer les opérations"}
            </Btn>
          </div>
        </Modal>
        <Modal open={modal === "tx"} onClose={close} title={editing ? "Modifier l'opération" : "Nouvelle opération"}>
          <TypeToggle value={f.type} onChange={v => setF(p => ({ ...p, type: v, category_id: p.category_id || (v === "transfert" ? null : (v === "revenu" ? incCats : expCats)[0]?.id || null), transfer_account_id: v === "transfert" ? (p.transfer_account_id && p.transfer_account_id !== p.account_id ? p.transfer_account_id : acc.accounts.find(a => a.id !== p.account_id)?.id || null) : p.transfer_account_id }))} options={[{ v: "depense", label: "💸 Dépense", c: C.red }, { v: "revenu", label: "💰 Revenu", c: C.green }, { v: "transfert", label: "⇄ Transfert", c: C.accent }]} />
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Description"><TextIn value={f.note} onChange={e => set("note", e.target.value)} placeholder={f.type === "transfert" ? "Ex : Vers épargne" : "Ex : Courses Monoprix"} /></Field>
          {f.type === "transfert" ? (
            <>
              <Field label="Compte source"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
              <Field label="Compte destination"><SelectIn value={f.transfer_account_id || ""} onChange={e => set("transfer_account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
              <Field label="Catégorie (optionnel)"><CatGrid kind="all" value={f.category_id} onPick={id => set("category_id", f.category_id === id ? null : id)} /></Field>
            </>
          ) : (
            <>
              {f.type === "revenu" && (
                <>
                  <Field label="Nature du revenu">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))", gap: 6 }}>
                      {REVENU_KINDS.map(([v, l, ic]) => {
                        const on = f.revenu_kind === v;
                        return (
                          <button key={v} onClick={() => set("revenu_kind", v)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40,
                              padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                              fontSize: 12.5, fontWeight: on ? 700 : 500,
                              border: `1px solid ${on ? C.green : C.border}`,
                              background: on ? `${C.green}1f` : C.surface2,
                              color: on ? C.green : C.muted }}>
                            <span aria-hidden="true">{ic}</span>{l}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  {f.revenu_kind === "aides_sociales" && (
                    <Field label="Type d'aide">
                      {aideCats.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                          Aucun type d'aide. Crée-les dans <b style={{ color: C.text }}>Paramètres → Types d'aide</b> (APL, RSA, prime d'activité…).
                        </div>
                      ) : (
                        <SelectIn value={f.aide_type_id || ""} onChange={e => set("aide_type_id", e.target.value || null)}>
                          <option value="">— Non précisé —</option>
                          {aideCats.map(c => <option key={c.id} value={c.id}>{c.icon ? c.icon + " " : ""}{c.name}</option>)}
                        </SelectIn>
                      )}
                    </Field>
                  )}
                  {f.revenu_kind === "salaire" && (
                    <Field label="Employeur">
                      {emp.employers.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                          Aucun employeur enregistré. Ajoute-le dans <b style={{ color: C.text }}>Réglages → Employeurs</b> pour
                          séparer les salaires dans le bilan. Le revenu reste enregistré sans employeur.
                        </div>
                      ) : (
                        <SelectIn value={f.employer_id || ""} onChange={e => set("employer_id", e.target.value || null)}>
                          <option value="">— Non précisé —</option>
                          {emp.employers.map(e2 => <option key={e2.id} value={e2.id}>{e2.name}</option>)}
                        </SelectIn>
                      )}
                    </Field>
                  )}
                </>
              )}
              <Field label="Catégorie"><CatGrid kind="all" first={f.type} value={f.category_id} onPick={id => set("category_id", id)} /></Field>
              <Field label="Compte"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
            </>
          )}
          <Field label="Date"><TextIn type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
          <Btn onClick={submitTx}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "recPick"} onClose={close} title="Quelle opération se répète ?">
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
            Choisis une opération déjà passée. Les prochaines qui lui ressemblent (même compte, libellé proche, montant voisin) seront reconnues automatiquement.
          </div>
          {(() => {
            const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
            const list = tx.transactions.filter(t => t.type !== "transfert" && !t.recurring_id && t.date >= since).slice(0, 80);
            if (!list.length) return <Empty icon="📭" text="Aucune opération récente à lier" />;
            return (
              <div style={{ maxHeight: 380, overflowY: "auto", margin: "0 -6px" }}>
                {list.map(t => {
                  const c = getCat(t.category_id); const d = new Date(t.date);
                  return (
                    <button key={t.id} onClick={() => openRecFromTx(t)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "8px 6px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: C.text, textAlign: "left" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>
                      <span style={{ width: 28, textAlign: "center" }}>{t.category_id ? c.icon : "?"}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || "Opération"}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{d.getDate()} {MONTH_FR[d.getMonth()].slice(0, 3)}.</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, width: 90, textAlign: "right", color: t.type === "revenu" ? C.green : C.text }}>{t.type === "revenu" ? "+" : "-"}{fmtEUR(t.amount)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </Modal>

        <Modal open={modal === "rec"} onClose={close} title={editing ? "Modifier la récurrence" : "Nouvelle récurrence"}>
          {!editing && f.sourceTx && (
            <div style={{ fontSize: 12.5, color: C.muted, background: C.accentBg, borderRadius: 9, padding: "9px 12px", marginBottom: 14, lineHeight: 1.5 }}>
              Liée à « {f.sourceTx.note || "Opération"} » du {new Date(f.sourceTx.date).toLocaleDateString("fr-FR")}. Les prochaines échéances seront reconnues à la synchro bancaire.
            </div>
          )}
          <TypeToggle value={f.type} onChange={v => setF(p => ({ ...p, type: v, category_id: (v === "revenu" ? incCats : expCats)[0]?.id || null }))} options={[{ v: "depense", label: "💸 Dépense", c: C.red }, { v: "revenu", label: "💰 Revenu", c: C.green }]} />
          <Field label="Nom"><TextIn value={f.label} onChange={e => set("label", e.target.value)} placeholder="Ex : Loyer, Netflix..." /></Field>
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Catégorie"><CatGrid kind="all" first={f.type} value={f.category_id} onPick={id => set("category_id", id)} /></Field>
          <Field label="Fréquence"><SelectIn value={f.uifreq} onChange={e => set("uifreq", e.target.value)}>{UIFREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectIn></Field>
          {f.uifreq === "nweeks" && (
            <Field label="Intervalle">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.muted }}>Toutes les</span>
                <TextIn type="number" min="1" max="52" value={f.weeks}
                  onChange={e => set("weeks", e.target.value)} style={{ width: 84, textAlign: "center" }} />
                <span style={{ fontSize: 13, color: C.muted }}>semaine{(parseInt(f.weeks, 10) || 1) > 1 ? "s" : ""}</span>
              </div>
            </Field>
          )}
          <Field label="Prochaine date"><TextIn type="date" value={f.next} onChange={e => set("next", e.target.value)} /></Field>
          <Field label="Compte"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
          <Btn onClick={submitRec}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "debt"} onClose={close} title={editing ? "Modifier le remboursement" : "Nouveau remboursement"}>
          <TypeToggle value={f.dir} onChange={v => set("dir", v)} options={[{ v: "in", label: "💵 On me doit", c: C.green }, { v: "out", label: "💸 Je dois", c: C.red }]} />
          <Field label="Personne"><TextIn value={f.person} onChange={e => set("person", e.target.value)} placeholder="Ex : Thomas..." /></Field>
          <Field label="Description"><TextIn value={f.description} onChange={e => set("description", e.target.value)} placeholder="Ex : Resto samedi..." /></Field>
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Date limite (optionnel)"><TextIn type="date" value={f.due_date} onChange={e => set("due_date", e.target.value)} /></Field>
          <Btn onClick={submitDebt}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "settle"} onClose={close} title="Régler le remboursement">
          {editing && <div style={{ background: C.surface2, borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13 }}><b>{editing.dir === "in" ? "On me doit " : "Je dois "}{fmtEUR(editing.amount)}</b> — {editing.person}{editing.description ? ` (${editing.description})` : ""}</div>}
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>Le remboursement passe simplement en « Réglé ». Aucun compte n'est modifié.</div>
          <Field label="Date"><TextIn type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
          <Btn onClick={confirmSettle}>Confirmer le règlement</Btn>
        </Modal>

        <Modal open={modal === "budget"} onClose={close} title={editing ? "Modifier le budget" : "Définir un budget"}>
          <Field label="Catégorie"><SelectIn value={f.category_id || ""} onChange={e => set("category_id", e.target.value)}>{expCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</SelectIn></Field>
          <Field label={`Budget mensuel (€) — ${monthLabel(ym)}`}><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Btn onClick={submitBudget}>Définir</Btn>
        </Modal>

        <Modal open={modal === "pocket"} onClose={close} title={editing ? "Modifier la poche" : "Nouvelle poche"}>
          <Field label="Emoji"><div style={{ display: "flex", gap: 8 }}><TextIn value={f.emoji} onChange={e => set("emoji", e.target.value)} maxLength={2} style={{ width: 70, flexShrink: 0, textAlign: "center", fontSize: 22 }} /><Btn kind="g" style={{ flex: 1 }} onClick={() => openEmoji("emoji")}>Choisir 🌞</Btn></div></Field>
          <Field label="Nom"><TextIn value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ex : Vacances Italie" /></Field>
          <Field label="Objectif (€)"><TextIn type="number" value={f.target} onChange={e => set("target", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Montant actuel (€)"><TextIn type="number" value={f.current} onChange={e => set("current", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Date limite (optionnel)"><TextIn type="date" value={f.deadline} onChange={e => set("deadline", e.target.value)} /></Field>
          <Btn onClick={submitPocket}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "pocketAct"} onClose={close} title={editing ? `${f.action === "dep" ? "Alimenter" : "Retirer de"} ${editing.icon || "🎯"} ${editing.name}` : ""}>
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Btn onClick={submitPocketAct}>{f.action === "dep" ? "Déposer" : "Retirer"}</Btn>
        </Modal>

        <Modal open={modal === "pea"} onClose={close} title={editing ? "Modifier la position" : "Ajouter une position"}>
          <Field label="Nom"><TextIn value={f.label} onChange={e => set("label", e.target.value)} placeholder="Ex : LVMH, Airbus..." /></Field>
          <Field label="Ticker (optionnel)"><TextIn value={f.ticker} onChange={e => set("ticker", e.target.value)} placeholder="MC.PA, AIR.PA, AAPL..." /></Field>
          <Field label="Quantité"><TextIn type="number" value={f.qty} onChange={e => set("qty", e.target.value)} placeholder="0" /></Field>
          <Field label="Prix de revient unitaire (€)"><TextIn type="number" value={f.buy} onChange={e => set("buy", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Cours actuel (€)"><TextIn type="number" value={f.cur} onChange={e => set("cur", e.target.value)} placeholder="= PRU si vide" /></Field>
          <Btn onClick={submitPea}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "account"} onClose={close} title={editing ? "Modifier le compte" : "Nouveau compte"}>
          <Field label="Nom"><TextIn value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ex : Compte courant BNP" /></Field>
          <Field label="Solde (€)"><TextIn type="number" value={f.balance} onChange={e => set("balance", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Nature du compte">
            <SelectIn value={f.nature || "liquidite"} onChange={e => set("nature", e.target.value)}>
              <option value="liquidite">Liquidité — compte courant, livret</option>
              <option value="investissement">Investissement — PEA, CTO, assurance-vie</option>
              <option value="pro">Pro — compte de ton entreprise (encaissements = CA)</option>
            </SelectIn>
          </Field>
          <Btn onClick={submitAccount}>Enregistrer</Btn>
          {editing && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => askDeleteAccount(editing)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 12.5, fontWeight: 600, color: C.red, textDecoration: "underline", textUnderlineOffset: 3 }}>
                Supprimer ce compte
              </button>
            </div>
          )}
        </Modal>

        <Modal open={modal === "employer"} onClose={close} title={editing ? "Modifier l'employeur" : "Nouvel employeur"}>
          <Field label="Nom"><TextIn value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ex : Club de foot, Cabinet X" /></Field>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Les salaires marqués à cet employeur sont détaillés séparément dans le bilan, et additionnés au total professionnel.
          </div>
          <Btn onClick={submitEmployer}>Enregistrer</Btn>
        </Modal>

        {/* Suppression de compte : irréversible, donc on montre l'impact réel
            et on propose l'archivage comme issue non destructive. */}
        <Modal open={modal === "delAccount"} onClose={() => { setDelAcc(null); setModal("account"); }} title="Supprimer le compte">
          {delAcc && (() => {
            const { account: a, impact: im } = delAcc;
            const destroys = im.tx + im.rec;
            const Line = ({ n, label, danger }) => n === 0 ? null : (
              <li style={{ fontSize: 13, lineHeight: 1.7, color: danger ? C.red : C.muted }}>
                <b style={{ fontFamily: MONO, color: danger ? C.red : C.text }}>{n}</b> {label}
              </li>
            );
            const ok = delConfirm.trim() === a.name;
            return (<>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: a.color || C.accent }} />
                <div style={{ flex: 1, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontFamily: MONO, fontWeight: 700, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</div>
              </div>

              {destroys + im.txIn + im.detached === 0 ? (
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
                  Ce compte n'a aucune opération rattachée. Sa suppression n'affecte rien d'autre.
                </div>
              ) : (
                <div style={{ background: `${C.red}14`, border: `1px solid ${C.red}44`, borderRadius: 11, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                    Ce que la suppression détruit
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    <Line n={im.tx} label="opérations définitivement supprimées" danger />
                    <Line n={im.rec} label="récurrences définitivement supprimées" danger />
                    <Line n={im.txIn} label="virements entrants supprimés — leur montant est rendu au compte source" />
                    <Line n={im.detached} label="éléments simplement détachés (abonnements, poches, positions)" />
                  </ul>
                </div>
              )}

              {im.partial && (
                <div style={{ fontSize: 12.5, color: C.amber, lineHeight: 1.6, marginBottom: 14,
                  background: `${C.amber}14`, border: `1px solid ${C.amber}44`, borderRadius: 10, padding: "10px 12px" }}>
                  Le décompte ci-dessus est incomplet : une partie des données n'a pas pu être lue.
                  Archive plutôt, ou réessaie une fois la connexion rétablie.
                </div>
              )}
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
                Il n'y a ni corbeille ni annulation. <b style={{ color: C.text }}>Archiver</b> retire le compte des listes
                et des totaux sans rien effacer — c'est réversible en base, contrairement à la suppression.
              </div>

              <Btn kind="g" style={{ width: "100%", marginBottom: 14 }} onClick={doArchiveAccount}>Archiver plutôt</Btn>

              <Field label={`Pour confirmer, tape le nom du compte : ${a.name}`}>
                <TextIn value={delConfirm} onChange={e => setDelConfirm(e.target.value)} placeholder={a.name} autoFocus />
              </Field>
              <button onClick={ok && !delBusy ? doDeleteAccount : undefined} disabled={!ok || delBusy}
                style={{ width: "100%", padding: 13, borderRadius: 11, border: "none", fontFamily: "inherit",
                  fontSize: 14, fontWeight: 700, color: "#fff", background: C.red,
                  opacity: ok && !delBusy ? 1 : 0.4, cursor: ok && !delBusy ? "pointer" : "not-allowed" }}>
                {delBusy ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </>);
          })()}
        </Modal>

        <Modal open={modal === "cat"} onClose={close} title={editing ? "Modifier la catégorie" : "Nouvelle catégorie"}>
          <Field label="Type"><SelectIn value={f.kind} onChange={e => set("kind", e.target.value)}><option value="depense">Dépense</option><option value="revenu">Revenu</option><option value="transfert">Transfert (intercompte)</option><option value="aide">Type d'aide sociale</option></SelectIn></Field>
          <Field label="Emoji"><div style={{ display: "flex", gap: 8 }}><TextIn value={f.emoji} onChange={e => set("emoji", e.target.value)} maxLength={2} style={{ width: 70, flexShrink: 0, textAlign: "center", fontSize: 22 }} /><Btn kind="g" style={{ flex: 1 }} onClick={() => openEmoji("emoji")}>Choisir 🌞</Btn></div></Field>
          <Field label="Nom"><TextIn value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ex : Sport, Cadeaux..." /></Field>
          <Field label="Couleur"><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{COLORS.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 7, cursor: "pointer", background: c, border: `2px solid ${f.color === c ? "#fff" : "transparent"}`, transform: f.color === c ? "scale(1.15)" : "none" }} />)}</div></Field>
          <Btn onClick={submitCat}>Créer</Btn>
        </Modal>

        <Modal open={modal === "emoji"} onClose={close} title="Choisir un emoji" wide>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {Object.entries(ESETS).map(([sec, emojis]) => (
              <div key={sec}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".08em", padding: "8px 2px 4px" }}>{sec}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 3 }}>
                  {emojis.map((e, i) => <div key={i} onClick={() => { set(emojiTarget, e); setModal(emojiBack); }} style={{ fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", height: 38, borderRadius: 7 }}>{e}</div>)}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      </>
    );
  }
}

// ─── Petits composants/styles partagés ────────────────────────────────────────
const monthBtnSt = { width: 30, height: 30, border: `1px solid ${C.border}`, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" };
const txRowSt = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}` };
const txIconSt = { width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 };
const tblSt = { width: "100%", borderCollapse: "collapse" };
const thSt = { fontSize: 11, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: ".08em", padding: "13px 14px", borderBottom: `1px solid ${C.border}` };
const tdSt = { padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 13, verticalAlign: "middle" };
const bilRowSt = { display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${C.border}` };
const badgeSt = (color) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: (color || C.muted) + "22", color: color || C.muted });
const chipSt = (on) => ({ padding: "6px 14px", borderRadius: 99, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.accentBg : C.surface, color: on ? C.accent : C.muted, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" });

function Stat({ label, value, c }) {
  return <div style={statSt}><div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div><div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: c || C.text }}>{value}</div></div>;
}
function AlertBox({ c, children }) {
  return <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, display: "flex", alignItems: "center", gap: 8, background: c + "1F", border: `1px solid ${c}55` }}>{children}</div>;
}
function Empty({ icon, text }) {
  return <div style={{ textAlign: "center", padding: "40px 20px", color: C.faint }}><div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div><div style={{ fontSize: 13 }}>{text}</div></div>;
}
function Progress({ pct, color, h = 5 }) {
  return <div style={{ background: C.surface3, borderRadius: 99, overflow: "hidden", height: h }}><div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: color, transition: "width .5s" }} /></div>;
}
function Tabs({ tabs, value, onChange }) {
  return <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>{tabs.map(([k, l]) => <div key={k} onClick={() => onChange(k)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: value === k ? C.accent : C.muted, cursor: "pointer", borderBottom: `2px solid ${value === k ? C.accent : "transparent"}`, marginBottom: -1 }}>{l}</div>)}</div>;
}
function RowActions({ children }) {
  return <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>{children}</div>;
}
function rowBtn(label, onClick, color) {
  return <button onClick={onClick} style={{ padding: "4px 9px", background: (color || C.accent) + "1F", color: color || C.accent, border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>;
}
function PktBtn({ children, onClick, c }) {
  return <button onClick={onClick} style={{ flex: 1, padding: 9, borderRadius: 8, border: `1px solid ${c || C.border}`, background: c ? c + "1F" : C.surface2, color: c || C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>;
}
