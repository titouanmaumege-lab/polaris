-- ============================================================================
-- 016 — Nature de compte « pro »
--
-- Un compte pro est le compte de l'entreprise de l'utilisateur : tout revenu
-- encaissé dessus est du chiffre d'affaires (bloc « CA entreprise » du bilan).
-- Son solde appartient à l'entreprise : il n'entre pas dans le patrimoine net.
-- ============================================================================

ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_nature_check;
ALTER TABLE finance_accounts
  ADD CONSTRAINT finance_accounts_nature_check
  CHECK (nature IN ('liquidite','investissement','pro'));
