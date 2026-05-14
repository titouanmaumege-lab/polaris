import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { supabase } from "../../supabase";
import { useKnowledgeBases } from "./hooks/useKnowledgeBases";
import {
  useBasePages, useKnowledgePage, useBacklinks,
  syncWikilinks, usePageSearch, useGraphData,
} from "./hooks/useKnowledgePages";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

// ─── Design tokens (copie du design system App.jsx) ───────────────────────────
const C = {
  bg: "#0d0d1a", surface: "#12112a", surface2: "#1a1830", surface3: "#201e38",
  border: "rgba(139,92,246,0.15)", borderMid: "rgba(139,92,246,0.4)",
  accent: "#8b5cf6", accent2: "#6366f1", accentBg: "rgba(139,92,246,0.12)",
  text: "#f1f0ff", muted: "#9391b5", faint: "#524f72",
  green: "#10b981", red: "#ef4444", blue: "#6366f1",
  amber: "#f59e0b", orange: "#f97316",
};
const GRAD = "linear-gradient(135deg, #8b5cf6, #6366f1)";
const TR = "0.18s cubic-bezier(0.4,0,0.2,1)";
const CALLOUT_C = { info: "#3b82f6", warning: "#f59e0b", success: "#10b981", danger: "#ef4444" };
const SOURCE_TYPES = ["book", "video", "article", "podcast", "course", "other"];
const SOURCE_TYPE_LABELS = { book: "📖 Livre", video: "🎬 Vidéo", article: "📰 Article", podcast: "🎙️ Podcast", course: "🎓 Cours", other: "📌 Autre" };
const STATUS_LABELS = { todo: "À faire", in_progress: "En cours", done: "Terminé" };
const STATUS_C = { todo: C.muted, in_progress: C.amber, done: C.green };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

// ─── Petit utilitaire textarea auto-resize ────────────────────────────────────
function AutoTextarea({ value, onChange, onKeyDown, placeholder, style, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value]);
  return (
    <textarea
      ref={ref} autoFocus={autoFocus}
      value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
      placeholder={placeholder} rows={1}
      style={{
        width: "100%", background: "transparent", border: "none", outline: "none",
        color: C.text, fontFamily: "inherit", resize: "none", overflow: "hidden",
        lineHeight: 1.55, ...style,
      }}
    />
  );
}

// ─── EMOJI PICKER (simple) ────────────────────────────────────────────────────
const EMOJIS = ["📚","📄","📝","🧠","💡","🎯","⚡","🔥","📊","📌","🗂️","🔗","💎","🌱","🚀","🎓","📖","🏆","💼","🔬","🎨","🎵","🌍","⭐","✅","❤️","🧩","🔑","🛠️","📐"];

function EmojiPicker({ onSelect, onClose }) {
  return (
    <div style={{ position: "absolute", zIndex: 600, top: "100%", left: 0, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 16, padding: 12, display: "flex", flexWrap: "wrap", gap: 6, width: 220, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      {EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }}
          style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 8, lineHeight: 1 }}>
          {e}
        </button>
      ))}
    </div>
  );
}

// ─── SLASH MENU ───────────────────────────────────────────────────────────────
const BLOCK_TYPES = [
  { type: "heading", label: "Titre H1", icon: "H1" },
  { type: "heading2", label: "Titre H2", icon: "H2" },
  { type: "heading3", label: "Titre H3", icon: "H3" },
  { type: "bullet_list", label: "Liste à puces", icon: "•" },
  { type: "numbered_list", label: "Liste numérotée", icon: "1." },
  { type: "checkbox_list", label: "Cases à cocher", icon: "☑" },
  { type: "quote", label: "Citation", icon: "❝" },
  { type: "callout", label: "Callout", icon: "💬" },
  { type: "code", label: "Code", icon: "</>" },
  { type: "divider", label: "Séparateur", icon: "—" },
  { type: "youtube", label: "YouTube", icon: "▶" },
  { type: "table", label: "Tableau", icon: "⊞" },
];

function SlashMenu({ onSelect, onClose, filter }) {
  const filtered = BLOCK_TYPES.filter(b => b.label.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div style={{ position: "absolute", zIndex: 600, top: "calc(100% + 4px)", left: 0, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 14, overflow: "hidden", minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      {filtered.length === 0
        ? <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>Aucun résultat</div>
        : filtered.map(b => (
          <div key={b.type} onClick={() => { onSelect(b.type); onClose(); }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: C.text, transition: TR }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface3}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontWeight: 700, color: C.accent, width: 24, textAlign: "center", fontSize: 11 }}>{b.icon}</span>
            {b.label}
          </div>
        ))
      }
    </div>
  );
}

