-- ============================================================
-- 009 — Verrouillage de `profiles` (finding S2, audit Phase 1)
-- + versionnement des policies créées à la main (user_data, members)
-- ============================================================
-- Avant : policy "profiles: lecture publique" (SELECT, {public}, qual=true)
-- → l'annuaire complet des emails était lisible avec la seule clé anon.
-- Après : chacun lit son profil + ceux des personnes avec qui il partage
-- une base ; l'invitation par email passe par une RPC qui ne renvoie qu'un id.

-- Vrai pour A et B s'ils co-existent sur au moins une base (membre ou owner).
CREATE OR REPLACE FUNCTION shares_base_with(target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM knowledge_base_members m1
    JOIN knowledge_base_members m2 ON m1.base_id = m2.base_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = target
  ) OR EXISTS (
    SELECT 1 FROM knowledge_base_members m
    JOIN knowledge_bases b ON b.id = m.base_id
    WHERE (m.user_id = auth.uid() AND b.owner_id = target)
       OR (b.owner_id = auth.uid() AND m.user_id = target)
  );
$$;
REVOKE ALL ON FUNCTION shares_base_with(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION shares_base_with(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION shares_base_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles: lecture publique" ON profiles;
DROP POLICY IF EXISTS "profiles_select_self_or_comember" ON profiles;
CREATE POLICY "profiles_select_self_or_comember" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR shares_base_with(id));

-- Invitation : résolution email → id sans exposer la table.
-- Renvoie NULL si inconnu. L'énumération unitaire par un utilisateur
-- authentifié reste possible (inhérent à l'invitation par email) mais
-- plus aucun dump massif ni accès anonyme.
CREATE OR REPLACE FUNCTION find_user_id_by_email(lookup_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE lower(email) = lower(trim(lookup_email)) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION find_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_user_id_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION find_user_id_by_email(text) TO authenticated;

-- ============ Versionnement des policies créées à la main ============
-- (constatées au dashboard le 05/07/2026 — reprises ici pour que le dépôt
-- soit la source de vérité ; no-op si déjà identiques)

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own data only" ON user_data;
CREATE POLICY "own data only" ON user_data FOR ALL USING (auth.uid() = id);

ALTER TABLE knowledge_base_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members: owner gère" ON knowledge_base_members;
DROP POLICY IF EXISTS "members: self lecture" ON knowledge_base_members;
CREATE POLICY "members: owner gère" ON knowledge_base_members FOR ALL USING (is_base_owner(base_id));
CREATE POLICY "members: self lecture" ON knowledge_base_members FOR SELECT USING (user_id = auth.uid());
