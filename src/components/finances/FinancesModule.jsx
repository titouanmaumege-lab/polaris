import { useState, useMemo, useEffect } from "react";
import { useFinanceAccounts } from "./hooks/useFinanceAccounts";
import { useFinanceCategories } from "./hooks/useFinanceCategories";
import { useFinanceTransactions } from "./hooks/useFinanceTransactions";
import { useFinanceBudgets } from "./hooks/useFinanceBudgets";
import { useFinanceGoals } from "./hooks/useFinanceGoals";
import { useFinanceInvestments } from "./hooks/useFinanceInvestments";
import { useFinanceDebts } from "./hooks/useFinanceDebts";
import { useFinanceRecurring, advanceOccurrence } from "./hooks/useFinanceRecurring";
import { todayStr, monthKey } from "../../utils/date";
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

const UIFREQ = [["monthly","Mensuelle"],["weekly","Hebdomadaire"],["quarterly","Trimestrielle"],["yearly","Annuelle"]];
const FREQ_FR = { monthly:"Mensuelle", weekly:"Hebdomadaire", quarterly:"Trimestrielle", yearly:"Annuelle" };
const toFreq = (ui) => ui==="weekly" ? {freq:"semaine",interval:1} : ui==="quarterly" ? {freq:"mois",interval:3} : ui==="yearly" ? {freq:"annee",interval:1} : {freq:"mois",interval:1};
const fromFreq = (r) => r.freq==="semaine" ? "weekly" : r.freq==="annee" ? "yearly" : (r.freq==="mois" && r.interval===3) ? "quarterly" : "monthly";

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
  const [section, setSection] = useState("dash");
  const [ym, setYm] = useState(monthKey());
  const [toast, setToast] = useState("");
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };

  const acc = useFinanceAccounts(userId);
  const cat = useFinanceCategories(userId);
  const tx = useFinanceTransactions(userId);
  const bud = useFinanceBudgets(userId, ym);
  const goal = useFinanceGoals(userId);
  const inv = useFinanceInvestments(userId);
  const debt = useFinanceDebts(userId);
  const rec = useFinanceRecurring(userId);

  useEffect(() => { rec.runRecurringCatchup?.(); }, [rec.runRecurringCatchup]);

  const getCat = (id) => cat.categories.find(c => c.id === id) || { name: "—", icon: "📦", color: C.muted };
  const getAcc = (id) => acc.accounts.find(a => a.id === id);
  const expCats = cat.categories.filter(c => c.kind === "depense");
  const incCats = cat.categories.filter(c => c.kind === "revenu");

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const [yNum, mNum] = ym.split("-").map(Number);
  const monthTx = useMemo(() =>
    tx.transactions.filter(t => { const d = new Date(t.date); return d.getFullYear() === yNum && d.getMonth() + 1 === mNum; }),
    [tx.transactions, yNum, mNum]);
  const income = monthTx.filter(t => t.type === "revenu").reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === "depense").reduce((s, t) => s + t.amount, 0);
  const pocketsTotal = goal.goals.reduce((s, g) => s + g.current_amount, 0);
  const netWorth = acc.totalBalance + pocketsTotal + inv.totalMarketValue;

  const today0 = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const recDue = rec.recurring.filter(r => r.active && new Date(r.next_occurrence) <= new Date(today0.getTime() + 7 * 864e5));
  const recOverdue = recDue.filter(r => new Date(r.next_occurrence) < today0);
  const debtsPending = debt.debts.filter(d => d.status === "pending");

  // ── Modales (état générique) ────────────────────────────────────────────────
  const [modal, setModal] = useState(null);   // kind string | null
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

  // ── Ouvertures ──────────────────────────────────────────────────────────────
  const openTx = (t = null) => {
    setEditing(t);
    setF(t
      ? { type: t.type, amount: String(t.amount), note: t.note || "", category_id: t.category_id, account_id: t.account_id, transfer_account_id: t.transfer_account_id || null, date: t.date }
      : { type: "depense", amount: "", note: "", category_id: expCats[0]?.id || null, account_id: acc.accounts[0]?.id || null, transfer_account_id: acc.accounts[1]?.id || null, date: todayStr() });
    setModal("tx");
  };
  const openRec = (r = null) => {
    setEditing(r);
    setF(r
      ? { type: r.type, label: r.label, amount: String(r.amount), category_id: r.category_id, uifreq: fromFreq(r), next: r.next_occurrence, account_id: r.account_id }
      : { type: "depense", label: "", amount: "", category_id: expCats[0]?.id || null, uifreq: "monthly", next: todayStr(), account_id: acc.accounts[0]?.id || null });
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
    setF(a ? { name: a.name, balance: String(a.balance) } : { name: "", balance: "" });
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
      category_id: f.type === "transfert" ? null : f.category_id,
      type: f.type, amount, date: f.date, note: f.note,
    };
    if (editing) await tx.updateTransaction(editing.id, payload);
    else await tx.createTransaction(payload);
    close(); showToast(editing ? "Modifié" : "Opération ajoutée");
  };
  const submitRec = async () => {
    const amount = parseAmount(f.amount);
    if (!f.label?.trim()) return showToast("Nom requis");
    if (!amount || amount <= 0) return showToast("Montant invalide");
    const { freq, interval } = toFreq(f.uifreq);
    const payload = { label: f.label.trim(), type: f.type, amount, category_id: f.category_id, account_id: f.account_id, freq, interval, next_occurrence: f.next, is_subscription: false };
    if (editing) await rec.updateRecurring(editing.id, payload);
    else await rec.createRecurring(payload);
    close(); showToast(editing ? "Modifié" : "Récurrence créée");
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
    else await debt.createDebt(payload, f.account_id || null);
    close(); showToast(editing ? "Modifié" : "Ajouté");
  };
  const confirmSettle = async () => {
    await debt.settleDebt(editing, { accountId: f.account_id || null, date: f.date });
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
  const submitAccount = async () => {
    const bal = parseAmount(f.balance);
    if (!f.name?.trim()) return showToast("Nom requis");
    if (editing) {
      const delta = editing.balance - Number(editing.initial_balance);
      await acc.updateAccount(editing.id, { name: f.name.trim(), initial_balance: bal - delta });
    } else {
      await acc.createAccount({ name: f.name.trim(), initial_balance: bal, color: COLORS[acc.accounts.length % COLORS.length] });
    }
    close(); showToast(editing ? "Modifié" : "Compte ajouté");
  };
  const submitCat = async () => {
    if (!f.name?.trim()) return showToast("Nom requis");
    if (editing) await cat.updateCategory(editing.id, { name: f.name.trim(), kind: f.kind, color: f.color, icon: f.emoji });
    else await cat.createCategory({ name: f.name.trim(), kind: f.kind, color: f.color, icon: f.emoji });
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
        {section === "dash" && <Dash />}
        {section === "tx" && <TxView />}
        {section === "rec" && <RecView />}
        {section === "debts" && <DebtsView />}
        {section === "budget" && <BudgetView />}
        {section === "pockets" && <PocketsView />}
        {section === "pea" && <PeaView />}
        {section === "bilan" && <BilanView />}
        {section === "settings" && <SettingsView />}
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
    monthTx.filter(t => t.type === "depense").forEach(t => { if (t.category_id) byCat[t.category_id] = (byCat[t.category_id] || 0) + t.amount; });
    const cd = Object.entries(byCat).map(([id, v]) => ({ ...getCat(id), value: v })).sort((a, b) => b.value - a.value);
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
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700 }}>{fmtEUR(expense)}</div>
                <div style={{ fontSize: 11, color: C.muted }}>ce mois</div>
              </div>
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
              const meta = isT ? `${getAcc(t.account_id)?.name || "—"} → ${getAcc(t.transfer_account_id)?.name || "—"}` : c.name;
              return (
                <div key={t.id} style={txRowSt}>
                  <div style={{ ...txIconSt, background: col + "22" }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.note || (isT ? "Transfert" : c.name)}</div>
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
                      <td style={{ ...tdSt, fontWeight: 500 }}>{t.note || (isT ? "Transfert" : "—")}</td>
                      <td style={tdSt}>{isT ? <span style={badgeSt(C.accent)}>⇄ Transfert</span> : <span style={badgeSt(c.color)}>{c.icon} {c.name}</span>}</td>
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{isT ? `${a ? a.name : "—"} → ${dst ? dst.name : "—"}` : (a ? a.name : "—")}</td>
                      <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: isT ? C.muted : t.type === "revenu" ? C.green : C.text }}>{isT ? "" : t.type === "revenu" ? "+" : "-"}{fmtEUR(t.amount)}</td>
                      <td style={tdSt}><RowActions>{rowBtn("✏️", () => openTx(t))}{rowBtn("✕", () => { tx.deleteTransaction(t.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
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
        <PageHead title="Récurrences" sub="Dépenses & revenus récurrents" action={<Btn small onClick={() => openRec()}>+ Ajouter</Btn>} />
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
                      <td style={{ ...tdSt, color: C.muted, fontSize: 12 }}>{FREQ_FR[fromFreq(r)]}</td>
                      <td style={{ ...tdSt, fontSize: 12 }}>{nd.toLocaleDateString("fr-FR")} <span style={{ color: col }}>{dtxt}</span></td>
                      <td style={{ ...tdSt, fontFamily: MONO, fontWeight: 600, textAlign: "right", color: r.type === "revenu" ? C.green : C.text }}>{r.type === "revenu" ? "+" : "-"}{fmtEUR(r.amount)}</td>
                      <td style={tdSt}><RowActions>{rowBtn("✓ Payer", () => payRec(r), C.green)}{rowBtn("✏️", () => openRec(r))}{rowBtn(r.active ? "⏸" : "▶", () => rec.toggleActive(r))}{rowBtn("✕", () => { rec.deleteRecurring(r.id); showToast("Supprimé"); }, C.red)}</RowActions></td>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
          <div style={cardSt}>
            <div style={titleSt}>Comptes</div>
            {acc.accounts.map(a => (
              <div key={a.id} style={bilRowSt}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color || C.accent }} />
                <div style={{ flex: 1 }}>{a.name}</div>
                {rowBtn("✏️", () => openAccount(a))}
                <div style={{ fontFamily: MONO, fontWeight: 700, color: a.balance >= 0 ? C.green : C.red }}>{fmtEUR(a.balance)}</div>
              </div>
            ))}
            <Btn kind="g" small style={{ marginTop: 14 }} onClick={() => openAccount()}>+ Compte</Btn>
          </div>
          <div style={cardSt}>
            <div style={titleSt}>Poches</div>
            {!goal.goals.length ? <div style={{ color: C.faint, fontSize: 12 }}>Aucune poche</div> : <>
              {goal.goals.map(p => <div key={p.id} style={bilRowSt}><span>{p.icon || "🎯"}</span><div style={{ flex: 1 }}>{p.name}</div><div style={{ fontFamily: MONO, color: p.color || C.accent }}>{fmtEUR(p.current_amount)}</div></div>)}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${C.border}`, fontWeight: 700 }}><div>Total</div><div style={{ fontFamily: MONO, color: C.green }}>{fmtEUR(pocketsTotal)}</div></div>
            </>}
          </div>
          <div style={cardSt}>
            <div style={titleSt}>PEA</div>
            {!inv.investments.length ? <div style={{ color: C.faint, fontSize: 12 }}>Aucune position</div> : <>
              {inv.investments.map(p => <div key={p.id} style={bilRowSt}><span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{p.ticker || "?"}</span><div style={{ flex: 1 }}>{p.label}</div><div style={{ fontFamily: MONO, color: p.pnl >= 0 ? C.green : C.red }}>{fmtEUR(p.market_value)}</div></div>)}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: `1px solid ${C.border}`, fontWeight: 700 }}><div>Total</div><div style={{ fontFamily: MONO, color: C.green }}>{fmtEUR(inv.totalMarketValue)}</div></div>
            </>}
          </div>
        </div>
      </>
    );
  }

  function SettingsView() {
    const renderCats = (kind) => cat.categories.filter(c => c.kind === kind).map(c => (
      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: c.color || C.muted }} />
        <span style={{ fontSize: 17 }}>{c.icon}</span>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{c.name}</div>
        <RowActions>{rowBtn("✏️", () => openCat(c))}{rowBtn("✕", () => { cat.archiveCategory(c.id); showToast("Supprimé"); }, C.red)}</RowActions>
      </div>
    ));
    return (
      <>
        <PageHead title="Paramètres" sub="Catégories personnalisées" action={<Btn small onClick={openCat}>+ Catégorie</Btn>} />
        <div style={cardSt}><div style={titleSt}>Dépenses</div>{renderCats("depense")}</div>
        <div style={{ ...cardSt, marginTop: 14 }}><div style={titleSt}>Revenus</div>{renderCats("revenu")}</div>
      </>
    );
  }

  // ════════ MODALES ════════
  function CatGrid({ kind, value, onPick }) {
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
        <Modal open={modal === "tx"} onClose={close} title={editing ? "Modifier l'opération" : "Nouvelle opération"}>
          <TypeToggle value={f.type} onChange={v => setF(p => ({ ...p, type: v, category_id: v === "transfert" ? null : (v === "revenu" ? incCats : expCats)[0]?.id || null, transfer_account_id: v === "transfert" ? (p.transfer_account_id && p.transfer_account_id !== p.account_id ? p.transfer_account_id : acc.accounts.find(a => a.id !== p.account_id)?.id || null) : p.transfer_account_id }))} options={[{ v: "depense", label: "💸 Dépense", c: C.red }, { v: "revenu", label: "💰 Revenu", c: C.green }, { v: "transfert", label: "⇄ Transfert", c: C.accent }]} />
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Description"><TextIn value={f.note} onChange={e => set("note", e.target.value)} placeholder={f.type === "transfert" ? "Ex : Vers épargne" : "Ex : Courses Monoprix"} /></Field>
          {f.type === "transfert" ? (
            <>
              <Field label="Compte source"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
              <Field label="Compte destination"><SelectIn value={f.transfer_account_id || ""} onChange={e => set("transfer_account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
            </>
          ) : (
            <>
              <Field label="Catégorie"><CatGrid kind={f.type} value={f.category_id} onPick={id => set("category_id", id)} /></Field>
              <Field label="Compte"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
            </>
          )}
          <Field label="Date"><TextIn type="date" value={f.date} onChange={e => set("date", e.target.value)} /></Field>
          <Btn onClick={submitTx}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "rec"} onClose={close} title={editing ? "Modifier la récurrence" : "Nouvelle récurrence"}>
          <TypeToggle value={f.type} onChange={v => setF(p => ({ ...p, type: v, category_id: (v === "revenu" ? incCats : expCats)[0]?.id || null }))} options={[{ v: "depense", label: "💸 Dépense", c: C.red }, { v: "revenu", label: "💰 Revenu", c: C.green }]} />
          <Field label="Nom"><TextIn value={f.label} onChange={e => set("label", e.target.value)} placeholder="Ex : Loyer, Netflix..." /></Field>
          <Field label="Montant (€)"><TextIn type="number" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Catégorie"><CatGrid kind={f.type} value={f.category_id} onPick={id => set("category_id", id)} /></Field>
          <Field label="Fréquence"><SelectIn value={f.uifreq} onChange={e => set("uifreq", e.target.value)}>{UIFREQ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectIn></Field>
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
          {!editing && <Field label="Impacter un compte maintenant (optionnel)"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}><option value="">Aucun</option>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>}
          <Btn onClick={submitDebt}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "settle"} onClose={close} title="Régler le remboursement">
          {editing && <div style={{ background: C.surface2, borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13 }}><b>{editing.dir === "in" ? "On me doit " : "Je dois "}{fmtEUR(editing.amount)}</b> — {editing.person}{editing.description ? ` (${editing.description})` : ""}</div>}
          <Field label="Compte à impacter"><SelectIn value={f.account_id || ""} onChange={e => set("account_id", e.target.value)}><option value="">Aucun (ne pas créer de transaction)</option>{acc.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectIn></Field>
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
          <Btn onClick={submitAccount}>Enregistrer</Btn>
        </Modal>

        <Modal open={modal === "cat"} onClose={close} title={editing ? "Modifier la catégorie" : "Nouvelle catégorie"}>
          <Field label="Type"><SelectIn value={f.kind} onChange={e => set("kind", e.target.value)}><option value="depense">Dépense</option><option value="revenu">Revenu</option></SelectIn></Field>
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
