import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

// Banque de base (traits, viewBox 48) : [nom, éléments].
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
const DEFAULT = { business: "chart", master: "book", sport: "dumbbell", perso: "eye", pro: "laptop" };

// ── Grande bibliothèque (Lucide, ~2100 icônes), chargée à la demande.
let LIB = null, libP = null;
const subs = new Set();
const loadLib = () => {
  if (LIB) return Promise.resolve(LIB);
  if (!libP) libP = import("./pictos-data.json").then(m => { LIB = m.default || m; subs.forEach(f => f()); return LIB; });
  return libP;
};
function useLib() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force(n => n + 1);
    subs.add(f);
    loadLib();
    return () => subs.delete(f);
  }, []);
  return LIB;
}
const isL = k => typeof k === "string" && k.startsWith("l:");

export const pictoName = k => (isL(k) ? k.slice(2) : B[k]?.[0] || "");
export const pictoOf = (key, sphere) => (sphere && sphere.i && (B[sphere.i] || isL(sphere.i)) ? sphere.i : DEFAULT[key] || null);

export function Picto({ k, size = 24, fill = false, style }) {
  const lib = isL(k) ? useLib() : null; // eslint-disable-line react-hooks/rules-of-hooks
  if (isL(k)) {
    const inner = lib?.[k.slice(2)]?.[0];
    if (!inner) return <span style={{ display: "inline-block", width: size, height: size, ...style }} />;
    return <svg viewBox="0 0 24 24" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style} dangerouslySetInnerHTML={{ __html: inner }} />;
  }
  const items = B[k]?.[1];
  if (!items) return null;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={style}>
      {items.map((it, n) => typeof it === "string" ? <path key={n} d={it} /> : it.c ? <circle key={n} cx={it.c[0]} cy={it.c[1]} r={it.c[2]} /> : <rect key={n} x={it.r[0]} y={it.r[1]} width={it.r[2]} height={it.r[3]} rx={it.r[4]} />)}
    </svg>
  );
}

// Mots français → anglais (la bibliothèque est en anglais).
const FR = {
  sport: "sport dumbbell fitness gym run", muscu: "dumbbell weight gym", course: "run footprints timer", courir: "run footprints",
  velo: "bike bicycle", vélo: "bike bicycle", nager: "waves swim", natation: "waves swim", marche: "footprints walk", rando: "mountain footprints",
  montagne: "mountain", plage: "umbrella waves sun", soleil: "sun", lune: "moon", nuit: "moon", dormir: "bed moon", sommeil: "bed moon", lit: "bed",
  repas: "utensils soup", manger: "utensils apple", cuisine: "chef-hat utensils", nourriture: "apple pizza utensils", boire: "cup-soda coffee glass-water", eau: "droplet glass-water",
  cafe: "coffee", café: "coffee", the: "coffee", thé: "coffee", biere: "beer", bière: "beer", vin: "wine",
  travail: "briefcase laptop", bureau: "briefcase building", ordinateur: "laptop monitor", code: "code terminal", email: "mail", mail: "mail", message: "message-circle mail",
  appel: "phone", telephone: "phone smartphone", téléphone: "phone smartphone", reunion: "users presentation", réunion: "users presentation",
  argent: "coin wallet banknote euro", euro: "euro", business: "briefcase chart trending-up", vente: "shopping-cart tag", client: "users handshake", clients: "users handshake",
  etude: "graduation-cap book", étude: "graduation-cap book", etudes: "graduation-cap book", études: "graduation-cap book", cours: "book-open graduation-cap", livre: "book", lire: "book-open", lecture: "book-open", ecrire: "pen pencil", écrire: "pen pencil",
  maison: "house", menage: "brush-cleaning spray-can", ménage: "brush-cleaning spray-can", courses: "shopping-cart shopping-basket", voiture: "car", route: "route car", voyage: "plane luggage", avion: "plane", train: "train",
  famille: "users baby heart", amis: "users party-popper", ami: "users", copine: "heart", amour: "heart", fete: "party-popper", fête: "party-popper", soiree: "party-popper wine", soirée: "party-popper wine",
  sante: "heart-pulse stethoscope", santé: "heart-pulse stethoscope", medecin: "stethoscope", médecin: "stethoscope", kine: "hand-heart bandage", kiné: "hand-heart bandage", recuperation: "bed heart-pulse", récupération: "bed heart-pulse",
  idee: "lightbulb", idée: "lightbulb", cible: "target", objectif: "target flag", but: "target flag", trophee: "trophy medal", trophée: "trophy medal", victoire: "trophy medal", competition: "trophy medal", compétition: "trophy medal",
  temps: "clock timer hourglass", heure: "clock", calendrier: "calendar", rappel: "bell", alarme: "alarm-clock", reveil: "alarm-clock", réveil: "alarm-clock",
  musique: "music headphones", film: "film clapperboard", video: "video camera", vidéo: "video camera", photo: "camera image", jeu: "gamepad-2 dices", jeux: "gamepad-2 dices", animal: "paw-print dog cat", chien: "dog", chat: "cat",
  meteo: "cloud-sun", météo: "cloud-sun", pluie: "cloud-rain", neige: "snowflake", feu: "flame", energie: "zap battery", énergie: "zap battery", eclair: "zap", éclair: "zap",
  meditation: "brain flower", méditation: "brain flower", cerveau: "brain", esprit: "brain eye", vision: "eye telescope", reflexion: "brain lightbulb", réflexion: "brain lightbulb", priere: "hand-heart", prière: "hand-heart",
  rugby: "trophy dumbbell footprints", foot: "trophy footprints", tennis: "trophy", boxe: "swords dumbbell", yoga: "flower person-standing", etirement: "person-standing", étirement: "person-standing",
  idees: "lightbulb", idées: "lightbulb", note: "notebook-pen sticky-note", notes: "notebook-pen sticky-note", liste: "list-checks", tache: "square-check list-checks", tâche: "square-check list-checks",
  rendez: "calendar users", rdv: "calendar users", trajet: "car route", telephone2: "phone",
};
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const FRN = Object.fromEntries(Object.entries(FR).map(([k, v]) => [norm(k), v]));

