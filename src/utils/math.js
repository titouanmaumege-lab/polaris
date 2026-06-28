// Helpers numériques + progression OKR. Purs, extraits d'App.jsx.

export const clamp = (v, mn, mx) => Math.min(Math.max(v, mn), mx);

export const pct = (start, cur, target) => {
  if (target === start) return cur >= target ? 100 : 0;
  return Math.round(clamp((cur - start) / (target - start) * 100, 0, 100));
};

// % d'un Key Result (gère sens croissant ET décroissant)
export const krPct = kr => pct(kr.depart ?? 0, kr.actuelle ?? kr.depart ?? 0, kr.cible ?? 0);

// % global d'un objectif : moyenne des KR + bonus complétion (jusqu'à +15 si tous finis)
export const KR_BONUS_MAX = 15;
export const krsProgress = krs => {
  if (!krs || !krs.length) return null;
  const avg = krs.reduce((s, k) => s + krPct(k), 0) / krs.length;
  const completedFrac = krs.filter(k => krPct(k) >= 100).length / krs.length;
  return Math.round(clamp(avg + completedFrac * KR_BONUS_MAX, 0, 100));
};
