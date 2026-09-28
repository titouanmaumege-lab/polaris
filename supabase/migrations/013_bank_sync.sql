-- ============================================================================
-- 013 — Synchronisation bancaire (Enable Banking, DSP2)
--
-- Une « connexion » = un consentement donné à une banque (valable 90 à 180
-- jours selon la banque). Elle couvre un ou plusieurs comptes bancaires, chacun
-- relié à un compte POLARIS (finance_accounts).
--
-- Les transactions importées portent un external_id : la contrainte unique
-- (account_id, external_id) rend chaque synchro idempotente. Les saisies
-- manuelles gardent external_id = NULL et ne sont donc jamais en conflit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_bank_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  aspsp_name text NOT NULL,
  aspsp_country text NOT NULL DEFAULT 'FR',
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE TABLE IF NOT EXISTS finance_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES finance_bank_links(id) ON DELETE CASCADE,
  account_uid text NOT NULL,                 -- identifiant Enable Banking du compte
  account_id uuid NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
  iban_last4 text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_uid)
);

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS external_id text;
DO $$ BEGIN
  ALTER TABLE finance_transactions
    ADD CONSTRAINT finance_transactions_account_external_uniq UNIQUE (account_id, external_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_fin_bank_links_user ON finance_bank_links(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_bank_acc_user   ON finance_bank_accounts(user_id);

ALTER TABLE finance_bank_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_finance_bank_links" ON finance_bank_links FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_bank_links" ON finance_bank_links FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_bank_links" ON finance_bank_links FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_bank_links" ON finance_bank_links FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "own_select_finance_bank_accounts" ON finance_bank_accounts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_bank_accounts" ON finance_bank_accounts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_bank_accounts" ON finance_bank_accounts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_bank_accounts" ON finance_bank_accounts FOR DELETE USING (user_id = auth.uid());
