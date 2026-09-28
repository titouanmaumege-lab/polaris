// Vercel Function — synchronisation bancaire via Enable Banking (DSP2).
// La clé privée de l'application ne doit jamais atteindre le navigateur :
// tout appel à Enable Banking passe par ici.
//
// Mode « restreint » gratuit : une application n'accède qu'aux comptes que son
// propriétaire a reliés dans le Control Panel Enable Banking. Chaque utilisateur
// enregistre donc SA propre application (identifiant + clé privée) depuis
// l'écran Banques ; la clé est chiffrée ici avant d'être stockée.
//
// Variables d'environnement attendues côté Vercel :
//   BANK_KEY_SECRET             — secret de chiffrement des clés utilisateurs
//                                 (32 octets aléatoires, base64). Obligatoire.
//   ENABLE_BANKING_APP_ID       — optionnel : application du propriétaire de l'app,
//   ENABLE_BANKING_PRIVATE_KEY    utilisée pour les comptes déjà reliés avec elle
//                                 (les retours à la ligne peuvent être écrits \n)
//   VITE_SUPABASE_URL           — déjà présente
//   VITE_SUPABASE_ANON_KEY      — déjà présente
//
// Les écritures Supabase se font avec le jeton de l'utilisateur : la RLS
// s'applique, la fonction ne peut rien toucher hors de ses propres lignes.
//
// Réf. https://enablebanking.com/docs/api/reference/

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { planRecurringMatches } from "../src/utils/recurrence.js";

const EB_URL = "https://api.enablebanking.com";
const CONSENT_DAYS = 180;          // la banque peut raccourcir, jamais rallonger
const FIRST_SYNC_DAYS = 90;        // historique récupéré à la première synchro
const OVERLAP_DAYS = 5;            // recouvrement : rattrape les opérations comptabilisées en retard

// ── JWT RS256 pour Enable Banking ─────────────────────────────────────────────
const b64url = buf => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function ebToken({ appId, key } = {}) {
  if (!appId || !key) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }));
  const claims = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key);
  return `${header}.${claims}.${b64url(sig)}`;
}

