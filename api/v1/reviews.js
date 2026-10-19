// GET /api/v1/reviews — lecture seule : weekly reviews, objectifs de semaine,
// objectifs mensuels (goals.mensuel). Aucune écriture possible ici.

import { authenticate, sendError, loadUserRow } from "../_lib/polaris-api.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "method_not_allowed", "Méthode acceptée : GET.");
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  res.setHeader("Cache-Control", "no-store");

  try {
    const row = await loadUserRow(auth.db, auth.userId, "weekly_reviews, weekly_objectives, goals");
    return res.status(200).json({
      weekly_reviews: Array.isArray(row.weekly_reviews) ? row.weekly_reviews : [],
      weekly_objectives: Array.isArray(row.weekly_objectives) ? row.weekly_objectives : [],
      monthly_goals: Array.isArray(row.goals?.mensuel) ? row.goals.mensuel : [],
    });
  } catch (e) {
    console.error("[api/v1/reviews]", e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
