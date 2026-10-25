// Lien projet → objectif. Pur (aucun import navigateur) : partagé entre l'app
// et les routes /api/v1, qui doivent juger « objectif en cours » de la même façon.
import { computeCloture } from "./date.js";

// Un projet se rattache à un objectif mensuel, et à rien d'autre.
export const GOAL_LINK_LEVELS = ["mensuel"];

// En cours = ni archivé, ni dépassé (date de clôture passée), statut « En cours ».
export function isGoalRunning(goal, today) {
  if (!goal || goal.archived || goal.statut !== "En cours") return false;
  const cloture = goal.dateCloture || computeCloture(goal.periode);
  return !cloture || cloture >= today;
}

// Objectifs liables : [{ ...goal, level }].
export function runningGoals(goals, today) {
  return GOAL_LINK_LEVELS.flatMap(level =>
    ((goals && goals[level]) || []).filter(g => isGoalRunning(g, today)).map(g => ({ ...g, level }))
  );
}

// objectifMensuelId = ancien nom du champ, lu en repli pour les projets déjà liés.
export const todoGoalId = t => (t && (t.objectifId || t.objectifMensuelId)) || "";
