-- ============================================================================
-- 022 — Base : onglets personnalisés + lien externe par base
--
-- tab_position : rang de la base dans la barre d'onglets de l'accueil Base
--                (NULL = pas un onglet). Seules les bases racine du
--                propriétaire sont proposées comme onglets.
-- link_label / link_url : lien externe affiché en carte en tête de la base
--                (ouvert dans un nouvel onglet, https:// uniquement côté UI).
--
-- Pas de nouvelle policy : owner_all_bases couvre déjà la table.
-- ============================================================================

ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS tab_position integer,
  ADD COLUMN IF NOT EXISTS link_label text,
  ADD COLUMN IF NOT EXISTS link_url text;

-- ----------------------------------------------------------------------------
-- Seed à jouer à la main (Supabase SQL Editor).
-- Dans le SQL Editor, auth.uid() vaut NULL (pas de session utilisateur) :
-- on identifie donc le propriétaire par son email. Remplacer <EMAIL>.
-- ----------------------------------------------------------------------------
-- UPDATE knowledge_bases SET tab_position = 0
--  WHERE name = 'Business' AND parent_id IS NULL
--    AND owner_id = (SELECT id FROM auth.users WHERE email = '<EMAIL>');
--
-- UPDATE knowledge_bases
--    SET tab_position = 1,
--        link_label   = 'PREPA BOOST',
--        link_url     = 'https://claude.ai/artifact/37ykhL3wCjgt4uA1jPtCqj'
--  WHERE name = 'Préparation Physique' AND parent_id IS NULL
--    AND owner_id = (SELECT id FROM auth.users WHERE email = '<EMAIL>');
