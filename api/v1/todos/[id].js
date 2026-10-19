// PATCH /api/v1/todos/:id — mise à jour partielle d'une tâche.
// done:true passe par toggleDone côté app (la récurrence crée l'occurrence suivante).
// Pas de DELETE : l'assistant ne peut rien supprimer.

import { authenticate, sendError, readBody, currentTodos, validatePatch, makeId } from "../../_lib/polaris-api.js";
import { applyOps } from "../../../src/utils/todoOps.js";

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
  if (!id || id.length > 64) return sendError(res, 400, "bad_request", "Identifiant de tâche invalide.");

  const body = readBody(req);
  if (body === undefined) return sendError(res, 400, "bad_request", "Corps JSON invalide.");
  const { errors, patch } = validatePatch(body);
  if (errors) return sendError(res, 400, "validation_error", "Données invalides.", { details: errors });

  try {
    const todos = await currentTodos(db, userId);
    if (!todos.some(t => t.id === id)) return sendError(res, 404, "not_found", `Aucune tâche avec l'id ${id}.`);

    const op = { user_id: userId, key_id: keyId, type: "update_todo", todo_id: id, payload: patch };
    const { error } = await db.from("api_ops").insert(op);
    if (error) throw error;

    // Aperçu de la tâche après application (l'app appliquera la même logique).
    const after = applyOps(todos, [op], makeId);
    return res.status(200).json({ todo: after.find(t => t.id === id) });
  } catch (e) {
    console.error("[api/v1/todos/:id]", e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
