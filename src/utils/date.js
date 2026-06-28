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
