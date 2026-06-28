// Helpers date partagés. Avant : pad ×7, todayStr ×3, monthKey ×2 et 4 variantes
// de "bornes du mois" (currentMonthBounds / curMonthBounds / monthBounds) dupliquées
// dans App.jsx, FinancesModule et les hooks finance. Source unique ici.

export const pad = (n) => String(n).padStart(2, "0");

// Date du jour au format 'YYYY-MM-DD' (locale-safe via ISO).
export const todayStr = () => new Date().toISOString().split("T")[0];

// Clé de mois 'YYYY-MM'. Défaut = mois courant.
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

// Bornes [premier, dernier] jour d'un mois, dates inclusives 'YYYY-MM-DD'.
// ym = 'YYYY-MM' ; défaut = mois courant. Unifie currentMonthBounds/curMonthBounds/monthBounds.
export const monthBounds = (ym = monthKey()) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
};

// ─── Calendrier semaine / mois (extraits d'App.jsx) ───────────────────────────
export const DAY_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
export const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
export const MONTHS_FR = MONTH_FR;
export const QUARTERS_FR = [["T1","Jan–Mar"],["T2","Avr–Juin"],["T3","Juil–Sep"],["T4","Oct–Déc"]];

export const weekDates = () => {
  const d = new Date(), day = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return Array.from({ length: 7 }, (_, i) => { const dt = new Date(d); dt.setDate(d.getDate() - day + i); return dt.toISOString().split("T")[0]; });
};
export const weekStart = dateStr => {
  const d = new Date(dateStr + "T12:00:00");
  const off = d.getDay() === 0 ? 6 : d.getDay() - 1;
  const mon = new Date(d); mon.setDate(d.getDate() - off);
  return mon.toISOString().split("T")[0];
};
export const weekEnd = dateStr => {
  const d = new Date(weekStart(dateStr) + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
};
export const isWeekLocked = wkStart => new Date() > new Date(weekEnd(wkStart) + "T23:59:59");
export const monthDates = (y, m) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => new Date(y, m, i + 1).toISOString().split("T")[0]);
export const fmtDate = s => new Date(s + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

// ─── Périodes OKR ─────────────────────────────────────────────────────────────
export const periodeTypeForLevel = lvl => lvl === "mensuel" ? "month" : lvl === "trimestriel" ? "quarter" : lvl === "annuel" ? "year" : null;
export const lastDayOfMonth = (y, m) => { const d = new Date(y, m + 1, 0); return `${y}-${pad(m + 1)}-${pad(d.getDate())}`; };
export const computeCloture = periode => {
  if (!periode) return "";
  if (periode.type === "month")   return lastDayOfMonth(periode.year, periode.month);
  if (periode.type === "quarter") return lastDayOfMonth(periode.year, periode.quarter * 3 + 2);
  if (periode.type === "year")    return `${periode.year}-12-31`;
  return "";
};
export const periodeLabel = periode => {
  if (!periode) return "";
  if (periode.type === "month")   return `${MONTHS_FR[periode.month]} ${periode.year}`;
  if (periode.type === "quarter") return `${QUARTERS_FR[periode.quarter][0]} ${periode.year}`;
  if (periode.type === "year")    return `${periode.year}`;
  return "";
};
export const defaultPeriode = lvl => {
  const t = periodeTypeForLevel(lvl); if (!t) return null;
  const now = new Date();
  return { type: t, year: now.getFullYear(), month: now.getMonth(), quarter: Math.floor(now.getMonth() / 3) };
};

// ─── Formatage durées ─────────────────────────────────────────────────────────
export const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 > 0 ? pad(m % 60) : ""}` : m > 0 ? `${m}min` : "—";
export const fmtHM = m => `${Math.floor(m / 60)}h${pad(m % 60)}`;
export const formatElapsed = ms => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
};
