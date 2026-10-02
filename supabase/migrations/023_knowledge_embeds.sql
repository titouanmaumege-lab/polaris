-- ============================================================================
-- 023 — Base : pages HTML intégrées (ex. PREPA BOOST)
--
-- knowledge_embeds : une page HTML autonome par (propriétaire, slug), poussée
-- par un script local (Assistant/CONNAISSANCES/outils/build_prepa_boost.py)
-- avec la clé service_role. Le navigateur ne la lit jamais en direct : elle
-- est servie par /api/embed, qui vérifie le JWT puis lit la ligne avec le
-- token de l'utilisateur (RLS : propriétaire seulement).
--
-- knowledge_bases.embed_slug : la base affiche cette page intégrée.
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_embeds (
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug       text NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,64}$'),
  html       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, slug)
);

ALTER TABLE knowledge_embeds ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour le propriétaire ; écriture réservée au service_role (bypass RLS)
DROP POLICY IF EXISTS owner_read_embeds ON knowledge_embeds;
CREATE POLICY owner_read_embeds ON knowledge_embeds
  FOR SELECT USING (owner_id = auth.uid());

ALTER TABLE knowledge_bases
  ADD COLUMN IF NOT EXISTS embed_slug text;

-- ----------------------------------------------------------------------------
-- Seed à jouer à la main (SQL Editor : auth.uid() y vaut NULL). Remplacer <EMAIL>.
-- ----------------------------------------------------------------------------
-- UPDATE knowledge_bases SET embed_slug = 'prepa-boost'
--  WHERE name = 'Préparation Physique' AND parent_id IS NULL
--    AND owner_id = (SELECT id FROM auth.users WHERE email = '<EMAIL>');
