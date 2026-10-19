-- ============================================================================
-- 023 — Accès API externe (assistant IA) : clés perso + file d'opérations
--
-- Un assistant (Claude, sur l'ordinateur de l'utilisateur) lit et ajoute des
-- tâches via /api/v1 avec une clé « pol_… ».
--
-- Pourquoi une file : le front garde tout dans le localStorage et réécrit la
-- ligne user_data entière 1,5 s après chaque modif. Une écriture serveur
-- directe dans user_data serait écrasée par le prochain upsert d'un onglet
-- ouvert. Les routes n'écrivent donc QUE dans api_ops ; l'app réserve ces
-- lignes (claim_api_ops) et les applique avec sa logique normale.
--
-- Les routes utilisent la service role key (côté Vercel uniquement).
-- ============================================================================

-- ── Clés API ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  key_hash     text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),  -- SHA-256 hex, jamais la clé
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id, created_at DESC);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_api_keys" ON api_keys;
DROP POLICY IF EXISTS "own_insert_api_keys" ON api_keys;
DROP POLICY IF EXISTS "own_revoke_api_keys" ON api_keys;
CREATE POLICY "own_select_api_keys" ON api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_api_keys" ON api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid() AND revoked_at IS NULL AND last_used_at IS NULL);
-- Révocation seulement : une clé active peut passer à révoquée, jamais l'inverse.
CREATE POLICY "own_revoke_api_keys" ON api_keys FOR UPDATE
  USING (user_id = auth.uid() AND revoked_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND revoked_at IS NOT NULL);
-- Pas de DELETE : l'historique des clés reste visible.

-- Colonnes modifiables par le client : rien d'autre que revoked_at en UPDATE.
REVOKE ALL ON api_keys FROM anon, authenticated;
GRANT SELECT ON api_keys TO authenticated;
GRANT INSERT (user_id, name, key_hash) ON api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON api_keys TO authenticated;

-- ── File d'opérations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_ops (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id     uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  type       text NOT NULL CHECK (type IN ('add_todo', 'update_todo')),
  todo_id    text NOT NULL CHECK (char_length(todo_id) BETWEEN 1 AND 64),
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
-- Relève des ops en attente (front + lecture API).
CREATE INDEX IF NOT EXISTS api_ops_pending_idx ON api_ops (user_id, created_at) WHERE applied_at IS NULL;

ALTER TABLE api_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_api_ops" ON api_ops;
DROP POLICY IF EXISTS "own_claim_api_ops" ON api_ops;
CREATE POLICY "own_select_api_ops" ON api_ops FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_claim_api_ops" ON api_ops FOR UPDATE
  USING (user_id = auth.uid() AND applied_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND applied_at IS NOT NULL);
-- Aucun INSERT/DELETE client : seules les routes serveur (service role) empilent.

REVOKE ALL ON api_ops FROM anon, authenticated;
GRANT SELECT ON api_ops TO authenticated;
GRANT UPDATE (applied_at) ON api_ops TO authenticated;

-- Réservation atomique : un seul UPDATE … RETURNING. Deux appareils qui relèvent
-- en même temps ne récupèrent jamais la même ligne (verrou de ligne + re-test
-- de applied_at IS NULL). SECURITY INVOKER : la RLS s'applique.
CREATE OR REPLACE FUNCTION claim_api_ops()
RETURNS SETOF api_ops
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE api_ops
     SET applied_at = now()
   WHERE user_id = auth.uid()
     AND applied_at IS NULL
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION claim_api_ops() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_api_ops() TO authenticated;

-- ── Limite de débit (par clé, fenêtre d'une minute) ─────────────────────────
CREATE TABLE IF NOT EXISTS api_rate_limits (
  key_id       uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;  -- aucune policy : service role seulement
REVOKE ALL ON api_rate_limits FROM anon, authenticated;

-- Compte un appel, met à jour last_used_at, renvoie le nombre d'appels de la minute.
CREATE OR REPLACE FUNCTION api_hit(p_key_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w timestamptz := date_trunc('minute', now());
  n integer;
BEGIN
  INSERT INTO api_rate_limits (key_id, window_start, hits)
  VALUES (p_key_id, w, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE SET hits = api_rate_limits.hits + 1
  RETURNING hits INTO n;

  UPDATE api_keys SET last_used_at = now() WHERE id = p_key_id;
  DELETE FROM api_rate_limits WHERE key_id = p_key_id AND window_start < w - interval '10 minutes';
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION api_hit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api_hit(uuid) TO service_role;
