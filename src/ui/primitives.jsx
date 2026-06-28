// Primitives UI réutilisables. Extraites d'App.jsx (monolithe).
import { C, GRAD, TR, STATUTS, SPACES } from "./tokens";
import { clamp } from "../utils/math";

export function CircularProgress({ value, max, size = 52, strokeWidth = 4, color = C.accent }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const filled = max === 0 ? 0 : clamp(value / max, 0, 1);
  const offset = circ * (1 - filled);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-ring-track)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color }}>
        {value}/{max}
      </div>
    </div>
  );
}

export const Pill = ({ label, color }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "3px 10px",
    borderRadius: 999, fontSize: 11, fontWeight: 500, letterSpacing: "0.04em",
    background: color + "20", color, border: `1px solid ${color}35`,
  }}>{label}</span>
);
export const StatusPill = ({ statut }) => { const s = STATUTS[statut] || { c: C.muted, label: statut }; return <Pill label={s.label} color={s.c} />; };
export const SpacePill  = ({ space })  => { const sp = SPACES[space] || { c: C.muted, icon: "•" }; return <Pill label={`${sp.icon} ${space}`} color={sp.c} />; };

export const ProgressBar = ({ value, color, height = 6 }) => (
  <div style={{ height, background: "rgba(139,92,246,0.1)", borderRadius: height }}>
    <div style={{
      height: "100%", width: `${clamp(value, 0, 100)}%`,
      background: color ? `linear-gradient(90deg, ${color}99, ${color})` : GRAD,
      borderRadius: height, transition: "width 0.5s ease",
    }} />
  </div>
);

export const Select = ({ value, options, onChange, style }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{
    background: "var(--c-surface-2)", border: `1px solid var(--c-border)`, color: "var(--c-text)",
    padding: "8px 10px", borderRadius: 10, fontSize: 13, fontFamily: "inherit",
    outline: "none", cursor: "pointer", ...style,
  }}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

export const Input = ({ value, onChange, onKeyDown, placeholder, style, type = "text", autoFocus }) => (
  <input type={type} autoFocus={autoFocus}
    value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
    placeholder={placeholder}
    style={{
      background: "var(--c-surface-2)", border: `1px solid var(--c-border)`, color: "var(--c-text)",
      padding: "10px 14px", borderRadius: 12, fontSize: 14, fontFamily: "inherit",
      outline: "none", width: "100%", boxSizing: "border-box",
      minHeight: 44, transition: TR, ...style,
    }}
  />
);

export const Btn = ({ children, onClick, variant = "default", style, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: "10px 18px", borderRadius: 12, fontSize: 13, fontFamily: "inherit",
    fontWeight: 600, transition: TR, border: "none", minHeight: 44,
    opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
    ...(variant === "accent"
      ? { background: "var(--c-grad)", color: "#fff", boxShadow: "var(--c-glow-sm)" }
      : variant === "ghost"
      ? { background: "transparent", color: "var(--c-accent)", border: `1px solid var(--c-border-mid)` }
      : { background: "var(--c-surface-2)", color: "var(--c-text)", border: `1px solid var(--c-border)` }),
    ...style,
  }}>{children}</button>
);

export const Card = ({ children, style, onClick, className }) => (
  <div onClick={onClick} className={className} style={{
    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 18,
    padding: 16, ...(onClick ? { cursor: "pointer" } : {}), ...style,
  }}>{children}</div>
);

export function PageHeader({ title, onBack, action }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "rgba(13,13,26,0.95)", backdropFilter: "blur(20px)",
      borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {onBack && (
        <span onClick={onBack} style={{ cursor: "pointer", color: C.muted, fontSize: 22, lineHeight: 1 }}>←</span>
      )}
      <span style={{ fontSize: 17, fontWeight: 700, color: C.text, flex: 1 }}>{title}</span>
      {action}
    </div>
  );
}

// ─── Habitudes (toggle + chip) ────────────────────────────────────────────────
export function cycleHabitStatus(current) {
  if (current === null || current === undefined) return 'validated';
  if (current === 'validated') return 'invalidated';
  return null;
}

export function HabitToggle({ status, onToggle }) {
  const cfg = status === 'validated'
    ? { bg: '#10b981', border: '#10b981', icon: '✓', glow: '0 0 16px rgba(16,185,129,0.5)', cls: 'habit-pulse' }
    : status === 'invalidated'
    ? { bg: '#ef4444', border: '#ef4444', icon: '✕', glow: '0 0 16px rgba(239,68,68,0.5)', cls: 'habit-shake' }
    : { bg: 'transparent', border: 'rgba(139,92,246,0.4)', icon: null, glow: 'none', cls: '' };
  return (
    <button onClick={e=>{e.stopPropagation();onToggle();}} className={cfg.cls}
      style={{ width:36,height:36,borderRadius:'50%',background:cfg.bg,border:`2px solid ${cfg.border}`,boxShadow:cfg.glow,
        color:'#fff',fontWeight:700,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',
        transition:'all 0.25s cubic-bezier(0.4,0,0.2,1)',cursor:'pointer',flexShrink:0 }}>
      {cfg.icon}
    </button>
  );
}

export function HabitChip({ habit, status, onToggle, animating }) {
  const done = status === 'validated';
  const inv  = status === 'invalidated';
  return (
    <div onClick={onToggle} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "13px 14px", marginBottom: 8, borderRadius: 14,
      background: done ? "rgba(52,211,153,0.12)" : inv ? "rgba(251,113,133,0.10)" : "var(--c-surface-2)",
      border: `1px solid ${done ? "rgba(52,211,153,0.35)" : inv ? "rgba(251,113,133,0.30)" : "var(--c-border)"}`,
      boxShadow: "var(--c-item-shadow)",
      cursor: "pointer", transition: TR, minHeight: 52,
    }}>
      <span style={{ fontSize: 22, flexShrink: 0, opacity: done ? 0.5 : 1 }}>{habit.emoji}</span>
      <span style={{
        flex: 1, fontSize: 15, fontWeight: 500,
        color: done ? "var(--c-muted)" : inv ? "#ef4444" : "var(--c-text)",
        textDecoration: done ? "line-through" : "none",
        transition: TR,
      }}>{habit.name}</span>
      <div className={animating ? "habit-pop" : ""} style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: done ? "linear-gradient(135deg,#10b981,#059669)" : inv ? "#ef4444" : "transparent",
        border: `2px solid ${done ? "#10b981" : inv ? "#ef4444" : "var(--c-border-mid)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: done ? "0 0 12px rgba(16,185,129,0.4)" : inv ? "0 0 12px rgba(239,68,68,0.4)" : "none",
        transition: TR,
      }}>
        {done && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
        {inv  && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✕</span>}
      </div>
    </div>
  );
}
