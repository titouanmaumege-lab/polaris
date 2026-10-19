// GET /api/v1/reviews — lecture seule : weekly reviews, reviews mensuelles,
// objectifs de semaine, objectifs mensuels (goals.mensuel). Aucune écriture possible ici.

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
    const cols = "weekly_reviews, weekly_objectives, goals";
    // Migration 024 pas encore jouée : la colonne manque, on répond sans elle.
    let row;
    try {
      row = await loadUserRow(auth.db, auth.userId, cols + ", monthly_reviews");
    } catch (e) {
      if (!/monthly_reviews/.test(e?.message || "")) throw e;
      row = await loadUserRow(auth.db, auth.userId, cols);
    }
    return res.status(200).json({
      weekly_reviews: Array.isArray(row.weekly_reviews) ? row.weekly_reviews : [],
      monthly_reviews: Array.isArray(row.monthly_reviews) ? row.monthly_reviews : [],
      weekly_objectives: Array.isArray(row.weekly_objectives) ? row.weekly_objectives : [],
      monthly_goals: Array.isArray(row.goals?.mensuel) ? row.goals.mensuel : [],
    });
  } catch (e) {
    console.error("[api/v1/reviews]", e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
