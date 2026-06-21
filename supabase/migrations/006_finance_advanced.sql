-- ============================================================
-- MODULE FINANCES V2 — Objectifs, Récurrent, Investissements
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- ===== Type de compte « investissement » =====
ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_type_check;
ALTER TABLE finance_accounts
  ADD CONSTRAINT finance_accounts_type_check
  CHECK (type IN ('courant','epargne','especes','autre','investissement'));

-- ===== OBJECTIFS D'ÉPARGNE =====
CREATE TABLE IF NOT EXISTS finance_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(12,2) NOT NULL DEFAULT 0,
  account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  deadline date,
  color text, icon text,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== RÉCURRENT (alimente Abonnements + onglet Récurrent) =====
CREATE TABLE IF NOT EXISTS finance_recurring (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('depense','revenu','transfert')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  account_id uuid NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  transfer_account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL,
  is_subscription boolean NOT NULL DEFAULT false,
  freq text NOT NULL CHECK (freq IN ('jour','semaine','mois','annee')),
  interval int NOT NULL DEFAULT 1,
  day_of_month int,
  weekday int,
  month_of_year int,
  next_occurrence date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_id uuid REFERENCES finance_recurring(id) ON DELETE SET NULL;

-- ===== INVESTISSEMENTS =====
CREATE TABLE IF NOT EXISTS finance_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  label text NOT NULL,
  quantity numeric(18,6) NOT NULL DEFAULT 0,
  avg_buy_price numeric(18,6) NOT NULL DEFAULT 0,
  current_price numeric(18,6) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_investment_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  investment_id uuid NOT NULL REFERENCES finance_investments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('achat','vente')),
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  price numeric(18,6) NOT NULL CHECK (price >= 0),
  date date NOT NULL DEFAULT current_date,
  cash_account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== INDEX =====
CREATE INDEX IF NOT EXISTS idx_fin_goals_user     ON finance_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_rec_user_next  ON finance_recurring(user_id, next_occurrence);
CREATE INDEX IF NOT EXISTS idx_fin_inv_user       ON finance_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_invmove_inv    ON finance_investment_moves(investment_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_recurring   ON finance_transactions(recurring_id);

-- ===== RLS =====
ALTER TABLE finance_goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_recurring         ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_investments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_investment_moves  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_finance_goals" ON finance_goals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_goals" ON finance_goals FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_goals" ON finance_goals FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_goals" ON finance_goals FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "own_select_finance_recurring" ON finance_recurring FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_recurring" ON finance_recurring FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_recurring" ON finance_recurring FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_recurring" ON finance_recurring FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "own_select_finance_investments" ON finance_investments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_investments" ON finance_investments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_investments" ON finance_investments FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_investments" ON finance_investments FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "own_select_finance_investment_moves" ON finance_investment_moves FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_investment_moves" ON finance_investment_moves FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_investment_moves" ON finance_investment_moves FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_investment_moves" ON finance_investment_moves FOR DELETE USING (user_id = auth.uid());
