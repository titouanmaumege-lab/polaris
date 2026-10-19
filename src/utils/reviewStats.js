// Statistiques partagées par la Weekly Review et la review mensuelle.
// Fonctions pures : elles reçoivent les listes (habitudes, sessions) et une
// liste de dates 'YYYY-MM-DD', et ne lisent jamais le localStorage elles-mêmes.

import { pad } from "./date";

// Une habitude est validée un jour donné (nouveau format dailyStatus, ou logs legacy).
export const habitValidated = (h, date) => {
  if (h.dailyStatus) return h.dailyStatus[date] === "validated";
  return (h.logs || []).includes(date);
};

// Nombre total de validations (habitude × jour) sur les dates.
export const habitsDoneCount = (habits, dates) =>
  habits.length > 0 ? dates.reduce((s, d) => s + habits.filter(h => habitValidated(h, d)).length, 0) : 0;

// % validées / (nb habitudes × nb jours). null quand il n'y a rien à mesurer.
export const habitsPctOn = (habits, dates) => {
  const total = habits.length * dates.length;
  return total > 0 ? Math.round(habitsDoneCount(habits, dates) / total * 100) : null;
};

// Jours où toutes les habitudes sont validées.
export const habitsAllDoneDays = (habits, dates) =>
  dates.filter(d => habits.length > 0 && habits.every(h => habitValidated(h, d))).length;

// Détail par habitude, du meilleur au moins bon.
export const habitsPctByHabit = (habits, dates) =>
  dates.length === 0 ? [] : habits
    .map(h => ({ id: h.id, name: h.name || h.nom || "Habitude", pct: Math.round(dates.filter(d => habitValidated(h, d)).length / dates.length * 100) }))
    .sort((a, b) => b.pct - a.pct);

// Sessions de travail (lp_workperf) tombant sur les dates.
export const sessionsOn = (sessions, dates) => {
  const set = new Set(dates);
  return sessions.filter(s => set.has(s.date));
};

// Somme des minutes (champ `temps`).
export const workMinutes = sessions => sessions.reduce((s, x) => s + (x.temps || 0), 0);

// Minutes par valeur d'un champ (type, domaine…) ; valeur absente → 'AUTRE'.
export const minutesBy = (sessions, key) => {
  const map = {};
  sessions.forEach(s => { const k = s[key] || "AUTRE"; map[k] = (map[k] || 0) + (s.temps || 0); });
  return map;
};

// Jours d'un mois 'YYYY-MM' en dates locales (pas de toISOString : décalage UTC).
export const monthDaysLocal = mk => {
  const [y, m] = mk.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
};
