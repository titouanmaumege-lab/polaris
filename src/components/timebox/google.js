// Google Agenda dans le navigateur (Google Identity Services, sans serveur).
// Lecture + modification des événements de tes calendriers (scope calendar.events),
// liste des calendriers (calendar.readonly), et calendrier « Polaris » créé par l'app
// (calendar.app.created). Le jeton d'accès (1 h) reste en sessionStorage, jamais en base.

export const GOOGLE_CLIENT_ID = "733243675724-pjas5tdbsknacslvot888c5fehg87etj.apps.googleusercontent.com";
const SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly " + SCOPE_EVENTS + " https://www.googleapis.com/auth/calendar.app.created";
const API = "https://www.googleapis.com/calendar/v3";
const PREF_KEY = "polaris_gcal_prefs";
const TOKEN_KEY = "polaris_gcal_token";

// Les 11 couleurs d'événement de Google (colorId), affichées dans la DA Polaris.
export const EVENT_COLORS = [
  { id: "11", hex: "#ff6b6b", name: "Tomate" },
  { id: "6", hex: "#ff8a4c", name: "Mandarine" },
  { id: "5", hex: "#ffc53d", name: "Banane" },
  { id: "2", hex: "#34d399", name: "Sauge" },
  { id: "10", hex: "#2ee59d", name: "Basilic" },
  { id: "7", hex: "#1fd5f0", name: "Paon" },
  { id: "9", hex: "#60a5fa", name: "Myrtille" },
  { id: "1", hex: "#8b9cff", name: "Lavande" },
  { id: "3", hex: "#b066ff", name: "Raisin" },
  { id: "4", hex: "#ff4fa3", name: "Flamant" },
  { id: "8", hex: "#9aa3b5", name: "Graphite" },
];
export const eventColor = id => EVENT_COLORS.find(c => c.id === String(id))?.hex || null;

let _gsi = null;
function loadGsi() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gsi) return _gsi;
  _gsi = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { _gsi = null; reject(new Error("Script Google bloqué ou hors ligne")); };
    document.head.appendChild(s);
  });
  return _gsi;
}

// ── Préférences (par navigateur) : connecté ?, droits, calendriers lus, couleurs, id du calendrier Polaris
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
export function setPrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPrefs(), ...p })); } catch {}
}
export const isLinked = () => !!getPrefs().linked;
// Vrai seulement si Google a accordé la modification des événements (connexion récente).
export const canEdit = () => !!getPrefs().canEdit;

// Le jeton (1 h) est gardé aussi en localStorage : il survit à la fermeture de l’onglet.
// Quand il expire, on en redemande un en silence (sans fenêtre) tant que Google reste connecté.
function getToken() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const t = JSON.parse(store.getItem(TOKEN_KEY));
      if (t && t.exp > Date.now() + 30000) return t.value;
    } catch {}
  }
  return null;
}
function saveToken(value, expiresInSec) {
  const v = JSON.stringify({ value, exp: Date.now() + expiresInSec * 1000 });
  try { sessionStorage.setItem(TOKEN_KEY, v); } catch {}
  try { localStorage.setItem(TOKEN_KEY, v); } catch {}
}
function dropToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch {}
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}
// Jeton valide, sinon renouvellement silencieux ; null si Google demande une vraie reconnexion.
let _silent = null;
export function ensureToken() {
  const t = getToken();
  if (t) return Promise.resolve(t);
  if (!isLinked()) return Promise.resolve(null);
  if (!_silent) {
    _silent = Promise.race([requestToken(false), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))])
      .catch(() => null)
      .finally(() => { _silent = null; });
  }
  return _silent;
}
export const hasToken = () => !!getToken();

// Demande un jeton. interactive=true : fenêtre Google (à appeler depuis un clic).
export async function requestToken(interactive) {
  const existing = getToken();
  if (existing) return existing;
  await loadGsi();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: r => {
        if (r.error || !r.access_token) return reject(new Error(r.error_description || r.error || "Connexion refusée"));
        saveToken(r.access_token, Number(r.expires_in) || 3600);
        setPrefs({ linked: true, canEdit: String(r.scope || "").includes(SCOPE_EVENTS) });
        resolve(r.access_token);
      },
      error_callback: e => reject(new Error(e?.type === "popup_closed" ? "Fenêtre fermée" : (e?.message || "Connexion impossible"))),
    });
    client.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}

