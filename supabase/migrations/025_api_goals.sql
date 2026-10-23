-- Écriture des objectifs (OKR) via l'API : deux nouveaux types d'opérations dans api_ops.
-- add_goal    : crée un objectif (payload { level, goal }).
-- update_goal : modifie un objectif existant (payload { patch }).
-- La colonne todo_id garde son nom : elle contient l'identifiant de l'entité visée (tâche ou objectif).

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'api_ops'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%add_todo%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE api_ops DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE api_ops
  ADD CONSTRAINT api_ops_type_check
  CHECK (type IN ('add_todo', 'update_todo', 'add_goal', 'update_goal'));

COMMENT ON COLUMN api_ops.todo_id IS 'Identifiant de l''entité visée par l''opération (tâche ou objectif).';
