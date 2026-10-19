// Socle commun des routes /api/v1 (accès d'un assistant IA aux tâches).
// Le préfixe « _ » empêche Vercel d'exposer ce fichier comme une route.
//
// Variables d'environnement attendues côté Vercel :
//   SUPABASE_SERVICE_ROLE_KEY — clé service role (Supabase → Project Settings → API).
//                               Serveur uniquement : JAMAIS de préfixe VITE_.
//   VITE_SUPABASE_URL         — déjà présente
//
// Règle d'écriture : ces routes n'écrivent jamais dans user_data (le front
// l'écraserait au prochain upsert). Elles empilent dans api_ops — cf. migration 023.

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { applyOps } from "../../src/utils/todoOps.js";

export const RATE_LIMIT_PER_MIN = 60;

let _admin = null;
export function admin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

export function sendError(res, status, error, message, extra = {}) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error, message, ...extra });
}

export const makeId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

const sha256 = s => crypto.createHash("sha256").update(s).digest("hex");

/**
 * Authentifie « Authorization: Bearer pol_… » et applique la limite de débit.
 * Renvoie { db, userId, keyId } ou null (la réponse d'erreur est déjà envoyée).
 */
export async function authenticate(req, res) {
  const db = admin();
  if (!db) { sendError(res, 503, "not_configured", "API non configurée côté serveur (SUPABASE_SERVICE_ROLE_KEY manquante)."); return null; }

  const m = /^Bearer\s+(pol_[A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || "");
  if (!m) { sendError(res, 401, "unauthorized", "Header attendu : Authorization: Bearer pol_…"); return null; }

  const { data: key, error } = await db
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", sha256(m[1]))
    .is("revoked_at", null)
    .maybeSingle();
  if (error) { sendError(res, 500, "server_error", "Vérification de la clé impossible."); return null; }
  if (!key) { sendError(res, 401, "unauthorized", "Clé API invalide ou révoquée."); return null; }

  const { data: hits, error: rlErr } = await db.rpc("api_hit", { p_key_id: key.id });
  if (!rlErr && hits > RATE_LIMIT_PER_MIN) {
    res.setHeader("Retry-After", String(60 - new Date().getSeconds()));
    sendError(res, 429, "rate_limited", `Limite de ${RATE_LIMIT_PER_MIN} requêtes par minute atteinte.`);
    return null;
  }
  return { db, userId: key.user_id, keyId: key.id };
}

export function readBody(req) {
  if (req.body == null || req.body === "") return null;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return undefined; } }
  return req.body;
}

// ── Lecture : user_data + ops encore en attente ────────────────────────────
export async function loadUserRow(db, userId, columns) {
  const { data, error } = await db.from("user_data").select(columns).eq("id", userId).maybeSingle();
  if (error) throw error;
  return data || {};
}

export async function pendingOps(db, userId) {
  const { data, error } = await db
    .from("api_ops")
    .select("type, todo_id, payload, created_at")
    .eq("user_id", userId)
    .is("applied_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Tâches telles que l'app les verra une fois les ops en attente appliquées. */
export async function currentTodos(db, userId) {
  const [row, ops] = await Promise.all([loadUserRow(db, userId, "todos"), pendingOps(db, userId)]);
  const todos = Array.isArray(row.todos) ? row.todos.filter(Boolean) : [];
  return applyOps(todos, ops, makeId);
}

// ── Validation ─────────────────────────────────────────────────────────────
const GTD = ["inbox", "projet", "memo", "check", "someday", "waiting"];
const MATRICE = ["ui", "uni", "nui", "nuni"];
const STATUT = ["a_planifier", "planifie", "en_cours", "termine"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = v => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
const str = max => (v, k) => {
  if (typeof v !== "string") return `${k} doit être une chaîne`;
  if (!v.trim()) return `${k} ne peut pas être vide`;
  if (v.length > max) return `${k} : ${max} caractères maximum`;
  return null;
};
const oneOf = list => (v, k) => list.includes(v) ? null : `${k} doit valoir ${list.join(" | ")}`;
const date = (v, k) => isDate(v) ? null : `${k} doit être une date YYYY-MM-DD`;

// champ → validateur ; nullable = on peut l'effacer avec null (PATCH)
const FIELDS = {
  name:         { check: str(300) },
  gtd:          { check: oneOf(GTD) },
  sphere:       { check: str(60), nullable: true },
  matrice:      { check: oneOf(MATRICE), nullable: true },
  statut:       { check: oneOf(STATUT), nullable: true },
  dateDebut:    { check: date, nullable: true },
  dateFin:      { check: date, nullable: true },
  dateAssignee: { check: date, nullable: true },
  notes:        { check: str(5000), nullable: true },
  waitingFor:   { check: str(120), nullable: true },
};
const CREATE_FIELDS = ["name", "gtd", "sphere", "matrice", "dateDebut", "dateFin", "dateAssignee", "notes", "waitingFor"];
const UPDATE_FIELDS = [...Object.keys(FIELDS), "done"];

function validateFields(obj, allowed, { partial }) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { errors: ["objet JSON attendu"] };
  const errors = [];
  const out = {};
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) { errors.push(`champ inconnu : ${k}`); continue; }
    const v = obj[k];
    if (k === "done") {
      if (typeof v !== "boolean") errors.push("done doit être true ou false"); else out.done = v;
      continue;
    }
    if (v === null) {
      if (partial && FIELDS[k].nullable) out[k] = null; else errors.push(`${k} ne peut pas être null`);
      continue;
    }
    if (v === undefined) continue;
    const e = FIELDS[k].check(v, k);
    if (e) errors.push(e); else out[k] = typeof v === "string" ? v.trim() : v;
  }
  return { errors, value: out };
}

/** Valide une tâche à créer et renvoie l'objet complet prêt pour api_ops. */
export function buildNewTodo(input) {
  const { errors, value } = validateFields(input, CREATE_FIELDS, { partial: false });
  if (!errors.length && !value.name) errors.push("name est obligatoire");
  if (!errors.length && value.dateDebut && value.dateFin && value.dateDebut > value.dateFin) errors.push("dateDebut doit précéder dateFin");
  if (errors.length) return { errors };
  return {
    todo: {
      id: makeId(),
      gtd: "inbox",
      statut: "a_planifier",
      sousTaches: [],
      ...value,
      done: false,
      createdAt: new Date().toISOString(),
      source: "claude",
    },
  };
}

export function validatePatch(input) {
  const { errors, value } = validateFields(input, UPDATE_FIELDS, { partial: true });
  if (!errors.length && !Object.keys(value).length) errors.push("aucun champ à modifier");
  return errors.length ? { errors } : { patch: value };
}
