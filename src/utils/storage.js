// Persistance localStorage + sync Supabase débouncé.
// Extrait d'App.jsx. setSyncContext() branche l'utilisateur courant et le callback
// de statut, pour que setLS déclenche la synchro sans coupler le store à App.
import { syncToSupabase } from "../supabase";

let _userId = null;
let _syncTimer = null;
let _onSyncStatus = null;

// Branché depuis App quand la session Supabase change.
export const setSyncContext = (userId, onStatus) => {
  _userId = userId;
  _onSyncStatus = onStatus;
};

export const getLS = (k, d) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
};

// Une écriture locale attend d’être envoyée : tant que c’est vrai, on ne doit pas
// recharger le serveur par-dessus (sinon une suppression toute fraîche « revient »).
let _pending = false;
export const hasPendingSync = () => _pending;

const runSync = () => {
  clearTimeout(_syncTimer);
  _syncTimer = null;
  if (!_userId || !_pending) return Promise.resolve();
  _pending = false;
  return syncToSupabase(_userId)
    .then(() => { _onSyncStatus?.("ok"); setTimeout(() => _onSyncStatus?.(null), 2000); })
    .catch(() => { _pending = true; _onSyncStatus?.("error"); });
};

// Envoi immédiat (onglet caché, fermeture, rechargement) au lieu d’attendre 1,5 s.
export const flushSync = () => runSync();
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") runSync(); });
  window.addEventListener("pagehide", () => { runSync(); });
  window.addEventListener("beforeunload", () => { runSync(); });
}

export const setLS = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (_userId) {
    _onSyncStatus?.("saving");
    _pending = true;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(runSync, 1500);
  }
};
