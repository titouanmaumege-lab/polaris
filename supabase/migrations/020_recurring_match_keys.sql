-- ============================================================================
-- 020 — Plusieurs libellés par récurrence
--
-- Le libellé bancaire d'une même récurrence varie (« SALAIRE » puis « PAIE »,
-- « CARREFOUR MARKET » puis « CARREFOUR CITY »). Quand l'utilisateur rattache
-- à la main une opération non reconnue, son empreinte est ajoutée ici : la
-- fois suivante, elle est reconnue toute seule.
--
-- match_key reste en place : non nul, il signale une récurrence liée (et
-- empêche le rattrapage de générer des opérations en double).
-- ============================================================================

ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS match_keys text[];

UPDATE finance_recurring
SET match_keys = ARRAY[match_key]
WHERE match_key IS NOT NULL AND match_key <> '*' AND match_keys IS NULL;
