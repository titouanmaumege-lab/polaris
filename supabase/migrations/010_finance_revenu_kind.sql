-- ============================================================================
-- 010 — Nature des revenus + employeurs
--
-- Objectif : piloter le bloc « Revenus » du bilan patrimonial sans dépendre des
-- catégories, qui sont créées et renommables par l'utilisateur (un renommage
-- casserait silencieusement le dashboard).
--
-- revenu_kind est un ENUM applicatif stable ; la catégorie reste libre à côté.
-- ============================================================================

-- ===== EMPLOYEURS =====
-- Permet un salaire cumulé sur plusieurs employeurs distincts.
CREATE TABLE IF NOT EXISTS finance_employers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_emp_user ON finance_employers(user_id);

ALTER TABLE finance_employers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_finance_employers" ON finance_employers;
DROP POLICY IF EXISTS "own_insert_finance_employers" ON finance_employers;
DROP POLICY IF EXISTS "own_update_finance_employers" ON finance_employers;
DROP POLICY IF EXISTS "own_delete_finance_employers" ON finance_employers;
CREATE POLICY "own_select_finance_employers" ON finance_employers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_employers" ON finance_employers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_employers" ON finance_employers FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_employers" ON finance_employers FOR DELETE USING (user_id = auth.uid());

-- ===== NATURE DU REVENU SUR LES TRANSACTIONS =====
-- NULL est autorisé : toutes les transactions existantes restent valides, et une
-- dépense ou un transfert n'a pas de nature de revenu.
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS revenu_kind text,
  ADD COLUMN IF NOT EXISTS employer_id uuid REFERENCES finance_employers(id) ON DELETE SET NULL;

ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_revenu_kind_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_revenu_kind_check
  CHECK (revenu_kind IS NULL OR revenu_kind IN
    ('salaire','aides_sociales','aides_familiales','entreprise','autre'));

-- Une nature de revenu n'a de sens que sur un revenu.
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_revenu_kind_type_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_revenu_kind_type_check
  CHECK (revenu_kind IS NULL OR type = 'revenu');

-- Un employeur n'a de sens que sur un salaire.
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_employer_kind_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_employer_kind_check
  CHECK (employer_id IS NULL OR revenu_kind = 'salaire');

CREATE INDEX IF NOT EXISTS idx_fin_tx_revenu_kind
  ON finance_transactions(user_id, revenu_kind, date)
  WHERE revenu_kind IS NOT NULL;

-- ===== MÊME NATURE SUR LES RÉCURRENCES =====
-- Pour que les revenus générés par une récurrence héritent de leur nature.
ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS revenu_kind text,
  ADD COLUMN IF NOT EXISTS employer_id uuid REFERENCES finance_employers(id) ON DELETE SET NULL;

ALTER TABLE finance_recurring DROP CONSTRAINT IF EXISTS finance_recurring_revenu_kind_check;
ALTER TABLE finance_recurring
  ADD CONSTRAINT finance_recurring_revenu_kind_check
  CHECK (revenu_kind IS NULL OR revenu_kind IN
    ('salaire','aides_sociales','aides_familiales','entreprise','autre'));
