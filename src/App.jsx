import { useState, useRef, useEffect, useCallback } from "react";
import { syncToSupabase } from "./supabase";
import BaseModule from "./components/knowledge/BaseModule";
import FinancesModule from "./components/finances/FinancesModule";
import PolarisLogo from "./PolarisLogo";
import { pad, todayStr } from "./utils/date";
import { uid } from "./utils/id";

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
const getLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
let _userId = null;
let _syncTimer = null;
let _onSyncStatus = null;
const setLS = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (_userId) {
    _onSyncStatus?.("saving");
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      syncToSupabase(_userId)
        .then(() => { _onSyncStatus?.("ok"); setTimeout(() => _onSyncStatus?.(null), 2000); })
        .catch(() => { _onSyncStatus?.("error"); });
    }, 1500);
  }
};
const weekDates = () => {
  const d = new Date(), day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return Array.from({ length: 7 }, (_, i) => { const dt = new Date(d); dt.setDate(d.getDate() - day + i); return dt.toISOString().split("T")[0]; });
};
const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
const weekStart = dateStr => {
  const d = new Date(dateStr + "T12:00:00");
  const off = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const mon = new Date(d); mon.setDate(d.getDate() - off);
  return mon.toISOString().split("T")[0];
};
const weekEnd = dateStr => {
  const d = new Date(weekStart(dateStr) + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
};
const isWeekLocked = wkStart => new Date() > new Date(weekEnd(wkStart) + "T23:59:59");
const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const monthDates = (y, m) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => new Date(y, m, i + 1).toISOString().split("T")[0]);
const fmtDate = s => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const clamp = (v, mn, mx) => Math.min(Math.max(v, mn), mx);
const pct = (start, cur, target) => {
  if (target === start) return cur >= target ? 100 : 0;
  return Math.round(clamp((cur - start) / (target - start) * 100, 0, 100));
};
// % d'un Key Result (gère sens croissant ET décroissant)
const krPct = kr => pct(kr.depart ?? 0, kr.actuelle ?? kr.depart ?? 0, kr.cible ?? 0);
// % global d'un objectif : moyenne des KR + bonus complétion (jusqu'à +15 si tous finis)
const KR_BONUS_MAX = 15;
const krsProgress = krs => {
  if (!krs || !krs.length) return null;
  const avg = krs.reduce((s, k) => s + krPct(k), 0) / krs.length;
  const completedFrac = krs.filter(k => krPct(k) >= 100).length / krs.length;
  return Math.round(clamp(avg + completedFrac * KR_BONUS_MAX, 0, 100));
};

// ── Période & clôture des OKR ──
const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const QUARTERS_FR = [["T1","Jan–Mar"],["T2","Avr–Juin"],["T3","Juil–Sep"],["T4","Oct–Déc"]];
const periodeTypeForLevel = lvl => lvl === "mensuel" ? "month" : lvl === "trimestriel" ? "quarter" : lvl === "annuel" ? "year" : null;
const lastDayOfMonth = (y, m) => { const d = new Date(y, m + 1, 0); return `${y}-${String(m + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const computeCloture = periode => {
  if (!periode) return "";
  if (periode.type === "month")   return lastDayOfMonth(periode.year, periode.month);
  if (periode.type === "quarter") return lastDayOfMonth(periode.year, periode.quarter * 3 + 2);
  if (periode.type === "year")    return `${periode.year}-12-31`;
  return "";
};
const periodeLabel = periode => {
  if (!periode) return "";
  if (periode.type === "month")   return `${MONTHS_FR[periode.month]} ${periode.year}`;
  if (periode.type === "quarter") return `${QUARTERS_FR[periode.quarter][0]} ${periode.year}`;
  if (periode.type === "year")    return `${periode.year}`;
  return "";
};
const defaultPeriode = lvl => {
  const t = periodeTypeForLevel(lvl); if (!t) return null;
  const now = new Date();
  return { type: t, year: now.getFullYear(), month: now.getMonth(), quarter: Math.floor(now.getMonth() / 3) };
};
const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, "0") : ""}` : m > 0 ? `${m}min` : "—";
const fmtHM = m => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
const formatElapsed = ms => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};
function useElapsedTimer(startTime) {
  const [elapsed, setElapsed] = useState(startTime ? Date.now() - startTime : 0);
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    setElapsed(Date.now() - startTime);
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}
function useElapsedWithPause(session) {
  const [elapsed, setElapsed] = useState(0);
  const startTime = session?.startTime;
  const pausedAt  = session?.pausedAt ?? null;
  const totalPausedMs = session?.totalPausedMs ?? 0;
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const calc = () => Math.max(0, (pausedAt || Date.now()) - startTime - totalPausedMs);
    setElapsed(calc());
    if (pausedAt) return;
    const id = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(id);
  }, [startTime, pausedAt, totalPausedMs]);
  return elapsed;
}
const LS_SESSION_KEY = 'LE_PLAN_ACTIVE_SESSION';
const _perso0 = getLS("lp_personalization", {});
const _D_DOMAINES = ["BUSINESS","MASTER","PRÉPA","STAGE","MÉMOIRE","FORMATIONS PP","PROJET PERSO","PERSO","CLIENT","OPTIMISATION","AUTRE"];
const _D_WP_TYPES = ["DEEP","SHALLOW","COURS","GROUPE"];
const _D_DJ_TYPES = ["Journée classique","Journée libre","Weekend","Voyage","Jour off","Jour spécial"];
const _D_SPHERES  = { business:{label:"💸 Business",c:"#8b5cf6"}, master:{label:"📚 Master",c:"#3b82f6"}, sport:{label:"⚡ Sport",c:"#10b981"}, perso:{label:"👁 Perso",c:"#f59e0b"}, pro:{label:"🧑‍💻 Pro",c:"#ec4899"} };
let WP_CATEGORIES = _perso0.domaines || _D_DOMAINES;
function getISOWeekId(date = new Date()) {
  const d = new Date(date); d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2,'0')}`;
}
function getNextWeekId(weekId) {
  const [y,w]=weekId.split('-W').map(Number);
  const jan4=new Date(y,0,4);
  const startOfW1=new Date(jan4);
  startOfW1.setDate(jan4.getDate()-(jan4.getDay()+6)%7);
  const ms=startOfW1.getTime()+(w-1)*7*86400000+7*86400000;
  return getISOWeekId(new Date(ms));
}
const habitValidated = (h, date) => {
  if (h.dailyStatus) return h.dailyStatus[date] === 'validated';
  return (h.logs || []).includes(date);
};
const calcStreak = habits => {
  if (!habits.length) return 0;
  const t = todayStr(); let streak = 0;
  const d = new Date();
  if (!habits.every(h => habitValidated(h, t))) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().split("T")[0];
    if (!habits.every(h => habitValidated(h, ds))) break;
    streak++; d.setDate(d.getDate() - 1);
  }
  return streak;
};
function cycleHabitStatus(current) {
  if (current === null || current === undefined) return 'validated';
  if (current === 'validated') return 'invalidated';
  return null;
}
function HabitToggle({ status, onToggle }) {
  const cfg = status === 'validated'
    ? { bg: '#10b981', border: '#10b981', icon: '✓', glow: '0 0 16px rgba(16,185,129,0.5)', cls: 'habit-pulse' }
    : status === 'invalidated'
    ? { bg: '#ef4444', border: '#ef4444', icon: '✕', glow: '0 0 16px rgba(239,68,68,0.5)', cls: 'habit-shake' }
    : { bg: 'transparent', border: 'rgba(139,92,246,0.4)', icon: null, glow: 'none', cls: '' };
  return (
    <button onClick={e=>{e.stopPropagation();onToggle();}} className={cfg.cls}
      style={{ width:36,height:36,borderRadius:'50%',background:cfg.bg,border:`2px solid ${cfg.border}`,boxShadow:cfg.glow,
        color:'#fff',fontWeight:700,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',
        transition:'all 0.25s cubic-bezier(0.4,0,0.2,1)',cursor:'pointer',flexShrink:0 }}>
      {cfg.icon}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0d1a", surface: "#12112a", surface2: "#1a1830", surface3: "#201e38",
  border: "rgba(139,92,246,0.15)", borderMid: "rgba(139,92,246,0.4)",
  accent: "#8b5cf6", accent2: "#6366f1", accentBg: "rgba(139,92,246,0.12)",
  text: "#f1f0ff", muted: "#9391b5", faint: "#524f72",
  green: "#10b981", greenBg: "rgba(16,185,129,0.12)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.12)",
  blue: "#6366f1", blueBg: "rgba(99,102,241,0.12)",
  purple: "#8b5cf6", purpleBg: "rgba(139,92,246,0.12)",
  amber: "#f59e0b", amberBg: "rgba(245,158,11,0.12)",
  orange: "#f97316", pink: "#f472b6",
};
const GRAD = "linear-gradient(135deg, #8b5cf6, #6366f1)";
const GLOW = "0 0 24px rgba(139,92,246,0.35)";
const GLOW_SM = "0 0 12px rgba(139,92,246,0.2)";
const TR = "0.18s cubic-bezier(0.4,0,0.2,1)";

const SPACES = {
  "Sport & Santé": { c: C.green,  icon: "⚡" },
  "Business":      { c: C.blue,   icon: "💼" },
  "Etudes et Pro": { c: C.orange, icon: "📚" },
  "Relations":     { c: C.purple, icon: "🤝" },
};
const STATUTS = {
  "Dans les blocs": { c: C.faint,  label: "À planifier" },
  "Pas commencé":   { c: C.faint,  label: "Pas commencé" },
  "En cours":       { c: C.blue,   label: "En cours" },
  "On-track":       { c: C.green,  label: "On track" },
  "On track":       { c: C.green,  label: "On track" },
  "Off-track":      { c: C.amber,  label: "Off track" },
  "Off track":      { c: C.amber,  label: "Off track" },
  "At-risk":        { c: C.orange, label: "At risk" },
  "At risk":        { c: C.orange, label: "At risk" },
  "Partiel":        { c: C.purple, label: "Partiel" },
  "Terminé":        { c: C.green,  label: "Terminé" },
  "Échoué":         { c: C.red,    label: "Échoué" },
  "Echoué":         { c: C.red,    label: "Échoué" },
  // Statuts objectifs (DA 2026)
  "Ça arrive":      { c: C.faint,  label: "Ça arrive" },
  "C'est chaud":    { c: C.purple, label: "C'est chaud" },
  "Atteint":        { c: C.green,  label: "Atteint" },
  "Abandonné":      { c: C.red,    label: "Abandonné" },
};
// Jeu de statuts pour les objectifs (toutes temporalités) — ordre + icône + couleur
const OBJ_STATUSES = [
  { k: "Ça arrive",   c: C.faint,  icon: "💤" },
  { k: "En cours",    c: C.blue,   icon: "🚀" },
  { k: "C'est chaud", c: C.purple, icon: "🔥" },
  { k: "Atteint",     c: C.green,  icon: "🏆" },
  { k: "Échoué",      c: C.red,    icon: "💥" },
  { k: "Abandonné",   c: C.red,    icon: "🏳️" },
];
const OBJ_CLOSED = ["Terminé", "Atteint", "Échoué", "Echoué", "Abandonné"];
const isObjClosed   = s => OBJ_CLOSED.includes(s);
const isObjAchieved = s => s === "Atteint" || s === "Terminé";
// Migration anciens statuts → nouveau jeu
const STATUS_MIGRATE = {
  "Dans les blocs":"Ça arrive", "Pas commencé":"Ça arrive",
  "On-track":"En cours", "On track":"En cours", "Partiel":"En cours",
  "Off-track":"C'est chaud", "Off track":"C'est chaud", "At-risk":"C'est chaud", "At risk":"C'est chaud",
  "Terminé":"Atteint", "Echoué":"Échoué",
};
const normObjStatus = s => OBJ_STATUSES.find(o => o.k === s) ? s : (STATUS_MIGRATE[s] || "Ça arrive");

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────
const NOTION_GOALS = {
  lt: [
    { id: "n_lt1", titre: "Bâtir une esthétique inspirante et des capacités impressionnantes", statut: "En cours", spaces: ["Sport & Santé"], krs: [] },
    { id: "n_lt2", titre: "Construire ma réalité grâce à une liberté financière", statut: "En cours", spaces: ["Business"], krs: [] },
    { id: "n_lt3", titre: "Un des meilleurs PP de France", statut: "En cours", spaces: ["Etudes et Pro"], krs: [] },
  ],
  annuel: [
    { id: "n_a1", titre: "Prêt pour l'été avec shape et cardio de fou", statut: "En cours", spaces: ["Sport & Santé"], krs: [] },
    { id: "n_a2", titre: "Avoir construit les 2èmes fondations de mon Business", statut: "En cours", spaces: ["Business"], krs: [] },
    { id: "n_a3", titre: "Etre prêt à intégrer un projet club (structure amateur reconnue)", statut: "En cours", spaces: ["Etudes et Pro"], krs: [] },
  ],
  trimestriel: [
    { id: "n_t1", titre: "Sécuriser mes emplois (PP + Coach)", statut: "On-track", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_t2", titre: "Valider le Master", statut: "On-track", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_t3", titre: "Le prime avant juillet", statut: "On-track", spaces: ["Sport & Santé"], krs: [] },
    { id: "n_t4", titre: "Créer et diffuser l'offre Pré-Saison Football", statut: "On-track", spaces: ["Business"], krs: [] },
  ],
  mensuel: [
    { id: "n_m1", titre: "2 rendus + Stats mémoire finies", statut: "On-track", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m2", titre: "Décision géographique + prospection clubs lancée", statut: "On-track", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m3", titre: "20 pages mémoire rédigées", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m4", titre: "Matières du Master validées à 100%", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m5", titre: "Logement post-22 juin trouvé", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m6", titre: "Réponse positive d'un club", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m7", titre: "Club rémunéré signé et confirmé", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m8", titre: "Déménagement organisé et logistique réglée", statut: "Dans les blocs", spaces: ["Etudes et Pro"], krs: [] },
    { id: "n_m9", titre: "Premier client joueur payant", statut: "Dans les blocs", spaces: ["Business"], krs: [] },
    { id: "n_m10", titre: "Acquisition de 3 joueurs individuel lancée", statut: "Dans les blocs", spaces: ["Business"], krs: [] },
  ],
  hebdo: [
    { id: "n_h1", titre: "Prog Max et Harris", statut: "On track", spaces: [], krs: [], avec: "Solo" },
    { id: "n_h2", titre: "Décision Géographique - Prospection", statut: "On track", spaces: [], krs: [], avec: "Solo" },
    { id: "n_h3", titre: "Finir Prog Annuelle + Etude de cas L.MARIN", statut: "On track", spaces: [], krs: [], avec: "Solo" },
    { id: "n_h4", titre: "4 salles - 2 courses - Surplus moyen entre 5 et 10%", statut: "On track", spaces: [], krs: [], avec: "Solo" },
  ],
};
(function seedGoals() {
  const stored = getLS("lp_goals", null);
  const hasLT = stored && Array.isArray(stored.lt) && stored.lt.length > 0;
  if (!stored || !hasLT) setLS("lp_goals", NOTION_GOALS);
})();

const LEVELS = [
  { id: "lt",          label: "Long Terme",   icon: "👁️", c: C.purple },
  { id: "annuel",      label: "Annuel",       icon: "🌌", c: C.blue },
  { id: "trimestriel", label: "Trimestriel",  icon: "🌍", c: C.green },
  { id: "mensuel",     label: "Mensuel",      icon: "🗻", c: C.amber },
];
const LEVEL_PARENT = { annuel:"lt", trimestriel:"annuel", mensuel:"trimestriel" };
const LEVEL_CHILD  = { lt:"annuel", annuel:"trimestriel", trimestriel:"mensuel" };
const STATUS_OPTIONS_BASE = OBJ_STATUSES.map(s => s.k);

let WP_TYPES     = _perso0.wpTypes  || _D_WP_TYPES;
let WP_DOMAINES  = _perso0.domaines || _D_DOMAINES;
const WP_EFFICIENCE= ["💡","💡💡","💡💡💡","💡💡💡💡","💡💡💡💡💡"];
const WP_TYPE_C    = { DEEP: C.purple, SHALLOW: C.blue, COURS: C.amber, GROUPE: C.green };

const DJ_ENERGY  = ["⚡","⚡⚡","⚡⚡⚡","⚡⚡⚡⚡","⚡⚡⚡⚡⚡"];
const DJ_FOCUS   = ["❖","❖❖","❖❖❖","❖❖❖❖","❖❖❖❖❖"];
const DJ_STRESS  = ["✶","✶✶","✶✶✶","✶✶✶✶","✶✶✶✶✶"];
const DJ_HAPPY   = ["☺","☺☺","☺☺☺","☺☺☺☺","☺☺☺☺☺"];
let DJ_TYPES   = _perso0.djTypes  || _D_DJ_TYPES;
const DJ_EMPTY   = () => ({ morning:"",noon:"",evening:"",focus:"",stress:"",happy:"",type:"Journée classique",remark:"",win:"",loss:"",ameliorer:"",customItems:[] });
const djEntry    = raw => !raw ? DJ_EMPTY() : typeof raw === "string" ? { ...DJ_EMPTY(), reflexions: raw } : { ...DJ_EMPTY(), ...raw };
const ITEM_COLORS = ["#10b981","#ef4444","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316"];

const QUICK_ADDS = [
  { label: "💼 Business", prefix: "Business — " },
  { label: "📚 Master",   prefix: "Master — " },
  { label: "⚽ Prépa",    prefix: "Prépa — " },
  { label: "🏋️ Sport",   prefix: "Sport — " },
  { label: "🧘 Perso",   prefix: "Perso — " },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function CircularProgress({ value, max, size = 52, strokeWidth = 4, color = C.accent }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const filled = max === 0 ? 0 : clamp(value / max, 0, 1);
  const offset = circ * (1 - filled);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-ring-track)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>
        {value}/{max}
      </div>
    </div>
  );
}

const Pill = ({ label, color }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "3px 10px",
    borderRadius: 999, fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
    background: color + "20", color, border: `1px solid ${color}35`,
  }}>{label}</span>
);
const StatusPill = ({ statut }) => { const s = STATUTS[statut] || { c: C.muted, label: statut }; return <Pill label={s.label} color={s.c} />; };
const SpacePill  = ({ space })  => { const sp = SPACES[space] || { c: C.muted, icon: "•" }; return <Pill label={`${sp.icon} ${space}`} color={sp.c} />; };

const ProgressBar = ({ value, color, height = 6 }) => (
  <div style={{ height, background: "rgba(139,92,246,0.1)", borderRadius: height }}>
    <div style={{
      height: "100%", width: `${clamp(value, 0, 100)}%`,
      background: color ? `linear-gradient(90deg, ${color}99, ${color})` : GRAD,
      borderRadius: height, transition: "width 0.5s ease",
    }} />
  </div>
);

const Select = ({ value, options, onChange, style }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{
    background: "var(--c-surface-2)", border: `1px solid var(--c-border)`, color: "var(--c-text)",
    padding: "8px 10px", borderRadius: 10, fontSize: 13, fontFamily: "inherit",
    outline: "none", cursor: "pointer", ...style,
  }}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Input = ({ value, onChange, onKeyDown, placeholder, style, type = "text", autoFocus }) => (
  <input type={type} autoFocus={autoFocus}
    value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
    placeholder={placeholder}
    style={{
      background: "var(--c-surface-2)", border: `1px solid var(--c-border)`, color: "var(--c-text)",
      padding: "10px 14px", borderRadius: 12, fontSize: 14, fontFamily: "inherit",
      outline: "none", width: "100%", boxSizing: "border-box",
      minHeight: 44, transition: TR, ...style,
    }}
  />
);

const Btn = ({ children, onClick, variant = "default", style, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: "10px 18px", borderRadius: 12, fontSize: 13, fontFamily: "inherit",
    fontWeight: 600, transition: TR, border: "none", minHeight: 44,
    opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
    ...(variant === "accent"
      ? { background: "var(--c-grad)", color: "#fff", boxShadow: "var(--c-glow-sm)" }
      : variant === "ghost"
      ? { background: "transparent", color: "var(--c-accent)", border: `1px solid var(--c-border-mid)` }
      : { background: "var(--c-surface-2)", color: "var(--c-text)", border: `1px solid var(--c-border)` }),
    ...style,
  }}>{children}</button>
);

const Card = ({ children, style, onClick, className }) => (
  <div onClick={onClick} className={className} style={{
    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 18,
    padding: 16, ...(onClick ? { cursor: "pointer" } : {}), ...style,
  }}>{children}</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADER (non-dashboard pages)
// ─────────────────────────────────────────────────────────────────────────────
function PageHeader({ title, onBack, action }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "rgba(13,13,26,0.95)", backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {onBack && (
        <span onClick={onBack} style={{ cursor: "pointer", color: C.muted, fontSize: 22, lineHeight: 1 }}>←</span>
      )}
      <span style={{ fontSize: 17, fontWeight: 700, color: C.text, flex: 1 }}>{title}</span>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────────────────────────────────────
const BOTTOM_NAV = [
  { id: "dashboard", icon: "🏠", label: "Home" },
  { id: "todo",      icon: "✅", label: "Todo" },
  { id: "habitudes", icon: "🔥", label: "Habits" },
  { id: "workperf",  icon: "⏱️️", label: "Work" },
  { id: "daily",     icon: "📓", label: "Daily" },
  { id: "objectifs", icon: "⭐", label: "Goals" },
  { id: "base",      icon: "📚", label: "Base" },
  { id: "finances",  icon: "💰", label: "Finances" },
];

function BottomNav({ current, onNav, mobile, onPerso }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, zIndex: 50,
      ...(mobile ? { left:"50%", transform:"translateX(-50%)", width:390 } : { left:0, right:0 }),
      height: 64, background: "rgba(13,13,26,0.96)", backdropFilter: "blur(24px)",
      borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "stretch",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {BOTTOM_NAV.map(n => {
        const active = current === n.id;
        return (
          <div key={n.id} onClick={() => onNav(n.id)} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 2,
            cursor: "pointer", position: "relative", transition: TR,
            userSelect: "none",
          }}>
            {active && (
              <div style={{
                position: "absolute", top: 6, width: 20, height: 3,
                background: GRAD, borderRadius: 2,
                boxShadow: GLOW_SM,
              }} />
            )}
            <span style={{ fontSize: 16, lineHeight: 1, marginTop: 10 }}>{n.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: active ? 600 : 400,
              color: active ? C.accent : C.faint,
              letterSpacing: "0.01em",
            }}>{n.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function HabitChip({ habit, status, onToggle, animating }) {
  const done = status === 'validated';
  const inv  = status === 'invalidated';
  return (
    <div onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "13px 14px", marginBottom: 8, borderRadius: 14,
      background: done ? "rgba(52,211,153,0.12)" : inv ? "rgba(251,113,133,0.10)" : "var(--c-surface-2)",
      border: `1px solid ${done ? "rgba(52,211,153,0.35)" : inv ? "rgba(251,113,133,0.30)" : "var(--c-border)"}`,
      boxShadow: "var(--c-item-shadow)",
      cursor: "pointer", transition: TR, minHeight: 52,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0, opacity: done ? 0.5 : 1 }}>{habit.emoji}</span>
      <span style={{
        flex: 1, fontSize: 15, fontWeight: 500,
        color: done ? "var(--c-muted)" : inv ? "#ef4444" : "var(--c-text)",
        textDecoration: done ? "line-through" : "none",
        transition: TR,
      }}>{habit.name}</span>
      <div className={animating ? "habit-pop" : ""} style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: done ? "linear-gradient(135deg,#10b981,#059669)" : inv ? "#ef4444" : "transparent",
        border: `2px solid ${done ? "#10b981" : inv ? "#ef4444" : "var(--c-border-mid)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: done ? "0 0 12px rgba(16,185,129,0.4)" : inv ? "0 0 12px rgba(239,68,68,0.4)" : "none",
        transition: TR,
      }}>
        {done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
        {inv  && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✕</span>}
      </div>
    </div>
  );
}

// ── MonthCalendar ──
function MonthCalendar() {
  const {todos, getProjectsForCalendar, getMemosForDate} = useTodos();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [showMemos, setShowMemos]     = useState(true);
  const [showWaiting, setShowWaiting] = useState(true);
  const [showProjets, setShowProjets] = useState(true);

  const today = todayStr();
  const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const DAY_LABELS  = ["L","M","M","J","V","S","D"];

  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month+1, 0).getDate();
  const startDow = (firstDay.getDay()+6)%7; // Mon=0

  const dateStr = d => `${year}-${pad(month+1)}-${pad(d)}`;

  const prevMonth = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const nextMonth = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };
  const goToday   = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const projetsThisMonth = getProjectsForCalendar(month, year);

  const projBars = projetsThisMonth.map(p => {
    const s = new Date(p.dateDebut+"T12:00:00");
    const e = new Date(p.dateFin+"T12:00:00");
    const startD = s.getFullYear()===year&&s.getMonth()===month ? s.getDate() : 1;
    const endD   = e.getFullYear()===year&&e.getMonth()===month ? e.getDate() : totalDays;
    return {...p, startD, endD};
  });

  const monthFirst = `${year}-${pad(month+1)}-01`;
  const monthLast  = `${year}-${pad(month+1)}-${pad(new Date(year,month+1,0).getDate())}`;
  const recurByDate = {};
  todos.filter(t=>t.recurrence?.enabled&&!t.done).forEach(t => {
    getRecurOccurrences(t, monthFirst, monthLast).forEach(ds => {
      if (!recurByDate[ds]) recurByDate[ds] = [];
      recurByDate[ds].push(t);
    });
  });

  const cells = [];
  for(let i=0;i<startDow;i++) cells.push(null);
  for(let d=1;d<=totalDays;d++) cells.push(d);

  return (
    <div style={{background:C.surface2,borderRadius:18,border:`1px solid ${C.border}`,padding:16,marginTop:8}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <button onClick={prevMonth} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"4px 8px"}}>‹</button>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14,fontWeight:700,color:C.text}}>{MONTH_NAMES[month]} {year}</span>
          {(year!==now.getFullYear()||month!==now.getMonth())&&(
            <button onClick={goToday} style={{fontSize:10,color:C.accent,background:C.accentBg,border:`1px solid ${C.accent}44`,borderRadius:999,padding:"2px 8px",fontFamily:"inherit",cursor:"pointer"}}>Aujourd'hui</button>
          )}
        </div>
        <button onClick={nextMonth} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"4px 8px"}}>›</button>
      </div>

      {/* Filter toggles */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {[
          [showMemos,    setShowMemos,    "📅 Mémos",   "#6366f1"],
          [showWaiting,  setShowWaiting,  "⏳ Waiting", "#f59e0b"],
          [showProjets,  setShowProjets,  "🔴 Projets", C.red   ],
        ].map(([on,set,label,c])=>(
          <button key={label} onClick={()=>set(v=>!v)} style={{padding:"4px 10px",borderRadius:999,border:`1px solid ${on?c:C.border}`,background:on?c+"22":"transparent",color:on?c:C.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>{label}</button>
        ))}
      </div>

      {/* Day-of-week header */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
        {DAY_LABELS.map((d,i)=>(
          <div key={i} style={{textAlign:"center",fontSize:10,color:C.faint,padding:"2px 0"}}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          if(!d) return <div key={`e${i}`}/>;
          const ds = dateStr(d);
          const isToday = ds===today;
          const memos    = showMemos   ? getMemosForDate(ds) : [];
          const waiting  = showWaiting ? todos.filter(t=>t.gtd==="waiting"&&t.dateAssignee===ds&&!t.done&&!t.recurrence?.enabled) : [];
          const myProjets= showProjets ? projBars.filter(p=>p.startD<=d&&p.endD>=d) : [];
          const recurHere = recurByDate[ds] || [];
          const hasItems = memos.length||waiting.length||myProjets.length||recurHere.length;

          return (
            <div key={ds} style={{minHeight:36,borderRadius:8,padding:"3px 2px",background:isToday?"rgba(139,92,246,0.15)":hasItems?"rgba(255,255,255,0.03)":"transparent",border:isToday?`1px solid ${C.accent}55`:"1px solid transparent",position:"relative",textAlign:"center"}}>
              <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?C.accent:C.muted,marginBottom:2}}>{d}</div>
              {myProjets.map(p=>{
                const sc=SPHERES[p.sphere]?.c||C.accent;
                return <div key={p.id} style={{fontSize:8,background:sc+"33",color:sc,borderRadius:3,padding:"1px 3px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>;
              })}
              {memos.map(m=>(
                <div key={m.id} style={{fontSize:8,background:"#6366f133",color:"#6366f1",borderRadius:3,padding:"1px 3px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝</div>
              ))}
              {waiting.map(w=>(
                <div key={w.id} style={{fontSize:8,background:"#f59e0b33",color:"#f59e0b",borderRadius:3,padding:"1px 3px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>⏳</div>
              ))}
              {recurHere.map(r=>(
                <div key={r.id+ds} style={{fontSize:8,background:"rgba(139,92,246,0.2)",color:C.accent,borderRadius:3,padding:"1px 3px",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>🔄</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeeklyCalendar() {
  const { todos, addTodo, updateTodo, deleteTodo, toggleDone, toggleSousTache } = useTodos();
  const today = todayStr();
  const [offset, setOffset] = useState(0);
  const [editId, setEditId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [expandedSpan, setExpandedSpan] = useState(null);
  const [toast, setToast] = useState(null); // { id, name }
  const toastTimer = useRef(null);
  const editItem = editId ? todos.find(t => t.id === editId) : null;
  const closeModal = () => { setEditId(null); setEditMode(false); };
  const toggleSub = (todoId, stId) => {
    const tt = todos.find(x => x.id === todoId); if (!tt) return;
    updateTodo(todoId, { sousTaches: (tt.sousTaches || []).map(s => s.id === stId ? { ...s, done: !s.done } : s) });
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const markDone = it => {
    toggleDone(it.id);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: it.id, name: it.name });
    toastTimer.current = setTimeout(() => setToast(null), 10000);
  };
  const undoDone = () => {
    if (!toast) return;
    toggleDone(toast.id);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };

  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + offset * 7);

  const days7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
  const weekStart = days7[0], weekEnd = days7[6];

  const DAY_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  // ── Clôtures OKR de la semaine (depuis lp_goals) — DA spéciale combinée
  // Dates locales (évite le décalage UTC de toISOString utilisé par days7)
  const _pad2 = n => String(n).padStart(2, "0");
  const days7Local = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`; });
  const _goals = getLS("lp_goals", {});
  const closuresByCol = {};
  ["annuel","trimestriel","mensuel"].forEach(lvl => {
    (_goals[lvl] || []).forEach(o => {
      if (o.archived) return;
      const date = o.dateCloture || computeCloture(o.periode);
      if (!date) return;
      const ci = days7Local.indexOf(date);
      if (ci < 0) return;
      if (!closuresByCol[ci]) closuresByCol[ci] = { levels: new Set(), items: [] };
      closuresByCol[ci].levels.add(lvl);
      closuresByCol[ci].items.push(o);
    });
  });
  const closureCols = Object.keys(closuresByCol).map(Number);
  const CLOTURE_DA = {
    annee:     { ic:"🏁", label:"CLÔTURE ANNÉE",     sub:"Année · Trimestre · Mois", grad:"linear-gradient(100deg,#FBBF24,#F472B6,#A855F7)", c:"#FBBF24" },
    trimestre: { ic:"🎯", label:"CLÔTURE TRIMESTRE", sub:"Trimestre · Mois",          grad:"linear-gradient(100deg,#A855F7,#10b981)",         c:"#A855F7" },
    mois:      { ic:"🗻", label:"CLÔTURE MOIS",       sub:"Objectif mensuel",          grad:"linear-gradient(100deg,#F59E0B,#F97316)",         c:"#F59E0B" },
  };
  const closureKind = lv => lv.has("annuel") ? "annee" : lv.has("trimestriel") ? "trimestre" : "mois";

  const typeLabel = it => it.gtd === "projet" ? "Projet" : it.gtd === "memo" ? "Mémo" : it.recurrence?.enabled ? "Récurrent" : "Tâche";
  const colorOf = it => SPHERES[it.sphere]?.c || (it.gtd === "memo" ? "#4F46E5" : it.gtd === "projet" ? "#7C5CFC" : "#0EA0BD");

  // ── Rubans multi-jours : projets datés (dateDebut→dateFin) qui chevauchent la semaine
  // (ISO YYYY-MM-DD → comparaison lexicographique sûre)
  const spanItems = todos
    .filter(it => it.gtd === "projet" && it.dateDebut && it.dateFin && !it.done)
    .filter(it => it.dateFin >= weekStart && it.dateDebut <= weekEnd)
    .map(it => {
      let startCol = days7.findIndex(ds => ds >= it.dateDebut);   // 0-based, premier jour visible couvert
      if (startCol < 0) startCol = 0;
      let endCol = -1;
      for (let i = 6; i >= 0; i--) { if (days7[i] <= it.dateFin) { endCol = i; break; } }
      return {
        it, startCol, endCol,
        continuesLeft:  it.dateDebut < weekStart,
        continuesRight: it.dateFin   > weekEnd,
      };
    })
    .filter(s => s.endCol >= s.startCol)
    .sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);

  // packing greedy en lanes (pas de chevauchement horizontal sur une même lane)
  const lanes = [];
  spanItems.forEach(s => {
    let lane = lanes.findIndex(rows => rows.every(r => s.endCol < r.startCol || s.startCol > r.endCol));
    if (lane < 0) { lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push(s);
    s.lane = lane;
  });
  const laneCount = lanes.length;

  // ── Tâches simples par jour : non-projet daté (dateAssignee) + récurrences
  const dayTasks = Object.fromEntries(days7.map(ds => [ds, []]));
  todos.forEach(it => {
    if (it.done || it.gtd === "projet" || it.recurrence?.enabled) return;
    if (it.dateAssignee && dayTasks[it.dateAssignee] !== undefined) dayTasks[it.dateAssignee].push(it);
  });
  todos.filter(it => it.recurrence?.enabled && !it.done).forEach(it => {
    getRecurOccurrences(it, weekStart, weekEnd).forEach(ds => { if (dayTasks[ds] !== undefined) dayTasks[ds].push(it); });
  });

  const wkLabel = offset === 0 ? "Cette semaine"
    : offset === 1 ? "Semaine prochaine"
    : offset === -1 ? "Semaine précédente"
    : (() => {
        const end = new Date(monday); end.setDate(monday.getDate() + 6);
        return `${monday.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} – ${end.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`;
      })();

  const NavBtn = ({ dir }) => (
    <button onClick={() => setOffset(o => o + dir)} style={{
      background:"transparent", border:`1px solid var(--c-border)`, borderRadius:9,
      color:"var(--c-muted)", fontSize:16, cursor:"pointer", width:34, height:34, fontFamily:"inherit", lineHeight:1,
    }}>{dir < 0 ? "‹" : "›"}</button>
  );

  // ── Ruban multi-jours (cyber neon compact) — projet, avec sous-tâches dépliables
  const Ribbon = ({ s }) => {
    const col = colorOf(s.it);
    const { continuesLeft: cl, continuesRight: cr } = s;
    const subs = s.it.sousTaches || [];
    const done = subs.filter(x => x.done).length;
    const isOpen = expandedSpan === s.it.id;
    return (
      <div
        onClick={() => setEditId(s.it.id)}
        title={s.it.name}
        style={{
          gridColumn: `${s.startCol + 1} / ${s.endCol + 2}`,
          gridRow: s.lane + 1,
          display:"flex", alignItems:"center", gap:6,
          margin:"0 3px", padding:"0 8px 0 10px", height:26, minWidth:0,
          fontFamily:"inherit", cursor:"pointer", textAlign:"left",
          color:"var(--c-text)",
          background:`linear-gradient(90deg, ${col}33, ${col}1f)`,
          border:`1px solid ${col}66`,
          borderLeftWidth: cl ? 0 : 1, borderRightWidth: cr ? 0 : 1,
          borderTopLeftRadius: cl ? 0 : 8, borderBottomLeftRadius: cl ? 0 : 8,
          borderTopRightRadius: cr ? 0 : 8, borderBottomRightRadius: cr ? 0 : 8,
          boxShadow:`inset 3px 0 0 ${cl ? "transparent" : col}, 0 0 12px ${col}33`,
        }}>
        {cl && <span style={{ color:col, fontSize:11, marginLeft:-4 }}>‹</span>}
        <span style={{ width:6, height:6, borderRadius:"50%", background:col, boxShadow:`0 0 6px ${col}`, flexShrink:0 }} />
        <span style={{ fontSize:11.5, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flex:1, minWidth:0 }}>{s.it.name}</span>
        {subs.length > 0 && (
          <span style={{ fontSize:10, fontWeight:800, color:col, fontVariantNumeric:"tabular-nums", flexShrink:0 }}>{done}/{subs.length}</span>
        )}
        <button onClick={e => { e.stopPropagation(); markDone(s.it); }} title="Marquer fait"
          style={{ flexShrink:0, width:18, height:18, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center",
            background:"transparent", border:`1.5px solid ${col}`, color:col, cursor:"pointer", fontSize:9, fontFamily:"inherit", lineHeight:1 }}>✓</button>
        {subs.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setExpandedSpan(p => p === s.it.id ? null : s.it.id); }}
            title="Voir les sous-tâches"
            style={{ flexShrink:0, width:18, height:18, borderRadius:5, display:"inline-flex", alignItems:"center", justifyContent:"center",
              background:`${col}33`, border:"none", color:col, cursor:"pointer", fontSize:10, fontFamily:"inherit", transform:isOpen?"rotate(90deg)":"none", transition:"transform 0.15s" }}>▸</button>
        )}
      </div>
    );
  };

  // ── Chip tâche simple (cyber neon compact). Mémo = style "note" dissocié (pointillé + icône).
  const ICONS = { memo:"📝", waiting:"⏳" };
  const TaskChip = ({ it }) => {
    const col = colorOf(it);
    const isMemo = it.gtd === "memo";
    const isRecur = it.recurrence?.enabled;
    const icon = isRecur ? "🔄" : ICONS[it.gtd] || "•";
    return (
      <button onClick={e => { e.stopPropagation(); setEditId(it.id); }} title={it.name} style={{
        display:"flex", flexDirection:"column", gap:4,
        padding:"7px 9px", borderRadius:10, width:"100%", textAlign:"left",
        background: isMemo
          ? `repeating-linear-gradient(135deg, ${col}14, ${col}14 6px, ${col}0a 6px, ${col}0a 12px)`
          : `linear-gradient(180deg, ${col}1a, var(--c-surface-2))`,
        border:`1px ${isMemo ? "dashed" : "solid"} ${col}${isMemo ? "66" : "40"}`,
        cursor:"pointer", fontFamily:"inherit",
        boxShadow:`0 0 10px ${col}1f`,
      }}>
        <span style={{ display:"flex", alignItems:"flex-start", gap:6, minWidth:0 }}>
          <span style={{ fontSize:11, flexShrink:0, filter:`drop-shadow(0 0 4px ${col}88)`, marginTop:1 }}>{icon}</span>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--c-text)", lineHeight:1.25, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", flex:1, minWidth:0 }}>{it.name}</span>
          <span onClick={e => { e.stopPropagation(); markDone(it); }} title="Marquer fait"
            style={{ flexShrink:0, width:18, height:18, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center",
              border:`1.5px solid ${col}`, color:col, cursor:"pointer", fontSize:9, lineHeight:1 }}>✓</span>
        </span>
        <span style={{
          alignSelf:"flex-start", fontSize:8.5, fontWeight:800, color:col,
          textTransform:"uppercase", letterSpacing:"0.08em",
          padding:"1px 6px", borderRadius:999, background:`${col}22`,
          border:`1px ${isMemo ? "dashed" : "solid"} ${col}40`,
        }}>{typeLabel(it)}</span>
      </button>
    );
  };

  return (
    <>
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <span style={{ fontSize:11, color:"var(--c-accent)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.16em" }}>{wkLabel}</span>
          <div style={{ display:"flex", gap:8 }}><NavBtn dir={-1} /><NavBtn dir={1} /></div>
        </div>

        <div className="cal-board-wrap">
          <div className="cal-board">
            {/* En-tête jours */}
            <div className="cal-head">
              {days7.map((ds, i) => {
                const isToday = ds === today;
                const dn = new Date(ds + "T12:00:00").getDate();
                return (
                  <div key={ds} className="cal-head-cell" style={{ background: isToday ? "var(--c-accent-soft)" : "transparent" }}>
                    <span style={{ fontSize:10, color:"var(--c-faint)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700 }}>{DAY_SHORT[i]}</span>
                    <span style={{
                      width:28, height:28, borderRadius:"50%",
                      display:"inline-flex", alignItems:"center", justifyContent:"center",
                      fontFamily:"var(--font-display)", fontSize:14, fontWeight:isToday?700:600,
                      lineHeight:1, fontVariantNumeric:"tabular-nums",
                      background:isToday?"linear-gradient(135deg,#A855F7,#EC4899)":"transparent",
                      color:isToday?"#fff":"var(--c-text)",
                      boxShadow:isToday?"0 0 16px rgba(168,85,247,0.6)":"none",
                    }}>{dn}</span>
                  </div>
                );
              })}
            </div>

            {/* Lane clôtures OKR — DA spéciale, prend de la place */}
            {closureCols.length > 0 && (
              <div className="cal-clotures">
                {closureCols.map(ci => {
                  const cell = closuresByCol[ci];
                  const da = CLOTURE_DA[closureKind(cell.levels)];
                  return (
                    <div key={ci} style={{ gridColumn: `${ci + 1} / ${ci + 2}`, margin: "0 3px" }}>
                      <div style={{
                        position:"relative", overflow:"hidden", borderRadius:14, padding:"12px 12px 11px", minHeight:92,
                        display:"flex", flexDirection:"column", justifyContent:"center",
                        background:`${da.c}22`, border:`1px solid ${da.c}77`, boxShadow:`0 0 22px ${da.c}44`,
                      }}>
                        <div style={{ position:"absolute", top:0, left:0, right:0, height:5, background:da.grad }} />
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                          <span style={{ fontSize:24, lineHeight:1, filter:`drop-shadow(0 0 7px ${da.c}cc)` }}>{da.ic}</span>
                          <span style={{ fontSize:12, fontWeight:900, letterSpacing:"0.03em", color:da.c, lineHeight:1.1 }}>{da.label}</span>
                        </div>
                        <div style={{ fontSize:10, color:"var(--c-muted)", lineHeight:1.2 }}>{da.sub}</div>
                        <div style={{ fontSize:10, fontWeight:700, color:da.c, marginTop:3 }}>{cell.items.length} OKR{cell.items.length>1?"s":""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Lanes rubans multi-jours */}
            {laneCount > 0 && (
              <div className="cal-ribbons" style={{ gridTemplateRows:`repeat(${laneCount}, 26px)` }}>
                {spanItems.map(s => <Ribbon key={s.it.id} s={s} />)}
              </div>
            )}

            {/* Panneau sous-tâches d'un ruban déplié */}
            {expandedSpan && (() => {
              const proj = todos.find(x => x.id === expandedSpan);
              const subs = proj?.sousTaches || [];
              if (!proj) return null;
              const col = colorOf(proj);
              const done = subs.filter(s => s.done).length;
              return (
                <div className="slide-up" style={{
                  margin:"2px 3px 8px", padding:"12px 14px", borderRadius:12,
                  background:"var(--c-surface-2)", border:`1px solid ${col}44`, boxShadow:`0 0 16px ${col}1f`,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:col, boxShadow:`0 0 6px ${col}`, flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--c-text)", flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{proj.name}</span>
                    <span style={{ fontSize:11, fontWeight:800, color:col, fontVariantNumeric:"tabular-nums" }}>{done}/{subs.length}</span>
                    <button onClick={() => setExpandedSpan(null)} style={{ background:"none", border:"none", color:"var(--c-muted)", fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                  </div>
                  <div style={{ height:4, borderRadius:3, background:"var(--c-surface-3)", overflow:"hidden", marginBottom:10 }}>
                    <div style={{ height:"100%", width:`${subs.length ? done/subs.length*100 : 0}%`, background:`linear-gradient(90deg, ${col}, ${C.pink})`, borderRadius:3, transition:"width 0.3s", boxShadow:`0 0 8px ${col}66` }} />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                    {subs.map(st => (
                      <div key={st.id} onClick={() => toggleSub(proj.id, st.id)} style={{
                        display:"flex", alignItems:"center", gap:10, padding:"7px 8px", borderRadius:8,
                        cursor:"pointer", opacity:st.done?0.5:1, background:st.done?"transparent":"var(--c-surface-3)",
                      }}>
                        <span style={{ fontSize:15, color:st.done?C.green:col, flexShrink:0 }}>{st.done?"●":"○"}</span>
                        <span style={{ fontSize:13, color:"var(--c-text)", textDecoration:st.done?"line-through":"none" }}>{st.name}</span>
                      </div>
                    ))}
                    {subs.length === 0 && <span style={{ fontSize:12, color:"var(--c-faint)" }}>Aucune sous-tâche.</span>}
                  </div>
                </div>
              );
            })()}

            {/* Corps : tâches simples par jour */}
            <div className="cal-grid">
              {days7.map(ds => {
                const isToday = ds === today;
                const items = dayTasks[ds] || [];
                return (
                  <div key={ds} className="cal-day cal-day-add" onClick={() => setAddDate(ds)}
                    title="Ajouter une tâche ce jour"
                    style={{ background: isToday ? "var(--c-accent-soft)" : "transparent", cursor:"pointer" }}>
                    <div className="cal-body">
                      {items.map((it, k) => <TaskChip key={it.id + "_" + k} it={it} />)}
                      <span className="cal-add-hint" style={{ fontSize:12, color:"var(--c-faint)", textAlign:"center", padding:"4px 0" }}>+</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {editItem && !editMode && (
        <TaskSummaryModal
          item={editItem}
          onClose={closeModal}
          onToggleSousTache={(todoId, stId) => toggleSousTache(todoId, stId)}
          onEdit={() => setEditMode(true)}
        />
      )}
      {editItem && editMode && (
        <EditModal
          item={editItem}
          onSave={u => updateTodo(editItem.id, u)}
          onDelete={id => { deleteTodo(id); closeModal(); }}
          onToggleDone={id => toggleDone(id)}
          onClose={() => setEditMode(false)}
        />
      )}
      {addDate && (
        <DayCreateModal
          date={addDate}
          onCreate={obj => { addTodo(obj); setAddDate(null); }}
          onClose={() => setAddDate(null)}
        />
      )}

      {toast && (
        <div key={toast.id} className="cal-toast" style={{
          position:"fixed", left:"50%", bottom:24, transform:"translateX(-50%)", zIndex:3000,
          minWidth:280, maxWidth:"92vw", borderRadius:14, overflow:"hidden",
          background:"var(--c-surface-2, #1a1830)", border:`1px solid ${C.green}55`,
          boxShadow:`0 16px 40px rgba(0,0,0,0.5), 0 0 24px ${C.green}33`,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px" }}>
            <span style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"inline-flex", alignItems:"center", justifyContent:"center",
              background:C.green, color:"#04130d", fontSize:13, fontWeight:900 }}>✓</span>
            <span style={{ flex:1, minWidth:0, fontSize:13.5, fontWeight:600, color:"var(--c-text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              Tâche faite · <span style={{ color:"var(--c-muted)", fontWeight:500 }}>{toast.name}</span>
            </span>
            <button onClick={undoDone} style={{ flexShrink:0, padding:"6px 14px", borderRadius:999, cursor:"pointer", fontFamily:"inherit",
              background:"transparent", border:`1px solid ${C.borderMid}`, color:C.accent, fontSize:12, fontWeight:700 }}>Annuler</button>
          </div>
          <div style={{ height:3, background:`${C.green}22` }}>
            <div className="cal-toast-bar" style={{ height:"100%", background:C.green, boxShadow:`0 0 8px ${C.green}` }} />
          </div>
        </div>
      )}
    </>
  );
}

function Dashboard({ onNav, onOpenLogs, onRequestSession }) {
  // ── Lumen Protocol — palette claire locale (scope Dashboard uniquement).
  // Shadow l'objet `C` global (sombre) sans impacter les autres écrans.
  const C = {
    bg:"#0B0714", surface:"#181225", surface2:"#181225", surface3:"#221A36",
    border:"rgba(168,85,247,0.18)", borderMid:"rgba(168,85,247,0.38)",
    accent:"#A855F7", accent2:"#EC4899", accentBg:"rgba(168,85,247,0.16)",
    text:"#F4F2FF", muted:"#9990C0", faint:"#6B6390",
    green:"#34D399", greenBg:"rgba(52,211,153,0.14)",
    red:"#FB7185", redBg:"rgba(251,113,133,0.14)",
    blue:"#60A5FA", blueBg:"rgba(96,165,250,0.14)",
    purple:"#A855F7", purpleBg:"rgba(168,85,247,0.16)",
    amber:"#FBBF24", amberBg:"rgba(251,191,36,0.16)",
    orange:"#FB923C", pink:"#EC4899",
  };
  const GRAD = "linear-gradient(135deg,#A855F7,#EC4899)";
  const GLOW = "0 0 28px rgba(168,85,247,0.45)";
  const GLOW_SM = "0 0 16px rgba(168,85,247,0.40)";
  const SHADOW_CARD = "0 2px 16px rgba(0,0,0,0.40)";
  const ITEM_SH = "0 2px 12px rgba(0,0,0,0.35)";
  const FONT_D = "var(--font-display)";

  const t = todayStr();
  const [habits, setHabits]     = useState(() => getLS("lp_habits", []));
  const [sessions, setSessions]  = useState(() => getLS("lp_workperf", []));
  const [todos, setTodos]        = useState(loadTodos);
  const [goals, setGoals]        = useState(() => getLS("lp_goals", NOTION_GOALS));
  const [weeklyObjs, setWeeklyObjs] = useState(() => getLS("lp_weekly_objectives", []));
  const [showAddWeek, setShowAddWeek] = useState(false);
  const [weekText, setWeekText]  = useState("");
  const [highlight, setHighlight]= useState(() => getLS("lp_highlight", {}));
  const [editingHL, setEditingHL]= useState(false);
  const [qAction, setQAction]    = useState(null);
  const [appName, setAppName]    = useState(() => { const v = getLS("lp_app_name", "POLARIS"); return (v === "LE PLAN" || v === "Le Plan") ? "POLARIS" : v; });
  const [mantra, setMantra]      = useState(() => getLS("lp_mantra", "Per Aspera Ad Astra"));
  const [editingName, setEditingName] = useState(false);
  const [editingMantra, setEditingMantra] = useState(false);
  const [animating, setAnimating]= useState(new Set());
  const [expandedHabitId, setExpandedHabitId] = useState(null);
  const [wpForm, setWpForm]      = useState({ tache: "", temps: "", type: "DEEP", domaine: "BUSINESS", efficience: "💡💡💡" });
  const [todoText, setTodoText]  = useState("");
  const [objText, setObjText]    = useState("");
  const [editObj, setEditObj]    = useState(null);
  const saveGoals = d => { setGoals(d); setLS("lp_goals", d); };
  const curWeekId = getISOWeekId();
  const saveWeekly = d => { setWeeklyObjs(d); setLS("lp_weekly_objectives", d); };
  const addWeekly = () => {
    if (!weekText.trim()) return;
    saveWeekly([...weeklyObjs, { id: uid(), weekId: curWeekId, title: weekText.trim(), completed: false, missed: false, partial: false, note: "", createdAt: new Date().toISOString() }]);
    setWeekText(""); setShowAddWeek(false);
  };
  const toggleWeekly = id => saveWeekly(weeklyObjs.map(o => o.id === id ? (o.completed ? { ...o, completed: false, partial: true } : o.partial ? { ...o, partial: false, missed: true } : o.missed ? { ...o, missed: false } : { ...o, completed: true }) : o));
  const [editWeekId, setEditWeekId] = useState(null);
  const [editWeekText, setEditWeekText] = useState("");
  const deleteWeekly = id => saveWeekly(weeklyObjs.filter(o => o.id !== id));
  const startEditWeekly = o => { setEditWeekId(o.id); setEditWeekText(o.title); };
  const commitEditWeekly = () => { saveWeekly(weeklyObjs.map(o => o.id === editWeekId ? { ...o, title: editWeekText.trim() || o.title } : o)); setEditWeekId(null); };


  const hlText = highlight[t] || "";
  const saveHL = text => { const u = { ...highlight, [t]: text }; setHighlight(u); setLS("lp_highlight", u); };

  const toggleHabit = id => {
    setAnimating(s => new Set([...s, id]));
    setTimeout(() => setAnimating(s => { const n = new Set(s); n.delete(id); return n; }), 300);
    const updated = habits.map(h => {
      if (h.id !== id) return h;
      const ds = h.dailyStatus || {};
      const cur = ds[t] ?? null;
      const next = cycleHabitStatus(cur);
      const newDs = {...ds};
      if (next === null) delete newDs[t]; else newDs[t] = next;
      const logs = (h.logs||[]).filter(x=>x!==t);
      if (next === 'validated') logs.push(t);
      return {...h, dailyStatus:newDs, logs};
    });
    setHabits(updated); setLS("lp_habits", updated);
  };

  const toggleHabitItem = (habitId, itemId) => {
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;
      const is = { ...(h.itemStatus || {}) };
      const dayItems = { ...(is[t] || {}) };
      dayItems[itemId] = cycleHabitStatus(dayItems[itemId] ?? null);
      if (dayItems[itemId] === null) delete dayItems[itemId];
      is[t] = dayItems;
      const items = h.items || [];
      const allDone = items.length > 0 && items.every(it => dayItems[it.id] === 'validated');
      const anyInvalid = items.some(it => dayItems[it.id] === 'invalidated');
      const ds = { ...(h.dailyStatus || {}) };
      const logs = (h.logs||[]).filter(x=>x!==t);
      if (allDone) { ds[t] = 'validated'; logs.push(t); }
      else if (anyInvalid) { ds[t] = 'invalidated'; }
      else delete ds[t];
      return { ...h, itemStatus: is, dailyStatus: ds, logs };
    });
    setHabits(updated); setLS("lp_habits", updated);
  };

  const addSession = () => {
    if (!wpForm.tache.trim() || !wpForm.temps) return;
    const s = { id: uid(), tache: wpForm.tache.trim(), date: t, temps: parseInt(wpForm.temps), type: wpForm.type, domaine: wpForm.domaine, efficience: wpForm.efficience };
    const u = [...sessions, s]; setSessions(u); setLS("lp_workperf", u);
    setWpForm(f => ({ ...f, tache: "", temps: "" })); setQAction(null);
  };

  const addTodo = () => {
    if (!todoText.trim()) return;
    const item = { id: uid(), name: todoText.trim(), gtd: "inbox", done: false, createdAt: new Date().toISOString() };
    const u = [...todos, item];
    setTodos(u); setLS("leplan_todos", u); setTodoText(""); setQAction(null);
  };

  const addObj = () => {
    if (!objText.trim()) return;
    const obj = { id: uid(), titre: objText.trim(), statut: "Ça arrive", spaces: [], krs: [], avec: "Solo" };
    const updated = { ...goals, hebdo: [...(goals.hebdo || []), obj] };
    setGoals(updated); setLS("lp_goals", updated); setObjText(""); setQAction(null);
  };

  const doneH = habits.filter(h => habitValidated(h, t)).length;
  const todaySessions = sessions.filter(s => s.date === t);
  const deepToday = todaySessions.reduce((a, s) => a + s.temps, 0);
  const pulseObjs = [
    ...(goals.trimestriel || []).map(o => ({ ...o, _level: "Trimestriel", _c: C.green })),
    ...(goals.mensuel || []).map(o => ({ ...o, _level: "Mensuel", _c: C.amber })),
    ...(goals.hebdo || []).map(o => ({ ...o, _level: "Hebdo", _c: C.orange })),
  ].filter(o => !isObjClosed(o.statut) && !o.archived).slice(0, 3);

  const now = new Date();
  const headerDate = now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  const QUICK_BTNS = [
    { key: "session", icon: "⏱️", label: "Session" },
    { key: "journal", icon: "📓",  label: "Daily Paper" },
    { key: "todo",    icon: "+",  label: "Todo" },
  ];

  const handleQuick = key => {
    if (key === "journal") { onNav("daily"); return; }
    if (key === "habit") { document.getElementById("dash-habits")?.scrollIntoView({ behavior: "smooth" }); return; }
    if (key === "session") { onRequestSession?.(); return; }
    setQAction(qAction === key ? null : key);
  };

  return (
    <div className="theme-light" style={{ minHeight: "100dvh", fontFamily: "var(--font-body)" }}>
      {/* HEADER — transparent, eyebrow mantra + gros titre (aucun ruban) */}
      <div style={{ padding: "22px 16px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <PolarisLogo size={52} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          {editingMantra
            ? <input autoFocus value={mantra} onChange={e=>setMantra(e.target.value)}
                onBlur={()=>{ setLS("lp_mantra", mantra); setEditingMantra(false); }}
                onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape"){ setLS("lp_mantra", mantra); setEditingMantra(false); }}}
                style={{ fontSize:10, color:C.accent, textTransform:"uppercase", letterSpacing:"0.18em", fontWeight:700, background:"transparent", border:"none", borderBottom:`1px solid ${C.accent}`, outline:"none", width:220, fontFamily:"inherit" }}
              />
            : <div onClick={()=>setEditingMantra(true)} style={{ fontSize:10, color:C.accent, textTransform:"uppercase", letterSpacing:"0.18em", fontWeight:700, marginBottom:4, cursor:"pointer" }} title="Cliquer pour modifier">✦ {mantra}</div>
          }
          {editingName
            ? <input autoFocus value={appName} onChange={e=>setAppName(e.target.value)}
                onBlur={()=>{ setLS("lp_app_name", appName); setEditingName(false); }}
                onKeyDown={e=>{ if(e.key==="Enter"||e.key==="Escape"){ setLS("lp_app_name", appName); setEditingName(false); }}}
                style={{ fontFamily:FONT_D, fontSize:26, fontWeight:800, letterSpacing:"-0.02em", color:C.text, background:"transparent", border:"none", borderBottom:`1px solid ${C.accent}`, outline:"none", width:200 }}
              />
            : <div onClick={()=>setEditingName(true)} style={{ fontFamily:FONT_D, fontSize:26, fontWeight:800, letterSpacing:"-0.02em", color:C.text, lineHeight:1, cursor:"pointer" }} title="Cliquer pour modifier">{appName}</div>
          }
        </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, paddingTop: 2 }}>
          <span style={{ fontSize: 12, color: C.muted }}>{headerDate}</span>
          <div onClick={onOpenLogs} style={{ display:"flex", flexDirection:"column", gap:4, cursor:"pointer", padding:"4px 6px" }}>
            {[0,1,2].map(i=><div key={i} style={{width:18,height:2,background:C.muted,borderRadius:2}}/>)}
          </div>
        </div>
      </div>

      <div className="dash-wrap" style={{ paddingTop: 8 }}>

        {/* HERO — Highlight + ring (boxless, 2-col desktop) */}
        <div className="dash-hero">
        <div>
          <div style={{ fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10, fontWeight: 700 }}>
            Highlight du jour
          </div>
          {editingHL ? (
            <textarea
              autoFocus
              value={hlText}
              onChange={e => saveHL(e.target.value)}
              onBlur={() => setEditingHL(false)}
              placeholder="La tâche qui a le plus d'impact dans ta vie"
              style={{
                width: "100%", background: "transparent", border: "none",
                color: C.text, fontSize: 27, fontWeight: 700, fontFamily: FONT_D,
                resize: "none", outline: "none", lineHeight: 1.22, minHeight: 64,
                boxSizing: "border-box", letterSpacing: "-0.01em",
              }}
            />
          ) : (
            <div onClick={() => setEditingHL(true)} style={{ cursor: "text", minHeight: 44 }}>
              {hlText
                ? <p style={{ fontFamily: FONT_D, fontSize: 27, fontWeight: 700, color: C.text, lineHeight: 1.22, letterSpacing: "-0.01em" }}>{hlText}</p>
                : <p style={{ fontFamily: FONT_D, fontSize: 27, fontWeight: 700, color: C.faint, lineHeight: 1.22, letterSpacing: "-0.01em" }}>La tâche qui a le plus d'impact dans ta vie</p>
              }
            </div>
          )}
          <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>La seule chose qui compte aujourd'hui</div>
        </div>

        {/* QUICK ACTIONS — colonne centrale, entre Highlight et l'anneau */}
        <div className="dash-quick">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUICK_BTNS.map(({ key, icon, label }) => (
              <button key={key} onClick={() => handleQuick(key)} style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                padding: "10px 16px", borderRadius: 999, minHeight: 44,
                background: qAction === key ? GRAD : C.surface3, border: "none",
                color: qAction === key ? "#fff" : C.accent,
                fontSize: 13, fontWeight: 600, transition: TR, fontFamily: "inherit",
                boxShadow: qAction === key ? GLOW_SM : "none",
              }}>
                <span>{icon}</span><span>{label}</span>
              </button>
            ))}
          </div>
          {qAction === "session_log" && (
            <div className="slide-up" style={{ marginTop: 10, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 16, padding: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <Input value={wpForm.tache} onChange={v => setWpForm(f => ({...f, tache:v}))} placeholder="Tâche..." style={{ flex: 1 }} />
                <input type="number" min="1" placeholder="min" value={wpForm.temps} onChange={e => setWpForm(f => ({...f, temps:e.target.value}))}
                  style={{ width: 68, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "10px 8px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {WP_TYPES.map(tp => (
                  <button key={tp} onClick={() => setWpForm(f=>({...f,type:tp}))} style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 12, border: `1px solid ${wpForm.type===tp ? WP_TYPE_C[tp] : C.border}`,
                    background: wpForm.type===tp ? WP_TYPE_C[tp]+"20" : "transparent", color: wpForm.type===tp ? WP_TYPE_C[tp] : C.muted,
                  }}>{tp}</button>
                ))}
                <Select value={wpForm.domaine} options={WP_DOMAINES} onChange={v => setWpForm(f=>({...f,domaine:v}))} style={{ fontSize: 12 }} />
              </div>
              <Btn onClick={addSession} variant="accent" style={{ width: "100%" }}>+ Enregistrer la session</Btn>
            </div>
          )}
          {qAction === "todo" && (
            <div className="slide-up" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={todoText} onChange={setTodoText} onKeyDown={e => e.key==="Enter" && addTodo()} placeholder="Nouvelle tâche..." />
                <Btn onClick={addTodo} variant="accent" style={{ whiteSpace: "nowrap" }}>Ajouter</Btn>
              </div>
            </div>
          )}
          {qAction === "objectif" && (
            <div className="slide-up" style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={objText} onChange={setObjText} onKeyDown={e => e.key==="Enter" && addObj()} placeholder="Objectif hebdo..." />
                <Btn onClick={addObj} variant="accent" style={{ whiteSpace: "nowrap" }}>Ajouter</Btn>
              </div>
            </div>
          )}
        </div>

        {/* HERO RING + métriques (boxless, signature) */}
        {(() => {
          const dayPct = habits.length ? Math.round(doneH / habits.length * 100) : 0;
          const RING = 132, SW = 11, RAD = (RING - SW) / 2, CIRC = 2 * Math.PI * RAD;
          const off = CIRC * (1 - dayPct / 100);
          const Metric = ({ value, label, color, onClick }) => (
            <div onClick={onClick} style={{ textAlign: "center", cursor: onClick ? "pointer" : "default", minWidth: 76 }}>
              <div style={{ fontFamily: FONT_D, fontSize: 26, fontWeight: 700, color: color || C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 5, fontWeight: 500 }}>{label}</div>
            </div>
          );
          return (
            <div className="dash-ring" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, margin: "26px 0 10px" }}>
              <Metric value={fmtMin(deepToday)} label="Deep Work" color={C.accent} onClick={() => onNav("workperf")} />
              <div style={{ position: "relative", width: RING, height: RING, flexShrink: 0 }}>
                <svg width={RING} height={RING} style={{ transform: "rotate(-90deg)", display: "block" }}>
                  <defs>
                    <linearGradient id="dashRing" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22D3EE" />
                      <stop offset="55%" stopColor="#A855F7" />
                      <stop offset="100%" stopColor="#EC4899" />
                    </linearGradient>
                  </defs>
                  <circle cx={RING/2} cy={RING/2} r={RAD} fill="none" stroke={C.surface3} strokeWidth={SW} />
                  <circle cx={RING/2} cy={RING/2} r={RAD} fill="none" stroke="url(#dashRing)" strokeWidth={SW}
                    strokeDasharray={CIRC} strokeDashoffset={off} strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)", filter: "drop-shadow(0 0 6px rgba(168,85,247,0.7))" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: FONT_D, fontSize: 34, fontWeight: 800, color: C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{dayPct}<span style={{ fontSize: 18, fontWeight: 600 }}>%</span></div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3, fontWeight: 600 }}>du jour</div>
                </div>
              </div>
            </div>
          );
        })()}
        </div>{/* /dash-hero */}

        {/* OBJECTIFS — bloc pleine largeur (3 chronologies + mensuels adaptatifs) */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: C.amber, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>⭐ Objectifs</span>
            <span onClick={() => onNav("objectifs:mensuel")} style={{ fontSize: 12, color: C.muted, cursor: "pointer" }}>Tout voir →</span>
          </div>

          {/* Mensuels — pleine largeur, colonnes = nb d'objectifs (1 à 6) */}
          {(() => {
            const monthlyObjs = (goals.mensuel || []).filter(o => !o.archived);
            // Couleur DA : terminé (Atteint ou 100%) → vert, échoué/abandonné → rouge, sinon jaune
            return (
              <>
                <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700, marginBottom:9 }}>🗻 Mensuels</div>
                {monthlyObjs.length === 0
                  ? <div onClick={() => onNav("objectifs:mensuel")} style={{ fontSize:12, color:C.faint, padding:"14px 0", cursor:"pointer" }}>Aucun objectif mensuel · <span style={{ color:C.amber }}>+ Ajouter</span></div>
                  : (
                  <div className="home-month-grid" style={{ "--cols": Math.min(monthlyObjs.length, 6) }}>
                    {monthlyObjs.map(o => {
                      const p = krsProgress(o.krs || []);
                      const failedStatus = o.statut === "Échoué" || o.statut === "Echoué" || o.statut === "Abandonné";
                      const achieved = isObjAchieved(o.statut) || (p !== null && p >= 100); // terminé = 100%
                      const failed = failedStatus && !achieved;
                      const col = achieved ? C.green : failed ? C.red : C.amber;
                      return (
                        <div key={o.id} onClick={() => setEditObj(o)} title="Cliquer pour modifier" style={{
                          position: "relative", overflow: "hidden", minHeight: 158, padding: "13px 15px", borderRadius: 18, display: "flex", flexDirection: "column",
                          background: "transparent", border: `1px solid ${col}33`, cursor: "pointer",
                        }}>
                          {/* Montagne — fondue : fade haut/gauche/droite, bas net (ancré) */}
                          <div style={{ position: "absolute", inset: 0, zIndex: 0, WebkitMaskImage: "radial-gradient(125% 145% at 50% 112%, #000 54%, rgba(0,0,0,0) 100%)", maskImage: "radial-gradient(125% 145% at 50% 112%, #000 54%, rgba(0,0,0,0) 100%)" }}>
                            <LevelArt levelId="mensuel" color={col} reached={achieved} idKey={`home-m-${o.id}`} fit="slice" />
                          </div>
                          <div style={{ position: "relative", zIndex: 1, fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", minHeight: 34, textShadow: "0 1px 6px rgba(0,0,0,0.6)", textDecoration: failed ? "line-through" : "none" }}>{o.titre}</div>
                          <div style={{ flex: 1, minHeight: 8 }} />
                          {p !== null ? (
                            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${p}%`, background: col, borderRadius: 3, transition: "width 0.5s", boxShadow: `0 0 8px ${col}66` }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 800, color: col, fontVariantNumeric: "tabular-nums", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{achieved ? "🏔 " : failed ? "✕ " : ""}{p}%</span>
                            </div>
                          ) : (
                            <div style={{ position: "relative", zIndex: 1, fontSize: 11, fontWeight:700, color: col }}>{achieved ? "🏔 Atteint" : failed ? "Échoué" : "En cours"}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Objectifs de la semaine (Weekly review) — DA réduite, pont Golden Gate bleu */}
          {(() => {
            const wObjs = weeklyObjs.filter(o => o.weekId === curWeekId);
            const ggMask = "radial-gradient(135% 150% at 50% 116%, #000 52%, rgba(0,0,0,0) 100%)";
            const stOf = o => o.completed ? { c: C.green, ic: "✓" } : o.missed ? { c: C.red, ic: "✕" } : o.partial ? { c: "#38BDF8", ic: "~" } : { c: "#38BDF8", ic: "○" };
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                  <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>🌉 Cette semaine</span>
                  <button onClick={() => setShowAddWeek(s => !s)} title="Ajouter un objectif hebdo" style={{ width: 26, height: 26, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${showAddWeek ? "#38BDF8" : C.border}`, background: showAddWeek ? "#38BDF822" : C.surface3, color: "#38BDF8" }}>{showAddWeek ? "✕" : "+"}</button>
                </div>
                {showAddWeek && (
                  <div className="slide-up" style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <Input value={weekText} onChange={setWeekText} onKeyDown={e => e.key === "Enter" && addWeekly()} placeholder="Objectif de la semaine..." autoFocus />
                    <Btn onClick={addWeekly} variant="accent" style={{ whiteSpace: "nowrap" }}>Ajouter</Btn>
                  </div>
                )}
                {wObjs.length === 0
                  ? <div style={{ fontSize: 12, color: C.faint, padding: "8px 0" }}>Aucun objectif cette semaine{showAddWeek ? "." : " · "}{!showAddWeek && <span onClick={() => setShowAddWeek(true)} style={{ color: "#38BDF8", cursor: "pointer" }}>+ Ajouter</span>}</div>
                  : (
                  <div className="home-week-grid" style={{ "--cols": Math.min(wObjs.length, 6) }}>
                    {wObjs.map(o => {
                      const s = stOf(o);
                      const editing = editWeekId === o.id;
                      return (
                        <div key={o.id} onClick={() => { if (!editing) toggleWeekly(o.id); }} title={editing ? undefined : "Cliquer pour changer le statut"} style={{
                          position: "relative", overflow: "hidden", minHeight: 110, padding: "12px 14px", borderRadius: 15,
                          display: "flex", flexDirection: "column", cursor: editing ? "default" : "pointer",
                          background: "transparent", border: `1px solid ${s.c}33`,
                        }}>
                          <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.95 }}>
                            <HikingArt idKey={o.id} fit="cover" color={s.c} />
                          </div>
                          {editing ? (
                            <input autoFocus value={editWeekText} onClick={e => e.stopPropagation()}
                              onChange={e => setEditWeekText(e.target.value)}
                              onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commitEditWeekly(); if (e.key === "Escape") setEditWeekId(null); }}
                              onBlur={commitEditWeekly}
                              style={{ position: "relative", zIndex: 1, width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.45)", border: `1px solid #38BDF877`, color: C.text, padding: "6px 9px", borderRadius: 9, fontSize: 12.5, fontFamily: "inherit", outline: "none" }} />
                          ) : (
                            <div style={{ position: "relative", zIndex: 1, fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.28, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textShadow: "0 1px 6px rgba(0,0,0,0.6)", textDecoration: o.completed ? "line-through" : "none" }}>{o.title}</div>
                          )}
                          <div style={{ flex: 1 }} />
                          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: s.c, border: `1.5px solid ${s.c}`, boxShadow: `0 0 6px ${s.c}66` }}>{s.ic}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={e => { e.stopPropagation(); editing ? commitEditWeekly() : startEditWeekly(o); }} title={editing ? "Valider" : "Renommer"} style={{ width: 22, height: 22, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, color: editing ? C.green : C.muted }}>{editing ? "✓" : "✎"}</button>
                            <button onClick={e => { e.stopPropagation(); deleteWeekly(o.id); }} title="Supprimer" style={{ width: 22, height: 22, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, color: C.muted }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {editObj && (
          <ObjectifEditModal
            obj={editObj} levelId="mensuel" allGoals={goals}
            onUpdate={u => { saveGoals({ ...goals, mensuel: (goals.mensuel || []).map(o => o.id === u.id ? u : o) }); setEditObj(null); }}
            onDelete={id => { saveGoals({ ...goals, mensuel: (goals.mensuel || []).filter(o => o.id !== id) }); setEditObj(null); }}
            onClose={() => setEditObj(null)}
          />
        )}

        <div style={{ height: 1, background: C.border, margin: "24px 0" }} />

        {/* WEEKLY CALENDAR — pleine largeur */}
        <WeeklyCalendar />

        {/* HABITUDES (boxless, pleine largeur) */}
        <div id="dash-habits" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>Habitudes</span>
            <span onClick={() => onNav("habitudes")} style={{ fontFamily: FONT_D, fontSize: 13, color: C.muted, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{doneH}/{habits.length}</span>
          </div>
          {habits.length > 0 && (
            <div style={{ height: 5, borderRadius: 999, background: C.surface3, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ height: "100%", width: `${habits.length ? doneH / habits.length * 100 : 0}%`, background: GRAD, borderRadius: 999, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
            </div>
          )}
          {habits.length === 0
            ? <p style={{ fontSize: 14, color: C.faint }}>Aucune habitude. <span onClick={() => onNav("habitudes")} style={{ color: C.accent, cursor: "pointer" }}>→ Configurer</span></p>
            : <div className="habit-grid">{habits.map(h => {
                const status = (h.dailyStatus||{})[t] ?? null;
                if (h.multiple) {
                  const isDone = status === 'validated';
                  const isExpanded = expandedHabitId === h.id;
                  const dayItems = (h.itemStatus||{})[t] || {};
                  const validatedCount = (h.items||[]).filter(it=>dayItems[it.id]==='validated').length;
                  const hasInvalid = (h.items||[]).some(it=>dayItems[it.id]==='invalidated');
                  const total = (h.items||[]).length;
                  const badgeColor = isDone?C.green:hasInvalid?C.red:C.accent;
                  const badgeBg = isDone?"rgba(16,185,129,0.18)":hasInvalid?"rgba(239,68,68,0.15)":C.accentBg;
                  const badgeBorder = isDone?"rgba(16,185,129,0.3)":hasInvalid?"rgba(239,68,68,0.3)":C.border;
                  return (
                    <div key={h.id} style={{marginBottom:8}}>
                      <div onClick={()=>setExpandedHabitId(isExpanded?null:h.id)} style={{
                        display:"flex",alignItems:"center",gap:14,padding:"13px 14px",borderRadius:14,
                        background:isDone?"rgba(52,211,153,0.12)":hasInvalid?"rgba(251,113,133,0.10)":C.surface,
                        border:`1px solid ${isDone?"rgba(52,211,153,0.35)":hasInvalid?"rgba(251,113,133,0.30)":C.border}`,
                        boxShadow:ITEM_SH,
                        cursor:"pointer",transition:TR,minHeight:52,
                      }}>
                        <span style={{fontSize:22,flexShrink:0,opacity:isDone?0.5:1}}>{h.emoji}</span>
                        <span style={{flex:1,fontSize:15,fontWeight:500,color:isDone?C.muted:C.text,textDecoration:isDone?"line-through":"none",transition:TR}}>{h.name}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{padding:"3px 10px",borderRadius:999,fontSize:12,fontWeight:700,fontVariantNumeric:"tabular-nums",background:badgeBg,color:badgeColor}}>{validatedCount}/{total}</div>
                          <span style={{fontSize:11,color:C.faint,transition:"transform 0.2s",transform:isExpanded?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{padding:"2px 0 12px 36px"}}>
                          {(h.items||[]).map(item=>{
                            const itemStatus = dayItems[item.id] ?? null;
                            const isVal = itemStatus==='validated';
                            const isInv = itemStatus==='invalidated';
                            return (
                              <div key={item.id} onClick={()=>toggleHabitItem(h.id,item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
                                <div style={{width:20,height:20,borderRadius:5,flexShrink:0,background:isVal?C.green:isInv?C.red:"transparent",border:`2px solid ${isVal?C.green:isInv?C.red:C.borderMid}`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,fontWeight:700,transition:TR}}>{isVal?"✓":isInv?"✕":null}</div>
                                <span style={{fontSize:14,color:isVal?C.muted:isInv?C.red:C.text,textDecoration:isVal?"line-through":"none"}}>{item.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                return <HabitChip key={h.id} habit={h} status={status} onToggle={() => toggleHabit(h.id)} animating={animating.has(h.id)} />;
              })}</div>
          }
        </div>{/* /habitudes */}

        {/* PROJETS EN COURS */}
        {(() => {
          const allTodos = getLS("leplan_todos", []);
          const enCours = allTodos.filter(t => t.gtd === "projet" && !t.done && getProjectStatus(t) === "en_cours");
          if (!enCours.length) return null;
          return (
            <div style={{ marginBottom: 28 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em" }}>Projets en cours</span>
                <span onClick={() => onNav("todo")} style={{ fontSize: 12, color: C.muted, cursor: "pointer", fontWeight: 500 }}>Voir tout →</span>
              </div>
              {enCours.map(p => {
                const sc = SPHERES[p.sphere]?.c || C.accent;
                return (
                  <div key={p.id} onClick={() => onNav("todo")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", marginBottom: 8, borderRadius: 14, background: C.surface, border: `1px solid ${C.border}`, boxShadow: ITEM_SH, borderLeft: `3px solid ${sc}`, cursor: "pointer", minHeight: 48 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: sc, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{p.name}</div>
                      {p.dateFin && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>→ {p.dateFin}</div>}
                    </div>
                    {p.sphere && <span style={{ fontSize: 10, color: sc, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{SPHERES[p.sphere]?.label}</span>}
                  </div>
                );
              })}
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJECTIFS
// ─────────────────────────────────────────────────────────────────────────────
function KRCard({ kr, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({ depart: String(kr.depart ?? 0), actuelle: String(kr.actuelle ?? kr.depart ?? 0), cible: String(kr.cible ?? 0) });
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  // % live : pendant l'édition depuis les champs, sinon depuis le KR enregistré
  const p = editing
    ? pct(num(d.depart), num(d.actuelle), num(d.cible))
    : krPct(kr);
  const lc = p >= 100 ? C.green : p >= 60 ? C.accent : p >= 30 ? C.amber : C.red;
  const startEdit = () => { setD({ depart: String(kr.depart ?? 0), actuelle: String(kr.actuelle ?? kr.depart ?? 0), cible: String(kr.cible ?? 0) }); setEditing(true); };
  const save = () => { onUpdate({ ...kr, depart: num(d.depart), actuelle: num(d.actuelle), cible: num(d.cible) }); setEditing(false); };
  return (
    <div style={{ background: C.surface3, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `1px solid ${editing ? lc + "66" : C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{kr.nom}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: lc, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{p}%</span>
          <span onClick={() => editing ? setEditing(false) : startEdit()} style={{ fontSize: 12, color: editing ? C.accent : C.muted, cursor: "pointer" }}>✎</span>
          <span onClick={() => onDelete(kr.id)} style={{ fontSize: 12, color: C.muted, cursor: "pointer" }}>✕</span>
        </div>
      </div>
      <ProgressBar value={p} color={lc} height={5} />
      {editing ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            {[["depart", "Départ"], ["actuelle", "Actuelle"], ["cible", "Cible"]].map(([k, l]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{l}</div>
                <input type="number" value={d[k]} onChange={e => setD(p2 => ({ ...p2, [k]: e.target.value }))} onKeyDown={e => e.key === "Enter" && save()}
                  style={{ width: "100%", boxSizing: "border-box", background: C.surface2, border: `1px solid ${C.borderMid}`, color: C.text, padding: "6px 8px", borderRadius: 8, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={save} style={{ flex: 1, background: GRAD, color: "#fff", border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
            <button onClick={() => setEditing(false)} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, padding: "6px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Départ : {kr.depart ?? 0}</span>
          <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{kr.actuelle ?? kr.depart ?? 0} / {kr.cible ?? 0}</span>
        </div>
      )}
    </div>
  );
}

function ObjectifEditModal({ obj, levelId, allGoals, onUpdate, onDelete, onClose, onRequestCloture }) {
  const [titre, setTitre]   = useState(obj.titre||"");
  const [statut, setStatut] = useState(normObjStatus(obj.statut));
  const [spaces, setSpaces] = useState(obj.spaces||[]);
  const [parentId, setParentId] = useState(obj.parentId||"");
  const [krs, setKrs]       = useState(obj.krs||[]);
  const [newKR, setNewKR]   = useState({nom:"",depart:"",actuelle:"",cible:""});
  const [addingKR, setAddingKR] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const ptype = periodeTypeForLevel(levelId);
  const [periode, setPeriode] = useState(obj.periode || (ptype ? defaultPeriode(levelId) : null));
  const [dateCloture, setDateCloture] = useState(obj.dateCloture || (ptype ? computeCloture(obj.periode || defaultPeriode(levelId)) : ""));
  const setPer = patch => { const np = { ...periode, ...patch }; setPeriode(np); setDateCloture(computeCloture(np)); };
  const yearOpts = (() => { const y = new Date().getFullYear(); return [y-1, y, y+1, y+2]; })();
  const level         = LEVELS.find(l=>l.id===levelId);
  const parentLevelId = LEVEL_PARENT[levelId];
  const parentLevel   = LEVELS.find(l=>l.id===parentLevelId);
  const parentOptions = parentLevelId?(allGoals[parentLevelId]||[]):[];
  const childLevelId  = LEVEL_CHILD[levelId];
  const childLevel    = LEVELS.find(l=>l.id===childLevelId);
  const children      = childLevelId?(allGoals[childLevelId]||[]).filter(o=>o.parentId===obj.id):[];
  const linkedProjects = levelId==="mensuel"
    ? (()=>{const s=getLS("leplan_todos",null)||getLS("lp_todos",[]);return(s||[]).map(migrateOneTodo).filter(Boolean).filter(t=>t.gtd==="projet"&&t.objectifMensuelId===obj.id&&!t.done);})()
    : [];
  const addKR = () => {
    if(!newKR.nom.trim()) return;
    const kr={id:uid(),nom:newKR.nom.trim(),depart:parseFloat(newKR.depart)||0,actuelle:parseFloat(newKR.actuelle)||parseFloat(newKR.depart)||0,cible:parseFloat(newKR.cible)||0};
    setKrs(ks=>[...ks,kr]); setNewKR({nom:"",depart:"",actuelle:"",cible:""}); setAddingKR(false);
  };
  const save = () => { onUpdate({...obj,titre:titre.trim(),statut,spaces,parentId:parentId||undefined,krs,...(ptype?{periode,dateCloture:dateCloture||undefined}:{})}); onClose(); };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} className="slide-up" style={{width:"100%",maxWidth:520,background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:10,color:level?.c,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>{level?.icon} {level?.label}</div>
        <input autoFocus value={titre} onChange={e=>setTitre(e.target.value)}
          style={{width:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${C.accent}`,color:C.text,fontSize:17,fontWeight:700,fontFamily:"inherit",outline:"none",padding:"4px 0",boxSizing:"border-box",marginBottom:18}}/>

        {/* % global de l'objectif (live, moyenne KR + bonus complétion) */}
        {krs.length>0&&(()=>{
          const objP = krsProgress(krs);
          const oc = objP>=100?C.green:objP>=60?(level?.c||C.accent):objP>=30?C.amber:C.red;
          const doneKr = krs.filter(k=>krPct(k)>=100).length;
          return (
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,padding:"14px 16px",borderRadius:14,background:`${oc}12`,border:`1px solid ${oc}33`}}>
              <div style={{fontFamily:"var(--font-display)",fontSize:32,fontWeight:800,color:oc,lineHeight:1,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{objP}<span style={{fontSize:18}}>%</span></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Progression · {krs.length} KR{krs.length>1?"s":""} · {doneKr} fini{doneKr>1?"s":""}</div>
                <ProgressBar value={objP} color={oc} height={6}/>
              </div>
            </div>
          );
        })()}

        {/* Période liée + date de clôture (auto, éditable) — sauf Long Terme */}
        {ptype&&(
          <div style={{marginBottom:16,padding:"13px 14px",borderRadius:14,background:C.surface2,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:9}}>📅 Période liée</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {yearOpts.map(y=>(
                <button key={y} onClick={()=>setPer({year:y})} style={{padding:"5px 12px",borderRadius:999,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:`1px solid ${periode.year===y?(level?.c||C.accent):C.border}`,background:periode.year===y?(level?.c||C.accent)+"22":"transparent",color:periode.year===y?(level?.c||C.accent):C.muted,fontWeight:periode.year===y?700:400}}>{y}</button>
              ))}
            </div>
            {ptype==="month"&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                {MONTHS_FR.map((m,i)=>(
                  <button key={i} onClick={()=>setPer({month:i})} style={{padding:"7px 4px",borderRadius:9,fontSize:11,fontFamily:"inherit",cursor:"pointer",border:`1px solid ${periode.month===i?(level?.c||C.accent):C.border}`,background:periode.month===i?(level?.c||C.accent)+"22":"transparent",color:periode.month===i?(level?.c||C.accent):C.muted,fontWeight:periode.month===i?700:400}}>{m.slice(0,4)}</button>
                ))}
              </div>
            )}
            {ptype==="quarter"&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                {QUARTERS_FR.map(([q,r],i)=>(
                  <button key={i} onClick={()=>setPer({quarter:i})} style={{padding:"8px 4px",borderRadius:10,fontSize:11,fontFamily:"inherit",cursor:"pointer",textAlign:"center",border:`1px solid ${periode.quarter===i?(level?.c||C.accent):C.border}`,background:periode.quarter===i?(level?.c||C.accent)+"22":"transparent",color:periode.quarter===i?(level?.c||C.accent):C.muted,fontWeight:periode.quarter===i?700:400}}>{q}<div style={{fontSize:9,color:C.faint,marginTop:1}}>{r}</div></button>
                ))}
              </div>
            )}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:4}}>Date de clôture (auto, éditable)</div>
                <input type="date" value={dateCloture} onChange={e=>setDateCloture(e.target.value)} style={{width:"100%",boxSizing:"border-box",background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:8,borderRadius:9,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
              </div>
              <div style={{textAlign:"right",fontSize:11,color:C.muted,paddingTop:14}}>{periodeLabel(periode)}</div>
            </div>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:9}}>Statut</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
            {OBJ_STATUSES.map(({k,c,icon})=>{
              const sel=statut===k;
              return (
                <button key={k} onClick={()=>setStatut(k)} style={{
                  display:"flex",alignItems:"center",justifyContent:"center",gap:5,
                  padding:"8px 6px",borderRadius:11,fontSize:11.5,fontWeight:sel?700:500,fontFamily:"inherit",cursor:"pointer",
                  border:`1px solid ${sel?c:C.border}`,
                  background:sel?`linear-gradient(180deg, ${c}2e, ${c}14)`:"transparent",
                  color:sel?c:C.muted,
                  boxShadow:sel?`0 0 14px ${c}33`:"none",transition:TR,
                }}>
                  <span style={{fontSize:13,filter:sel?`drop-shadow(0 0 4px ${c}aa)`:"grayscale(0.4) opacity(0.7)"}}>{icon}</span>
                  <span style={{whiteSpace:"nowrap"}}>{k}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Sphères</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {Object.entries(SPACES).map(([sp,{c,icon}])=>{
              const sel=spaces.includes(sp);
              return <button key={sp} onClick={()=>setSpaces(s=>s.includes(sp)?s.filter(x=>x!==sp):[...s,sp])} style={{padding:"5px 12px",borderRadius:999,fontSize:12,border:`1px solid ${sel?c:C.border}`,background:sel?c+"20":"transparent",color:sel?c:C.muted,fontFamily:"inherit",cursor:"pointer"}}>{icon} {sp}</button>;
            })}
          </div>
        </div>

        {parentOptions.length>0&&(()=>{
          const pc = parentLevel?.c || C.accent;
          return (
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}>
                <span style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em"}}>Rattaché à l'objectif</span>
                <span style={{fontSize:10,fontWeight:700,color:pc,padding:"2px 8px",borderRadius:999,background:`${pc}1f`,border:`1px solid ${pc}40`}}>{parentLevel?.icon} {parentLevel?.label}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button onClick={()=>setParentId("")} style={{display:"flex",alignItems:"center",gap:10,textAlign:"left",padding:"10px 12px",borderRadius:12,border:`1px ${!parentId?"solid":"dashed"} ${!parentId?pc:C.border}`,background:!parentId?`${pc}14`:"transparent",color:!parentId?pc:C.muted,fontSize:12.5,fontFamily:"inherit",cursor:"pointer"}}>
                  <span style={{fontSize:15,opacity:0.6}}>∅</span>
                  <span>Aucun rattachement</span>
                </button>
                {parentOptions.map(p=>{
                  const sel=parentId===p.id;
                  return (
                    <button key={p.id} onClick={()=>setParentId(p.id)} style={{
                      display:"flex",alignItems:"center",gap:11,textAlign:"left",padding:"11px 13px",borderRadius:12,fontFamily:"inherit",cursor:"pointer",
                      border:`1px solid ${sel?pc:C.border}`,
                      background:sel?`linear-gradient(110deg, ${pc}24, ${pc}0a)`:C.surface3,
                      boxShadow:sel?`0 0 16px ${pc}2e`:"none",transition:TR,
                    }}>
                      <span style={{width:34,height:34,flexShrink:0,borderRadius:10,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:18,background:`${pc}22`,border:`1px solid ${pc}44`,boxShadow:sel?`0 0 10px ${pc}55`:"none"}}>{parentLevel?.icon}</span>
                      <span style={{flex:1,minWidth:0,fontSize:12.5,fontWeight:sel?700:500,color:sel?C.text:C.muted,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis"}}>{p.titre}</span>
                      {sel&&<span style={{color:pc,fontSize:15,flexShrink:0}}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {children.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>↓ Décliné en ({childLevel?.label})</div>
            {children.map(ch=><div key={ch.id} style={{padding:"6px 10px",borderRadius:8,background:C.surface2,fontSize:12,color:C.muted,marginBottom:4}}>• {ch.titre}</div>)}
          </div>
        )}

        {linkedProjects.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>🔴 Projets liés</div>
            {linkedProjects.map(p=><div key={p.id} style={{padding:"6px 10px",borderRadius:8,background:C.surface2,fontSize:12,color:C.text,marginBottom:4}}>• {p.name}</div>)}
          </div>
        )}

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Key Results</div>
          {krs.map(kr=>(
            <KRCard key={kr.id} kr={kr}
              onUpdate={u=>setKrs(ks=>ks.map(k=>k.id===u.id?u:k))}
              onDelete={id=>setKrs(ks=>ks.filter(k=>k.id!==id))}
            />
          ))}
          {addingKR?(
            <div style={{background:C.surface3,borderRadius:12,padding:12,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:500}}>Nouveau Key Result</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <input placeholder="Nom du KR..." value={newKR.nom} onChange={e=>setNewKR(p=>({...p,nom:e.target.value}))}
                  style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"8px 12px",borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[["depart","Départ"],["actuelle","Actuelle"],["cible","Cible"]].map(([k,l])=>(
                    <div key={k}>
                      <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{l}</div>
                      <input type="number" placeholder="0" value={newKR[k]} onChange={e=>setNewKR(p=>({...p,[k]:e.target.value}))}
                        style={{width:"100%",boxSizing:"border-box",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 8px",borderRadius:8,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,marginTop:4}}>
                  <Btn onClick={addKR} variant="accent">Ajouter</Btn>
                  <Btn onClick={()=>setAddingKR(false)} variant="ghost">Annuler</Btn>
                </div>
              </div>
            </div>
          ):(
            <button onClick={()=>setAddingKR(true)} style={{background:"transparent",border:`1px dashed ${C.borderMid}`,color:C.muted,padding:"8px 14px",borderRadius:10,fontSize:12,cursor:"pointer",fontFamily:"inherit",width:"100%",marginTop:4}}>+ Key Result</button>
          )}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
          <Btn onClick={save} variant="accent" style={{width:"100%"}}>Enregistrer</Btn>
          {onRequestCloture&&(
            <Btn onClick={()=>{save();onRequestCloture(obj,levelId);}} style={{width:"100%",color:C.amber,border:`1px solid ${C.amber}55`,background:`${C.amber}10`}}>🔒 Clôturer l'OKR</Btn>
          )}
          {confirmDel
            ?<Btn onClick={()=>{onDelete(obj.id);onClose();}} style={{width:"100%",color:C.red,border:`1px solid ${C.red}44`}}>Confirmer suppression ✕</Btn>
            :<Btn onClick={()=>setConfirmDel(true)} style={{width:"100%",color:C.red,border:`1px solid ${C.red}44`}}>Supprimer</Btn>
          }
        </div>
      </div>
    </div>
  );
}

// ── ClotureModal — questions de bilan + archivage de l'OKR
function ClotureModal({ obj, levelId, onArchive, onClose }) {
  const lv = LEVELS.find(l => l.id === levelId);
  const p = krsProgress(obj.krs || []);
  const reached = p !== null && p >= 100;
  const [outcome, setOutcome] = useState(isObjAchieved(obj.statut) ? "Atteint" : reached ? "Atteint" : isObjClosed(obj.statut) ? obj.statut : "Atteint");
  const a0 = obj.clotureAnswers || {};
  const [why, setWhy]       = useState(a0.why || "");
  const [learned, setLearned] = useState(a0.learned || "");
  const [how, setHow]       = useState(a0.how || "");
  const [failWhy, setFailWhy] = useState(a0.failWhy || "");
  const failed = outcome === "Échoué" || outcome === "Abandonné";
  const OUTCOMES = [["Atteint",C.green,"🏆"],["Échoué",C.red,"💥"],["Abandonné",C.red,"🏳️"]];
  const field = (label, value, onChange, ph) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={ph} rows={2}
        style={{ width: "100%", boxSizing: "border-box", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "9px 12px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }} />
    </div>
  );
  const archive = () => {
    onArchive(obj.id, levelId, {
      statut: outcome,
      clotureAnswers: { why: why.trim(), learned: learned.trim(), how: how.trim(), failWhy: failWhy.trim() },
      clotureDate: todayStr(),
      clotureProgress: p,
    });
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,4,15,0.72)", backdropFilter: "blur(6px)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="slide-up" style={{ width: "100%", maxWidth: 480, background: C.surface, borderRadius: 22, border: `1px solid ${C.amber}55`, padding: 22, maxHeight: "90vh", overflowY: "auto", boxShadow: `0 24px 60px rgba(0,0,0,0.55), 0 0 40px ${C.amber}22` }}>
        <div style={{ fontSize: 10, color: C.amber, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>🔒 Clôture · {lv?.icon} {lv?.label}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 16 }}>{obj.titre}</div>

        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Résultat final</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {OUTCOMES.map(([k, c, ic]) => (
            <button key={k} onClick={() => setOutcome(k)} style={{ flex: 1, padding: "10px 6px", borderRadius: 12, fontSize: 12, fontWeight: outcome === k ? 700 : 500, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${outcome === k ? c : C.border}`, background: outcome === k ? `${c}22` : "transparent", color: outcome === k ? c : C.muted }}>{ic} {k}</button>
          ))}
        </div>

        {field("Pourquoi avoir créé cet OKR ?", why, setWhy, "L'intention de départ...")}
        {field("Qu'as-tu appris de cet OKR ?", learned, setLearned, "Le principal apprentissage...")}
        {!failed
          ? field("Grâce à quelle action / habitude principale ?", how, setHow, "Le levier clé de la réussite...")
          : field("Pourquoi échoué / abandonné ?", failWhy, setFailWhy, "La cause principale...")}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          <Btn onClick={archive} variant="accent" style={{ width: "100%", background: C.amber, color: "#1a1200" }}>🔒 Clôturer & archiver</Btn>
          <Btn onClick={onClose} variant="ghost" style={{ width: "100%" }}>Annuler</Btn>
        </div>
      </div>
    </div>
  );
}

// Randonnée (sentier vers le sommet) bleu — visuel des objectifs hebdo, écho aux montagnes du mensuel
function HikingArt({ idKey, fit = "cover", color = "#38BDF8" }) {
  const c = color;
  const id = `hk-${idKey}`;
  const pa = fit === "contain" ? "xMidYMid meet" : "xMidYMid slice";
  const pine = (x, y, s = 1) => (
    <g>
      <path d={`M${x},${y} l${-6 * s},${11 * s} l${12 * s},0 Z`} fill={`${c}88`} />
      <path d={`M${x},${y + 6 * s} l${-7.5 * s},${11 * s} l${15 * s},0 Z`} fill={`${c}5a`} />
      <rect x={x - 1.2} y={y + 16 * s} width="2.4" height={5 * s} fill={`${c}88`} />
    </g>
  );
  // viewBox large 480x150, scène ancrée en bas, drapeau ~33% (survit au cover-crop)
  return (
    <svg viewBox="0 0 480 150" preserveAspectRatio={pa} style={{ display: "block", width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={`${id}-h`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={`${c}66`} /><stop offset="100%" stopColor={`${c}12`} /></linearGradient>
      </defs>
      {/* soleil */}
      <circle cx="410" cy="50" r="15" fill={`${c}22`} /><circle cx="410" cy="50" r="8" fill={c} opacity="0.9" />
      {/* crête arrière */}
      <path d="M0,150 L90,100 L170,120 L260,86 L350,116 L420,96 L480,118 L480,150 Z" fill={`${c}1c`} />
      {/* colline avant + sommet central */}
      <path d="M0,150 L120,116 L240,70 L360,112 L480,100 L480,150 Z" fill={`url(#${id}-h)`} stroke={`${c}44`} strokeWidth="0.9" />
      {/* sommet enneigé */}
      <path d="M240,70 L231,86 L249,86 Z" fill={c} opacity="0.9" />
      {/* sentier sinueux vers le sommet */}
      <path d="M55,150 C110,134 92,116 150,112 C205,108 188,86 240,74" fill="none" stroke={`${c}d0`} strokeWidth="2.4" strokeDasharray="4.5 4.8" strokeLinecap="round" />
      {/* drapeau */}
      <line x1="240" y1="72" x2="240" y2="50" stroke={c} strokeWidth="2" />
      <path d="M240,50 L256,55.5 L240,61 Z" fill={c} />
      {/* pins */}
      {pine(64, 132)}{pine(352, 118, 0.95)}{pine(408, 110, 0.85)}
    </svg>
  );
}

// Art de fond par niveau (basé sur l'émoji du niveau). Bandeau dédié, rien ne passe dessus.
function LevelArt({ levelId, color, reached, idKey, fit = "slice" }) {
  const lc = color;
  const glow = reached ? C.green : color;
  const id = `${levelId}-${idKey}`;
  const pa = fit === "meet" ? "xMidYMid meet" : fit === "cover" ? "xMidYMid slice" : "xMidYMax slice";
  const svg = { display: "block", width: "100%", height: "100%" };
  const Star = ({ x, y, r }) => <circle cx={x} cy={y} r={r} fill={glow} />;

  if (levelId === "mensuel") return ( // 🗻 montagnes
    <svg viewBox="0 0 300 110" preserveAspectRatio={pa} style={svg}>
      <defs>
        <linearGradient id={`mt-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={`${lc}55`} /><stop offset="100%" stopColor={`${lc}10`} /></linearGradient>
      </defs>
      <circle cx="252" cy="26" r="9" fill={`${glow}26`} /><circle cx="252" cy="26" r="5.5" fill={glow} opacity="0.9" />
      <path d="M0,110 L58,58 L108,80 L160,44 L214,74 L262,52 L300,78 L300,110 Z" fill={`${lc}1a`} />
      <path d="M0,110 L48,72 L100,40 L150,66 L196,30 L246,64 L300,48 L300,110 Z" fill={`url(#mt-${id})`} stroke={`${lc}40`} strokeWidth="0.7" />
      <path d="M196,30 L186,46 L206,46 Z" fill={glow} opacity="0.95" />
      <path d="M100,40 L92,52 L108,52 Z" fill={`${glow}cc`} />
      <path d="M0,110 L72,82 L138,64 L190,80 L252,60 L300,80 L300,110 Z" fill="rgba(0,0,0,0.34)" />
    </svg>
  );
  if (levelId === "trimestriel") return ( // 🌍 planète
    <svg viewBox="0 0 300 110" preserveAspectRatio={pa} style={svg}>
      <defs>
        <radialGradient id={`atm-${id}`} cx="50%" cy="100%" r="70%"><stop offset="55%" stopColor={`${lc}00`} /><stop offset="85%" stopColor={`${glow}26`} /><stop offset="100%" stopColor={`${glow}00`} /></radialGradient>
        <radialGradient id={`pl-${id}`} cx="38%" cy="34%" r="80%"><stop offset="0%" stopColor={`${lc}40`} /><stop offset="100%" stopColor={`${lc}0d`} /></radialGradient>
      </defs>
      <rect x="0" y="0" width="300" height="110" fill={`url(#atm-${id})`} />
      <Star x="40" y="26" r="1.6" /><Star x="250" y="20" r="2.2" /><Star x="200" y="36" r="1.2" /><Star x="80" y="44" r="1.3" />
      <circle cx="150" cy="178" r="128" fill={`url(#pl-${id})`} stroke={`${lc}55`} strokeWidth="1" />
      <path d="M44,92 Q150,74 256,92" fill="none" stroke={`${lc}55`} strokeWidth="0.8" />
      <path d="M30,108 Q150,86 270,108" fill="none" stroke={`${lc}40`} strokeWidth="0.8" />
      <path d="M150,52 Q96,98 150,150" fill="none" stroke={`${lc}33`} strokeWidth="0.7" />
      <path d="M150,52 Q204,98 150,150" fill="none" stroke={`${lc}33`} strokeWidth="0.7" />
      <ellipse cx="150" cy="96" rx="142" ry="18" fill="none" stroke={`${glow}40`} strokeWidth="0.9" />
      <circle cx="288" cy="86" r="3" fill={glow} />
    </svg>
  );
  if (levelId === "annuel") return ( // 🌌 galaxie
    <svg viewBox="0 0 300 110" preserveAspectRatio={pa} style={svg}>
      <defs>
        <radialGradient id={`neb-${id}`} cx="52%" cy="62%" r="60%"><stop offset="0%" stopColor={`${lc}40`} /><stop offset="100%" stopColor={`${lc}00`} /></radialGradient>
        <radialGradient id={`core-${id}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fff" /><stop offset="40%" stopColor={glow} /><stop offset="100%" stopColor={`${glow}00`} /></radialGradient>
      </defs>
      <ellipse cx="158" cy="68" rx="150" ry="46" fill={`url(#neb-${id})`} />
      <path d="M20,74 Q110,30 168,62 Q224,90 296,58" fill="none" stroke={`${lc}66`} strokeWidth="1" />
      <path d="M16,58 Q120,92 170,64 Q226,40 300,72" fill="none" stroke={`${lc}3a`} strokeWidth="0.9" />
      <ellipse cx="158" cy="64" rx="16" ry="9" fill={`url(#core-${id})`} />
      {[[42,40,2],[84,26,1.4],[120,50,1.6],[176,28,2.1],[214,46,1.4],[150,64,1.4],[96,70,1.6],[244,62,1.4],[60,58,1.3],[268,34,1.6],[30,90,1.2]].map(([x,y,r],i)=><Star key={i} x={x} y={y} r={r} />)}
    </svg>
  );
  return ( // 👁️ œil (Long Terme — vision)
    <svg viewBox="0 0 300 110" preserveAspectRatio={pa} style={svg}>
      <defs>
        <radialGradient id={`iris-${id}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={`${glow}`} /><stop offset="55%" stopColor={`${lc}55`} /><stop offset="100%" stopColor={`${lc}14`} /></radialGradient>
      </defs>
      <Star x="46" y="30" r="1.5" /><Star x="256" y="30" r="1.5" /><Star x="150" y="14" r="1.3" />
      <path d="M8,66 Q150,2 292,66 Q150,128 8,66 Z" fill={`${lc}10`} stroke={`${lc}45`} strokeWidth="0.9" />
      {Array.from({length:14}).map((_,i)=>{const a=(i/14)*Math.PI*2;return <line key={i} x1={150+Math.cos(a)*16} y1={66+Math.sin(a)*16} x2={150+Math.cos(a)*32} y2={66+Math.sin(a)*32} stroke={`${lc}33`} strokeWidth="0.7" />;})}
      <circle cx="150" cy="66" r="32" fill={`url(#iris-${id})`} stroke={`${lc}66`} strokeWidth="0.9" />
      <circle cx="150" cy="66" r="12" fill="#05040f" />
      <circle cx="150" cy="66" r="12" fill="none" stroke={glow} strokeWidth="1" />
      <circle cx="142" cy="58" r="4" fill={`${glow}cc`} />
    </svg>
  );
}

function ObjectifCard({ obj, levelColor, levelId, allGoals, onOpenEdit }) {
  const krs = obj.krs||[];
  const avgPct = krsProgress(krs);
  const reached = avgPct!==null && avgPct>=100;
  const isDone = isObjAchieved(obj.statut);
  const parentLevelId = LEVEL_PARENT[levelId];
  const parentLevel   = LEVELS.find(l=>l.id===parentLevelId);
  const parentObj     = obj.parentId?(allGoals[parentLevelId]||[]).find(p=>p.id===obj.parentId):null;
  const childLevelId  = LEVEL_CHILD[levelId];
  const childCount    = childLevelId?(allGoals[childLevelId]||[]).filter(o=>o.parentId===obj.id).length:0;
  const accent = isDone ? C.green : levelColor;
  const doneKr = krs.filter(k=>krPct(k)>=100).length;
  const isMtn = levelId==="mensuel";
  const artFit = isMtn ? "slice" : "cover";
  const artMask = isMtn
    ? "radial-gradient(125% 145% at 50% 112%, #000 54%, rgba(0,0,0,0) 100%)"
    : "radial-gradient(ellipse 86% 86% at 50% 46%, #000 36%, rgba(0,0,0,0) 88%)";
  const TS = "0 1px 6px rgba(0,0,0,0.6)";
  return (
    <div onClick={()=>onOpenEdit(obj)} style={{
      position:"relative", overflow:"hidden", borderRadius:18, minHeight:248,
      display:"flex", flexDirection:"column", cursor:"pointer", opacity:isDone?0.62:1,
      background:`linear-gradient(180deg, ${levelColor}18, ${C.surface2} 58%)`,
      border:`1px solid ${levelColor}30`, boxShadow:`0 0 16px ${levelColor}18`,
    }}>
      {/* Art en fond pleine carte, fondu (émerge du fond), décalé vers le bas */}
      <div style={{position:"absolute", inset:0, zIndex:0, transform:"translateY(16%)", WebkitMaskImage:artMask, maskImage:artMask}}>
        <LevelArt levelId={levelId} color={levelColor} reached={reached} idKey={obj.id} fit={artFit} />
      </div>

      {/* Contenu par-dessus */}
      <div style={{position:"relative", zIndex:1, display:"flex", flexDirection:"column", flex:1, padding:"15px 16px 12px"}}>
        {/* Haut : niveau + % / statut */}
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9}}>
          <span style={{fontSize:17, lineHeight:1, filter:`drop-shadow(0 0 6px ${levelColor}aa)`}}>{LEVELS.find(l=>l.id===levelId)?.icon}</span>
          {avgPct!==null
            ? <span style={{fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:accent, fontVariantNumeric:"tabular-nums", lineHeight:1, textShadow:TS}}>{reached?"🏔 ":""}{avgPct}<span style={{fontSize:13}}>%</span></span>
            : <StatusPill statut={obj.statut}/>}
        </div>

        {/* Titre */}
        <div style={{fontSize:14.5, fontWeight:700, color:isDone?C.muted:C.text, textDecoration:isDone?"line-through":"none", lineHeight:1.32, overflow:"hidden", textOverflow:"ellipsis", display:"-webkit-box", WebkitLineClamp:3, WebkitBoxOrient:"vertical", textShadow:TS}}>{obj.titre}</div>

        <div style={{flex:1, minHeight:36}} />

        {/* Barre de progression */}
        {avgPct!==null&&(
          <div style={{height:5, borderRadius:3, background:"rgba(0,0,0,0.5)", overflow:"hidden"}}>
            <div style={{height:"100%", width:`${avgPct}%`, background:`linear-gradient(90deg, ${levelColor}, ${accent})`, borderRadius:3, boxShadow:`0 0 8px ${accent}66`, transition:"width 0.5s"}}/>
          </div>
        )}
      </div>
    </div>
  );
}

// ── LIFE PLAN — arbre horizontal type carte/constellation (tidy-tree, branches courbes néon)
function LifePlanTree({ goals, onOpenEdit }) {
  const [showArch, setShowArch] = useState(false);
  const COLW = 244, NODEW = 196, NODEH = 60, ROWH = 78, HEADH = 44, PADX = 12, PADY = 14;
  const lvIndex = id => LEVELS.findIndex(l => l.id === id);

  // Layout "tidy tree" : feuilles séquentielles, parents centrés sur leurs enfants
  const nodeMap = {};
  let slot = 0;
  const place = (obj, level) => {
    if (nodeMap[obj.id]) return nodeMap[obj.id].y;
    const childLvl = LEVEL_CHILD[level];
    const children = childLvl ? (goals[childLvl] || []).filter(o => o.parentId === obj.id && !o.archived) : [];
    let y;
    if (!children.length) { y = slot; slot += 1; }
    else { const ys = children.map(c => place(c, childLvl)); y = (Math.min(...ys) + Math.max(...ys)) / 2; }
    nodeMap[obj.id] = { obj, level, y };
    return y;
  };
  (goals.lt || []).filter(o => !o.archived).forEach(o => place(o, "lt"));
  ["annuel", "trimestriel", "mensuel"].forEach(lvl => {
    const pl = LEVEL_PARENT[lvl];
    (goals[lvl] || []).filter(o => !o.archived && (!o.parentId || !(goals[pl] || []).some(p => p.id === o.parentId))).forEach(o => place(o, lvl));
  });
  const archived = ["lt","annuel","trimestriel","mensuel"].flatMap(lvl => (goals[lvl] || []).filter(o => o.archived).map(o => ({ o, lvl })))
    .sort((a, b) => (b.o.clotureDate || "").localeCompare(a.o.clotureDate || ""));
  const nodes = Object.values(nodeMap);
  const empty = nodes.length === 0;

  const nodeLeft = level => lvIndex(level) * COLW + PADX;
  const nodeTop  = y => HEADH + PADY + y * ROWH;
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y), 0);
  const totalW = 4 * COLW;
  const totalH = HEADH + PADY * 2 + (maxY + 1) * ROWH;

  // Liens parent → enfant (bézier horizontal)
  const links = [];
  nodes.forEach(n => {
    const childLvl = LEVEL_CHILD[n.level];
    if (!childLvl) return;
    nodes.filter(m => m.level === childLvl && m.obj.parentId === n.obj.id).forEach(c => {
      const x1 = nodeLeft(n.level) + NODEW, y1 = nodeTop(n.y) + NODEH / 2;
      const x2 = nodeLeft(c.level), y2 = nodeTop(c.y) + NODEH / 2;
      const mx = (x1 + x2) / 2;
      links.push({ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, c: LEVELS.find(l => l.id === n.level)?.c || C.accent });
    });
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>🌳 Life Plan</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Carte de tes objectifs reliés, du Long Terme au Mensuel. {totalW > 700 && "Fais défiler ↔"}</div>
      </div>
      {empty
        ? <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "48px 0" }}>Aucun objectif. Crée-en et relie-les via « Rattaché à » entre chronologies.</div>
        : (
        <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 8, borderRadius: 18 }}>
          <div style={{ position: "relative", width: totalW, height: totalH, minWidth: totalW }}>
            {/* Branches */}
            <svg width={totalW} height={totalH} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <defs>
                <filter id="lp-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <g filter="url(#lp-glow)" fill="none">
                {links.map((l, i) => <path key={`g${i}`} d={l.d} stroke={`${l.c}40`} strokeWidth="4" />)}
              </g>
              <g fill="none">
                {links.map((l, i) => <path key={`c${i}`} d={l.d} stroke={`${l.c}cc`} strokeWidth="1.6" />)}
              </g>
            </svg>

            {/* En-têtes colonnes */}
            {LEVELS.map(l => (
              <div key={l.id} style={{ position: "absolute", left: nodeLeft(l.id), top: 0, width: NODEW, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 15, filter: `drop-shadow(0 0 5px ${l.c}aa)` }}>{l.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: l.c, textTransform: "uppercase", letterSpacing: "0.08em" }}>{l.label}</span>
              </div>
            ))}

            {/* Nœuds */}
            {nodes.map(n => {
              const lv = LEVELS.find(l => l.id === n.level);
              const p = krsProgress(n.obj.krs || []);
              const reached = p !== null && p >= 100;
              const st = STATUTS[n.obj.statut] || { c: C.muted };
              const ac = reached ? C.green : lv.c;
              const closed = isObjClosed(n.obj.statut);
              return (
                <button key={n.obj.id} onClick={() => onOpenEdit(n.obj, n.level)} title={n.obj.titre} style={{
                  position: "absolute", left: nodeLeft(n.level), top: nodeTop(n.y), width: NODEW, height: NODEH,
                  display: "flex", alignItems: "center", gap: 9, padding: "0 12px", borderRadius: 14, cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left", color: C.text, opacity: closed && !reached ? 0.6 : 1,
                  background: `linear-gradient(110deg, ${lv.c}2a, ${C.surface2} 72%)`, border: `1px solid ${lv.c}5a`, boxShadow: `0 0 16px ${lv.c}22`,
                }}>
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 14, background: `${lv.c}26`, border: `1px solid ${lv.c}66`, boxShadow: `0 0 10px ${lv.c}55` }}>{lv.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textDecoration: !reached && closed ? "line-through" : "none" }}>{n.obj.titre}</span>
                  {p !== null
                    ? <span style={{ flexShrink: 0, fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, color: ac, fontVariantNumeric: "tabular-nums" }}>{reached ? "🏆" : ""}{p}<span style={{ fontSize: 9 }}>%</span></span>
                    : <span title={n.obj.statut} style={{ flexShrink: 0, width: 10, height: 10, borderRadius: "50%", background: st.c, boxShadow: `0 0 7px ${st.c}` }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ARCHIVE — OKR clôturés (anciens objectifs + key results) */}
      {archived.length > 0 && (
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
          <button onClick={() => setShowArch(s => !s)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: showArch ? 14 : 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>📦 Archive</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: C.surface3, borderRadius: 999, padding: "2px 9px" }}>{archived.length}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>{showArch ? "▲" : "▼"}</span>
          </button>
          {showArch && (
            <div className="goals-grid">
              {archived.map(({ o, lvl }) => {
                const lv = LEVELS.find(l => l.id === lvl);
                const oc = STATUTS[o.statut] || { c: C.muted };
                const a = o.clotureAnswers || {};
                return (
                  <div key={o.id} onClick={() => onOpenEdit(o, lvl)} style={{ cursor: "pointer", borderRadius: 16, padding: "13px 15px", background: C.surface2, border: `1px solid ${C.border}`, opacity: 0.96 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 15 }}>{lv?.icon}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.titre}</span>
                      <StatusPill statut={o.statut} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted, marginBottom: 8 }}>
                      <span>{periodeLabel(o.periode) || lv?.label}</span>
                      {o.clotureProgress != null && <span style={{ color: oc.c, fontWeight: 700 }}>· {o.clotureProgress}%</span>}
                      {o.clotureDate && <span style={{ marginLeft: "auto", color: C.faint }}>clôturé {o.clotureDate}</span>}
                    </div>
                    {(o.krs || []).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: a.why || a.learned ? 8 : 0 }}>
                        {(o.krs || []).map(kr => (
                          <div key={kr.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: krPct(kr) >= 100 ? C.green : C.muted }} />
                            <span style={{ flex: 1, minWidth: 0, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kr.nom}</span>
                            <span style={{ color: C.faint, fontVariantNumeric: "tabular-nums" }}>{krPct(kr)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(a.why || a.learned || a.how || a.failWhy) && (
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                        {a.why && <div style={{ fontSize: 11 }}><span style={{ color: C.faint }}>Pourquoi : </span><span style={{ color: C.muted }}>{a.why}</span></div>}
                        {a.learned && <div style={{ fontSize: 11 }}><span style={{ color: C.faint }}>Appris : </span><span style={{ color: C.muted }}>{a.learned}</span></div>}
                        {a.how && <div style={{ fontSize: 11 }}><span style={{ color: C.green }}>Levier : </span><span style={{ color: C.muted }}>{a.how}</span></div>}
                        {a.failWhy && <div style={{ fontSize: 11 }}><span style={{ color: C.red }}>Cause : </span><span style={{ color: C.muted }}>{a.failWhy}</span></div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const OBJ_MAX_PER_LEVEL = 6;
// Petit sélecteur d'émoji inline (même DA)
const RM_EMOJIS = ["🗺","📊","🧠","💡","🎯","🚀","🗂️","📌","🔭","🧩","📈","🌐","🛠️","📋","✨","🔥","📅","🧭"];
function MiroMetaEdit({ name, emoji, onMeta }) {
  const [editName, setEditName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [pick, setPick] = useState(false);
  useEffect(() => setDraftName(name), [name]);
  const commit = () => { onMeta(draftName.trim() || "Roadmap", emoji); setEditName(false); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
      <span onClick={() => setPick(p => !p)} title="Changer l'émoji" style={{ fontSize: 20, cursor: "pointer", lineHeight: 1 }}>{emoji}</span>
      {editName
        ? <input autoFocus value={draftName} onChange={e => setDraftName(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraftName(name); setEditName(false); } }}
            style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: C.text, background: "transparent", border: "none", borderBottom: `1px solid ${C.accent}`, outline: "none", width: 200, letterSpacing: "-0.01em" }} />
        : <span onClick={() => setEditName(true)} title="Renommer" style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: C.text, cursor: "pointer", letterSpacing: "-0.01em" }}>{name}</span>}
      {pick && (
        <div style={{ position: "absolute", top: "120%", left: 0, zIndex: 50, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 14, padding: 10, display: "grid", gridTemplateColumns: "repeat(6, 34px)", gap: 4, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {RM_EMOJIS.map(e => (
            <button key={e} onClick={() => { onMeta(name, e); setPick(false); }} style={{ width: 34, height: 34, borderRadius: 9, fontSize: 18, cursor: "pointer", background: emoji === e ? C.accentBg : "transparent", border: `1px solid ${emoji === e ? C.accent : "transparent"}` }}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tableau MIRO intégré (live-embed iframe) — éditable si connecté à Miro
function MiroRoadmap({ name = "Roadmap", emoji = "🗺", onMeta }) {
  const [raw, setRaw] = useState(() => getLS("lp_roadmap_miro", ""));
  const [editing, setEditing] = useState(() => !getLS("lp_roadmap_miro", ""));
  const [draft, setDraft] = useState(() => getLS("lp_roadmap_miro", ""));

  const toEmbed = (s) => {
    if (!s) return "";
    const t = s.trim();
    const srcM = t.match(/src=["']([^"']+)["']/); // iframe collé
    if (srcM) return srcM[1];
    if (t.includes("live-embed")) return t;
    const idM = t.match(/board\/([^/?\s]+)/); // lien de partage Miro
    if (idM) return `https://miro.com/app/live-embed/${idM[1]}/?autoplay=true`;
    return t;
  };
  const embed = toEmbed(raw);
  const save = () => { const v = draft.trim(); setRaw(v); setLS("lp_roadmap_miro", v); setEditing(false); };

  if (editing || !embed) {
    return (
      <div style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 14 }}><MiroMetaEdit name={name} emoji={emoji} onMeta={onMeta} /></div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
          Colle le <b style={{ color: C.text }}>lien de partage</b> de ton tableau Miro (ou le code d'intégration iframe).<br />
          Dans Miro : <b style={{ color: C.text }}>Partager → Intégrer → copier</b>. Vérifie que le partage autorise la modification pour pouvoir éditer ici.
        </div>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} placeholder="https://miro.com/app/board/uXjV…=/  ou  <iframe src=…>"
          style={{ width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.text, borderRadius: 12, padding: "12px 14px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={!draft.trim()} style={{ background: GRAD, color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: draft.trim() ? 1 : 0.5, boxShadow: GLOW_SM }}>Afficher la roadmap</button>
          {embed && <button onClick={() => { setDraft(raw); setEditing(false); }} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 18px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
        <MiroMetaEdit name={name} emoji={emoji} onMeta={onMeta} />
        <button onClick={() => { setDraft(raw); setEditing(true); }} style={{ background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Changer le tableau</button>
      </div>
      <div style={{ position: "relative", width: "100%", height: "72vh", borderRadius: 18, overflow: "hidden", border: `1px solid ${C.borderMid}`, background: C.surface2 }}>
        <iframe
          src={embed} title="Roadmap Miro"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
        />
      </div>
    </div>
  );
}

function ObjectifsModule({ initialTab = "lt" }) {
  const [goals, setGoals]   = useState(()=>getLS("lp_goals",NOTION_GOALS));
  const [tab, setTab]       = useState(initialTab);
  useEffect(()=>{ if(initialTab) setTab(initialTab); }, [initialTab]);
  const [rmName, setRmName]   = useState(()=>getLS("lp_roadmap_name","Roadmap"));
  const [rmEmoji, setRmEmoji] = useState(()=>getLS("lp_roadmap_emoji","🗺"));
  const saveRmMeta = (name, emoji) => { setRmName(name); setRmEmoji(emoji); setLS("lp_roadmap_name", name); setLS("lp_roadmap_emoji", emoji); };
  const [newTitre, setNewTitre] = useState("");
  const [newSpaces, setNewSpaces] = useState([]);
  const [newParentId, setNewParentId] = useState("");
  const [editObj, setEditObj]   = useState(null);
  const [editLevel, setEditLevel] = useState("lt");
  const [showAdd, setShowAdd]   = useState(false);
  const [cloture, setCloture]   = useState(null); // { obj, lvl }
  const [toast, setToast]       = useState(null); // { id, lvl, prev }
  const toastTimer = useRef(null);
  const openEdit = (o, lvl) => { setEditObj(o); setEditLevel(lvl); };
  const save = d=>{setGoals(d);setLS("lp_goals",d);};
  const level = LEVELS.find(l=>l.id===tab);
  const items = (goals[tab]||[]).filter(o=>!o.archived);
  const parentLevelId = LEVEL_PARENT[tab];
  const parentLevel   = LEVELS.find(l=>l.id===parentLevelId);
  const parentOptions = parentLevelId?(goals[parentLevelId]||[]).filter(o=>!o.archived):[];
  const atMax = items.length >= OBJ_MAX_PER_LEVEL;
  const add = () => {
    if(!newTitre.trim() || atMax) return;
    const obj={id:uid(),titre:newTitre.trim(),statut:"Ça arrive",spaces:newSpaces,krs:[],...(newParentId?{parentId:newParentId}:{})};
    save({...goals,[tab]:[...(goals[tab]||[]),obj]}); setNewTitre(""); setNewSpaces([]); setNewParentId(""); setShowAdd(false);
  };
  const activeCount = items.filter(o=>!isObjClosed(o.statut)).length;
  const doneCount   = items.filter(o=>isObjAchieved(o.statut)).length;
  useEffect(()=>()=>{ if(toastTimer.current) clearTimeout(toastTimer.current); },[]);
  const archiveObj = (id, lvl, patch) => {
    const cur = (goals[lvl]||[]).find(o=>o.id===id);
    save({...goals,[lvl]:(goals[lvl]||[]).map(o=>o.id===id?{...o,...patch,archived:true}:o)});
    setCloture(null); setEditObj(null);
    if(toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id, lvl, prev: cur });
    toastTimer.current = setTimeout(()=>setToast(null), 10000);
  };
  const undoArchive = () => {
    if(!toast) return;
    save({...goals,[toast.lvl]:(goals[toast.lvl]||[]).map(o=>o.id===toast.id?toast.prev:o)});
    if(toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  };
  return (
    <div className="theme-light" style={{minHeight:"100dvh", ...(tab==="roadmap" ? { background:"#000", backgroundImage:"none" } : {})}}>
      <CFHeader eyebrow="Vision &amp; cap" title="Objectifs" />
      <div style={{padding:"4px 16px 100px"}}>
        <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}}>
          {(() => { const lp=tab==="lifeplan"; return (
            <button onClick={()=>setTab("lifeplan")} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:`1px solid ${lp?C.accent:C.borderMid}`,background:lp?GRAD:C.surface2,color:lp?"#fff":C.accent,fontWeight:700,display:"flex",alignItems:"center",gap:6,boxShadow:lp?GLOW_SM:"none"}}>
              <span>🌳</span><span>Life Plan</span>
            </button>
          );})()}
          {LEVELS.map(l=>{
            const cnt=(goals[l.id]||[]).filter(o=>!isObjClosed(o.statut)&&!o.archived).length;
            const active=tab===l.id;
            return (
              <button key={l.id} onClick={()=>setTab(l.id)} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,fontSize:12,fontFamily:"inherit",border:`1px solid ${active?l.c:C.border}`,background:active?l.c+"18":C.surface2,color:active?l.c:C.muted,fontWeight:active?600:400,display:"flex",alignItems:"center",gap:6}}>
                <span>{l.icon}</span><span>{l.label}</span>
                {cnt>0&&<span style={{background:l.c+"30",color:l.c,padding:"1px 7px",borderRadius:999,fontSize:10,fontWeight:700}}>{cnt}</span>}
              </button>
            );
          })}
          {(() => { const rm=tab==="roadmap"; return (
            <button onClick={()=>setTab("roadmap")} style={{flexShrink:0,padding:"8px 16px",borderRadius:999,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:`1px solid ${rm?"#22D3EE":C.border}`,background:rm?"rgba(34,211,238,0.16)":C.surface2,color:rm?"#22D3EE":C.muted,fontWeight:rm?700:400,display:"flex",alignItems:"center",gap:6}}>
              <span>{rmEmoji}</span><span>{rmName}</span>
            </button>
          );})()}
        </div>

        {tab==="roadmap" ? (
          <MiroRoadmap name={rmName} emoji={rmEmoji} onMeta={saveRmMeta} />
        ) : tab==="lifeplan" ? (
          <LifePlanTree goals={goals} onOpenEdit={openEdit} />
        ) : (<>
        {/* En-tête niveau + crayon d'ajout */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <span style={{fontSize:14,fontWeight:700,color:level.c,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:17,filter:`drop-shadow(0 0 5px ${level.c}aa)`}}>{level.icon}</span>{level.label}
            <span style={{fontSize:10,fontWeight:700,color:atMax?C.amber:C.faint,fontVariantNumeric:"tabular-nums"}}>{items.length}/{OBJ_MAX_PER_LEVEL}</span>
          </span>
          <button onClick={()=>{ if(!atMax) setShowAdd(s=>!s); }} title={atMax?`Maximum ${OBJ_MAX_PER_LEVEL} atteint`:"Ajouter un objectif"} style={{width:38,height:38,borderRadius:12,cursor:atMax?"not-allowed":"pointer",fontFamily:"inherit",fontSize:15,display:"inline-flex",alignItems:"center",justifyContent:"center",border:`1px solid ${showAdd?C.accent:C.borderMid}`,background:showAdd?GRAD:C.surface2,color:atMax?C.faint:showAdd?"#fff":C.accent,opacity:atMax?0.5:1,boxShadow:showAdd?GLOW_SM:"none"}}>{showAdd?"✕":"✏️"}</button>
        </div>
        {atMax&&<div style={{fontSize:12,color:C.amber,marginBottom:14}}>⚠️ Maximum {OBJ_MAX_PER_LEVEL} objectifs {level.label.toLowerCase()} par période. Clôture ou supprime-en un pour en ajouter.</div>}
        {showAdd&&!atMax&&(
          <div className="slide-up" style={{background:C.surface2,border:`1px solid ${C.borderMid}`,borderRadius:18,padding:16,marginBottom:20}}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <Input value={newTitre} onChange={setNewTitre} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Titre de l'objectif..." autoFocus/>
            {parentOptions.length>0&&(
              <div>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>↑ Lié à ({parentLevel?.label})</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <button onClick={()=>setNewParentId("")} style={{padding:"5px 12px",borderRadius:999,fontSize:11,border:`1px solid ${!newParentId?C.accent:C.border}`,background:!newParentId?C.accentBg:"transparent",color:!newParentId?C.accent:C.muted,fontFamily:"inherit",cursor:"pointer"}}>Aucun</button>
                  {parentOptions.map(p=>(
                    <button key={p.id} onClick={()=>setNewParentId(p.id)} style={{padding:"5px 12px",borderRadius:999,fontSize:11,border:`1px solid ${newParentId===p.id?C.accent:C.border}`,background:newParentId===p.id?C.accentBg:"transparent",color:newParentId===p.id?C.accent:C.muted,fontFamily:"inherit",cursor:"pointer"}}>{p.titre.length>28?p.titre.slice(0,28)+"…":p.titre}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(SPACES).map(([sp,{c,icon}])=>{
                const sel=newSpaces.includes(sp);
                return <button key={sp} onClick={()=>setNewSpaces(s=>s.includes(sp)?s.filter(x=>x!==sp):[...s,sp])} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${sel?c:C.border}`,background:sel?c+"20":"transparent",color:sel?c:C.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>{icon} {sp}</button>;
              })}
            </div>
            <Btn onClick={add} variant="accent" style={{width:"100%"}}>+ Ajouter</Btn>
          </div>
          </div>
        )}

        {items.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <span style={{fontSize:12,color:C.muted}}>{doneCount}/{items.length} terminés · {activeCount} actifs</span>
            <div style={{flex:1,maxWidth:160}}><ProgressBar value={items.length?doneCount/items.length*100:0} color={level.c}/></div>
          </div>
        )}
        {items.length===0
          ?<div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Aucun objectif {level.label.toLowerCase()}.</div>
          :<div className="goals-grid">{items.map(obj=><ObjectifCard key={obj.id} obj={obj} levelColor={level.c} levelId={tab} allGoals={goals} onOpenEdit={o=>openEdit(o,tab)}/>)}</div>
        }
        </>)}
      </div>

      {editObj&&(
        <ObjectifEditModal
          obj={editObj} levelId={editLevel} allGoals={goals}
          onUpdate={u=>{save({...goals,[editLevel]:(goals[editLevel]||[]).map(o=>o.id===u.id?u:o)});setEditObj(null);}}
          onDelete={id=>{save({...goals,[editLevel]:(goals[editLevel]||[]).filter(o=>o.id!==id)});setEditObj(null);}}
          onClose={()=>setEditObj(null)}
          onRequestCloture={(o,lvl)=>setCloture({id:o.id,lvl})}
        />
      )}

      {cloture&&(()=>{ const o=(goals[cloture.lvl]||[]).find(x=>x.id===cloture.id); if(!o) return null; return (
        <ClotureModal obj={o} levelId={cloture.lvl} onArchive={archiveObj} onClose={()=>setCloture(null)} />
      );})()}

      {toast&&(
        <div key={toast.id} className="cal-toast" style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",zIndex:3000,minWidth:300,maxWidth:"92vw",borderRadius:14,overflow:"hidden",background:C.surface2,border:`1px solid ${C.amber}55`,boxShadow:`0 16px 40px rgba(0,0,0,0.5), 0 0 24px ${C.amber}33`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px"}}>
            <span style={{width:22,height:22,borderRadius:"50%",flexShrink:0,display:"inline-flex",alignItems:"center",justifyContent:"center",background:C.amber,color:"#1a1200",fontSize:12,fontWeight:900}}>🔒</span>
            <span style={{flex:1,minWidth:0,fontSize:13.5,fontWeight:600,color:C.text}}>OKR archivé · <span style={{color:C.muted,fontWeight:500}}>{toast.prev?.titre}</span></span>
            <button onClick={undoArchive} style={{flexShrink:0,padding:"6px 14px",borderRadius:999,cursor:"pointer",fontFamily:"inherit",background:"transparent",border:`1px solid ${C.borderMid}`,color:C.amber,fontSize:12,fontWeight:700}}>Annuler</button>
          </div>
          <div style={{height:3,background:`${C.amber}22`}}><div className="cal-toast-bar" style={{height:"100%",background:C.amber,boxShadow:`0 0 8px ${C.amber}`}}/></div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO — GTD v2 + CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
let SPHERES = _perso0.spheres || _D_SPHERES;
const MATRICES = {
  ui:   { label: "🔴 Urgent · Important",     short: "UI" },
  uni:  { label: "🟡 Urgent · Secondaire",    short: "U·S" },
  nui:  { label: "🔵 Important · Pas urgent", short: "I·PU" },
  nuni: { label: "⚫ Ni urgent ni important",  short: "—" },
};
const PROJ_STATUTS = {
  a_planifier: { label: "À planifier", c: C.faint },
  planifie:    { label: "Planifié",    c: C.blue },
  en_cours:    { label: "En cours",    c: C.green },
  depasse:     { label: "Dépassé",     c: C.red },
};
const getProjectStatus = (item) => {
  const today = todayStr();
  if (!item.dateFin) return "a_planifier";
  if (item.dateFin < today) return "depasse";
  const debut = item.dateDebut || item.dateFin;
  if (debut <= today && today <= item.dateFin) return "en_cours";
  return "planifie";
};
const migrateOneTodo = raw => {
  if (!raw) return null;
  // already new format
  if (raw.gtd && ("createdAt" in raw) && !("text" in raw) && !("domaine" in raw)) return raw;
  // old format
  const gtdMap = { projet:"projet", memo:"memo", someday:"someday", waiting:"waiting", highlight:"inbox", inbox:"inbox" };
  return {
    id: raw.id || uid(),
    name: raw.name || raw.text || "",
    gtd: gtdMap[raw.gtd || raw.type] || "inbox",
    sphere: raw.sphere || raw.domaine || undefined,
    matrice: raw.matrice || undefined,
    statut: raw.statut === "termine" || raw.status === "done" ? "termine" : raw.statut === "en_cours" || raw.status === "doing" ? "en_cours" : "a_planifier",
    sousTaches: raw.sousTaches || [],
    done: raw.done || raw.status === "done" || false,
    createdAt: raw.createdAt || (raw.date ? raw.date + "T00:00:00.000Z" : new Date().toISOString()),
  };
};
const loadTodos = () => {
  const stored = getLS("leplan_todos", null) || getLS("lp_todos", []);
  return (stored || []).map(migrateOneTodo).filter(Boolean);
};

// ── useTodos hook ──
function useTodos() {
  const [todos, setTodosState] = useState(loadTodos);
  const save = d => { setTodosState(d); setLS("leplan_todos", d); };
  const addTodo      = o => { const t={id:uid(),name:"",gtd:"inbox",done:false,createdAt:new Date().toISOString(),...o}; save([...todos,t]); return t; };
  const updateTodo   = (id,p) => save(todos.map(t=>t.id===id?{...t,...p}:t));
  const deleteTodo   = id => save(todos.filter(t=>t.id!==id));
  const toggleDone = id => {
    const t = todos.find(x=>x.id===id);
    if (!t) return;
    const becomingDone = !t.done;
    const updated = todos.map(x=>x.id===id?{...x,done:becomingDone,doneAt:becomingDone?new Date().toISOString():undefined}:x);
    if (becomingDone && t.recurrence?.enabled) {
      const nextDate = calculateNextOccurrence(t.dateFin||t.dateAssignee||new Date(), t.recurrence);
      const nextIso = nextDate.toISOString().split('T')[0];
      const next = {
        ...t, id:uid(), done:false, doneAt:undefined, createdAt:new Date().toISOString(),
        ...(t.dateFin ? {dateFin:nextIso} : {}),
        ...(t.dateAssignee ? {dateAssignee:nextIso} : {}),
      };
      updated.push(next);
    }
    save(updated);
  };
  const restoreTodo  = id => save(todos.map(t=>t.id===id?{...t,done:false,doneAt:undefined}:t));
  const classifyInbox= (id,p) => updateTodo(id,p);
  const addSousTache = (todoId,name) => { const todo=todos.find(t=>t.id===todoId); if(!todo) return; updateTodo(todoId,{sousTaches:[...(todo.sousTaches||[]),{id:uid(),name,done:false}]}); };
  const toggleSousTache = (todoId,stId) => { const todo=todos.find(t=>t.id===todoId); if(!todo) return; updateTodo(todoId,{sousTaches:(todo.sousTaches||[]).map(s=>s.id===stId?{...s,done:!s.done}:s)}); };
  const getByGTD     = g => todos.filter(t=>t.gtd===g);
  const getByMatrice = m => todos.filter(t=>t.matrice===m&&!t.done);
  const getBySphere  = s => todos.filter(t=>t.sphere===s);
  const getDoneItems = ({period='week',gtd='all',sphere='all'}={}) => {
    const now=new Date();
    const weekAgo=new Date(now); weekAgo.setDate(now.getDate()-7);
    const mStart=new Date(now.getFullYear(),now.getMonth(),1);
    const pmStart=new Date(now.getFullYear(),now.getMonth()-1,1);
    const pmEnd=new Date(now.getFullYear(),now.getMonth(),0);
    return todos.filter(item=>{
      if(!item.done) return false;
      if(gtd!=='all'&&item.gtd!==gtd) return false;
      if(sphere!=='all'&&item.sphere!==sphere) return false;
      const d=new Date(item.doneAt||item.createdAt);
      if(period==='week') return d>=weekAgo;
      if(period==='month') return d>=mStart;
      if(period==='prev_month') return d>=pmStart&&d<=pmEnd;
      return true;
    }).sort((a,b)=>(b.doneAt||b.createdAt)>(a.doneAt||a.createdAt)?1:-1);
  };
  const getProjectsForCalendar = (month,year) => todos.filter(t=>{
    if(t.gtd!=="projet"||!t.dateDebut||!t.dateFin) return false;
    const s=new Date(t.dateDebut+"T12:00:00"), e=new Date(t.dateFin+"T12:00:00");
    return s<=new Date(year,month+1,0) && e>=new Date(year,month,1);
  });
  const getMemosForDate = date => todos.filter(t=>t.gtd==="memo"&&t.dateAssignee===date&&!t.done&&!t.recurrence?.enabled);
  return {todos,addTodo,updateTodo,deleteTodo,toggleDone,restoreTodo,classifyInbox,addSousTache,toggleSousTache,getByGTD,getByMatrice,getBySphere,getDoneItems,getProjectsForCalendar,getMemosForDate};
}

// ── TaskSummaryModal ──
// ── DayCreateModal — clic sur un jour → choix du type → formulaire complet (date pré-remplie)
function DayCreateModal({ date, onCreate, onClose }) {
  const [gtd, setGtd] = useState(null);
  const [form, setForm] = useState({
    name:"", sphere:null, matrice:null,
    dateDebut:date, dateFin:date, dateFinType:"duedate",
    dateAssignee:date, waitingFor:"", waitingNote:"",
  });
  const set = p => setForm(f => ({ ...f, ...p }));
  const dateLong = new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" });

  const TYPES = [
    ["projet",  "🔴", "Projet",      C.red   ],
    ["memo",    "📝", "Mémo",        C.blue  ],
    ["waiting", "⏳", "Waiting For", C.amber ],
  ];
  const tc = (TYPES.find(t => t[0] === gtd) || [,,,C.accent])[3];

  const canCreate = !!gtd && form.name.trim() &&
    (gtd !== "projet"  || (form.sphere && form.matrice && form.dateFin)) &&
    (gtd !== "waiting" || form.waitingFor.trim());

  const handleCreate = () => {
    if (!canCreate) return;
    const u = { name:form.name.trim(), gtd, sphere:form.sphere || undefined };
    if (gtd === "projet")  Object.assign(u, { matrice:form.matrice, dateDebut:form.dateDebut || undefined, dateFin:form.dateFin, dateFinType:form.dateFinType, statut:"a_planifier", sousTaches:[] });
    else if (gtd === "memo")    u.dateAssignee = form.dateAssignee || undefined;
    else if (gtd === "waiting") Object.assign(u, { waitingFor:form.waitingFor.trim(), waitingNote:form.waitingNote || undefined, dateAssignee:form.dateAssignee || undefined });
    onCreate(u);
  };

  const DateField = ({ label, k }) => (
    <div style={{ flex:1 }}>
      <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>{label}</div>
      <input type="date" value={form[k]} onChange={e => set({ [k]:e.target.value })}
        style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border}`, color:C.text, padding:9, borderRadius:10, fontSize:12, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
    </div>
  );

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(5,4,15,0.72)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:16,
    }}>
      <div onClick={e => e.stopPropagation()} className="slide-up" style={{
        position:"relative", background:C.surface, border:`1px solid ${tc}55`, borderRadius:22,
        width:"100%", maxWidth:440, maxHeight:"88vh", overflowY:"auto",
        boxShadow:`0 24px 60px rgba(0,0,0,0.55), 0 0 40px ${tc}22`,
      }}>
        <div style={{ height:4, background:`linear-gradient(90deg, ${tc}, ${tc}00)` }} />
        <div style={{ padding:22 }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:18 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Nouvelle tâche</div>
              <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginTop:3, textTransform:"capitalize" }}>{dateLong}</div>
            </div>
            <button onClick={onClose} title="Fermer" style={{ width:32, height:32, borderRadius:10, flexShrink:0, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:14, background:"transparent", border:"none", color:C.muted }}>✕</button>
          </div>

          {/* Step 1 — type picker */}
          {!gtd && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {TYPES.map(([k, ic, l, c]) => (
                <button key={k} onClick={() => setGtd(k)} style={{
                  display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"20px 10px",
                  borderRadius:16, border:`1px solid ${c}40`, background:`linear-gradient(180deg, ${c}14, ${C.surface2})`,
                  color:C.text, fontFamily:"inherit", cursor:"pointer", boxShadow:`0 0 12px ${c}1f`,
                }}>
                  <span style={{ fontSize:26 }}>{ic}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:c }}>{l}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — full form */}
          {gtd && (<>
            <button onClick={() => setGtd(null)} style={{ display:"inline-flex", alignItems:"center", gap:5, marginBottom:16, background:"transparent", border:"none", color:C.muted, fontSize:12, fontFamily:"inherit", cursor:"pointer" }}>‹ Changer de type</button>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Nom</div>
              <Input value={form.name} onChange={v => set({ name:v })} placeholder="Nom de la tâche..." autoFocus />
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Sphère{gtd === "projet" ? " *" : ""}</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {Object.entries(SPHERES).map(([k, v]) => (
                  <button key={k} onClick={() => set({ sphere:form.sphere === k ? null : k })} style={{ padding:"6px 12px", borderRadius:999, border:`1px solid ${form.sphere === k ? v.c : C.border}`, background:form.sphere === k ? v.c + "22" : "transparent", color:form.sphere === k ? v.c : C.muted, fontSize:12, fontFamily:"inherit", cursor:"pointer" }}>{v.label}</button>
                ))}
              </div>
            </div>

            {gtd === "projet" && (<>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Matrice *</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {Object.entries(MATRICES).map(([k, v]) => (
                    <button key={k} onClick={() => set({ matrice:form.matrice === k ? null : k })} style={{ padding:"10px", borderRadius:12, border:`1px solid ${form.matrice === k ? C.accent : C.border}`, background:form.matrice === k ? C.accentBg : C.surface2, color:form.matrice === k ? C.accent : C.muted, fontSize:11, fontFamily:"inherit", cursor:"pointer", textAlign:"center" }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <DateField label="Date début" k="dateDebut" />
                <DateField label="Date fin *" k="dateFin" />
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {[["deadline","🔴 Deadline"],["duedate","🔵 Due Date"]].map(([k, l]) => (
                  <button key={k} onClick={() => set({ dateFinType:k })} style={{ flex:1, padding:9, borderRadius:10, border:`1px solid ${form.dateFinType === k ? C.accent : C.border}`, background:form.dateFinType === k ? C.accentBg : "transparent", color:form.dateFinType === k ? C.accent : C.muted, fontSize:12, fontFamily:"inherit", cursor:"pointer" }}>{l}</button>
                ))}
              </div>
            </>)}

            {gtd === "memo" && (
              <div style={{ marginBottom:14 }}>
                <DateField label="Date assignée *" k="dateAssignee" />
              </div>
            )}

            {gtd === "waiting" && (<>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>Qui ? *</div>
                <Input value={form.waitingFor} onChange={v => set({ waitingFor:v })} placeholder="Nom de la personne ou entité..." />
              </div>
              <div style={{ marginBottom:12 }}>
                <DateField label="Date de relance" k="dateAssignee" />
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:6 }}>Note (optionnel)</div>
                <Input value={form.waitingNote} onChange={v => set({ waitingNote:v })} placeholder="Contexte..." />
              </div>
            </>)}

            <Btn onClick={handleCreate} variant="accent" disabled={!canCreate} style={{ width:"100%", marginTop:4 }}>Créer la tâche</Btn>
          </>)}
        </div>
      </div>
    </div>
  );
}

function TaskSummaryModal({ item, onClose, onToggleSousTache, onEdit }) {
  const today = todayStr();
  const goals = getLS("lp_goals", {});
  const mensuelGoals = goals.mensuel || [];
  const linkedObj = item.objectifMensuelId ? mensuelGoals.find(o => o.id === item.objectifMensuelId) : null;
  const daysLeft = item.dateFin
    ? Math.ceil((new Date(item.dateFin + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000)
    : null;
  const subs = item.sousTaches || [];
  const doneSubs = subs.filter(s => s.done);
  const pct = subs.length ? Math.round(doneSubs.length / subs.length * 100) : 0;

  const TYPE_META = {
    projet:  { l:"Projet",   c:C.purple },
    memo:    { l:"Mémo",     c:C.blue   },
    waiting: { l:"Waiting",  c:C.amber  },
    someday: { l:"Someday",  c:C.faint  },
    inbox:   { l:"Inbox",    c:C.muted  },
  };
  const tm = TYPE_META[item.gtd] || { l:"Tâche", c:C.accent };
  const sc = SPHERES[item.sphere]?.c || tm.c;
  const statut = item.gtd === "projet" ? PROJ_STATUTS[getProjectStatus(item)] : null;
  const mat = MATRICES[item.matrice];
  const recur = item.recurrence?.enabled ? describeRecurrence(item.recurrence) : null;
  const fmtD = d => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day:"numeric", month:"short" }) : "—";

  const Pill = ({ c, children }) => (
    <span style={{ fontSize:10.5, fontWeight:700, padding:"3px 9px", borderRadius:999,
      color:c, background:`${c}1f`, border:`1px solid ${c}40`, whiteSpace:"nowrap" }}>{children}</span>
  );
  const IconBtn = ({ onClick, title, children, danger }) => (
    <button onClick={onClick} title={title} style={{
      width:32, height:32, borderRadius:10, flexShrink:0, cursor:"pointer", fontFamily:"inherit",
      display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:14,
      background: danger ? "transparent" : C.surface3,
      border:`1px solid ${danger ? "transparent" : C.border}`, color: C.muted,
    }}>{children}</button>
  );

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(5,4,15,0.72)", backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:16,
    }}>
      <div onClick={e => e.stopPropagation()} className="slide-up" style={{
        position:"relative", background: C.surface, border: `1px solid ${sc}55`,
        borderRadius: 22, width: "100%", maxWidth: 400, overflow:"hidden",
        boxShadow:`0 24px 60px rgba(0,0,0,0.55), 0 0 40px ${sc}22`,
      }}>
        {/* Accent glow bar */}
        <div style={{ height:4, background:`linear-gradient(90deg, ${sc}, ${sc}00)` }} />

        <div style={{ padding:22 }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:14 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:9 }}>
                <Pill c={tm.c}>{tm.l}</Pill>
                {item.sphere && <Pill c={sc}>{SPHERES[item.sphere]?.label}</Pill>}
                {statut && <Pill c={statut.c}>{statut.label}</Pill>}
              </div>
              <div style={{ fontSize:18, fontWeight:700, color:C.text, lineHeight:1.3, letterSpacing:"-0.01em" }}>{item.name}</div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <IconBtn onClick={onEdit} title="Modifier">✏️</IconBtn>
              <IconBtn onClick={onClose} title="Fermer" danger>✕</IconBtn>
            </div>
          </div>

          {/* Secondary chips */}
          {(mat || recur) && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
              {mat && <Pill c={C.muted}>{mat.label}</Pill>}
              {recur && <Pill c={C.accent}>🔄 {recur}</Pill>}
            </div>
          )}

          {/* Time remaining */}
          {daysLeft !== null && (() => {
            const urgent = daysLeft < 0 ? C.red : daysLeft <= 3 ? C.amber : C.green;
            return (
              <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14, padding:"12px 16px",
                borderRadius:14, background:`${urgent}14`, border:`1px solid ${urgent}33` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }}>Temps restant</div>
                  <div style={{ fontSize:21, fontWeight:800, color:urgent, fontFamily:"var(--font-display)", lineHeight:1 }}>
                    {daysLeft < 0 ? `${Math.abs(daysLeft)} j. dépassé` : daysLeft === 0 ? "Aujourd'hui" : `${daysLeft} j.`}
                  </div>
                </div>
                {(item.dateDebut || item.dateFin) && (
                  <div style={{ textAlign:"right", fontSize:11.5, color:C.faint, lineHeight:1.5, fontVariantNumeric:"tabular-nums" }}>
                    {item.dateDebut && <div>{fmtD(item.dateDebut)} →</div>}
                    <div style={{ color:C.muted, fontWeight:600 }}>{fmtD(item.dateFin)}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Memo date / waiting */}
          {item.gtd === "memo" && item.dateAssignee && (
            <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:12, background:C.surface2, border:`1px solid ${C.border}` }}>
              <span style={{ fontSize:11, color:C.muted }}>Assigné au </span>
              <span style={{ fontSize:13, color:C.text, fontWeight:600 }}>{fmtD(item.dateAssignee)}</span>
            </div>
          )}
          {item.gtd === "waiting" && item.waitingFor && (
            <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:12, background:C.amberBg, border:`1px solid ${C.amber}33` }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>En attente de</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:600 }}>{item.waitingFor}</div>
              {item.waitingNote && <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{item.waitingNote}</div>}
            </div>
          )}

          {/* Linked monthly objective */}
          {linkedObj && (
            <div style={{ marginBottom:14, padding:"10px 14px", borderRadius:12, background:C.amberBg, border:`1px solid ${C.amber}33` }}>
              <div style={{ fontSize:10, color:C.amber, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>⭐ Objectif mensuel</div>
              <div style={{ fontSize:13, color:C.text, fontWeight:500 }}>{linkedObj.titre || linkedObj.text || linkedObj.name}</div>
            </div>
          )}

          {/* Sub-tasks (interactive) */}
          {subs.length > 0 && (
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>Sous-tâches</div>
                <div style={{ flex:1, height:5, borderRadius:3, background:C.surface3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg, ${sc}, ${C.pink})`, borderRadius:3, transition:"width 0.35s", boxShadow:`0 0 8px ${sc}66` }}/>
                </div>
                <span style={{ fontSize:11, color:C.muted, flexShrink:0, fontVariantNumeric:"tabular-nums" }}>{doneSubs.length}/{subs.length}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {subs.map(s => (
                  <div key={s.id} onClick={() => onToggleSousTache(item.id, s.id)} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:10,
                    cursor:"pointer", opacity: s.done ? 0.5 : 1, background: s.done ? "transparent" : C.surface2,
                    border:`1px solid ${s.done ? "transparent" : C.border}`,
                  }}>
                    <span style={{ fontSize:15, color: s.done ? C.green : C.borderMid, flexShrink:0 }}>{s.done ? "●" : "○"}</span>
                    <span style={{ fontSize:13, color:C.text, textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProjectCard ──
function ProjectCard({item, todos, onUpdate, onDelete, onToggleDone, onEdit}) {
  const [expanded, setExpanded] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const sc = SPHERES[item.sphere]?.c || C.border;
  const st = PROJ_STATUTS[getProjectStatus(item)];
  const mat = MATRICES[item.matrice];
  const subs = item.sousTaches || [];
  const doneSubs = subs.filter(s=>s.done);
  const today = todayStr();
  const over = item.dateFin && item.dateFin < today && !item.done;
  const dateFinBadge = item.dateFin
    ? (item.dateFinType==="deadline"
        ? <span style={{fontSize:11,color:over?C.red:C.muted}}>🔴 Deadline · {item.dateFin}</span>
        : <span style={{fontSize:11,color:"#3b82f6"}}>🔵 Due · {item.dateFin}</span>)
    : null;
  const addSub = () => {
    if(!newSubName.trim()) return;
    onUpdate(item.id, {sousTaches:[...subs,{id:uid(),name:newSubName.trim(),done:false}]});
    setNewSubName("");
  };
  return (
    <div style={{marginBottom:10,background:C.surface2,border:`1px solid ${C.border}`,borderLeft:`4px solid ${sc}`,borderRadius:16,overflow:"hidden",opacity:item.done?0.45:1}}>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1}}>
            <div onClick={()=>onEdit&&onEdit()} style={{fontSize:15,fontWeight:600,color:item.done?C.muted:C.text,textDecoration:item.done?"line-through":"none",marginBottom:6,lineHeight:1.35,cursor:onEdit?"pointer":"default"}}>{item.name}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
              {mat&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:C.surface3,color:C.muted,border:`1px solid ${C.border}`}}>{mat.label}</span>}
              {item.sphere&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:sc+"22",color:sc}}>{SPHERES[item.sphere]?.label}</span>}
              <span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:st.c+"22",color:st.c}}>{st.label}</span>
              {item.recurrence?.enabled&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:C.accentBg,color:C.accent}}>🔄 {describeRecurrence(item.recurrence)}</span>}
            </div>
            {item.dateDebut&&item.dateFin
              ? <div style={{fontSize:11,color:C.muted}}>Du {item.dateDebut} au {item.dateFin}</div>
              : dateFinBadge&&<div style={{marginTop:2}}>{dateFinBadge}</div>
            }
          </div>
          <span onClick={()=>onToggleDone(item.id)} style={{fontSize:20,cursor:"pointer",color:item.done?C.green:C.borderMid,flexShrink:0,marginTop:2}}>{item.done?"●":"○"}</span>
          <span onClick={()=>onDelete(item.id)} style={{fontSize:13,cursor:"pointer",color:C.faint,flexShrink:0,marginTop:4}}>✕</span>
        </div>
        {subs.length>0&&(
          <div style={{marginTop:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{flex:1,height:3,borderRadius:2,background:"rgba(139,92,246,0.1)"}}>
                <div style={{height:"100%",width:`${doneSubs.length/subs.length*100}%`,background:sc,borderRadius:2,transition:"width 0.4s ease"}}/>
              </div>
              <span style={{fontSize:11,color:C.muted,flexShrink:0}}>{doneSubs.length}/{subs.length}</span>
              <span onClick={()=>setExpanded(x=>!x)} style={{fontSize:11,color:C.accent,cursor:"pointer",flexShrink:0}}>{expanded?"▲":"▼"}</span>
            </div>
          </div>
        )}
        {subs.length===0&&<div onClick={()=>setExpanded(x=>!x)} style={{marginTop:8,fontSize:12,color:C.faint,cursor:"pointer"}}>+ Sous-tâche</div>}
      </div>
      {expanded&&(
        <div style={{borderTop:`1px solid ${C.border}`,padding:"10px 16px"}}>
          {subs.map(s=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid rgba(139,92,246,0.08)`,opacity:s.done?0.5:1}}>
              <span onClick={()=>onUpdate(item.id,{sousTaches:subs.map(x=>x.id===s.id?{...x,done:!x.done}:x)})} style={{fontSize:16,cursor:"pointer",color:s.done?C.green:C.borderMid}}>{s.done?"●":"○"}</span>
              <span style={{fontSize:13,color:C.text,flex:1,textDecoration:s.done?"line-through":"none"}}>{s.name}</span>
              <span onClick={()=>onUpdate(item.id,{sousTaches:subs.filter(x=>x.id!==s.id)})} style={{fontSize:12,cursor:"pointer",color:C.faint}}>✕</span>
            </div>
          ))}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Input value={newSubName} onChange={setNewSubName} onKeyDown={e=>e.key==="Enter"&&addSub()} placeholder="Nouvelle sous-tâche..." style={{flex:1,minHeight:36,padding:"6px 12px",fontSize:13}}/>
            <Btn onClick={addSub} variant="ghost" style={{padding:"6px 14px",fontSize:12,minHeight:36}}>+</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ClarifyModal ──
function ClarifyModal({item, onSave, onClose}) {
  const [form, setForm] = useState({
    gtd: item.gtd==="inbox"?"":item.gtd, name:item.name,
    sphere:item.sphere||null, matrice:item.matrice||null,
    dateDebut:item.dateDebut||"", dateFin:item.dateFin||"",
    dateFinType:item.dateFinType||"duedate", statut:item.statut||"a_planifier",
    dateAssignee:item.dateAssignee||"", waitingFor:item.waitingFor||"", waitingNote:item.waitingNote||"",
  });
  const set = p => setForm(f=>({...f,...p}));
  const canConfirm = form.gtd && form.name.trim() &&
    (form.gtd!=="projet" || (form.sphere&&form.matrice&&form.dateFin)) &&
    (form.gtd!=="memo"   || form.dateAssignee) &&
    (form.gtd!=="waiting"|| form.waitingFor.trim());
  const handleSave = () => {
    if(!canConfirm) return;
    const u={gtd:form.gtd,name:form.name,sphere:form.sphere||undefined};
    if(form.gtd==="projet") Object.assign(u,{matrice:form.matrice,dateDebut:form.dateDebut||undefined,dateFin:form.dateFin,dateFinType:form.dateFinType,statut:form.statut,sousTaches:item.sousTaches||[]});
    else if(form.gtd==="memo") Object.assign(u,{dateAssignee:form.dateAssignee});
    else if(form.gtd==="waiting") Object.assign(u,{waitingFor:form.waitingFor,waitingNote:form.waitingNote||undefined});
    onSave(u); onClose();
  };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div onClick={e=>e.stopPropagation()} className="slide-up" style={{width:"100%",maxWidth:480,background:C.surface,borderRadius:24,border:`1px solid ${C.border}`,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>Classifier cette tâche</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:20}}>{item.name}</div>
        <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Quel type ?</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
          {[["projet","🔴 Projet",C.red],["memo","📝 Mémo","#6366f1"],["waiting","⏳ Waiting For",C.amber],["someday","💭 Someday-Maybe",C.faint]].map(([k,l,c])=>(
            <button key={k} onClick={()=>set({gtd:k})} style={{padding:14,borderRadius:14,border:`1px solid ${form.gtd===k?c:C.border}`,background:form.gtd===k?c+"22":C.surface2,color:form.gtd===k?c:C.muted,fontSize:14,fontFamily:"inherit",textAlign:"center",cursor:"pointer",transition:TR}}>{l}</button>
          ))}
        </div>
        {form.gtd&&(<>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Nom</div>
            <Input value={form.name} onChange={v=>set({name:v})} placeholder="Nom de la tâche..."/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Sphère{form.gtd==="projet"?" *":""}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.entries(SPHERES).map(([k,v])=>(
                <button key={k} onClick={()=>set({sphere:form.sphere===k?null:k})} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${form.sphere===k?v.c:C.border}`,background:form.sphere===k?v.c+"22":"transparent",color:form.sphere===k?v.c:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{v.label}</button>
              ))}
            </div>
          </div>
          {form.gtd==="projet"&&(<>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Matrice *</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {Object.entries(MATRICES).map(([k,v])=>(
                  <button key={k} onClick={()=>set({matrice:form.matrice===k?null:k})} style={{padding:"10px",borderRadius:12,border:`1px solid ${form.matrice===k?C.accent:C.border}`,background:form.matrice===k?C.accentBg:C.surface2,color:form.matrice===k?C.accent:C.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer",textAlign:"center"}}>{v.label}</button>
                ))}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Date début</div>
                <input type="date" value={form.dateDebut} onChange={e=>set({dateDebut:e.target.value})} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Date fin *</div>
                <input type="date" value={form.dateFin} onChange={e=>set({dateFin:e.target.value})} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["deadline","🔴 Deadline"],["duedate","🔵 Due Date"]].map(([k,l])=>(
                <button key={k} onClick={()=>set({dateFinType:k})} style={{flex:1,padding:9,borderRadius:10,border:`1px solid ${form.dateFinType===k?C.accent:C.border}`,background:form.dateFinType===k?C.accentBg:"transparent",color:form.dateFinType===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </>)}
          {form.gtd==="memo"&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{form.recurrence?.enabled?"Date de la 1ère récurrence *":"Date assignée *"}</div>
              <input type="date" value={form.dateAssignee} onChange={e=>set({dateAssignee:e.target.value})} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
            </div>
          )}
          {form.gtd==="waiting"&&(<>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Qui ? *</div>
              <Input value={form.waitingFor} onChange={v=>set({waitingFor:v})} placeholder="Nom de la personne ou entité..."/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Note (optionnel)</div>
              <Input value={form.waitingNote} onChange={v=>set({waitingNote:v})} placeholder="Contexte..."/>
            </div>
          </>)}
          <Btn onClick={handleSave} variant="accent" disabled={!canConfirm} style={{width:"100%",marginTop:8}}>Confirmer</Btn>
        </>)}
      </div>
    </div>
  );
}

// ── EditModal ──
function EditModal({item, onSave, onDelete, onToggleDone, onClose}) {
  const [form, setForm] = useState({
    name:item.name, gtd:item.gtd, sphere:item.sphere||null, matrice:item.matrice||null,
    dateDebut:item.dateDebut||"", dateFin:item.dateFin||"", dateFinType:item.dateFinType||"duedate",
    statut:item.statut||"a_planifier", dateAssignee:item.dateAssignee||"",
    waitingFor:item.waitingFor||"", waitingNote:item.waitingNote||"", sousTaches:item.sousTaches||[],
    objectifMensuelId:item.objectifMensuelId||"",
  });
  const mensuelGoals = (getLS("lp_goals",{}).mensuel||[]);
  const [newSubName, setNewSubName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const set = p => setForm(f=>({...f,...p}));

  const handleSave = () => {
    const u={name:form.name,gtd:form.gtd,sphere:form.sphere||undefined};
    if(form.gtd==="projet") Object.assign(u,{matrice:form.matrice,dateDebut:form.dateDebut||undefined,dateFin:form.dateFin||undefined,dateFinType:form.dateFinType,statut:form.statut,sousTaches:form.sousTaches,objectifMensuelId:form.objectifMensuelId||undefined});
    else if(form.gtd==="memo") u.dateAssignee=form.dateAssignee||undefined;
    else if(form.gtd==="waiting") Object.assign(u,{waitingFor:form.waitingFor,waitingNote:form.waitingNote||undefined});
    onSave(u); onClose();
  };
  const addSub = () => {
    if(!newSubName.trim()) return;
    set({sousTaches:[...form.sousTaches,{id:uid(),name:newSubName.trim(),done:false}]});
    setNewSubName("");
  };
  const GTD_TYPES=[["inbox","📥 Inbox"],["projet","🔴 Projet"],["memo","📝 Mémo"],["waiting","⏳ Waiting For"],["someday","💭 Someday"]];

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div onClick={e=>e.stopPropagation()} className="slide-up" style={{width:"100%",maxWidth:520,background:C.surface,borderRadius:20,border:`1px solid ${C.border}`,padding:20,maxHeight:"85vh",overflowY:"auto"}}>
        <input autoFocus value={form.name} onChange={e=>set({name:e.target.value})}
          style={{width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${C.borderMid}`,color:C.text,fontSize:17,fontWeight:600,fontFamily:"inherit",outline:"none",padding:"4px 0",boxSizing:"border-box",marginBottom:16}}/>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Type</div>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
            {GTD_TYPES.map(([k,l])=>(
              <button key={k} onClick={()=>set({gtd:k})} style={{flexShrink:0,padding:"6px 12px",borderRadius:999,border:`1px solid ${form.gtd===k?C.accent:C.border}`,background:form.gtd===k?C.accentBg:"transparent",color:form.gtd===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Sphère</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {Object.entries(SPHERES).map(([k,v])=>(
              <button key={k} onClick={()=>set({sphere:form.sphere===k?null:k})} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${form.sphere===k?v.c:C.border}`,background:form.sphere===k?v.c+"22":"transparent",color:form.sphere===k?v.c:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{v.label}</button>
            ))}
          </div>
        </div>

        {form.gtd==="projet"&&(<>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Matrice</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {Object.entries(MATRICES).map(([k,v])=>(
                <button key={k} onClick={()=>set({matrice:form.matrice===k?null:k})} style={{padding:"10px",borderRadius:12,border:`1px solid ${form.matrice===k?C.accent:C.border}`,background:form.matrice===k?C.accentBg:C.surface2,color:form.matrice===k?C.accent:C.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer",textAlign:"center"}}>{v.label}</button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            {[["dateDebut","Date début"],["dateFin","Date fin"]].map(([k,l])=>(
              <div key={k}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{l}</div>
                <input type="date" value={form[k]} onChange={e=>set({[k]:e.target.value})} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["deadline","🔴 Deadline"],["duedate","🔵 Due Date"]].map(([k,l])=>(
              <button key={k} onClick={()=>set({dateFinType:k})} style={{flex:1,padding:9,borderRadius:10,border:`1px solid ${form.dateFinType===k?C.accent:C.border}`,background:form.dateFinType===k?C.accentBg:"transparent",color:form.dateFinType===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
            ))}
          </div>
          {mensuelGoals.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>⭐ Objectif mensuel</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <button onClick={()=>set({objectifMensuelId:""})} style={{textAlign:"left",padding:"7px 12px",borderRadius:10,border:`1px solid ${!form.objectifMensuelId?C.accent:C.border}`,background:!form.objectifMensuelId?C.accentBg:"transparent",color:!form.objectifMensuelId?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>— Aucun</button>
                {mensuelGoals.map(o=>(
                  <button key={o.id} onClick={()=>set({objectifMensuelId:o.id})} style={{textAlign:"left",padding:"7px 12px",borderRadius:10,border:`1px solid ${form.objectifMensuelId===o.id?C.amber:C.border}`,background:form.objectifMensuelId===o.id?C.amberBg:"transparent",color:form.objectifMensuelId===o.id?C.amber:C.text,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{o.titre}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8}}>Sous-tâches</div>
            {form.sousTaches.map(s=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${C.border}22`}}>
                <span onClick={()=>set({sousTaches:form.sousTaches.map(x=>x.id===s.id?{...x,done:!x.done}:x)})} style={{fontSize:16,cursor:"pointer",color:s.done?C.green:C.borderMid}}>{s.done?"●":"○"}</span>
                <span style={{flex:1,fontSize:13,color:s.done?C.muted:C.text,textDecoration:s.done?"line-through":"none"}}>{s.name}</span>
                <span onClick={()=>set({sousTaches:form.sousTaches.filter(x=>x.id!==s.id)})} style={{fontSize:12,color:C.faint,cursor:"pointer"}}>✕</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <Input value={newSubName} onChange={setNewSubName} onKeyDown={e=>e.key==="Enter"&&addSub()} placeholder="Nouvelle sous-tâche..." style={{flex:1,minHeight:36,padding:"6px 12px",fontSize:13}}/>
              <Btn onClick={addSub} variant="ghost" style={{padding:"6px 14px",fontSize:12,minHeight:36}}>+</Btn>
            </div>
          </div>
        </>)}

        {form.gtd==="memo"&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{form.recurrence?.enabled?"Date de la 1ère récurrence":"Date assignée"}</div>
            <input type="date" value={form.dateAssignee} onChange={e=>set({dateAssignee:e.target.value})} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
        )}

        {form.gtd==="waiting"&&(<>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Qui ?</div>
            <Input value={form.waitingFor} onChange={v=>set({waitingFor:v})} placeholder="Nom de la personne ou entité..."/>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Note</div>
            <Input value={form.waitingNote} onChange={v=>set({waitingNote:v})} placeholder="Contexte..."/>
          </div>
        </>)}

        <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:8}}>
          <Btn onClick={handleSave} variant="accent" style={{width:"100%"}}>Enregistrer</Btn>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{onToggleDone(item.id);onClose();}} variant="ghost" style={{flex:1,color:item.done?C.accent:C.green}}>{item.done?"↩ Restaurer":"✓ Marquer fait"}</Btn>
            {confirmDel
              ? <Btn onClick={()=>{onDelete(item.id);onClose();}} style={{flex:1,color:C.red,border:`1px solid ${C.red}44`}}>Confirmer ✕</Btn>
              : <Btn onClick={()=>setConfirmDel(true)} style={{flex:1,color:C.red,border:`1px solid ${C.red}44`}}>Supprimer</Btn>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recurrence helpers ──
const REC_DAYS_FR = ['dim','lun','mar','mer','jeu','ven','sam'];
const REC_DAYS_FULL = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const REC_MONTHS_SHORT = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
function describeRecurrence(r) {
  if (!r || !r.enabled) return null;
  const units = {day:'jour',week:'semaine',month:'mois',year:'an'};
  let s = `Tous les ${r.interval > 1 ? r.interval + ' ' : ''}${units[r.unit]}${r.interval > 1 && r.unit !== 'mois' ? 's' : ''}`;
  if (r.unit === 'week' && r.dayOfWeek !== undefined) s += ` le ${REC_DAYS_FULL[r.dayOfWeek]}`;
  if ((r.unit === 'month' || r.unit === 'year') && r.dayOfMonth) s += ` le ${r.dayOfMonth}`;
  if (r.unit === 'year' && r.monthOfYear) s += ` de ${REC_MONTHS_SHORT[r.monthOfYear-1]}`;
  if (r.durationCount && r.durationUnit) {
    const du = {day:'jour',week:'semaine',month:'mois',year:'an'};
    const pl = r.durationCount > 1 && r.durationUnit !== 'month';
    s += ` · pendant ${r.durationCount} ${du[r.durationUnit]}${pl?'s':''}`;
  }
  return s;
}
function calculateNextOccurrence(from, r) {
  const d = new Date(from || new Date());
  switch(r.unit) {
    case 'day':   d.setDate(d.getDate() + r.interval); break;
    case 'week':  d.setDate(d.getDate() + r.interval * 7); break;
    case 'month': d.setMonth(d.getMonth() + r.interval); break;
    case 'year':  d.setFullYear(d.getFullYear() + r.interval); break;
  }
  if (r.dayOfMonth && (r.unit === 'month' || r.unit === 'year')) d.setDate(r.dayOfMonth);
  return d;
}
function getRecurOccurrences(todo, fromStr, toStr) {
  if (!todo.recurrence?.enabled || !todo.dateAssignee) return [];
  const from = new Date(fromStr + 'T00:00:00');
  const to   = new Date(toStr  + 'T23:59:59');
  let recEnd = to;
  if (todo.recurrence.durationCount && todo.recurrence.durationUnit) {
    const ed = new Date(todo.dateAssignee + 'T12:00:00');
    const dc = todo.recurrence.durationCount, du = todo.recurrence.durationUnit;
    if (du==='day')   ed.setDate(ed.getDate() + dc);
    else if (du==='week')  ed.setDate(ed.getDate() + dc*7);
    else if (du==='month') ed.setMonth(ed.getMonth() + dc);
    else if (du==='year')  ed.setFullYear(ed.getFullYear() + dc);
    if (ed < recEnd) recEnd = ed;
  }
  const dates = [];
  let cur = new Date(todo.dateAssignee + 'T12:00:00');
  let safety = 0;
  while (cur <= recEnd && cur <= to && safety < 500) {
    const ds = cur.toISOString().split('T')[0];
    if (cur >= from) dates.push(ds);
    const next = calculateNextOccurrence(new Date(cur), todo.recurrence);
    if (next <= cur) break;
    cur = next;
    safety++;
  }
  return dates;
}
function RecurrenceToggle({ value, onChange }) {
  const r = value || {enabled:false,unit:'week',interval:1};
  const update = patch => onChange({...r,...patch});
  return (
    <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:14,padding:14,marginBottom:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:r.enabled?14:0}}>
        <span style={{fontSize:13,color:C.text,fontWeight:500}}>🔄 Récurrence</span>
        <div onClick={()=>update({enabled:!r.enabled})} style={{
          width:40,height:22,borderRadius:999,background:r.enabled?C.accent:'rgba(139,92,246,0.2)',
          display:'flex',alignItems:'center',padding:'0 3px',cursor:'pointer',transition:TR,
        }}>
          <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',transform:r.enabled?'translateX(18px)':'translateX(0)',transition:TR}} />
        </div>
      </div>
      {r.enabled && (
        <div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
            <span style={{fontSize:13,color:C.muted}}>Tous les</span>
            <input type="number" min="1" max="99" value={r.interval} onChange={e=>update({interval:Math.max(1,parseInt(e.target.value)||1)})}
              style={{width:54,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 8px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',textAlign:'center'}} />
            <select value={r.unit} onChange={e=>update({unit:e.target.value})}
              style={{flex:1,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 10px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'}}>
              <option value="day">Jours</option>
              <option value="week">Semaines</option>
              <option value="month">Mois</option>
              <option value="year">Années</option>
            </select>
          </div>
          {r.unit==='week' && (
            <div style={{display:'flex',gap:5,marginBottom:10}}>
              {REC_DAYS_FR.map((d,i)=>(
                <button key={i} onClick={()=>update({dayOfWeek:r.dayOfWeek===i?undefined:i})}
                  style={{flex:1,padding:'5px 2px',borderRadius:8,border:`1px solid ${r.dayOfWeek===i?C.accent:C.border}`,background:r.dayOfWeek===i?C.accentBg:'transparent',color:r.dayOfWeek===i?C.accent:C.muted,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>{d}</button>
              ))}
            </div>
          )}
          {(r.unit==='month'||r.unit==='year') && (
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
              <span style={{fontSize:13,color:C.muted}}>Le</span>
              <input type="number" min="1" max="31" value={r.dayOfMonth||1} onChange={e=>update({dayOfMonth:Math.min(31,Math.max(1,parseInt(e.target.value)||1))})}
                style={{width:54,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 8px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',textAlign:'center'}} />
              <span style={{fontSize:13,color:C.muted}}>du mois</span>
              {r.unit==='year' && (
                <select value={r.monthOfYear||1} onChange={e=>update({monthOfYear:parseInt(e.target.value)})}
                  style={{flex:1,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 10px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'}}>
                  {REC_MONTHS_SHORT.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
                </select>
              )}
            </div>
          )}
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:10}}>
            <span style={{fontSize:13,color:C.muted,flexShrink:0}}>Pendant</span>
            <input type="number" min="1" max="999" value={r.durationCount||1} onChange={e=>update({durationCount:Math.max(1,parseInt(e.target.value)||1)})}
              style={{width:54,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 8px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none',textAlign:'center'}} />
            <select value={r.durationUnit||'week'} onChange={e=>update({durationUnit:e.target.value})}
              style={{flex:1,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:'6px 10px',borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'}}>
              <option value="day">Jours</option>
              <option value="week">Semaines</option>
              <option value="month">Mois</option>
              <option value="year">Ans</option>
            </select>
          </div>
          <div style={{fontSize:11,color:C.accent,fontStyle:'italic',marginTop:8}}>{describeRecurrence(r)}</div>
        </div>
      )}
    </div>
  );
}

// ── TodoModule ──
function TodoModule() {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const {todos,addTodo,updateTodo,deleteTodo,toggleDone,restoreTodo,classifyInbox,getDoneItems,getByGTD} = useTodos();
  const [tab, setTab]               = useState("tout");
  const [showCapture, setShowCapture]= useState(false);
  const [captureMode, setCaptureMode]= useState("fast");
  const [capForm, setCapForm]       = useState({name:"",gtd:"inbox",sphere:null,matrice:null,dateDebut:"",dateFin:"",dateFinType:"duedate",statut:"a_planifier",dateAssignee:"",waitingFor:"",waitingNote:"",recurrence:null});
  const [clarifyId, setClarifyId]   = useState(null);
  const [editId, setEditId]         = useState(null);
  const [sphereFilter, setSphereFilter] = useState("all");
  const [projSubTab, setProjSubTab]  = useState("tous");
  const [sortMode, setSortMode]     = useState("dateFin");
  const [somedayQ, setSomedayQ]     = useState("");
  const [inboxText, setInboxText]   = useState("");
  const [donePeriod, setDonePeriod] = useState("week");
  const [doneGTD, setDoneGTD]       = useState("all");
  const [doneSphere, setDoneSphere] = useState("all");
  const [toast, setToast]           = useState(null);
  const [toutFilter, setToutFilter] = useState("all");
  const [projCalMonth, setProjCalMonth] = useState(todayStr().slice(0,7));
  const [projCalSel, setProjCalSel] = useState(todayStr());

  const today = todayStr();

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),2000); };
  const resetCap = () => setCapForm({name:"",gtd:"inbox",sphere:null,matrice:null,dateDebut:"",dateFin:"",dateFinType:"duedate",statut:"a_planifier",dateAssignee:"",waitingFor:"",waitingNote:"",recurrence:null});

  const openCapture = (gtd) => {
    const typeToGTD = { inbox:"inbox", projets:"projet", waiting:"waiting", memo:"memo", someday:"someday", fait:"inbox" };
    const initialGTD = typeToGTD[gtd] || "inbox";
    setCapForm(f=>({...f, gtd:initialGTD}));
    setCaptureMode("full");
    setShowCapture(true);
  };

  const handleCapture = () => {
    if(!capForm.name.trim()) return;
    const o={name:capForm.name.trim()};
    if(captureMode==="fast") { o.gtd="inbox"; }
    else {
      o.gtd=capForm.gtd||"inbox"; o.sphere=capForm.sphere||undefined;
      if(capForm.gtd==="projet") Object.assign(o,{matrice:capForm.matrice,dateDebut:capForm.dateDebut||undefined,dateFin:capForm.dateFin||undefined,dateFinType:capForm.dateFinType,statut:capForm.statut,sousTaches:[]});
      else if(capForm.gtd==="memo") o.dateAssignee=capForm.dateAssignee||undefined;
      else if(capForm.gtd==="waiting") Object.assign(o,{waitingFor:capForm.waitingFor,waitingNote:capForm.waitingNote||undefined});
      if(capForm.recurrence?.enabled) o.recurrence=capForm.recurrence;
    }
    addTodo(o); resetCap(); setShowCapture(false); showToast("Capturé.");
  };

  const handleInboxAdd = () => {
    if(!inboxText.trim()) return;
    addTodo({name:inboxText.trim(),gtd:"inbox"}); setInboxText(""); showToast("Capturé.");
  };

  const recurringItems = todos.filter(t=>t.recurrence?.enabled&&!t.done);
  const inboxItems   = getByGTD("inbox").filter(t=>!t.done&&!t.recurrence?.enabled);
  const projets      = todos.filter(t=>t.gtd==="projet"&&!t.done&&!t.recurrence?.enabled);
  const waitingItems = getByGTD("waiting").filter(t=>!t.done&&!t.recurrence?.enabled);
  const memos        = todos.filter(t=>t.gtd==="memo"&&!t.done&&!t.recurrence?.enabled).sort((a,b)=>(a.dateAssignee||"9999")>(b.dateAssignee||"9999")?1:-1);
  const somedayItems = getByGTD("someday").filter(t=>!t.done&&!t.recurrence?.enabled);
  const memosUrgentCnt = memos.filter(t=>t.dateAssignee===today).length;
  const projEnCours    = projets.filter(t=>getProjectStatus(t)==="en_cours");
  const projAPlanifier = projets.filter(t=>getProjectStatus(t)==="a_planifier");
  const projSubFiltered = projSubTab==="en_cours" ? projEnCours : projSubTab==="a_planifier" ? projAPlanifier : projets;
  const filteredP    = (sphereFilter==="all"?projSubFiltered:projSubFiltered.filter(t=>t.sphere===sphereFilter)).sort((a,b)=>{
    if(sortMode==="matrice") return (a.matrice||"z")>(b.matrice||"z")?1:-1;
    if(sortMode==="sphere") return (a.sphere||"z")>(b.sphere||"z")?1:-1;
    return (a.dateFin||"9999")>(b.dateFin||"9999")?1:-1;
  });
  const doneItems = getDoneItems({period:donePeriod,gtd:doneGTD,sphere:doneSphere});
  const clarifyItem = todos.find(t=>t.id===clarifyId);
  const editItem    = todos.find(t=>t.id===editId);

  const memoGroups = (() => {
    const g={};
    memos.forEach(m=>{const d=m.dateAssignee||"zzz";if(!g[d])g[d]=[];g[d].push(m);});
    return Object.entries(g).sort(([a],[b])=>a>b?1:-1);
  })();
  const groupLabel = ds => {
    if(ds==="zzz") return "Sans date";
    if(ds===today) return "Aujourd'hui";
    const tom=new Date(); tom.setDate(tom.getDate()+1);
    if(ds===tom.toISOString().split("T")[0]) return "Demain";
    return fmtDate(ds);
  };

  const allItems = todos.filter(t=>!t.done&&!t.recurrence?.enabled).sort((a,b)=>((b.updatedAt||b.createdAt||'')).localeCompare(a.updatedAt||a.createdAt||''));
  const BADGE_COLORS = {inbox:C.accent,projet:'#6366f1',waiting:'#f97316',memo:'#64748b',someday:'#374151'};
  const TOUT_FILTERS = [["all","Tous"],["projet","Projets"],["waiting","Waiting"],["memo","Mémos"],["someday","Someday"]];
  const toutItems = toutFilter==="all" ? allItems : allItems.filter(t=>t.gtd===toutFilter);

  const TABS=[
    {id:"tout",      label:"TOUT",       cnt:allItems.length},
    {id:"inbox",     label:"Inbox",      cnt:inboxItems.length},
    {id:"projets",   label:"Projets",    cnt:projets.length},
    {id:"waiting",   label:"Waiting",    cnt:waitingItems.length},
    {id:"memo",      label:"Mémo",       cnt:memos.length, urgent:memosUrgentCnt>0},
    {id:"someday",   label:"Someday",    cnt:somedayItems.length},
    {id:"recurrent", label:"🔄 Récurr.", cnt:recurringItems.length},
    {id:"fait",      label:"✅ Fait",    cnt:null},
  ];

  return (
    <div className="theme-light" style={{minHeight:"100dvh",fontFamily:"var(--font-body)",color:C.text}}>
      <CFHeader eyebrow="Get Things Done" title="Todo" />


      {/* Tab bar */}
      <div style={{padding:"4px 16px 10px"}}>
        <div style={{display:"flex",gap:4,overflowX:"auto",paddingBottom:2}}>
          {TABS.map(({id,label,cnt,urgent})=>{
            const isActive=tab===id;
            return (
              <button key={id} onClick={()=>setTab(id)} style={{flexShrink:0,padding:"7px 12px",borderRadius:999,border:"none",background:isActive?GRAD:"transparent",color:isActive?"#fff":C.muted,fontSize:12,fontFamily:"inherit",fontWeight:isActive?600:400,boxShadow:isActive?GLOW_SM:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                {label}
                {cnt!=null&&cnt>0&&<span style={{fontSize:10,background:isActive?"rgba(255,255,255,0.25)":urgent?C.red+"30":C.accentBg,color:isActive?"#fff":urgent?C.red:C.accent,borderRadius:999,padding:"1px 6px"}}>{cnt}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{padding:"16px 16px 120px"}}>

        {/* ── TOUT ── */}
        {tab==="tout"&&(
          <div>
            <div style={{display:"flex",gap:6,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {TOUT_FILTERS.map(([k,l])=>(
                <button key={k} onClick={()=>setToutFilter(k)} style={{flexShrink:0,padding:"6px 14px",borderRadius:999,border:`1px solid ${toutFilter===k?C.accent:C.border}`,background:toutFilter===k?C.accentBg:"transparent",color:toutFilter===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>
              ))}
            </div>
            {toutItems.length===0
              ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"48px 0"}}>Aucun élément.</div>
              : toutItems.map(item=>{
                  const bc=BADGE_COLORS[item.gtd]||C.muted;
                  const gtdLabel={inbox:"INBOX",projet:"PROJET",waiting:"WAITING",memo:"MÉMO",someday:"SOMEDAY"}[item.gtd]||item.gtd?.toUpperCase();
                  return (
                    <div key={item.id} onClick={()=>setEditId(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`,cursor:"pointer"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                        <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
                          <span style={{background:bc,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,textTransform:"uppercase"}}>{gtdLabel}</span>
                          {item.sphere&&<span style={{fontSize:11,color:SPHERES[item.sphere]?.c||C.muted}}>{SPHERES[item.sphere]?.label}</span>}
                          {item.dateFin&&<span style={{fontSize:11,color:C.faint}}>{item.dateFin}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ── INBOX ── */}
        {tab==="inbox"&&(
          <div>
            <div style={{background:C.surface2,border:`1px solid ${C.borderMid}`,borderRadius:18,padding:16,marginBottom:20}}>
              <div style={{fontSize:11,color:C.accent,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>📥 Capture rapide</div>
              <div style={{display:"flex",gap:8}}>
                <Input value={inboxText} onChange={setInboxText} onKeyDown={e=>{if(e.key==="Enter")handleInboxAdd();}} placeholder="Capture une idée ou tâche..." style={{flex:1}}/>
                <Btn onClick={handleInboxAdd} variant="accent" style={{whiteSpace:"nowrap"}}>+ Ajouter</Btn>
              </div>
            </div>
            {inboxItems.length===0
              ? <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Inbox zéro.</div>
              : inboxItems.map(item=>(
                <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`}}>
                  <div style={{flex:1,cursor:"pointer"}} onClick={()=>setEditId(item.id)}>
                    <div style={{fontSize:14,color:C.text}}>{item.name}</div>
                    <span style={{fontSize:11,fontWeight:600,color:C.amber}}>À clarifier</span>
                  </div>
                  <Btn onClick={()=>setClarifyId(item.id)} variant="ghost" style={{fontSize:12,padding:"6px 12px",whiteSpace:"nowrap"}}>Clarifier →</Btn>
                  <span onClick={()=>deleteTodo(item.id)} style={{fontSize:14,color:C.faint,cursor:"pointer"}}>✕</span>
                </div>
              ))
            }
          </div>
        )}

        {/* ── PROJETS ── */}
        {tab==="projets"&&(
          <div>
            {/* Sous-onglets */}
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[["tous","Tous",projets.length],["en_cours","En cours",projEnCours.length],["a_planifier","À planifier",projAPlanifier.length]].map(([k,l,cnt])=>(
                <button key={k} onClick={()=>setProjSubTab(k)} style={{flex:1,padding:"8px 0",borderRadius:10,border:`1px solid ${projSubTab===k?C.accent:C.border}`,background:projSubTab===k?C.accentBg:"transparent",color:projSubTab===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:projSubTab===k?600:400}}>
                  {l} {cnt>0&&<span style={{fontSize:10,opacity:0.7}}>({cnt})</span>}
                </button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:8}}>
              <div style={{display:"flex",gap:6,overflowX:"auto",flex:1,paddingBottom:4}}>
                {[["all","Tous",C.accent],...Object.entries(SPHERES).map(([k,v])=>[k,v.label,v.c])].map(([k,l,c])=>(
                  <button key={k} onClick={()=>setSphereFilter(k)} style={{flexShrink:0,padding:"6px 12px",borderRadius:999,border:`1px solid ${sphereFilter===k?c:C.border}`,background:sphereFilter===k?c+"22":C.surface2,color:sphereFilter===k?c:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
                ))}
              </div>
              <select value={sortMode} onChange={e=>setSortMode(e.target.value)} style={{flexShrink:0,background:C.surface2,border:`1px solid ${C.border}`,color:C.muted,padding:"6px 8px",borderRadius:8,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="dateFin">Date ↑</option>
                <option value="matrice">Matrice</option>
                <option value="sphere">Sphère</option>
              </select>
            </div>

            {filteredP.length===0&&(
              <div style={{textAlign:"center",padding:"60px 0",fontSize:13,color:C.faint}}>
                Aucun projet. <span onClick={()=>setShowCapture(true)} style={{color:C.accent,cursor:"pointer"}}>+ Créer</span>
              </div>
            )}

            {filteredP.map(item=>(
              <ProjectCard key={item.id} item={item} todos={todos} onUpdate={updateTodo} onDelete={deleteTodo} onToggleDone={id=>{toggleDone(id);showToast("Terminé.");}} onEdit={()=>setEditId(item.id)}/>
            ))}
          </div>
        )}

        {/* ── WAITING FOR ── */}
        {tab==="waiting"&&(
          <div>
            {waitingItems.length===0
              ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"48px 0"}}>Rien en attente.</div>
              : waitingItems.map(item=>{
                  const sc=SPHERES[item.sphere]?.c||C.border;
                  return (
                    <div key={item.id} onClick={()=>setEditId(item.id)} style={{padding:"14px 16px",borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`,borderLeft:"3px solid #f59e0b",cursor:"pointer"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,color:C.text,marginBottom:4}}>⏳ {item.name}</div>
                          {item.waitingFor&&<div style={{fontSize:12,color:C.amber}}>Attend : {item.waitingFor}</div>}
                          {item.waitingNote&&<div style={{fontSize:11,color:C.faint,marginTop:2}}>{item.waitingNote}</div>}
                          {item.sphere&&<span style={{fontSize:10,color:sc,marginTop:4,display:"block"}}>{SPHERES[item.sphere]?.label}</span>}
                        </div>
                        <span onClick={e=>{e.stopPropagation();toggleDone(item.id);showToast("Reçu.");}} style={{fontSize:16,cursor:"pointer",color:C.borderMid}}>○</span>
                        <span onClick={e=>{e.stopPropagation();deleteTodo(item.id);}} style={{fontSize:13,color:C.faint,cursor:"pointer"}}>✕</span>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ── MÉMO ── */}
        {tab==="memo"&&(
          <div>
            {memos.length===0
              ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"48px 0"}}>Aucun mémo planifié.</div>
              : memoGroups.map(([date,items])=>(
                  <div key={date} style={{marginBottom:16}}>
                    <div style={{fontSize:10,color:date===today?C.red:C.faint,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,fontWeight:date===today?700:400}}>── {groupLabel(date)} ──</div>
                    {items.map(item=>{
                      const sc=SPHERES[item.sphere]?.c||C.accent;
                      return (
                        <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:6,background:C.surface2,border:`1px solid ${C.border}`,borderLeft:"3px solid #6366f1"}}>
                          <div style={{flex:1,cursor:"pointer"}} onClick={()=>setEditId(item.id)}>
                            <div style={{fontSize:14,color:C.text}}>📝 {item.name}</div>
                            {item.sphere&&<span style={{fontSize:11,color:sc}}>{SPHERES[item.sphere]?.label}</span>}
                          </div>
                          <div onClick={()=>{toggleDone(item.id);showToast("Mémo fait.");}} style={{width:26,height:26,borderRadius:"50%",border:`2px solid ${C.borderMid}`,cursor:"pointer",flexShrink:0}}/>
                        </div>
                      );
                    })}
                  </div>
                ))
            }
          </div>
        )}

        {/* ── SOMEDAY-MAYBE ── */}
        {tab==="someday"&&(
          <div>
            <div style={{marginBottom:16}}><Input value={somedayQ} onChange={setSomedayQ} placeholder="Rechercher..."/></div>
            <div style={{fontSize:13,color:C.muted,marginBottom:16}}>💭 Un jour, peut-être... <span style={{color:C.faint}}>({somedayItems.length})</span></div>
            {somedayItems.filter(t=>!somedayQ||t.name.toLowerCase().includes(somedayQ.toLowerCase())).length===0
              ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"32px 0"}}>Aucune idée capturée.</div>
              : somedayItems.filter(t=>!somedayQ||t.name.toLowerCase().includes(somedayQ.toLowerCase())).map(item=>(
                <div key={item.id} onClick={()=>setEditId(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`,opacity:0.8,cursor:"pointer"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,color:C.muted}}>{item.name}</div>
                    <div style={{display:"flex",gap:8,marginTop:4}}>
                      {item.sphere&&<span style={{fontSize:11,color:SPHERES[item.sphere]?.c}}>{SPHERES[item.sphere]?.label}</span>}
                      <span style={{fontSize:11,color:C.faint}}>{item.createdAt?.slice(0,10)}</span>
                    </div>
                  </div>
                  <Btn onClick={e=>{e.stopPropagation();updateTodo(item.id,{gtd:"inbox"});showToast("Déplacé vers Inbox.");}} variant="ghost" style={{fontSize:11,padding:"5px 10px"}}>→ Inbox</Btn>
                  <span onClick={e=>{e.stopPropagation();deleteTodo(item.id);}} style={{fontSize:14,color:C.faint,cursor:"pointer"}}>✕</span>
                </div>
              ))
            }
          </div>
        )}

        {/* ── RÉCURRENTS ── */}
        {tab==="recurrent"&&(
          <div>
            <div style={{fontSize:13,color:C.muted,marginBottom:16}}>🔄 Tâches récurrentes <span style={{color:C.faint}}>({recurringItems.length})</span></div>
            {recurringItems.length===0
              ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"48px 0"}}>Aucune tâche récurrente.</div>
              : recurringItems.map(item=>{
                  const bc=BADGE_COLORS[item.gtd]||C.muted;
                  const gtdLabel={inbox:"INBOX",projet:"PROJET",waiting:"WAITING",memo:"MÉMO",someday:"SOMEDAY"}[item.gtd]||item.gtd?.toUpperCase();
                  return (
                    <div key={item.id} onClick={()=>setEditId(item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`,cursor:"pointer"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.name}</div>
                        <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{background:bc,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:999,textTransform:"uppercase"}}>{gtdLabel}</span>
                          <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,background:C.accentBg,color:C.accent,fontWeight:600}}>🔄 {describeRecurrence(item.recurrence)}</span>
                          {item.dateAssignee&&<span style={{fontSize:11,color:C.faint}}>Début: {item.dateAssignee}</span>}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();toggleDone(item.id);}} style={{flexShrink:0,width:28,height:28,borderRadius:"50%",background:"transparent",border:`2px solid ${C.border}`,color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>✓</button>
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ── FAIT ── */}
        {tab==="fait"&&(()=>{
          const [cy,cm]=projCalMonth.split("-").map(Number);
          const dstr=d=>`${cy}-${pad(cm)}-${pad(d)}`;
          const startDow=(new Date(cy,cm-1,1).getDay()+6)%7;
          const nb=new Date(cy,cm,0).getDate();
          const doneProj=todos.filter(t=>t.done&&t.doneAt&&(doneGTD==="all"||t.gtd===doneGTD));
          const byDate={}; doneProj.forEach(p=>{const d=p.doneAt.slice(0,10);(byDate[d]=byDate[d]||[]).push(p);});
          const shift=delta=>{const d=new Date(cy,cm-1+delta,1);setProjCalMonth(`${d.getFullYear()}-${pad(d.getMonth()+1)}`);};
          const monthTotal=doneProj.filter(p=>p.doneAt.slice(0,7)===projCalMonth).length;
          const selList=byDate[projCalSel]||[];
          const cells=[]; for(let i=0;i<startDow;i++)cells.push(null); for(let d=1;d<=nb;d++)cells.push(d);
          const DL=["L","M","M","J","V","S","D"];
          const TYPES=[["all","Tous"],["projet","Projets"],["memo","Mémos"],["waiting","Waiting"],["someday","Someday"],["inbox","Tâches"]];
          return (
            <div>
              <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:14,paddingBottom:4}}>
                {TYPES.map(([k,l])=>(
                  <button key={k} onClick={()=>setDoneGTD(k)} style={{flexShrink:0,padding:"6px 14px",borderRadius:999,border:`1px solid ${doneGTD===k?C.accent:C.border}`,background:doneGTD===k?C.accentBg:"transparent",color:doneGTD===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:doneGTD===k?600:400}}>{l}</button>
                ))}
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:8}}>
                <button onClick={()=>shift(-1)} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,width:36,height:36,borderRadius:10,cursor:"pointer",fontSize:16}}>‹</button>
                <span style={{fontFamily:FONT_D,fontSize:15,fontWeight:700,color:C.text,minWidth:130,textAlign:"center"}}>{MONTH_FR[cm-1]} {cy}</span>
                <button onClick={()=>shift(1)} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,width:36,height:36,borderRadius:10,cursor:"pointer",fontSize:16}}>›</button>
              </div>
              <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:14}}><span style={{color:C.green,fontWeight:600}}>{monthTotal}</span> accomplie{monthTotal>1?"s":""} ce mois</div>
              <div style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:16,boxShadow:"0 2px 12px rgba(0,0,0,0.35)",padding:10,marginBottom:16}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
                  {DL.map((d,i)=><div key={i} style={{textAlign:"center",fontSize:9,color:C.faint,fontWeight:700}}>{d}</div>)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                  {cells.map((d,i)=>{
                    if(!d) return <div key={i}/>;
                    const ds=dstr(d); const has=(byDate[ds]||[]).length>0; const isSel=ds===projCalSel; const isToday=ds===today;
                    return (
                      <button key={i} onClick={()=>setProjCalSel(ds)} style={{height:38,borderRadius:9,cursor:"pointer",fontFamily:"inherit",padding:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:isSel?C.accentBg:"transparent",border:`1px solid ${isSel?C.accent:isToday?C.borderMid:"transparent"}`,transition:TR}}>
                        <span style={{fontFamily:FONT_D,fontSize:12,fontWeight:isToday?800:600,color:isToday?C.accent:C.text,fontVariantNumeric:"tabular-nums",lineHeight:1}}>{d}</span>
                        <span style={{width:5,height:5,borderRadius:"50%",background:has?C.green:"transparent",boxShadow:has?`0 0 5px ${C.green}`:"none"}}/>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8,padding:"0 4px"}}>{fmtDate(projCalSel)}</div>
              {selList.length===0
                ? <div style={{fontSize:13,color:C.faint,textAlign:"center",padding:"24px 0"}}>Rien d'accompli ce jour.</div>
                : selList.map(p=>{
                    const sc=SPHERES[p.sphere]?.c||C.border;
                    return (
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:14,marginBottom:6,background:C.surface2,border:`1px solid ${C.border}`,borderLeft:`3px solid ${sc}`}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:C.text,fontWeight:600}}>{p.name}</div>
                          {p.sphere&&<span style={{fontSize:10,color:sc}}>{SPHERES[p.sphere]?.label}</span>}
                        </div>
                        <Btn onClick={()=>{restoreTodo(p.id);showToast("Projet restauré.");}} variant="ghost" style={{fontSize:11,padding:"5px 10px",color:C.muted,flexShrink:0}}>↩</Btn>
                      </div>
                    );
                  })
              }
            </div>
          );
        })()}

      </div>


      {/* TOAST */}
      {toast&&<div style={{position:"fixed",top:72,left:"50%",transform:"translateX(-50%)",zIndex:200,background:C.surface3,border:`1px solid ${C.borderMid}`,borderRadius:999,padding:"8px 20px",fontSize:13,color:C.text,boxShadow:"0 4px 24px rgba(0,0,0,0.4)",whiteSpace:"nowrap",pointerEvents:"none"}}>{toast}</div>}

      {/* QUICK CAPTURE MODAL */}
      {showCapture&&(
        <div onClick={()=>setShowCapture(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div onClick={e=>e.stopPropagation()} className="slide-up" style={{width:"100%",maxWidth:480,background:C.surface,borderRadius:24,border:`1px solid ${C.border}`,padding:20,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:14,textAlign:"center"}}>Nouvelle tâche</div>
            <Input autoFocus value={capForm.name} onChange={v=>setCapForm(f=>({...f,name:v}))} onKeyDown={e=>e.key==="Enter"&&handleCapture()} placeholder="Nom de la tâche..."/>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"14px 0 8px"}}>Type</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
              {[["inbox","📥 Inbox"],["projet","🔴 Projet"],["memo","📝 Mémo"],["waiting","⏳ Waiting"],["someday","💭 Someday"]].map(([k,l])=>(
                <button key={k} onClick={()=>setCapForm(f=>({...f,gtd:k}))} style={{flexShrink:0,padding:"6px 12px",borderRadius:999,border:`1px solid ${capForm.gtd===k?C.accent:C.border}`,background:capForm.gtd===k?C.accentBg:"transparent",color:capForm.gtd===k?C.accent:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{l}</button>
              ))}
            </div>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"14px 0 8px"}}>Sphère</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
              {Object.entries(SPHERES).map(([k,v])=>(
                <button key={k} onClick={()=>setCapForm(f=>({...f,sphere:f.sphere===k?null:k}))} style={{flexShrink:0,padding:"6px 12px",borderRadius:999,border:`1px solid ${capForm.sphere===k?v.c:C.border}`,background:capForm.sphere===k?v.c+"22":"transparent",color:capForm.sphere===k?v.c:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}>{v.label}</button>
              ))}
            </div>
            {capForm.gtd==="projet"&&(
              <div className="slide-up">
                <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",margin:"14px 0 8px"}}>Matrice</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  {Object.entries(MATRICES).map(([k,v])=>(
                    <button key={k} onClick={()=>setCapForm(f=>({...f,matrice:f.matrice===k?null:k}))} style={{padding:"8px",borderRadius:12,border:`1px solid ${capForm.matrice===k?C.accent:C.border}`,background:capForm.matrice===k?C.accentBg:"transparent",color:capForm.matrice===k?C.accent:C.muted,fontSize:11,fontFamily:"inherit",cursor:"pointer",textAlign:"center"}}>{v.label}</button>
                  ))}
                </div>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Date limite</div>
                <input type="date" value={capForm.dateFin} onChange={e=>setCapForm(f=>({...f,dateFin:e.target.value}))} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
            )}
            {capForm.gtd==="memo"&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{capForm.recurrence?.enabled?"Date de la 1ère récurrence":"Date assignée"}</div>
                <input type="date" value={capForm.dateAssignee} onChange={e=>setCapForm(f=>({...f,dateAssignee:e.target.value}))} style={{width:"100%",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:9,borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
              </div>
            )}
            {capForm.gtd==="waiting"&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Attendu de</div>
                <Input value={capForm.waitingFor} onChange={v=>setCapForm(f=>({...f,waitingFor:v}))} placeholder="Nom de la personne..."/>
              </div>
            )}
            {(capForm.gtd==="projet"||capForm.gtd==="memo"||capForm.gtd==="waiting")&&(
              <div style={{marginTop:12}}>
                <RecurrenceToggle value={capForm.recurrence} onChange={rec=>setCapForm(f=>({...f,recurrence:rec}))} />
              </div>
            )}
            <div style={{marginTop:16,display:"flex",gap:8}}>
              <Btn onClick={()=>setShowCapture(false)} variant="ghost" style={{flex:1}}>Annuler</Btn>
              <Btn onClick={handleCapture} variant="accent" style={{flex:2}}>Créer →</Btn>
            </div>
          </div>
        </div>
      )}

      {/* CLARIFY MODAL */}
      {clarifyItem&&(
        <ClarifyModal item={clarifyItem} onSave={p=>{updateTodo(clarifyId,p);setClarifyId(null);showToast("Classifié.");}} onClose={()=>setClarifyId(null)}/>
      )}

      {/* EDIT MODAL */}
      {editItem&&(
        <EditModal item={editItem} onSave={p=>updateTodo(editId,p)} onDelete={id=>{deleteTodo(id);showToast("Supprimé.");}} onToggleDone={id=>{toggleDone(id);showToast(editItem.done?"Restauré.":"Fait.");}} onClose={()=>setEditId(null)}/>
      )}
    </div>
  );
}

function EmojiInput({ value, onSave }) {
  const [local, setLocal] = useState(value);
  return (
    <input value={local} onChange={e=>setLocal(e.target.value)} onBlur={() => { const v=local.trim(); if(v) onSave(v); else setLocal(value); }}
      style={{ width:48,textAlign:"center",background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:"6px",borderRadius:10,fontSize:22,fontFamily:"inherit",outline:"none",cursor:"text" }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HABITUDES
// ─────────────────────────────────────────────────────────────────────────────
function HabitudesModule() {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const [habits, setHabits] = useState(() => getLS("lp_habits", []));
  const [view, setView]     = useState("today");
  const [newName, setNewName]  = useState("");
  const [newEmoji, setNewEmoji]= useState("⭐");
  const [mYear, setMYear]   = useState(new Date().getFullYear());
  const [mMonth, setMMonth] = useState(new Date().getMonth());
  const [animating, setAnimating] = useState(new Set());
  const [editHabitId, setEditHabitId] = useState(null);
  const [editHabitName, setEditHabitName] = useState("");
  const [newMultiple, setNewMultiple] = useState(false);
  const [newItemText, setNewItemText] = useState("");
  const [newItems, setNewItems] = useState([]);
  const [expandedHabitId, setExpandedHabitId] = useState(null);
  const [editItemText, setEditItemText] = useState("");

  const save = d => { setHabits(d); setLS("lp_habits", d); };
  const add  = () => {
    if(!newName.trim()) return;
    save([...habits,{id:uid(),name:newName.trim(),emoji:newEmoji||"⭐",logs:[],dailyStatus:{},
      multiple:newMultiple, items:newMultiple?[...newItems]:[], itemStatus:{}}]);
    setNewName(""); setNewEmoji("⭐"); setNewMultiple(false); setNewItems([]); setNewItemText("");
  };
  const toggle = (id, date) => {
    const d = date || todayStr();
    save(habits.map(h => {
      if(h.id!==id) return h;
      const ds = h.dailyStatus || {};
      const cur = ds[d] ?? null;
      if (!date) {
        setAnimating(s => new Set([...s, id]));
        setTimeout(() => setAnimating(s => { const n=new Set(s); n.delete(id); return n; }), 350);
      }
      const next = cycleHabitStatus(cur);
      const newDs = {...ds};
      if (next === null) delete newDs[d]; else newDs[d] = next;
      const logs = (h.logs||[]).filter(x=>x!==d);
      if (next === 'validated') logs.push(d);
      return {...h, dailyStatus:newDs, logs};
    }));
  };
  const toggleItem = (habitId, itemId, date) => {
    const d = date || todayStr();
    save(habits.map(h => {
      if (h.id !== habitId) return h;
      const is = { ...(h.itemStatus || {}) };
      const dayItems = { ...(is[d] || {}) };
      dayItems[itemId] = cycleHabitStatus(dayItems[itemId] ?? null);
      if (dayItems[itemId] === null) delete dayItems[itemId];
      is[d] = dayItems;
      const items = h.items || [];
      const allDone = items.length > 0 && items.every(it => dayItems[it.id] === 'validated');
      const anyInvalid = items.some(it => dayItems[it.id] === 'invalidated');
      const ds = { ...(h.dailyStatus || {}) };
      const logs = (h.logs||[]).filter(x=>x!==d);
      if (allDone) { ds[d] = 'validated'; logs.push(d); }
      else if (anyInvalid) { ds[d] = 'invalidated'; }
      else delete ds[d];
      return { ...h, itemStatus: is, dailyStatus: ds, logs };
    }));
  };
  const del    = id => save(habits.filter(h=>h.id!==id));
  const update = (id,patch) => save(habits.map(h=>h.id===id?{...h,...patch}:h));
  const streak = h => {
    let n=0; const d=new Date();
    if(!habitValidated(h,todayStr())) d.setDate(d.getDate()-1);
    while(true) { const k=d.toISOString().split("T")[0]; if(!habitValidated(h,k)) break; n++; d.setDate(d.getDate()-1); }
    return n;
  };
  const prevMonth = () => { if(mMonth===0){setMYear(y=>y-1);setMMonth(11);}else setMMonth(m=>m-1); };
  const nextMonth = () => { if(mMonth===11){setMYear(y=>y+1);setMMonth(0);}else setMMonth(m=>m+1); };

  const t=todayStr(), week=weekDates();
  const done=habits.filter(h=>habitValidated(h,t)).length;
  const VIEWS=[["today","Aujourd'hui"],["week","Semaine"],["mois","Mois"],["manage","Gérer"]];

  const dayPct = habits.length ? Math.round(done/habits.length*100) : 0;
  const RING=44, RSW=4, RR=(RING-RSW)/2, RC=2*Math.PI*RR;
  return (
    <div className="theme-light" style={{minHeight:"100dvh",fontFamily:"var(--font-body)",color:C.text}}>
      <CFHeader eyebrow="Discipline" title="Habitudes"
        action={
          <div style={{position:"relative",width:RING,height:RING,flexShrink:0}}>
            <svg width={RING} height={RING} style={{transform:"rotate(-90deg)",display:"block"}}>
              <circle cx={RING/2} cy={RING/2} r={RR} fill="none" stroke={C.surface3} strokeWidth={RSW} />
              <circle cx={RING/2} cy={RING/2} r={RR} fill="none" stroke={dayPct>=100?C.green:C.accent} strokeWidth={RSW}
                strokeDasharray={RC} strokeDashoffset={RC*(1-dayPct/100)} strokeLinecap="round"
                style={{transition:"stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1)",filter:`drop-shadow(0 0 4px ${dayPct>=100?C.green:C.accent})`}} />
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:FONT_D,fontSize:12,fontWeight:800,color:dayPct>=100?C.green:C.text,fontVariantNumeric:"tabular-nums"}}>{dayPct}</div>
          </div>
        }
      />
      <div style={{ padding:"4px 16px 100px" }}>
        {/* View tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:20, overflowX:"auto", paddingBottom:4 }}>
          {VIEWS.map(([id,label]) => {
            const active=view===id;
            return (
              <button key={id} onClick={() => setView(id)} style={{
                flexShrink:0,padding:"8px 18px",borderRadius:999,border:`1px solid ${active?C.accent:C.border}`,
                background:active?C.accentBg:C.surface2,color:active?C.accent:C.muted,
                cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:active?600:400,
              }}>{label}</button>
            );
          })}
        </div>

        {/* TODAY */}
        {view==="today" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontSize:12,color:C.muted }}>{fmtDate(t)}</span>
              {habits.length>0 && <span style={{ fontSize:13,fontWeight:700,color:done===habits.length?C.green:C.accent }}>{done}/{habits.length}</span>}
            </div>
            {habits.length>0 && <div style={{marginBottom:16}}><ProgressBar value={habits.length?done/habits.length*100:0} color={done===habits.length?C.green:C.accent} height={5} /></div>}
            {habits.length===0
              ? <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Aucune habitude. <span onClick={()=>setView("manage")} style={{color:C.accent,cursor:"pointer"}}>→ Gérer</span></div>
              : habits.map(h => {
                  const status=(h.dailyStatus||{})[t] ?? null;
                  const isDone=status==='validated';
                  const isInvalid=status==='invalidated';
                  const s=streak(h);
                  const isExpanded = expandedHabitId === h.id;
                  if (h.multiple) {
                    const dayItems = (h.itemStatus||{})[t] || {};
                    const validatedCount = (h.items||[]).filter(it=>dayItems[it.id]==='validated').length;
                    const hasInvalid = (h.items||[]).some(it=>dayItems[it.id]==='invalidated');
                    const total = (h.items||[]).length;
                    const badgeColor = isDone?C.green:hasInvalid?C.red:C.accent;
                    const badgeBg = isDone?"rgba(16,185,129,0.18)":hasInvalid?"rgba(239,68,68,0.15)":"rgba(139,92,246,0.12)";
                    const badgeBorder = isDone?"rgba(16,185,129,0.3)":hasInvalid?"rgba(239,68,68,0.3)":C.border;
                    return (
                      <div key={h.id} style={{marginBottom:8}}>
                        <div style={{
                          display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:isExpanded?"16px 16px 0 0":16,
                          background:isDone?"rgba(16,185,129,0.07)":hasInvalid?"rgba(239,68,68,0.07)":C.surface2,
                          border:`1px solid ${isDone?"rgba(16,185,129,0.25)":hasInvalid?"rgba(239,68,68,0.25)":C.border}`,
                          borderBottom:isExpanded?`1px solid ${C.border}`:undefined,
                          transition:TR, cursor:"pointer",
                        }} onClick={()=>setExpandedHabitId(isExpanded?null:h.id)}>
                          <span style={{fontSize:24,flexShrink:0}}>{h.emoji}</span>
                          <div style={{flex:1}}>
                            <div style={{fontSize:15,fontWeight:500,color:isDone?C.muted:C.text,textDecoration:isDone?"line-through":"none"}}>{h.name}</div>
                            {s>0&&<div style={{fontSize:11,color:C.amber,marginTop:2}}>🔥 {s} jour{s>1?"s":""}</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{padding:"4px 10px",borderRadius:999,fontSize:13,fontWeight:700,background:badgeBg,color:badgeColor,border:`1px solid ${badgeBorder}`}}>{validatedCount}/{total}</div>
                            <span style={{fontSize:12,color:C.muted,transition:"transform 0.2s",transform:isExpanded?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div style={{background:C.surface2,borderRadius:"0 0 16px 16px",border:`1px solid ${C.border}`,borderTop:"none",padding:"8px 16px 12px"}}>
                            {(h.items||[]).map(item => {
                              const itemStatus = dayItems[item.id] ?? null;
                              const isVal = itemStatus==='validated';
                              const isInv = itemStatus==='invalidated';
                              return (
                                <div key={item.id} onClick={()=>toggleItem(h.id,item.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",cursor:"pointer",borderBottom:`1px solid rgba(139,92,246,0.07)`}}>
                                  <div style={{
                                    width:20,height:20,borderRadius:5,flexShrink:0,
                                    background:isVal?C.green:isInv?C.red:"transparent",
                                    border:`2px solid ${isVal?C.green:isInv?C.red:"rgba(139,92,246,0.35)"}`,
                                    display:"flex",alignItems:"center",justifyContent:"center",
                                    color:"#fff",fontSize:13,fontWeight:700,transition:TR,
                                  }}>{isVal?"✓":isInv?"✕":null}</div>
                                  <span style={{fontSize:14,color:isVal?C.muted:isInv?C.red:C.text,textDecoration:isVal?"line-through":"none"}}>{item.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={h.id} style={{
                      display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:16,marginBottom:8,
                      background:isDone?"rgba(16,185,129,0.07)":isInvalid?"rgba(239,68,68,0.05)":C.surface2,
                      border:`1px solid ${isDone?"rgba(16,185,129,0.25)":isInvalid?"rgba(239,68,68,0.2)":C.border}`,
                      transition:TR,
                    }}>
                      <span style={{fontSize:24,flexShrink:0}}>{h.emoji}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:15,fontWeight:500,color:isDone?C.muted:isInvalid?"#ef4444":C.text,textDecoration:isDone?"line-through":"none"}}>{h.name}</div>
                        {s>0&&<div style={{fontSize:11,color:C.amber,marginTop:2}}>🔥 {s} jour{s>1?"s":""}</div>}
                      </div>
                      <HabitToggle status={status} onToggle={()=>toggle(h.id)} />
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* WEEK — dot grid */}
        {view==="week" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr repeat(7,36px)", gap:6, alignItems:"center", marginBottom:10 }}>
              <div />
              {DAY_LABELS.map((d,i) => (
                <div key={i} style={{ fontSize:11,fontWeight:600,textAlign:"center",color:week[i]===t?C.accent:C.muted }}>{d}</div>
              ))}
            </div>
            {habits.length===0&&<div style={{fontSize:13,color:C.muted}}>Aucune habitude.</div>}
            {habits.map(h => (
              <div key={h.id} style={{ display:"grid", gridTemplateColumns:"1fr repeat(7,36px)", gap:6, alignItems:"center", marginBottom:8 }}>
                <div style={{ fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:8 }}>{h.emoji} {h.name}</div>
                {week.map((d,i) => {
                  const status=(h.dailyStatus||{})[d] ?? null;
                  const isDone=status==='validated';
                  const isInvalid=status==='invalidated';
                  const isToday=d===t;
                  const canClick=d<=t;
                  return (
                    <div key={i} onClick={() => canClick&&toggle(h.id,d)} style={{
                      width:32,height:32,borderRadius:"50%",margin:"0 auto",
                      background:isDone?"rgba(16,185,129,0.6)":isInvalid?"rgba(239,68,68,0.6)":isToday?"rgba(139,92,246,0.08)":"rgba(139,92,246,0.05)",
                      border:`2px solid ${isToday?C.accent:isDone?"#10b981":isInvalid?"#ef4444":"transparent"}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,color:isDone||isInvalid?"#fff":C.faint,
                      cursor:canClick?"pointer":"default",transition:TR,
                    }}>
                      {isDone&&"✓"}{isInvalid&&"✕"}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* MONTH — contribution grid */}
        {view==="mois" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, justifyContent:"center" }}>
              <button onClick={prevMonth} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>←</button>
              <span style={{fontSize:14,fontWeight:700,color:C.text,minWidth:140,textAlign:"center"}}>{MONTH_FR[mMonth]} {mYear}</span>
              <button onClick={nextMonth} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"7px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>→</button>
            </div>
            {habits.length===0&&<div style={{fontSize:13,color:C.muted}}>Aucune habitude.</div>}
            {habits.map(h => {
              const days = monthDates(mYear, mMonth);
              return (
                <div key={h.id} style={{marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:8}}>{h.emoji} {h.name}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {days.map(d => {
                      const status=(h.dailyStatus||{})[d] ?? null;
                      const isDone=status==='validated';
                      const isInvalid=status==='invalidated';
                      const isToday=d===t;
                      const canClick=d<=t;
                      return (
                        <div key={d} onClick={() => canClick&&toggle(h.id,d)} title={d.split("-")[2]} style={{
                          width:18,height:18,borderRadius:4,flexShrink:0,
                          background:isDone?"rgba(16,185,129,0.7)":isInvalid?"rgba(239,68,68,0.5)":"rgba(139,92,246,0.07)",
                          border:`1px solid ${isToday?C.accent:isDone?"#10b981":isInvalid?"#ef4444":"transparent"}`,
                          cursor:canClick?"pointer":"default",transition:TR,
                        }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MANAGE */}
        {view==="manage" && (
          <div>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <input value={newEmoji} onChange={e=>setNewEmoji(e.target.value)}
                style={{width:54,textAlign:"center",background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"10px 4px",borderRadius:12,fontSize:20,fontFamily:"inherit",outline:"none"}} />
              <Input value={newName} onChange={setNewName} onKeyDown={e=>e.key==="Enter"&&!newMultiple&&add()} placeholder="Nom de l'habitude..." />
              {!newMultiple && <Btn onClick={add} variant="accent" style={{whiteSpace:"nowrap"}}>+</Btn>}
            </div>
            <div onClick={()=>setNewMultiple(v=>!v)} style={{display:"flex",alignItems:"center",gap:7,marginBottom:newMultiple?10:16,cursor:"pointer",userSelect:"none"}}>
              <div style={{
                width:18,height:18,borderRadius:4,flexShrink:0,
                background:newMultiple?C.accent:"transparent",
                border:`2px solid ${newMultiple?C.accent:"rgba(139,92,246,0.35)"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"#fff",fontSize:12,fontWeight:700,transition:TR,
              }}>{newMultiple&&"✓"}</div>
              <span style={{fontSize:13,color:C.muted}}>Habitude multiple</span>
            </div>
            {newMultiple && (
              <div style={{background:C.surface3,borderRadius:12,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.muted,marginBottom:8,fontWeight:600}}>Items de l'habitude</div>
                {newItems.map(item=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid rgba(139,92,246,0.07)`}}>
                    <span style={{fontSize:13,color:C.text,flex:1}}>· {item.name}</span>
                    <button onClick={()=>setNewItems(newItems.filter(i=>i.id!==item.id))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"0 4px"}}>×</button>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <Input value={newItemText} onChange={setNewItemText}
                    onKeyDown={e=>{if(e.key==="Enter"&&newItemText.trim()){setNewItems(v=>[...v,{id:uid(),name:newItemText.trim()}]);setNewItemText("");}}}
                    placeholder="Ajouter un item..." />
                  <Btn onClick={()=>{if(newItemText.trim()){setNewItems(v=>[...v,{id:uid(),name:newItemText.trim()}]);setNewItemText("");}}} variant="ghost">+</Btn>
                </div>
                <Btn onClick={add} variant="accent" style={{width:"100%",marginTop:10}}>Créer l'habitude</Btn>
              </div>
            )}
            {habits.length===0&&<div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Aucune habitude définie.</div>}
            {habits.map(h => {
              const isEditing = editHabitId === h.id;
              return (
              <div key={h.id} style={{marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:isEditing?"16px 16px 0 0":16,background:C.surface2,border:`1px solid ${C.border}`,borderBottom:isEditing?`1px solid ${C.border}`:undefined}}>
                  <EmojiInput value={h.emoji} onSave={v=>update(h.id,{emoji:v})} />
                  <div style={{flex:1,minWidth:0}}>
                    {isEditing ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <input autoFocus value={editHabitName} onChange={e=>setEditHabitName(e.target.value)}
                          onBlur={()=>update(h.id,{name:editHabitName.trim()||h.name})}
                          onKeyDown={e=>{if(e.key==='Enter')update(h.id,{name:editHabitName.trim()||h.name});if(e.key==='Escape'){update(h.id,{name:editHabitName.trim()||h.name});setEditHabitId(null);}}}
                          style={{flex:1,background:'transparent',border:'none',borderBottom:`1px solid ${C.accent}`,color:C.text,fontSize:14,fontWeight:500,fontFamily:'inherit',outline:'none',padding:'2px 0'}} />
                        <span onClick={()=>setEditHabitId(null)} style={{fontSize:12,color:C.accent,cursor:'pointer',flexShrink:0}}>✓</span>
                      </div>
                    ) : (
                      <div style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}} onClick={()=>{setEditHabitId(h.id);setEditHabitName(h.name);setEditItemText("");}}>
                        <div style={{fontSize:14,fontWeight:500,color:C.text}}>{h.name}</div>
                        {h.multiple && <span style={{fontSize:10,padding:"1px 6px",borderRadius:999,background:C.purpleBg,color:C.accent,border:`1px solid ${C.border}`}}>multiple</span>}
                        <span style={{fontSize:12,color:C.faint,flexShrink:0}}>✏️</span>
                      </div>
                    )}
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>{(h.logs||[]).length} entrées · {streak(h)} j. série</div>
                  </div>
                  <Btn onClick={()=>del(h.id)} variant="ghost" style={{fontSize:12,color:C.red,borderColor:C.red+"40",padding:"6px 14px"}}>Suppr.</Btn>
                </div>
                {isEditing && (
                  <div style={{background:C.surface3,borderRadius:"0 0 16px 16px",border:`1px solid ${C.border}`,borderTop:"none",padding:"12px 16px"}}>
                    <div onClick={()=>update(h.id,{multiple:!h.multiple,items:h.multiple?[]:(h.items||[]),itemStatus:h.itemStatus||{}})} style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",userSelect:"none",marginBottom:h.multiple?10:0}}>
                      <div style={{
                        width:18,height:18,borderRadius:4,flexShrink:0,
                        background:h.multiple?C.accent:"transparent",
                        border:`2px solid ${h.multiple?C.accent:"rgba(139,92,246,0.35)"}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        color:"#fff",fontSize:12,fontWeight:700,transition:TR,
                      }}>{h.multiple&&"✓"}</div>
                      <span style={{fontSize:13,color:C.muted}}>Habitude multiple</span>
                    </div>
                    {h.multiple && (
                      <div>
                        <div style={{fontSize:12,color:C.muted,marginBottom:6,fontWeight:600}}>Items</div>
                        {(h.items||[]).map(item=>(
                          <div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid rgba(139,92,246,0.07)`}}>
                            <span style={{fontSize:13,color:C.text,flex:1}}>· {item.name}</span>
                            <button onClick={()=>update(h.id,{items:(h.items||[]).filter(i=>i.id!==item.id)})} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:"0 4px"}}>×</button>
                          </div>
                        ))}
                        <div style={{display:"flex",gap:8,marginTop:8}}>
                          <Input value={editItemText} onChange={setEditItemText}
                            onKeyDown={e=>{if(e.key==="Enter"&&editItemText.trim()){update(h.id,{items:[...(h.items||[]),{id:uid(),name:editItemText.trim()}]});setEditItemText("");}}}
                            placeholder="Ajouter un item..." />
                          <Btn onClick={()=>{if(editItemText.trim()){update(h.id,{items:[...(h.items||[]),{id:uid(),name:editItemText.trim()}]});setEditItemText("");}}} variant="ghost">+</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKPERF — Live session widget + modals
// ─────────────────────────────────────────────────────────────────────────────
function ActiveSessionWidget({ session, onStop, onPause, onResume }) {
  const elapsed = useElapsedWithPause(session);
  if (!session) return null;
  const paused = !!session.pausedAt;
  return (
    <div style={{
      position:'fixed', bottom:64, left:0, right:0, zIndex:100,
      background: paused ? 'rgba(30,28,20,0.97)' : 'rgba(26,24,48,0.97)',
      borderTop: `1px solid ${paused ? 'rgba(245,158,11,0.5)' : 'rgba(139,92,246,0.4)'}`,
      borderBottom:'1px solid rgba(0,0,0,0.1)', padding:'10px 16px',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      backdropFilter:'blur(12px)',
    }}>
      <div>
        <div style={{fontSize:11,color: paused ? '#f59e0b' : '#9391b5',textTransform:'uppercase',letterSpacing:'0.08em'}}>
          {paused ? '⏸ EN PAUSE' : '⏱ EN COURS'} — {session.category}
        </div>
        <div style={{fontWeight:700,color:'#f1f0ff',fontSize:14}}>{session.name}</div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18,fontWeight:700,color: paused ? '#f59e0b' : '#8b5cf6',fontVariantNumeric:'tabular-nums',letterSpacing:'0.02em'}}>
          {formatElapsed(elapsed)}
        </span>
        <button
          onClick={paused ? onResume : onPause}
          style={{background: paused ? '#f59e0b' : 'rgba(139,92,246,0.2)',color: paused ? '#fff' : '#a78bfa',border:`1px solid ${paused?'#f59e0b':'rgba(139,92,246,0.4)'}`,borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12,cursor:'pointer',minHeight:36}}
        >
          {paused ? '▶ Reprendre' : '⏸ Pause'}
        </button>
        <button onClick={()=>onStop(elapsed)} style={{background:'#ef4444',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontWeight:700,fontSize:12,cursor:'pointer',minHeight:36}}>
          ✓ Fini
        </button>
      </div>
    </div>
  );
}

function LiveStopModal({ session, elapsed, onConfirm, onCancel }) {
  const [type, setType] = useState('DEEP');
  const [efficience, setEfficience] = useState('💡💡💡');
  return (
    <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={onCancel} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} />
      <div className="slide-up" style={{position:'relative',width:'min(480px,100%)',background:'#12112a',borderRadius:24,border:'1px solid rgba(139,92,246,0.25)',padding:'24px'}}>
        <div style={{fontSize:14,fontWeight:700,color:'#f1f0ff',textAlign:'center',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>⏹ Fin de session</div>
        <div style={{fontSize:13,color:'#9391b5',textAlign:'center',marginBottom:20}}>{session?.name} · {formatElapsed(elapsed)}</div>
        <div style={{fontSize:10,color:'#9391b5',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}}>Type</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {WP_TYPES.map(tp=>(
            <button key={tp} onClick={()=>setType(tp)} style={{padding:'7px 15px',borderRadius:999,fontSize:12,border:`1px solid ${type===tp?WP_TYPE_C[tp]:'rgba(139,92,246,0.2)'}`,background:type===tp?WP_TYPE_C[tp]+'22':'transparent',color:type===tp?WP_TYPE_C[tp]:'#9391b5',fontFamily:'inherit',cursor:'pointer',fontWeight:type===tp?600:400}}>{tp}</button>
          ))}
        </div>
        <div style={{fontSize:10,color:'#9391b5',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.08em'}}>Efficience</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:20}}>
          {WP_EFFICIENCE.map(e=>(
            <button key={e} onClick={()=>setEfficience(e)} style={{padding:'7px 12px',borderRadius:999,fontSize:15,border:`1px solid ${efficience===e?'#8b5cf6':'rgba(139,92,246,0.2)'}`,background:efficience===e?'rgba(139,92,246,0.15)':'transparent',fontFamily:'inherit',cursor:'pointer'}}>{e}</button>
          ))}
        </div>
        <button onClick={()=>onConfirm({type,efficience})} style={{width:'100%',background:'linear-gradient(135deg,#8b5cf6,#6366f1)',color:'#fff',border:'none',borderRadius:14,padding:'14px',fontSize:14,fontWeight:700,cursor:'pointer'}}>
          Enregistrer la session
        </button>
      </div>
    </div>
  );
}

function SessionChoiceModal({ onClose, onLive, onLog }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} />
      <div className="slide-up" style={{
        position:'relative',width:'min(480px,100%)',background:'#12112a',
        borderRadius:24,border:'1px solid rgba(139,92,246,0.25)',
        padding:'28px 24px',
      }}>
        <div style={{fontSize:14,fontWeight:700,color:'#f1f0ff',textAlign:'center',marginBottom:24,textTransform:'uppercase',letterSpacing:'0.08em'}}>Nouvelle Session</div>
        <button onClick={onLive} style={{
          width:'100%',background:'linear-gradient(135deg,#8b5cf6,#6366f1)',color:'#fff',
          border:'none',borderRadius:16,padding:'18px 20px',fontSize:15,fontWeight:700,
          cursor:'pointer',marginBottom:12,textAlign:'left',
        }}>
          <div style={{fontSize:22,marginBottom:4}}>▶</div>
          <div>Démarrer en live</div>
          <div style={{fontSize:12,fontWeight:400,opacity:0.8,marginTop:2}}>Chrono Clockify-style</div>
        </button>
        <button onClick={onLog} style={{
          width:'100%',background:'transparent',color:'#9391b5',
          border:'1px solid rgba(139,92,246,0.3)',borderRadius:16,padding:'18px 20px',fontSize:15,fontWeight:600,
          cursor:'pointer',textAlign:'left',
        }}>
          <div style={{fontSize:22,marginBottom:4}}>📝</div>
          <div>Logger une session</div>
          <div style={{fontSize:12,fontWeight:400,opacity:0.7,marginTop:2}}>Session passée</div>
        </button>
      </div>
    </div>
  );
}

function LiveStartForm({ onClose, onLaunch }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState('BUSINESS');
  return (
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} />
      <div className="slide-up" style={{
        position:'relative',width:'min(480px,100%)',background:'#12112a',
        borderRadius:24,border:'1px solid rgba(139,92,246,0.25)',
        padding:'24px',
      }}>
        <div style={{fontSize:14,fontWeight:700,color:'#f1f0ff',textAlign:'center',marginBottom:20,textTransform:'uppercase',letterSpacing:'0.08em'}}>▶ Session Live</div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nom de la session..."
          style={{width:'100%',background:'#1a1830',border:'1px solid rgba(139,92,246,0.3)',color:'#f1f0ff',padding:'12px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:12}} />
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{width:'100%',background:'#1a1830',border:'1px solid rgba(139,92,246,0.3)',color:'#f1f0ff',padding:'12px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:20}}>
          {WP_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={()=>{ if(!name.trim()) return; onLaunch(name.trim(),cat); onClose(); }}
          style={{width:'100%',background:'linear-gradient(135deg,#8b5cf6,#6366f1)',color:'#fff',border:'none',borderRadius:14,padding:'15px',fontSize:15,fontWeight:700,cursor:'pointer'}}>
          ▶ Lancer la session
        </button>
      </div>
    </div>
  );
}

function SessionLogForm({ onClose }) {
  const [form, setForm] = useState({tache:'',temps:'',type:'DEEP',domaine:'BUSINESS',efficience:'💡💡💡'});
  const set = p => setForm(f=>({...f,...p}));
  const save = () => {
    if (!form.tache.trim() || !form.temps) return;
    const sessions = getLS("lp_workperf", []);
    setLS("lp_workperf", [...sessions, {id:uid(),tache:form.tache.trim(),date:todayStr(),temps:parseInt(form.temps),type:form.type,domaine:form.domaine,efficience:form.efficience}]);
    onClose();
  };
  return (
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} />
      <div className="slide-up" style={{position:'relative',width:'min(480px,100%)',background:C.surface,borderRadius:24,border:`1px solid ${C.borderMid}`,padding:'24px'}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,textAlign:'center',marginBottom:20,textTransform:'uppercase',letterSpacing:'0.08em'}}>📝 Logger une session</div>
        <input value={form.tache} onChange={e=>set({tache:e.target.value})} placeholder="Nom de la session / tâche..."
          style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'11px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:10}} />
        <div style={{display:'flex',gap:8,marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:5}}>Durée (minutes)</div>
            <input type="number" min="1" value={form.temps} onChange={e=>set({temps:e.target.value})} placeholder="min"
              style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'11px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}} />
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:5}}>Domaine</div>
            <select value={form.domaine} onChange={e=>set({domaine:e.target.value})}
              style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'11px 14px',borderRadius:12,fontSize:13,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}>
              {WP_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Type</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
          {WP_TYPES.map(tp=>(
            <button key={tp} onClick={()=>set({type:tp})} style={{padding:'6px 13px',borderRadius:999,fontSize:12,border:`1px solid ${form.type===tp?WP_TYPE_C[tp]:C.border}`,background:form.type===tp?WP_TYPE_C[tp]+'20':'transparent',color:form.type===tp?WP_TYPE_C[tp]:C.muted,fontFamily:'inherit',cursor:'pointer'}}>{tp}</button>
          ))}
        </div>
        <div style={{fontSize:10,color:C.muted,marginBottom:6}}>Efficience</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
          {WP_EFFICIENCE.map(e=>(
            <button key={e} onClick={()=>set({efficience:e})} style={{padding:'6px 12px',borderRadius:999,fontSize:14,border:`1px solid ${form.efficience===e?C.accent:C.border}`,background:form.efficience===e?C.accentBg:'transparent',fontFamily:'inherit',cursor:'pointer'}}>{e}</button>
          ))}
        </div>
        <button onClick={save} disabled={!form.tache.trim()||!form.temps}
          style={{width:'100%',background:GRAD,color:'#fff',border:'none',borderRadius:14,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',opacity:form.tache.trim()&&form.temps?1:0.5}}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function WPReview({ sessions, onDelete, onEdit }) {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const [expanded, setExpanded] = useState({});
  const toggle = d => setExpanded(e => ({...e,[d]:!e[d]}));

  const total = sessions.reduce((a,s)=>a+s.temps,0);
  const byType = sessions.reduce((acc,s)=>{ acc[s.type]=(acc[s.type]||0)+s.temps; return acc; },{});
  const byDomaine = sessions.reduce((acc,s)=>{ acc[s.domaine]=(acc[s.domaine]||0)+s.temps; return acc; },{});
  const domaines = Object.keys(byDomaine).sort((a,b)=>byDomaine[b]-byDomaine[a]);

  if (!sessions.length) return <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Aucune session sur cette période.</div>;

  return (
    <div>
      {/* Total + type pills */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontSize:22,fontWeight:700,color:C.accent}}>{fmtMin(total)}</span>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {WP_TYPES.filter(t=>byType[t]).map(t=>{
            const pct=Math.round(byType[t]/total*100);
            return <span key={t} style={{fontSize:11,fontWeight:600,color:WP_TYPE_C[t],background:WP_TYPE_C[t]+"18",padding:"3px 9px",borderRadius:999}}>{t} {pct}%</span>;
          })}
        </div>
      </div>

      {/* Domaine breakdown */}
      {domaines.map(d => {
        const pct = Math.round(byDomaine[d]/total*100);
        const open = expanded[d];
        const ds = sessions.filter(s=>s.domaine===d).sort((a,b)=>b.date.localeCompare(a.date));
        return (
          <div key={d} style={{marginBottom:8}}>
            <div onClick={()=>toggle(d)} style={{
              background:C.surface2,border:`1px solid ${open?C.borderMid:C.border}`,borderRadius:open?"14px 14px 0 0":14,
              padding:"12px 14px",cursor:"pointer",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
                <span style={{fontSize:13,fontWeight:600,color:C.text,flex:1}}>{d}</span>
                <span style={{fontSize:12,color:C.accent,fontWeight:700}}>{fmtMin(byDomaine[d])}</span>
                <span style={{fontSize:12,color:C.muted,minWidth:34,textAlign:"right"}}>{pct}%</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:2}}>{open?"▲":"▼"}</span>
              </div>
              <div style={{height:5,borderRadius:999,background:C.surface3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:C.accent,borderRadius:999,transition:"width 0.4s ease"}} />
              </div>
            </div>
            {open && (
              <div style={{background:C.surface,border:`1px solid ${C.borderMid}`,borderTop:"none",borderRadius:"0 0 14px 14px",padding:"8px 8px 4px"}}>
                {ds.map(s=>(
                  <div key={s.id}>
                    <div style={{fontSize:10,color:C.muted,paddingLeft:8,paddingTop:4,paddingBottom:2}}>{fmtDate(s.date)}</div>
                    <WPCard s={s} onDelete={onDelete} onEdit={onEdit} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tokens DA Cyber Focus (theme-light) — partagés par les modules reskinnés ──
const CF = {
  bg:"#0B0714", surface:"#181225", surface2:"#181225", surface3:"#221A36",
  border:"rgba(168,85,247,0.18)", borderMid:"rgba(168,85,247,0.38)",
  accent:"#A855F7", accent2:"#EC4899", accentBg:"rgba(168,85,247,0.16)",
  text:"#F4F2FF", muted:"#9990C0", faint:"#6B6390",
  green:"#34D399", greenBg:"rgba(52,211,153,0.14)",
  red:"#FB7185", redBg:"rgba(251,113,133,0.14)",
  blue:"#60A5FA", blueBg:"rgba(96,165,250,0.14)",
  purple:"#A855F7", purpleBg:"rgba(168,85,247,0.16)",
  amber:"#FBBF24", amberBg:"rgba(251,191,36,0.16)",
  orange:"#FB923C", pink:"#EC4899", cyan:"#22D3EE",
};
const CF_GRAD = "linear-gradient(135deg,#A855F7,#EC4899)";
const CF_GLOW = "0 0 28px rgba(168,85,247,0.45)";
const CF_GLOW_SM = "0 0 16px rgba(168,85,247,0.40)";
const CF_FONT = "var(--font-display)";

// En-tête réutilisable nouvelle DA — transparent, fondu dans le fond commun (aucun ruban)
function CFHeader({ eyebrow, title, action }) {
  return (
    <div style={{ padding:"22px 16px 12px", display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:12 }}>
      <div>
        {eyebrow && <div style={{ fontSize:10, color:CF.accent, textTransform:"uppercase", letterSpacing:"0.18em", fontWeight:700, marginBottom:4 }}>{eyebrow}</div>}
        <div style={{ fontFamily:CF_FONT, fontSize:26, fontWeight:800, color:CF.text, letterSpacing:"-0.02em", lineHeight:1 }}>{title}</div>
      </div>
      {action}
    </div>
  );
}

function WorkPerfModule({ activeSession, onSessionStart, onSessionStop }) {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const [sessions, setSessions] = useState(() => getLS("lp_workperf", []));
  const [view, setView] = useState("today");
  const [form, setForm] = useState({ tache:"",temps:"",type:"DEEP",domaine:"BUSINESS",efficience:"💡💡💡" });
  const [showForm, setShowForm] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const save = d => { setSessions(d); setLS("lp_workperf", d); };
  const add  = () => {
    if(!form.tache.trim()||!form.temps) return;
    save([...sessions,{id:uid(),tache:form.tache.trim(),date:todayStr(),temps:parseInt(form.temps),type:form.type,domaine:form.domaine,efficience:form.efficience}]);
    setForm(f=>({...f,tache:"",temps:""})); setShowForm(false);
  };
  const del  = id => save(sessions.filter(s=>s.id!==id));
  const edit = (id, patch) => save(sessions.map(s=>s.id===id?{...s,...patch}:s));
  const t=todayStr();
  const currentMonth=t.slice(0,7); // "YYYY-MM"
  const todaySessions=sessions.filter(s=>s.date===t);
  const weekSessions=sessions.filter(s=>weekDates().includes(s.date));
  const monthSessions=sessions.filter(s=>s.date.startsWith(currentMonth));
  const totalToday=todaySessions.reduce((a,s)=>a+s.temps,0);
  const deepToday=todaySessions.filter(s=>s.type==="DEEP").reduce((a,s)=>a+s.temps,0);
  const weekTotal=weekSessions.reduce((a,s)=>a+s.temps,0);
  return (
    <div className="theme-light" style={{minHeight:"100dvh",fontFamily:"var(--font-body)",color:C.text}}>
      <CFHeader eyebrow="Deep Work" title="WorkPerf" action={<button onClick={()=>setShowChoice(true)} style={{background:GRAD,color:"#fff",border:"none",padding:"10px 20px",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:GLOW_SM,fontFamily:"inherit",minHeight:44}}>+ Session</button>}/>
      {showChoice && <SessionChoiceModal onClose={()=>setShowChoice(false)} onLive={()=>{setShowChoice(false);setShowLive(true);}} onLog={()=>{setShowChoice(false);setShowForm(true);}} />}
      {showLive && <LiveStartForm onClose={()=>setShowLive(false)} onLaunch={(name,cat)=>{onSessionStart({name,category:cat,startTime:Date.now()});}} />}
      <div style={{padding:"16px 16px 100px"}}>
        {/* HERO focus — boxless, anneau dégradé (qualité Deep) */}
        {view==="today" && (()=>{
          const deepShare = totalToday>0 ? Math.round(deepToday/totalToday*100) : 0;
          const RING=148, SW=12, R=(RING-SW)/2, CIRC=2*Math.PI*R, off=CIRC*(1-deepShare/100);
          const Metric = ({value,label,color}) => (
            <div style={{textAlign:"center",minWidth:74}}>
              <div style={{fontFamily:FONT_D,fontSize:22,fontWeight:800,color:color||C.text,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{value}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:6,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>{label}</div>
            </div>
          );
          return (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,margin:"10px 0 30px",flexWrap:"wrap"}}>
              <Metric value={fmtMin(totalToday)||"—"} label="Total auj." color={C.accent} />
              <div style={{position:"relative",width:RING,height:RING,flexShrink:0}}>
                <svg width={RING} height={RING} style={{transform:"rotate(-90deg)",display:"block"}}>
                  <defs>
                    <linearGradient id="wpRing" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#22D3EE"/><stop offset="55%" stopColor="#A855F7"/><stop offset="100%" stopColor="#EC4899"/>
                    </linearGradient>
                  </defs>
                  <circle cx={RING/2} cy={RING/2} r={R} fill="none" stroke={C.surface3} strokeWidth={SW}/>
                  <circle cx={RING/2} cy={RING/2} r={R} fill="none" stroke="url(#wpRing)" strokeWidth={SW}
                    strokeDasharray={CIRC} strokeDashoffset={off} strokeLinecap="round"
                    style={{transition:"stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)",filter:"drop-shadow(0 0 6px rgba(168,85,247,0.7))"}}/>
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontFamily:FONT_D,fontSize:36,fontWeight:800,color:C.text,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{deepShare}<span style={{fontSize:18,fontWeight:600}}>%</span></div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginTop:4,fontWeight:700}}>Deep</div>
                </div>
              </div>
              <Metric value={fmtMin(weekTotal)||"—"} label="Semaine" color={C.blue} />
            </div>
          );
        })()}

        {/* Inline add form */}
        {showForm && (
          <div className="slide-up" style={{background:C.surface2,border:`1px solid ${C.borderMid}`,borderRadius:18,padding:16,marginBottom:16}}>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <Input value={form.tache} onChange={v=>setForm(f=>({...f,tache:v}))} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Tâche..." style={{flex:1}} />
              <input type="number" min="1" placeholder="min" value={form.temps} onChange={e=>setForm(f=>({...f,temps:e.target.value}))}
                style={{width:70,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:"10px 8px",borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none"}} />
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {WP_TYPES.map(tp=>(
                <button key={tp} onClick={()=>setForm(f=>({...f,type:tp}))} style={{
                  padding:"6px 14px",borderRadius:999,fontSize:12,border:`1px solid ${form.type===tp?WP_TYPE_C[tp]:C.border}`,
                  background:form.type===tp?WP_TYPE_C[tp]+"22":"transparent",color:form.type===tp?WP_TYPE_C[tp]:C.muted,
                  fontFamily:"inherit",fontWeight:form.type===tp?600:400,
                }}>{tp}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <Select value={form.domaine} options={WP_DOMAINES} onChange={v=>setForm(f=>({...f,domaine:v}))} style={{flex:1}} />
              <Select value={form.efficience} options={WP_EFFICIENCE} onChange={v=>setForm(f=>({...f,efficience:v}))} />
            </div>
            <Btn onClick={add} variant="accent" style={{width:"100%"}}>+ Enregistrer</Btn>
          </div>
        )}

        {/* View tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {[["today","Aujourd'hui"],["week","Cette semaine"],["month","Ce mois"]].map(([id,label])=>{
            const active=view===id;
            return <button key={id} onClick={()=>setView(id)} style={{padding:"8px 18px",borderRadius:999,border:`1px solid ${active?C.accent:C.border}`,background:active?C.accentBg:C.surface2,color:active?C.accent:C.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:active?600:400}}>{label}</button>;
          })}
        </div>

        {view==="today" && (todaySessions.length===0
          ? <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"48px 0"}}>Aucune session aujourd'hui.</div>
          : todaySessions.map(s=><WPCard key={s.id} s={s} onDelete={del} onEdit={edit} />)
        )}

        {view==="week" && <WPReview sessions={weekSessions} onDelete={del} onEdit={edit} />}

        {view==="month" && <WPReview sessions={monthSessions} onDelete={del} onEdit={edit} />}
      </div>
    </div>
  );
}

function WPCard({ s, onDelete, onEdit }) {
  const C = CF, GRAD = CF_GRAD, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const tc = WP_TYPE_C[s.type] || C.muted;

  const startEdit = () => {
    setDraft({ tache: s.tache, temps: s.temps, type: s.type, domaine: s.domaine, efficience: s.efficience });
    setEditing(true);
  };
  const saveEdit = () => {
    if (!draft.tache.trim() || !draft.temps) return;
    onEdit(s.id, { ...draft, temps: parseInt(draft.temps) });
    setEditing(false);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    const dtc = WP_TYPE_C[draft.type] || C.muted;
    return (
      <div className="slide-up" style={{borderRadius:14,marginBottom:8,background:C.surface2,border:`1px solid ${C.borderMid}`,borderLeft:`3px solid ${dtc}`,padding:"12px 16px"}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input
            autoFocus
            value={draft.tache}
            onChange={e=>setDraft(d=>({...d,tache:e.target.value}))}
            placeholder="Tâche..."
            style={{flex:1,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:"8px 10px",borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none"}}
          />
          <input
            type="number" min="1"
            value={draft.temps}
            onChange={e=>setDraft(d=>({...d,temps:e.target.value}))}
            placeholder="min"
            style={{width:64,background:C.surface3,border:`1px solid ${C.border}`,color:C.text,padding:"8px 8px",borderRadius:10,fontSize:13,fontFamily:"inherit",outline:"none"}}
          />
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {WP_TYPES.map(tp=>(
            <button key={tp} onClick={()=>setDraft(d=>({...d,type:tp}))} style={{
              padding:"5px 12px",borderRadius:999,fontSize:12,border:`1px solid ${draft.type===tp?WP_TYPE_C[tp]:C.border}`,
              background:draft.type===tp?WP_TYPE_C[tp]+"22":"transparent",color:draft.type===tp?WP_TYPE_C[tp]:C.muted,
              fontFamily:"inherit",fontWeight:draft.type===tp?600:400,cursor:"pointer",
            }}>{tp}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <Select value={draft.domaine} options={WP_DOMAINES} onChange={v=>setDraft(d=>({...d,domaine:v}))} style={{flex:1}} />
          <Select value={draft.efficience} options={WP_EFFICIENCE} onChange={v=>setDraft(d=>({...d,efficience:v}))} />
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={saveEdit} style={{flex:1,background:C.accent,color:"#fff",border:"none",padding:"8px 0",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Enregistrer</button>
          <button onClick={cancel} style={{flex:1,background:C.surface3,color:C.muted,border:`1px solid ${C.border}`,padding:"8px 0",borderRadius:10,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 6px",borderBottom:`1px solid ${C.border}`}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:tc,boxShadow:`0 0 8px ${tc}`,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.tache}</div>
        <div style={{display:"flex",gap:8,marginTop:3}}>
          <span style={{fontSize:11,color:tc,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.type}</span>
          <span style={{fontSize:11,color:C.muted}}>{s.domaine}</span>
          <span style={{fontSize:11,color:C.muted}}>{s.efficience}</span>
        </div>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <div style={{fontFamily:FONT_D,fontSize:17,fontWeight:800,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtMin(s.temps)}</div>
        <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:2}}>
          <span onClick={startEdit} style={{fontSize:12,color:C.muted,cursor:"pointer"}}>✎</span>
          <span onClick={()=>onDelete(s.id)} style={{fontSize:12,color:C.muted,cursor:"pointer"}}>✕</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY PAPER
// ─────────────────────────────────────────────────────────────────────────────
function DJRating({ label, options, value, onChange }) {
  const C = CF, GRAD = CF_GRAD, GLOW_SM = CF_GLOW_SM;
  const idx = options.indexOf(value);
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <span style={{fontSize:11,color:C.muted,minWidth:44}}>{label}</span>
      <div style={{display:"flex",gap:4}}>
        {options.map((o,i) => (
          <div key={i} onClick={()=>onChange(value===o?"":o)} style={{
            width:30,height:30,borderRadius:9,cursor:"pointer",
            background:idx>=i?GRAD:"transparent",
            border:`1px solid ${idx>=i?"transparent":C.border}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:12,fontWeight:700,
            color:idx>=i?"#fff":C.faint,
            boxShadow:idx>=i&&i===idx?GLOW_SM:"none",
            transition:TR,
          }}>{i+1}</div>
        ))}
      </div>
    </div>
  );
}

function RetrospectiveCards({ entry, onFieldChange, customGlobalItems, onAddCustomItem, onRemoveCustomItem, onUpdateCustomContent, onEditGlobalItem, onNav }) {
  const C = CF;
  const [showItemModal, setShowItemModal] = useState(false);
  const FIXED = [
    { key:'win',      label:'WIN',        icon:'🏆', color:'#34D399' },
    { key:'loss',     label:'LOSS',       icon:'💔', color:'#FB7185' },
    { key:'ameliorer',label:'À AMÉLIORER',icon:'🔧', color:'#60A5FA' },
  ];
  const todayCustom = entry.customItems || [];
  const todayCustomFull = todayCustom.map(tc => {
    const g = customGlobalItems.find(g=>g.id===tc.itemId);
    return g ? { ...g, content: tc.content } : null;
  }).filter(Boolean);
  const block = (color, head, value, onChange, placeholder) => (
    <div style={{display:'flex',gap:12,paddingBottom:16,marginBottom:16,borderBottom:`1px solid ${C.border}`}}>
      <div style={{width:3,borderRadius:3,background:color,flexShrink:0,boxShadow:`0 0 8px ${color}`}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{marginBottom:6}}>{head}</div>
        <textarea value={value} onChange={onChange} placeholder={placeholder} rows={2}
          style={{width:'100%',background:'transparent',border:'none',color:C.text,resize:'vertical',fontFamily:'inherit',fontSize:14,lineHeight:1.6,outline:'none',boxSizing:'border-box'}} />
      </div>
    </div>
  );
  return (
    <div>
      {FIXED.map(({key,label,icon,color})=>block(
        color,
        <span style={{color,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.12em'}}>{icon} {label}</span>,
        entry[key]||'', e=>onFieldChange(key,e.target.value),
        key==='win'?'Victoires de la journée...':key==='loss'?'Ce qui n\'a pas marché...':'Ce que tu veux améliorer...'
      ))}
      {todayCustomFull.map(item=>block(
        item.color,
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{color:item.color,fontWeight:700,fontSize:11,textTransform:'uppercase',letterSpacing:'0.12em'}}>{item.name}</span>
          <div style={{display:'flex',gap:10}}>
            <span onClick={()=>onEditGlobalItem(item.id)} style={{fontSize:13,cursor:'pointer',color:C.muted}}>✏️</span>
            <span onClick={()=>onRemoveCustomItem(item.id)} style={{fontSize:13,cursor:'pointer',color:C.faint}}>🗑️</span>
          </div>
        </div>,
        item.content||'', e=>onUpdateCustomContent(item.id,e.target.value), ''
      ))}
      <button onClick={()=>setShowItemModal(true)} style={{width:'100%',padding:'12px',borderRadius:12,border:`1px dashed ${C.borderMid}`,background:'transparent',color:C.accent,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
        + Ajouter un item
      </button>
      <button onClick={()=>onNav?.("finances")} style={{width:'100%',marginTop:10,padding:'12px 14px',borderRadius:12,border:`1px solid ${C.amber}55`,background:`linear-gradient(135deg, ${C.amber}1f, transparent 70%)`,color:C.amber,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        <span style={{fontSize:16}}>💰</span> N'oublie pas de mettre à jour tes comptes du jour
        <span style={{marginLeft:'auto',opacity:0.7}}>→</span>
      </button>
      {showItemModal && (
        <ItemAddModal globalItems={customGlobalItems} onClose={()=>setShowItemModal(false)}
          onAdd={(itemId)=>{ onAddCustomItem(itemId); setShowItemModal(false); }}
          onCreateAndAdd={(name,color)=>{ const id=onAddCustomItem(null,name,color); setShowItemModal(false); return id; }} />
      )}
    </div>
  );
}

function ItemAddModal({ globalItems, onClose, onAdd, onCreateAndAdd }) {
  const C = CF, GRAD = CF_GRAD, GLOW_SM = CF_GLOW_SM;
  const [tab, setTab] = useState('nouveau');
  const [name, setName] = useState('');
  const [color, setColor] = useState(ITEM_COLORS[0]);
  const [hexInput, setHexInput] = useState(ITEM_COLORS[0]);
  const [query, setQuery] = useState('');
  const filtered = globalItems.filter(i=>i.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div style={{position:'fixed',inset:0,zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
      <div onClick={onClose} style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} />
      <div className="slide-up" style={{position:'relative',width:'min(480px,100%)',background:C.surface,borderRadius:24,border:`1px solid ${C.borderMid}`,padding:'24px 20px',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,textAlign:'center',marginBottom:16,textTransform:'uppercase',letterSpacing:'0.08em'}}>Ajouter un item</div>
        <div style={{display:'flex',gap:4,marginBottom:20}}>
          {[['nouveau','Nouveau'],['existant','Existants']].map(([id,label])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:'8px',borderRadius:10,border:`1px solid ${tab===id?C.accent:C.border}`,background:tab===id?C.accentBg:'transparent',color:tab===id?C.accent:C.muted,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              {label}
            </button>
          ))}
        </div>
        <div style={{overflowY:'auto',flex:1}}>
          {tab==='nouveau' && (
            <div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nom de l'item..."
                style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'12px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:14}} />
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:8,fontWeight:600}}>Couleur</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                  {ITEM_COLORS.map(c=>(
                    <div key={c} onClick={()=>{setColor(c);setHexInput(c);}} style={{width:32,height:32,borderRadius:'50%',background:c,border:`3px solid ${color===c?'#fff':'transparent'}`,cursor:'pointer',flexShrink:0}} />
                  ))}
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{width:24,height:24,borderRadius:6,background:color,flexShrink:0}} />
                  <input value={hexInput} onChange={e=>{setHexInput(e.target.value);if(/^#[0-9a-fA-F]{6}$/.test(e.target.value))setColor(e.target.value);}}
                    placeholder="#hex" style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'8px 12px',borderRadius:10,fontSize:13,fontFamily:'inherit',outline:'none'}} />
                </div>
              </div>
              <button onClick={()=>{ if(!name.trim()) return; onCreateAndAdd(name.trim(),color); }}
                style={{width:'100%',background:GRAD,color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                Créer & Ajouter
              </button>
            </div>
          )}
          {tab==='existant' && (
            <div>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="🔍 Rechercher un item..."
                style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'12px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:12}} />
              {filtered.length===0 && <div style={{fontSize:13,color:C.muted,textAlign:'center',padding:'32px 0'}}>Aucun item. Crée-en un dans "Nouveau".</div>}
              {filtered.map(item=>(
                <div key={item.id} onClick={()=>onAdd(item.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:12,marginBottom:8,background:C.surface2,border:`1px solid ${C.border}`,cursor:'pointer'}}>
                  <div style={{width:16,height:16,borderRadius:'50%',background:item.color,flexShrink:0}} />
                  <span style={{flex:1,fontSize:14,color:C.text}}>{item.name}</span>
                  <span style={{fontSize:12,color:C.accent}}>+ Ajouter</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditGlobalItemModal({ item, onClose, onSave }) {
  const C = CF, GRAD = CF_GRAD, GLOW_SM = CF_GLOW_SM;
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,zIndex:450,display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}}>
      <div onClick={e=>e.stopPropagation()} className="slide-up" style={{width:'100%',maxWidth:480,background:C.surface,borderRadius:24,border:`1px solid ${C.borderMid}`,padding:'24px 20px'}}>
        <div style={{fontSize:14,fontWeight:700,color:C.text,textAlign:'center',marginBottom:16}}>Modifier l'item</div>
        <input value={name} onChange={e=>setName(e.target.value)}
          style={{width:'100%',background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'12px 14px',borderRadius:12,fontSize:14,fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:14}} />
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
          {ITEM_COLORS.map(c=>(
            <div key={c} onClick={()=>setColor(c)} style={{width:32,height:32,borderRadius:'50%',background:c,border:`3px solid ${color===c?'#fff':'transparent'}`,cursor:'pointer'}} />
          ))}
        </div>
        <button onClick={()=>onSave(name.trim(),color)} style={{width:'100%',background:GRAD,color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:14,fontWeight:700,cursor:'pointer'}}>
          Sauvegarder
        </button>
      </div>
    </div>
  );
}

function DailyPaperModule({ onNav }) {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const [daily, setDaily]     = useState(() => getLS("lp_daily", {}));
  const [customGlobalItems, setCustomGlobalItems] = useState(() => getLS("lp_custom_items", []));
  const [selDate, setSelDate] = useState(todayStr());
  const [editingItemId, setEditingItemId] = useState(null);
  const save = d => { setDaily(d); setLS("lp_daily", d); };
  const saveGlobal = g => { setCustomGlobalItems(g); setLS("lp_custom_items", g); };
  const setField = (field, val) => { const e=djEntry(daily[selDate]); save({...daily,[selDate]:{...e,[field]:val}}); };
  const entry = djEntry(daily[selDate]);
  const sortedDates = Object.keys(daily).filter(d=>{const e=djEntry(daily[d]);return e.morning||e.win||e.loss||e.ameliorer||e.remark||((e.customItems||[]).length>0);}).sort((a,b)=>b.localeCompare(a));
  const t=todayStr(); const isToday=selDate===t;
  const prevDay = () => { const d=new Date(selDate+"T12:00:00"); d.setDate(d.getDate()-1); setSelDate(d.toISOString().split("T")[0]); };
  const nextDay = () => { const d=new Date(selDate+"T12:00:00"); d.setDate(d.getDate()+1); const next=d.toISOString().split("T")[0]; if(next<=t) setSelDate(next); };

  const addCustomItem = (itemId, newName, newColor) => {
    let gId = itemId;
    if (!itemId) {
      gId = uid();
      saveGlobal([...customGlobalItems, {id:gId, name:newName, color:newColor, createdAt:new Date().toISOString()}]);
    }
    const e = djEntry(daily[selDate]);
    if ((e.customItems||[]).some(tc=>tc.itemId===gId)) return gId;
    save({...daily,[selDate]:{...e,customItems:[...(e.customItems||[]),{itemId:gId,content:''}]}});
    return gId;
  };
  const removeCustomItem = (itemId) => {
    const e=djEntry(daily[selDate]);
    save({...daily,[selDate]:{...e,customItems:(e.customItems||[]).filter(tc=>tc.itemId!==itemId)}});
  };
  const updateCustomContent = (itemId, content) => {
    const e=djEntry(daily[selDate]);
    save({...daily,[selDate]:{...e,customItems:(e.customItems||[]).map(tc=>tc.itemId===itemId?{...tc,content}:tc)}});
  };
  const editingItem = customGlobalItems.find(g=>g.id===editingItemId);

  return (
    <div className="theme-light" style={{minHeight:"100dvh",fontFamily:"var(--font-body)",color:C.text}}>
      <CFHeader eyebrow="Journal" title="Daily Paper" />
      <div style={{padding:"4px 16px 100px"}}>
        {/* Date nav */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,justifyContent:"center"}}>
          <button onClick={prevDay} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:"8px 16px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",fontSize:16}}>←</button>
          <span style={{fontSize:14,fontWeight:600,color:isToday?C.accent:C.text,flex:1,textAlign:"center"}}>
            {fmtDate(selDate)}{isToday?" · Aujourd'hui":""}
          </span>
          <button onClick={nextDay} disabled={isToday} style={{background:C.surface2,border:`1px solid ${C.border}`,color:isToday?C.muted:C.text,padding:"8px 16px",borderRadius:12,cursor:isToday?"default":"pointer",fontFamily:"inherit",fontSize:16,opacity:isToday?0.35:1}}>→</button>
        </div>

        {/* Indicators — boxless */}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <Select value={entry.type} options={DJ_TYPES} onChange={v=>setField("type",v)} style={{flex:1,minWidth:140}} />
            <Input value={entry.remark} onChange={v=>setField("remark",v)} placeholder="Remarque..." style={{flex:1}} />
          </div>
          <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:"0.16em",fontWeight:700,marginBottom:12}}>Énergie &amp; ressenti</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <DJRating label="Matin"  options={DJ_ENERGY} value={entry.morning} onChange={v=>setField("morning",v)} />
              <DJRating label="Midi"   options={DJ_ENERGY} value={entry.noon}    onChange={v=>setField("noon",v)} />
              <DJRating label="Soir"   options={DJ_ENERGY} value={entry.evening} onChange={v=>setField("evening",v)} />
            </div>
            <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
              <DJRating label="Focus"  options={DJ_FOCUS}  value={entry.focus}   onChange={v=>setField("focus",v)} />
              <DJRating label="Stress" options={DJ_STRESS} value={entry.stress}  onChange={v=>setField("stress",v)} />
              <DJRating label="Bonheur" options={DJ_HAPPY} value={entry.happy}   onChange={v=>setField("happy",v)} />
            </div>
          </div>
        </div>

        {/* Win/Loss/Améliorer + custom items */}
        <RetrospectiveCards
          entry={entry}
          onFieldChange={setField}
          customGlobalItems={customGlobalItems}
          onAddCustomItem={addCustomItem}
          onRemoveCustomItem={removeCustomItem}
          onUpdateCustomContent={updateCustomContent}
          onEditGlobalItem={id=>setEditingItemId(id)}
          onNav={onNav}
        />

        {/* Recent entries */}
        {sortedDates.length>0 && (
          <div style={{marginTop:20}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Entrées récentes</div>
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
              {sortedDates.slice(0,15).map(d=>{
                const e=djEntry(daily[d]);
                const active=selDate===d;
                return (
                  <button key={d} onClick={()=>setSelDate(d)} style={{
                    flexShrink:0,padding:"6px 12px",borderRadius:999,border:`1px solid ${active?C.accent:C.border}`,
                    background:active?C.accentBg:C.surface2,color:active?C.accent:C.muted,
                    fontSize:12,fontFamily:"inherit",cursor:"pointer",
                  }}>
                    {new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}
                    {e.morning&&<span style={{marginLeft:4}}>⚡{e.morning.length}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {editingItem && (
        <EditGlobalItemModal item={editingItem} onClose={()=>setEditingItemId(null)}
          onSave={(name,color)=>{ saveGlobal(customGlobalItems.map(g=>g.id===editingItem.id?{...g,name,color}:g)); setEditingItemId(null); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGS
// ─────────────────────────────────────────────────────────────────────────────
function DayLogCard({ date, habits, daily, sessions=[], onToggleHabit, onDeleteDaily, onUpdateDaily }) {
  const C = CF, GRAD = CF_GRAD, GLOW_SM = CF_GLOW_SM;
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(false);
  const t=todayStr(); const raw=daily[date]; const paperEntry=raw?djEntry(raw):null; const editEntry=djEntry(raw);
  const doneCount=habits.filter(h=>habitValidated(h,date)).length;
  const sessionTotal=sessions.reduce((s,x)=>s+x.temps,0);
  const hasContent=paperEntry||sessions.length>0||habits.length>0;

  // Compact summary row
  const summary=(
    <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",cursor:"pointer",userSelect:"none"}}>
      <span style={{fontSize:12,fontWeight:600,color:date===t?C.accent:C.text,flex:1}}>{new Date(date+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"})}</span>
      {habits.length>0&&<span style={{fontSize:10,color:doneCount===habits.length?C.green:C.muted}}>🔥 {doneCount}/{habits.length}</span>}
      {paperEntry&&<span style={{fontSize:10,color:C.blue}}>📝</span>}
      {sessionTotal>0&&<span style={{fontSize:10,color:C.purple}}>⏱️ {fmtMin(sessionTotal)}</span>}
      {!hasContent&&<span style={{fontSize:10,color:C.faint}}>—</span>}
      <span style={{fontSize:10,color:C.faint}}>{open?"▲":"▼"}</span>
    </div>
  );

  if(!open) return (
    <div style={{marginLeft:8,marginBottom:4,background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
      {summary}
    </div>
  );

  return (
    <div style={{marginLeft:8,marginBottom:4,background:C.surface2,border:`1px solid ${C.borderMid}`,borderRadius:10,overflow:"hidden"}}>
      {summary}
      <div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`}}>
        {habits.length>0&&(
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Habitudes</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {habits.map(h=>{
                const st=(h.dailyStatus||{})[date]??null;
                const done=st==='validated'; const inv=st==='invalidated';
                return <span key={h.id} onClick={()=>onToggleHabit(h.id,date)} style={{padding:"3px 10px",borderRadius:999,cursor:"pointer",fontSize:11,userSelect:"none",border:`1px solid ${done?"rgba(16,185,129,0.4)":inv?"rgba(239,68,68,0.4)":C.border}`,background:done?"rgba(16,185,129,0.1)":inv?"rgba(239,68,68,0.1)":"transparent",color:done?C.green:inv?C.red:C.muted}}>{h.emoji} {h.name}{done?" ✓":inv?" ✕":""}</span>;
              })}
            </div>
          </div>
        )}
        {paperEntry&&!editing&&(
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Daily Paper</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{paperEntry.type}{paperEntry.remark&&` · "${paperEntry.remark}"`}</div>
            {["win","loss","ameliorer"].filter(k=>paperEntry[k]).map(k=>(
              <div key={k} style={{fontSize:11,color:C.text,lineHeight:1.5,marginBottom:3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}><strong style={{color:k==='win'?C.green:k==='loss'?C.red:'#3b82f6'}}>{k.toUpperCase()} </strong>{paperEntry[k]}</div>
            ))}
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <Btn onClick={()=>setEditing(true)} variant="ghost" style={{fontSize:11,padding:"3px 10px"}}>✎ Modifier</Btn>
              <Btn onClick={()=>onDeleteDaily(date)} variant="ghost" style={{fontSize:11,padding:"3px 10px",color:C.red,borderColor:C.red+"40"}}>✕ Supprimer</Btn>
            </div>
          </div>
        )}
        {editing&&(
          <div style={{marginBottom:10}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <Select value={editEntry.type} options={DJ_TYPES} onChange={v=>onUpdateDaily(date,"type",v)} />
              <Input value={editEntry.remark} onChange={v=>onUpdateDaily(date,"remark",v)} placeholder="Remarque..." style={{flex:1}} />
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <DJRating label="Matin" options={DJ_ENERGY} value={editEntry.morning} onChange={v=>onUpdateDaily(date,"morning",v)} />
              <DJRating label="Focus" options={DJ_FOCUS}  value={editEntry.focus}   onChange={v=>onUpdateDaily(date,"focus",v)} />
              <DJRating label="Stress" options={DJ_STRESS} value={editEntry.stress} onChange={v=>onUpdateDaily(date,"stress",v)} />
              <DJRating label="Bonheur" options={DJ_HAPPY} value={editEntry.happy} onChange={v=>onUpdateDaily(date,"happy",v)} />
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
              {[{key:"win",ph:"Victoires..."},{key:"loss",ph:"Ce qui n'a pas marché..."},{key:"ameliorer",ph:"À améliorer..."}].map(({key,ph})=>(
                <textarea key={key} value={editEntry[key]||""} onChange={e=>onUpdateDaily(date,key,e.target.value)} placeholder={ph}
                  style={{width:"100%",minHeight:50,background:C.surface3,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:"6px 8px",fontSize:11,fontFamily:"inherit",lineHeight:1.5,resize:"vertical",outline:"none",boxSizing:"border-box"}} />
              ))}
            </div>
            <Btn onClick={()=>setEditing(false)} variant="accent" style={{fontSize:11}}>✓ Terminé</Btn>
          </div>
        )}
        {sessions.length>0&&(
          <div>
            <div style={{fontSize:9,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Sessions · {fmtMin(sessionTotal)}</div>
            {sessions.map(s=>(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:6,marginBottom:3,background:C.surface3,border:`1px solid ${C.border}`}}>
                <span style={{fontSize:9,color:C.accent,fontWeight:700,width:36,flexShrink:0}}>{s.type}</span>
                <span style={{fontSize:11,color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.tache}</span>
                <span style={{fontSize:10,color:C.muted,flexShrink:0}}>{s.temps}min</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY REVIEW MODAL
// ─────────────────────────────────────────────────────────────────────────────
const emojiVal = (arr, val) => { const i = arr.indexOf(val); return i >= 0 ? i + 1 : null; };
const avg = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length) : null;
const avgBar = (val, max, color) => val == null ? null : (
  <div style={{display:"flex",alignItems:"center",gap:6}}>
    <div style={{flex:1,height:4,borderRadius:2,background:C.surface3,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${(val/max)*100}%`,background:color,borderRadius:2,transition:"width 0.3s"}} />
    </div>
    <span style={{fontSize:10,color,fontWeight:600,minWidth:24,textAlign:"right"}}>{val.toFixed(1)}</span>
  </div>
);

// Anneau de progression (donut) — val/max
const RingGauge = ({ val, max=5, color, size=72, stroke=7, label, icon }) => {
  const r = (size-stroke)/2, circ = 2*Math.PI*r;
  const pct = val==null ? 0 : Math.max(0,Math.min(1,val/max));
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div style={{position:"relative",width:size,height:size}}>
        <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.surface3} strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
            style={{transition:"stroke-dashoffset 0.4s ease",filter:`drop-shadow(0 0 4px ${color}55)`}} />
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:16,fontWeight:700,color:C.text,lineHeight:1}}>{val==null?"—":val.toFixed(1)}</span>
          <span style={{fontSize:8,color:C.faint,marginTop:1}}>/{max}</span>
        </div>
      </div>
      {label && <div style={{fontSize:10,color:C.muted,fontWeight:600,display:"flex",alignItems:"center",gap:3}}>{icon&&<span style={{color}}>{icon}</span>}{label}</div>}
    </div>
  );
};

const PIE_COLORS = ['#8b5cf6','#6366f1','#10b981','#f59e0b','#ef4444','#f97316','#ec4899','#06b6d4','#84cc16','#14b8a6'];
function PieChart({ data, onSliceClick, activeName, centerLabel="TOTAL" }) {
  if (!data.length) return null;
  const size = 188, stroke = 16, r = (size - stroke)/2 - 8, cx = size/2, cy = size/2;
  const circ = 2*Math.PI*r;
  const total = data.reduce((s,d)=>s+d.mins,0);
  const gap = data.length > 1 ? 7 : 0;
  const clickable = !!onSliceClick;
  const active = data.find(d => d.name === activeName);
  let acc = 0;
  const segs = data.map(d => {
    const len = (d.pct/100)*circ;
    const seg = { ...d, len, offset: acc };
    acc += len;
    return seg;
  });
  return (
    <div style={{display:'flex',gap:22,alignItems:'center',flexWrap:'wrap'}}>
      <div style={{position:'relative',width:size,height:size,flexShrink:0}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface3} strokeWidth={stroke} opacity={0.35} />
          {segs.map((sg,i)=>{
            const isActive = activeName===sg.name;
            const dash = Math.max(0.1, sg.len - gap);
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={sg.color} strokeWidth={isActive?stroke+6:stroke} strokeLinecap="round"
                strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-sg.offset}
                onClick={clickable?()=>onSliceClick(sg):undefined}
                style={{cursor:clickable?'pointer':'default',opacity:activeName&&!isActive?0.3:1,
                  filter:isActive?`drop-shadow(0 0 9px ${sg.color})`:`drop-shadow(0 0 3px ${sg.color}55)`,
                  transition:'stroke-width 0.25s ease, opacity 0.25s ease'}}>
                <title>{sg.name} · {sg.fmtMins} · {sg.pct}%</title>
              </circle>
            );
          })}
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none',padding:'0 30px'}}>
          {active ? (<>
            <span style={{fontSize:26,fontWeight:800,color:active.color,lineHeight:1,textShadow:`0 0 14px ${active.color}66`}}>{active.pct}%</span>
            <span style={{fontSize:10,color:C.text,fontWeight:600,marginTop:4,maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{active.name}</span>
            <span style={{fontSize:9,color:C.faint,marginTop:1}}>{active.fmtMins}</span>
          </>) : (<>
            <span style={{fontSize:9,color:C.muted,letterSpacing:'0.14em',fontWeight:700}}>{centerLabel}</span>
            <span style={{fontSize:19,fontWeight:800,color:C.text,marginTop:3}}>{fmtHM(total)}</span>
            <span style={{fontSize:9,color:C.faint,marginTop:1}}>{data.length} cat.</span>
          </>)}
        </div>
      </div>
      <div style={{flex:1,minWidth:150,display:'flex',flexDirection:'column',gap:6}}>
        {data.map((d,i)=>{
          const isActive = activeName===d.name;
          return (
            <div key={i} onClick={clickable?()=>onSliceClick(d):undefined}
              style={{display:'flex',alignItems:'center',gap:9,padding:'7px 12px',borderRadius:999,
                background:isActive?d.color+'1f':'transparent',
                border:`1px solid ${isActive?d.color+'99':C.border}`,
                cursor:clickable?'pointer':'default',opacity:activeName&&!isActive?0.4:1,transition:'all 0.15s'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:d.color,flexShrink:0,boxShadow:`0 0 7px ${d.color}`}} />
              <span style={{fontSize:12,color:C.text,fontWeight:600,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</span>
              <span style={{fontSize:10,color:C.muted,flexShrink:0}}>{d.fmtMins}</span>
              <span style={{fontSize:12,fontWeight:800,color:d.color,flexShrink:0,minWidth:34,textAlign:'right'}}>{d.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WRSection({ title, children }) {
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
        <div style={{flex:1,height:1,background:C.border}} />
        {title}
        <div style={{flex:1,height:1,background:C.border}} />
      </div>
      {children}
    </div>
  );
}

function WeeklyReviewModal({ onClose, wkStart, onSaved }) {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const wkEnd = weekEnd(wkStart);
  const locked = isWeekLocked(wkStart);
  const reviewedWeekId = getISOWeekId(new Date(wkStart + 'T12:00:00'));
  const targetWeekId = getNextWeekId(reviewedWeekId);
  const [reviews, setReviews] = useState(() => getLS("lp_weekly_reviews", []));
  const existing = reviews.find(r => r.weekStart === wkStart);
  const [note, setNote] = useState(existing?.note || "");
  const [wrWin, setWrWin] = useState(existing?.win || "");
  const [wrLoss, setWrLoss] = useState(existing?.loss || "");
  const [wrAmeliorer, setWrAmeliorer] = useState(existing?.ameliorer || "");
  const [wrCustomItems, setWrCustomItems] = useState(existing?.customItems || []);
  const [weeklyObjs, setWeeklyObjs] = useState(() => getLS("lp_weekly_objectives", []));
  const [newObjInput, setNewObjInput] = useState("");
  const [editObjId, setEditObjId] = useState(null);
  const [editObjTitle, setEditObjTitle] = useState("");
  const [saved, setSaved] = useState(false);
  const [sessFilter, setSessFilter] = useState(null); // {kind:'type'|'domaine', value, color}

  const habits  = getLS("lp_habits", []);
  const todos   = getLS("leplan_todos", []);
  const sessions= getLS("lp_workperf", []);
  const daily   = getLS("lp_daily", {});

  const saveObjs = o => { setWeeklyObjs(o); setLS("lp_weekly_objectives", o); };
  const currentObjs = weeklyObjs.filter(o => o.weekId === reviewedWeekId);
  const nextObjs = weeklyObjs.filter(o => o.weekId === targetWeekId);
  const updateObjStatus = (id, patch) => saveObjs(weeklyObjs.map(o=>o.id===id?{...o,...patch}:o));
  const addNextObj = () => {
    if (!newObjInput.trim()) return;
    saveObjs([...weeklyObjs, {id:uid(), weekId:targetWeekId, title:newObjInput.trim(), completed:false, missed:false, partial:false, note:'', createdAt:new Date().toISOString()}]);
    setNewObjInput("");
  };
  const deleteObj = id => saveObjs(weeklyObjs.filter(o=>o.id!==id));
  const startEditObj = obj => { setEditObjId(obj.id); setEditObjTitle(obj.title); };
  const commitEditObj = id => { saveObjs(weeklyObjs.map(o=>o.id===id?{...o,title:editObjTitle}:o)); setEditObjId(null); };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wkStart + "T12:00:00"); d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  // Stats
  const habitsDaysAll = weekDays.filter(d => habits.length > 0 && habits.every(h => habitValidated(h, d))).length;
  const habitsTotalDone = habits.length > 0 ? weekDays.reduce((s,d) => s + habits.filter(h=>habitValidated(h,d)).length, 0) : 0;
  const habitsTotal = habits.length * 7;
  const habitsPct = habitsTotal > 0 ? Math.round(habitsTotalDone / habitsTotal * 100) : 0;
  const sessionsWeek  = sessions.filter(s => weekDays.includes(s.date));
  const sessionsMins  = sessionsWeek.reduce((s, x) => s + (x.temps||0), 0);
  const todosWeek     = todos.filter(t => t.gtd==="projet" && t.done && t.doneAt && weekDays.includes(t.doneAt.slice(0,10)));
  const dailyEntries  = weekDays.map(d => ({ date: d, entry: djEntry(daily[d]) }));
  const dailyCount    = dailyEntries.filter(({entry:e}) => e.morning||e.win||e.loss||e.remark).length;

  // Daily averages
  const energyVals = dailyEntries.map(({entry:e}) => emojiVal(DJ_ENERGY, e.morning)).filter(v=>v!=null);
  const noonVals   = dailyEntries.map(({entry:e}) => emojiVal(DJ_ENERGY, e.noon)).filter(v=>v!=null);
  const eveVals    = dailyEntries.map(({entry:e}) => emojiVal(DJ_ENERGY, e.evening)).filter(v=>v!=null);
  const focusVals  = dailyEntries.map(({entry:e}) => emojiVal(DJ_FOCUS,  e.focus)).filter(v=>v!=null);
  const stressVals = dailyEntries.map(({entry:e}) => emojiVal(DJ_STRESS, e.stress)).filter(v=>v!=null);
  const happyVals  = dailyEntries.map(({entry:e}) => emojiVal(DJ_HAPPY,  e.happy)).filter(v=>v!=null);
  const avgEnergy  = avg(energyVals);
  const avgNoon    = avg(noonVals);
  const avgEve     = avg(eveVals);
  const avgEnergyDay = avg([...energyVals,...noonVals,...eveVals]); // moyenne globale journée
  const avgFocus   = avg(focusVals);
  const avgStress  = avg(stressVals);
  const avgHappy   = avg(happyVals);

  const fmtD = d => new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
  const fmtDshort = d => new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});

  // Y a-t-il qqch à sauver ? (évite reviews vides)
  const isDirty = !!(existing || note || wrWin || wrLoss || wrAmeliorer || wrCustomItems.length);

  // Persistance LS seule (safe hors render / unmount)
  const persistReview = () => {
    if (locked || !isDirty) return null;
    const review = {
      id: existing?.id || uid(),
      weekStart: wkStart, weekEnd: wkEnd,
      note, win: wrWin, loss: wrLoss, ameliorer: wrAmeliorer, customItems: wrCustomItems,
      summary: { habitsDaysAll, habitsPct, sessionsMins, sessionsCount: sessionsWeek.length, todosCompleted: todosWeek.length, dailyCount, avgEnergy, avgFocus, avgStress, avgHappy },
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locked: isWeekLocked(wkStart),
    };
    const updated = existing ? reviews.map(r => r.weekStart===wkStart ? review : r) : [...reviews, review];
    setLS("lp_weekly_reviews", updated);
    return updated;
  };

  const save = () => {
    const updated = persistReview();
    if (!updated) return;
    setReviews(updated);
    setSaved(true);
    onSaved?.();
    setTimeout(() => setSaved(false), 2500);
  };

  // Auto-sauvegarde : fermeture modal (unmount), onglet caché, fermeture page
  const persistRef = useRef(persistReview);
  persistRef.current = persistReview;
  useEffect(() => {
    const flush = () => { persistRef.current?.(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush(); // unmount = fermeture modal
    };
  }, []);

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
      <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.82)",backdropFilter:"blur(6px)"}} />
      <div className="theme-light" style={{position:"relative",width:"min(1280px,98vw)",maxHeight:"94vh",display:"flex",flexDirection:"column",background:C.surface,borderRadius:24,border:`1px solid ${C.borderMid}`,boxShadow:"0 0 60px rgba(168,85,247,0.35), 0 24px 80px rgba(0,0,0,0.8)",animation:"slide-up 0.22s ease",fontFamily:"var(--font-body)"}}>

        {/* Header */}
        <div style={{padding:"22px 28px 16px",display:"flex",alignItems:"center",gap:14,flexShrink:0}}>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:"0.18em",fontWeight:700,marginBottom:4}}>Rétrospective</div>
            <div style={{fontFamily:FONT_D,fontSize:24,fontWeight:800,color:C.text,letterSpacing:"-0.02em",lineHeight:1}}>Weekly Review</div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{fmtD(wkStart)} → {fmtD(wkEnd)}</div>
          </div>
          {locked
            ? <span style={{fontSize:12,color:C.amber,background:C.amberBg,padding:"4px 12px",borderRadius:999,border:`1px solid ${C.amber}`,fontWeight:600}}>🔒 Verrouillée</span>
            : <span style={{fontSize:11,color:C.green,background:C.greenBg,padding:"4px 12px",borderRadius:999,border:`1px solid ${C.green}`}}>Modifiable jusqu'au dimanche</span>
          }
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:26,cursor:"pointer",padding:"0 0 0 8px",lineHeight:1,flexShrink:0}}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{overflowY:"auto",padding:"24px 28px 28px",flex:1}}>

          {/* ── STATS ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28}}>
            {[
              {icon:"🔥",label:"Remplissage habitudes",value:`${habitsPct}%`,sub:`des habitudes cochées`,color:C.orange},
              {icon:"✅",label:"Projets terminés",value:String(todosWeek.length),sub:`cette semaine`,color:C.green},
              {icon:"⚡",label:"Temps de travail",value:fmtHM(sessionsMins),sub:`${sessionsWeek.length} sessions`,color:C.blue},
              {icon:"📓",label:"Journaux remplis",value:`${dailyCount}/7`,sub:`entrées daily`,color:C.purple},
            ].map(({icon,label,value,sub,color})=>(
              <div key={label} style={{padding:"16px",background:C.surface2,borderRadius:16,border:`1px solid ${C.border}`,textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.35)"}}>
                <div style={{fontSize:24,marginBottom:8}}>{icon}</div>
                <div style={{fontFamily:FONT_D,fontSize:28,fontWeight:800,color,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{value}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:6,lineHeight:1.3}}>{label}</div>
                <div style={{fontSize:10,color:C.faint,marginTop:2}}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── HABITUDES DÉTAIL ── */}
          {habits.length > 0 && (
            <WRSection title="Habitudes">
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr>
                      <th style={{textAlign:"left",padding:"6px 10px",color:C.faint,fontWeight:600,fontSize:11,minWidth:140}}>Habitude</th>
                      {weekDays.map((d,i)=>(
                        <th key={d} style={{padding:"6px 8px",color:C.muted,fontWeight:600,fontSize:11,textAlign:"center",minWidth:38}}>
                          <div>{DAY_LABELS[i]}</div>
                          <div style={{fontSize:9,color:C.faint,fontWeight:400}}>{fmtDshort(d).split(" ")[0]}</div>
                        </th>
                      ))}
                      <th style={{padding:"6px 8px",color:C.faint,fontWeight:600,fontSize:11,textAlign:"center",minWidth:38}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {habits.map(h => {
                      const total = weekDays.filter(d=>habitValidated(h,d)).length;
                      return (
                        <tr key={h.id} style={{borderTop:`1px solid ${C.border}`}}>
                          <td style={{padding:"8px 10px",color:C.text,fontWeight:500}}>
                            <span style={{marginRight:6}}>{h.emoji||"•"}</span>{h.name}
                          </td>
                          {weekDays.map(d=>{
                            const st=(h.dailyStatus||{})[d]??null;
                            const done=st==='validated'; const inv=st==='invalidated';
                            return (
                              <td key={d} style={{padding:"8px",textAlign:"center"}}>
                                <span style={{fontSize:16,color:done?C.green:inv?C.red:C.surface3}}>{done?"✓":inv?"✗":"·"}</span>
                              </td>
                            );
                          })}
                          <td style={{padding:"8px",textAlign:"center",fontWeight:700,color:total===7?C.green:total>=4?C.amber:C.red}}>
                            {Math.round(total/7*100)}%
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    <tr style={{borderTop:`2px solid ${C.border}`,background:C.surface3}}>
                      <td style={{padding:"8px 10px",color:C.muted,fontSize:11,fontWeight:600}}>TOTAL DU JOUR</td>
                      {weekDays.map(d=>{
                        const done=habits.filter(h=>habitValidated(h,d)).length;
                        const full=done===habits.length&&habits.length>0;
                        return (
                          <td key={d} style={{padding:"8px",textAlign:"center",fontWeight:700,fontSize:12,color:full?C.green:done>0?C.amber:C.faint}}>
                            {habits.length>0?Math.round(done/habits.length*100)+'%':'—'}
                          </td>
                        );
                      })}
                      <td style={{padding:"8px",textAlign:"center",fontWeight:700,color:C.accent,fontSize:12}}>
                        {habits.length*7>0?Math.round(weekDays.reduce((s,d)=>s+habits.filter(h=>habitValidated(h,d)).length,0)/(habits.length*7)*100)+'%':'—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </WRSection>
          )}

          {/* ── DAILY TRACKER ── */}
          {dailyCount > 0 && (
            <WRSection title="Daily Tracker">
              {/* Moyennes */}
              {(avgEnergyDay||avgFocus||avgStress||avgHappy) && (
                <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:12,marginBottom:16}}>
                  {/* Énergie unifiée — matin / midi / soir */}
                  <div style={{padding:"16px 18px",background:C.surface2,borderRadius:14,border:`1px solid ${C.border}`,
                    backgroundImage:`linear-gradient(135deg, ${C.amber}10, transparent 60%)`}}>
                    <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,display:"flex",alignItems:"center",gap:5}}>
                      <span style={{color:C.amber}}>⚡</span> Énergie — journée
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:18}}>
                      <RingGauge val={avgEnergyDay} color={C.amber} size={84} stroke={8} />
                      <div style={{flex:1,display:"flex",flexDirection:"column",gap:10}}>
                        {[
                          {l:"Matin",v:avgEnergy,n:energyVals.length},
                          {l:"Midi", v:avgNoon, n:noonVals.length},
                          {l:"Soir", v:avgEve,  n:eveVals.length},
                        ].map(({l,v,n})=>(
                          <div key={l}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                              <span style={{fontSize:10,color:C.muted,fontWeight:600}}>{l}</span>
                              <span style={{fontSize:10,color:C.amber,fontWeight:700}}>{v!=null?v.toFixed(1):"—"}<span style={{color:C.faint,fontWeight:400}}>/5</span></span>
                            </div>
                            <div style={{height:5,borderRadius:3,background:C.surface3,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${v!=null?(v/5)*100:0}%`,background:`linear-gradient(90deg,${C.amber}99,${C.amber})`,borderRadius:3,transition:"width 0.4s"}} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Focus / Stress / Bonheur — anneaux */}
                  <div style={{padding:"16px 12px",background:C.surface2,borderRadius:14,border:`1px solid ${C.border}`,
                    display:"flex",alignItems:"center",justifyContent:"space-around"}}>
                    {[
                      {label:"Focus",val:avgFocus,color:C.blue,icon:"❖"},
                      {label:"Stress",val:avgStress,color:C.red,icon:"✶"},
                      {label:"Bonheur",val:avgHappy,color:C.green,icon:"☺"},
                    ].map(({label,val,color,icon})=>(
                      <RingGauge key={label} val={val} color={color} size={70} stroke={7} label={label} icon={icon} />
                    ))}
                  </div>
                </div>
              )}
              {/* Par jour */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                {weekDays.map((d,i)=>{
                  const e=djEntry(daily[d]);
                  const hasData=e.morning||e.win||e.loss||e.ameliorer||e.focus||e.stress||e.happy;
                  const en=emojiVal(DJ_ENERGY,e.morning);
                  const fo=emojiVal(DJ_FOCUS,e.focus);
                  const st=emojiVal(DJ_STRESS,e.stress);
                  const ha=emojiVal(DJ_HAPPY,e.happy);
                  return (
                    <div key={d} style={{padding:"10px 8px",background:hasData?C.surface2:C.surface3,borderRadius:12,border:`1px solid ${hasData?C.border:"transparent"}`,opacity:hasData?1:0.4}}>
                      <div style={{fontSize:10,color:C.muted,fontWeight:700,marginBottom:6}}>{DAY_LABELS[i]}</div>
                      <div style={{fontSize:9,color:C.faint,marginBottom:8}}>{fmtDshort(d)}</div>
                      {hasData ? (
                        <>
                          {en&&<div style={{fontSize:9,marginBottom:3,color:C.amber}} title="Énergie">⚡ {en}/5</div>}
                          {fo&&<div style={{fontSize:9,marginBottom:3,color:C.blue}} title="Focus">❖ {fo}/5</div>}
                          {st&&<div style={{fontSize:9,marginBottom:3,color:C.red}} title="Stress">✶ {st}/5</div>}
                          {ha&&<div style={{fontSize:9,marginBottom:6,color:C.green}} title="Bonheur">☺ {ha}/5</div>}
                          {e.win&&<div style={{fontSize:9,color:C.green,lineHeight:1.4,borderTop:`1px solid ${C.border}`,paddingTop:4,marginBottom:2}}>🏆 {e.win.length>60?e.win.slice(0,60)+"…":e.win}</div>}
                          {e.loss&&<div style={{fontSize:9,color:C.red,lineHeight:1.4,marginTop:2}}>💔 {e.loss.length>60?e.loss.slice(0,60)+"…":e.loss}</div>}
                        </>
                      ) : (
                        <div style={{fontSize:9,color:C.faint,textAlign:"center",paddingTop:4}}>—</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Reflexions notables */}
              {dailyEntries.filter(({entry:e})=>e.win).map(({date,entry:e})=>(
                <div key={date+"w"} style={{marginTop:8,padding:"10px 14px",background:C.surface2,borderRadius:10,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.green}`}}>
                  <div style={{fontSize:10,color:C.green,fontWeight:600,marginBottom:4}}>{fmtDshort(date)} — WIN</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{e.win}</div>
                </div>
              ))}
              {dailyEntries.filter(({entry:e})=>e.loss).map(({date,entry:e})=>(
                <div key={date+"l"} style={{marginTop:8,padding:"10px 14px",background:C.surface2,borderRadius:10,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.red}`}}>
                  <div style={{fontSize:10,color:C.red,fontWeight:600,marginBottom:4}}>{fmtDshort(date)} — LOSS</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{e.loss}</div>
                </div>
              ))}
            </WRSection>
          )}

          {/* ── CAMEMBERTS SESSIONS (Type + Domaine) ── */}
          {sessionsWeek.length > 0 && (() => {
            // Anneau 1 : répartition par type (Deep, Shallow, ...)
            const typeMap = {};
            sessionsWeek.forEach(s => { const t=s.type||'AUTRE'; typeMap[t]=(typeMap[t]||0)+(s.temps||0); });
            const typeTotal = Object.values(typeMap).reduce((a,b)=>a+b,0);
            const typeData = Object.entries(typeMap)
              .sort(([,a],[,b])=>b-a)
              .map(([name,mins],i) => ({name,mins,pct:typeTotal?Math.round(mins/typeTotal*100):0,color:WP_TYPE_C[name]||PIE_COLORS[i%PIE_COLORS.length],fmtMins:fmtMin(mins)}));

            // Anneau 2 : répartition par domaine
            const domMap = {};
            sessionsWeek.forEach(s => { const d=s.domaine||'AUTRE'; domMap[d]=(domMap[d]||0)+(s.temps||0); });
            const domTotal = Object.values(domMap).reduce((a,b)=>a+b,0);
            const domData = Object.entries(domMap)
              .sort(([,a],[,b])=>b-a)
              .map(([name,mins],i) => ({name,mins,pct:domTotal?Math.round(mins/domTotal*100):0,color:PIE_COLORS[i%PIE_COLORS.length],fmtMins:fmtMin(mins)}));

            const pick = (kind,d) => setSessFilter(f => (f&&f.kind===kind&&f.value===d.name) ? null : {kind,value:d.name,color:d.color});
            const filtered = sessFilter
              ? sessionsWeek.filter(s => sessFilter.kind==='type' ? (s.type||'AUTRE')===sessFilter.value : (s.domaine||'AUTRE')===sessFilter.value)
              : [];

            return (
              <WRSection title="Répartition des sessions">
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
                  <div>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Par type</div>
                    <PieChart data={typeData} centerLabel="TYPE" onSliceClick={d=>pick('type',d)} activeName={sessFilter?.kind==='type'?sessFilter.value:null} />
                  </div>
                  <div>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>Par domaine</div>
                    <PieChart data={domData} centerLabel="DOMAINE" onSliceClick={d=>pick('domaine',d)} activeName={sessFilter?.kind==='domaine'?sessFilter.value:null} />
                  </div>
                </div>

                {/* Détail des sessions filtrées */}
                {sessFilter && (
                  <div style={{marginTop:16,padding:"14px 16px",background:C.surface2,borderRadius:14,border:`1px solid ${sessFilter.color}55`,borderLeft:`3px solid ${sessFilter.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <span style={{fontSize:9,padding:"3px 9px",borderRadius:999,background:sessFilter.color+"22",color:sessFilter.color,fontWeight:700,textTransform:"uppercase"}}>{sessFilter.kind}</span>
                      <span style={{fontSize:14,fontWeight:800,color:C.text}}>{sessFilter.value}</span>
                      <span style={{fontSize:11,color:C.muted}}>· {filtered.length} session{filtered.length>1?"s":""} · {fmtMin(filtered.reduce((s,x)=>s+(x.temps||0),0))}</span>
                      <button onClick={()=>setSessFilter(null)} style={{marginLeft:"auto",background:"none",border:`1px solid ${C.border}`,color:C.muted,fontSize:11,cursor:"pointer",borderRadius:999,padding:"3px 10px"}}>✕ Fermer</button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      {filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(s=>(
                        <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:C.surface3,borderRadius:9,border:`1px solid ${C.border}`}}>
                          <span style={{fontSize:9,padding:"2px 7px",borderRadius:999,background:WP_TYPE_C[s.type]+"22",color:WP_TYPE_C[s.type],fontWeight:700,flexShrink:0}}>{s.type}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:11,color:C.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.tache||s.domaine||"—"}</div>
                            <div style={{fontSize:9,color:C.faint}}>{fmtDshort(s.date)}{s.domaine&&sessFilter.kind==='type'?` · ${s.domaine}`:""}</div>
                          </div>
                          <span style={{fontSize:11,color:C.blue,fontWeight:700,flexShrink:0}}>{fmtMin(s.temps)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </WRSection>
            );
          })()}

          {/* ── TODOS COMPLÉTÉS ── */}
          {todosWeek.length > 0 && (
            <WRSection title="Projets complétés">
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {todosWeek.map(t=>{
                  const sc=SPHERES[t.sphere]?.c||C.border;
                  return (
                    <div key={t.id} style={{padding:"8px 12px",background:C.surface2,borderRadius:10,border:`1px solid ${C.border}`,borderLeft:`3px solid ${C.green}`,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:14,color:C.green,flexShrink:0}}>✓</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:C.muted,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</div>
                        {t.sphere&&<span style={{fontSize:9,color:sc}}>{SPHERES[t.sphere]?.label}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </WRSection>
          )}

          {/* ── RÉTROSPECTIVE ── */}
          <WRSection title="RÉTROSPECTIVE">
            {[
              {key:'win',label:'WIN',icon:'🏆',color:'#10b981',setter:setWrWin,val:wrWin,ph:'Victoires de la semaine...'},
              {key:'loss',label:'LOSS',icon:'💔',color:'#ef4444',setter:setWrLoss,val:wrLoss,ph:'Ce qui n\'a pas marché...'},
              {key:'ameliorer',label:'À AMÉLIORER',icon:'🔧',color:'#3b82f6',setter:setWrAmeliorer,val:wrAmeliorer,ph:'Ce que tu veux améliorer...'},
            ].map(({label,icon,color,setter,val,ph})=>(
              <div key={label} style={{borderLeft:`4px solid ${color}`,background:C.surface2,borderRadius:14,padding:16,marginBottom:12}}>
                <label style={{color,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:1,display:'block',marginBottom:8}}>{icon} {label}</label>
                <textarea value={val} onChange={e=>!locked&&setter(e.target.value)} readOnly={locked} placeholder={locked?"Verrouillé.":ph}
                  rows={3} style={{width:'100%',background:'transparent',border:'none',color:locked?C.muted:C.text,resize:'vertical',fontFamily:'inherit',fontSize:13,lineHeight:1.6,outline:'none',boxSizing:'border-box',cursor:locked?'default':'text'}} />
              </div>
            ))}
            {wrCustomItems.map(item=>(
              <div key={item.id} style={{borderLeft:`4px solid ${C.borderMid}`,background:C.surface2,borderRadius:14,padding:16,marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <input value={item.title} onChange={e=>!locked&&setWrCustomItems(s=>s.map(x=>x.id===item.id?{...x,title:e.target.value}:x))}
                    readOnly={locked} style={{flex:1,background:'transparent',border:'none',color:C.accent,fontWeight:700,fontSize:11,textTransform:'uppercase',fontFamily:'inherit',outline:'none'}} />
                  {!locked && <span onClick={()=>setWrCustomItems(s=>s.filter(x=>x.id!==item.id))} style={{fontSize:14,color:C.faint,cursor:'pointer'}}>🗑️</span>}
                </div>
                <textarea value={item.content||''} onChange={e=>!locked&&setWrCustomItems(s=>s.map(x=>x.id===item.id?{...x,content:e.target.value}:x))}
                  readOnly={locked} rows={3} style={{width:'100%',background:'transparent',border:'none',color:locked?C.muted:C.text,resize:'vertical',fontFamily:'inherit',fontSize:13,lineHeight:1.6,outline:'none',boxSizing:'border-box'}} />
              </div>
            ))}
            {!locked && (
              <button onClick={()=>setWrCustomItems(s=>[...s,{id:uid(),title:'Item personnalisé',content:''}])}
                style={{width:'100%',padding:'10px',borderRadius:12,border:`1px dashed ${C.borderMid}`,background:'transparent',color:C.accent,fontSize:13,fontWeight:600,cursor:'pointer'}}>
                + Ajouter un item
              </button>
            )}
          </WRSection>

          {/* ── OBJECTIFS DE SEMAINE ── */}
          <WRSection title="OBJECTIFS DE SEMAINE">
            {currentObjs.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Cette semaine — bilan</div>
                {currentObjs.map(obj=>{
                  const isDone=obj.completed, isMissed=obj.missed, isPartial=obj.partial;
                  const statusColor = isDone?C.green:isPartial?C.amber:isMissed?C.red:C.border;
                  const statusBg = isDone?'rgba(16,185,129,0.08)':isPartial?'rgba(245,158,11,0.08)':isMissed?'rgba(239,68,68,0.08)':C.surface2;
                  return (
                    <div key={obj.id} style={{borderRadius:14,marginBottom:10,background:statusBg,border:`1px solid ${statusColor}`,transition:'all 0.2s'}}>
                      {editObjId===obj.id ? (
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px'}}>
                          <input autoFocus value={editObjTitle} onChange={e=>setEditObjTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commitEditObj(obj.id);if(e.key==='Escape')setEditObjId(null);}}
                            style={{flex:1,background:'transparent',border:'none',borderBottom:`1px solid ${C.accent}`,color:C.text,fontSize:14,padding:'2px 0',fontFamily:'inherit',outline:'none'}} />
                          <button onClick={()=>commitEditObj(obj.id)} style={{padding:'4px 10px',borderRadius:8,border:'none',background:C.accent,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>OK</button>
                          <button onClick={()=>setEditObjId(null)} style={{padding:'4px 8px',borderRadius:8,border:'none',background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>✕</button>
                        </div>
                      ) : (
                        <div style={{padding:'12px 14px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                            <span style={{flex:1,fontSize:14,fontWeight:600,color:isDone?C.green:isPartial?C.amber:isMissed?C.red:C.text}}>{obj.title}</span>
                            <button onClick={()=>startEditObj(obj)} style={{background:'none',border:'none',color:C.faint,fontSize:12,cursor:'pointer',padding:'2px 4px',flexShrink:0}}>✏️</button>
                          </div>
                          <div style={{display:'flex',gap:6,marginBottom:obj.completed||obj.missed||obj.partial?10:0}}>
                            <button onClick={()=>updateObjStatus(obj.id,{completed:!isDone,missed:false,partial:false})}
                              style={{flex:1,padding:'6px 4px',borderRadius:8,border:`1px solid ${isDone?C.green:'rgba(16,185,129,0.3)'}`,background:isDone?C.green:'rgba(16,185,129,0.1)',color:isDone?'#fff':'#10b981',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                              ✅ Validé
                            </button>
                            <button onClick={()=>updateObjStatus(obj.id,{partial:!isPartial,completed:false,missed:false})}
                              style={{flex:1,padding:'6px 4px',borderRadius:8,border:`1px solid ${isPartial?C.amber:'rgba(245,158,11,0.3)'}`,background:isPartial?C.amber:'rgba(245,158,11,0.1)',color:isPartial?'#fff':'#f59e0b',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                              🔶 Partiel
                            </button>
                            <button onClick={()=>updateObjStatus(obj.id,{missed:!isMissed,completed:false,partial:false})}
                              style={{flex:1,padding:'6px 4px',borderRadius:8,border:`1px solid ${isMissed?C.red:'rgba(239,68,68,0.3)'}`,background:isMissed?C.red:'rgba(239,68,68,0.1)',color:isMissed?'#fff':'#ef4444',fontWeight:700,fontSize:11,cursor:'pointer'}}>
                              ❌ Raté
                            </button>
                          </div>
                          <textarea value={obj.note||''} onChange={e=>updateObjStatus(obj.id,{note:e.target.value})} placeholder="Préciser l'atteinte de l'objectif..."
                            rows={2} style={{width:'100%',background:'transparent',border:`1px solid ${C.border}`,borderRadius:8,color:C.text,padding:'8px 10px',fontSize:12,fontFamily:'inherit',resize:'vertical',outline:'none',boxSizing:'border-box',lineHeight:1.5}} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Semaine suivante ({targetWeekId}) — objectifs</div>
              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <input value={newObjInput} onChange={e=>setNewObjInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addNextObj()} placeholder="Nouvel objectif..."
                  style={{flex:1,background:C.surface2,border:`1px solid ${C.border}`,color:C.text,padding:'10px 14px',borderRadius:12,fontSize:13,fontFamily:'inherit',outline:'none'}} />
                <button onClick={addNextObj} style={{background:GRAD,color:'#fff',border:'none',borderRadius:12,padding:'10px 18px',fontWeight:700,fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>+ Ajouter</button>
              </div>
              {nextObjs.map(obj=>(
                <div key={obj.id} style={{borderRadius:10,marginBottom:6,background:C.surface2,border:`1px solid ${C.border}`}}>
                  {editObjId===obj.id ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px'}}>
                      <input autoFocus value={editObjTitle} onChange={e=>setEditObjTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')commitEditObj(obj.id);if(e.key==='Escape')setEditObjId(null);}}
                        style={{flex:1,background:'transparent',border:'none',borderBottom:`1px solid ${C.accent}`,color:C.text,fontSize:13,padding:'2px 0',fontFamily:'inherit',outline:'none'}} />
                      <button onClick={()=>commitEditObj(obj.id)} style={{padding:'4px 10px',borderRadius:8,border:'none',background:C.accent,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>OK</button>
                      <button onClick={()=>setEditObjId(null)} style={{padding:'4px 8px',borderRadius:8,border:'none',background:'transparent',color:C.muted,fontSize:11,cursor:'pointer'}}>✕</button>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px'}}>
                      <span style={{flex:1,fontSize:13,color:C.text}}>{obj.title}</span>
                      <button onClick={()=>startEditObj(obj)} style={{background:'none',border:'none',color:C.muted,fontSize:13,cursor:'pointer',padding:'2px 4px',lineHeight:1}}>✏️</button>
                      <span onClick={()=>deleteObj(obj.id)} style={{fontSize:14,color:C.faint,cursor:'pointer'}}>×</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </WRSection>

          {!locked && (
            <button onClick={save} style={{width:"100%",padding:"15px",borderRadius:14,background:saved?C.green:GRAD,color:"#fff",fontSize:14,fontWeight:700,fontFamily:"inherit",border:"none",cursor:"pointer",transition:TR,boxShadow:saved?"none":GLOW}}>
              {saved?"✓ Review sauvegardée !":"💾 Sauvegarder la Weekly Review"}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

function LogsModule({ onBack, viewMode, onSetViewMode, onSignOut, onOpenWeeklyReview, onPerso }) {
  const C = CF, GRAD = CF_GRAD, GLOW = CF_GLOW, GLOW_SM = CF_GLOW_SM, FONT_D = CF_FONT;
  const { todos: allTodos, restoreTodo } = useTodos();
  const [habits, setHabits] = useState(() => getLS("lp_habits", []));
  const [daily, setDaily]   = useState(() => getLS("lp_daily", {}));
  const [sessions]          = useState(() => getLS("lp_workperf", []));
  const [weeklyReviews, setWeeklyReviews] = useState(() => getLS("lp_weekly_reviews", []));
  const openReview = wkStart => onOpenWeeklyReview?.({ wkStart, onSaved: () => setWeeklyReviews(getLS("lp_weekly_reviews",[])) });
  const todayMk=todayStr().slice(0,7); const todayWk=weekStart(todayStr());
  const getQK = d => { const [y,m]=d.split("-").map(Number); return `${y}-T${Math.ceil(m/3)}`; };
  const [openWeeks,    setOpenWeeks]    = useState(()=>new Set());
  const [openQuarters, setOpenQuarters] = useState(()=>new Set());
  const [openMonthsQ,  setOpenMonthsQ]  = useState(()=>new Set());
  const [openQuartersR,setOpenQuartersR]= useState(()=>new Set());
  const [openMonthsR,  setOpenMonthsR]  = useState(()=>new Set());
  const [openWeeksR,   setOpenWeeksR]   = useState(()=>new Set());
  const toggleWeek    = wk => setOpenWeeks(s=>{const n=new Set(s);n.has(wk)?n.delete(wk):n.add(wk);return n;});
  const toggleQuarter = qk => setOpenQuarters(s=>{const n=new Set(s);n.has(qk)?n.delete(qk):n.add(qk);return n;});
  const toggleMonthQ  = mk => setOpenMonthsQ(s=>{const n=new Set(s);n.has(mk)?n.delete(mk):n.add(mk);return n;});
  const toggleQR = qk => setOpenQuartersR(s=>{const n=new Set(s);n.has(qk)?n.delete(qk):n.add(qk);return n;});
  const toggleMR = mk => setOpenMonthsR(s=>{const n=new Set(s);n.has(mk)?n.delete(mk):n.add(mk);return n;});
  const toggleWR = wk => setOpenWeeksR(s=>{const n=new Set(s);n.has(wk)?n.delete(wk):n.add(wk);return n;});
  const saveHabits = h=>{setHabits(h);setLS("lp_habits",h);};
  const saveDaily  = d=>{setDaily(d);setLS("lp_daily",d);};
  const onToggleHabit = (hid,date) => saveHabits(habits.map(h=>{
    if(h.id!==hid)return h;
    const ds=h.dailyStatus||{};
    const cur=ds[date]??null; const next=cycleHabitStatus(cur);
    const newDs={...ds}; if(next===null)delete newDs[date]; else newDs[date]=next;
    const logs=(h.logs||[]).filter(x=>x!==date); if(next==='validated')logs.push(date);
    return{...h,dailyStatus:newDs,logs};
  }));
  const onDeleteDaily = date => { const {[date]:_,...rest}=daily; saveDaily(rest); };
  const onUpdateDaily = (date,field,val) => { const e=djEntry(daily[date]); saveDaily({...daily,[date]:{...e,[field]:val}}); };
  const sessByDate = {};
  sessions.forEach(s=>{(sessByDate[s.date]??=[]).push(s);});
  const dayCard = date => <DayLogCard key={date} date={date} habits={habits} daily={daily} sessions={sessByDate[date]||[]} onToggleHabit={onToggleHabit} onDeleteDaily={onDeleteDaily} onUpdateDaily={onUpdateDaily} />;
  const allDates=new Set();
  habits.forEach(h=>(h.logs||[]).forEach(d=>allDates.add(d)));
  Object.keys(daily).forEach(d=>{const e=djEntry(daily[d]);if(e.morning||e.win||e.loss||e.ameliorer||e.remark)allDates.add(d);});
  sessions.forEach(s=>allDates.add(s.date));
  const byWeek={};
  [...allDates].sort((a,b)=>b.localeCompare(a)).forEach(d=>{(byWeek[weekStart(d)]??=[]).push(d);});
  const byMonth={};
  [...allDates].sort((a,b)=>b.localeCompare(a)).forEach(d=>{const mk=d.slice(0,7);const wk=weekStart(d);(byMonth[mk]??={})[wk]??=[];byMonth[mk][wk].push(d);});
  const byQuarter={};
  [...allDates].sort((a,b)=>b.localeCompare(a)).forEach(d=>{const qk=getQK(d);const mk=d.slice(0,7);const wk=weekStart(d);((byQuarter[qk]??={})[mk]??={})[wk]??=[];byQuarter[qk][mk][wk].push(d);});
  const sortedWeeks    = Object.keys(byWeek).sort((a,b)=>b.localeCompare(a));
  const sortedMonths   = Object.keys(byMonth).sort((a,b)=>b.localeCompare(a));
  const sortedQuarters = Object.keys(byQuarter).sort((a,b)=>b.localeCompare(a));
  const wkRange = wk => { const e=new Date(wk+"T12:00:00"); e.setDate(e.getDate()+6); const end=e.toISOString().split("T")[0]; return `${new Date(wk+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} → ${new Date(end+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`; };
  const weekBlock = (wk,marginLeft,dates) => {
    const open=openWeeks.has(wk);
    return (
      <div key={wk} style={{marginLeft,marginBottom:6}}>
        <div onClick={()=>toggleWeek(wk)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:C.surface3,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",userSelect:"none",marginBottom:open?6:0}}>
          <span style={{fontSize:10,color:C.muted,width:10}}>{open?"▼":"▶"}</span>
          <span style={{fontSize:12,fontWeight:600,color:C.muted}}>Sem. {wkRange(wk)}</span>
          <span style={{fontSize:11,color:C.faint,marginLeft:"auto"}}>{dates.length} j.</span>
        </div>
        {open&&dates.map(d=>dayCard(d))}
      </div>
    );
  };
  const empty = <div style={{fontSize:13,color:C.muted,textAlign:"center",padding:"40px 0"}}>Aucun log pour l'instant.</div>;

  const doneProjects = allTodos.filter(t=>t.gtd==="projet"&&t.done);
  const dpByQ={};
  doneProjects.forEach(p=>{
    const d=p.doneAt?.slice(0,10)||p.dateFin||todayStr();
    const qk=getQK(d); const mk=d.slice(0,7); const wk=weekStart(d);
    ((dpByQ[qk]??={})[mk]??={})[wk]??=[];
    dpByQ[qk][mk][wk].push(p);
  });
  const sortedQR=Object.keys(dpByQ).sort((a,b)=>b.localeCompare(a));

  const logsContent = sortedQuarters.length===0?empty:sortedQuarters.map(qk=>{
          const [year,tq]=qk.split("-"); const qOpen=openQuarters.has(qk);
          const sortedMks=Object.keys(byQuarter[qk]).sort((a,b)=>b.localeCompare(a));
          const tot=sortedMks.reduce((s,mk)=>s+Object.values(byQuarter[qk][mk]).reduce((ss,arr)=>ss+arr.length,0),0);
          return (
            <div key={qk} style={{marginBottom:10}}>
              <div onClick={()=>toggleQuarter(qk)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:16,cursor:"pointer",userSelect:"none",marginBottom:qOpen?8:0}}>
                <span style={{fontSize:10,color:C.muted,width:10}}>{qOpen?"▼":"▶"}</span>
                <span style={{fontSize:15,fontWeight:700,color:C.text}}>{tq} {year}</span>
                <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{tot} j.</span>
              </div>
              {qOpen&&sortedMks.map(mk=>{
                const [my,mm]=mk.split("-").map(Number); const mOpen=openMonthsQ.has(mk);
                const sortedWks=Object.keys(byQuarter[qk][mk]).sort((a,b)=>b.localeCompare(a));
                const mTot=sortedWks.reduce((s,wk)=>s+byQuarter[qk][mk][wk].length,0);
                return (
                  <div key={mk} style={{marginLeft:12,marginBottom:6}}>
                    <div onClick={()=>toggleMonthQ(mk)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.surface3,border:`1px solid ${C.border}`,borderRadius:14,cursor:"pointer",userSelect:"none",marginBottom:mOpen?6:0}}>
                      <span style={{fontSize:10,color:C.muted,width:10}}>{mOpen?"▼":"▶"}</span>
                      <span style={{fontSize:13,fontWeight:600,color:C.text}}>{MONTH_FR[mm-1]} {my}</span>
                      <span style={{fontSize:11,color:C.faint,marginLeft:"auto"}}>{mTot} j.</span>
                    </div>
                    {mOpen&&sortedWks.map(wk=>{
                      const dates=[...byQuarter[qk][mk][wk]].sort((a,b)=>b.localeCompare(a));
                      return weekBlock(wk,12,dates);
                    })}
                  </div>
                );
              })}
            </div>
          );
        });

  const fmtWkShort = d => new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"});
  const [openWRQ, setOpenWRQ] = useState(()=>new Set());
  const [openWRM, setOpenWRM] = useState(()=>new Set());
  const toggleWRQ = qk => setOpenWRQ(s=>{const n=new Set(s);n.has(qk)?n.delete(qk):n.add(qk);return n;});
  const toggleWRM = mk => setOpenWRM(s=>{const n=new Set(s);n.has(mk)?n.delete(mk):n.add(mk);return n;});
  const wrByQ = {};
  weeklyReviews.forEach(r=>{
    const qk=getQK(r.weekStart); const mk=r.weekStart.slice(0,7);
    ((wrByQ[qk]??={})[mk]??=[]).push(r);
  });
  const sortedWRQ = Object.keys(wrByQ).sort((a,b)=>b.localeCompare(a));

  return (
    <div className="theme-light" style={{minHeight:"100%",display:"flex",flexDirection:"column",fontFamily:"var(--font-body)",color:C.text}}>
      <div style={{padding:"20px 16px 10px",display:"flex",alignItems:"center",gap:12}}>
        <span onClick={onBack} style={{cursor:"pointer",color:C.muted,fontSize:24,lineHeight:1}}>←</span>
        <div>
          <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:"0.18em",fontWeight:700,marginBottom:4}}>Archives</div>
          <div style={{fontFamily:FONT_D,fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-0.02em",lineHeight:1}}>Logs</div>
        </div>
      </div>

      {/* Weekly Review button */}
      <div style={{padding:"12px 16px 0"}}>
        <button
          onClick={()=>openReview(todayWk)}
          style={{width:"100%",padding:"16px 20px",borderRadius:16,background:GRAD,color:"#fff",fontSize:15,fontWeight:700,fontFamily:"inherit",border:"none",cursor:"pointer",boxShadow:GLOW,display:"flex",alignItems:"center",justifyContent:"center",gap:10,letterSpacing:"0.02em"}}
        >
          <span style={{fontSize:20}}>📊</span>
          Weekly Review
          {isWeekLocked(todayWk)&&<span style={{fontSize:11,background:"rgba(0,0,0,0.25)",padding:"2px 8px",borderRadius:999}}>🔒</span>}
        </button>
      </div>

      <div style={{padding:"12px 16px 100px"}}>
        {/* Controls: vue + déconnexion */}
        {onSetViewMode&&(
          <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",alignSelf:"center",marginRight:4}}>Vue</div>
            {[["pc","🖥 PC"],["mobile","📱 Mobile"]].map(([v,lbl])=>(
              <button key={v} onClick={()=>onSetViewMode(v)} style={{padding:"6px 16px",borderRadius:999,fontSize:12,fontFamily:"inherit",cursor:"pointer",border:`1px solid ${viewMode===v?C.accent:C.border}`,background:viewMode===v?C.accentBg:"transparent",color:viewMode===v?C.accent:C.muted,fontWeight:viewMode===v?600:400}}>{lbl}</button>
            ))}
          </div>
        )}

        {/* Weekly Reviews log */}
        <div style={{marginTop:28}}>
          <div style={{fontSize:10,color:C.accent,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>📊 Weekly Reviews</div>
          {sortedWRQ.length===0
            ? <div style={{fontSize:12,color:C.faint,textAlign:"center",padding:"24px 0"}}>Aucune weekly review enregistrée.</div>
            : sortedWRQ.map(qk=>{
                const [yr,tq]=qk.split("-"); const qOpen=openWRQ.has(qk);
                const months=Object.keys(wrByQ[qk]).sort((a,b)=>b.localeCompare(a));
                const total=months.reduce((s,mk)=>s+wrByQ[qk][mk].length,0);
                return (
                  <div key={qk} style={{marginBottom:8}}>
                    <div onClick={()=>toggleWRQ(qk)} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:14,cursor:"pointer",userSelect:"none",marginBottom:qOpen?8:0}}>
                      <span style={{fontSize:10,color:C.muted,width:10}}>{qOpen?"▼":"▶"}</span>
                      <span style={{fontSize:14,fontWeight:700,color:C.text}}>{tq} {yr}</span>
                      <span style={{fontSize:11,color:C.faint,marginLeft:"auto"}}>{total} review{total>1?"s":""}</span>
                    </div>
                    {qOpen&&months.map(mk=>{
                      const [my,mm]=mk.split("-").map(Number); const mOpen=openWRM.has(mk);
                      const reviews=[...wrByQ[qk][mk]].sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
                      return (
                        <div key={mk} style={{marginLeft:12,marginBottom:6}}>
                          <div onClick={()=>toggleWRM(mk)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.surface3,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",userSelect:"none",marginBottom:mOpen?6:0}}>
                            <span style={{fontSize:10,color:C.muted,width:10}}>{mOpen?"▼":"▶"}</span>
                            <span style={{fontSize:12,fontWeight:600,color:C.text}}>{MONTH_FR[mm-1]} {my}</span>
                            <span style={{fontSize:11,color:C.faint,marginLeft:"auto"}}>{reviews.length} review{reviews.length>1?"s":""}</span>
                          </div>
                          {mOpen&&reviews.map(r=>{
                            const lk=r.locked||isWeekLocked(r.weekStart);
                            return (
                              <div key={r.id} onClick={()=>openReview(r.weekStart)} style={{marginLeft:12,marginBottom:6,padding:"12px 14px",background:C.surface2,border:`1px solid ${lk?C.border:C.borderMid}`,borderRadius:12,cursor:"pointer",transition:TR}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                                  <span style={{fontSize:12,fontWeight:700,color:C.text}}>Sem. {fmtWkShort(r.weekStart)} → {fmtWkShort(r.weekEnd)}</span>
                                  {lk
                                    ? <span style={{marginLeft:"auto",fontSize:10,color:C.amber}}>🔒</span>
                                    : <span style={{marginLeft:"auto",fontSize:10,color:C.accent,background:C.accentBg,padding:"2px 7px",borderRadius:999}}>Modifiable</span>
                                  }
                                </div>
                                <div style={{display:"flex",gap:10,fontSize:11,color:C.faint}}>
                                  <span>🔥 {r.summary?.habitsPct!=null?`${r.summary.habitsPct}%`:`${r.summary?.habitsDaysAll??0}/7j`}</span>
                                  <span>✅ {r.summary?.todosCompleted??0} proj.</span>
                                  <span>⚡ {fmtMin(r.summary?.sessionsMins??0)}</span>
                                  <span>📓 {r.summary?.dailyCount??0}/7j</span>
                                </div>
                                {r.note&&<div style={{marginTop:6,fontSize:11,color:C.muted,lineHeight:1.5,borderTop:`1px solid ${C.border}`,paddingTop:6,whiteSpace:"pre-wrap"}}>{r.note.length>100?r.note.slice(0,100)+"…":r.note}</div>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* Bas de side — Personnalisation + Déconnexion */}
      <div style={{marginTop:"auto",padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10}}>
        {onPerso && (
          <button onClick={onPerso} style={{
            flex:1,padding:"12px 16px",borderRadius:14,background:C.surface2,color:C.text,fontSize:13,fontWeight:600,
            fontFamily:"inherit",border:`1px solid ${C.border}`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:44,
          }}>
            <span style={{fontSize:16}}>⚙️</span>Personnalisation
          </button>
        )}
        {onSignOut && (
          <button onClick={onSignOut} style={{
            flex:1,padding:"12px 16px",borderRadius:14,background:"transparent",color:C.red,fontSize:13,fontWeight:600,
            fontFamily:"inherit",border:`1px solid ${C.red}55`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:44,
          }}>
            <span style={{fontSize:15}}>⏻</span>Déconnexion
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONALISATION MODAL
// ─────────────────────────────────────────────────────────────────────────────
function PersonalisationModal({ onClose, onSave }) {
  const TABS = [
    { id:"domaines",  label:"Domaines" },
    { id:"wpTypes",   label:"Types session" },
    { id:"djTypes",   label:"Journées" },
    { id:"spheres",   label:"Sphères" },
  ];
  const [tab, setTab] = useState("domaines");
  const [domaines, setDomaines] = useState([...WP_CATEGORIES]);
  const [wpTypes,  setWpTypes]  = useState([...WP_TYPES]);
  const [djTypes,  setDjTypes]  = useState([...DJ_TYPES]);
  const [sphereList, setSphereList] = useState(
    Object.entries(SPHERES).map(([k,v])=>({key:k,label:v.label,c:v.c}))
  );
  const [newStr, setNewStr]             = useState("");
  const [newSphLabel, setNewSphLabel]   = useState("");
  const [newSphColor, setNewSphColor]   = useState("#8b5cf6");

  const getList = () => tab==="domaines"?domaines:tab==="wpTypes"?wpTypes:djTypes;
  const setList = fn => { if(tab==="domaines")setDomaines(fn); else if(tab==="wpTypes")setWpTypes(fn); else setDjTypes(fn); };

  const addItem = () => { if(!newStr.trim())return; setList(l=>[...l,newStr.trim()]); setNewStr(""); };
  const removeItem = i => setList(l=>l.filter((_,j)=>j!==i));
  const moveItem = (i,d) => setList(l=>{ const n=[...l]; const t=i+d; if(t<0||t>=n.length)return l; [n[i],n[t]]=[n[t],n[i]]; return n; });

  const addSphere = () => {
    if(!newSphLabel.trim())return;
    const base = newSphLabel.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").slice(0,20);
    const key = sphereList.find(s=>s.key===base) ? base+"_"+Date.now().toString(36) : base;
    setSphereList(l=>[...l,{key,label:newSphLabel.trim(),c:newSphColor}]);
    setNewSphLabel(""); setNewSphColor("#8b5cf6");
  };

  const save = () => {
    const spheresObj = Object.fromEntries(sphereList.map(s=>[s.key,{label:s.label,c:s.c}]));
    onSave({ domaines, wpTypes, djTypes, spheres: spheresObj });
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:20,width:"100%",maxWidth:480,maxHeight:"85vh",display:"flex",flexDirection:"column",border:`1px solid ${C.border}`,boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 20px 0"}}>
          <div style={{fontSize:17,fontWeight:700,color:C.text}}>⚙️ Personnalisation</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:6,padding:"14px 20px 0",overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setNewStr("");}} style={{
              flexShrink:0,padding:"6px 14px",borderRadius:999,border:`1px solid ${tab===t.id?C.accent:C.border}`,
              background:tab===t.id?C.accentBg:C.surface2,color:tab===t.id?C.accent:C.muted,
              cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:tab===t.id?600:400,
            }}>{t.label}</button>
          ))}
        </div>
        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {tab!=="spheres" ? (
            <div>
              {getList().map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid rgba(139,92,246,0.07)`}}>
                  <span style={{flex:1,fontSize:14,color:C.text}}>{item}</span>
                  <button onClick={()=>moveItem(i,-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",opacity:i===0?0.3:1,fontSize:14}}>↑</button>
                  <button onClick={()=>moveItem(i,1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",opacity:i===getList().length-1?0.3:1,fontSize:14}}>↓</button>
                  <button onClick={()=>removeItem(i)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16,padding:"0 2px"}}>×</button>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <Input value={newStr} onChange={setNewStr} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Ajouter..." />
                <Btn onClick={addItem} variant="ghost">+</Btn>
              </div>
            </div>
          ) : (
            <div>
              {sphereList.map((s,i)=>(
                <div key={s.key} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid rgba(139,92,246,0.07)`}}>
                  <input type="color" value={s.c} onChange={e=>setSphereList(l=>l.map((x,j)=>j===i?{...x,c:e.target.value}:x))}
                    style={{width:28,height:28,border:"none",borderRadius:6,cursor:"pointer",padding:0,background:"none",flexShrink:0}} />
                  <input value={s.label} onChange={e=>setSphereList(l=>l.map((x,j)=>j===i?{...x,label:e.target.value}:x))}
                    style={{flex:1,background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,color:C.text,fontSize:14,fontFamily:"inherit",outline:"none",padding:"2px 0"}} />
                  <button onClick={()=>setSphereList(l=>l.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16,padding:"0 2px"}}>×</button>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:10,alignItems:"center"}}>
                <input type="color" value={newSphColor} onChange={e=>setNewSphColor(e.target.value)}
                  style={{width:34,height:34,border:"none",borderRadius:8,cursor:"pointer",padding:0,background:"none",flexShrink:0}} />
                <Input value={newSphLabel} onChange={setNewSphLabel} onKeyDown={e=>e.key==="Enter"&&addSphere()} placeholder="Nouvelle sphère (ex: 💸 Finance)..." />
                <Btn onClick={addSphere} variant="ghost">+</Btn>
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:8}}>La clé est auto-générée depuis le nom.</div>
            </div>
          )}
        </div>
        {/* Footer */}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",padding:"12px 20px 18px",borderTop:`1px solid ${C.border}`}}>
          <Btn onClick={onClose} variant="ghost">Annuler</Btn>
          <Btn onClick={save} variant="accent">Enregistrer</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App({ session, signOut }) {
  const [module, setModule]   = useState(()=>getLS("lp_active_module","dashboard"));
  const [objTab, setObjTab]   = useState("lt");
  const navTo = id => {
    if (typeof id === "string" && id.startsWith("objectifs:")) { setObjTab(id.slice(10)); setModule("objectifs"); return; }
    setModule(id);
  };
  const [logsOpen, setLogsOpen] = useState(false);
  const [viewMode, setViewMode] = useState(()=>getLS("lp_view_mode","pc"));
  const [syncStatus, setSyncStatus] = useState(null);
  const [wrModal, setWrModal] = useState(null);
  const [showSessionChoice, setShowSessionChoice] = useState(false);
  const [showSessionLive, setShowSessionLive] = useState(false);
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [activeSession, setActiveSession] = useState(() => {
    try { const raw=localStorage.getItem(LS_SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [stopModal, setStopModal] = useState(null); // { elapsed }
  const [showPerso, setShowPerso] = useState(false);
  const [persoKey, setPersoKey]   = useState(0);
  const touchRef = useRef(null);
  const mobile = viewMode === "mobile" && window.innerWidth >= 600;

  const handleSavePerso = (p) => {
    setLS("lp_personalization", p);
    WP_CATEGORIES = p.domaines;
    WP_DOMAINES   = p.domaines;
    WP_TYPES      = p.wpTypes;
    DJ_TYPES      = p.djTypes;
    SPHERES       = p.spheres;
    setPersoKey(k => k + 1);
    setShowPerso(false);
  };

  useEffect(() => { setLS("lp_active_module", module); }, [module]);

  useEffect(() => {
    _userId = session?.user?.id ?? null;
    _onSyncStatus = setSyncStatus;
  }, [session]);

  const handleSessionStart = (s) => {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(s));
    setActiveSession(s);
  };
  const handleSessionPause = useCallback(() => {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s.pausedAt) return;
      const updated = { ...s, pausedAt: Date.now() };
      localStorage.setItem(LS_SESSION_KEY, JSON.stringify(updated));
      setActiveSession(updated);
    } catch {}
  }, []);
  const handleSessionResume = useCallback(() => {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (!s.pausedAt) return;
      const updated = { ...s, totalPausedMs: (s.totalPausedMs||0) + (Date.now() - s.pausedAt), pausedAt: null };
      localStorage.setItem(LS_SESSION_KEY, JSON.stringify(updated));
      setActiveSession(updated);
    } catch {}
  }, []);
  const handleSessionStop = useCallback((elapsed) => {
    setStopModal({ elapsed: elapsed ?? 0 });
  }, []);
  const handleConfirmStop = useCallback(({ type, efficience }) => {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (raw) {
      try {
        const { name, category, startTime, pausedAt, totalPausedMs=0 } = JSON.parse(raw);
        const effectiveEnd = pausedAt || Date.now();
        const durationMinutes = Math.round((effectiveEnd - startTime - totalPausedMs) / 60000) || 1;
        const sessions = getLS("lp_workperf", []);
        setLS("lp_workperf", [...sessions, {id:uid(),tache:name,date:todayStr(),temps:durationMinutes,type,domaine:category,efficience,startTime:new Date(startTime).toISOString(),endTime:new Date(effectiveEnd).toISOString()}]);
      } catch {}
    }
    localStorage.removeItem(LS_SESSION_KEY);
    setActiveSession(null);
    setStopModal(null);
  }, []);

  const setView = v => { setViewMode(v); setLS("lp_view_mode", v); };

  const onTouchStart = e => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = e => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    const dy = e.changedTouches[0].clientY - touchRef.current.y;
    touchRef.current = null;
    if (module === "dashboard" && !logsOpen && Math.abs(dx) > Math.abs(dy) && dx < -70) setLogsOpen(true);
  };


  const inner = (
    <div
      style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"var(--font-body)", position:"relative", overflowX:"hidden" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div key={`${module}-${persoKey}`} className="fade-in">
        {module === "dashboard" && <Dashboard onNav={navTo} onOpenLogs={()=>setLogsOpen(true)} onRequestSession={()=>setShowSessionChoice(true)} />}
        {module === "objectifs" && <ObjectifsModule initialTab={objTab} />}
        {module === "habitudes" && <HabitudesModule />}
        {module === "workperf"  && <WorkPerfModule activeSession={activeSession} onSessionStart={handleSessionStart} onSessionStop={handleSessionStop} />}
        {module === "daily"     && <DailyPaperModule onNav={navTo} />}
        {module === "todo"      && <TodoModule />}
        {module === "base"      && <BaseModule userId={session?.user?.id ?? null} />}
        {module === "finances"  && <FinancesModule userId={session?.user?.id ?? null} />}
      </div>
      <ActiveSessionWidget session={activeSession} onStop={handleSessionStop} onPause={handleSessionPause} onResume={handleSessionResume} />
      {stopModal && <LiveStopModal session={activeSession} elapsed={stopModal.elapsed} onConfirm={handleConfirmStop} onCancel={()=>setStopModal(null)} />}
      <BottomNav current={module} onNav={setModule} mobile={mobile} onPerso={()=>setShowPerso(true)} />
      {showPerso && <PersonalisationModal onClose={()=>setShowPerso(false)} onSave={handleSavePerso} />}
      {/* Logs slide-over panel */}
      <div style={{ position:"fixed", inset:0, zIndex:200, pointerEvents:logsOpen?"all":"none" }}>
        <div onClick={()=>setLogsOpen(false)} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", opacity:logsOpen?1:0, transition:"opacity 0.25s ease" }} />
        <div
          onTouchStart={e=>{ touchRef.current={ x:e.touches[0].clientX, y:e.touches[0].clientY }; e.stopPropagation(); }}
          onTouchEnd={e=>{
            if(!touchRef.current) return;
            const dx=e.changedTouches[0].clientX-touchRef.current.x;
            const dy=e.changedTouches[0].clientY-touchRef.current.y;
            touchRef.current=null;
            if(Math.abs(dx)>Math.abs(dy)&&dx>70) setLogsOpen(false);
            e.stopPropagation();
          }}
          style={{ position:"absolute", top:0, right:0, bottom:0, width:"92%", maxWidth:500, background:"#0B0714", transform:logsOpen?"translateX(0)":"translateX(100%)", transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)", overflowY:"auto" }}
        >
          <LogsModule onBack={()=>setLogsOpen(false)} viewMode={viewMode} onSetViewMode={setView} onSignOut={signOut} onOpenWeeklyReview={setWrModal} onPerso={()=>{setLogsOpen(false);setShowPerso(true);}} />
        </div>
      </div>
      {/* Weekly Review modal — rendered at root so it covers everything */}
      {wrModal && (
        <WeeklyReviewModal
          wkStart={wrModal.wkStart}
          onClose={()=>setWrModal(null)}
          onSaved={wrModal.onSaved}
        />
      )}
      {showSessionChoice && (
        <SessionChoiceModal
          onClose={()=>setShowSessionChoice(false)}
          onLive={()=>{setShowSessionChoice(false);setShowSessionLive(true);}}
          onLog={()=>{setShowSessionChoice(false);setShowSessionLog(true);}}
        />
      )}
      {showSessionLive && (
        <LiveStartForm
          onClose={()=>setShowSessionLive(false)}
          onLaunch={(name,cat)=>{handleSessionStart({name,category:cat,startTime:Date.now()});setShowSessionLive(false);}}
        />
      )}
      {showSessionLog && <SessionLogForm onClose={()=>setShowSessionLog(false)} />}
    </div>
  );

  if (mobile) {
    return (
      <div style={{ minHeight:"100vh", background:"#06060f", display:"flex", justifyContent:"center", alignItems:"flex-start" }}>
        <div style={{ width:390, minHeight:"100vh", overflowX:"hidden", boxShadow:"0 0 0 1px rgba(139,92,246,0.2), 0 24px 80px rgba(0,0,0,0.8)" }}>
          {inner}
        </div>
      </div>
    );
  }
  return inner;
}
