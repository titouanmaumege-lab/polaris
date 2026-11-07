-- ============================================================================
-- 026 — Blocs récurrents du Daily Paper
--
-- Les blocs perso (nom + couleur) ajoutés après WIN / LOSS / À AMÉLIORER
-- revenaient chaque jour mais vivaient seulement dans lp_custom_items côté
-- appareil. Cette colonne les synchronise entre appareils.
-- ============================================================================

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS custom_items jsonb NOT NULL DEFAULT '[]'::jsonb;
