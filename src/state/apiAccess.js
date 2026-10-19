// Accès API externe (assistant IA) — migration 023.
// Clés : générées ici, seul leur hash SHA-256 part en base. La clé en clair
// n'est montrée qu'une fois à l'utilisateur.
// Opérations : les routes /api/v1 n'écrivent jamais dans user_data, elles
// empilent dans api_ops ; l'app les réserve (RPC atomique) puis les applique
// avec la logique normale des tâches, ce qui déclenche la sauvegarde habituelle.
import { supabase, whenHydrated } from "../supabase";

const KEY_PREFIX = "pol_";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return KEY_PREFIX + b64;
}

export async function listApiKeys() {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Crée une clé et renvoie { key, row } — `key` en clair, à afficher une seule fois. */
export async function createApiKey(userId, name) {
  const key = randomKey();
  const key_hash = await sha256Hex(key);
  const { data, error } = await supabase
    .from("api_keys")
    .insert({ user_id: userId, name: (name || "Clé API").slice(0, 60), key_hash })
    .select("id, name, created_at, last_used_at, revoked_at")
    .single();
  if (error) throw error;
  return { key, row: data };
}

export async function revokeApiKey(id) {
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw error;
}

// Une seule relève à la fois sur cet onglet.
let _pulling = null;

/**
 * Réserve les opérations en attente et les passe à `apply(ops)`.
 * La réservation (claim_api_ops) est un UPDATE … WHERE applied_at IS NULL
 * RETURNING * : un second appareil ne récupère pas les mêmes lignes.
 */
export function pullApiOps(apply) {
  if (_pulling) return _pulling;
  _pulling = (async () => {
    await whenHydrated();
    const { data, error } = await supabase.rpc("claim_api_ops");
    if (error) {
      // Migration 023 pas encore appliquée : silencieux, l'app fonctionne sans.
      if (!/claim_api_ops|does not exist|schema cache/i.test(error.message || "")) console.error("claim_api_ops:", error);
      return 0;
    }
    const ops = (data || []).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    if (ops.length) await apply(ops);
    return ops.length;
  })().finally(() => { _pulling = null; });
  return _pulling;
}
