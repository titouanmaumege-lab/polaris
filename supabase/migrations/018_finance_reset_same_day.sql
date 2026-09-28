-- ============================================================================
-- 018 — Remise à zéro : garder les opérations du jour même
--
-- 017 bloquait tout ce qui était daté du jour de la remise à zéro : une opération
-- passée ce jour-là après la remise à zéro n'apparaissait jamais. Or le solde
-- d'un compte relié est recalé sur la banque à chaque synchro : réimporter les
-- opérations du jour ne peut pas le fausser. La borne devient donc « avant le
-- jour de la remise à zéro » (strict).
-- ============================================================================

-- Comptes déjà remis à zéro avec 017 : on rouvre le jour même.
UPDATE finance_bank_accounts
SET ignore_before = ignore_before - 1
WHERE ignore_before IS NOT NULL;

CREATE OR REPLACE FUNCTION finance_reset_operations()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE finance_accounts a
  SET initial_balance = a.initial_balance + COALESCE((
    SELECT SUM(CASE
      WHEN t.type = 'revenu'    AND t.account_id = a.id          THEN  t.amount
      WHEN t.type = 'depense'   AND t.account_id = a.id          THEN -t.amount
      WHEN t.type = 'transfert' AND t.account_id = a.id          THEN -t.amount
      WHEN t.type = 'transfert' AND t.transfer_account_id = a.id THEN  t.amount
      ELSE 0 END)
    FROM finance_transactions t
    WHERE t.user_id = uid AND (t.account_id = a.id OR t.transfer_account_id = a.id)
  ), 0)
  WHERE a.user_id = uid;

  DELETE FROM finance_transactions WHERE user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Opérations d'avant aujourd'hui : déjà dans le solde, pas réimportées.
  -- Celles d'aujourd'hui reviennent (le recalage du solde évite tout double compte).
  UPDATE finance_bank_accounts
  SET ignore_before = current_date, last_synced_at = now()
  WHERE user_id = uid;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION finance_reset_operations() FROM public, anon;
GRANT EXECUTE ON FUNCTION finance_reset_operations() TO authenticated;
