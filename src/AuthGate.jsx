import { useState, useEffect, useRef } from "react";
import { supabase, loadUserData, hydrateLocalStorage, syncToSupabase } from "./supabase";
import PolarisLogo from "./PolarisLogo";
import { LegalFooter } from "./components/legal/LegalPages";
import { loadConsents, storePendingConsents, clearPendingConsents } from "./state/consent";
import { purgeAppData, purgeLocalData } from "./state/account";

// Messages d'erreur auth en français, sans détail interne.
const frError = msg => {
  if (!msg) return "Une erreur est survenue. Réessaie.";
  if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (msg.includes("already registered"))        return "Un compte existe déjà avec cet email.";
  if (msg.includes("at least"))                  return "Mot de passe trop court (8 caractères minimum).";
  if (msg.includes("Email not confirmed"))       return "Confirme ton email avant de te connecter.";
  if (msg.includes("valid email"))               return "Adresse email invalide.";
  // Le serveur (GoTrue) limite toujours la cadence ; on affiche son refus
  // sans imposer de compte à rebours côté client.
  if (/rate limit|too many requests|only request this after/i.test(msg))
    return "Trop de tentatives. Patiente quelques instants.";
  if (/Signups not allowed|signup_disabled/i.test(msg))
    return "Les inscriptions sont désactivées sur ce projet.";
  if (/Error sending confirmation email|error sending/i.test(msg))
    return "L'email de confirmation n'a pas pu être envoyé (SMTP). Réessaie plus tard.";
  if (/Database error saving new user|unexpected_failure/i.test(msg))
    return "Création du compte impossible côté serveur. Contacte le support.";
  if (/pwned|compromis/i.test(msg))
    return "Mot de passe trop courant. Choisis-en un autre.";
  if (/Failed to fetch|NetworkError/i.test(msg))
    return "Serveur injoignable. Vérifie ta connexion.";
  return "Une erreur est survenue. Réessaie.";
};

