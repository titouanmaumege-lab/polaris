// GET  /api/v1/todos?done=false|true — tâches de l'utilisateur (ops en attente incluses)
// POST /api/v1/todos                 — { name, … } ou { todos: [ … ] } (50 max)
// Auth : Authorization: Bearer pol_… — cf. API.md et api/_lib/polaris-api.js.

import { authenticate, sendError, readBody, currentTodos, buildNewTodo, goalLinkErrors } from "../../_lib/polaris-api.js";

const MAX_BATCH = 50;

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendError(res, 405, "method_not_allowed", "Méthodes acceptées : GET, POST.");
  }
  const auth = await authenticate(req, res);
  if (!auth) return;
  const { db, userId, keyId } = auth;
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const done = req.query.done;
      if (done !== undefined && done !== "true" && done !== "false") {
        return sendError(res, 400, "bad_request", "done doit valoir true ou false.");
      }
      let todos = await currentTodos(db, userId);
      if (done !== undefined) todos = todos.filter(t => Boolean(t.done) === (done === "true"));
      return res.status(200).json({ todos, count: todos.length });
    }

    const body = readBody(req);
    if (body === undefined) return sendError(res, 400, "bad_request", "Corps JSON invalide.");
    if (!body || typeof body !== "object") return sendError(res, 400, "bad_request", "Corps JSON attendu : { name, … } ou { todos: [ … ] }.");

    const batch = Array.isArray(body.todos);
    const inputs = batch ? body.todos : [body];
    if (batch && Object.keys(body).length > 1) return sendError(res, 400, "bad_request", "Avec « todos », aucun autre champ n'est accepté.");
    if (!inputs.length) return sendError(res, 400, "bad_request", "todos est vide.");
    if (inputs.length > MAX_BATCH) return sendError(res, 400, "bad_request", `${MAX_BATCH} tâches maximum par requête.`);

    const created = [];
    const details = [];
    inputs.forEach((input, i) => {
      const r = buildNewTodo(input);
      if (r.errors) details.push(...r.errors.map(e => (batch ? `todos[${i}] : ${e}` : e)));
      else created.push(r.todo);
    });
    if (!details.length) details.push(...await goalLinkErrors(db, userId, created.map(t => t.objectifId)));
    if (details.length) return sendError(res, 400, "validation_error", "Données invalides.", { details });

    const rows = created.map(t => ({ user_id: userId, key_id: keyId, type: "add_todo", todo_id: t.id, payload: t }));
    const { error } = await db.from("api_ops").insert(rows);
    if (error) throw error;

    return res.status(201).json(batch ? { todos: created, count: created.length } : { todo: created[0] });
  } catch (e) {
    console.error("[api/v1/todos]", e?.code ?? "", e?.message, e);
    return sendError(res, 500, "server_error", "Erreur serveur.");
  }
}
