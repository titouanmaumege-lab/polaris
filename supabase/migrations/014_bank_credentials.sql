-- ============================================================================
-- 014 — Identifiants Enable Banking par utilisateur
--
-- En mode « restreint » (gratuit), une application Enable Banking ne voit que
-- les comptes reliés par son propriétaire. Pour que chaque utilisateur puisse
-- connecter SA banque, chacun enregistre sa propre application.
--
-- La clé privée n'est jamais stockée en clair : key_enc est chiffré en
-- AES-256-GCM par la fonction serveur (/api/bank) avec BANK_KEY_SECRET, un
-- secret qui n'existe que côté Vercel. Une fuite de la base seule ne suffit pas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_bank_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id text NOT NULL,
  key_enc text NOT NULL,             -- base64(iv | tag | ciphertext)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finance_bank_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_finance_bank_credentials" ON finance_bank_credentials FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own_insert_finance_bank_credentials" ON finance_bank_credentials FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_update_finance_bank_credentials" ON finance_bank_credentials FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "own_delete_finance_bank_credentials" ON finance_bank_credentials FOR DELETE USING (user_id = auth.uid());
