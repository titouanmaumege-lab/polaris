// Logique pure des tâches, partagée entre le front (useTodos) et les routes
// /api/v1 : la récurrence et l'application des opérations de l'API externe
// doivent donner exactement le même résultat des deux côtés.
// Aucun import navigateur ici : le fichier est aussi chargé par Node (Vercel).

export function calculateNextOccurrence(from, r) {
  const d = new Date(from || new Date());
  switch (r.unit) {
    case "day":   d.setDate(d.getDate() + r.interval); break;
    case "week":  d.setDate(d.getDate() + r.interval * 7); break;
    case "month": d.setMonth(d.getMonth() + r.interval); break;
    case "year":  d.setFullYear(d.getFullYear() + r.interval); break;
  }
  if (r.dayOfMonth && (r.unit === "month" || r.unit === "year")) d.setDate(r.dayOfMonth);
  return d;
}

// Bascule fait/pas fait. Une tâche récurrente qui passe à « fait » engendre
// l'occurrence suivante (même logique que l'app depuis toujours).
export function toggleDoneIn(todos, id, makeId) {
  const t = todos.find(x => x.id === id);
  if (!t) return todos;
  const becomingDone = !t.done;
  const updated = todos.map(x => x.id === id ? { ...x, done: becomingDone, doneAt: becomingDone ? new Date().toISOString() : undefined } : x);
  if (becomingDone && t.recurrence?.enabled) {
    const nextDate = calculateNextOccurrence(t.dateFin || t.dateAssignee || new Date(), t.recurrence);
    const nextIso = nextDate.toISOString().split("T")[0];
    updated.push({
      ...t, id: makeId(), done: false, doneAt: undefined, createdAt: new Date().toISOString(),
      ...(t.dateFin ? { dateFin: nextIso } : {}),
      ...(t.dateAssignee ? { dateAssignee: nextIso } : {}),
    });
  }
  return updated;
}

// Applique une file d'opérations de l'API (table api_ops) à une liste de tâches.
// Idempotent : un add déjà présent est ignoré, un done:true sur une tâche déjà
// faite ne fait rien (donc pas de seconde occurrence récurrente).
export function applyOps(todos, ops, makeId) {
  let out = todos;
  for (const op of ops) {
    const p = op.payload || {};
    if (op.type === "add_todo") {
      if (out.some(t => t.id === op.todo_id)) continue;
      out = [...out, { ...p, id: op.todo_id }];
    } else if (op.type === "update_todo") {
      const cur = out.find(t => t.id === op.todo_id);
      if (!cur) continue;
      const { done, ...fields } = p;
      if (Object.keys(fields).length) {
        out = out.map(t => {
          if (t.id !== op.todo_id) return t;
          const next = { ...t, updatedAt: new Date().toISOString() };
          // null = effacer le champ (ex. retirer une date)
          for (const [k, v] of Object.entries(fields)) {
            if (v === null) delete next[k]; else next[k] = v;
          }
          return next;
        });
      }
      if (typeof done === "boolean" && Boolean(cur.done) !== done) {
        out = toggleDoneIn(out, op.todo_id, makeId);
      }
    }
  }
  return out;
}