export function disconnect() {
  const t = getToken();
  try { if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {}); } catch {}
  dropToken();
  try { localStorage.removeItem(PREF_KEY); } catch {}
}

async function api(path, { method = "GET", body } = {}) {
  const token = await ensureToken();
  if (!token) throw new Error("EXPIRED");
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { dropToken(); throw new Error("EXPIRED"); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw new Error("Droits insuffisants : déconnecte puis reconnecte Google pour autoriser la modification.");
  if (!r.ok) throw new Error(j?.error?.message || "Erreur Google " + r.status);
  return j;
}

export async function listCalendars() {
  const j = await api("/users/me/calendarList?minAccessRole=reader");
  return (j.items || []).map(c => ({
    id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, owner: c.accessRole === "owner",
    writable: c.accessRole === "owner" || c.accessRole === "writer", color: c.backgroundColor || "#7d7896",
  }));
}

// Calendrier « Polaris » : retrouvé par son id mémorisé, sinon créé.
export async function ensurePolarisCalendar() {
  const saved = getPrefs().polarisCalId;
  const cals = await listCalendars();
  if (saved && cals.some(c => c.id === saved)) return saved;
  const created = await api("/calendars", { method: "POST", body: { summary: "Polaris", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
  setPrefs({ polarisCalId: created.id });
  return created.id;
}

// ── Dates locales
const pad = n => String(n).padStart(2, "0");
export const localDS = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const minOf = d => d.getHours() * 60 + d.getMinutes();
const plusDay = (ds, n) => { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return localDS(d); };
const toISO = (ds, min) => { const d = new Date(ds + "T00:00:00"); d.setMinutes(min); return d.toISOString(); };
const TZ = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const URL_RE = /https?:\/\/[^\s<>"')]+/i;
function linkOf(e) {
  if (e.hangoutLink) return { url: e.hangoutLink, label: "Meet" };
  const url = e.source?.url || (e.location || "").match(URL_RE)?.[0] || (e.description || "").match(URL_RE)?.[0];
  if (!url) return null;
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
  const label = /zoom\./.test(host) ? "Zoom" : /meet\.google/.test(host) ? "Meet" : /teams\./.test(host) ? "Teams" : host.split(".").slice(-2, -1)[0] || "Lien";
  return { url, label: label.charAt(0).toUpperCase() + label.slice(1) };
}
const stripHtml = s => (s || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");

// Événements entre deux jours (inclus) dans les calendriers donnés.
// Un événement sur plusieurs jours donne un segment par jour. Minutes locales depuis minuit.
export async function fetchRange(fromDS, toDS, cals) {
  const timeMin = new Date(fromDS + "T00:00:00").toISOString();
  const timeMax = new Date(plusDay(toDS, 1) + "T00:00:00").toISOString();
  const polarisId = getPrefs().polarisCalId;
  const out = [];
  for (const cal of cals) {
    if (cal.id === polarisId) continue; // nos propres blocs : affichés par Polaris
    const j = await api(`/calendars/${encodeURIComponent(cal.id)}/events?singleEvents=true&orderBy=startTime&maxResults=500&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
    for (const e of j.items || []) {
      if (e.status === "cancelled") continue;
      const base = {
        id: e.id, calId: cal.id, writable: cal.writable, title: e.summary || "(sans titre)",
        colorId: e.colorId || null, color: eventColor(e.colorId) || cal.color,
        link: linkOf(e), loc: e.location || "", desc: stripHtml(e.description), source: e.source?.url || "",
        recurring: !!e.recurringEventId, htmlLink: e.htmlLink,
        reminder: e.reminders?.useDefault === false ? (e.reminders.overrides?.[0]?.minutes ?? -1) : "default",
      };
      if (!e.start?.dateTime) {
        // Journée entière : e.end.date est exclusif.
        const last = plusDay(e.end?.date || plusDay(e.start.date, 1), -1);
        const multi = last > e.start.date;
        for (let d = e.start.date; d <= last; d = plusDay(d, 1)) {
          if (d < fromDS || d > toDS) continue;
          out.push({ ...base, key: e.id + "@" + d, ds: d, allDay: true, start: 0, end: 0, multi, dateStart: e.start.date });
        }
        continue;
      }
      const s = new Date(e.start.dateTime), en = new Date(e.end.dateTime);
      const dsS = localDS(s), dsE = localDS(new Date(en.getTime() - 1));
      const multi = dsE > dsS;
      for (let d = dsS; d <= dsE; d = plusDay(d, 1)) {
        if (d < fromDS || d > toDS) continue;
        out.push({
          ...base, key: e.id + "@" + d, ds: d, allDay: false, multi,
          start: d === dsS ? minOf(s) : 0, end: d === dsE ? (minOf(en) || 24 * 60) : 24 * 60,
        });
      }
    }
  }
  return out;
}

// p : { title, ds, start, end, allDay, loc, desc, colorId, link, reminder, repeat }
function bodyOf(p, isNew) {
  const b = {};
  if ("title" in p) b.summary = p.title || "(sans titre)";
  if ("loc" in p) b.location = p.loc || "";
  if ("desc" in p) b.description = p.desc || "";
  if ("colorId" in p) b.colorId = p.colorId || null;
  if ("link" in p) b.source = p.link ? { title: "Lien", url: p.link } : null;
  if ("ds" in p) {
    if (p.allDay) { b.start = { date: p.ds }; b.end = { date: plusDay(p.dsEnd && p.dsEnd > p.ds ? p.dsEnd : p.ds, 1) }; }
    else { b.start = { dateTime: toISO(p.ds, p.start), timeZone: TZ() }; b.end = { dateTime: toISO(p.dsEnd || p.ds, p.end), timeZone: TZ() }; }
  }
  if ("reminder" in p) {
    if (p.reminder === "default") b.reminders = { useDefault: true };
    else if (p.reminder < 0) b.reminders = { useDefault: false, overrides: [] };
    else b.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: p.reminder }] };
  }
  if (isNew && p.repeat) b.recurrence = ["RRULE:FREQ=" + p.repeat];
  return b;
}
const evPath = (calId, id = "") => `/calendars/${encodeURIComponent(calId)}/events${id ? "/" + encodeURIComponent(id) : ""}`;
export const createEvent = (calId, p) => api(evPath(calId), { method: "POST", body: bodyOf(p, true) });
export const patchEvent = (calId, id, p) => api(evPath(calId, id), { method: "PATCH", body: bodyOf(p, false) });
export const deleteEvent = (calId, id) => api(evPath(calId, id), { method: "DELETE" });
// Ajoute une visio Google Meet à un événement existant.
export async function addMeet(calId, id) {
  const j = await api(evPath(calId, id) + "?conferenceDataVersion=1", {
    method: "PATCH",
    body: { conferenceData: { createRequest: { requestId: "polaris-" + Date.now(), conferenceSolutionKey: { type: "hangoutsMeet" } } } },
  });
  return j.hangoutLink || "";
}

// ── Blocs de tâches Polaris → calendrier « Polaris »
const eventBody = (todo) => ({
  summary: todo.name || "Tâche Polaris",
  start: { dateTime: toISO(todo.slotDate, todo.slotStart), timeZone: TZ() },
  end: { dateTime: toISO(todo.slotDate, todo.slotStart + todo.slotMin), timeZone: TZ() },
  description: "Bloc de travail posé depuis Polaris",
});

// Envoie les blocs vers le calendrier Polaris. Renvoie { [todoId]: eventId } et la liste des ids à oublier.
export async function pushBlocks(blocks, removed) {
  const calId = await ensurePolarisCalendar();
  const ids = {};
  for (const t of blocks) {
    if (t.slotEventId) {
      try {
        await api(`/calendars/${encodeURIComponent(calId)}/events/${t.slotEventId}`, { method: "PATCH", body: eventBody(t) });
        ids[t.id] = t.slotEventId;
        continue;
      } catch (e) { if (e.message === "EXPIRED") throw e; /* supprimé côté Google : on recrée */ }
    }
    const ev = await api(`/calendars/${encodeURIComponent(calId)}/events`, { method: "POST", body: eventBody(t) });
    ids[t.id] = ev.id;
  }
  const gone = [];
  for (const t of removed) {
    try { await api(`/calendars/${encodeURIComponent(calId)}/events/${t.slotEventId}`, { method: "DELETE" }); } catch (e) { if (e.message === "EXPIRED") throw e; }
    gone.push(t.id);
  }
  return { ids, gone };
}
