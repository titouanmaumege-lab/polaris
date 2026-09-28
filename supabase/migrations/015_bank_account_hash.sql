-- ============================================================================
-- 015 — Reconnaître un compte bancaire d'une connexion à l'autre
--
-- Le `uid` Enable Banking d'un compte ne vaut que pour la session qui l'a créé :
-- à chaque reconnexion (consentement expiré, ajout d'un compte) il change.
-- Le rapprochement se fait donc sur identification_hash, stable d'une session
-- à l'autre, sinon chaque reconnexion dupliquerait le compte et ses opérations.
-- ============================================================================

ALTER TABLE finance_bank_accounts ADD COLUMN IF NOT EXISTS identification_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fin_bank_acc_hash
  ON finance_bank_accounts(user_id, identification_hash)
  WHERE identification_hash IS NOT NULL;
