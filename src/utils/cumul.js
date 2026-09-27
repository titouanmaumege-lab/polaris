// Effet cumulé (Darren Hardy) : petits choix × régularité × temps.
// Fonctions pures sur une habitude { logs: ["YYYY-MM-DD"], createdAt?, kind?, unitLabel? }.
// Aucune dépendance UI ni localStorage : testable isolément.
//
// Définitions communes :
// · Jour de départ  = createdAt s'il existe, sinon la date du 1er log.
// · Jours évalués   = du jour de départ jusqu'à HIER inclus (aujourd'hui n'est pas fini).
// · Jour suivi      = jour où au moins une habitude, n'importe laquelle, est cochée.
//   Un jour non suivi (appli pas ouverte) reste un raté pour la régularité, mais il est
//   exclu des calculs de liens : sinon toutes les habitudes tombent à 0 le même jour et
//   l'on fabrique de fausses corrélations positives.
import { todayStr } from "./date";

const MS_DAY = 86400000;
const pad2 = n => String(n).padStart(2, "0");
// ISO "YYYY-MM-DD" → Date locale à midi (évite les décalages de fuseau).
const toDate = iso => new Date(iso + "T12:00:00");
const toISO  = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const addDays  = (iso, n) => { const d = toDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / MS_DAY);
// 0 = lundi … 6 = dimanche
export const weekdayOf = iso => (toDate(iso).getDay() + 6) % 7;
const range = (from, to) => {
  const n = diffDays(to, from);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
};

// ── Bases ────────────────────────────────────────────────────────────────────

// Dates validées, dédupliquées, triées, sans jour futur.
export const validDays = (habit, today = todayStr()) =>
  [...new Set((habit?.logs || []).filter(d => typeof d === "string" && d && d <= today))].sort();

// Total cumulé : nombre de jours uniques validés. Ne redescend jamais.
export const cumulTotal = (habit, today = todayStr()) => validDays(habit, today).length;

export const startDay = (habit, today = todayStr()) => {
  const days = validDays(habit, today);
  const created = habit?.createdAt ? String(habit.createdAt).slice(0, 10) : null;
  if (created && days.length) return created < days[0] ? created : days[0];
  return created || days[0] || null;
};

// Du jour de départ à hier inclus.
export const evaluatedDays = (habit, today = todayStr()) => {
  const start = startDay(habit, today);
  if (!start) return [];
  return range(start, addDays(today, -1));
};

// Jours où au moins une habitude est cochée.
export const trackedDays = (allHabits, today = todayStr()) => {
  const s = new Set();
  (allHabits || []).forEach(h => validDays(h, today).forEach(d => s.add(d)));
  return s;
};

// ── Régularité ───────────────────────────────────────────────────────────────

// Une valeur par jour évalué : réussites sur la fenêtre glissante ∩ jours évalués,
// divisées par la taille réelle de cette intersection (fenêtre plus courte au début).
// `minDays` : pas de point avant ce nombre de jours évalués — sur 1 ou 2 jours le
// taux vaut 0 % ou 100 % et ne dit rien, ça ne produisait qu'un pic trompeur.
export const rollingRateSeries = (habit, today = todayStr(), window = 28, minDays = 7) => {
  const days = evaluatedDays(habit, today);
  if (days.length < minDays) return [];
  const done = new Set(validDays(habit, today));
  const out = [];
  for (let i = minDays - 1; i < days.length; i++) {
    const slice = days.slice(Math.max(0, i - window + 1), i + 1);
    out.push({
      date: days[i],
      rate: slice.filter(d => done.has(d)).length / slice.length,
      full: i >= window - 1,   // fenêtre complète = 28 jours de recul
    });
  }
  return out;
};

// rate = régularité sur les 28 derniers jours évalués (fenêtre plus courte si l'historique l'est).
// delta = rate − taux des 28 jours évalués précédents. null si < 56 jours évalués.
export const rate28WithDelta = (habit, today = todayStr()) => {
  const days = evaluatedDays(habit, today);
  const done = new Set(validDays(habit, today));
  const rateOf = arr => (arr.length ? arr.filter(d => done.has(d)).length / arr.length : 0);
  const rate = rateOf(days.slice(-28));
  if (days.length < 56) return { rate, delta: null };
  return { rate, delta: rate - rateOf(days.slice(-56, -28)) };
};

// Jour de la semaine au taux le plus bas. null tant qu'un des 7 jours compte
// moins de MIN_WEEKDAY occurrences évaluées : en dessous, le classement n'est que du bruit.
const MIN_WEEKDAY = 6;
export const weakestWeekday = (habit, today = todayStr()) => {
  const days = evaluatedDays(habit, today);
  const done = new Set(validDays(habit, today));
  const tot = Array(7).fill(0), hit = Array(7).fill(0);
  days.forEach(d => { const w = weekdayOf(d); tot[w]++; if (done.has(d)) hit[w]++; });
  if (tot.some(n => n < MIN_WEEKDAY)) return null;
  let best = 0;
  for (let w = 1; w < 7; w++) if (hit[w] / tot[w] < hit[best] / tot[best]) best = w;
  return { weekday: best, rate: hit[best] / tot[best], hits: hit[best], total: tot[best] };
};

// ── Calendrier en carrés ─────────────────────────────────────────────────────

