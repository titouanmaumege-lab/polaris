// Consentements RGPD (table user_consents, migration 008).
// - CGU : requis à l'inscription (base contractuelle).
// - Bien-être (art. 9 RGPD) : consentement explicite, optionnel, retirable.
// Cache localStorage `lp_consents` pour lecture synchrone dans l'UI ;
// la base reste la source de vérité (rechargée à chaque session).
import { supabase } from "../supabase";

const LS_KEY = "lp_consents";
const LS_PENDING = "lp_pending_consents"; // consentements donnés au signup, avant la 1re session

let _cache = null;
try { _cache = JSON.parse(localStorage.getItem(LS_KEY)); } catch { _cache = null; }

const listeners = new Set();
export const onConsentChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach(fn => fn(_cache));

const setCache = row => {
  _cache = row;
  if (row) localStorage.setItem(LS_KEY, JSON.stringify(row));
  else localStorage.removeItem(LS_KEY);
  notify();
};

/** Lecture synchrone : consentement bien-être actif ? */
export const hasHealthConsent = () => Boolean(_cache?.health_consented);
export const getConsents = () => _cache;

/** Stocke les consentements cochés au signup (session pas encore ouverte). */
export const storePendingConsents = ({ cgu, health }) => {
  const now = new Date().toISOString();
  localStorage.setItem(LS_PENDING, JSON.stringify({
    cgu_accepted_at: cgu ? now : null,
    health_consented: Boolean(health),
    health_consent_at: health ? now : null,
  }));
};

/** À l'ouverture de session : charge la ligne, applique un éventuel pending signup. */
export async function loadConsents(userId) {
  if (!userId) { setCache(null); return null; }
  const { data, error } = await supabase
    .from("user_consents").select("*").eq("user_id", userId).maybeSingle();
  if (error) { console.error("loadConsents:", error); return _cache; }

  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(LS_PENDING)); } catch {}
  if (pending && !data) {
    // Premier login après signup : matérialise la preuve de consentement horodatée.
    const row = { user_id: userId, ...pending, updated_at: new Date().toISOString() };
    const { data: inserted, error: e2 } = await supabase
      .from("user_consents").upsert(row).select().single();
    localStorage.removeItem(LS_PENDING);
    if (e2) { console.error("consent upsert:", e2); return _cache; }
    setCache(inserted);
    return inserted;
  }
  if (pending) localStorage.removeItem(LS_PENDING);
  setCache(data ?? null);
  return data ?? null;
}

/** Donne ou retire le consentement bien-être (art. 7(3) : retrait à tout moment). */
export async function setHealthConsent(userId, granted) {
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    cgu_accepted_at: _cache?.cgu_accepted_at ?? null,
    health_consented: granted,
    ...(granted ? { health_consent_at: now } : { health_consent_withdrawn_at: now }),
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("user_consents").upsert(row).select().single();
  if (error) { console.error("setHealthConsent:", error); throw error; }
  setCache(data);
  return data;
}

export const clearConsentCache = () => setCache(null);