async function eb(creds, path, { method = "GET", body } = {}) {
  const r = await fetch(`${EB_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${ebToken(creds)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
  if (!r.ok) {
    const err = new Error(json?.message || json?.error || `enable_banking_${r.status}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

// ── Clés des utilisateurs : chiffrement AES-256-GCM ───────────────────────────
function secretKey() {
  const s = process.env.BANK_KEY_SECRET;
  return s ? crypto.createHash("sha256").update(s).digest() : null;
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}
function decrypt(b64) {
  const buf = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

const envCreds = () => {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const key = (process.env.ENABLE_BANKING_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return appId && key ? { appId, key } : null;
};

// Application à utiliser pour cet utilisateur : la sienne en priorité. Celle du
// propriétaire (variables Vercel) ne sert qu'aux comptes déjà reliés avec elle,
// sinon un nouvel utilisateur tomberait sur une application qui ne voit pas ses comptes.
async function resolveCreds(sb, user) {
  const { data: row } = await sb.from("finance_bank_credentials").select("app_id, key_enc").eq("user_id", user.id).maybeSingle();
  if (row && secretKey()) {
    try { return { appId: row.app_id, key: decrypt(row.key_enc), source: "own" }; }
    catch { return null; }                                  // secret changé : clé illisible, à ré-enregistrer
  }
  const env = envCreds();
  if (!env) return null;
  const { count } = await sb.from("finance_bank_links").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  return count ? { ...env, source: "server" } : null;
}

// ── Utilisateur Supabase ──────────────────────────────────────────────────────
async function userClient(token) {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return null;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { sb, user: data.user };
}

// ── Transactions : format Enable Banking → finance_transactions ───────────────
const isoDay = d => d.toISOString().slice(0, 10);

function externalId(t) {
  if (t.entry_reference) return `ref:${t.entry_reference}`;
  if (t.transaction_id)  return `id:${t.transaction_id}`;
  // Pas d'identifiant fourni par la banque : empreinte stable du contenu.
  const raw = [t.booking_date, t.value_date, t.transaction_amount?.amount, t.credit_debit_indicator, (t.remittance_information || []).join("|")].join("~");
  return `h:${crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

function toRow(t, userId, accountId) {
  const raw = Number(t.transaction_amount?.amount);
  if (!raw) return null;                                    // montant nul ou illisible
  const credit = t.credit_debit_indicator ? t.credit_debit_indicator === "CRDT" : raw > 0;
  const party = credit ? t.debtor?.name : t.creditor?.name;
  const label = (t.remittance_information || []).join(" ").replace(/\s+/g, " ").trim();
  const note = [party, label].filter(Boolean).join(" — ").slice(0, 500) || null;
  return {
    user_id: userId,
    account_id: accountId,
    type: credit ? "revenu" : "depense",
    amount: Math.round(Math.abs(raw) * 100) / 100,
    date: t.booking_date || t.value_date || t.transaction_date,
    note,
    bank_label: note,                                       // reste intact si l'utilisateur renomme
    source: "sync",
    external_id: externalId(t),
  };
}

async function fetchTransactions(creds, uid, dateFrom) {
  const all = [];
  let continuation = null;
  for (let page = 0; page < 50; page++) {                   // garde-fou contre une boucle infinie
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (continuation) qs.set("continuation_key", continuation);
    const j = await eb(creds, `/accounts/${encodeURIComponent(uid)}/transactions?${qs}`);
    all.push(...(j?.transactions || []));
    continuation = j?.continuation_key;
    if (!continuation) break;
  }
  return all;
}

// Opérations en attente : la banque les compte souvent déjà dans le solde, il
// faut donc les montrer. Mais leur identifiant change une fois comptabilisées :
// on les préfixe, on les efface et on les recrée à chaque synchro.
const PENDING_PREFIX = "pending:";
const isPending = t => t.status === "PDNG";

// Solde « de référence » renvoyé par la banque, dans l'ordre de préférence.
async function fetchBankBalance(creds, uid) {
  const j = await eb(creds, `/accounts/${encodeURIComponent(uid)}/balances`);
  const list = j?.balances || [];
  const pick = ["CLBD", "ITAV", "XPCD", "CLAV", "ITBD"].map(k => list.find(b => b.balance_type === k)).find(Boolean) || list[0];
  const n = Number(pick?.balance_amount?.amount);
  return Number.isFinite(n) ? n : null;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function actionBanks(creds, country) {
  const j = await eb(creds, `/aspsps?country=${encodeURIComponent(country || "FR")}&psu_type=personal`);
  return { banks: (j?.aspsps || []).map(a => ({ name: a.name, country: a.country })).sort((a, b) => a.name.localeCompare(b.name, "fr")) };
}

async function actionConnect(creds, { bank, country, redirectUrl, state }) {
  if (!bank || !redirectUrl || !state) throw Object.assign(new Error("bad_request"), { status: 400 });
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 864e5).toISOString();
  const j = await eb(creds, "/auth", {
    method: "POST",
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: bank, country: country || "FR" },
      state, redirect_url: redirectUrl, psu_type: "personal", language: "fr",
    },
  });
  return { url: j.url };
}

async function actionSession(creds, sb, user, { code }) {
  if (!code) throw Object.assign(new Error("bad_request"), { status: 400 });
  const s = await eb(creds, "/sessions", { method: "POST", body: { code } });

  const { data: link, error: e1 } = await sb.from("finance_bank_links").insert({
    user_id: user.id, session_id: s.session_id,
    aspsp_name: s.aspsp?.name || "Banque", aspsp_country: s.aspsp?.country || "FR",
    valid_until: s.access?.valid_until || null,
  }).select().single();
  if (e1) throw e1;

  const bankName = s.aspsp?.name || "Banque";
  const { data: existing, error: e0 } = await sb.from("finance_bank_accounts")
    .select("id, account_id, iban_last4, identification_hash, link_id, finance_bank_links(aspsp_name)")
    .eq("user_id", user.id);
  if (e0) throw e0;
  const rows = existing || [];
  const { count } = await sb.from("finance_accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id);

  let added = 0, kept = 0;
  const claimed = new Set();
  for (const [i, a] of (s.accounts || []).entries()) {
    const iban = a.account_id?.iban || "";
    const last4 = iban ? iban.slice(-4) : null;
    const hash = a.identification_hash || null;

    // Le uid change à chaque session : on reconnaît le compte par son empreinte
    // stable, ou à défaut (liaisons faites avant la migration 015) par la même
    // banque + les 4 derniers chiffres de l'IBAN.
    const prev =
      (hash && rows.find(r => !claimed.has(r.id) && r.identification_hash === hash)) ||
      (last4 && rows.find(r => !claimed.has(r.id) && !r.identification_hash && r.iban_last4 === last4 && r.finance_bank_links?.aspsp_name === bankName)) ||
      null;

    if (prev) {
      claimed.add(prev.id);
      const { error } = await sb.from("finance_bank_accounts")
        .update({ link_id: link.id, account_uid: a.uid, identification_hash: hash, iban_last4: last4 })
        .eq("id", prev.id);
      if (error) throw error;
      kept++;
      continue;
    }

    const name = `${bankName}${a.name ? ` · ${a.name}` : ""}${last4 ? ` ·${last4}` : ""}`.slice(0, 80);
    const { data: acc, error } = await sb.from("finance_accounts").insert({
      user_id: user.id, name, type: a.cash_account_type === "SVGS" ? "epargne" : "courant",
      nature: "liquidite", initial_balance: 0, currency: a.currency || "EUR", icon: "🏦",
      sort_order: (count || 0) + i,
    }).select().single();
    if (error) throw error;
    const { error: e2 } = await sb.from("finance_bank_accounts").insert({
      user_id: user.id, link_id: link.id, account_uid: a.uid, account_id: acc.id,
      iban_last4: last4, identification_hash: hash,
    });
    if (e2) throw e2;
    added++;
  }

  // Les anciennes connexions dont tous les comptes sont passés sur la nouvelle
  // ne servent plus : on révoque le consentement et on nettoie.
  const { data: links } = await sb.from("finance_bank_links")
    .select("id, session_id, finance_bank_accounts(id)")
    .eq("user_id", user.id).neq("id", link.id);
  for (const l of links || []) {
    if (l.finance_bank_accounts?.length) continue;
    await eb(creds, `/sessions/${encodeURIComponent(l.session_id)}`, { method: "DELETE" }).catch(() => {});
    await sb.from("finance_bank_links").delete().eq("id", l.id);
  }

  return { linked: added + kept, added, kept, returned: (s.accounts || []).length };
}

async function actionSync(creds, sb, user) {
  const { data: rows, error } = await sb.from("finance_bank_accounts")
    .select("id, account_uid, account_id, last_synced_at, ignore_before, finance_bank_links(aspsp_name, valid_until), finance_accounts!inner(archived)")
    .eq("user_id", user.id)
    .eq("finance_accounts.archived", false);             // compte archivé dans POLARIS : on n'y réimporte plus rien
  if (error) throw error;

  const results = [];
  for (const r of rows || []) {
    const bank = r.finance_bank_links?.aspsp_name || "Banque";
    const expired = r.finance_bank_links?.valid_until && new Date(r.finance_bank_links.valid_until) < new Date();
    if (expired) { results.push({ bank, accountId: r.account_id, error: "consent_expired" }); continue; }
    try {
      const since = r.last_synced_at
        ? new Date(new Date(r.last_synced_at).getTime() - OVERLAP_DAYS * 864e5)
        : new Date(Date.now() - FIRST_SYNC_DAYS * 864e5);
      const txs = await fetchTransactions(creds, r.account_uid, isoDay(since));

      let ignored = 0;
      const rowsOf = list => list.map(t => {
        const row = toRow(t, user.id, r.account_id);
        if (row && isPending(t)) row.external_id = PENDING_PREFIX + row.external_id;
        return row;
      }).filter(x => {
        if (!x || !x.date) return false;
        // Après une remise à zéro, les opérations antérieures sont déjà dans le solde.
        if (r.ignore_before && x.date < r.ignore_before) { ignored++; return false; }
        return true;
      });
      const booked  = rowsOf(txs.filter(t => !isPending(t)));
      const pending = rowsOf(txs.filter(isPending));

      // Les « en attente » de la synchro précédente sont remplacées. On garde
      // leur catégorie pour la reporter sur l'opération comptabilisée qui leur
      // correspond (même sens, même montant).
      const { data: oldPending } = await sb.from("finance_transactions")
        .select("type, amount, category_id")
        .eq("account_id", r.account_id).like("external_id", `${PENDING_PREFIX}%`);
      const carry = (oldPending || []).filter(p => p.category_id).map(p => ({ key: `${p.type}|${Number(p.amount)}`, cat: p.category_id }));
      const { error: eDel } = await sb.from("finance_transactions")
        .delete().eq("account_id", r.account_id).like("external_id", `${PENDING_PREFIX}%`);
      if (eDel) throw eDel;

      const giveCat = x => {
        const i = carry.findIndex(c => c.key === `${x.type}|${x.amount}`);
        if (i >= 0) { x.category_id = carry[i].cat; carry.splice(i, 1); }
        return x;
      };

      // Doublons dans une même réponse : Postgres refuserait tout le lot.
      const dedupe = list => [...new Map(list.map(x => [x.external_id, x])).values()];
      const insert = async (list, count) => {
        let n = 0;
        for (let i = 0; i < list.length; i += 500) {
          const up = rows => sb.from("finance_transactions")
            .upsert(rows, { onConflict: "account_id,external_id", ignoreDuplicates: true })
            .select("id");
          let { data, error: eIns } = await up(list.slice(i, i + 500));
          // Migration 019 pas encore appliquée : on importe sans le libellé d'origine
          // plutôt que de bloquer toute la synchro.
          if (eIns && /bank_label/.test(eIns.message || "")) {
            ({ data, error: eIns } = await up(list.slice(i, i + 500).map(({ bank_label, ...x }) => x)));
          }
          if (eIns) throw eIns;
          if (count) n += data?.length || 0;
        }
        return n;
      };
      const added = await insert(dedupe(booked).map(giveCat), true);
      await insert(dedupe(pending).map(giveCat), false);

      // Récurrences liées : rattache les opérations qui leur correspondent.
      let recognized = 0;
      const { data: recs } = await sb.from("finance_recurring")
        .select("id, account_id, type, amount, freq, interval, day_of_month, month_of_year, next_occurrence, active, match_key, category_id")
        .eq("account_id", r.account_id).eq("active", true).not("match_key", "is", null);
      if (recs?.length) {
        const { data: open } = await sb.from("finance_transactions")
          .select("id, account_id, type, amount, date, note, bank_label, category_id, recurring_id")
          .eq("account_id", r.account_id).is("recurring_id", null)
          .gte("date", isoDay(since)).not("external_id", "like", `${PENDING_PREFIX}%`);
        const plan = planRecurringMatches(recs, open || []);
        for (const u of plan.txUpdates) {
          const { error: eU } = await sb.from("finance_transactions").update(u.patch).eq("id", u.id);
          if (!eU) recognized++;
        }
        for (const u of plan.recUpdates) {
          await sb.from("finance_recurring").update({ next_occurrence: u.next_occurrence }).eq("id", u.id);
        }
      }

      // Le solde affiché = solde initial + mouvements. On recale le solde
      // initial pour que le total colle au solde réel donné par la banque.
      const bankBalance = await fetchBankBalance(creds, r.account_uid).catch(() => null);
      if (bankBalance !== null) {
        const { data: mv } = await sb.from("finance_transactions")
          .select("account_id, transfer_account_id, type, amount")
          .or(`account_id.eq.${r.account_id},transfer_account_id.eq.${r.account_id}`)
          .range(0, 49999);
        const delta = (mv || []).reduce((s, t) => {
          const a = Number(t.amount);
          if (t.type === "revenu")  return s + a;
          if (t.type === "depense") return s - a;
          if (t.type === "transfert") return t.account_id === r.account_id ? s - a : s + a;
          return s;
        }, 0);
        await sb.from("finance_accounts")
          .update({ initial_balance: Math.round((bankBalance - delta) * 100) / 100 })
          .eq("id", r.account_id);
      }

      await sb.from("finance_bank_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", r.id);
      // Diagnostic sans donnée personnelle : volumes et statuts seulement.
      const statuses = txs.reduce((m, t) => { const k = t.status || "?"; m[k] = (m[k] || 0) + 1; return m; }, {});
      console.log("bank sync", { since: isoDay(since), seen: txs.length, statuses, added, pending: pending.length, ignored, ignoreBefore: r.ignore_before });
      results.push({ bank, accountId: r.account_id, added, pending: pending.length, ignored, recognized, seen: txs.length, since: isoDay(since), latest: txs.map(t => t.booking_date || t.value_date || t.transaction_date).filter(Boolean).sort().pop() || null });
    } catch (e) {
      results.push({ bank, accountId: r.account_id, error: e.status === 401 || e.status === 403 ? "consent_expired" : e.message });
    }
  }
  return { results };
}

async function actionDisconnect(creds, sb, user, { linkId }) {
  const { data: link } = await sb.from("finance_bank_links").select("id, session_id").eq("id", linkId).eq("user_id", user.id).single();
  if (!link) throw Object.assign(new Error("not_found"), { status: 404 });
  // Révoque le consentement côté banque ; s'il a déjà expiré, on nettoie quand même.
  await eb(creds, `/sessions/${encodeURIComponent(link.session_id)}`, { method: "DELETE" }).catch(() => {});
  // Les comptes POLARIS et leurs transactions restent : seule la liaison part.
  const { error } = await sb.from("finance_bank_links").delete().eq("id", link.id);
  if (error) throw error;
  return { ok: true };
}

async function actionStatus(sb, user) {
  const creds = await resolveCreds(sb, user);
  const { data: row } = await sb.from("finance_bank_credentials").select("app_id, updated_at").eq("user_id", user.id).maybeSingle();
  return {
    ready: !!creds,
    source: creds?.source || null,
    appId: row?.app_id || null,
    savedAt: row?.updated_at || null,
    unreadable: !!row && !creds,                            // clé enregistrée mais indéchiffrable
  };
}

const APP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function actionSaveCredentials(sb, user, { appId, privateKey }) {
  appId = String(appId || "").trim();
  const key = String(privateKey || "").trim();
  if (!APP_ID_RE.test(appId)) throw Object.assign(new Error("invalid_app_id"), { status: 400 });
  if (key.length > 10_000) throw Object.assign(new Error("invalid_key"), { status: 400 });
  try {
    const k = crypto.createPrivateKey(key);
    if (k.asymmetricKeyType !== "rsa") throw new Error();
  } catch {
    throw Object.assign(new Error("invalid_key"), { status: 400 });
  }
  // Test réel auprès d'Enable Banking : un identifiant et une clé qui ne vont
  // pas ensemble doivent échouer ici, pas au moment de connecter la banque.
  try {
    await eb({ appId, key }, "/aspsps?country=FR&psu_type=personal");
  } catch (e) {
    throw Object.assign(new Error(e.status === 401 || e.status === 403 ? "credentials_rejected" : `enable_banking_${e.status || "down"}`), { status: 400 });
  }
  const { error } = await sb.from("finance_bank_credentials").upsert({
    user_id: user.id, app_id: appId, key_enc: encrypt(key), updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { ok: true };
}

// Date à partir de laquelle importer les opérations, choisie par l'utilisateur.
// Remet la fenêtre de synchro à zéro : la prochaine synchro relit l'historique
// (90 jours max) et n'importe que ce qui est daté du jour choisi ou après. Les
// doublons sont exclus par external_id, et le solde est recalé sur la banque.
async function actionImportFrom(sb, user, { date }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw Object.assign(new Error("bad_request"), { status: 400 });
  const { error } = await sb.from("finance_bank_accounts")
    .update({ ignore_before: date, last_synced_at: null })
    .eq("user_id", user.id);
  if (error) throw error;
  return { ok: true };
}

async function actionDeleteCredentials(sb, user) {
  const { error } = await sb.from("finance_bank_credentials").delete().eq("user_id", user.id);
  if (error) throw error;
  return { ok: true };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!secretKey()) return res.status(503).json({ error: "bank_not_configured" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const ctx = await userClient(token);
  if (!ctx) return res.status(401).json({ error: "unauthorized" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body.action !== "string") return res.status(400).json({ error: "bad_request" });

  try {
    switch (body.action) {
      case "status":             return res.status(200).json(await actionStatus(ctx.sb, ctx.user));
      case "save_credentials":   return res.status(200).json(await actionSaveCredentials(ctx.sb, ctx.user, body));
      case "delete_credentials": return res.status(200).json(await actionDeleteCredentials(ctx.sb, ctx.user));
      case "import_from":        return res.status(200).json(await actionImportFrom(ctx.sb, ctx.user, body));
    }
    const creds = await resolveCreds(ctx.sb, ctx.user);
    if (!creds) return res.status(412).json({ error: "bank_setup_required" });
    switch (body.action) {
      case "banks":      return res.status(200).json(await actionBanks(creds, body.country));
      case "connect":    return res.status(200).json(await actionConnect(creds, body));
      case "session":    return res.status(200).json(await actionSession(creds, ctx.sb, ctx.user, body));
      case "sync":       return res.status(200).json(await actionSync(creds, ctx.sb, ctx.user));
      case "disconnect": return res.status(200).json(await actionDisconnect(creds, ctx.sb, ctx.user, body));
      default:           return res.status(400).json({ error: "unknown_action" });
    }
  } catch (e) {
    console.error("bank", body.action, e);
    return res.status(e.status && e.status < 500 ? e.status : 502).json({ error: e.message || "bank_error" });
  }
}