// ─── WIKILINK AUTOCOMPLETE ────────────────────────────────────────────────────
function WikilinkAutocomplete({ query, allPages, onSelect, onClose }) {
  const filtered = allPages.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);
  return (
    <div style={{ position: "absolute", zIndex: 600, top: "calc(100% + 4px)", left: 0, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 14, overflow: "hidden", minWidth: 240, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
      {filtered.length === 0
        ? <div style={{ padding: "10px 14px", fontSize: 13, color: C.muted }}>Aucune page trouvée</div>
        : filtered.map(p => (
          <div key={p.id} onClick={() => onSelect(p)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13, color: C.text }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface3}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span>{p.emoji}</span>
            <div>
              <div style={{ fontWeight: 500 }}>{p.title}</div>
              {p.knowledge_bases && <div style={{ fontSize: 11, color: C.muted }}>{p.knowledge_bases.emoji} {p.knowledge_bases.name}</div>}
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ─── BLOCK RENDERER / EDITOR ──────────────────────────────────────────────────
function renderInlineText(text, onPageNav) {
  const parts = text.split(/(\{\{link:[^:]+:[^}]+\}\})/g);
  return parts.map((part, i) => {
    const m = part.match(/\{\{link:([^:]+):([^}]+)\}\}/);
    if (m) {
      return (
        <span key={i} onClick={() => onPageNav(m[1])}
          style={{ color: C.accent, textDecoration: "underline", cursor: "pointer", textDecorationStyle: "dotted" }}>
          {m[2]}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function BlockEditor({ block, onChange, onDelete, onAddBelow, onMoveUp, onMoveDown, allPages, onPageNav, isFirst, isLast }) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiQuery, setWikiQuery] = useState("");
  const [wikiInsertInfo, setWikiInsertInfo] = useState(null);

  const handleTextChange = (text) => {
    // Markdown shortcuts
    if (block.type === "paragraph") {
      if (text.startsWith("# ")) return onChange({ ...block, type: "heading", data: { text: text.slice(2), level: 1 } });
      if (text.startsWith("## ")) return onChange({ ...block, type: "heading", data: { text: text.slice(3), level: 2 } });
      if (text.startsWith("### ")) return onChange({ ...block, type: "heading", data: { text: text.slice(4), level: 3 } });
      if (text.startsWith("- ") || text.startsWith("* ")) return onChange({ ...block, type: "bullet_list", data: { items: [text.slice(2)] } });
      if (/^\d+\. /.test(text)) return onChange({ ...block, type: "numbered_list", data: { items: [text.replace(/^\d+\. /, "")] } });
      if (text.startsWith("[] ") || text.startsWith("[ ] ")) return onChange({ ...block, type: "checkbox_list", data: { items: [{ text: text.replace(/^\[[ x]?\] /, ""), checked: false }] } });
      if (text.startsWith("> ")) return onChange({ ...block, type: "quote", data: { text: text.slice(2) } });
      if (text === "---") return onChange({ ...block, type: "divider", data: {} });
      if (text.startsWith("!info ")) return onChange({ ...block, type: "callout", data: { text: text.slice(6), variant: "info" } });
      if (text.startsWith("!warning ")) return onChange({ ...block, type: "callout", data: { text: text.slice(9), variant: "warning" } });
      if (text.startsWith("!success ")) return onChange({ ...block, type: "callout", data: { text: text.slice(9), variant: "success" } });
      if (text.startsWith("!danger ")) return onChange({ ...block, type: "callout", data: { text: text.slice(8), variant: "danger" } });
    }

    // Slash menu
    const lastSlash = text.lastIndexOf("/");
    if (lastSlash !== -1 && lastSlash === text.length - 1) {
      setSlashOpen(true); setSlashFilter("");
      onChange({ ...block, data: { ...block.data, text: text.slice(0, lastSlash) } });
      return;
    }
    if (slashOpen) {
      const afterSlash = text.slice(text.lastIndexOf("/") + 1);
      setSlashFilter(afterSlash);
    }

    // Wikilink
    const lastBracket = text.lastIndexOf("[[");
    if (lastBracket !== -1 && !text.slice(lastBracket).includes("]]")) {
      const wq = text.slice(lastBracket + 2);
      setWikiQuery(wq);
      setWikiOpen(true);
      setWikiInsertInfo({ pos: lastBracket, text });
    } else {
      setWikiOpen(false);
    }

    onChange({ ...block, data: { ...block.data, text } });
  };

  const applySlashType = (type) => {
    const typeMap = {
      heading: { type: "heading", data: { text: "", level: 1 } },
      heading2: { type: "heading", data: { text: "", level: 2 } },
      heading3: { type: "heading", data: { text: "", level: 3 } },
      bullet_list: { type: "bullet_list", data: { items: [""] } },
      numbered_list: { type: "numbered_list", data: { items: [""] } },
      checkbox_list: { type: "checkbox_list", data: { items: [{ text: "", checked: false }] } },
      quote: { type: "quote", data: { text: "" } },
      callout: { type: "callout", data: { text: "", variant: "info" } },
      code: { type: "code", data: { code: "", language: "js" } },
      divider: { type: "divider", data: {} },
      youtube: { type: "youtube", data: { url: "", video_id: "" } },
      table: { type: "table", data: { headers: ["Col 1", "Col 2"], rows: [["", ""]] } },
    };
    onChange({ ...block, ...(typeMap[type] || {}) });
  };

  const applyWikilink = (page) => {
    if (!wikiInsertInfo) return;
    const before = wikiInsertInfo.text.slice(0, wikiInsertInfo.pos);
    const token = `{{link:${page.id}:${page.title}}}`;
    const newText = before + token;
    onChange({ ...block, data: { ...block.data, text: newText } });
    setWikiOpen(false);
  };

  const controlBar = (
    <div style={{ display: "flex", gap: 4, opacity: 0.4, transition: TR, position: "absolute", right: 0, top: -2, zIndex: 10, background: C.surface2, borderRadius: 8, padding: "1px 2px" }}
      className="block-controls">
      {!isFirst && <span onClick={onMoveUp} style={{ cursor: "pointer", color: C.muted, fontSize: 12, padding: "2px 5px" }}>↑</span>}
      {!isLast && <span onClick={onMoveDown} style={{ cursor: "pointer", color: C.muted, fontSize: 12, padding: "2px 5px" }}>↓</span>}
      <span onClick={onAddBelow} style={{ cursor: "pointer", color: C.muted, fontSize: 12, padding: "2px 5px" }}>+</span>
      <span onClick={onDelete} style={{ cursor: "pointer", color: C.red, fontSize: 12, padding: "2px 5px" }}>✕</span>
    </div>
  );

  const wrapper = (children) => (
    <div style={{ position: "relative", marginBottom: 4 }}
      onMouseEnter={e => { const c = e.currentTarget.querySelector(".block-controls"); if (c) c.style.opacity = "1"; }}
      onMouseLeave={e => { const c = e.currentTarget.querySelector(".block-controls"); if (c) c.style.opacity = "0.4"; }}
    >
      {controlBar}
      {children}
      {slashOpen && <SlashMenu onSelect={applySlashType} onClose={() => setSlashOpen(false)} filter={slashFilter} />}
      {wikiOpen && <WikilinkAutocomplete query={wikiQuery} allPages={allPages} onSelect={applyWikilink} onClose={() => setWikiOpen(false)} />}
    </div>
  );

  if (block.type === "paragraph") {
    return wrapper(
      <AutoTextarea
        value={block.data.text || ""} onChange={handleTextChange}
        placeholder="Écrire quelque chose... (/ pour les blocs, [[ pour les liens)"
        style={{ fontSize: 14, color: C.text }}
      />
    );
  }

  if (block.type === "heading") {
    const sizes = { 1: 22, 2: 18, 3: 16 };
    return wrapper(
      <AutoTextarea
        value={block.data.text || ""} onChange={v => onChange({ ...block, data: { ...block.data, text: v } })}
        placeholder={`Titre ${block.data.level}`}
        style={{ fontSize: sizes[block.data.level] || 18, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}
      />
    );
  }

  if (block.type === "bullet_list" || block.type === "numbered_list") {
    const items = block.data.items || [""];
    return wrapper(
      <div>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 2 }}>
            <span style={{ color: C.accent, flexShrink: 0, fontSize: 13, marginTop: 3, minWidth: 16 }}>
              {block.type === "numbered_list" ? `${i + 1}.` : "•"}
            </span>
            <AutoTextarea
              value={item} onChange={v => {
                const newItems = [...items]; newItems[i] = v;
                onChange({ ...block, data: { items: newItems } });
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const newItems = [...items]; newItems.splice(i + 1, 0, "");
                  onChange({ ...block, data: { items: newItems } });
                }
                if (e.key === "Backspace" && item === "" && items.length > 1) {
                  e.preventDefault();
                  const newItems = items.filter((_, j) => j !== i);
                  onChange({ ...block, data: { items: newItems } });
                }
              }}
              placeholder="Élément..."
              style={{ fontSize: 14, flex: 1 }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "checkbox_list") {
    const items = block.data.items || [{ text: "", checked: false }];
    return wrapper(
      <div>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
            <span onClick={() => {
              const newItems = [...items]; newItems[i] = { ...item, checked: !item.checked };
              onChange({ ...block, data: { items: newItems } });
            }} style={{ flexShrink: 0, fontSize: 18, cursor: "pointer", marginTop: 1 }}>
              {item.checked ? "✅" : "⬜"}
            </span>
            <AutoTextarea
              value={item.text} onChange={v => {
                const newItems = [...items]; newItems[i] = { ...item, text: v };
                onChange({ ...block, data: { items: newItems } });
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const newItems = [...items]; newItems.splice(i + 1, 0, { text: "", checked: false });
                  onChange({ ...block, data: { items: newItems } });
                }
                if (e.key === "Backspace" && item.text === "" && items.length > 1) {
                  e.preventDefault();
                  const newItems = items.filter((_, j) => j !== i);
                  onChange({ ...block, data: { items: newItems } });
                }
              }}
              placeholder="Tâche..."
              style={{ fontSize: 14, flex: 1, textDecoration: item.checked ? "line-through" : "none", color: item.checked ? C.muted : C.text }}
            />
          </div>
        ))}
        <button onClick={() => onChange({ ...block, data: { items: [...items, { text: "", checked: false }] } })}
          style={{ fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
          + Ajouter
        </button>
      </div>
    );
  }

  if (block.type === "quote") {
    return wrapper(
      <div style={{ borderLeft: `3px solid ${C.accent}`, paddingLeft: 14, margin: "4px 0" }}>
        <AutoTextarea
          value={block.data.text || ""} onChange={v => onChange({ ...block, data: { ...block.data, text: v } })}
          placeholder="Citation..."
          style={{ fontSize: 14, fontStyle: "italic", color: C.muted }}
        />
        {block.data.author !== undefined && (
          <input value={block.data.author || ""} onChange={e => onChange({ ...block, data: { ...block.data, author: e.target.value } })}
            placeholder="— Auteur" style={{ background: "none", border: "none", outline: "none", fontSize: 12, color: C.faint, fontFamily: "inherit", width: "100%" }} />
        )}
      </div>
    );
  }

  if (block.type === "callout") {
    const cc = CALLOUT_C[block.data.variant] || C.accent;
    const variants = ["info", "warning", "success", "danger"];
    return wrapper(
      <div style={{ background: cc + "18", border: `1px solid ${cc}44`, borderLeft: `3px solid ${cc}`, borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          {variants.map(v => (
            <button key={v} onClick={() => onChange({ ...block, data: { ...block.data, variant: v } })}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, border: `1px solid ${CALLOUT_C[v]}44`, background: block.data.variant === v ? CALLOUT_C[v] + "33" : "transparent", color: CALLOUT_C[v], cursor: "pointer", fontFamily: "inherit" }}>
              {v}
            </button>
          ))}
        </div>
        <AutoTextarea
          value={block.data.text || ""} onChange={v => onChange({ ...block, data: { ...block.data, text: v } })}
          placeholder="Contenu du callout..."
          style={{ fontSize: 14, color: C.text }}
        />
      </div>
    );
  }

  if (block.type === "code") {
    return wrapper(
      <div style={{ background: C.surface3, borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <input value={block.data.language || "js"} onChange={e => onChange({ ...block, data: { ...block.data, language: e.target.value } })}
            style={{ background: "none", border: "none", outline: "none", fontSize: 11, color: C.muted, fontFamily: "monospace", width: 80 }} />
        </div>
        <AutoTextarea
          value={block.data.code || ""} onChange={v => onChange({ ...block, data: { ...block.data, code: v } })}
          placeholder="Code..."
          style={{ fontSize: 13, fontFamily: "monospace", color: "#a5f3fc" }}
        />
      </div>
    );
  }

  if (block.type === "divider") {
    return wrapper(<hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "8px 0" }} />);
  }

  if (block.type === "youtube") {
    const extractId = url => {
      const m = url.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      return m ? m[1] : null;
    };
    const videoId = extractId(block.data.url || "");
    return wrapper(
      <div>
        {!videoId ? (
          <input value={block.data.url || ""} onChange={e => {
            const url = e.target.value;
            const id = extractId(url);
            onChange({ ...block, data: { url, video_id: id || "" } });
          }} placeholder="URL YouTube (ex: https://youtu.be/...)"
            style={{ width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "10px 12px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        ) : (
          <div style={{ borderRadius: 10, overflow: "hidden", height: 220 }}>
            <iframe src={`https://www.youtube.com/embed/${videoId}`}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen />
          </div>
        )}
      </div>
    );
  }

  if (block.type === "table") {
    const { headers, rows } = block.data;
    return wrapper(
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ border: `1px solid ${C.border}`, padding: "6px 10px", background: C.surface3 }}>
                  <input value={h} onChange={e => {
                    const newH = [...headers]; newH[i] = e.target.value;
                    onChange({ ...block, data: { ...block.data, headers: newH } });
                  }} style={{ background: "none", border: "none", outline: "none", color: C.text, fontWeight: 700, fontFamily: "inherit", width: "100%" }} />
                </th>
              ))}
              <th style={{ border: `1px solid ${C.border}`, padding: "0 6px", background: C.surface3 }}>
                <button onClick={() => onChange({ ...block, data: { headers: [...headers, "Col"], rows: rows.map(r => [...r, ""]) } })}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ border: `1px solid ${C.border}`, padding: "4px 8px" }}>
                    <input value={cell} onChange={e => {
                      const newRows = rows.map((r, rj) => rj === ri ? r.map((c, cj) => cj === ci ? e.target.value : c) : r);
                      onChange({ ...block, data: { ...block.data, rows: newRows } });
                    }} style={{ background: "none", border: "none", outline: "none", color: C.text, fontFamily: "inherit", width: "100%" }} />
                  </td>
                ))}
                <td style={{ border: `1px solid ${C.border}`, padding: "0 6px" }}>
                  <button onClick={() => onChange({ ...block, data: { ...block.data, rows: rows.filter((_, j) => j !== ri) } })}
                    style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={headers.length + 1} style={{ border: `1px solid ${C.border}`, padding: "4px 8px" }}>
                <button onClick={() => onChange({ ...block, data: { ...block.data, rows: [...rows, headers.map(() => "")] } })}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>+ Ligne</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return wrapper(<div style={{ color: C.muted, fontSize: 13 }}>[bloc inconnu: {block.type}]</div>);
}