const C = {
  bg: "#0d0d1a", surface: "#12112a", surface2: "#1a1830",
  border: "rgba(139,92,246,0.15)", borderMid: "rgba(139,92,246,0.4)",
  accent: "#8b5cf6", text: "#f1f0ff", muted: "#9391b5",
  green: "#10b981", red: "#ef4444",
};

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [migrating, setMigrating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [cguOk, setCguOk]       = useState(false);   // case 1 : CGU + politique (obligatoire)
  const [healthOk, setHealthOk] = useState(false);   // case 2 : bien-être art. 9 (optionnelle, découplée)
  const sessionRef = useRef(null);

  useEffect(() => {
    // `onAuthStateChange` émet déjà INITIAL_SESSION à l'abonnement : sans ce
    // garde, getSession + le listener déclenchent deux handleSession
    // concurrents (double loadUserData, double migration au 1er login).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (sessionRef.current?.user?.id === session.user.id) return;
        handleSession(session);
      } else if (!sessionRef.current) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionRef.current = session;
        setRecovery(true);
        setLoading(false);
        return;
      }
      if (session) {
        // Token refresh / focus : même utilisateur déjà chargé → ne PAS recharger
        // (sinon écran de chargement + remount → retour à la page d'accueil).
        if (sessionRef.current?.user?.id === session.user.id) {
          sessionRef.current = session;
          return;
        }
        handleSession(session);
      } else { sessionRef.current = null; setSession(null); setLoading(false); }
    });

    // Re-sync silencieux depuis Supabase au retour d'onglet (sans reload, on reste en place).
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionRef.current) {
        loadUserData(sessionRef.current.user.id).then(data => {
          if (data) hydrateLocalStorage(data);
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => { subscription.unsubscribe(); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  async function handleSession(session) {
    setLoading(true);
    setLoadError(false);
    sessionRef.current = session;
    try {
      // Machine partagée : si le localStorage appartient à un autre compte,
      // purge avant toute hydratation/synchro (sinon les données de A
      // seraient téléversées dans le compte de B).
      const lastUser = localStorage.getItem("lp_last_user");
      if (lastUser && lastUser !== session.user.id) purgeAppData();
      localStorage.setItem("lp_last_user", session.user.id);

      await loadConsents(session.user.id).catch(() => {});
      const data = await loadUserData(session.user.id);
      if (data) {
        hydrateLocalStorage(data);
      } else {
        setMigrating(true);
        await syncToSupabase(session.user.id);
        setMigrating(false);
      }
    } catch (e) {
      // Ne PAS ouvrir l'app sur un échec de chargement : le localStorage est
      // alors vide (ou celui d'un autre compte) et la première écriture
      // déclencherait un upsert qui écrase la ligne serveur. Cf. setLS().
      console.error("Load error:", e);
      setMigrating(false);
      setSession(null);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setSession(session);
    setLoading(false);
  }

  const retryLoad = () => { if (sessionRef.current) handleSession(sessionRef.current); };

  // Les espaces de collage/autofill font échouer l'auth silencieusement.
  const cleanEmail = () => email.trim().toLowerCase();

  // Aucun verrou côté client : le nombre de tentatives n'est plus bridé ici.
  // La limitation de cadence reste appliquée par Supabase, dont le refus est
  // simplement affiché. Le message brut part en console : sans trace, un
  // « une erreur est survenue » rend le diagnostic impossible.
  const applyAuthError = (message, status) => {
    console.error("[auth]", status ?? "", message);
    setError(frError(message));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError(""); setInfo("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(), password });
        if (error) applyAuthError(error.message, error.status);
        return;
      }

      if (!cguOk) { setError("Tu dois accepter les CGU et la politique de confidentialité."); return; }

      // Preuve d'accountability : horodatage capturé au moment du clic, écrit
      // AVANT signUp — si la confirmation d'email est désactivée, signUp ouvre
      // la session et handleSession lit le pending dans la foulée.
      storePendingConsents({ cgu: true, health: healthOk });
      const { data, error } = await supabase.auth.signUp({ email: cleanEmail(), password });
      if (error) {
        clearPendingConsents();
        applyAuthError(error.message, error.status);
        return;
      }
      // Email déjà inscrit : Supabase renvoie un succès avec `identities: []`
      // (anti-énumération). Message neutre, on ne garde pas le consentement.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        clearPendingConsents();
        setInfo("Si cette adresse est disponible, un lien de confirmation vient d'être envoyé.");
        setPassword(""); setCguOk(false); setHealthOk(false); setMode("login");
        return;
      }
      // Session immédiate (confirmation d'email désactivée) : handleSession a
      // déjà pris le relais, ne rien afficher de contradictoire.
      if (data?.session) return;
      setInfo("Vérifie ton email pour confirmer le compte.");
      setPassword(""); setCguOk(false); setHealthOk(false); setMode("login");
    } catch (e) {
      // Réseau coupé / CORS / clé anon absente : le SDK jette au lieu de
      // renvoyer { error }. Sans ce catch, la promesse partait dans le vide et
      // le formulaire restait muet.
      clearPendingConsents();
      applyAuthError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    if (busy) return;
    setError(""); setInfo("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(), {
        redirectTo: window.location.origin,
      });
      if (error) applyAuthError(error.message, error.status);
      else setInfo("Lien de réinitialisation envoyé. Vérifie ton email.");
    } catch (e) {
      applyAuthError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    if (busy) return;
    setError(""); setInfo("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setError(frError(error.message)); return; }
      setRecovery(false);
      setPassword("");
      setInfo("Mot de passe mis à jour. Connecte-toi.");
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  // Déconnexion : purge locale complète après signOut (données + session) —
  // rien ne doit rester lisible sur un poste partagé.
  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    purgeLocalData();
    window.location.replace("/");
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, color: C.muted, fontSize: 14 }}>
      {migrating ? "Migration des données en cours…" : "Chargement…"}
    </div>
  );

  if (recovery) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
      <div style={{ width: 360, padding: 32, background: C.surface, borderRadius: 16, border: `1px solid ${C.borderMid}` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><PolarisLogo size={72} /></div>
        <h2 style={{ color: C.text, fontSize: 24, fontWeight: 800, letterSpacing: "0.04em", marginBottom: 8, textAlign: "center" }}>POLARIS</h2>
        <p style={{ color: C.muted, fontSize: 13, textAlign: "center", marginBottom: 28 }}>Choisis un nouveau mot de passe</p>
        <form onSubmit={handleUpdatePassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password" placeholder="Nouveau mot de passe" value={password}
            onChange={e => setPassword(e.target.value)} required minLength={8}
            style={inputStyle}
          />
          {error && <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{error}</p>}
          <button type="submit" style={btnStyle}>Mettre à jour</button>
        </form>
      </div>
    </div>
  );

  // Chargement échoué : on garde la session ouverte mais on n'entre pas dans
  // l'app — sinon la synchro débouncée réécrirait un état local vide.
  if (loadError) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
      <div style={{ width: 360, padding: 32, background: C.surface, borderRadius: 16, border: `1px solid ${C.borderMid}`, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><PolarisLogo size={72} /></div>
        <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, letterSpacing: "0.04em", marginBottom: 10 }}>Connexion impossible</h2>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
          Tes données n'ont pas pu être chargées. Pour éviter toute perte, l'application reste fermée.
          Vérifie ta connexion puis réessaie.
        </p>
        <button onClick={retryLoad} style={{ ...btnStyle, width: "100%" }}>Réessayer</button>
        <p style={{ color: C.muted, fontSize: 12, marginTop: 16, cursor: "pointer" }} onClick={signOut}>Se déconnecter</p>
      </div>
    </div>
  );

  if (!session) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg }}>
      <div style={{ width: 360, padding: 32, background: C.surface, borderRadius: 16, border: `1px solid ${C.borderMid}` }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><PolarisLogo size={88} /></div>
        <h2 style={{ color: C.text, fontSize: 26, fontWeight: 800, letterSpacing: "0.05em", marginBottom: 8, textAlign: "center" }}>POLARIS</h2>
        <p style={{ color: C.muted, fontSize: 13, textAlign: "center", marginBottom: 28 }}>
          {mode === "login" ? "Connecte-toi" : mode === "signup" ? "Crée ton compte" : "Réinitialise ton mot de passe"}
        </p>
        <form onSubmit={mode === "reset" ? handleReset : handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={inputStyle}
          />
          {mode !== "reset" && (
            <input
              type="password" placeholder="Mot de passe" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={8}
              style={inputStyle}
            />
          )}
          {mode === "signup" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 2px" }}>
              {/* Case 1 — CGU + politique (obligatoire, non pré-cochée) */}
              <label style={checkRowStyle}>
                <input type="checkbox" checked={cguOk} onChange={e => setCguOk(e.target.checked)} style={checkboxStyle} />
                <span>
                  J'accepte les <a href="/cgu" target="_blank" rel="noreferrer" style={linkStyle}>CGU</a> et
                  j'ai pris connaissance de la <a href="/confidentialite" target="_blank" rel="noreferrer" style={linkStyle}>politique de confidentialité</a>. <span style={{ color: C.red }}>*</span>
                </span>
              </label>
              {/* Case 2 — consentement explicite art. 9 (optionnelle, découplée) */}
              <label style={checkRowStyle}>
                <input type="checkbox" checked={healthOk} onChange={e => setHealthOk(e.target.checked)} style={checkboxStyle} />
                <span>
                  Je consens expressément au traitement de mes <b style={{ color: C.text }}>données de bien-être</b> (niveaux
                  d'énergie, de concentration, de stress et de bonheur, bilans quotidiens) pour utiliser le journal
                  quotidien. Optionnel — retirable à tout moment dans les réglages.
                </span>
              </label>
            </div>
          )}
          {error && <p style={{ color: C.red, fontSize: 12, margin: 0 }}>{error}</p>}
          {info && <p style={{ color: C.green, fontSize: 12, margin: 0 }}>{info}</p>}
          {(() => {
            // Seuls la requête en vol et les CGU non cochées bloquent le bouton.
            const blocked = busy || (mode === "signup" && !cguOk);
            return (
              <button type="submit" disabled={blocked} style={{ ...btnStyle, opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}>
                {busy ? "…"
                  : mode === "login" ? "Se connecter"
                  : mode === "signup" ? "Créer le compte" : "Envoyer le lien"}
              </button>
            );
          })()}
        </form>
        {mode === "login" && (
          <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 16, cursor: "pointer" }}
            onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>
            Mot de passe oublié ?
          </p>
        )}
        <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: mode === "login" ? 8 : 16, cursor: "pointer" }}
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}>
          {mode === "login" ? "Pas de compte ? Créer un compte" : mode === "signup" ? "Déjà un compte ? Se connecter" : "Retour à la connexion"}
        </p>
      </div>
      <LegalFooter compact />
    </div>
  );

  return children({ session, signOut });
}

const inputStyle = {
  background: "#0d0d1a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 8,
  padding: "10px 14px", color: "#f1f0ff", fontSize: 14, outline: "none",
};
const btnStyle = {
  background: "linear-gradient(135deg, #8b5cf6, #6366f1)", border: "none",
  borderRadius: 8, padding: "11px 0", color: "#fff", fontSize: 14,
  fontWeight: 600, cursor: "pointer", marginTop: 4,
};
const checkRowStyle = {
  display: "flex", alignItems: "flex-start", gap: 9, fontSize: 11.5,
  lineHeight: 1.5, color: C.muted, cursor: "pointer", userSelect: "none",
};
const checkboxStyle = { marginTop: 2, accentColor: C.accent, flexShrink: 0, width: 14, height: 14, cursor: "pointer" };
const linkStyle = { color: C.accent, textDecoration: "underline" };
