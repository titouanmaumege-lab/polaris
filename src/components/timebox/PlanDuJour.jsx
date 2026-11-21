import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { todoGoalId } from "../../utils/goalLinks";
import { fmtMin } from "../../utils/date";
import {
  isLinked, hasToken, requestToken, disconnect, getPrefs, setPrefs,
  listCalendars, fetchDayEvents, pushBlocks,
} from "./google";
import "./timebox.css";

const START_H = 7, END_H = 22, PX = 48;          // grille 7 h → 22 h, 48 px par heure
const DURS = [[25, "25 min"], [30, "30 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30"]];
const GREY = "#7d7896";

const hhmm = m => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
const addDays = (ds, n) => { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const longDate = ds => new Date(ds + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const slotsOf = (todos, ds) => todos.filter(t => !t.done && t.slotDate === ds && t.slotMin).sort((a, b) => a.slotStart - b.slotStart);

// ─────────────────────────────────────────────────────────────────────────────
// Tutoriel de connexion Google : 5 étapes, l'écran d'avertissement expliqué.
// ─────────────────────────────────────────────────────────────────────────────
function GoogleConnect({ onDone, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cals, setCals] = useState(null);
  const [sel, setSel] = useState([]);

  const loadCals = async () => {
    const list = await listCalendars();
    const prefs = getPrefs();
    setCals(list);
    setSel(prefs.calIds?.length ? prefs.calIds : list.filter(c => c.primary).map(c => c.id));
  };
  useEffect(() => { if (isLinked() && hasToken()) loadCals().catch(() => {}); }, []);

  const connect = async () => {
    setBusy(true); setErr("");
    try { await requestToken(true); await loadCals(); }
    catch (e) { setErr(e.message || "Connexion impossible"); }
    setBusy(false);
  };
  const finish = () => { setPrefs({ calIds: sel }); onDone(); };
  const off = () => { disconnect(); onDone(); };

  const steps = [
    ["Clique sur « Connecter Google Agenda »", "Une fenêtre Google s'ouvre. Si rien ne s'ouvre, autorise les fenêtres pop-up pour ce site."],
    ["Choisis ton compte Google", "Celui de ton agenda."],
    ["Écran « Google n'a pas validé cette application »", "C'est normal : Polaris est une appli perso. Clique sur « Paramètres avancés » (petit lien en bas à gauche), puis sur « Accéder à POLARIS (non sécurisé) »."],
    ["Accepte les 2 accès", "Voir tes événements, et gérer un calendrier « Polaris » que l'appli crée elle-même. Rien d'autre n'est touché. Clique « Continuer »."],
    ["Coche les calendriers à afficher en gris", "Puis « Terminé »."],
  ];

  return (
    <div className="tb-gc">
      <h3>📅 Connecter Google Agenda</h3>
      {!cals ? (<>
        <p className="tb-note">Environ 1 minute. Tu peux déconnecter quand tu veux.</p>
        <div className="tb-warn">⚠️ <b>Google va afficher un avertissement : c'est normal.</b> Clique « Paramètres avancés » puis « Accéder à POLARIS ». Tu ne le fais qu'une fois.</div>
        <ol className="tb-steps">
          {steps.map((s, i) => <li key={i}><b>{s[0]}</b><span>{s[1]}</span></li>)}
        </ol>
        {err && <p className="tb-err">{err}</p>}
        <button className="tb-btn tb-primary tb-wide" onClick={connect} disabled={busy}>{busy ? "Connexion…" : "Connecter Google Agenda"}</button>
      </>) : (<>
        <p className="tb-ok">✓ Google Agenda connecté</p>
        <p className="tb-note">Calendriers affichés en gris dans ton plan :</p>
        <div className="tb-cals">
          {cals.filter(c => c.name !== "Polaris").map(c => (
            <label key={c.id}><input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])} /> {c.name}{c.primary ? " (principal)" : ""}</label>
          ))}
        </div>
        <p className="tb-note">Tes blocs partent dans un calendrier « Polaris », créé automatiquement quand tu valides ton plan.</p>
        <button className="tb-btn tb-primary tb-wide" onClick={finish}>Terminé</button>
        <button className="tb-link tb-danger" onClick={off}>Déconnecter Google Agenda</button>
      </>)}
      <button className="tb-link" onClick={onClose}>Fermer</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan du jour : le rituel de 15 min du matin.
// ─────────────────────────────────────────────────────────────────────────────
export function PlanDuJour({ today, todos, updateTodo, cap, onClose }) {
  const [date, setDate] = useState(today);
  const [dur, setDur] = useState(45);
  const [picked, setPicked] = useState(null);   // tâche sélectionnée (clic) ou glissée
  const [blockSel, setBlockSel] = useState(null);
  const [events, setEvents] = useState([]);
  const [gState, setGState] = useState(isLinked() ? (hasToken() ? "ok" : "expired") : "off");
  const [gErr, setGErr] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const gridRef = useRef(null);

  const colorOf = useMemo(() => {
    const m = {};
    cap.cols.forEach(c => { m[c.m.id] = { color: c.color, label: c.m.titre }; });
    return m;
  }, [cap]);
  const info = t => colorOf[todoGoalId(t)] || { color: GREY, label: "Sans objectif du mois" };

  const loadEvents = useCallback(async () => {
    if (!isLinked()) { setEvents([]); return; }
    try {
      if (!hasToken()) { setGState("expired"); return; }
      const ids = getPrefs().calIds || [];
      setEvents(await fetchDayEvents(date, ids));
      setGState("ok"); setGErr("");
    } catch (e) {
      if (e.message === "EXPIRED") setGState("expired");
      else { setGErr(e.message); setGState("error"); }
    }
  }, [date]);
  useEffect(() => { loadEvents(); }, [loadEvents, showConnect]);

  const reconnect = async () => {
    try { await requestToken(true); await loadEvents(); }
    catch (e) { setGErr(e.message); setGState("error"); }
  };

  // ── Données du jour
  const planned = slotsOf(todos, date);
  const fixed = events.filter(e => !e.allDay).map(e => ({ a: e.start, b: e.end }));
  const backlog = todos
    .filter(t => !t.done && t.gtd !== "projet" && !t.recurrence?.enabled && !(t.slotDate === date && t.slotMin))
    .sort((a, b) => {
      const ga = todoGoalId(a) ? 0 : 1, gb = todoGoalId(b) ? 0 : 1;
      const ia = info(a).label, ib = info(b).label;
      const da = a.dateAssignee || a.dateFin || a.dateDebut || "9999", db = b.dateAssignee || b.dateFin || b.dateDebut || "9999";
      return ga - gb || ia.localeCompare(ib) || da.localeCompare(db);
    });
  const groups = [];
  backlog.forEach(t => {
    const i = info(t);
    let g = groups.find(x => x.label === i.label);
    if (!g) { g = { label: i.label, color: i.color, items: [] }; groups.push(g); }
    g.items.push(t);
  });

  const plannedMin = planned.reduce((a, t) => a + t.slotMin, 0);
  const dayMin = (END_H - START_H) * 60;
  const fixedMin = fixed.reduce((a, f) => a + Math.max(0, Math.min(f.b, END_H * 60) - Math.max(f.a, START_H * 60)), 0);
  const freeMin = Math.max(0, dayMin - fixedMin - plannedMin);

  const clash = (start, min, ignoreId) => {
    const end = start + min;
    if (start < START_H * 60 || end > END_H * 60) return "Hors de la grille 7 h – 22 h";
    if (fixed.some(f => start < f.b && end > f.a)) return "Créneau pris par un événement Google";
    if (planned.some(t => t.id !== ignoreId && start < t.slotStart + t.slotMin && end > t.slotStart)) return "Créneau déjà planifié";
    return "";
  };
  const place = (id, start, min) => {
    const err = clash(start, min, id);
    if (err) { setMsg(err); return false; }
    setMsg("");
    updateTodo(id, { slotDate: date, slotStart: start, slotMin: min });
    return true;
  };
  const minuteAt = e => {
    const r = gridRef.current.getBoundingClientRect();
    const y = e.clientY - r.top + gridRef.current.scrollTop;
    return Math.round(((y / PX) * 60 + START_H * 60) / 15) * 15 - 0;
  };
  const onGridClick = e => {
    if (e.target.closest(".tb-block")) return;
    if (!picked) { setMsg("Choisis d'abord une tâche à gauche."); return; }
    if (place(picked, minuteAt(e), dur)) setPicked(null);
  };
  const onDrop = e => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || picked;
    if (!id) return;
    const t = todos.find(x => x.id === id);
    const min = t?.slotDate === date && t.slotMin ? t.slotMin : dur;
    if (place(id, minuteAt(e), min)) setPicked(null);
  };
  const unplan = t => { updateTodo(t.id, { slotDate: undefined, slotStart: undefined, slotMin: undefined }); setBlockSel(null); };
  const setDurOnBlock = (t, m) => { if (!clash(t.slotStart, m, t.id)) updateTodo(t.id, { slotMin: m }); else setMsg(clash(t.slotStart, m, t.id)); };
  const pickDur = m => { setDur(m); const b = planned.find(t => t.id === blockSel); if (b) setDurOnBlock(b, m); };

  // ── Valider : blocs → calendrier « Polaris »
  const validate = async () => {
    if (!isLinked()) { setShowConnect(true); return; }
    setBusy(true); setMsg("");
    try {
      if (!hasToken()) await requestToken(true);
      const removed = todos.filter(t => t.slotEventId && (!t.slotDate || t.done));
      const { ids, gone } = await pushBlocks(planned, removed);
      Object.entries(ids).forEach(([id, ev]) => updateTodo(id, { slotEventId: ev }));
      gone.forEach(id => updateTodo(id, { slotEventId: undefined }));
      setMsg(`✓ ${planned.length} bloc${planned.length > 1 ? "s" : ""} envoyé${planned.length > 1 ? "s" : ""} dans ton calendrier Polaris`);
      setGState("ok");
    } catch (e) { setMsg("Envoi impossible : " + (e.message === "EXPIRED" ? "reconnecte Google" : e.message)); }
    setBusy(false);
  };

  const topOf = m => (m - START_H * 60) / 60 * PX;
  const clipPct = (a, b) => ({ top: topOf(Math.max(a, START_H * 60)), height: Math.max(14, (Math.min(b, END_H * 60) - Math.max(a, START_H * 60)) / 60 * PX - 2) });
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();

  return createPortal(
    <div className="tb-root" role="dialog" aria-label="Plan du jour">
      <header className="tb-head">
        <span className="tb-word">Plan du jour</span>
        <button className="tb-nav" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">‹</button>
        <span className="tb-date">{longDate(date)}</span>
        <button className="tb-nav" onClick={() => setDate(addDays(date, 1))} aria-label="Jour suivant">›</button>
        <span style={{ flex: 1 }} />
        {gState === "ok" && <button className="tb-pill tb-pill-ok" onClick={() => setShowConnect(true)}>● Google Agenda connecté</button>}
        {gState === "expired" && <button className="tb-pill tb-pill-warn" onClick={reconnect}>Reconnecter Google</button>}
        {gState === "off" && <button className="tb-pill" onClick={() => setShowConnect(true)}>Connecter Google Agenda</button>}
        {gState === "error" && <button className="tb-pill tb-pill-warn" onClick={reconnect} title={gErr}>Google : erreur, réessayer</button>}
        <button className="tb-btn tb-primary" onClick={validate} disabled={busy || !planned.length}>{busy ? "Envoi…" : "Valider mon plan"}</button>
        <button className="tb-btn" onClick={onClose} aria-label="Fermer">✕</button>
      </header>

      <div className="tb-body">
        <section className="tb-back">
          <div className="tb-sec"><b>À planifier</b><span>par objectif, puis échéance</span></div>
          {groups.length === 0 && <p className="tb-note">Plus rien à planifier.</p>}
          {groups.map(g => (
            <div key={g.label}>
              <div className="tb-gl"><i style={{ background: g.color }} />{g.label}</div>
              {g.items.map(t => (
                <div key={t.id} draggable
                  onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); setPicked(t.id); }}
                  onClick={() => { setPicked(p => p === t.id ? null : t.id); setBlockSel(null); }}
                  className={"tb-item" + (picked === t.id ? " is-picked" : "")} style={{ borderLeftColor: g.color }}>
                  <span className="tb-grip">⋮⋮</span>
                  <span className="tb-name">{t.name}</span>
                  <span className="tb-when">{(t.dateAssignee || t.dateFin) ? new Date((t.dateAssignee || t.dateFin) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span>
                </div>
              ))}
            </div>
          ))}
        </section>

        <section className="tb-day">
          <div className="tb-bar">
            <span className="tb-count"><b style={{ color: "#2ee59d" }}>{fmtMin(freeMin)}</b> libres</span>
            <span className="tb-count"><b style={{ color: "#b066ff" }}>{plannedMin ? fmtMin(plannedMin) : "0 min"}</b> planifiées</span>
            <span style={{ flex: 1 }} />
            <span className="tb-durl">Durée :</span>
            {DURS.map(([m, l]) => <button key={m} className={"tb-chip" + (dur === m ? " is-on" : "")} onClick={() => pickDur(m)}>{l}</button>)}
          </div>
          <div className="tb-hint">{msg || (picked ? "Clique ou dépose sur un créneau libre de la journée." : "Clique une tâche (ou glisse-la) puis un créneau. Clique un bloc pour changer sa durée.")}</div>
          <div className="tb-grid" ref={gridRef} onClick={onGridClick} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
            <div style={{ height: (END_H - START_H) * PX, position: "relative" }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <div key={i} className="tb-hour" style={{ top: i * PX }}><span>{START_H + i}h</span></div>
              ))}
              {events.map(e => e.allDay
                ? null
                : <div key={e.id} className="tb-ev" style={clipPct(e.start, e.end)}><b>{e.title}</b><small>{hhmm(e.start)} – {hhmm(e.end)} · Google Agenda</small></div>)}
              {planned.map(t => {
                const i = info(t);
                return (
                  <div key={t.id} className={"tb-block" + (blockSel === t.id ? " is-sel" : "")}
                    draggable onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); setPicked(t.id); }}
                    onClick={() => { setBlockSel(b => b === t.id ? null : t.id); setPicked(null); setDur(t.slotMin); }}
                    style={{ ...clipPct(t.slotStart, t.slotStart + t.slotMin), borderColor: i.color, background: i.color + "26", borderLeftColor: i.color }}>
                    <b>{t.name}</b><small>{hhmm(t.slotStart)} – {hhmm(t.slotStart + t.slotMin)} · {fmtMin(t.slotMin)}</small>
                    <button className="tb-x" onClick={e => { e.stopPropagation(); unplan(t); }} aria-label="Retirer du plan">×</button>
                  </div>
                );
              })}
              {date === today && nowMin >= START_H * 60 && nowMin < END_H * 60 && <div className="tb-now" style={{ top: topOf(nowMin) }} />}
            </div>
          </div>
          <div className="tb-legend"><span>▨ gris : Google Agenda</span><span>▮ couleur : objectif du mois</span></div>
        </section>
      </div>

      {showConnect && (
        <div className="tb-modal" onClick={() => setShowConnect(false)}>
          <div className="tb-gcw" onClick={e => e.stopPropagation()}>
            <GoogleConnect onClose={() => setShowConnect(false)} onDone={() => { setShowConnect(false); setGState(isLinked() ? (hasToken() ? "ok" : "expired") : "off"); }} />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilan du soir : cocher le fait, le reste retourne au backlog, prévu vs réel.
// ─────────────────────────────────────────────────────────────────────────────
export function BilanPlan({ today, todos, updateTodo, toggleDone, sessions, onClose }) {
  const blocks = slotsOf(todos, today).concat(todos.filter(t => t.done && t.slotDate === today && t.slotMin)).sort((a, b) => a.slotStart - b.slotStart);
  const realOf = t => sessions.filter(s => s.date === today && (s.tache || "").trim().toLowerCase() === (t.name || "").trim().toLowerCase()).reduce((a, s) => a + (s.temps || 0), 0);
  const prevu = blocks.reduce((a, t) => a + t.slotMin, 0);
  const reel = blocks.reduce((a, t) => a + realOf(t), 0);
  const close = () => {
    blocks.filter(t => !t.done).forEach(t => updateTodo(t.id, { slotDate: undefined, slotStart: undefined, slotMin: undefined }));
    onClose();
  };
  return createPortal(
    <div className="tb-modal" onClick={onClose}>
      <div className="tb-gc" onClick={e => e.stopPropagation()}>
        <h3>🌙 Bilan du plan</h3>
        {blocks.length === 0 && <p className="tb-note">Aucun bloc planifié aujourd'hui.</p>}
        <div className="tb-bil">
          {blocks.map(t => (
            <label key={t.id} className={t.done ? "is-done" : ""}>
              <input type="checkbox" checked={!!t.done} onChange={() => toggleDone(t.id)} />
              <span className="tb-name">{t.name}</span>
              <small>{hhmm(t.slotStart)} · prévu {fmtMin(t.slotMin)}{realOf(t) ? ` · réel ${fmtMin(realOf(t))}` : ""}</small>
            </label>
          ))}
        </div>
        {blocks.length > 0 && <p className="tb-note">Prévu <b>{fmtMin(prevu)}</b> · réel <b>{reel ? fmtMin(reel) : "0 min"}</b>. Ce qui n'est pas coché retourne dans « À planifier ».</p>}
        <button className="tb-btn tb-primary tb-wide" onClick={close}>Terminer la journée</button>
      </div>
    </div>,
    document.body
  );
}
