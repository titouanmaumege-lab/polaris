-- ============================================================================
-- 011 — Nature des comptes + types d'aide sociale
--
-- 1. Chaque compte est soit une liquidité, soit un support d'investissement.
--    Le bilan sépare les deux au lieu d'un unique bloc « Comptes ».
-- 2. Les types d'aide sociale sont créés par l'utilisateur. Ils réutilisent
--    finance_categories avec kind = 'aide' : même CRUD, même RLS, rien à
--    dupliquer. Ce sont des sous-types du revenu « Aides sociales ».
-- ============================================================================

-- ===== NATURE DES COMPTES =====
-- Défaut 'liquidite' : les comptes existants restent où ils étaient.
ALTER TABLE finance_accounts
  ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'liquidite';

ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_nature_check;
ALTER TABLE finance_accounts
  ADD CONSTRAINT finance_accounts_nature_check
  CHECK (nature IN ('liquidite','investissement'));

-- ===== TYPES D'AIDE = CATÉGORIES DE KIND 'aide' =====
ALTER TABLE finance_categories DROP CONSTRAINT IF EXISTS finance_categories_kind_check;
ALTER TABLE finance_categories
  ADD CONSTRAINT finance_categories_kind_check
  CHECK (kind IN ('depense','revenu','aide'));

-- ===== SOUS-TYPE D'AIDE SUR LES TRANSACTIONS =====
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS aide_type_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL;

-- Un type d'aide n'a de sens que sur une aide sociale.
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_aide_type_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_aide_type_check
  CHECK (aide_type_id IS NULL OR revenu_kind = 'aides_sociales');

CREATE INDEX IF NOT EXISTS idx_fin_tx_aide_type
  ON finance_transactions(user_id, aide_type_id)
  WHERE aide_type_id IS NOT NULL;

-- Même champ sur les récurrences, pour que les aides récurrentes gardent leur type.
ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS aide_type_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL;
