// Google Agenda dans le navigateur (Google Identity Services, sans serveur).
// Lecture : les événements des calendriers cochés. Écriture : seulement le
// calendrier « Polaris », créé par l'app (scope calendar.app.created).
// Le jeton d'accès (1 h) reste en mémoire et en sessionStorage, jamais en base.

export const GOOGLE_CLIENT_ID = "733243675724-pjas5tdbsknacslvot888c5fehg87etj.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created";
const API = "https://www.googleapis.com/calendar/v3";
const PREF_KEY = "polaris_gcal_prefs";
const TOKEN_KEY = "polaris_gcal_token";

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

// ── Préférences (par navigateur) : connecté ?, calendriers lus, id du calendrier Polaris
export function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
export function setPrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...getPrefs(), ...p })); } catch {}
}
export const isLinked = () => !!getPrefs().linked;

function getToken() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (t && t.exp > Date.now() + 30000) return t.value;
  } catch {}
  return null;
}
function saveToken(value, expiresInSec) {
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ value, exp: Date.now() + expiresInSec * 1000 })); } catch {}
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
        setPrefs({ linked: true });
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
  try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PREF_KEY); } catch {}
}

async function api(path, { method = "GET", body } = {}) {
  const token = getToken();
  if (!token) throw new Error("EXPIRED");
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} throw new Error("EXPIRED"); }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || "Erreur Google " + r.status);
  return j;
}

export async function listCalendars() {
  const j = await api("/users/me/calendarList?minAccessRole=reader");
  return (j.items || []).map(c => ({ id: c.id, name: c.summaryOverride || c.summary, primary: !!c.primary, owner: c.accessRole === "owner", color: c.backgroundColor }));
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

const dayBounds = ds => {
  const a = new Date(ds + "T00:00:00"), b = new Date(ds + "T23:59:59");
  return [a.toISOString(), b.toISOString()];
};
const localDS = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const minOf = d => d.getHours() * 60 + d.getMinutes();

// Événements d'un jour dans les calendriers cochés → [{id,title,start,end,allDay}] en minutes.
export async function fetchDayEvents(ds, calIds) {
  const [tMin, tMax] = dayBounds(ds);
  const polarisId = getPrefs().polarisCalId;
  const out = [];
  for (const id of calIds) {
    if (id === polarisId) continue; // nos propres blocs : affichés par Polaris
    const j = await api(`/calendars/${encodeURIComponent(id)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`);
    for (const e of j.items || []) {
      if (e.status === "cancelled") continue;
      if (!e.start?.dateTime) { out.push({ id: e.id, title: e.summary || "(sans titre)", allDay: true, start: 0, end: 0 }); continue; }
      const s = new Date(e.start.dateTime), en = new Date(e.end.dateTime);
      const start = localDS(s) < ds ? 0 : minOf(s);
      const end = localDS(en) > ds ? 24 * 60 : (minOf(en) || 24 * 60);
      out.push({ id: e.id, title: e.summary || "(sans titre)", allDay: false, start, end });
    }
  }
  return out;
}

const toISO = (ds, min) => {
  const d = new Date(ds + "T00:00:00");
  d.setMinutes(min);
  return d.toISOString();
};
const eventBody = (todo) => ({
  summary: todo.name || "Tâche Polaris",
  start: { dateTime: toISO(todo.slotDate, todo.slotStart), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  end: { dateTime: toISO(todo.slotDate, todo.slotStart + todo.slotMin), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  description: "Bloc de travail posé depuis Polaris",
});

// Envoie les blocs du jour vers le calendrier Polaris. Renvoie { [todoId]: eventId } et la liste des ids à oublier.
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
