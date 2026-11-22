-- ============================================================================
-- 027 — Mission et vision (Étoile Polaire)
--
-- Texte de mission + vision/héritage, affiché en haut de la Home. Synchronisé
-- entre appareils ; sans cette colonne il reste local à l'appareil.
-- ============================================================================

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS mission jsonb NOT NULL DEFAULT '{}'::jsonb;
