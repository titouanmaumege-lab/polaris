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

export const setLS = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (_userId) {
    _onSyncStatus?.("saving");
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
      syncToSupabase(_userId)
        .then(() => { _onSyncStatus?.("ok"); setTimeout(() => _onSyncStatus?.(null), 2000); })
        .catch(() => { _onSyncStatus?.("error"); });
    }, 1500);
  }
};
