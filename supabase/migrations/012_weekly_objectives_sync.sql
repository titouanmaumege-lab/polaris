-- ============================================================================
-- 012 — Synchronisation des objectifs de semaine
--
-- lp_weekly_objectives n'était jamais envoyé à Supabase : les objectifs posés
-- en fin de weekly review restaient sur l'appareil qui les avait saisis, et
-- n'apparaissaient pas dans la review suivante faite ailleurs.
-- ============================================================================

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS weekly_objectives jsonb NOT NULL DEFAULT '[]'::jsonb;
