-- ============================================================================
-- 019 — Récurrences liées à une opération réelle
--
-- Une récurrence se crée désormais à partir d'une opération déjà passée. Elle
-- retient une empreinte du libellé bancaire (match_key) ; à chaque synchro,
-- une nouvelle opération qui correspond (même compte, même sens, libellé,
-- montant et date proches) lui est rattachée automatiquement (recurring_id).
--
-- Une récurrence liée ne génère plus d'opération elle-même : c'est la banque
-- qui l'apporte, sinon chaque échéance serait comptée deux fois.
--
-- bank_label : libellé d'origine de la banque, conservé à part pour que la
-- détection fonctionne même si l'utilisateur renomme l'opération.
-- ============================================================================

ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS bank_label text;
ALTER TABLE finance_recurring    ADD COLUMN IF NOT EXISTS match_key text;

-- Opérations déjà synchronisées : leur note est encore le libellé bancaire,
-- sauf si elles ont été renommées entre-temps (on ne peut pas le savoir).
UPDATE finance_transactions SET bank_label = note
WHERE source = 'sync' AND bank_label IS NULL;
