// Façade « click-to-load » pour contenus tiers (YouTube, Miro…).
// Aucune requête vers le tiers tant que l'utilisateur n'a pas cliqué :
// pas de cookie ni d'IP transmise sans action volontaire → pas de bandeau
// cookies nécessaire (doctrine CNIL). Voir docs/conformite/audit-phase1.md §5.
import { useState } from "react";
import { C } from "./tokens";

export default function LazyEmbed({ src, title, provider, allow, style }) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <iframe
        src={src} title={title || provider}
        style={{ width: "100%", height: "100%", border: "none", display: "block", ...style }}
        allow={allow} allowFullScreen
      />
    );
  }
  return (
    <div
      onClick={() => setLoaded(true)} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setLoaded(true); }}
      style={{
        width: "100%", height: "100%", minHeight: 140, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
        background: C.surface3, color: C.muted, padding: 16, textAlign: "center", userSelect: "none",
      }}
    >
      <span style={{ fontSize: 26 }}>▶</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Charger le contenu {provider}</span>
      <span style={{ fontSize: 10.5, lineHeight: 1.5, maxWidth: 340 }}>
        En cliquant, le contenu est chargé depuis {provider} : ton adresse IP lui est transmise et {provider} peut
        déposer des cookies. Aucune donnée n'est envoyée tant que tu ne cliques pas.
      </span>
    </div>
  );
}
