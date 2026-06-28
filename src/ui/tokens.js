// Design tokens + constantes de statut/espace/objectif partagés.
// Extraits d'App.jsx (monolithe) — source unique pour tous les modules.

export const C = {
  bg: "#0d0d1a", surface: "#12112a", surface2: "#1a1830", surface3: "#201e38",
  border: "rgba(139,92,246,0.15)", borderMid: "rgba(139,92,246,0.4)",
  accent: "#8b5cf6", accent2: "#6366f1", accentBg: "rgba(139,92,246,0.12)",
  text: "#f1f0ff", muted: "#9391b5", faint: "#524f72",
  green: "#10b981", greenBg: "rgba(16,185,129,0.12)",
  red: "#ef4444", redBg: "rgba(239,68,68,0.12)",
  blue: "#6366f1", blueBg: "rgba(99,102,241,0.12)",
  purple: "#8b5cf6", purpleBg: "rgba(139,92,246,0.12)",
  amber: "#f59e0b", amberBg: "rgba(245,158,11,0.12)",
  orange: "#f97316", pink: "#f472b6",
};
export const GRAD = "linear-gradient(135deg, #8b5cf6, #6366f1)";
export const GLOW = "0 0 24px rgba(139,92,246,0.35)";
export const GLOW_SM = "0 0 12px rgba(139,92,246,0.2)";
export const TR = "0.18s cubic-bezier(0.4,0,0.2,1)";

export const SPACES = {
  "Sport & Santé": { c: C.green,  icon: "⚡" },
  "Business":      { c: C.blue,   icon: "💼" },
  "Etudes et Pro": { c: C.orange, icon: "📚" },
  "Relations":     { c: C.purple, icon: "🤝" },
};
export const STATUTS = {
  "Dans les blocs": { c: C.faint,  label: "À planifier" },
  "Pas commencé":   { c: C.faint,  label: "Pas commencé" },
  "En cours":       { c: C.blue,   label: "En cours" },
  "On-track":       { c: C.green,  label: "On track" },
  "On track":       { c: C.green,  label: "On track" },
  "Off-track":      { c: C.amber,  label: "Off track" },
  "Off track":      { c: C.amber,  label: "Off track" },
  "At-risk":        { c: C.orange, label: "At risk" },
  "At risk":        { c: C.orange, label: "At risk" },
  "Partiel":        { c: C.purple, label: "Partiel" },
  "Terminé":        { c: C.green,  label: "Terminé" },
  "Échoué":         { c: C.red,    label: "Échoué" },
  "Echoué":         { c: C.red,    label: "Échoué" },
  // Statuts objectifs (DA 2026)
  "Ça arrive":      { c: C.faint,  label: "Ça arrive" },
  "C'est chaud":    { c: C.purple, label: "C'est chaud" },
  "Atteint":        { c: C.green,  label: "Atteint" },
  "Abandonné":      { c: C.red,    label: "Abandonné" },
};
// Jeu de statuts pour les objectifs (toutes temporalités) — ordre + icône + couleur
export const OBJ_STATUSES = [
  { k: "Ça arrive",   c: C.faint,  icon: "💤" },
  { k: "En cours",    c: C.blue,   icon: "🚀" },
  { k: "C'est chaud", c: C.purple, icon: "🔥" },
  { k: "Atteint",     c: C.green,  icon: "🏆" },
  { k: "Échoué",      c: C.red,    icon: "💥" },
  { k: "Abandonné",   c: C.red,    icon: "🏳️" },
];
export const OBJ_CLOSED = ["Terminé", "Atteint", "Échoué", "Echoué", "Abandonné"];
export const isObjClosed   = s => OBJ_CLOSED.includes(s);
export const isObjAchieved = s => s === "Atteint" || s === "Terminé";
// Migration anciens statuts → nouveau jeu
export const STATUS_MIGRATE = {
  "Dans les blocs":"Ça arrive", "Pas commencé":"Ça arrive",
  "On-track":"En cours", "On track":"En cours", "Partiel":"En cours",
  "Off-track":"C'est chaud", "Off track":"C'est chaud", "At-risk":"C'est chaud", "At risk":"C'est chaud",
  "Terminé":"Atteint", "Echoué":"Échoué",
};
export const normObjStatus = s => OBJ_STATUSES.find(o => o.k === s) ? s : (STATUS_MIGRATE[s] || "Ça arrive");

export const LEVELS = [
  { id: "lt",          label: "Long Terme",   icon: "👁️", c: C.purple },
  { id: "annuel",      label: "Annuel",       icon: "🌌", c: C.blue },
  { id: "trimestriel", label: "Trimestriel",  icon: "🌍", c: C.green },
  { id: "mensuel",     label: "Mensuel",      icon: "🗻", c: C.amber },
];
export const LEVEL_PARENT = { annuel:"lt", trimestriel:"annuel", mensuel:"trimestriel" };
export const LEVEL_CHILD  = { lt:"annuel", annuel:"trimestriel", trimestriel:"mensuel" };
export const STATUS_OPTIONS_BASE = OBJ_STATUSES.map(s => s.k);

export const WP_EFFICIENCE = ["💡","💡💡","💡💡💡","💡💡💡💡","💡💡💡💡💡"];
export const WP_TYPE_C     = { DEEP: C.purple, SHALLOW: C.blue, COURS: C.amber, GROUPE: C.green };

export const DJ_ENERGY = ["⚡","⚡⚡","⚡⚡⚡","⚡⚡⚡⚡","⚡⚡⚡⚡⚡"];
export const DJ_FOCUS  = ["❖","❖❖","❖❖❖","❖❖❖❖","❖❖❖❖❖"];
export const DJ_STRESS = ["✶","✶✶","✶✶✶","✶✶✶✶","✶✶✶✶✶"];
export const DJ_HAPPY  = ["☺","☺☺","☺☺☺","☺☺☺☺","☺☺☺☺☺"];
export const ITEM_COLORS = ["#10b981","#ef4444","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316"];
