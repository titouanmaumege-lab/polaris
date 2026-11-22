import { useState } from "react";

// Banque de pictogrammes (traits, viewBox 48). Chaque entrée : [nom, éléments].
// Élément = chaîne (tracé) | { c: [cx, cy, r] } cercle | { r: [x, y, w, h, rx] } rectangle.
const B = {
  dumbbell: ["Haltère", ["M6 19v10M11 15v18M37 15v18M42 19v10M11 24h26"]],
  chart: ["Courbe de croissance", ["M8 40V28M18 40V20M28 40V24M38 40V10M30 10h8v8"]],
  book: ["Livre", ["M24 14c-4-3-10-3-16-2v24c6-1 12-1 16 2 4-3 10-3 16-2V12c-6-1-12-1-16 2zM24 14v24"]],
  cap: ["Études", ["M2 18L24 8l22 10-22 10zM12 23v10c6 5 18 5 24 0V23"]],
  eye: ["Œil", ["M4 24c6-10 14-14 20-14s14 4 20 14c-6 10-14 14-20 14S10 34 4 24z", { c: [24, 24, 6] }]],
  laptop: ["Ordinateur", [{ r: [9, 11, 30, 20, 2] }, "M4 37h40"]],
  heart: ["Cœur", ["M24 40S6 29 6 17a9 9 0 0 1 18-2 9 9 0 0 1 18 2c0 12-18 23-18 23z"]],
  flame: ["Flamme", ["M24 5c2 9 12 12 12 25a12 12 0 0 1-24 0c0-7 4-9 6-15 2 2 4 4 4 8 2-4 2-12 2-18z"]],
  bolt: ["Éclair", ["M26 4L10 26h12l-2 18 18-24H26z"]],
  target: ["Cible", [{ c: [24, 24, 18] }, { c: [24, 24, 10] }, { c: [24, 24, 2] }]],
  trophy: ["Trophée", ["M14 8h20v12a10 10 0 0 1-20 0zM14 12H6c0 8 3 10 8 10M34 12h8c0 8-3 10-8 10M24 30v8M16 42h16"]],
  home: ["Maison", ["M6 24L24 8l18 16M12 20v20h24V20"]],
  moon: ["Lune", ["M36 28A16 16 0 1 1 20 8a12 12 0 0 0 16 20z"]],
  sun: ["Soleil", [{ c: [24, 24, 8] }, "M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4"]],
  coffee: ["Café", ["M10 16h24v14a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8zM34 20h4a4 4 0 0 1 0 8h-4M16 6v4M24 6v4"]],
  food: ["Repas", ["M12 6v14a4 4 0 0 0 4 4v18M20 6v14a4 4 0 0 1-4 4M34 42V6c-6 4-6 14-6 18h6"]],
  car: ["Voiture", ["M6 30l4-10h28l4 10v8H6zM6 30h36M14 38v3M34 38v3"]],
  bike: ["Vélo", [{ c: [12, 32, 8] }, { c: [36, 32, 8] }, "M12 32l8-16h10l6 16M20 16l8 16"]],
  plane: ["Voyage", ["M4 28l40-20-10 34-10-12-8 6 2-10z"]],
  phone: ["Appel", [{ r: [12, 4, 24, 40, 3] }, "M22 38h4"]],
  music: ["Musique", ["M18 36V10l20-4v26", { c: [13, 36, 5] }, { c: [33, 32, 5] }]],
  coin: ["Argent", [{ c: [24, 24, 18] }, "M31 18a9 9 0 1 0 0 12M14 22h13M14 26h13"]],
  users: ["Personnes", [{ c: [17, 16, 6] }, "M5 40c0-8 5-12 12-12s12 4 12 12", { c: [33, 15, 5] }, "M36 28c5 1 8 5 8 12"]],
  health: ["Santé", ["M10 30L30 10a8 8 0 0 1 12 12L22 42a8 8 0 0 1-12-12zM20 20l12 12"]],
  star: ["Étoile Polaris", ["M24 4l4.5 15.5L44 24l-15.5 4.5L24 44l-4.5-15.5L4 24l15.5-4.5z"]],
};

export const PICTO_KEYS = Object.keys(B).filter(k => k !== "star");
export const pictoName = k => B[k]?.[0] || "";
// Pictogramme par défaut des catégories d’origine.
const DEFAULT = { business: "chart", master: "book", sport: "dumbbell", perso: "eye", pro: "laptop" };
export const pictoOf = (key, sphere) => (sphere && B[sphere.i] ? sphere.i : DEFAULT[key] || null);

export function Picto({ k, size = 24, fill = false, style }) {
  const items = B[k]?.[1];
  if (!items) return null;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}>
      {items.map((it, n) => typeof it === "string" ? <path key={n} d={it} /> : it.c ? <circle key={n} cx={it.c[0]} cy={it.c[1]} r={it.c[2]} /> : <rect key={n} x={it.r[0]} y={it.r[1]} width={it.r[2]} height={it.r[3]} rx={it.r[4]} />)}
    </svg>
  );
}

// Sélecteur : un bouton qui ouvre la grille de la banque.
export function PictoPicker({ value, onChange, color = "#b066ff", size = 30 }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(o => !o); }} title="Choisir un pictogramme" aria-label="Choisir un pictogramme"
        style={{ width: size, height: size, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color, cursor: "pointer", padding: 3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {value ? <Picto k={value} size={size - 8} /> : <span style={{ fontSize: 11, opacity: 0.6 }}>+</span>}
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", zIndex: 60, top: size + 4, left: 0, width: 232, padding: 8, borderRadius: 10, background: "#15112b", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 12px 32px rgba(0,0,0,0.5)", display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
          {PICTO_KEYS.map(k => (
            <button type="button" key={k} title={pictoName(k)} aria-label={pictoName(k)} onClick={() => { onChange(k); setOpen(false); }}
              style={{ aspectRatio: "1", borderRadius: 6, border: value === k ? `1.5px solid ${color}` : "1px solid transparent", background: value === k ? "rgba(255,255,255,0.1)" : "transparent", color: value === k ? color : "#d8d4f0", cursor: "pointer", padding: 4 }}>
              <Picto k={k} size={22} />
            </button>
          ))}
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ gridColumn: "1 / -1", marginTop: 2, fontSize: 11, color: "#9a95b8", background: "none", border: "none", cursor: "pointer" }}>Pictogramme par défaut</button>
        </div>
      )}
    </span>
  );
}
