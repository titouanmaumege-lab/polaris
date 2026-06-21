-- ============================================================
-- MODULE FINANCES — Validation mensuelle des abonnements
-- Marque un abonnement comme « passé sur le compte » pour un mois donné.
-- Se réinitialise visuellement chaque 1er du mois (comparaison au mois courant).
-- À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE finance_subscriptions
  ADD COLUMN IF NOT EXISTS last_paid_month text,            -- 'YYYY-MM' du dernier mois validé
  ADD COLUMN IF NOT EXISTS last_payment_tx_id uuid          -- transaction créée à la validation
    REFERENCES finance_transactions(id) ON DELETE SET NULL;
