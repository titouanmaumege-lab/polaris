-- ============================================================
-- MODULE FINANCES V3 — Budget Tracker « Budget Pro »
-- Budgets par mois · Remboursements (dettes/créances) · Ticker PEA
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- ===== BUDGETS PAR MOIS =====
-- Avant : un budget récurrent par catégorie. Maintenant : un budget distinct
-- par catégorie ET par mois (year + month 1-12), comme le HTML « Budget Pro ».
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS year  int;
ALTER TABLE finance_budgets ADD COLUMN IF NOT EXISTS month int;  -- 1-12

-- Backfill : les budgets existants (sans mois) → mois courant, pour ne rien perdre.
UPDATE finance_budgets
  SET year  = EXTRACT(YEAR  FROM now())::int,
      month = EXTRACT(MONTH FROM now())::int
  WHERE year IS NULL OR month IS NULL;

-- Remplace l'unicité (user_id, category_id) par (user_id, category_id, year, month).
ALTER TABLE finance_budgets DROP CONSTRAINT IF EXISTS finance_budgets_user_id_category_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS finance_budgets_uniq_month
  ON finance_budgets(user_id, category_id, year, month);

-- ===== TICKER PEA (affichage seul, pas de fetch auto) =====
ALTER TABLE finance_investments ADD COLUMN IF NOT EXISTS ticker text;

-- ===== REMBOURSEMENTS (créances & dettes) =====
CREATE TABLE IF NOT EXISTS finance_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person text NOT NULL,
  description text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  dir text NOT NULL CHECK (dir IN ('in','out')),  -- in = on me doit, out = je dois
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled')),
  settled_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_debts_user ON finance_debts(user_id, status);

ALTER TABLE finance_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_all_finance_debts" ON finance_debts;
CREATE POLICY "own_all_finance_debts" ON finance_debts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