// Grille lundi→dimanche, `weeks` colonnes, la plus récente à droite.
export const heatmapData = (habit, today = todayStr(), weeks = 26) => {
  const monday = addDays(today, -weekdayOf(today));
  const from = addDays(monday, -(weeks - 1) * 7);
  const to   = addDays(monday, 6);
  const start = startDay(habit, today);
  const done = new Set(validDays(habit, today));
  return range(from, to).map(date => {
    let state;
    if (date > today) state = "future";
    else if (date === today) state = "today";
    else if (!start || date < start) state = "before";
    else state = done.has(date) ? "done" : "missed";
    return { date, state };
  });
};

// Nombre de colonnes à afficher : on ne montre pas 26 semaines de vide pour une
// habitude qui date de 10 jours, ni plus de 26 pour une très ancienne.
export const heatmapWeeks = (habit, today = todayStr(), min = 8, max = 26) => {
  const start = startDay(habit, today);
  if (!start) return min;
  const thisMonday  = addDays(today, -weekdayOf(today));
  const startMonday = addDays(start, -weekdayOf(start));
  const weeks = Math.round(diffDays(thisMonday, startMonday) / 7) + 1;
  return Math.min(max, Math.max(min, weeks));
};

// ── Liens ────────────────────────────────────────────────────────────────────

const MIN_SIDE = 10;      // jours minimum de chaque côté
const MIN_DIFF_PP = 25;   // points de pourcentage
const MIN_DIFF_PT = 0.5;  // points sur une échelle 1–5

// Habitude ↔ autres habitudes.
export const habitLinks = (habit, allHabits, today = todayStr()) => {
  const tracked = trackedDays(allHabits, today);
  const mine = new Set(evaluatedDays(habit, today));
  const doneH = new Set(validDays(habit, today));
  const out = [];
  (allHabits || []).forEach(g => {
    if (!g || g.id === habit.id) return;
    const common = evaluatedDays(g, today).filter(d => mine.has(d) && tracked.has(d));
    const A = common.filter(d => doneH.has(d));
    const B = common.filter(d => !doneH.has(d));
    if (A.length < MIN_SIDE || B.length < MIN_SIDE) return;
    const doneG = new Set(validDays(g, today));
    const rateA = A.filter(d => doneG.has(d)).length / A.length;
    const rateB = B.filter(d => doneG.has(d)).length / B.length;
    const diff = (rateA - rateB) * 100;
    if (Math.abs(diff) < MIN_DIFF_PP) return;
    out.push({ kind: "habit", id: g.id, habit: g, rateA, rateB, diff, strength: Math.abs(diff) });
  });
  return out.sort((a, b) => b.strength - a.strength);
};

const DAILY_METRICS = [
  { key: "energy", label: "Énergie", lowerIsBetter: false },
  { key: "focus",  label: "Focus",   lowerIsBetter: false },
  { key: "stress", label: "Stress",  lowerIsBetter: true  },
  { key: "happy",  label: "Bonheur", lowerIsBetter: false },
];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// Habitude ↔ notes du Daily. `dailyEntries` : [{ date, energy, focus, stress, happy }]
// avec des valeurs numériques 1–5 ou null. `tracked` : Set des jours suivis.
export const dailyLinks = (habit, dailyEntries, today = todayStr(), tracked = null) => {
  const byDate = new Map((dailyEntries || []).map(e => [e.date, e]));
  const trackedSet = tracked || new Set((dailyEntries || []).map(e => e.date));
  const common = evaluatedDays(habit, today).filter(d => trackedSet.has(d));
  const doneH = new Set(validDays(habit, today));
  const out = [];

  DAILY_METRICS.forEach(({ key, label, lowerIsBetter }) => {
    let best = null;
    [["same", 0, ""], ["next", 1, " le lendemain"]].forEach(([variant, shift, suffix]) => {
      const valOf = d => byDate.get(shift ? addDays(d, 1) : d)?.[key] ?? null;
      const A = common.filter(d => doneH.has(d)).map(valOf).filter(v => v != null);
      const B = common.filter(d => !doneH.has(d)).map(valOf).filter(v => v != null);
      if (A.length < MIN_SIDE || B.length < MIN_SIDE) return;
      const gap = mean(A) - mean(B);
      if (Math.abs(gap) < MIN_DIFF_PT) return;
      const cand = {
        kind: "daily", id: `${key}-${variant}`, metric: key, lowerIsBetter,
        label: label + suffix, avgA: mean(A), avgB: mean(B), diff: gap, strength: Math.abs(gap),
      };
      if (!best || cand.strength > best.strength) best = cand;
    });
    if (best) out.push(best);
  });
  return out.sort((a, b) => b.strength - a.strength);
};

// 3 liens au maximum : habitudes d'abord, puis notes du Daily.
export const topLinks = (habit, allHabits, dailyEntries, today = todayStr(), max = 3) => {
  const tracked = trackedDays(allHabits, today);
  return [
    ...habitLinks(habit, allHabits, today),
    ...dailyLinks(habit, dailyEntries, today, tracked),
  ].slice(0, max);
};

// ── Libellés ─────────────────────────────────────────────────────────────────
// 'eliminer' ne change que le vocabulaire, jamais la logique de coche.
export const habitUnit = habit =>
  habit?.unitLabel?.trim() || (habit?.kind === "eliminer" ? "jours sans" : "jours");
