-- ============================================================
-- 008 — Consentements RGPD + suppression de compte + rétention
-- Phase 3 conformité (voir docs/conformite/audit-phase1.md)
-- ============================================================

-- ============ CONSENTEMENTS (preuve d'accountability, art. 7 RGPD) ============
-- Deux consentements découplés : CGU (contrat) et données bien-être (art. 9(2)(a)).
-- Horodatage systématique = preuve. Jamais de suppression de ligne tant que le
-- compte existe (l'historique retrait/re-consentement reste tracé via les colonnes).

CREATE TABLE IF NOT EXISTS user_consents (
  user_id                     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cgu_accepted_at             timestamptz,          -- acceptation CGU + politique de confidentialité
  health_consented            boolean NOT NULL DEFAULT false,
  health_consent_at           timestamptz,          -- dernier consentement explicite art. 9
  health_consent_withdrawn_at timestamptz,          -- dernier retrait
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_user_consents" ON user_consents;
DROP POLICY IF EXISTS "own_insert_user_consents" ON user_consents;
DROP POLICY IF EXISTS "own_update_user_consents" ON user_consents;

CREATE POLICY "own_select_user_consents" ON user_consents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_user_consents" ON user_consents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_user_consents" ON user_consents FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Pas de policy DELETE : la ligne suit le compte (cascade à la suppression du compte).

-- ============ SUPPRESSION DE COMPTE (art. 17 RGPD + Apple 5.1.1(v)) ============
-- Suppression RÉELLE et complète, initiable depuis l'app par l'utilisateur seul.
-- SECURITY DEFINER : nécessaire pour supprimer la ligne auth.users sans service_role.
-- Toutes les suppressions sont explicites : aucune dépendance aux cascades des
-- tables créées hors migrations (user_data, profiles, knowledge_base_members).

CREATE OR REPLACE FUNCTION delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Module finances
  DELETE FROM public.finance_investment_moves WHERE user_id = uid;
  DELETE FROM public.finance_investments      WHERE user_id = uid;
  DELETE FROM public.finance_recurring        WHERE user_id = uid;
  DELETE FROM public.finance_goals            WHERE user_id = uid;
  DELETE FROM public.finance_debts            WHERE user_id = uid;
  DELETE FROM public.finance_subscriptions    WHERE user_id = uid;
  DELETE FROM public.finance_budgets          WHERE user_id = uid;
  DELETE FROM public.finance_transactions     WHERE user_id = uid;
  DELETE FROM public.finance_categories       WHERE user_id = uid;
  DELETE FROM public.finance_accounts         WHERE user_id = uid;

  -- Module base de connaissances (les cascades bases→pages→tags gèrent le reste)
  DELETE FROM public.knowledge_base_members   WHERE user_id = uid OR invited_by = uid;
  DELETE FROM public.knowledge_links          WHERE owner_id = uid;
  DELETE FROM public.knowledge_page_tags      WHERE page_id IN (SELECT id FROM public.knowledge_pages WHERE owner_id = uid);
  DELETE FROM public.knowledge_tags           WHERE owner_id = uid;
  DELETE FROM public.knowledge_pages          WHERE owner_id = uid;
  DELETE FROM public.knowledge_bases          WHERE owner_id = uid;

  -- Données de vie quotidienne (habitudes, journal bien-être, objectifs, sessions…)
  DELETE FROM public.user_data                WHERE id = uid;

  -- Consentements + profil
  DELETE FROM public.user_consents            WHERE user_id = uid;
  DELETE FROM public.profiles                 WHERE id = uid;

  -- Compte d'authentification (cascade sur identities, sessions, refresh tokens)
  DELETE FROM auth.users                      WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION delete_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_account() FROM anon;
GRANT EXECUTE ON FUNCTION delete_account() TO authenticated;

-- ============ RÉTENTION AUTOMATIQUE ============
-- Comptes jamais confirmés (email non validé) : purge après 30 jours.
-- Les comptes supprimés le sont immédiatement (hard delete ci-dessus) ;
-- les sauvegardes gérées par Supabase s'écrasent selon la rétention du plan.

CREATE OR REPLACE FUNCTION purge_unconfirmed_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM auth.users
  WHERE email_confirmed_at IS NULL
    AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION purge_unconfirmed_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_unconfirmed_accounts() FROM anon;
REVOKE ALL ON FUNCTION purge_unconfirmed_accounts() FROM authenticated;

-- Planification quotidienne si pg_cron est disponible (Dashboard → Extensions).
-- Sans pg_cron : exécuter manuellement `SELECT purge_unconfirmed_accounts();`
-- une fois par mois (procédure documentée dans docs/conformite/retention.md).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'purge-unconfirmed-accounts',
    '15 3 * * *',
    'SELECT public.purge_unconfirmed_accounts();'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponible — planifier purge_unconfirmed_accounts() manuellement (%).', SQLERRM;
END;
$$;
