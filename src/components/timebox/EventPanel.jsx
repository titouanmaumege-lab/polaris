import { useState, useEffect, useRef } from "react";
import { EVENT_COLORS } from "./google";
import { Ic } from "./icons";
import { P } from "../../state/perso";

const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = s => { const [h, m] = (s || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const longDate = ds => new Date(ds + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const REMINDERS = [["default", "Par défaut"], [-1, "Aucun"], [0, "À l'heure"], [10, "10 min avant"], [30, "30 min avant"], [60, "1 h avant"], [1440, "1 jour avant"]];
const REPEATS = [["", "Ne se répète pas"], ["DAILY", "Tous les jours"], ["WEEKLY", "Toutes les semaines"], ["MONTHLY", "Tous les mois"]];

// Panneau d'un événement Google : créer, modifier, dupliquer, supprimer.
export default function EventPanel({ ev, cals, editable, busy, err, onSave, onDelete, onDuplicate, onMeet, onReconnect, onClose }) {
  const [f, setF] = useState(() => ({
    title: ev.isNew ? "" : ev.title, ds: ev.ds, start: ev.start, end: ev.end, allDay: !!ev.allDay,
    loc: ev.loc || "", desc: ev.desc || "", colorId: ev.colorId || null, sphere: ev.sphere || "", link: ev.source || "",
    reminder: ev.reminder ?? "default", repeat: "", calId: ev.calId,
  }));
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const titleRef = useRef(null);
  useEffect(() => { if (ev.isNew && titleRef.current) titleRef.current.focus(); }, [ev.isNew]);

  const cal = cals.find(c => c.id === f.calId);
  const accent = P.spheres[f.sphere]?.c || (EVENT_COLORS.find(c => c.id === f.colorId)?.hex) || cal?.color || "#b066ff";
  const ro = !editable;
  const save = () => {
    const p = { title: f.title.trim(), ds: f.ds, start: f.start, end: Math.max(f.end, f.start + 5), allDay: f.allDay, loc: f.loc, desc: f.desc, colorId: f.colorId, sphere: f.sphere, link: f.link.trim(), reminder: f.reminder };
    if (ev.isNew && f.repeat) p.repeat = f.repeat;
    onSave(p, f.calId);
  };
  const onKey = e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !ro) { e.preventDefault(); save(); }
  };

  return (
    <div className="tb-ep" role="dialog" aria-label="Événement" onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <div className="tb-ep-bar" style={{ background: accent }} />
      <div className="tb-ep-body">
        <div className="tb-ep-row">
          <span className="tb-ep-dot" style={{ background: accent }} />
          <input ref={titleRef} className="tb-ep-title" placeholder="Titre de l'événement" value={f.title} readOnly={ro} onChange={e => set("title", e.target.value)} />
          <button className="tb-ep-x" onClick={onClose} aria-label="Fermer"><Ic n="close" s={15} /></button>
        </div>

        <div className="tb-ep-row tb-ep-flex">
          <span className="tb-ep-ic"><Ic n="clock" s={15} /></span>
          <input type="date" className="tb-ep-in" value={f.ds} disabled={ro} onChange={e => e.target.value && set("ds", e.target.value)} />
          {!f.allDay && <>
            <input type="time" step="900" className="tb-ep-in" value={hm(f.start)} disabled={ro} onChange={e => { const d = f.end - f.start; const s = toMin(e.target.value); setF(x => ({ ...x, start: s, end: Math.min(s + d, 24 * 60 - 1) })); }} />
            <span className="tb-ep-arrow">→</span>
            <input type="time" step="900" className="tb-ep-in" value={hm(f.end)} disabled={ro} onChange={e => set("end", toMin(e.target.value))} />
          </>}
        </div>
        <label className="tb-ep-sub"><input type="checkbox" checked={f.allDay} disabled={ro} onChange={e => set("allDay", e.target.checked)} /> Journée entière <span>· {longDate(f.ds)}</span></label>

        {ev.link && (
          <div className="tb-ep-row">
            <span className="tb-ep-ic"><Ic n="video" s={15} /></span>
            <span className="tb-ep-field tb-ep-url">{ev.link.url.replace(/^https?:\/\//, "")}</span>
            <a className="tb-btn tb-primary tb-ep-join" href={ev.link.url} target="_blank" rel="noopener noreferrer">Rejoindre</a>
          </div>
        )}
        <div className="tb-ep-row">
          <span className="tb-ep-ic"><Ic n="link" s={15} /></span>
          <input className="tb-ep-field" placeholder="Ajouter un lien (Zoom, Notion, doc…)" value={f.link} readOnly={ro} onChange={e => set("link", e.target.value)} />
          {f.link && /^https?:\/\//.test(f.link) && <a className="tb-ep-open" href={f.link} target="_blank" rel="noopener noreferrer">Ouvrir</a>}
        </div>
        {!ev.isNew && !ev.link && !ro && <button className="tb-ep-meet" onClick={onMeet} disabled={busy}>+ Ajouter une visio Google Meet</button>}

        <div className="tb-ep-row">
          <span className="tb-ep-ic"><Ic n="pin" s={15} /></span>
          <input className="tb-ep-field" placeholder="Lieu" value={f.loc} readOnly={ro} onChange={e => set("loc", e.target.value)} />
        </div>
        <div className="tb-ep-row tb-ep-top">
          <span className="tb-ep-ic"><Ic n="text" s={15} /></span>
          <textarea className="tb-ep-field tb-ep-desc" rows={3} placeholder="Description" value={f.desc} readOnly={ro} onChange={e => set("desc", e.target.value)} />
        </div>

        <div className="tb-ep-row">
          <span className="tb-ep-ic"><Ic n="cal" s={15} /></span>
          <select className="tb-ep-field" value={f.calId} disabled={ro || !ev.isNew} onChange={e => set("calId", e.target.value)}>
            {cals.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="tb-ep-row">
          <span className="tb-ep-ic">🏷</span>
          <select className="tb-ep-field" value={f.sphere} disabled={ro} onChange={e => set("sphere", e.target.value)}>
            <option value="">Catégorie : aucune (couleur du calendrier)</option>
            {Object.entries(P.spheres).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="tb-ep-row tb-ep-flex">
          <span className="tb-ep-ic tb-ep-wheel" aria-hidden />
          <div className="tb-ep-sw">
            <button className={"tb-ep-swb" + (!f.colorId ? " is-on" : "")} style={{ background: cal?.color || "#7d7896", color: "#0b0916" }} disabled={ro} onClick={() => set("colorId", null)} title="Couleur du calendrier" aria-label="Couleur du calendrier">{!f.colorId ? "✓" : ""}</button>
            {EVENT_COLORS.map(c => (
              <button key={c.id} className={"tb-ep-swb" + (f.colorId === c.id ? " is-on" : "")} style={{ background: c.hex, color: "#0b0916" }} disabled={ro} onClick={() => set("colorId", c.id)} title={c.name} aria-label={c.name}>{f.colorId === c.id ? "✓" : ""}</button>
            ))}
          </div>
        </div>
        <div className="tb-ep-row">
          {ev.isNew
            ? <select className="tb-ep-field" value={f.repeat} disabled={ro} onChange={e => set("repeat", e.target.value)}>{REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            : <span className="tb-ep-field tb-ep-fake">{ev.recurring ? "Événement répété (cette occurrence)" : "Ne se répète pas"}</span>}
          <select className="tb-ep-field" value={String(f.reminder)} disabled={ro} onChange={e => set("reminder", e.target.value === "default" ? "default" : Number(e.target.value))}>
            {REMINDERS.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
          </select>
        </div>

        {err && <p className="tb-err">{err}</p>}
        {ev.multi && <p className="tb-note">Événement sur plusieurs jours : modifie-le dans Google Agenda.</p>}
        {ro && !ev.multi && (
          <p className="tb-note">
            {ev.writable === false ? "Calendrier en lecture seule." : "Polaris n'a pas encore le droit de modifier tes événements."}{" "}
            {ev.writable !== false && <button className="tb-link" onClick={onReconnect}>Reconnecter Google</button>}
          </p>
        )}
      </div>
      <div className="tb-ep-foot">
        {!ev.isNew && !ro && <button className="tb-ep-del" onClick={onDelete} disabled={busy}><Ic n="trash" s={14} /> Supprimer</button>}
        {!ev.isNew && !ro && <button className="tb-btn" onClick={onDuplicate} disabled={busy}>Dupliquer</button>}
        <span className="tb-ep-hint">Échap ferme · ⌘↵ enregistre</span>
        {!ro && <button className="tb-btn tb-primary" onClick={save} disabled={busy}>{busy ? "…" : ev.isNew ? "Créer" : "Enregistrer"}</button>}
        {ev.htmlLink && (ro || ev.multi) && <a className="tb-btn" href={ev.htmlLink} target="_blank" rel="noopener noreferrer">Ouvrir dans Google</a>}
      </div>
    </div>
  );
}

// Panneau d'une tâche Polaris posée dans le calendrier : renommer, déplacer, durée, terminer, retirer.
export function TaskPanel({ t, label, color, error, onSave, onDone, onUnplan, onClose }) {
  const [f, setF] = useState(() => ({ name: t.name || "", ds: t.slotDate, start: t.slotStart, end: t.slotStart + t.slotMin }));
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = () => onSave({ name: f.name.trim() || t.name, slotDate: f.ds, slotStart: f.start, slotMin: Math.max(5, f.end - f.start) });
  const onKey = e => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
  };
  return (
    <div className="tb-ep" role="dialog" aria-label="Tâche" onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <div className="tb-ep-bar" style={{ background: color }} />
      <div className="tb-ep-body">
        <div className="tb-ep-row">
          <span className="tb-ep-dot" style={{ background: color }} />
          <input className="tb-ep-title" value={f.name} onChange={e => set("name", e.target.value)} placeholder="Nom de la tâche" />
          <button className="tb-ep-x" onClick={onClose} aria-label="Fermer"><Ic n="close" s={15} /></button>
        </div>
        <div className="tb-ep-row tb-ep-flex">
          <span className="tb-ep-ic"><Ic n="clock" s={15} /></span>
          <input type="date" className="tb-ep-in" value={f.ds} onChange={e => e.target.value && set("ds", e.target.value)} />
          <input type="time" step="900" className="tb-ep-in" value={hm(f.start)} onChange={e => { const d = f.end - f.start; const s = toMin(e.target.value); setF(x => ({ ...x, start: s, end: Math.min(s + d, 24 * 60 - 1) })); }} />
          <span className="tb-ep-arrow">→</span>
          <input type="time" step="900" className="tb-ep-in" value={hm(f.end)} onChange={e => set("end", toMin(e.target.value))} />
        </div>
        <label className="tb-ep-sub" style={{ textTransform: "capitalize" }}>{longDate(f.ds)} · {Math.max(5, f.end - f.start)} min</label>
        <div className="tb-ep-row">
          <span className="tb-ep-ic"><Ic n="check" s={15} /></span>
          <span className="tb-ep-field tb-ep-fake">Tâche Polaris · {label}</span>
        </div>
        {error && <p className="tb-err">{error}</p>}
      </div>
      <div className="tb-ep-foot">
        <button className="tb-ep-del" onClick={onUnplan}><Ic n="trash" s={14} /> Retirer du calendrier</button>
        <button className="tb-btn" onClick={onDone}>Terminé</button>
        <span className="tb-ep-hint">Échap ferme</span>
        <button className="tb-btn tb-primary" onClick={save}>Enregistrer</button>
      </div>
    </div>
  );
}
