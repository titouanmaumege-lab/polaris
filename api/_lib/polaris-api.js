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
import { GOAL_LEVELS, applyGoalOps } from "../../src/utils/goalOps.js";
import { periodeTypeForLevel, computeCloture, defaultPeriode } from "../../src/utils/date.js";

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

// undefined = JSON invalide. Le getter req.body de Vercel parse à la volée et
// lève « Invalid JSON » si le corps est mal formé : l'accès doit être protégé.
export function readBody(req) {
  let body;
  try { body = req.body; } catch { return undefined; }
  if (body == null || body === "") return null;
  if (typeof body === "string") { try { return JSON.parse(body); } catch { return undefined; } }
  return body;
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

// ── Objectifs (OKR) ────────────────────────────────────────────────────────
const GOAL_STATUTS = ["Ça arrive", "En cours", "C'est chaud", "Atteint", "Échoué", "Abandonné"];
const GOAL_PARENT = { annuel: "lt", trimestriel: "annuel", mensuel: "trimestriel" };
const GOAL_MAX_PER_LEVEL = 6; // même plafond que l'app (OBJ_MAX_PER_LEVEL)
const GOAL_MAX_KRS = 8;
const isNum = v => typeof v === "number" && Number.isFinite(v);

/** Objectifs tels que l'app les verra une fois les ops en attente appliquées. */
export async function currentGoals(db, userId) {
  const [row, ops] = await Promise.all([loadUserRow(db, userId, "goals"), pendingOps(db, userId)]);
  return applyGoalOps(row.goals && typeof row.goals === "object" ? row.goals : {}, ops);
}

function checkPeriode(level, p) {
  const type = periodeTypeForLevel(level);
  if (!type) return { error: "periode n'existe pas au niveau lt" };
  if (!p || typeof p !== "object" || Array.isArray(p)) return { error: "periode doit être un objet { type, year, … }" };
  if (p.type !== type) return { error: `periode.type doit valoir ${type} au niveau ${level}` };
  if (!Number.isInteger(p.year) || p.year < 2000 || p.year > 2100) return { error: "periode.year doit être une année (2000-2100)" };
  if (type === "quarter" && !(Number.isInteger(p.quarter) && p.quarter >= 0 && p.quarter <= 3)) return { error: "periode.quarter doit valoir 0 à 3 (0 = T1)" };
  if (type === "month" && !(Number.isInteger(p.month) && p.month >= 0 && p.month <= 11)) return { error: "periode.month doit valoir 0 à 11 (0 = janvier)" };
  const periode = { type, year: p.year, month: type === "month" ? p.month : 0, quarter: type === "quarter" ? p.quarter : 0 };
  return { periode, dateCloture: computeCloture(periode) };
}

function checkKrs(list) {
  if (!Array.isArray(list)) return { error: "krs doit être un tableau" };
  if (list.length > GOAL_MAX_KRS) return { error: `krs : ${GOAL_MAX_KRS} résultats clés maximum` };
  const errors = [];
  const krs = list.map((k, i) => {
    if (!k || typeof k !== "object" || Array.isArray(k)) { errors.push(`krs[${i}] : objet attendu`); return null; }
    const nomErr = str(200)(k.nom, `krs[${i}].nom`);
    if (nomErr) errors.push(nomErr);
    for (const f of ["depart", "cible"]) if (!isNum(k[f])) errors.push(`krs[${i}].${f} doit être un nombre`);
    if (k.actuelle !== undefined && !isNum(k.actuelle)) errors.push(`krs[${i}].actuelle doit être un nombre`);
    if (k.id !== undefined && (typeof k.id !== "string" || !k.id || k.id.length > 64)) errors.push(`krs[${i}].id invalide`);
    return { id: k.id || makeId(), nom: String(k.nom ?? "").trim(), depart: k.depart, actuelle: k.actuelle ?? k.depart, cible: k.cible };
  });
  return errors.length ? { error: errors } : { krs };
}

function checkParent(goals, level, parentId) {
  const parentLevel = GOAL_PARENT[level];
  if (!parentLevel) return `le niveau ${level} n'a pas de parent`;
  const parent = (goals[parentLevel] || []).find(o => o.id === parentId);
  return parent ? null : `parentId : aucun objectif ${parentLevel} avec l'id ${parentId}`;
}

function checkSpaces(v) {
  if (!Array.isArray(v) || v.length > 4 || v.some(s => typeof s !== "string" || !s.trim() || s.length > 60)) return "spaces doit être un tableau de 4 textes maximum";
  return null;
}

/** Valide un objectif à créer. `goals` = état courant (parent, plafond par niveau). */
export function buildNewGoal(input, goals) {
  const ALLOWED = ["level", "titre", "statut", "spaces", "periode", "parentId", "krs"];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: ["objet JSON attendu"] };
  const errors = Object.keys(input).filter(k => !ALLOWED.includes(k)).map(k => `champ inconnu : ${k}`);
  const { level } = input;
  if (!GOAL_LEVELS.includes(level)) errors.push(`level doit valoir ${GOAL_LEVELS.join(" | ")}`);
  const titreErr = str(200)(input.titre, "titre");
  if (titreErr) errors.push(titreErr);
  if (input.statut !== undefined && !GOAL_STATUTS.includes(input.statut)) errors.push(`statut doit valoir ${GOAL_STATUTS.join(" | ")}`);
  if (input.spaces !== undefined) { const e = checkSpaces(input.spaces); if (e) errors.push(e); }
  if (errors.length) return { errors };

  const goal = { titre: input.titre.trim(), statut: input.statut || "En cours", spaces: input.spaces || [], krs: [] };
  if ((goals[level] || []).filter(o => !o.archived).length >= GOAL_MAX_PER_LEVEL) errors.push(`${GOAL_MAX_PER_LEVEL} objectifs actifs maximum au niveau ${level}`);
  if (input.parentId !== undefined) {
    const e = checkParent(goals, level, input.parentId);
    if (e) errors.push(e); else goal.parentId = input.parentId;
  }
  if (periodeTypeForLevel(level)) {
    const per = checkPeriode(level, input.periode ?? defaultPeriode(level));
    if (per.error) errors.push(per.error); else { goal.periode = per.periode; goal.dateCloture = per.dateCloture; }
  } else if (input.periode !== undefined) {
    errors.push("periode n'existe pas au niveau lt");
  }
  if (input.krs !== undefined) {
    const k = checkKrs(input.krs);
    if (k.error) errors.push(...[].concat(k.error)); else goal.krs = k.krs;
  }
  return errors.length ? { errors } : { level, goal: { id: makeId(), ...goal } };
}

