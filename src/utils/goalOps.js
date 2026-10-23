// Logique pure des objectifs (OKR) appliquée aux opérations de l'API externe
// (api_ops : add_goal, update_goal). Partagée entre le front et les routes
// /api/v1/goals : l'aperçu serveur et le résultat dans l'app doivent être identiques.
// Aucun import navigateur ici : le fichier est aussi chargé par Node (Vercel).

export const GOAL_LEVELS = ["lt", "annuel", "trimestriel", "mensuel"];

/** Retrouve un objectif par id dans tous les niveaux : { level, goal } ou null. */
export function findGoal(goals, id) {
  for (const level of GOAL_LEVELS) {
    const goal = (goals?.[level] || []).find(o => o.id === id);
    if (goal) return { level, goal };
  }
  return null;
}

// Idempotent : un add déjà présent est ignoré ; un update sur un id inconnu aussi.
// L'id de l'objectif voyage dans op.todo_id (colonne commune à toutes les ops).
export function applyGoalOps(goals, ops) {
  let out = { ...(goals || {}) };
  for (const op of ops) {
    const p = op.payload || {};
    if (op.type === "add_goal") {
      if (!GOAL_LEVELS.includes(p.level) || findGoal(out, op.todo_id)) continue;
      out = { ...out, [p.level]: [...(out[p.level] || []), { ...p.goal, id: op.todo_id }] };
    } else if (op.type === "update_goal") {
      const hit = findGoal(out, op.todo_id);
      if (!hit) continue;
      const next = { ...hit.goal };
      // null = effacer le champ (ex. retirer le parent)
      for (const [k, v] of Object.entries(p.patch || {})) {
        if (v === null) delete next[k]; else next[k] = v;
      }
      out = { ...out, [hit.level]: out[hit.level].map(o => (o.id === op.todo_id ? next : o)) };
    }
  }
  return out;
}
