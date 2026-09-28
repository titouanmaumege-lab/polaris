-- ============================================================================
-- 021 — Catégories de transfert (intercompte)
--
-- Une opération bancaire qui n'est qu'un mouvement entre deux comptes à soi
-- (virement vers l'épargne, alimentation du compte joint…) reste une dépense
-- ou un revenu côté banque : le solde de chaque compte est juste. Classée dans
-- une catégorie de kind 'transfert', elle sort des totaux du mois, de la
-- répartition des dépenses et des budgets.
-- ============================================================================

ALTER TABLE finance_categories DROP CONSTRAINT IF EXISTS finance_categories_kind_check;
ALTER TABLE finance_categories
  ADD CONSTRAINT finance_categories_kind_check
  CHECK (kind IN ('depense','revenu','aide','transfert'));