/** Valide la modification d'un objectif existant (`found` = { level, goal }). */
export function validateGoalPatch(input, goals, found) {
  const ALLOWED = ["titre", "statut", "spaces", "periode", "parentId", "krs", "archived"];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: ["objet JSON attendu"] };
  const errors = Object.keys(input).filter(k => !ALLOWED.includes(k)).map(k => `champ inconnu : ${k}`);
  const patch = {};
  if (input.titre !== undefined) { const e = str(200)(input.titre, "titre"); if (e) errors.push(e); else patch.titre = input.titre.trim(); }
  if (input.statut !== undefined) { if (!GOAL_STATUTS.includes(input.statut)) errors.push(`statut doit valoir ${GOAL_STATUTS.join(" | ")}`); else patch.statut = input.statut; }
  if (input.spaces !== undefined) { const e = checkSpaces(input.spaces); if (e) errors.push(e); else patch.spaces = input.spaces; }
  if (input.archived !== undefined) { if (typeof input.archived !== "boolean") errors.push("archived doit être true ou false"); else patch.archived = input.archived; }
  if (input.parentId !== undefined) {
    if (input.parentId === null) patch.parentId = null;
    else { const e = checkParent(goals, found.level, input.parentId); if (e) errors.push(e); else patch.parentId = input.parentId; }
  }
  if (input.periode !== undefined) {
    const per = checkPeriode(found.level, input.periode);
    if (per.error) errors.push(per.error); else { patch.periode = per.periode; patch.dateCloture = per.dateCloture; }
  }
  if (input.krs !== undefined) {
    const k = checkKrs(input.krs);
    if (k.error) errors.push(...[].concat(k.error)); else patch.krs = k.krs;
  }
  if (!errors.length && !Object.keys(patch).length) errors.push("aucun champ à modifier");
  return errors.length ? { errors } : { patch };
}
