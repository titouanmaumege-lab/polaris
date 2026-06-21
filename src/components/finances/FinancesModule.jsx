import { useState, useMemo, useEffect } from "react";
import { useFinanceAccounts } from "./hooks/useFinanceAccounts";
import { useFinanceCategories } from "./hooks/useFinanceCategories";
import { useFinanceTransactions } from "./hooks/useFinanceTransactions";
import { useFinanceBudgets } from "./hooks/useFinanceBudgets";
import { useFinanceGoals } from "./hooks/useFinanceGoals";
import { useFinanceRecurring, recurrenceLabel } from "./hooks/useFinanceRecurring";

// ─── Design tokens — DA HOME « Cyber Focus » (.theme-light), repris d'App.jsx ──
const C = {
  bg: "#0B0714", surface: "#181225", surface2: "#181225", surface3: "#221A36",
  border: "rgba(168,85,247,0.18)", borderMid: "rgba(168,85,247,0.38)",
  accent: "#A855F7", accent2: "#EC4899", accentBg: "rgba(168,85,247,0.16)",
  text: "#F4F2FF", muted: "#9990C0", faint: "#6B6390",
  green: "#34D399", greenBg: "rgba(52,211,153,0.14)",
  red: "#FB7185", redBg: "rgba(251,113,133,0.14)",
  blue: "#60A5FA", blueBg: "rgba(96,165,250,0.14)",
  amber: "#FBBF24", amberBg: "rgba(251,191,36,0.16)",
  orange: "#FB923C", pink: "#EC4899", cyan: "#22D3EE",
};
const GRAD = "linear-gradient(135deg,#A855F7,#EC4899)";
const GLOW = "0 0 28px rgba(168,85,247,0.45)";
const GLOW_SM = "0 0 16px rgba(168,85,247,0.40)";
const SHADOW_CARD = "0 2px 16px rgba(0,0,0,0.40)";
const ITEM_SH = "0 2px 12px rgba(0,0,0,0.35)";
const FONT_D = "var(--font-display)";
const TR = "0.18s cubic-bezier(0.4,0,0.2,1)";

// Convention couleurs : dépense = magenta/rouge, revenu = cyan/vert, virement = violet
const FIN = {
  depense:   { c: "#FB7185", bg: "rgba(251,113,133,0.14)", sign: "-",  label: "Dépense" },
  revenu:    { c: "#34D399", bg: "rgba(52,211,153,0.14)",  sign: "+",  label: "Revenu" },
  transfert: { c: "#A855F7", bg: "rgba(168,85,247,0.16)",  sign: "→",  label: "Transfert" },
};

const ACCOUNT_TYPES = [
  { id: "courant",  label: "Courant",  icon: "💳" },
  { id: "epargne",  label: "Épargne",  icon: "🏦" },
  { id: "especes",  label: "Espèces",  icon: "💵" },
  { id: "autre",    label: "Autre",    icon: "📦" },
];
const ACCOUNT_TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.id, t.label]));
const PALETTE = ["#8b5cf6", "#6366f1", "#34d399", "#fb7185", "#f59e0b", "#22d3ee", "#f472b6", "#a3e635"];
const ACCOUNT_ICONS = ["💳", "🏦", "💵", "📦", "💰", "🪙", "💎", "📈"];
const CATEGORY_ICONS = ["🛒", "🍽️", "🚗", "🏠", "⚡", "🎮", "👕", "💊", "✈️", "🎁", "📱", "💼", "💸", "🏆", "📚", "🐾"];

// ─── Banque d'émojis (large choix, groupée) pour les catégories ───────────────
const EMOJI_GROUPS = [
  { label: "Argent", emojis: ["💰","💵","💴","💶","💷","🪙","💳","💎","🏦","🧾","📈","📉","📊","🤑","💸","🏧","🪪","💱","💲"] },
  { label: "Maison", emojis: ["🏠","🏡","🏘️","🛋️","🛏️","🚪","🪑","🚿","🛁","🚽","🧹","🧺","🔌","💡","🕯️","🧯","🪟","🧴","🧼","🧽","🪣","🔧","🔨","🪛","🧰","🗝️","🛗"] },
  { label: "Nourriture", emojis: ["🍽️","🍕","🍔","🍟","🌭","🥪","🌮","🌯","🥗","🍿","🧂","🥘","🍝","🍜","🍣","🍱","🥟","🍤","🍗","🍖","🥩","🥓","🥚","🧀","🥞","🧇","🥐","🥖","🍞","🥯","🥨","🍳","🍚","🍛","🥫","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯"] },
  { label: "Boissons", emojis: ["☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🥛","🍼","🫖"] },
  { label: "Fruits & légumes", emojis: ["🍎","🍏","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🥦","🥬","🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍄"] },
  { label: "Transport", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️","🚲","🛴","🛺","🚆","🚄","🚅","🚈","🚉","✈️","🛫","🛬","🚁","⛴️","🚢","⛽","🅿️","🚏","🛣️","🛤️","🚧"] },
  { label: "Shopping", emojis: ["🛒","🛍️","👕","👖","👔","👗","👚","🧥","🧦","🧤","🧣","👠","👟","👞","🥾","🥿","👢","👒","🎩","🧢","👜","👛","👝","🎒","💄","💍","👓","🕶️","⌚","💅","🪮","🧳"] },
  { label: "Loisirs & sport", emojis: ["⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸","🥅","🏒","🏑","🏏","⛳","🥊","🥋","🎽","⛸️","🎿","🛷","🏂","🏋️","🤸","🚴","🏊","🧗","🎣","🎯","🎳","🎮","🕹️","🎲","♟️","🧩","🎨","🎭","🎪","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻"] },
  { label: "Voyage & nature", emojis: ["🏖️","🏝️","🏔️","⛰️","🌋","🗻","🏕️","⛺","🌲","🌳","🌴","🌵","🌾","🌻","🌷","🌹","🌸","🪴","🍀","🌍","🌎","🌏","🗺️","🧳","🧭","🏨","🏩","⛱️","🗽","🗼","🏰","⛩️","🏛️"] },
  { label: "Tech & travail", emojis: ["💻","🖥️","⌨️","🖱️","🖨️","📱","☎️","📞","📟","📠","🔋","🔌","💾","💿","📀","🎥","📷","📸","📹","📺","📻","🧮","💼","📁","📂","🗂️","📅","📆","🗓️","📌","📎","🖇️","✂️","📐","📏","🖊️","✏️","📝","📚","📖","🗞️","📰"] },
  { label: "Santé & bien-être", emojis: ["💊","💉","🩺","🩹","🩻","🦷","🧠","🫀","🫁","🦴","👁️","🩸","🏥","⚕️","🧬","🦠","🧪","🌡️","🛌","🧘","💆","💇","🛀","🧖","🚭","♨️"] },
  { label: "Animaux", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐢","🐍","🐙","🦑","🦐","🦀","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐘","🦏","🐪","🦒","🐃","🐄","🐎","🐖","🐑","🐐","🦌","🐕","🐈","🦝","🦦","🐿️","🦔"] },
  { label: "Personnes", emojis: ["👶","🧒","👦","👧","🧑","👨","👩","🧓","👴","👵","👪","🤝","🙏","💪","🧑‍🍳","🧑‍🎓","🧑‍🏫","🧑‍💻","🧑‍🔧","🧑‍🌾","🧑‍⚕️","👮","🕵️","💂","👷","🤴","👸","🧑‍🚀","🧑‍✈️","🧑‍🚒"] },
  { label: "Symboles", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","💕","💖","💘","💝","⭐","🌟","✨","⚡","🔥","💥","💫","🌈","☀️","🌙","⛄","❄️","🎉","🎊","🎈","🎁","🎀","🏆","🥇","🥈","🥉","🏅","🎖️","🔔","📢","💬","💭","♻️","✅","❌","❓","❗","💯","⚜️","🔱","☮️","☯️","🔆"] },
];
const ALL_EMOJIS = EMOJI_GROUPS.flatMap(g => g.emojis);

const fmtEUR = (n, currency = "EUR") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(n ?? 0);
const todayStr = () => new Date().toISOString().split("T")[0];
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MONTH_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MONTH_FR[m - 1]} ${y}`; };
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
};
const parseAmount = (s) => {
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
};
const dayLabel = (ds) => {
  const d = new Date(ds + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

// Largeur ≥ 900px → layout PC pleine largeur (multi-colonnes)
function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const h = e => setD(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return d;
}

// ─── Bottom-sheet réutilisable ────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); requestAnimationFrame(() => setShown(true)); }
    else { setShown(false); const t = setTimeout(() => setMounted(false), 220); return () => clearTimeout(t); }
  }, [open]);
  if (!mounted) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 800, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", opacity: shown ? 1 : 0, transition: TR }} />
      <div style={{
        position: "relative", width: "min(440px,100%)", margin: "0 auto",
        background: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
        border: `1px solid ${C.borderMid}`,
        padding: "8px 20px 20px",
        marginBottom: "calc(76px + env(safe-area-inset-bottom))",
        maxHeight: "82vh", overflowY: "auto",
        transform: shown ? "translateY(0)" : "translateY(100%)", transition: `transform ${TR}`,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.surface3, margin: "8px auto 14px" }} />
        {title && <div style={{ fontFamily: FONT_D, fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 18, letterSpacing: "-0.01em" }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

// ─── Petits éléments UI ───────────────────────────────────────────────────────
const sheetInput = {
  width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.text,
  padding: "12px 14px", borderRadius: 12, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const labelStyle = { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8, display: "block" };
const primaryBtn = {
  width: "100%", background: GRAD, color: "#fff", border: "none", borderRadius: 14,
  padding: 15, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 50, boxShadow: GLOW_SM,
};

function Card({ children, style, onClick }) {
  return <div onClick={onClick} className="lp-card" style={{ background: C.surface2, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: ITEM_SH, padding: 16, ...style }}>{children}</div>;
}

// Eyebrow de section (accent uppercase, signature HOME)
function Eyebrow({ children, color = C.accent, action }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700 }}>{children}</span>
      {action}
    </div>
  );
}

// Sélecteur d'émoji — large banque, groupée, filtrable, repliable
function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const groups = query ? EMOJI_GROUPS.filter(g => g.label.toLowerCase().includes(query)) : EMOJI_GROUPS;
  const pick = (e) => { onChange(e); setOpen(false); setQ(""); };
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", cursor: "pointer", fontFamily: "inherit",
        background: C.surface3, border: `1px solid ${open ? C.accent : C.border}`, borderRadius: 12, padding: "8px 12px", minHeight: 48,
      }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{value || "🏷️"}</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 14, color: C.muted }}>{open ? "Choisis un émoji…" : "Changer l'émoji"}</span>
        <span style={{ color: C.muted, fontSize: 12, transform: open ? "rotate(180deg)" : "none", transition: TR }}>▾</span>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer (argent, animaux, sport…)" style={{ ...sheetInput, marginBottom: 8 }} />
          <div style={{ maxHeight: 230, overflowY: "auto", background: C.surface3, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 8px 8px" }}>
            {groups.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 16 }}>Aucun groupe.</div>}
            {groups.map(g => (
              <div key={g.label}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, position: "sticky", top: 0, background: C.surface3, padding: "8px 2px 6px" }}>{g.label}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 38px)", gap: 4 }}>
                  {g.emojis.map(e => (
                    <button key={e} type="button" onClick={() => pick(e)} style={{
                      width: 38, height: 38, borderRadius: 10, fontSize: 19, cursor: "pointer", lineHeight: 1,
                      background: value === e ? C.accentBg : "transparent",
                      border: `1px solid ${value === e ? C.accent : "transparent"}`, transition: TR,
                    }}>{e}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Hero solde — boxless, gros chiffre en dégradé (signature HOME)
function BalanceHero({ total, sub, desktop }) {
  return (
    <div style={{ marginBottom: desktop ? 28 : 20 }}>
      <div style={{ fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, marginBottom: 8 }}>Solde total</div>
      <div style={{
        fontFamily: FONT_D, fontSize: desktop ? 56 : 44, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
        filter: "drop-shadow(0 0 18px rgba(168,85,247,0.35))",
      }}>{fmtEUR(total)}</div>
      {sub && <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, color }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div style={{ height: 8, borderRadius: 999, background: C.surface3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${v}%`, borderRadius: 999, background: color, transition: `width ${TR}` }} />
    </div>
  );
}