const STEP = 120;

function PictoModal({ value, onChange, onClose, color }) {
  const lib = useLib();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(STEP);

  useEffect(() => {
    const kd = e => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", kd, true);
    return () => window.removeEventListener("keydown", kd, true);
  }, [onClose]);
  useEffect(() => setShown(STEP), [q]);

  const base = useMemo(() => PICTO_KEYS.map(k => ({ k, name: B[k][0], hay: norm(B[k][0] + " " + k) })), []);
  const all = useMemo(() => (lib ? Object.keys(lib).map(n => ({ k: "l:" + n, name: n, hay: n + " " + lib[n][1] })) : []), [lib]);

  const results = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [...base, ...all];
    const exp = terms.map(t => t + " " + (FRN[t] || ""));
    const ok = it => exp.every(e => e.split(" ").some(w => w && it.hay.includes(w)) || it.hay.includes(e.trim()));
    return [...base, ...all].filter(ok);
  }, [q, base, all]);

  const pick = k => { onChange(k); onClose(); };

  return createPortal(
    <div onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(5,3,15,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Choisir un pictogramme"
        style={{ width: "min(640px, 100%)", maxHeight: "min(640px, 88vh)", display: "flex", flexDirection: "column", borderRadius: 16, background: "#15112b", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", color: "#e8e4ff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 10px" }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (sport, café, argent, voiture, cerveau…)"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "inherit", fontSize: 14, outline: "none" }} />
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: "#9a95b8", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "0 14px 8px", fontSize: 11, color: "#9a95b8", display: "flex", justifyContent: "space-between" }}>
          <span>{lib ? `${results.length} pictogramme${results.length > 1 ? "s" : ""}` : "Chargement de la bibliothèque…"}</span>
          <button type="button" onClick={() => pick("")} style={{ background: "none", border: "none", color: "#b9b3e0", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>Pictogramme par défaut</button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 14px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 6, alignContent: "start" }}>
          {results.slice(0, shown).map(it => (
            <button type="button" key={it.k} title={it.name} aria-label={it.name} onClick={() => pick(it.k)}
              style={{ aspectRatio: "1", borderRadius: 10, border: value === it.k ? `1.5px solid ${color}` : "1px solid rgba(255,255,255,0.06)", background: value === it.k ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)", color: value === it.k ? color : "#d8d4f0", cursor: "pointer", padding: 10 }}>
              <Picto k={it.k} size={28} style={{ width: "100%", height: "100%" }} />
            </button>
          ))}
          {!results.length && lib && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#9a95b8", fontSize: 13, padding: 24 }}>Rien trouvé. Essaie un mot plus simple (ou en anglais).</div>}
          {results.length > shown && (
            <button type="button" onClick={() => setShown(s => s + STEP * 3)} style={{ gridColumn: "1 / -1", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "none", color: "#d8d4f0", cursor: "pointer", fontSize: 13 }}>
              Afficher plus ({results.length - shown} restants)
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Bouton qui ouvre la fenêtre centrée de choix.
export function PictoPicker({ value, onChange, color = "#b066ff", size = 30 }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ display: "inline-flex", flexShrink: 0 }}>
      <button type="button" onClick={e => { e.stopPropagation(); setOpen(true); }} title="Choisir un pictogramme" aria-label="Choisir un pictogramme"
        style={{ width: size, height: size, borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color, cursor: "pointer", padding: 3, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {value ? <Picto k={value} size={size - 8} /> : <span style={{ fontSize: 11, opacity: 0.6 }}>+</span>}
      </button>
      {open && <PictoModal value={value} onChange={onChange} onClose={() => setOpen(false)} color={color} />}
    </span>
  );
}
