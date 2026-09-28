import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../supabase";
import { C, GRAD } from "../../ui/tokens";

// Synchronisation bancaire (Enable Banking). Tout appel à la banque passe par
// /api/bank : la clé privée de l'application reste côté serveur.
//
// Parcours : choisir la banque → redirection vers la banque → retour sur
// /bank-callback?code=…&state=… → création des comptes → première synchro.

export const BANK_CALLBACK_PATH = "/bank-callback";
const STATE_KEY = "lp_bank_state";

async function callBank(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const r = await fetch("/api/bank", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const ERR = {
  bank_not_configured: "La connexion bancaire n'est pas activée sur le serveur (variable BANK_KEY_SECRET manquante).",
  unauthorized: "Session expirée. Reconnecte-toi à POLARIS.",
  consent_expired: "Accès expiré, reconnecte la banque.",
  bank_setup_required: "Configure d'abord ton application Enable Banking (étapes ci-dessous).",
  invalid_app_id: "Identifiant d'application invalide. C'est le nom du fichier .pem, sans l'extension.",
  invalid_key: "Ce fichier n'est pas une clé privée valide. Dépose le fichier .pem téléchargé à la création de l'application.",
  credentials_rejected: "Enable Banking refuse cet identifiant avec cette clé. Vérifie que le fichier .pem correspond bien à cette application.",
};
const errText = m => ERR[m] || m;

const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtAgo = d => {
  if (!d) return "jamais";
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${fmtDate(d)}`;
};

export default function BankPanel({ userId, getAcc, onSynced }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);       // "sync" | "connect" | "callback" | linkId
  const [msg, setMsg] = useState(null);         // { kind: "ok" | "err", text }
  const [picking, setPicking] = useState(false);
  const [banks, setBanks] = useState(null);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [status, setStatus] = useState(null);   // { ready, source, appId, savedAt, unreadable }
  const [editCreds, setEditCreds] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const handled = useRef(false);

  const loadStatus = useCallback(async () => {
    try { setStatus(await callBank("status")); }
    catch (e) { setStatus({ ready: false, error: e.message }); }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("finance_bank_links")
      .select("id, aspsp_name, valid_until, created_at, finance_bank_accounts(id, account_id, iban_last4, last_synced_at, ignore_before)")
      .eq("user_id", userId).order("created_at");
    if (error) setMsg({ kind: "err", text: /finance_bank_links/.test(error.message) ? "Tables absentes : exécute la migration 013_bank_sync.sql dans Supabase." : error.message });
    setLinks(data || []);
    setLoading(false);
  }, [userId]);

  const sync = useCallback(async () => {
    setBusy("sync"); setMsg(null);
    try {
      const { results } = await callBank("sync");
      const sum = k => results.reduce((s, r) => s + (r[k] || 0), 0);
      const added = sum("added"), pending = sum("pending"), ignored = sum("ignored"), recognized = sum("recognized");
      const failed = results.filter(r => r.error);
      const pl = n => (n > 1 ? "s" : "");
      // On dit ce qui a été écarté et pourquoi : sinon un solde à jour à côté
      // d'une opération absente ressemble à un bug.
      const detail = [
        recognized && `${recognized} récurrence${pl(recognized)} reconnue${pl(recognized)}`,
        pending && `${pending} en attente chez la banque (affichée${pl(pending)}, remplacée${pl(pending)} une fois comptabilisée${pl(pending)})`,
        ignored && `${ignored} antérieure${pl(ignored)} à ta remise à zéro, ignorée${pl(ignored)}`,
      ].filter(Boolean).join(" · ");
      const head = added ? `${added} nouvelle${pl(added)} opération${pl(added)} importée${pl(added)}.` : "Aucune nouvelle opération comptabilisée.";
      // Ce que la banque a réellement renvoyé : distingue « rien reçu » de « reçu mais écarté ».
      const fmtD = d => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
      const seen = results.filter(r => !r.error).map(r => `${r.bank} : ${r.seen ?? 0} opération${pl(r.seen)} reçue${pl(r.seen)} depuis le ${fmtD(r.since)}${r.latest ? `, la plus récente du ${fmtD(r.latest)}` : ""}`).join(" · ");
      setMsg(failed.length
        ? { kind: "err", text: `${failed.map(f => `${f.bank} : ${errText(f.error)}`).join(" · ")}${added ? ` (${added} opérations importées ailleurs)` : ""}` }
        : { kind: "ok", text: [head, detail && `${detail}.`, seen && `(${seen})`].filter(Boolean).join(" ") });
      window.dispatchEvent(new Event("finance-data-changed"));
      onSynced?.();
    } catch (e) {
      setMsg({ kind: "err", text: errText(e.message) });
    }
    setBusy(null);
    load();
  }, [load, onSynced]);

  useEffect(() => { load(); }, [load]);

  // Retour de la banque : on échange le code contre une session, puis synchro.
  useEffect(() => {
    if (handled.current || window.location.pathname !== BANK_CALLBACK_PATH) return;
    handled.current = true;
    const p = new URLSearchParams(window.location.search);
    const code = p.get("code"), state = p.get("state"), err = p.get("error");
    const expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    window.history.replaceState(null, "", "/");
    if (err) { setMsg({ kind: "err", text: `La banque a refusé l'accès (${p.get("error_description") || err}).` }); return; }
    if (!code || !state || state !== expected) { setMsg({ kind: "err", text: "Retour de la banque invalide. Relance la connexion." }); return; }
    (async () => {
      setBusy("callback");
      try {
        const { added = 0, kept = 0, returned = 0 } = await callBank("session", { code });
        if (!returned) {
          setMsg({ kind: "err", text: "La banque n'a partagé aucun compte. Vérifie que tes comptes sont bien reliés dans le Control Panel Enable Banking, et coche-les tous lors de la validation chez ta banque." });
          setBusy(null); await load(); return;
        }
        const plural = n => (n > 1 ? "s" : "");
        setMsg({ kind: "ok", text: [
          added && `${added} nouveau${added > 1 ? "x" : ""} compte${plural(added)} ajouté${plural(added)}`,
          kept && `${kept} compte${plural(kept)} déjà relié${plural(kept)} mis à jour`,
        ].filter(Boolean).join(", ") + ". Import des opérations…" });
        await load();
        await sync();
      } catch (e) {
        setMsg({ kind: "err", text: errText(e.message) });
        setBusy(null);
      }
    })();
  }, [load, sync]);

  const openPicker = async () => {
    setPicking(true); setQ("");
    if (banks) return;
    try { setBanks((await callBank("banks", { country: "FR" })).banks); }
    catch (e) { setPicking(false); setMsg({ kind: "err", text: errText(e.message) }); }
  };

  const connect = async (bank) => {
    setBusy("connect"); setMsg(null);
    try {
      const state = crypto.randomUUID();
      sessionStorage.setItem(STATE_KEY, state);
      const { url } = await callBank("connect", { bank: bank.name, country: bank.country, state, redirectUrl: window.location.origin + BANK_CALLBACK_PATH });
      window.location.assign(url);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e.message) });
      setBusy(null);
    }
  };

  const disconnect = async (link) => {
    setBusy(link.id); setMsg(null);
    try {
      await callBank("disconnect", { linkId: link.id });
      setMsg({ kind: "ok", text: `${link.aspsp_name} déconnectée. Les comptes et opérations déjà importés sont conservés.` });
    } catch (e) {
      setMsg({ kind: "err", text: errText(e.message) });
    }
    setConfirmDel(null); setBusy(null);
    load();
  };

  const shown = (banks || []).filter(b => b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const hasAccounts = links.some(l => l.finance_bank_accounts?.length);

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}>Banques</h2>
        {status?.ready && hasAccounts && (
          <button onClick={sync} disabled={!!busy} style={btn(false, !!busy)}>
            {busy === "sync" || busy === "callback" ? "Synchronisation…" : "Synchroniser"}
          </button>
        )}
        {status?.ready && (
          <button onClick={openPicker} disabled={!!busy} style={btn(true, !!busy)}>Connecter une banque</button>
        )}
      </div>

      {status?.error && (
        <div role="alert" style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, background: C.red + "1A", color: C.red }}>{errText(status.error)}</div>
      )}
      {status && !status.error && (!status.ready || editCreds) && (
        <SetupGuide
          unreadable={status.unreadable}
          onCancel={status.ready ? () => setEditCreds(false) : null}
          onSaved={() => { setEditCreds(false); setMsg({ kind: "ok", text: "Application enregistrée et vérifiée. Tu peux connecter ta banque." }); loadStatus(); }}
        />
      )}
      {status?.ready && !editCreds && status.source === "own" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.muted, marginBottom: 14, flexWrap: "wrap" }}>
          <span>Ton application Enable Banking : <span style={{ fontFamily: "var(--font-display)", color: C.text }}>{status.appId?.slice(0, 8)}…</span></span>
          <button onClick={() => setEditCreds(true)} style={linkBtn}>Remplacer</button>
          <button onClick={async () => { await callBank("delete_credentials").catch(() => {}); loadStatus(); }} style={linkBtn}>Supprimer</button>
        </div>
      )}
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: "0 0 18px" }}>
        Les opérations comptabilisées sont importées sans catégorie. Le solde de chaque compte relié est recalé sur celui de la banque à chaque synchro.
      </p>

      {status?.ready && hasAccounts && (() => {
        // Date actuelle d'import : la plus ancienne borne des comptes reliés.
        const current = links.flatMap(l => l.finance_bank_accounts || []).map(a => a.ignore_before).filter(Boolean).sort()[0] || "";
        const value = fromDate || current;
        const apply = async () => {
          if (!value) return;
          setBusy("sync"); setMsg(null);
          try { await callBank("import_from", { date: value }); setFromDate(""); await sync(); }
          catch (e) { setMsg({ kind: "err", text: errText(e.message) }); setBusy(null); }
        };
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: C.muted, marginBottom: 18 }}>
            <label htmlFor="bank-from">Importer les opérations depuis le</label>
            <input id="bank-from" type="date" value={value} max={new Date().toISOString().slice(0, 10)} onChange={e => setFromDate(e.target.value)}
              style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", color: C.text, fontFamily: "inherit", fontSize: 13, colorScheme: "dark" }} />
            <button onClick={apply} disabled={!!busy || !value} style={btn(false, !!busy || !value, true)}>{value === current ? "Relancer l'import" : "Appliquer et synchroniser"}</button>
            {!current && <span style={{ fontSize: 12, color: C.faint }}>Actuellement : 90 derniers jours.</span>}
          </div>
        );
      })()}

      {msg && (
        <div role={msg.kind === "err" ? "alert" : "status"} style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, lineHeight: 1.5,
          background: (msg.kind === "err" ? C.red : C.green) + "1A", color: msg.kind === "err" ? C.red : C.green,
        }}>{msg.text}</div>
      )}

      {loading || !status?.ready ? null : links.length === 0 ? (
        <div style={{ padding: "28px 20px", borderRadius: 14, background: "rgba(255,255,255,0.025)", fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>
          Aucune banque connectée. Clique sur « Connecter une banque », choisis ta banque, puis valide l'accès sur son site.
          Tu reviens ici ensuite, et les 90 derniers jours d'opérations sont importés.
        </div>
      ) : links.map(l => {
        const expired = l.valid_until && new Date(l.valid_until) < new Date();
        const soon = !expired && l.valid_until && new Date(l.valid_until) - Date.now() < 14 * 864e5;
        return (
          <div key={l.id} style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.03)", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{l.aspsp_name}</span>
              <span style={{ fontSize: 12, color: expired ? C.red : soon ? C.amber : C.muted }}>
                {expired ? "Accès expiré" : `Accès jusqu'au ${fmtDate(l.valid_until)}`}
              </span>
            </div>
            {/* Un compte archivé ou supprimé dans POLARIS disparaît d'ici. */}
            {(l.finance_bank_accounts || []).filter(a => getAcc(a.account_id)).map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
                <span style={{ flex: 1, color: C.text }}>{getAcc(a.account_id).name}</span>
                <span style={{ color: C.faint, fontSize: 12 }}>Synchro {fmtAgo(a.last_synced_at)}</span>
              </div>
            ))}
            {!(l.finance_bank_accounts || []).some(a => getAcc(a.account_id)) && (
              <div style={{ padding: "6px 0", fontSize: 13, color: C.faint }}>Aucun compte actif pour cette banque.</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              {/* Nouvelle validation chez la banque : sert à renouveler l'accès
                  comme à partager un compte qui manquait. */}
              <button onClick={() => connect({ name: l.aspsp_name, country: "FR" })} disabled={!!busy} style={btn(expired, !!busy, true)}>
                {expired ? "Reconnecter" : "Ajouter des comptes"}
              </button>
              {confirmDel === l.id ? (<>
                <span style={{ fontSize: 12, color: C.muted, alignSelf: "center" }}>Révoquer l'accès ? Les opérations importées restent.</span>
                <button onClick={() => setConfirmDel(null)} style={btn(false, false, true)}>Annuler</button>
                <button onClick={() => disconnect(l)} disabled={busy === l.id} style={{ ...btn(false, busy === l.id, true), color: C.red }}>Déconnecter</button>
              </>) : (
                <button onClick={() => setConfirmDel(l.id)} disabled={!!busy} style={btn(false, !!busy, true)}>Déconnecter</button>
              )}
            </div>
          </div>
        );
      })}

      {picking && (
        <div onClick={() => setPicking(false)} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 18, padding: 22, width: "100%", maxWidth: 440, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,.6)" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Choisir la banque</span>
              <button onClick={() => setPicking(false)} aria-label="Fermer" style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", width: 36, height: 36 }}>✕</button>
            </div>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (Boursorama, BNP, Crédit Agricole…)"
              style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", color: C.text, fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            <div style={{ overflowY: "auto", flex: 1, minHeight: 120 }}>
              {!banks ? <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>Chargement des banques…</div>
                : shown.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>Aucune banque ne correspond.</div>
                : shown.map(b => (
                  <button key={b.name} onClick={() => connect(b)} disabled={busy === "connect"} style={{
                    display: "block", width: "100%", textAlign: "left", padding: "12px 12px", minHeight: 44, borderRadius: 9,
                    background: "none", border: "none", color: C.text, fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}>{b.name}</button>
                ))}
            </div>
            {busy === "connect" && <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Redirection vers la banque…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtn = { background: "none", border: "none", padding: "6px 4px", color: C.accent, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" };

// Valeur à recopier dans le formulaire Enable Banking, avec bouton Copier.
function CopyField({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* presse-papiers refusé */ }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
      <span style={{ fontSize: 12, color: C.muted, width: 128, flexShrink: 0 }}>{label}</span>
      <code style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: "7px 10px", borderRadius: 8, background: "rgba(255,255,255,0.05)", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</code>
      <button onClick={copy} style={{ ...btn(false, false, true), minWidth: 76 }}>{done ? "Copié" : "Copier"}</button>
    </div>
  );
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Assistant de première configuration : chaque utilisateur crée sa propre
// application Enable Banking (gratuite, limitée à ses comptes), puis dépose
// ici le fichier de clé. L'identifiant est lu dans le nom du fichier.
function SetupGuide({ onSaved, onCancel, unreadable }) {
  const origin = window.location.origin;
  const [appId, setAppId] = useState("");
  const [pem, setPem] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [over, setOver] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    setErr("");
    if (file.size > 10_000) { setErr(ERR.invalid_key); return; }
    const text = await file.text();
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) { setErr(ERR.invalid_key); return; }
    setPem(text); setFileName(file.name);
    const id = file.name.match(UUID_RE)?.[0];
    if (id) setAppId(id);
  };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await callBank("save_credentials", { appId: appId.trim(), privateKey: pem });
      setPem("");                                 // la clé ne reste pas en mémoire côté page
      onSaved();
    } catch (e) {
      setErr(errText(e.message));
    }
    setSaving(false);
  };

  const step = (n, title, children) => (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: n > 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: C.accentBg, color: C.accent }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(255,255,255,0.03)", marginBottom: 18 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Configurer ta connexion bancaire</div>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "0 0 6px" }}>
        {unreadable
          ? "Ta clé enregistrée n'est plus lisible (le serveur a changé de secret). Dépose à nouveau ton fichier .pem à l'étape 4."
          : "POLARIS passe par Enable Banking, un service agréé qui accède à tes comptes en lecture seule. C'est gratuit, et ton application ne voit que les comptes que tu relies toi-même. Compte 10 minutes, une seule fois."}
      </p>

      {step(1, "Crée ton compte Enable Banking", <>
        Sur <a href="https://enablebanking.com/" target="_blank" rel="noreferrer" style={{ color: C.accent }}>enablebanking.com</a>, crée un compte puis ouvre le Control Panel.
      </>)}

      {step(2, "Crée une application", <>
        Dans le Control Panel, section Applications, ajoute une application en environnement <b style={{ color: C.text }}>Production</b>, et remplis :
        <CopyField label="Nom" value="POLARIS" />
        <CopyField label="Redirect URL" value={`${origin}/bank-callback`} />
        <CopyField label="Privacy URL" value={`${origin}/confidentialite`} />
        <CopyField label="Terms URL" value={`${origin}/cgu`} />
        En validant, un fichier <b style={{ color: C.text }}>.pem</b> se télécharge : c'est ta clé privée, garde-le.
      </>)}

      {step(3, "Relie tes comptes bancaires", <>
        Toujours dans le Control Panel, ouvre ton application et relie tes comptes (choix de la banque, puis validation sur le site de ta banque).
        L'application apparaît ensuite « Restricted » et « Active » : c'est normal, c'est le mode gratuit.
      </>)}

      {step(4, "Dépose ta clé ici", <>
        <label
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); readFile(e.dataTransfer.files?.[0]); }}
          style={{ display: "block", padding: "16px", borderRadius: 10, textAlign: "center", cursor: "pointer", margin: "4px 0 10px",
            border: `1.5px dashed ${over ? C.accent : "rgba(255,255,255,0.15)"}`, background: over ? C.accentBg : "transparent", color: fileName ? C.text : C.muted }}>
          <input type="file" accept=".pem,application/x-pem-file,text/plain" onChange={e => readFile(e.target.files?.[0])} style={{ display: "none" }} />
          {fileName ? `Fichier chargé : ${fileName}` : "Glisse ton fichier .pem ici, ou clique pour le choisir"}
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, width: 128, flexShrink: 0 }}>ID de l'application</span>
          <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="Rempli depuis le nom du fichier"
            style={{ flex: 1, minWidth: 0, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontFamily: "var(--font-display)", fontSize: 12.5, outline: "none" }} />
        </div>
      </>)}

      {err && <div role="alert" style={{ fontSize: 13, color: C.red, margin: "4px 0 10px 38px", lineHeight: 1.5 }}>{err}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
        {onCancel && <button onClick={onCancel} style={btn(false, false)}>Annuler</button>}
        <button onClick={save} disabled={saving || !pem || !UUID_RE.test(appId)} style={btn(true, saving || !pem || !UUID_RE.test(appId))}>
          {saving ? "Vérification…" : "Enregistrer et vérifier"}
        </button>
      </div>
    </div>
  );
}

function btn(primary, disabled, small) {
  return {
    padding: small ? "7px 14px" : "10px 18px", minHeight: small ? 36 : 42, borderRadius: 10, border: "none",
    background: primary ? GRAD : "rgba(255,255,255,0.05)", color: primary ? "#fff" : C.text,
    fontSize: small ? 12.5 : 13.5, fontWeight: 600, fontFamily: "inherit",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap",
  };
}
