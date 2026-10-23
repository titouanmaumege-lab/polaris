// PATCH /api/v1/goals/:id — mise à jour partielle d'un objectif (titre, statut, spaces,
// periode, parentId, krs, archived). krs remplace la liste entière : renvoyer les
// résultats clés existants avec leur id pour les conserver.
// Pas de DELETE : pour retirer un objectif, archived:true.

import { authenticate, sendError, readBody, currentGoals, validateGoalPatch } from "../../_lib/polaris-api.js";
import { applyGoalOps, findGoal } from "../../../src/utils/goalOps.js";

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return sendError(res, 405, "method_not_allowed", "Méthode acceptée : PATCH (aucune suppression possible via l'API).");
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { db, userId, keyId } = auth;
  res.setHeader("Cache-Control", "no-store");

  const id = String(req.query.id || "");
  if (!id || id.length > 64) return sendError(res, 400, "bad_request", "Identifiant d'objectif invalide.");

  const body = readBody(req);
  if (body === undefined) return sendError(res, 400, "bad_request", "Corps JSON invalide.");

  try {
    const goals = await currentGoals(db, userId);
    const found = findGoal(goals, id);
    if (!found) return sendError(res, 404, "not_found", `Aucun objectif avec l'id ${id}.`);

    const { errors, patch } = validateGoalPatch(body, goals, found);
    if (errors) return sendError(res, 400, "validation_error", "Données invalides.", { details: errors });

    const op = { user_id: userId, key_id: keyId, type: "update_goal", todo_id: id, payload: { patch } };
    const { error } = await db.from("api_ops").insert(op);
    if (error) throw error;

    const after = applyGoalOps(goals, [op]);
    return res.status(200).json({ level: found.level, goal: findGoal(after, id).goal });
  } catch (e) {
    console.error("[api/v1/goals/:id]", e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