// ─── PAGE EDITOR ──────────────────────────────────────────────────────────────
function PageEditor({ content, onChange, allPages, onPageNav }) {
  const blocks = content && content.length > 0 ? content : [{ id: uid(), type: "paragraph", data: { text: "" } }];

  const TEXT_TYPES = new Set(["paragraph", "heading", "heading2", "heading3", "bullet_list", "numbered_list", "checkbox_list", "quote", "callout", "code"]);
  const updateBlock = (idx, block) => {
    const nb = [...blocks]; nb[idx] = block;
    if (idx === nb.length - 1 && !TEXT_TYPES.has(block.type)) {
      nb.push({ id: uid(), type: "paragraph", data: { text: "" } });
    }
    onChange(nb);
  };
  const deleteBlock = (idx) => {
    if (blocks.length === 1) { onChange([{ id: uid(), type: "paragraph", data: { text: "" } }]); return; }
    onChange(blocks.filter((_, i) => i !== idx));
  };
  const addBelow = (idx) => {
    const nb = [...blocks]; nb.splice(idx + 1, 0, { id: uid(), type: "paragraph", data: { text: "" } });
    onChange(nb);
  };
  const moveUp = (idx) => {
    if (idx === 0) return;
    const nb = [...blocks]; [nb[idx - 1], nb[idx]] = [nb[idx], nb[idx - 1]]; onChange(nb);
  };
  const moveDown = (idx) => {
    if (idx === blocks.length - 1) return;
    const nb = [...blocks]; [nb[idx], nb[idx + 1]] = [nb[idx + 1], nb[idx]]; onChange(nb);
  };

  return (
    <div>
      {blocks.map((block, idx) => (
        <BlockEditor
          key={block.id} block={block}
          onChange={b => updateBlock(idx, b)}
          onDelete={() => deleteBlock(idx)}
          onAddBelow={() => addBelow(idx)}
          onMoveUp={() => moveUp(idx)}
          onMoveDown={() => moveDown(idx)}
          allPages={allPages}
          onPageNav={onPageNav}
          isFirst={idx === 0} isLast={idx === blocks.length - 1}
        />
      ))}
      <button onClick={() => addBelow(blocks.length - 1)}
        style={{ marginTop: 12, background: "none", border: `1px dashed ${C.border}`, color: C.muted, padding: "8px 16px", borderRadius: 10, fontSize: 12, cursor: "pointer", fontFamily: "inherit", width: "100%", transition: TR }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
      >
        + Ajouter un bloc
      </button>
    </div>
  );
}

// ─── BACKLINKS PANEL ──────────────────────────────────────────────────────────
function BacklinksPanel({ backlinks, onPageNav }) {
  const [open, setOpen] = useState(false);
  if (!backlinks.length) return null;
  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: open ? 12 : 0 }}>
        <span style={{ fontSize: 13, color: C.muted }}>🔗 {backlinks.length} page{backlinks.length > 1 ? "s" : ""} référencent celle-ci</span>
        <span style={{ fontSize: 11, color: C.faint }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && backlinks.map(bl => {
        const p = bl.knowledge_pages;
        if (!p) return null;
        return (
          <div key={bl.source_page_id} onClick={() => onPageNav(p.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 4, background: C.surface2 }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface3}
            onMouseLeave={e => e.currentTarget.style.background = C.surface2}
          >
            <span>{p.emoji}</span>
            <div>
              <div style={{ fontSize: 13, color: C.text }}>{p.title}</div>
              {p.knowledge_bases && <div style={{ fontSize: 11, color: C.muted }}>{p.knowledge_bases.emoji} {p.knowledge_bases.name}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SOURCE METADATA PANEL ────────────────────────────────────────────────────
function SourceMetaPanel({ meta, onChange }) {
  const m = meta || { url: "", author: "", source_type: "book", consumed_date: "", status: "todo", rating: null };
  const upd = patch => onChange({ ...m, ...patch });
  const extractYtId = url => { const r = (url || "").match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/); return r ? r[1] : null; };
  const ytId = extractYtId(m.url);
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
      {ytId && (
        <div style={{ borderRadius: 10, overflow: "hidden", height: 200, marginBottom: 14 }}>
          <iframe src={`https://www.youtube.com/embed/${ytId}`}
            style={{ width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen />
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: C.muted, width: 28 }}>🌐</span>
          <input value={m.url || ""} onChange={e => upd({ url: e.target.value })} placeholder="URL"
            style={{ flex: 1, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: C.muted, width: 28 }}>👤</span>
          <input value={m.author || ""} onChange={e => upd({ author: e.target.value })} placeholder="Auteur"
            style={{ flex: 1, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <span style={{ fontSize: 13, color: C.muted, width: 28 }}>📚</span>
            <select value={m.source_type || "book"} onChange={e => upd({ source_type: e.target.value })}
              style={{ flex: 1, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
              {SOURCE_TYPES.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <span style={{ fontSize: 13, color: C.muted, width: 28 }}>📅</span>
            <input type="date" value={m.consumed_date || ""} onChange={e => upd({ consumed_date: e.target.value })}
              style={{ flex: 1, background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "7px 10px", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: C.muted }}>🔘</span>
            {["todo", "in_progress", "done"].map(s => (
              <button key={s} onClick={() => upd({ status: s })}
                style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, border: `1px solid ${m.status === s ? STATUS_C[s] : C.border}`, background: m.status === s ? STATUS_C[s] + "22" : "transparent", color: m.status === s ? STATUS_C[s] : C.muted, cursor: "pointer", fontFamily: "inherit" }}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 13, color: C.muted }}>⭐</span>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} onClick={() => upd({ rating: m.rating === n ? null : n })}
                style={{ fontSize: 18, cursor: "pointer", color: (m.rating || 0) >= n ? C.amber : C.faint }}>★</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAGS PANEL ───────────────────────────────────────────────────────────────
function TagsPanel({ pageId, userId }) {
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [input, setInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!pageId || !userId) return;
    supabase.from("knowledge_page_tags")
      .select("tag_id, knowledge_tags(*)")
      .eq("page_id", pageId)
      .then(({ data }) => setTags((data || []).map(r => r.knowledge_tags)));
    supabase.from("knowledge_tags")
      .select("*")
      .eq("owner_id", userId)
      .then(({ data }) => setAllTags(data || []));
  }, [pageId, userId]);

  const filterSuggestions = (q) => {
    setSuggestions(allTags.filter(t => t.name.includes(q.toLowerCase()) && !tags.find(x => x.id === t.id)));
  };

  const addTag = async (tag) => {
    await supabase.from("knowledge_page_tags").insert({ page_id: pageId, tag_id: tag.id });
    setTags(t => [...t, tag]); setInput(""); setShowInput(false); setSuggestions([]);
  };

  const createAndAdd = async () => {
    if (!input.trim()) return;
    const { data } = await supabase.from("knowledge_tags").insert({ owner_id: userId, name: input.toLowerCase().trim(), color: "#6b7280" }).select().single();
    if (data) { setAllTags(t => [...t, data]); await addTag(data); }
  };

  const removeTag = async (tagId) => {
    await supabase.from("knowledge_page_tags").delete().eq("page_id", pageId).eq("tag_id", tagId);
    setTags(t => t.filter(x => x.id !== tagId));
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, alignItems: "center" }}>
      {tags.map(t => (
        <span key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, background: C.surface3, padding: "3px 10px", borderRadius: 999, fontSize: 12, color: C.muted }}>
          #{t.name}
          <span onClick={() => removeTag(t.id)} style={{ cursor: "pointer", color: C.faint, marginLeft: 2 }}>✕</span>
        </span>
      ))}
      {showInput ? (
        <div style={{ position: "relative" }}>
          <input autoFocus value={input} onChange={e => { setInput(e.target.value); filterSuggestions(e.target.value); }}
            onKeyDown={e => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") setShowInput(false); }}
            placeholder="#tag"
            style={{ background: C.surface3, border: `1px solid ${C.borderMid}`, color: C.text, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontFamily: "inherit", outline: "none", width: 100 }} />
          {suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 10, overflow: "hidden", zIndex: 600, minWidth: 140 }}>
              {suggestions.map(t => (
                <div key={t.id} onClick={() => addTag(t)}
                  style={{ padding: "7px 12px", fontSize: 12, color: C.text, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >#{t.name}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setShowInput(true)}
          style={{ background: "none", border: `1px dashed ${C.border}`, color: C.muted, padding: "3px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          + tag
        </button>
      )}
    </div>
  );
}

// ─── PAGE VIEW ────────────────────────────────────────────────────────────────
function PageView({ pageId, userId, onBack, breadcrumb, allPages, onPageNav }) {
  const { page, loading, saving, saveContent, saveMeta } = useKnowledgePage(pageId);
  const backlinks = useBacklinks(pageId, userId);
  const [emojiOpen, setEmojiOpen] = useState(false);

  if (loading) return <div style={{ padding: 32, color: C.muted, textAlign: "center" }}>Chargement…</div>;
  if (!page) return <div style={{ padding: 32, color: C.red }}>Page introuvable.</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer", padding: "0 4px" }}>←</button>
        <div style={{ flex: 1, fontSize: 11, color: C.muted, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {breadcrumb.join(" / ")}
        </div>
        {saving && <span style={{ fontSize: 11, color: C.muted }}>Enregistrement…</span>}
        {!saving && <span style={{ fontSize: 11, color: C.green }}>✓</span>}
      </div>

      <div style={{ padding: "20px 16px 120px" }}>
        {/* Titre */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12, position: "relative" }}>
          <div style={{ position: "relative" }}>
            <span onClick={() => setEmojiOpen(o => !o)} style={{ fontSize: 36, cursor: "pointer", lineHeight: 1 }}>{page.emoji}</span>
            {emojiOpen && <EmojiPicker onSelect={e => saveMeta({ emoji: e })} onClose={() => setEmojiOpen(false)} />}
          </div>
          <div style={{ flex: 1 }}>
            <AutoTextarea
              value={page.title} onChange={v => saveMeta({ title: v })}
              placeholder="Sans titre"
              style={{ fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}
            />
          </div>
        </div>

        <TagsPanel pageId={pageId} userId={userId} />

        {/* Source metadata */}
        {page.page_type === "source" && (
          <SourceMetaPanel
            meta={page.source_metadata}
            onChange={meta => saveMeta({ source_metadata: meta })}
          />
        )}

        {/* Contenu */}
        <PageEditor
          content={page.content}
          onChange={content => {
            saveContent(content);
            syncWikilinks(pageId, content, userId);
          }}
          allPages={allPages}
          onPageNav={onPageNav}
        />

        <BacklinksPanel backlinks={backlinks} onPageNav={onPageNav} />
      </div>
    </div>
  );
}

// ─── BASE VIEW ────────────────────────────────────────────────────────────────
function BaseView({ base, userId, onBack, onPageOpen, onBaseOpen, onBaseUpdate, onCreateSubBase, onArchiveBase, allBases }) {
  const { pages, loading, createPage, archivePage } = useBasePages(base.id, userId);
  const { results, search, clear } = usePageSearch(userId);
  const [searchQ, setSearchQ] = useState("");
  const [creating, setCreating] = useState(null); // null | "note" | "source"
  const [newPageTitle, setNewPageTitle] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState({});
  const [showCreateSub, setShowCreateSub] = useState(false);
  const subBases = (allBases || []).filter(b => b.parent_id === base.id);

  const rootPages = pages.filter(p => !p.parent_id);
  const childrenOf = pid => pages.filter(p => p.parent_id === pid);

  const handleCreate = async (parentId = null) => {
    const p = await createPage({ title: newPageTitle || "Sans titre", page_type: creating || "note", parent_id: parentId });
    setCreating(null); setNewPageTitle("");
    if (p) onPageOpen(p, base, parentId ? pages.find(x => x.id === parentId) : null);
  };

  const renderPageRow = (p, depth = 0) => {
    const children = childrenOf(p.id);
    const expanded = expandedPages[p.id];
    return (
      <div key={p.id}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", paddingLeft: 14 + depth * 16, borderRadius: 12, cursor: "pointer", marginBottom: 4, background: C.surface2, transition: TR }}
          onMouseEnter={e => e.currentTarget.style.background = C.surface3}
          onMouseLeave={e => e.currentTarget.style.background = C.surface2}
        >
          <span onClick={() => children.length && setExpandedPages(e => ({ ...e, [p.id]: !e[p.id] }))} style={{ color: C.faint, fontSize: 11, width: 14 }}>
            {children.length ? (expanded ? "▼" : "▶") : " "}
          </span>
          <span onClick={() => onPageOpen(p, base, null)}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{p.emoji}</span>
            <span style={{ fontSize: 14, color: C.text, flex: 1 }}>{p.title}</span>
            {p.page_type === "source" && <span style={{ fontSize: 10, color: C.blue, background: C.blueBg, padding: "2px 7px", borderRadius: 999 }}>source</span>}
            {children.length > 0 && <span style={{ fontSize: 11, color: C.faint }}>({children.length})</span>}
          </span>
          <div style={{ display: "flex", gap: 8, opacity: 0, transition: TR }} className="row-actions">
            <span onClick={() => { setCreating("note"); }} style={{ fontSize: 12, color: C.muted, cursor: "pointer" }} title="Sous-page">+</span>
            <span onClick={() => archivePage(p.id)} style={{ fontSize: 12, color: C.red, cursor: "pointer" }}>🗑</span>
          </div>
        </div>
        {expanded && children.map(c => renderPageRow(c, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>←</button>
          <div style={{ position: "relative" }}>
            <span onClick={() => setEmojiOpen(o => !o)} style={{ fontSize: 22, cursor: "pointer" }}>{base.emoji}</span>
            {emojiOpen && <EmojiPicker onSelect={e => onBaseUpdate(base.id, { emoji: e })} onClose={() => setEmojiOpen(false)} />}
          </div>
          <input value={base.name} onChange={e => onBaseUpdate(base.id, { name: e.target.value })}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit" }} />
          <button onClick={async () => {
            if (!window.confirm(`Supprimer "${base.name}" ?`)) return;
            await onArchiveBase(base.id);
            onBack();
          }} style={{ background: "none", border: "none", color: C.red, fontSize: 16, cursor: "pointer", padding: "0 4px" }} title="Supprimer cette base">🗑</button>
        </div>
        {/* Search */}
        <div style={{ marginTop: 10, position: "relative" }}>
          <input value={searchQ} onChange={e => { setSearchQ(e.target.value); search(e.target.value, base.id); }}
            placeholder="🔍 Chercher dans cette base…"
            style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "9px 14px", borderRadius: 12, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          {searchQ && <button onClick={() => { setSearchQ(""); clear(); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>✕</button>}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {/* Sous-bases */}
        {(subBases.length > 0 || true) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Sous-bases</span>
              <button onClick={() => setShowCreateSub(true)}
                style={{ background: "none", border: "none", color: C.accent, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                + Sous-base
              </button>
            </div>
            {subBases.length === 0
              ? <div style={{ fontSize: 12, color: C.faint, padding: "8px 0" }}>Aucune sous-base.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {subBases.map(sub => (
                    <div key={sub.id} onClick={() => onBaseOpen(sub)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: C.surface2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${sub.color}`, cursor: "pointer", transition: TR }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface3}
                      onMouseLeave={e => e.currentTarget.style.background = C.surface2}
                    >
                      <span style={{ fontSize: 18 }}>{sub.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: 500, color: C.text, flex: 1 }}>{sub.name}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>▶</span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* Search results */}
        {searchQ && results.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Résultats</div>
            {results.map(p => (
              <div key={p.id} onClick={() => { clear(); setSearchQ(""); onPageOpen(p, base, null); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, marginBottom: 4, background: C.surface2, cursor: "pointer" }}>
                <span>{p.emoji}</span>
                <span style={{ fontSize: 14, color: C.text }}>{p.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pages list */}
        {loading
          ? <div style={{ color: C.muted, textAlign: "center", padding: 32 }}>Chargement…</div>
          : rootPages.length === 0
            ? <div style={{ color: C.muted, textAlign: "center", padding: 48, fontSize: 13 }}>Aucune page dans cette base.</div>
            : rootPages.map(p => renderPageRow(p))
        }

        {/* Create page form */}
        {creating && (
          <div style={{ background: C.surface2, border: `1px solid ${C.borderMid}`, borderRadius: 14, padding: 14, marginTop: 12 }}>
            <input autoFocus value={newPageTitle} onChange={e => setNewPageTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreating(null); setNewPageTitle(""); } }}
              placeholder="Titre de la page..."
              style={{ width: "100%", background: C.surface3, border: `1px solid ${C.border}`, color: C.text, padding: "10px 14px", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {["note", "source"].map(t => (
                <button key={t} onClick={() => setCreating(t)}
                  style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, border: `1px solid ${creating === t ? C.accent : C.border}`, background: creating === t ? C.accentBg : "transparent", color: creating === t ? C.accent : C.muted, cursor: "pointer", fontFamily: "inherit" }}>
                  {t === "note" ? "📝 Note" : "📖 Source"}
                </button>
              ))}
              <button onClick={() => handleCreate()} style={{ marginLeft: "auto", background: GRAD, color: "#fff", border: "none", padding: "6px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Créer</button>
              <button onClick={() => { setCreating(null); setNewPageTitle(""); }} style={{ background: C.surface3, color: C.muted, border: `1px solid ${C.border}`, padding: "6px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
            </div>
          </div>
        )}

        {!creating && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={() => setCreating("note")}
              style={{ flex: 1, background: C.surface2, border: `1px dashed ${C.border}`, color: C.muted, padding: "11px", borderRadius: 12, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: TR }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >+ Note</button>
            <button onClick={() => setCreating("source")}
              style={{ flex: 1, background: C.surface2, border: `1px dashed ${C.border}`, color: C.muted, padding: "11px", borderRadius: 12, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: TR }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
            >+ Source</button>
          </div>
        )}
      </div>
      {showCreateSub && (
        <CreateBaseModal
          parentBase={base}
          onClose={() => setShowCreateSub(false)}
          onCreate={async (data) => {
            setShowCreateSub(false);
            if (onCreateSubBase) {
              const newBase = await onCreateSubBase(data);
              if (newBase) onBaseOpen(newBase);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── GRAPH VIEW ───────────────────────────────────────────────────────────────
function GraphView({ userId, onClose, onPageNav }) {
  const { nodes, links } = useGraphData(userId);
  const [filterBases, setFilterBases] = useState(null);
  const bases = [...new Set(nodes.map(n => n.base))];

  const filteredNodes = filterBases ? nodes.filter(n => filterBases.includes(n.base_id)) : nodes;
  const filteredLinks = links.filter(l =>
    filteredNodes.find(n => n.id === l.source || (l.source && l.source.id === l.source)) &&
    filteredNodes.find(n => n.id === l.target || (l.target && l.target.id === l.target))
  );

  const connCounts = {};
  links.forEach(l => {
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;
    connCounts[sid] = (connCounts[sid] || 0) + 1;
    connCounts[tid] = (connCounts[tid] || 0) + 1;
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>←</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>Graphe</span>
        <span style={{ fontSize: 12, color: C.muted }}>{filteredNodes.length} pages · {filteredLinks.length} liens</span>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {nodes.length === 0
          ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontSize: 14 }}>Aucune page liée pour l'instant.</div>
          : (
            <Suspense fallback={<div style={{ color: C.muted, textAlign: "center", padding: 48 }}>Chargement du graphe…</div>}>
              <ForceGraph2D
                graphData={{ nodes: filteredNodes.map(n => ({ ...n, val: (connCounts[n.id] || 0) + 1 })), links: filteredLinks }}
                nodeLabel={n => n.label}
                nodeColor={n => n.color || "#6b7280"}
                nodeVal={n => Math.max(1, (connCounts[n.id] || 0) * 0.5 + 2)}
                linkColor={() => "rgba(139,92,246,0.3)"}
                backgroundColor={C.bg}
                onNodeClick={n => onPageNav(n.id)}
                nodeCanvasObject={(node, ctx, globalScale) => {
                  const label = node.label || "";
                  const fontSize = Math.max(8, 12 / globalScale);
                  ctx.font = `${fontSize}px Inter, sans-serif`;
                  ctx.fillStyle = node.color || "#6b7280";
                  ctx.beginPath();
                  ctx.arc(node.x, node.y, Math.max(2, (connCounts[node.id] || 0) * 0.5 + 4), 0, 2 * Math.PI);
                  ctx.fill();
                  if (globalScale > 1.5) {
                    ctx.fillStyle = "rgba(241,240,255,0.85)";
                    ctx.fillText(label.slice(0, 20), node.x + 6, node.y + 4);
                  }
                }}
              />
            </Suspense>
          )
        }
      </div>
    </div>
  );
}

// ─── QUICK SWITCHER ───────────────────────────────────────────────────────────
function QuickSwitcher({ userId, onSelect, onClose }) {
  const { results, search, clear } = usePageSearch(userId);
  const [q, setQ] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px 16px" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(520px,100%)", background: C.surface, borderRadius: 20, border: `1px solid ${C.borderMid}`, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <input autoFocus value={q} onChange={e => { setQ(e.target.value); search(e.target.value); }}
            onKeyDown={e => { if (e.key === "Escape") onClose(); }}
            placeholder="Chercher une page…"
            style={{ width: "100%", background: "none", border: "none", outline: "none", color: C.text, fontSize: 16, fontFamily: "inherit" }} />
        </div>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {results.length === 0 && q && (
            <div style={{ padding: "20px 16px", color: C.muted, fontSize: 13, textAlign: "center" }}>Aucun résultat pour "{q}"</div>
          )}
          {results.length === 0 && !q && (
            <div style={{ padding: "20px 16px", color: C.muted, fontSize: 13, textAlign: "center" }}>Commencer à taper…</div>
          )}
          {results.map(p => (
            <div key={p.id} onClick={() => { onSelect(p); onClose(); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", transition: TR }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 20 }}>{p.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{p.title}</div>
                {p.knowledge_bases && <div style={{ fontSize: 12, color: C.muted }}>{p.knowledge_bases.emoji} {p.knowledge_bases.name}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CREATE BASE MODAL ────────────────────────────────────────────────────────
const BASE_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#f97316"];

function CreateBaseModal({ onClose, onCreate, parentBase = null }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(parentBase ? "📁" : "📚");
  const [color, setColor] = useState(parentBase?.color || "#3b82f6");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const label = parentBase ? `Sous-base de ${parentBase.emoji} ${parentBase.name}` : "Nouvelle Base";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "min(440px,100%)", background: C.surface, borderRadius: 24, border: `1px solid ${C.borderMid}`, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {parentBase ? "Nouvelle Sous-Base" : "Nouvelle Base"}
        </div>
        {parentBase && (
          <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 16 }}>{label}</div>
        )}
        {!parentBase && <div style={{ marginBottom: 16 }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <span onClick={() => setEmojiOpen(o => !o)} style={{ fontSize: 32, cursor: "pointer" }}>{emoji}</span>
            {emojiOpen && <EmojiPicker onSelect={e => { setEmoji(e); setEmojiOpen(false); }} onClose={() => setEmojiOpen(false)} />}
          </div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) onCreate({ name, emoji, color, parent_id: parentBase?.id ?? null }); }}
            placeholder="Nom…"
            style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, padding: "11px 14px", borderRadius: 12, fontSize: 15, fontFamily: "inherit", outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {BASE_COLORS.map(c => (
            <div key={c} onClick={() => setColor(c)}
              style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? `3px solid white` : "3px solid transparent", boxSizing: "border-box" }} />
          ))}
        </div>
        <button onClick={() => { if (name.trim()) onCreate({ name, emoji, color, parent_id: parentBase?.id ?? null }); }}
          disabled={!name.trim()}
          style={{ width: "100%", background: GRAD, color: "#fff", border: "none", borderRadius: 14, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: name.trim() ? 1 : 0.5, fontFamily: "inherit" }}>
          Créer
        </button>
      </div>
    </div>
  );
}

// ─── BASE HOME ────────────────────────────────────────────────────────────────
const LS_RECENT = "lp_base_recent";

function BaseHome({ userId, onBaseOpen, onPageNav, onOpenGraph, onOpenSwitcher }) {
  const { rootBases, childrenOf, loading, createBase, archiveBase, updateBase } = useKnowledgeBases(userId);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [recent, setRecent] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_RECENT) || "[]"); } catch { return []; }
  });

  const handleCreate = async (data) => {
    const base = await createBase(data);
    if (base) { setShowCreate(false); onBaseOpen(base); }
  };

  const handleDelete = async (e, base) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer "${base.name}" ?`)) return;
    await archiveBase(base.id);
  };

  const startEdit = (e, base) => {
    e.stopPropagation();
    setEditingId(base.id);
    setEditingName(base.name);
  };

  const commitEdit = async (base) => {
    if (editingName.trim() && editingName !== base.name) await updateBase(base.id, { name: editingName.trim() });
    setEditingId(null);
  };

  const renderBaseTree = (base, depth = 0) => {
    const children = childrenOf(base.id);
    const isExpanded = expanded[base.id];
    const isEditing = editingId === base.id;
    return (
      <div key={base.id}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", paddingLeft: 14 + depth * 18,
            borderRadius: 12, marginBottom: 4,
            background: C.surface2, cursor: "pointer", transition: TR,
            borderLeft: depth === 0 ? `3px solid ${base.color}` : `2px solid ${base.color}66`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.surface3; const a = e.currentTarget.querySelector(".base-actions"); if (a) a.style.opacity = "1"; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.surface2; const a = e.currentTarget.querySelector(".base-actions"); if (a) a.style.opacity = "0"; }}
        >
          <span
            onClick={e => { e.stopPropagation(); if (children.length) setExpanded(ex => ({ ...ex, [base.id]: !ex[base.id] })); }}
            style={{ color: C.faint, fontSize: 11, width: 14, flexShrink: 0 }}
          >
            {children.length ? (isExpanded ? "▼" : "▶") : " "}
          </span>
          <span onClick={() => !isEditing && onBaseOpen(base)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: depth === 0 ? 20 : 16 }}>{base.emoji}</span>
            {isEditing ? (
              <input autoFocus value={editingName} onChange={e => setEditingName(e.target.value)}
                onBlur={() => commitEdit(base)}
                onKeyDown={e => { if (e.key === "Enter") commitEdit(base); if (e.key === "Escape") setEditingId(null); }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, background: C.surface3, border: `1px solid ${C.borderMid}`, color: C.text, padding: "2px 8px", borderRadius: 6, fontSize: depth === 0 ? 14 : 13, fontFamily: "inherit", outline: "none" }} />
            ) : (
              <>
                <span style={{ fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 600 : 500, color: C.text }}>{base.name}</span>
                {children.length > 0 && !isExpanded && (
                  <span style={{ fontSize: 10, color: C.faint, marginLeft: 4 }}>{children.length} sous-base{children.length > 1 ? "s" : ""}</span>
                )}
              </>
            )}
          </span>
          <div className="base-actions" style={{ display: "flex", gap: 4, opacity: 0, transition: TR }} onClick={e => e.stopPropagation()}>
            <span onClick={e => startEdit(e, base)} style={{ fontSize: 11, color: C.muted, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }} title="Renommer">✏️</span>
            <span onClick={e => handleDelete(e, base)} style={{ fontSize: 11, color: C.red, cursor: "pointer", padding: "2px 6px", borderRadius: 6 }} title="Supprimer">🗑</span>
          </div>
        </div>
        {isExpanded && children.map(c => renderBaseTree(c, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.text, flex: 1 }}>Base</span>
        <button onClick={onOpenSwitcher} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>🔍</button>
        <button onClick={onOpenGraph} style={{ background: "none", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>⬡</button>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Mes bases</div>

        {loading
          ? <div style={{ color: C.muted, textAlign: "center", padding: 32 }}>Chargement…</div>
          : rootBases.length === 0
            ? <div style={{ color: C.muted, textAlign: "center", padding: 32, fontSize: 13 }}>Aucune base. Créez-en une !</div>
            : rootBases.map(b => renderBaseTree(b))
        }

        <button onClick={() => setShowCreate(true)}
          style={{ width: "100%", background: C.surface2, border: `1px dashed ${C.border}`, color: C.muted, padding: "12px", borderRadius: 14, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginTop: 8, marginBottom: 24, transition: TR }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >+ Nouvelle base</button>

        {recent.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>Récemment ouvertes</div>
            {recent.slice(0, 5).map(r => (
              <div key={r.id} onClick={() => onPageNav(r.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, marginBottom: 4, background: C.surface2, cursor: "pointer", transition: TR }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface3}
                onMouseLeave={e => e.currentTarget.style.background = C.surface2}
              >
                <span style={{ fontSize: 18 }}>{r.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{r.baseName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateBaseModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  );
}

// ─── BASE MODULE (router) ─────────────────────────────────────────────────────
export default function BaseModule({ userId }) {
  const [view, setView] = useState("home"); // "home" | "base" | "page" | "graph"
  const [currentBase, setCurrentBase] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [allPages, setAllPages] = useState([]);
  const { bases, updateBase, createBase, archiveBase } = useKnowledgeBases(userId);

  useEffect(() => {
    if (!userId) return;
    supabase.from("knowledge_pages")
      .select("id, title, emoji, base_id, knowledge_bases(name, emoji)")
      .eq("is_archived", false)
      .eq("owner_id", userId)
      .then(({ data }) => setAllPages(data || []));
  }, [userId, view]);

  const openBase = (base) => {
    setCurrentBase(base);
    setView("base");
    setBreadcrumb([base.name]);
  };

  const openPage = (page, base, parent) => {
    setCurrentPage(page);
    setCurrentBase(base);
    setBreadcrumb(prev => parent ? [base.name, parent.title, page.title] : [base.name, page.title]);
    setView("page");
    // Track recent
    try {
      const recent = JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
      const entry = { id: page.id, title: page.title, emoji: page.emoji, baseName: base.name };
      const updated = [entry, ...recent.filter(r => r.id !== page.id)].slice(0, 10);
      localStorage.setItem(LS_RECENT, JSON.stringify(updated));
    } catch {}
  };

  const navigateToPage = async (pageId) => {
    const { data: p } = await supabase.from("knowledge_pages")
      .select("*, knowledge_bases(*)")
      .eq("id", pageId).single();
    if (p) openPage(p, p.knowledge_bases, null);
  };

  const handleBaseUpdate = async (id, patch) => {
    await updateBase(id, patch);
    if (currentBase?.id === id) setCurrentBase(b => ({ ...b, ...patch }));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSwitcher(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!userId) return (
    <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 14 }}>
      Connecte-toi pour accéder à Base.
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif" }}>
      {view === "home" && (
        <BaseHome
          userId={userId}
          onBaseOpen={openBase}
          onPageNav={navigateToPage}
          onOpenGraph={() => setView("graph")}
          onOpenSwitcher={() => setShowSwitcher(true)}
        />
      )}

      {view === "base" && currentBase && (
        <BaseView
          base={currentBase}
          userId={userId}
          onBack={() => {
            const parent = bases.find(b => b.id === currentBase.parent_id);
            if (parent) openBase(parent); else setView("home");
          }}
          onPageOpen={(p) => openPage(p, currentBase, null)}
          onBaseOpen={openBase}
          onBaseUpdate={handleBaseUpdate}
          onCreateSubBase={createBase}
          onArchiveBase={archiveBase}
          allBases={bases}
        />
      )}

      {view === "page" && currentPage && currentBase && (
        <PageView
          pageId={currentPage.id}
          userId={userId}
          onBack={() => setView(currentBase ? "base" : "home")}
          breadcrumb={breadcrumb}
          allPages={allPages}
          onPageNav={navigateToPage}
        />
      )}

      {view === "graph" && (
        <GraphView
          userId={userId}
          onClose={() => setView("home")}
          onPageNav={navigateToPage}
        />
      )}

      {showSwitcher && (
        <QuickSwitcher
          userId={userId}
          onSelect={(p) => navigateToPage(p.id)}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  );
}
