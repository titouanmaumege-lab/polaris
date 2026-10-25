// Lien projet → objectif. Pur (aucun import navigateur) : partagé entre l'app
// et les routes /api/v1, qui doivent juger « objectif en cours » de la même façon.
import { computeCloture } from "./date.js";

// Niveaux auxquels un projet peut se rattacher, du plus concret au plus large.
export const GOAL_LINK_LEVELS = ["mensuel", "trimestriel"];

// En cours = ni archivé, ni dépassé (date de clôture passée), statut « En cours ».
export function isGoalRunning(goal, today) {
  if (!goal || goal.archived || goal.statut !== "En cours") return false;
  const cloture = goal.dateCloture || computeCloture(goal.periode);
  return !cloture || cloture >= today;
}

// Objectifs liables : [{ ...goal, level }], mensuels d'abord.
export function runningGoals(goals, today) {
  return GOAL_LINK_LEVELS.flatMap(level =>
    ((goals && goals[level]) || []).filter(g => isGoalRunning(g, today)).map(g => ({ ...g, level }))
  );
}

// objectifMensuelId = ancien nom du champ, lu en repli pour les projets déjà liés.
export const todoGoalId = t => (t && (t.objectifId || t.objectifMensuelId)) || "";
