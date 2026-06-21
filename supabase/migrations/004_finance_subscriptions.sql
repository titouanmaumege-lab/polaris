-- ============================================================
-- MODULE FINANCES — Abonnements récurrents
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  billing_day int CHECK (billing_day BETWEEN 1 AND 31), -- jour de prélèvement (optionnel)
  active boolean NOT NULL DEFAULT true,
  color text,
  icon text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_sub_user    ON finance_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_sub_account ON finance_subscriptions(account_id);

ALTER TABLE finance_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_finance_subscriptions" ON finance_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_subscriptions" ON finance_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_subscriptions" ON finance_subscriptions FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_subscriptions" ON finance_subscriptions FOR DELETE USING (user_id = auth.uid());