// Anneau de progression SVG fait main (budgets, objectifs)
function ProgressRing({ value, size = 64, stroke = 7, color = C.accent, children }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - pct / 100);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.surface3} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: `stroke-dashoffset ${TR}`, filter: `drop-shadow(0 0 4px ${color}88)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

// Picker horizontal de chips (comptes / catégories)
function ChipPicker({ items, value, onChange, getKey = i => i.id, getLabel = i => i.name, getColor = () => C.accent, getIcon }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
      {items.map(it => {
        const k = getKey(it); const active = value === k; const col = getColor(it);
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{
            flexShrink: 0, minHeight: 44, padding: "0 14px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: active ? 600 : 500,
            background: active ? col + "22" : C.surface2,
            border: `1px solid ${active ? col : C.border}`,
            color: active ? C.text : C.muted, transition: TR, whiteSpace: "nowrap",
          }}>
            {getIcon && <span style={{ fontSize: 16 }}>{getIcon(it)}</span>}
            {getLabel(it)}
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPTE — form sheet
// ═══════════════════════════════════════════════════════════════════════════════
function AccountFormSheet({ open, onClose, onSubmit, onDelete, account }) {
  const editing = !!account;
  const [name, setName] = useState("");
  const [type, setType] = useState("courant");
  const [initial, setInitial] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState(ACCOUNT_ICONS[0]);

  useEffect(() => {
    if (open) {
      setName(account?.name ?? "");
      setType(account?.type ?? "courant");
      setInitial(account ? String(account.initial_balance) : "");
      setColor(account?.color ?? PALETTE[0]);
      setIcon(account?.icon ?? ACCOUNT_ICONS[0]);
    }
  }, [open, account]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), type, initial_balance: parseAmount(initial || "0"), color, icon });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Modifier le compte" : "Nouveau compte"}>
      <label style={labelStyle}>Nom</label>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Compte courant…" style={{ ...sheetInput, marginBottom: 16 }} />

      <label style={labelStyle}>Type</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {ACCOUNT_TYPES.map(t => (
          <button key={t.id} type="button" onClick={() => setType(t.id)} style={{
            minHeight: 44, padding: "0 14px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6, fontSize: 14,
            background: type === t.id ? C.accentBg : C.surface2,
            border: `1px solid ${type === t.id ? C.accent : C.border}`,
            color: type === t.id ? C.text : C.muted, transition: TR,
          }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <label style={labelStyle}>Solde initial</label>
      <input value={initial} onChange={e => setInitial(e.target.value)} inputMode="decimal" placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 16 }} />

      <label style={labelStyle}>Icône</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {ACCOUNT_ICONS.map(i => (
          <button key={i} type="button" onClick={() => setIcon(i)} style={{
            width: 44, height: 44, borderRadius: 12, fontSize: 20, cursor: "pointer",
            background: icon === i ? C.accentBg : C.surface2, border: `1px solid ${icon === i ? C.accent : C.border}`,
          }}>{i}</button>
        ))}
      </div>

      <label style={labelStyle}>Couleur</label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {PALETTE.map(c => (
          <div key={c} onClick={() => setColor(c)} style={{
            width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
            border: color === c ? "3px solid #fff" : "3px solid transparent", boxSizing: "border-box",
          }} />
        ))}
      </div>

      <button onClick={submit} disabled={!name.trim()} style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5 }}>
        {editing ? "Enregistrer" : "Créer le compte"}
      </button>
      {editing && (
        <button onClick={() => {
          if (window.confirm(`Supprimer « ${account.name} » ? Les transactions liées seront aussi supprimées.`)) { onDelete(account.id); onClose(); }
        }} style={{ width: "100%", background: "transparent", border: "none", color: FIN.depense.c, padding: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>
          Supprimer le compte
        </button>
      )}
    </BottomSheet>
  );
}

function AccountCard({ account, onEdit }) {
  const t = ACCOUNT_TYPES.find(x => x.id === account.type);
  const col = account.color || C.accent;
  const neg = (account.balance ?? 0) < 0;
  return (
    <div onClick={onEdit} className="lp-card-hover" style={{
      background: C.surface2, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: ITEM_SH, padding: 16,
      display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: TR,
      borderLeft: `3px solid ${col}`,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: col + "26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {account.icon || t?.icon || "💳"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{account.name}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{ACCOUNT_TYPE_LABEL[account.type]}</div>
      </div>
      <div style={{ fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: neg ? FIN.depense.c : C.text, fontVariantNumeric: "tabular-nums" }}>
        {fmtEUR(account.balance, account.currency)}
      </div>
    </div>
  );
}

const ACCOUNT_SUBTABS = [["comptes", "Comptes"], ["objectifs", "Objectifs"]];

function AccountsList({ userId, accountsHook, goalsHook, desktop }) {
  const { accounts, totalBalance, loading, createAccount, updateAccount, deleteAccount } = accountsHook;
  const [sub, setSub] = useState("comptes");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const open = (acc = null) => { setEditing(acc); setSheetOpen(true); };
  const submit = async (data) => {
    if (editing) await updateAccount(editing.id, data);
    else await createAccount(data);
  };

  return (
    <div>
      <SubTabs tabs={ACCOUNT_SUBTABS} value={sub} onChange={setSub} />

      {sub === "comptes" && (
        <div>
          <BalanceHero total={totalBalance} desktop={desktop} sub={`${accounts.length} compte${accounts.length > 1 ? "s" : ""}`} />
          {loading ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Chargement…</div> : (
            <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 10 }}>
              {accounts.length === 0 && <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24, gridColumn: "1 / -1" }}>Aucun compte. Créez-en un pour commencer.</div>}
              {accounts.map(a => (
                <AccountCard key={a.id} account={a} onEdit={() => open(a)} />
              ))}
            </div>
          )}
          <button onClick={() => open()} style={{ ...primaryBtn, marginTop: 16, maxWidth: desktop ? 320 : "none" }}>+ Nouveau compte</button>
          <AccountFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} onDelete={deleteAccount} account={editing} />
        </div>
      )}

      {sub === "objectifs" && <GoalsTab userId={userId} accounts={accounts} goalsHook={goalsHook} desktop={desktop} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATÉGORIES — manager sheet
// ═══════════════════════════════════════════════════════════════════════════════
function CategoryManagerSheet({ open, onClose, categoriesHook, initialKind = "depense" }) {
  const { byKind, createCategory, updateCategory, archiveCategory } = categoriesHook;
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { if (open) setKind(initialKind); }, [open, initialKind]);

  const reset = () => { setName(""); setIcon(CATEGORY_ICONS[0]); setColor(PALETTE[0]); setEditingId(null); };
  const submit = async () => {
    if (!name.trim()) return;
    if (editingId) await updateCategory(editingId, { name: name.trim(), icon, color, kind });
    else await createCategory({ name: name.trim(), kind, icon, color });
    reset();
    onClose();
  };
  const startEdit = (c) => { setEditingId(c.id); setName(c.name); setIcon(c.icon || CATEGORY_ICONS[0]); setColor(c.color || PALETTE[0]); setKind(c.kind); };

  const list = byKind(kind);

  return (
    <BottomSheet open={open} onClose={() => { reset(); onClose(); }} title="Catégories">
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["depense", "revenu"].map(k => (
          <button key={k} type="button" onClick={() => setKind(k)} style={{
            flex: 1, minHeight: 42, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600,
            background: kind === k ? FIN[k].bg : C.surface2,
            border: `1px solid ${kind === k ? FIN[k].c : C.border}`,
            color: kind === k ? FIN[k].c : C.muted,
          }}>{k === "depense" ? "Dépenses" : "Revenus"}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, maxHeight: 200, overflowY: "auto" }}>
        {list.length === 0 && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 12 }}>Aucune catégorie.</div>}
        {list.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: C.surface2 }}>
            <span style={{ fontSize: 18 }}>{c.icon || "🏷️"}</span>
            <span style={{ flex: 1, fontSize: 14, color: C.text }}>{c.name}</span>
            <button onClick={() => startEdit(c)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 4 }}>✎</button>
            <button onClick={() => archiveCategory(c.id)} style={{ background: "none", border: "none", color: FIN.depense.c, cursor: "pointer", fontSize: 14, padding: 4 }}>✕</button>
          </div>
        ))}
      </div>

      <label style={labelStyle}>{editingId ? "Modifier" : "Nouvelle catégorie"}</label>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" style={{ ...sheetInput, marginBottom: 12 }} />
      <label style={labelStyle}>Émoji</label>
      <div style={{ marginBottom: 12 }}>
        <EmojiPicker value={icon} onChange={setIcon} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        {PALETTE.map(c => (
          <div key={c} onClick={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? "3px solid #fff" : "3px solid transparent", boxSizing: "border-box" }} />
        ))}
      </div>
      <button onClick={submit} disabled={!name.trim()} style={{ ...primaryBtn, opacity: name.trim() ? 1 : 0.5 }}>
        {editingId ? "Enregistrer" : "Ajouter"}
      </button>
    </BottomSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION — form sheet
// ═══════════════════════════════════════════════════════════════════════════════
function TransactionFormSheet({ open, onClose, onSubmit, onDelete, transaction, accounts, categoriesHook }) {
  const editing = !!transaction;
  const [type, setType] = useState("depense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type); setAmount(String(transaction.amount));
      setAccountId(transaction.account_id); setTransferTo(transaction.transfer_account_id || "");
      setCategoryId(transaction.category_id); setDate(transaction.date); setNote(transaction.note || "");
    } else {
      setType("depense"); setAmount(""); setAccountId(accounts[0]?.id || "");
      setTransferTo(""); setCategoryId(null); setDate(todayStr()); setNote("");
    }
  }, [open, transaction, accounts]);

  const cats = categoriesHook.byKind(type === "revenu" ? "revenu" : "depense");
  const amt = parseAmount(amount);
  const valid = amt > 0 && accountId && (type !== "transfert" || (transferTo && transferTo !== accountId));

  const submit = () => {
    if (!valid) return;
    onSubmit({
      type, amount: amt, account_id: accountId,
      transfer_account_id: type === "transfert" ? transferTo : null,
      category_id: type === "transfert" ? null : categoryId,
      date, note,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Modifier la transaction" : "Nouvelle transaction"}>
      {/* Toggle type */}
      <div style={{ display: "flex", gap: 6, background: C.surface2, padding: 4, borderRadius: 14, marginBottom: 20 }}>
        {["depense", "revenu", "transfert"].map(t => (
          <button key={t} type="button" onClick={() => setType(t)} style={{
            flex: 1, minHeight: 42, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            background: type === t ? FIN[t].c : "transparent",
            color: type === t ? "#fff" : C.muted, border: "none", transition: TR,
          }}>{FIN[t].label}</button>
        ))}
      </div>

      {/* Montant */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <input
          value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" autoFocus
          placeholder="0,00" style={{
            width: "100%", background: "transparent", border: "none", outline: "none", textAlign: "center",
            color: FIN[type].c, fontSize: 48, fontWeight: 800, fontFamily: FONT_D, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
          }} />
        <div style={{ fontSize: 13, color: C.muted, marginTop: -4 }}>€ — {FIN[type].label}</div>
      </div>

      {/* Nommer la transaction */}
      <label style={labelStyle}>Nommer la transaction</label>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="ex. Courses Carrefour…" style={{ ...sheetInput, marginBottom: 16 }} />

      {/* Compte */}
      <label style={labelStyle}>{type === "transfert" ? "Depuis le compte" : "Compte"}</label>
      <div style={{ marginBottom: 16 }}>
        <ChipPicker items={accounts} value={accountId} onChange={setAccountId}
          getLabel={a => a.name} getColor={a => a.color || C.accent} getIcon={a => a.icon || "💳"} />
      </div>

      {/* Vers le compte (transfert) */}
      {type === "transfert" && (
        <>
          <label style={labelStyle}>Vers le compte</label>
          <div style={{ marginBottom: 16 }}>
            <ChipPicker items={accounts.filter(a => a.id !== accountId)} value={transferTo} onChange={setTransferTo}
              getLabel={a => a.name} getColor={a => a.color || C.accent} getIcon={a => a.icon || "💳"} />
          </div>
        </>
      )}

      {/* Catégorie (masquée si transfert) */}
      {type !== "transfert" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Catégorie</span>
            <button type="button" onClick={() => setCatManagerOpen(true)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ Nouvelle</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            {cats.length === 0
              ? <div style={{ fontSize: 13, color: C.muted, padding: "8px 0" }}>Aucune catégorie — créez-en une.</div>
              : <ChipPicker items={[{ id: null, name: "Aucune", icon: "∅" }, ...cats]} value={categoryId} onChange={setCategoryId}
                  getLabel={c => c.name} getColor={c => c.color || C.accent} getIcon={c => c.icon || "🏷️"} />}
          </div>
        </>
      )}

      {/* Date */}
      <label style={labelStyle}>Date</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...sheetInput, marginBottom: 22, colorScheme: "dark" }} />

      <button onClick={submit} disabled={!valid} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}>
        {editing ? "Enregistrer" : "Ajouter"}
      </button>
      {editing && (
        <button onClick={() => { onDelete(transaction.id); onClose(); }} style={{
          width: "100%", background: "transparent", border: "none", color: FIN.depense.c,
          padding: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 4,
        }}>Supprimer</button>
      )}

      <CategoryManagerSheet open={catManagerOpen} onClose={() => setCatManagerOpen(false)} categoriesHook={categoriesHook} initialKind={type === "revenu" ? "revenu" : "depense"} />
    </BottomSheet>
  );
}

function TransactionRow({ tx, accounts, categories, onClick }) {
  const acc = accounts.find(a => a.id === tx.account_id);
  const dest = accounts.find(a => a.id === tx.transfer_account_id);
  const cat = categories.find(c => c.id === tx.category_id);
  const f = FIN[tx.type];
  const title = tx.type === "transfert"
    ? `${acc?.name || "?"} → ${dest?.name || "?"}`
    : (cat?.name || (tx.type === "revenu" ? "Revenu" : "Dépense"));
  const sub = tx.type === "transfert" ? (tx.note || "Virement") : `${acc?.name || "?"}${tx.note ? " · " + tx.note : ""}`;
  const icon = tx.type === "transfert" ? "🔄" : (cat?.icon || (tx.type === "revenu" ? "💰" : "💸"));
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", cursor: "pointer" }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      <div style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: f.c, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        {tx.type === "transfert" ? "" : f.sign}{fmtEUR(tx.amount, acc?.currency)}
      </div>
    </div>
  );
}

function TransactionList({ transactions, accounts, categories, onRowClick, desktop }) {
  // Groupé par jour avec total du jour (dépenses - revenus net)
  const groups = useMemo(() => {
    const m = new Map();
    transactions.forEach(t => { if (!m.has(t.date)) m.set(t.date, []); m.get(t.date).push(t); });
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  if (transactions.length === 0)
    return <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 32 }}>Aucune transaction ce mois-ci.</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 16, alignItems: "start" }}>
      {groups.map(([date, txs]) => {
        const net = txs.reduce((s, t) => s + (t.type === "revenu" ? t.amount : t.type === "depense" ? -t.amount : 0), 0);
        return (
          <div key={date}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, padding: "0 4px" }}>
              <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{dayLabel(date)}</span>
              <span style={{ fontFamily: FONT_D, fontSize: 12, color: net >= 0 ? FIN.revenu.c : FIN.depense.c, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {net > 0 ? "+" : ""}{fmtEUR(net)}
              </span>
            </div>
            <Card style={{ padding: "4px 12px" }}>
              {txs.map((t, i) => (
                <div key={t.id} style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                  <TransactionRow tx={t} accounts={accounts} categories={categories} onClick={() => onRowClick(t)} />
                </div>
              ))}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// Sélecteur de mois (réutilisé Aperçu + Transactions)
function MonthNav({ month, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
      <button onClick={() => onChange(shiftMonth(month, -1))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16 }}>‹</button>
      <span style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: C.text, minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</span>
      <button onClick={() => onChange(shiftMonth(month, 1))} style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text, width: 36, height: 36, borderRadius: 10, cursor: "pointer", fontSize: 16 }}>›</button>
    </div>
  );
}

// Vue calendrier des transactions du mois — clic sur un jour = détail
const CAL_DAYS = ["L", "M", "M", "J", "V", "S", "D"];
function TransactionCalendar({ month, transactions, accounts, categories, onRowClick, desktop }) {
  const [y, m] = month.split("-").map(Number);
  const pad = n => String(n).padStart(2, "0");
  const dstr = d => `${y}-${pad(m)}-${pad(d)}`;
  const startDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Lun = 0
  const nbDays = new Date(y, m, 0).getDate();
  const today = todayStr();

  const byDate = useMemo(() => {
    const map = {};
    transactions.forEach(t => { (map[t.date] = map[t.date] || []).push(t); });
    return map;
  }, [transactions]);

  const firstWithTx = Object.keys(byDate).sort()[0];
  const defaultDay = () => {
    if (today.startsWith(`${y}-${pad(m)}`)) return today;
    return firstWithTx || dstr(1);
  };
  const [selected, setSelected] = useState(defaultDay());
  useEffect(() => { setSelected(defaultDay()); /* reset au changement de mois */ }, [month]); // eslint-disable-line

  const dayNet = (ds) => (byDate[ds] || []).reduce((s, t) => s + (t.type === "revenu" ? t.amount : t.type === "depense" ? -t.amount : 0), 0);
  const selTxs = byDate[selected] || [];
  const selNet = dayNet(selected);

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= nbDays; d++) cells.push(d);

  const calendar = (
    <Card style={{ padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
        {CAL_DAYS.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 9, color: C.faint, fontWeight: 700 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = dstr(d);
          const has = (byDate[ds] || []).length > 0;
          const net = dayNet(ds);
          const isSel = ds === selected;
          const isToday = ds === today;
          return (
            <button key={i} onClick={() => setSelected(ds)} style={{
              height: 38, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", padding: 0,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              background: isSel ? C.accentBg : "transparent",
              border: `1px solid ${isSel ? C.accent : isToday ? C.borderMid : "transparent"}`, transition: TR,
            }}>
              <span style={{ fontFamily: FONT_D, fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? C.accent : C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{d}</span>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: has ? (net >= 0 ? FIN.revenu.c : FIN.depense.c) : "transparent", boxShadow: has ? `0 0 4px ${net >= 0 ? FIN.revenu.c : FIN.depense.c}` : "none" }} />
            </button>
          );
        })}
      </div>
    </Card>
  );

  const detail = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, padding: "0 4px" }}>
        <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{dayLabel(selected)}</span>
        {selTxs.length > 0 && <span style={{ fontFamily: FONT_D, fontSize: 13, fontWeight: 700, color: selNet >= 0 ? FIN.revenu.c : FIN.depense.c, fontVariantNumeric: "tabular-nums" }}>{selNet > 0 ? "+" : ""}{fmtEUR(selNet)}</span>}
      </div>
      {selTxs.length === 0
        ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Aucune transaction ce jour.</div>
        : <Card style={{ padding: "4px 12px" }}>
            {selTxs.map((t, i) => (
              <div key={t.id} style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <TransactionRow tx={t} accounts={accounts} categories={categories} onClick={() => onRowClick(t)} />
              </div>
            ))}
          </Card>}
    </div>
  );

  return desktop
    ? <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", gap: 24, alignItems: "start" }}>{calendar}{detail}</div>
    : <div><div style={{ marginBottom: 16 }}>{calendar}</div>{detail}</div>;
}

const TX_SUBTABS = [["mois", "Ce mois"], ["depenses", "Dépenses"], ["revenus", "Revenus"], ["recurrent", "Récurrent"]];

function TransactionsTab({ userId, month, setMonth, accounts, categoriesHook, openForm, desktop, recurringHook }) {
  const [sub, setSub] = useState("mois");
  const { transactions, loading } = useFinanceTransactions(userId, { month });
  const noAccounts = accounts.length === 0;

  const filtered = sub === "depenses" ? transactions.filter(t => t.type === "depense")
    : sub === "revenus" ? transactions.filter(t => t.type === "revenu") : transactions;
  const monthNet = filtered.reduce((s, t) => s + (t.type === "revenu" ? t.amount : t.type === "depense" ? -t.amount : 0), 0);

  return (
    <div>
      <SubTabs tabs={TX_SUBTABS} value={sub} onChange={setSub} />

      {(sub === "mois" || sub === "depenses" || sub === "revenus") && (
        <>
          <MonthNav month={month} onChange={setMonth} />
          <button onClick={() => openForm()} disabled={noAccounts}
            title={noAccounts ? "Créez d'abord un compte" : "Nouvelle transaction"}
            style={{ ...primaryBtn, maxWidth: desktop ? 360 : "none", marginBottom: 12, opacity: noAccounts ? 0.5 : 1, cursor: noAccounts ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Nouvelle transaction
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, padding: "0 4px" }}>
            <span style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: C.text }}>{monthLabel(month)}</span>
            <span style={{ fontFamily: FONT_D, fontSize: 14, fontWeight: 700, color: monthNet >= 0 ? FIN.revenu.c : FIN.depense.c, fontVariantNumeric: "tabular-nums" }}>{monthNet > 0 ? "+" : ""}{fmtEUR(monthNet)}</span>
          </div>
          {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div>
            : sub === "mois"
              ? <TransactionCalendar month={month} transactions={transactions} accounts={accounts} categories={categoriesHook.categories} onRowClick={openForm} desktop={desktop} />
              : <TransactionList transactions={filtered} accounts={accounts} categories={categoriesHook.categories} onRowClick={openForm} desktop={desktop} />}
        </>
      )}

      {sub === "recurrent" && <RecurringList accounts={accounts} categoriesHook={categoriesHook} recurringHook={recurringHook} desktop={desktop} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGETS
// ═══════════════════════════════════════════════════════════════════════════════
function BudgetRow({ budget, category, onEdit }) {
  const ratio = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const over = budget.spent > budget.amount;
  const col = over ? FIN.depense.c : C.accent;
  return (
    <Card style={{ cursor: "pointer" }}>
      <div onClick={onEdit}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{category?.icon || "🌐"}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text }}>{category ? category.name : "Budget global"}</span>
          <span style={{ fontFamily: FONT_D, fontSize: 13, color: over ? FIN.depense.c : C.muted, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
            {fmtEUR(budget.spent)} / {fmtEUR(budget.amount)}
          </span>
        </div>
        <ProgressBar value={ratio} color={col} />
        {over && <div style={{ fontSize: 12, color: FIN.depense.c, marginTop: 6 }}>Dépassé de {fmtEUR(budget.spent - budget.amount)}</div>}
      </div>
    </Card>
  );
}

function BudgetFormSheet({ open, onClose, onSubmit, onDelete, budget, categories }) {
  const editing = !!budget;
  const [categoryId, setCategoryId] = useState(null);
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategoryId(budget?.category_id ?? null);
    setAmount(budget ? String(budget.amount) : "");
  }, [open, budget]);

  const amt = parseAmount(amount);
  const depCats = categories.filter(c => c.kind === "depense");
  const submit = () => { if (amt > 0) { onSubmit({ category_id: categoryId, amount: amt }); onClose(); } };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Modifier le budget" : "Nouveau budget"}>
      <label style={labelStyle}>Catégorie</label>
      <div style={{ marginBottom: 16 }}>
        <ChipPicker
          items={[{ id: null, name: "Global", icon: "🌐" }, ...depCats]}
          value={categoryId} onChange={setCategoryId}
          getLabel={c => c.name} getColor={c => c.color || C.accent} getIcon={c => c.icon || "🏷️"} />
      </div>
      <label style={labelStyle}>Montant mensuel</label>
      <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" autoFocus placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 22 }} />
      <button onClick={submit} disabled={amt <= 0} style={{ ...primaryBtn, opacity: amt > 0 ? 1 : 0.5 }}>{editing ? "Enregistrer" : "Créer"}</button>
      {editing && (
        <button onClick={() => { onDelete(budget.id); onClose(); }} style={{ width: "100%", background: "transparent", border: "none", color: FIN.depense.c, padding: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Supprimer</button>
      )}
    </BottomSheet>
  );
}

const BUDGET_SUBTABS = [["mois", "Ce mois"], ["budgets", "Budgets"], ["categories", "Catégories"]];

function BudgetsTab({ userId, categoriesHook, desktop }) {
  const [sub, setSub] = useState("mois");
  const { budgets, loading, upsertBudget, deleteBudget } = useFinanceBudgets(userId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const cats = categoriesHook.categories;

  const open = (b = null) => { setEditing(b); setSheetOpen(true); };
  const submit = async (data) => { await upsertBudget(data); };

  return (
    <div>
      <SubTabs tabs={BUDGET_SUBTABS} value={sub} onChange={setSub} />

      {sub === "mois" && <BudgetMonthTab userId={userId} categoriesHook={categoriesHook} desktop={desktop} />}

      {sub === "budgets" && (
        <div>
          {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div> : (
            <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 10, alignItems: "start" }}>
              {budgets.length === 0 && <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24, gridColumn: "1 / -1" }}>Aucun budget défini.</div>}
              {budgets.map(b => (
                <BudgetRow key={b.id} budget={b} category={cats.find(c => c.id === b.category_id)} onEdit={() => open(b)} />
              ))}
            </div>
          )}
          <button onClick={() => open()} style={{ ...primaryBtn, marginTop: 16, maxWidth: desktop ? 320 : "none" }}>+ Nouveau budget</button>
          <BudgetFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} onDelete={deleteBudget} budget={editing} categories={cats} />
        </div>
      )}

      {sub === "categories" && <CategoriesTab categoriesHook={categoriesHook} desktop={desktop} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABONNEMENTS
// ═══════════════════════════════════════════════════════════════════════════════
const SUB_ICONS = ["🔁", "📺", "🎵", "🎮", "☁️", "📱", "📰", "🏋️", "🚗", "🍿", "💡", "🌐"];

const FREQ_OPTS = [["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

// Sheet récurrent — config complète (sert au Récurrent + Abonnements pré-réglé)
function RecurringFormSheet({ open, onClose, onSubmit, onDelete, recurring, accounts, categoriesHook, forceSubscription = false }) {
  const editing = !!recurring;
  const [label, setLabel] = useState("");
  const [type, setType] = useState("depense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(null);
  const [transferTo, setTransferTo] = useState(null);
  const [categoryId, setCategoryId] = useState(null);
  const [freq, setFreq] = useState("mois");
  const [interval, setIntervalV] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [monthOfYear, setMonthOfYear] = useState(1);
  const [nextOcc, setNextOcc] = useState(todayStr());
  const [isSub, setIsSub] = useState(false);
  const [active, setActive] = useState(true);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(recurring?.label ?? "");
    setType(recurring?.type ?? "depense");
    setAmount(recurring ? String(recurring.amount) : "");
    setAccountId(recurring?.account_id ?? accounts[0]?.id ?? null);
    setTransferTo(recurring?.transfer_account_id ?? null);
    setCategoryId(recurring?.category_id ?? null);
    setFreq(recurring?.freq ?? "mois");
    setIntervalV(recurring ? String(recurring.interval) : "1");
    setDayOfMonth(recurring?.day_of_month ? String(recurring.day_of_month) : "");
    setWeekday(recurring?.weekday ?? 0);
    setMonthOfYear(recurring?.month_of_year ?? 1);
    setNextOcc(recurring?.next_occurrence ?? todayStr());
    setIsSub(forceSubscription || recurring?.is_subscription || false);
    setActive(recurring?.active ?? true);
  }, [open, recurring, accounts, forceSubscription]);

  const cats = categoriesHook.byKind(type === "revenu" ? "revenu" : "depense");
  const amt = parseAmount(amount);
  const valid = label.trim() && amt > 0 && accountId && nextOcc && (type !== "transfert" || (transferTo && transferTo !== accountId));
  const submit = () => {
    if (!valid) return;
    const dm = parseInt(dayOfMonth, 10);
    onSubmit({
      label: label.trim(), type, amount: amt, account_id: accountId,
      transfer_account_id: type === "transfert" ? transferTo : null,
      category_id: type === "transfert" ? null : categoryId,
      is_subscription: isSub, freq, interval: Math.max(1, parseInt(interval, 10) || 1),
      day_of_month: (freq === "mois" || freq === "annee") && dm >= 1 && dm <= 31 ? dm : null,
      weekday: freq === "semaine" ? weekday : null,
      month_of_year: freq === "annee" ? monthOfYear : null,
      next_occurrence: nextOcc, active,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Modifier" : forceSubscription ? "Nouvel abonnement" : "Nouveau récurrent"}>
      <div style={{ display: "flex", gap: 6, background: C.surface2, padding: 4, borderRadius: 14, marginBottom: 16 }}>
        {["depense", "revenu", "transfert"].map(t => (
          <button key={t} type="button" onClick={() => setType(t)} style={{
            flex: 1, minHeight: 40, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            background: type === t ? FIN[t].c : "transparent", color: type === t ? "#fff" : C.muted, border: "none",
          }}>{FIN[t].label}</button>
        ))}
      </div>

      <label style={labelStyle}>Nom</label>
      <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Netflix, Loyer, Salaire…" style={{ ...sheetInput, marginBottom: 16 }} />

      <label style={labelStyle}>Montant</label>
      <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 16 }} />

      <label style={labelStyle}>{type === "transfert" ? "Depuis le compte" : "Compte"}</label>
      <div style={{ marginBottom: 16 }}>
        <ChipPicker items={accounts} value={accountId} onChange={setAccountId} getLabel={a => a.name} getColor={a => a.color || C.accent} getIcon={a => a.icon || "💳"} />
      </div>

      {type === "transfert" && (
        <>
          <label style={labelStyle}>Vers le compte</label>
          <div style={{ marginBottom: 16 }}>
            <ChipPicker items={accounts.filter(a => a.id !== accountId)} value={transferTo} onChange={setTransferTo} getLabel={a => a.name} getColor={a => a.color || C.accent} getIcon={a => a.icon || "💳"} />
          </div>
        </>
      )}

      {type !== "transfert" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Catégorie</span>
            <button type="button" onClick={() => setCatManagerOpen(true)} style={{ background: "none", border: "none", color: C.accent, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ Nouvelle</button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <ChipPicker items={[{ id: null, name: "Aucune", icon: "∅" }, ...cats]} value={categoryId} onChange={setCategoryId} getLabel={c => c.name} getColor={c => c.color || C.accent} getIcon={c => c.icon || "🏷️"} />
          </div>
        </>
      )}

      <label style={labelStyle}>Fréquence</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {FREQ_OPTS.map(([id, lbl]) => (
          <button key={id} type="button" onClick={() => setFreq(id)} style={{
            flex: 1, minHeight: 42, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
            background: freq === id ? C.accentBg : C.surface3, border: `1px solid ${freq === id ? C.accent : C.border}`, color: freq === id ? C.text : C.muted,
          }}>{lbl}</button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: C.muted }}>Tous les</span>
        <input value={interval} onChange={e => setIntervalV(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" style={{ ...sheetInput, width: 64, textAlign: "center", marginBottom: 0 }} />
        <span style={{ fontSize: 13, color: C.muted }}>{FREQ_OPTS.find(f => f[0] === freq)[1].toLowerCase()}(s)</span>
      </div>

      {(freq === "mois" || freq === "annee") && (
        <>
          <label style={labelStyle}>Jour du mois</label>
          <input value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="ex. 5" style={{ ...sheetInput, marginBottom: 16 }} />
        </>
      )}
      {freq === "semaine" && (
        <>
          <label style={labelStyle}>Jour de la semaine</label>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => setWeekday(i)} style={{ flex: 1, minWidth: 40, minHeight: 40, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: weekday === i ? C.accentBg : C.surface3, border: `1px solid ${weekday === i ? C.accent : C.border}`, color: weekday === i ? C.text : C.muted }}>{d}</button>
            ))}
          </div>
        </>
      )}
      {freq === "annee" && (
        <>
          <label style={labelStyle}>Mois</label>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {MONTHS_SHORT.map((m, i) => (
              <button key={m} type="button" onClick={() => setMonthOfYear(i + 1)} style={{ minWidth: 44, minHeight: 38, borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, background: monthOfYear === i + 1 ? C.accentBg : C.surface3, border: `1px solid ${monthOfYear === i + 1 ? C.accent : C.border}`, color: monthOfYear === i + 1 ? C.text : C.muted }}>{m}</button>
            ))}
          </div>
        </>
      )}

      <label style={labelStyle}>Prochaine échéance</label>
      <input type="date" value={nextOcc} onChange={e => setNextOcc(e.target.value)} style={{ ...sheetInput, marginBottom: 16, colorScheme: "dark" }} />

      {!forceSubscription && (
        <div onClick={() => setIsSub(s => !s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: C.surface3, border: `1px solid ${C.border}`, cursor: "pointer", marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: C.text }}>Abonnement (validation manuelle)</span>
          <div style={{ width: 44, height: 26, borderRadius: 999, background: isSub ? C.accent : C.surface, transition: TR, position: "relative", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: isSub ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: TR }} />
          </div>
        </div>
      )}
      <div onClick={() => setActive(a => !a)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: C.surface3, border: `1px solid ${C.border}`, cursor: "pointer", marginBottom: 22 }}>
        <span style={{ fontSize: 14, color: C.text }}>Actif</span>
        <div style={{ width: 44, height: 26, borderRadius: 999, background: active ? C.accent : C.surface, transition: TR, position: "relative", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 3, left: active ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: TR }} />
        </div>
      </div>

      <button onClick={submit} disabled={!valid} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}>{editing ? "Enregistrer" : "Ajouter"}</button>
      {editing && (
        <button onClick={() => { onDelete(recurring.id); onClose(); }} style={{ width: "100%", background: "transparent", border: "none", color: FIN.depense.c, padding: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Supprimer</button>
      )}

      <CategoryManagerSheet open={catManagerOpen} onClose={() => setCatManagerOpen(false)} categoriesHook={categoriesHook} initialKind={type === "revenu" ? "revenu" : "depense"} />
    </BottomSheet>
  );
}

// Abonnements (Aperçu) — récurrents is_subscription, validation manuelle, reset le 1er
function SubscriptionsBlock({ userId, accounts, categoriesHook, recurringHook }) {
  const { recurring, paidByRecurring, loading, createRecurring, updateRecurring, deleteRecurring, toggleSubscriptionPaid } = recurringHook;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState(null);

  const subs = recurring.filter(r => r.is_subscription);
  const open = (s = null) => { setEditing(s); setSheetOpen(true); };
  const submit = async (data) => { if (editing) await updateRecurring(editing.id, data); else await createRecurring({ ...data, is_subscription: true }); };
  const validate = async (e, s) => {
    e.stopPropagation();
    const ok = await toggleSubscriptionPaid(s);
    if (ok) { setFlash(s.id); setTimeout(() => setFlash(f => (f === s.id ? null : f)), 800); }
  };

  const activeSubs = subs.filter(s => s.active);
  const monthlyTotal = activeSubs.reduce((sum, s) => sum + s.monthly_cost, 0);
  const paidCount = activeSubs.filter(s => paidByRecurring[s.id]).length;
  const paidAmount = activeSubs.filter(s => paidByRecurring[s.id]).reduce((sum, s) => sum + s.amount, 0);

  return (
    <div>
      <Eyebrow color={C.pink} action={<span style={{ fontFamily: FONT_D, fontSize: 14, fontWeight: 700, color: C.pink, fontVariantNumeric: "tabular-nums" }}>{fmtEUR(monthlyTotal)}/mois</span>}>🔁 Abonnements</Eyebrow>
      {activeSubs.length > 0 && (
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, marginTop: -4 }}>
          <span style={{ color: C.green, fontWeight: 600 }}>{paidCount}/{activeSubs.length} passés</span> · {fmtEUR(paidAmount)} déduits ce mois-ci
        </div>
      )}
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 16 }}>Chargement…</div> : (
        <Card style={{ padding: subs.length ? "4px 12px" : 16 }}>
          {subs.length === 0
            ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 8 }}>Aucun abonnement.</div>
            : subs.map((s, i) => {
                const acc = accounts.find(a => a.id === s.account_id);
                const cat = categoriesHook.categories.find(c => c.id === s.category_id);
                const paid = !!paidByRecurring[s.id];
                return (
                  <div key={s.id} onClick={() => open(s)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", cursor: "pointer",
                    borderTop: i ? `1px solid ${C.border}` : "none", opacity: s.active ? 1 : 0.5,
                    background: paid ? FIN.revenu.bg : "transparent", borderRadius: 10, transition: TR,
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: C.accentBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat?.icon || "🔁"}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}{!s.active && " · inactif"}</div>
                      <div style={{ fontSize: 12, color: paid ? C.green : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {paid ? "✓ Passé sur le compte" : `${cat ? `${cat.name} · ` : ""}${acc?.name || "Sans compte"}`}
                      </div>
                    </div>
                    <div style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: paid ? C.green : C.text, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmtEUR(s.amount)}</div>
                    <button onClick={(e) => validate(e, s)}
                      title={paid ? "Annuler" : "Valider le prélèvement"} className={flash === s.id ? "habit-pop" : ""}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                        background: paid ? "linear-gradient(135deg,#34D399,#10b981)" : "transparent",
                        border: `2px solid ${paid ? "#34D399" : C.borderMid}`,
                        boxShadow: paid ? "0 0 12px rgba(52,211,153,0.5)" : "none", transition: TR,
                      }}>
                      {paid && <span style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                    </button>
                  </div>
                );
              })}
        </Card>
      )}
      <button onClick={() => open()} style={{ width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 10, minHeight: 44 }}>+ Nouvel abonnement</button>
      <RecurringFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} onDelete={deleteRecurring} recurring={editing} accounts={accounts} categoriesHook={categoriesHook} forceSubscription />
    </div>
  );
}

// Liste des récurrents (onglet Transactions › Récurrent)
function RecurringList({ accounts, categoriesHook, recurringHook, desktop }) {
  const { recurring, loading, createRecurring, updateRecurring, deleteRecurring, toggleActive } = recurringHook;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const open = (r = null) => { setEditing(r); setSheetOpen(true); };
  const submit = async (data) => { if (editing) await updateRecurring(editing.id, data); else await createRecurring(data); };

  return (
    <div>
      <button onClick={() => open()} style={{ ...primaryBtn, maxWidth: desktop ? 360 : "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Nouveau récurrent
      </button>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div>
        : recurring.length === 0 ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Aucune opération récurrente.</div>
        : <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 10, alignItems: "start" }}>
            {recurring.map(r => {
              const acc = accounts.find(a => a.id === r.account_id);
              const f = FIN[r.type];
              return (
                <Card key={r.id} style={{ padding: "12px 14px", opacity: r.active ? 1 : 0.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div onClick={() => open(r)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                        {r.is_subscription && <span style={{ fontSize: 11 }}>🔁</span>}{r.label}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{recurrenceLabel(r)} · prochaine {r.next_occurrence} · {acc?.name || "—"}</div>
                    </div>
                    <div style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: f.c, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{f.sign === "→" ? "" : f.sign}{fmtEUR(r.amount)}</div>
                    <button onClick={() => toggleActive(r)} title={r.active ? "Désactiver" : "Activer"} style={{
                      width: 40, height: 24, borderRadius: 999, flexShrink: 0, cursor: "pointer", padding: 0,
                      background: r.active ? C.accent : C.surface, border: `1px solid ${C.border}`, position: "relative",
                    }}>
                      <div style={{ position: "absolute", top: 2, left: r.active ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: TR }} />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>}
      <RecurringFormSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} onDelete={deleteRecurring} recurring={editing} accounts={accounts} categoriesHook={categoriesHook} />
    </div>
  );
}

// Liste compacte des soldes par compte (Aperçu)
function AccountsBalanceBlock({ accounts, onNav }) {
  return (
    <div>
      <Eyebrow action={<span onClick={onNav} style={{ fontSize: 12, color: C.muted, cursor: "pointer" }}>Gérer →</span>}>💳 Comptes</Eyebrow>
      {accounts.length === 0
        ? <Card><div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 8 }}>Aucun compte.</div></Card>
        : <Card style={{ padding: "4px 12px" }}>
            {accounts.map((a, i) => {
              const neg = (a.balance ?? 0) < 0;
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: (a.color || C.accent) + "26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{a.icon || "💳"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{ACCOUNT_TYPE_LABEL[a.type]}</div>
                  </div>
                  <div style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: neg ? FIN.depense.c : C.text, fontVariantNumeric: "tabular-nums" }}>{fmtEUR(a.balance, a.currency)}</div>
                </div>
              );
            })}
          </Card>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APERÇU
// ═══════════════════════════════════════════════════════════════════════════════
function FinanceOverview({ userId, month, setMonth, totalBalance, accounts, categoriesHook, recurringHook, openForm, desktop, onNav }) {
  const { transactions, loading } = useFinanceTransactions(userId, { month });
  const kpis = useMemo(() => {
    let dep = 0, rev = 0;
    transactions.forEach(t => { if (t.type === "depense") dep += t.amount; else if (t.type === "revenu") rev += t.amount; });
    return { dep, rev, net: rev - dep };
  }, [transactions]);
  const recent = transactions.slice(0, 6);

  const leftCol = (
    <div>
      <MonthNav month={month} onChange={setMonth} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Dépenses", val: kpis.dep, c: FIN.depense.c },
          { label: "Revenus", val: kpis.rev, c: FIN.revenu.c },
          { label: "Net", val: kpis.net, c: kpis.net >= 0 ? FIN.revenu.c : FIN.depense.c },
        ].map(k => (
          <Card key={k.label} style={{ padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontFamily: FONT_D, fontSize: 17, fontWeight: 700, color: k.c, fontVariantNumeric: "tabular-nums", marginTop: 5 }}>
              {k.label === "Net" && k.val > 0 ? "+" : ""}{fmtEUR(k.val)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const recentBlock = (
    <div>
      <Eyebrow>✦ Derniers mouvements</Eyebrow>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div>
        : recent.length === 0 ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Aucun mouvement ce mois-ci.</div>
        : <Card style={{ padding: "4px 12px" }}>
            {recent.map((t, i) => (
              <div key={t.id} style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <TransactionRow tx={t} accounts={accounts} categories={categoriesHook.categories} onClick={() => openForm(t)} />
              </div>
            ))}
          </Card>}
    </div>
  );

  const accountsBlock = <AccountsBalanceBlock accounts={accounts} onNav={() => onNav?.("comptes")} />;
  const subsBlock = <SubscriptionsBlock userId={userId} accounts={accounts} categoriesHook={categoriesHook} recurringHook={recurringHook} />;

  const noAccounts = accounts.length === 0;

  return (
    <div>
      <BalanceHero total={totalBalance} desktop={desktop} sub={`${accounts.length} compte${accounts.length > 1 ? "s" : ""}`} />
      <button onClick={() => openForm()} disabled={noAccounts}
        title={noAccounts ? "Créez d'abord un compte" : "Nouvelle transaction"}
        style={{ ...primaryBtn, maxWidth: desktop ? 360 : "none", marginBottom: 24, opacity: noAccounts ? 0.5 : 1, cursor: noAccounts ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Nouvelle transaction
      </button>
      {desktop ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>{leftCol}{accountsBlock}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>{recentBlock}{subsBlock}</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {leftCol}
          {accountsBlock}
          {subsBlock}
          {recentBlock}
        </div>
      )}
    </div>
  );
}

// Sous-onglets internes (pills secondaires)
function SubTabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
      {tabs.map(([id, label]) => {
        const active = value === id;
        return (
          <button key={id} onClick={() => onChange(id)} style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
            fontSize: 12.5, fontWeight: active ? 700 : 500, border: `1px solid ${active ? C.accent : C.border}`,
            background: active ? C.accentBg : "transparent", color: active ? C.text : C.muted, transition: TR,
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBJECTIFS D'ÉPARGNE
// ═══════════════════════════════════════════════════════════════════════════════
function GoalFormSheet({ open, onClose, onSubmit, onDelete, goal, accounts }) {
  const editing = !!goal;
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");
  const [accountId, setAccountId] = useState(null);
  const [deadline, setDeadline] = useState("");
  const [icon, setIcon] = useState("🎯");

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setTarget(goal ? String(goal.target_amount) : "");
    setCurrent(goal ? String(goal.current_amount) : "");
    setAccountId(goal?.account_id ?? null);
    setDeadline(goal?.deadline ?? "");
    setIcon(goal?.icon ?? "🎯");
  }, [open, goal]);

  const tgt = parseAmount(target);
  const valid = name.trim() && tgt > 0;
  const submit = () => {
    if (!valid) return;
    onSubmit({ name: name.trim(), target_amount: tgt, current_amount: accountId ? 0 : parseAmount(current || "0"), account_id: accountId, deadline: deadline || null, icon });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? "Modifier l'objectif" : "Nouvel objectif"}>
      <label style={labelStyle}>Nom</label>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Apport, Voyage…" style={{ ...sheetInput, marginBottom: 16 }} />
      <label style={labelStyle}>Montant cible</label>
      <input value={target} onChange={e => setTarget(e.target.value)} inputMode="decimal" placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 16 }} />
      <label style={labelStyle}>Compte suivi (optionnel — sinon manuel)</label>
      <div style={{ marginBottom: 16 }}>
        <ChipPicker items={[{ id: null, name: "Manuel", icon: "✋" }, ...accounts]} value={accountId} onChange={setAccountId} getLabel={a => a.name} getColor={a => a.color || C.accent} getIcon={a => a.icon || "💳"} />
      </div>
      {!accountId && (
        <>
          <label style={labelStyle}>Déjà épargné</label>
          <input value={current} onChange={e => setCurrent(e.target.value)} inputMode="decimal" placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 16 }} />
        </>
      )}
      <label style={labelStyle}>Échéance (optionnel)</label>
      <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ ...sheetInput, marginBottom: 16, colorScheme: "dark" }} />
      <label style={labelStyle}>Icône</label>
      <div style={{ marginBottom: 22 }}><EmojiPicker value={icon} onChange={setIcon} /></div>
      <button onClick={submit} disabled={!valid} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5 }}>{editing ? "Enregistrer" : "Créer"}</button>
      {editing && <button onClick={() => { onDelete(goal.id); onClose(); }} style={{ width: "100%", background: "transparent", border: "none", color: FIN.depense.c, padding: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Supprimer</button>}
    </BottomSheet>
  );
}

function ContributeSheet({ open, onClose, onSubmit, goal }) {
  const [amount, setAmount] = useState("");
  useEffect(() => { if (open) setAmount(""); }, [open]);
  const amt = parseAmount(amount);
  return (
    <BottomSheet open={open} onClose={onClose} title={`Contribuer · ${goal?.name ?? ""}`}>
      <label style={labelStyle}>Montant (négatif pour retirer)</label>
      <input autoFocus value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9,.-]/g, ""))} inputMode="decimal" placeholder="0,00 €" style={{ ...sheetInput, marginBottom: 22 }} />
      <button onClick={() => { if (amt !== 0) { onSubmit(amt); onClose(); } }} disabled={amt === 0} style={{ ...primaryBtn, opacity: amt === 0 ? 0.5 : 1 }}>Valider</button>
    </BottomSheet>
  );
}

function GoalsTab({ userId, accounts, goalsHook, desktop }) {
  const { goals, loading, createGoal, updateGoal, contribute, archiveGoal } = goalsHook;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contribGoal, setContribGoal] = useState(null);
  const open = (g = null) => { setEditing(g); setFormOpen(true); };
  const submit = async (data) => { if (editing) await updateGoal(editing.id, data); else await createGoal(data); };

  // current effectif : compte lié → solde du compte, sinon current_amount
  const effCurrent = (g) => g.account_id ? (accounts.find(a => a.id === g.account_id)?.balance ?? 0) : g.current_amount;

  return (
    <div>
      <button onClick={() => open()} style={{ ...primaryBtn, maxWidth: desktop ? 360 : "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Nouvel objectif
      </button>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div>
        : goals.length === 0 ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Aucun objectif.</div>
        : <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 10, alignItems: "start" }}>
            {goals.map(g => {
              const cur = effCurrent(g);
              const pct = g.target_amount > 0 ? Math.round((cur / g.target_amount) * 100) : 0;
              const done = pct >= 100;
              const rest = Math.max(0, g.target_amount - cur);
              return (
                <Card key={g.id}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <ProgressRing value={pct} color={done ? C.green : C.accent} size={64}>
                      <span style={{ fontFamily: FONT_D, fontSize: 14, fontWeight: 700, color: done ? C.green : C.text }}>{pct}%</span>
                    </ProgressRing>
                    <div onClick={() => open(g)} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 6 }}><span>{g.icon || "🎯"}</span>{g.name}</div>
                      <div style={{ fontFamily: FONT_D, fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginTop: 3 }}>{fmtEUR(cur)} <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>/ {fmtEUR(g.target_amount)}</span></div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{done ? "Atteint 🎉" : `Reste ${fmtEUR(rest)}`}{g.deadline ? ` · ${g.deadline}` : ""}{g.account_id ? " · suivi compte" : ""}</div>
                    </div>
                  </div>
                  {!g.account_id && (
                    <button onClick={() => setContribGoal(g)} style={{ width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 10, padding: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 12, minHeight: 40 }}>+ Contribuer</button>
                  )}
                </Card>
              );
            })}
          </div>}
      <GoalFormSheet open={formOpen} onClose={() => setFormOpen(false)} onSubmit={submit} onDelete={archiveGoal} goal={editing} accounts={accounts} />
      <ContributeSheet open={!!contribGoal} onClose={() => setContribGoal(null)} goal={contribGoal} onSubmit={(amt) => contribute(contribGoal, amt)} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTISSEMENTS
// ═══════════════════════════════════════════════════════════════════════════════
function InvestTab({ desktop }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: desktop ? "80px 24px" : "60px 24px" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>📈</div>
      <div style={{ fontFamily: FONT_D, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>Investissements</div>
      <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.16em", background: C.accentBg, border: `1px solid ${C.borderMid}`, borderRadius: 999, padding: "6px 16px", marginBottom: 14 }}>À venir</div>
      <div style={{ fontSize: 14, color: C.muted, maxWidth: 360, lineHeight: 1.5 }}>Le suivi de portefeuille (actions, ETF, crypto) arrive bientôt.</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGETS — Ce mois (balance + anneaux) & Catégories
// ═══════════════════════════════════════════════════════════════════════════════
function BudgetMonthTab({ userId, categoriesHook, desktop }) {
  const { budgets, loading } = useFinanceBudgets(userId);
  const catBudgets = budgets.filter(b => b.category_id);
  const total = catBudgets.reduce((s, b) => s + b.amount, 0);
  const spent = catBudgets.reduce((s, b) => s + (b.spent || 0), 0);
  const rest = total - spent;
  const restCol = rest >= 0 ? FIN.revenu.c : FIN.depense.c;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 8 }}>Balance budgétaire</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[["Budget", total, C.text], ["Dépensé", spent, FIN.depense.c], ["Reste", rest, restCol]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{l}</div>
              <div style={{ fontFamily: FONT_D, fontSize: 16, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums", marginTop: 4 }}>{l === "Reste" && rest > 0 ? "+" : ""}{fmtEUR(v)}</div>
            </div>
          ))}
        </div>
      </Card>
      {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 24 }}>Chargement…</div>
        : catBudgets.length === 0 ? <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>Aucun budget catégorie. Définis-en dans « Budgets ».</div>
        : <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(2, 1fr)" : "1fr", gap: 10 }}>
            {catBudgets.map(b => {
              const cat = categoriesHook.categories.find(c => c.id === b.category_id);
              const pct = b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0;
              const over = b.spent > b.amount;
              return (
                <Card key={b.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <ProgressRing value={pct} color={over ? FIN.depense.c : C.accent} size={58}>
                    <span style={{ fontFamily: FONT_D, fontSize: 12, fontWeight: 700, color: over ? FIN.depense.c : C.text }}>{pct}%</span>
                  </ProgressRing>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{cat?.icon || "🏷️"} {cat?.name || "—"}</div>
                    <div style={{ fontFamily: FONT_D, fontSize: 13, color: over ? FIN.depense.c : C.muted, fontVariantNumeric: "tabular-nums", marginTop: 3 }}>{fmtEUR(b.spent)} / {fmtEUR(b.amount)}</div>
                    {over && <div style={{ fontSize: 11, color: FIN.depense.c, marginTop: 2 }}>Dépassé de {fmtEUR(b.spent - b.amount)}</div>}
                  </div>
                </Card>
              );
            })}
          </div>}
    </div>
  );
}

function CategoriesTab({ categoriesHook, desktop }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("depense");
  return (
    <div>
      <button onClick={() => setOpen(true)} style={{ ...primaryBtn, maxWidth: desktop ? 360 : "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Gérer les catégories
      </button>
      {["depense", "revenu"].map(k => {
        const list = categoriesHook.byKind(k);
        return (
          <div key={k} style={{ marginBottom: 16 }}>
            <Eyebrow color={k === "depense" ? FIN.depense.c : FIN.revenu.c}>{k === "depense" ? "Dépenses" : "Revenus"}</Eyebrow>
            {list.length === 0 ? <div style={{ color: C.muted, fontSize: 13, padding: "4px 2px" }}>Aucune.</div>
              : <div style={{ display: "grid", gridTemplateColumns: desktop ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
                  {list.map(c => (
                    <div key={c.id} onClick={() => { setKind(k); setOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <span style={{ fontSize: 18 }}>{c.icon || "🏷️"}</span>
                      <span style={{ fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    </div>
                  ))}
                </div>}
          </div>
        );
      })}
      <CategoryManagerSheet open={open} onClose={() => setOpen(false)} categoriesHook={categoriesHook} initialKind={kind} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const SUB_TABS = [
  { id: "apercu",       label: "Aperçu" },
  { id: "transactions", label: "Transactions" },
  { id: "budgets",      label: "Budgets" },
  { id: "comptes",      label: "Comptes" },
  { id: "invest",       label: "Invest." },
];

export default function FinancesModule({ userId }) {
  const desktop = useIsDesktop();
  const [sub, setSub] = useState("apercu");
  const [month, setMonth] = useState(monthKey());
  const [formOpen, setFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);

  const accountsHook = useFinanceAccounts(userId);
  const categoriesHook = useFinanceCategories(userId);
  const goalsHook = useFinanceGoals(userId);
  const recurringHook = useFinanceRecurring(userId);
  // Hook transactions "global" pour create/update (sans filtre de mois on garde léger via mois courant)
  const txMutations = useFinanceTransactions(userId, { month, limit: 1 });

  // Génération idempotente des récurrents échus à l'ouverture du module
  const { runRecurringCatchup } = recurringHook;
  useEffect(() => { runRecurringCatchup(); }, [runRecurringCatchup]);

  const openForm = (tx = null) => { setEditingTx(tx); setFormOpen(true); };
  const submitTx = async (data) => {
    if (editingTx) await txMutations.updateTransaction(editingTx.id, data);
    else await txMutations.createTransaction(data);
    accountsHook.refetch();
  };
  const deleteTx = async (id) => {
    await txMutations.deleteTransaction(id);
    accountsHook.refetch();
  };

  if (!userId)
    return <div className="theme-light" style={{ color: C.muted, textAlign: "center", padding: 40, fontFamily: "var(--font-body)" }}>Connecte-toi pour accéder aux Finances.</div>;

  return (
    <div className="theme-light" style={{ minHeight: "100dvh", color: C.text, fontFamily: "var(--font-body)", paddingBottom: 80 }}>
      <div style={{ width: "100%", margin: "0 auto", padding: desktop ? "28px 40px 0" : "16px 16px 0" }}>

        {/* Sous-onglets */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 20, paddingBottom: 2 }}>
          {SUB_TABS.map(t => {
            const active = sub === t.id;
            return (
              <button key={t.id} onClick={() => setSub(t.id)} style={{
                flexShrink: 0, padding: "8px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: active ? 700 : 500, border: "none",
                background: active ? GRAD : C.surface2, color: active ? "#fff" : C.muted,
                boxShadow: active ? GLOW_SM : "none", transition: TR,
              }}>{t.label}</button>
            );
          })}
        </div>

        {sub === "apercu" && (
          <FinanceOverview userId={userId} month={month} setMonth={setMonth} desktop={desktop}
            totalBalance={accountsHook.totalBalance} accounts={accountsHook.accounts}
            categoriesHook={categoriesHook} recurringHook={recurringHook} openForm={openForm} onNav={setSub} />
        )}
        {sub === "transactions" && (
          <TransactionsTab userId={userId} month={month} setMonth={setMonth} desktop={desktop}
            accounts={accountsHook.accounts} categoriesHook={categoriesHook} openForm={openForm}
            recurringHook={recurringHook} />
        )}
        {sub === "budgets" && <BudgetsTab userId={userId} categoriesHook={categoriesHook} desktop={desktop} />}
        {sub === "comptes" && <AccountsList userId={userId} accountsHook={accountsHook} goalsHook={goalsHook} desktop={desktop} />}
        {sub === "invest" && <InvestTab desktop={desktop} />}
      </div>

      <TransactionFormSheet
        open={formOpen} onClose={() => setFormOpen(false)} onSubmit={submitTx} onDelete={deleteTx}
        transaction={editingTx} accounts={accountsHook.accounts} categoriesHook={categoriesHook} />
    </div>
  );
}
