// GET  /api/v1/goals?archived=true — objectifs (lt, annuel, trimestriel, mensuel), ops en attente incluses
// POST /api/v1/goals               — { level, titre, statut?, spaces?, periode?, parentId?, krs? }
// Un objectif par requête. Auth : Authorization: Bearer pol_… — cf. API.md.

import { authenticate, sendError, readBody, currentGoals, buildNewGoal } from "../../_lib/polaris-api.js";
import { GOAL_LEVELS } from "../../../src/utils/goalOps.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendError(res, 405, "method_not_allowed", "Méthodes acceptées : GET, POST.");
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { db, userId, keyId } = auth;
  res.setHeader("Cache-Control", "no-store");

  try {
    const goals = await currentGoals(db, userId);

    if (req.method === "GET") {
      const archived = req.query.archived;
      if (archived !== undefined && archived !== "true" && archived !== "false") {
        return sendError(res, 400, "bad_request", "archived doit valoir true ou false.");
      }
      const out = {};
      for (const level of GOAL_LEVELS) {
        out[level] = (goals[level] || []).filter(o => archived === "true" || !o.archived);
      }
      return res.status(200).json({ goals: out });
    }

    const body = readBody(req);
    if (body === undefined) return sendError(res, 400, "bad_request", "Corps JSON invalide.");
    const r = buildNewGoal(body, goals);
    if (r.errors) return sendError(res, 400, "validation_error", "Données invalides.", { details: r.errors });

    const op = { user_id: userId, key_id: keyId, type: "add_goal", todo_id: r.goal.id, payload: { level: r.level, goal: r.goal } };
    const { error } = await db.from("api_ops").insert(op);
    if (error) throw error;

    return res.status(201).json({ level: r.level, goal: r.goal });
  } catch (e) {
    console.error("[api/v1/goals]", e?.code ?? "", e?.message, e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
