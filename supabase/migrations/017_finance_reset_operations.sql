-- ============================================================================
-- 017 — Repartir de zéro sur les opérations, en gardant les soldes
--
-- Le solde d'un compte = initial_balance + mouvements. Pour supprimer les
-- mouvements sans toucher au solde, on les absorbe d'abord dans initial_balance,
-- puis on les supprime. Les deux étapes sont dans UNE fonction : si l'une
-- échoue, rien n'est appliqué (sinon les soldes seraient faux).
--
-- SECURITY INVOKER : la fonction tourne avec les droits de l'appelant, la RLS
-- s'applique, et chaque WHERE est de toute façon borné à auth.uid().
--
-- ignore_before : la synchro bancaire relit quelques jours en arrière ; sans
-- cette borne, elle réimporterait les opérations qu'on vient d'effacer.
-- ============================================================================

ALTER TABLE finance_bank_accounts ADD COLUMN IF NOT EXISTS ignore_before date;

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

  -- Opérations datées d'aujourd'hui ou avant : déjà dans le solde, on ne les
  -- réimporte pas.
  UPDATE finance_bank_accounts
  SET ignore_before = current_date + 1, last_synced_at = now()
  WHERE user_id = uid;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION finance_reset_operations() FROM public, anon;
GRANT EXECUTE ON FUNCTION finance_reset_operations() TO authenticated;
