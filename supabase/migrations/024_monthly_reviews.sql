-- ============================================================================
-- 024 — Reviews mensuelles
--
-- La review du mois (proposée à la clôture des OKR mensuels) vit dans
-- lp_monthly_reviews côté appareil. Sans cette colonne elle restait locale :
-- pas de synchro entre appareils ni de lecture par l'API.
-- ============================================================================

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS monthly_reviews jsonb NOT NULL DEFAULT '[]'::jsonb;
