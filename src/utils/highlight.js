// Highlight du jour — référence vers une tâche (ou sous-tâche) de leplan_todos.
// La Todo reste la source de vérité unique : on ne stocke qu'un pointeur.
//
// lp_highlight : { "YYYY-MM-DD": HighlightRef | string }
//   HighlightRef = { taskId, subTaskId?, setAt }
//   string       = ancien format (texte libre), conservé en lecture seule.

export const makeHighlightRef = (taskId, subTaskId) => ({
  taskId,
  ...(subTaskId ? { subTaskId } : {}),
  setAt: new Date().toISOString(),
});

// → { status: 'ok'|'done'|'missing'|'legacy', label, parentLabel?, sphere?, task?, subTask? }
// Retourne null si aucun highlight n'est posé pour le jour.
export function resolveHighlight(ref, todos) {
  if (!ref) return null;
  if (typeof ref === "string") {
    const text = ref.trim();
    return text ? { status: "legacy", label: text } : null;
  }
  if (!ref.taskId) return null;

  const task = (todos || []).find(t => t.id === ref.taskId);
  if (!task) return { status: "missing", label: "" };

  if (ref.subTaskId) {
    const subTask = (task.sousTaches || []).find(s => s.id === ref.subTaskId);
    if (!subTask) return { status: "missing", label: "" };
    return {
      status: subTask.done ? "done" : "ok",
      label: subTask.name,
      parentLabel: task.name,
      sphere: task.sphere,
      task, subTask,
    };
  }

  return {
    status: task.done ? "done" : "ok",
    label: task.name,
    sphere: task.sphere,
    task,
  };
}
