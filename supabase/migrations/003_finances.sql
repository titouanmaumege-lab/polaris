-- ============================================================
-- MODULE FINANCES — Tracker manuel multi-comptes
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- ============ COMPTES ============
CREATE TABLE IF NOT EXISTS finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'courant'
    CHECK (type IN ('courant','epargne','especes','autre')),
  initial_balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  color text,
  icon text,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ CATÉGORIES ============
CREATE TABLE IF NOT EXISTS finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'depense' CHECK (kind IN ('depense','revenu')),
  color text,
  icon text,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ TRANSACTIONS ============
CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  transfer_account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL, -- destination si type=transfert
  category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('depense','revenu','transfert')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0), -- toujours positif, le signe vient du type
  date date NOT NULL DEFAULT current_date,
  note text,
  source text NOT NULL DEFAULT 'manuel', -- future-proof: 'manuel' | 'import' | 'sync' en V2
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ BUDGETS (mensuel récurrent) ============
CREATE TABLE IF NOT EXISTS finance_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES finance_categories(id) ON DELETE CASCADE, -- null = budget global
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, category_id)
);

-- ============ INDEX ============
CREATE INDEX IF NOT EXISTS idx_fin_tx_user_date ON finance_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_tx_account   ON finance_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_fin_tx_category  ON finance_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_fin_cat_user     ON finance_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_acc_user     ON finance_accounts(user_id);

-- ============ RLS ============
ALTER TABLE finance_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_budgets      ENABLE ROW LEVEL SECURITY;

-- finance_accounts
CREATE POLICY "own_select_finance_accounts" ON finance_accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_accounts" ON finance_accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_accounts" ON finance_accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_accounts" ON finance_accounts FOR DELETE USING (user_id = auth.uid());

-- finance_categories
CREATE POLICY "own_select_finance_categories" ON finance_categories FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_categories" ON finance_categories FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_categories" ON finance_categories FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_categories" ON finance_categories FOR DELETE USING (user_id = auth.uid());

-- finance_transactions
CREATE POLICY "own_select_finance_transactions" ON finance_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_transactions" ON finance_transactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_transactions" ON finance_transactions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_transactions" ON finance_transactions FOR DELETE USING (user_id = auth.uid());

-- finance_budgets
CREATE POLICY "own_select_finance_budgets" ON finance_budgets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_budgets" ON finance_budgets FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_budgets" ON finance_budgets FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_budgets" ON finance_budgets FOR DELETE USING (user_id = auth.uid());

-- ============ VUE SOLDES (calcul serveur, RLS héritée) ============
CREATE OR REPLACE VIEW v_finance_account_balances
WITH (security_invoker = on) AS
SELECT
  a.id   AS account_id,
  a.user_id,
  a.initial_balance
    + coalesce(sum(CASE WHEN t.type='revenu'    AND t.account_id=a.id          THEN t.amount ELSE 0 END),0)
    - coalesce(sum(CASE WHEN t.type='depense'   AND t.account_id=a.id          THEN t.amount ELSE 0 END),0)
    - coalesce(sum(CASE WHEN t.type='transfert' AND t.account_id=a.id          THEN t.amount ELSE 0 END),0)
    + coalesce(sum(CASE WHEN t.type='transfert' AND t.transfer_account_id=a.id THEN t.amount ELSE 0 END),0)
    AS balance
FROM finance_accounts a
LEFT JOIN finance_transactions t
  ON t.account_id = a.id OR t.transfer_account_id = a.id
GROUP BY a.id, a.user_id, a.initial_balance;
