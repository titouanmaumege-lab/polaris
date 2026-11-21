import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { todoGoalId } from "../../utils/goalLinks";
import { fmtMin } from "../../utils/date";
import {
  isLinked, hasToken, canEdit, requestToken, disconnect, getPrefs, setPrefs, localDS, eventColor, EVENT_COLORS,
  listCalendars, fetchRange, createEvent, patchEvent, deleteEvent, addMeet, pushBlocks,
} from "./google";
import EventPanel from "./EventPanel";
import { Ic } from "./icons";
import "./timebox.css";

const GREY = "#7d7896";
const UI_KEY = "polaris_cal_ui";
const DURS = [[25, "25 min"], [30, "30 min"], [45, "45 min"], [60, "1 h"], [90, "1 h 30"]];
const ACCENTS = ["#b066ff", "#ff4fa3", "#1fd5f0", "#2ee59d", "#ffc53d", "#ff8a4c"];
const VIEWS = [["1", "Jour"], ["3", "3 jours"], ["7", "Semaine"], ["m", "Mois"]];

const pad = n => String(n).padStart(2, "0");
const hhmm = m => `${Math.floor(m / 60) % 24}h${m % 60 ? pad(m % 60) : ""}`;
const parse = ds => new Date(ds + "T12:00:00");
const addDays = (ds, n) => { const d = parse(ds); d.setDate(d.getDate() + n); return localDS(d); };
const addMonths = (ds, n) => { const d = parse(ds); d.setDate(1); d.setMonth(d.getMonth() + n); return localDS(d); };
const startOfWeek = (ds, ws) => addDays(ds, -((parse(ds).getDay() - ws + 7) % 7));
const longDate = ds => parse(ds).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const shortDay = ds => parse(ds).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const isoWeek = ds => {
  const d = parse(ds); d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const y0 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
};
export const slotsOf = (todos, ds) => todos.filter(t => !t.done && t.slotDate === ds && t.slotMin).sort((a, b) => a.slotStart - b.slotStart);

const DEF_UI = { view: "7", startH: 7, endH: 22, compact: false, dur: 30, ws: 1, gray: true, accent: "#b066ff", tab: "plan" };
function loadUi() {
  let u = {};
  try { u = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch {}
  const out = { ...DEF_UI, ...u };
  if (!u.view && typeof window !== "undefined" && window.innerWidth < 760) out.view = "1";
  return out;
}

// Colonnes côte à côte pour les éléments qui se chevauchent.
function layout(items) {
  const sorted = [...items].sort((x, y) => x.a - y.a || x.b - y.b);
  const out = []; let cluster = [], cend = -1;
  const flush = () => {
    const ends = [], res = [];
    cluster.forEach(it => {
      const i = ends.findIndex(en => en <= it.a);
      if (i >= 0) { ends[i] = it.b; res.push([it, i]); } else { ends.push(it.b); res.push([it, ends.length - 1]); }
    });
    res.forEach(([it, lane]) => out.push({ ...it, lane, lanes: ends.length }));
    cluster = []; cend = -1;
  };
  sorted.forEach(it => { if (cluster.length && it.a >= cend) flush(); cluster.push(it); cend = Math.max(cend, it.b); });
  if (cluster.length) flush();
  return out;
}

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
    ["Accepte les accès (laisse tout coché)", "Voir et modifier tes événements, voir la liste de tes calendriers, et gérer un calendrier « Polaris » que l'appli crée elle-même. Clique « Continuer »."],
    ["Coche les calendriers à afficher", "Tu pourras les changer et choisir leurs couleurs dans le calendrier."],
  ];

  return (
    <div className="tb-gc">
      <h3>Connecter Google Agenda</h3>
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
        {!canEdit() && <p className="tb-warn">Tu n'as pas accordé la modification : Polaris affichera tes événements sans pouvoir les changer. Déconnecte puis reconnecte, et laisse tout coché.</p>}
        <p className="tb-note">Calendriers affichés :</p>
        <div className="tb-cals">
          {cals.filter(c => c.name !== "Polaris").map(c => (
            <label key={c.id}><input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])} /> {c.name}{c.primary ? " (principal)" : ""}</label>
          ))}
        </div>
        <p className="tb-note">Tes blocs de tâches partent dans un calendrier « Polaris », créé automatiquement quand tu valides ton plan.</p>
        <button className="tb-btn tb-primary tb-wide" onClick={finish}>Terminé</button>
        <button className="tb-link tb-danger" onClick={off}>Déconnecter Google Agenda</button>
      </>)}
      <button className="tb-link" onClick={onClose}>Fermer</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini-mois de la barre latérale.
// ─────────────────────────────────────────────────────────────────────────────
function MiniMonth({ date, today, ws, days, onPick, onMonth }) {
  const first = addMonths(date, 0);
  const start = startOfWeek(first, ws);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const monthNo = parse(first).getMonth();
  const labels = ws === 1 ? "LMMJVSD" : "DLMMJVS";
  const label = parse(first).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return (
    <div className="tb-mini">
      <div className="tb-mini-h"><b>{label}</b>
        <span><button aria-label="Mois précédent" onClick={() => onMonth(-1)}><Ic n="chevl" s={15} /></button><button aria-label="Mois suivant" onClick={() => onMonth(1)}><Ic n="chevr" s={15} /></button></span>
      </div>
      <div className="tb-mini-g tb-mini-w">{labels.split("").map((l, i) => <span key={i}>{l}</span>)}</div>
      <div className="tb-mini-g">
        {cells.map(ds => (
          <button key={ds} onClick={() => onPick(ds)}
            className={"tb-mini-d" + (parse(ds).getMonth() !== monthNo ? " is-out" : "") + (days.includes(ds) ? " is-in" : "") + (ds === today ? " is-today" : "")}>
            {parse(ds).getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendrier + Plan du jour : le rituel du matin et l'organisation de la semaine.
// ─────────────────────────────────────────────────────────────────────────────
export function PlanDuJour({ today, todos, updateTodo, toggleDone, cap, onClose }) {
  const [ui, setUi] = useState(loadUi);
  const patchUi = p => setUi(u => { const n = { ...u, ...p }; try { localStorage.setItem(UI_KEY, JSON.stringify(n)); } catch {} return n; });
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState(null);       // tâche sélectionnée dans la liste
  const [blockSel, setBlockSel] = useState(null);   // bloc de tâche sélectionné
  const [events, setEvents] = useState([]);
  const [cals, setCals] = useState([]);
  const [calColors, setCalColors] = useState(() => getPrefs().calColors || {});
  const [shown, setShown] = useState(() => getPrefs().calIds || null);
  const [colorFor, setColorFor] = useState(null);
  const [gState, setGState] = useState(isLinked() ? (hasToken() ? "ok" : "expired") : "off");
  const [gErr, setGErr] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [showSet, setShowSet] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [panel, setPanel] = useState(null);
  const [pBusy, setPBusy] = useState(false);
  const [pErr, setPErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [ghost, setGhost] = useState(null);
  const gridRef = useRef(null);
  const searchRef = useRef(null);
  const dragRef = useRef(null);
  const act = useRef({});
  const reqId = useRef(0);

  const view = ui.view;
  const START_H = Math.min(ui.startH, ui.endH - 4), END_H = Math.max(ui.endH, ui.startH + 4);
  const PX = ui.compact ? 38 : 48;

  const days = useMemo(() => {
    if (view === "m") { const s = startOfWeek(addMonths(date, 0), ui.ws); return Array.from({ length: 42 }, (_, i) => addDays(s, i)); }
    if (view === "7") { const s = startOfWeek(date, ui.ws); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    return Array.from({ length: Number(view) }, (_, i) => addDays(date, i));
  }, [date, view, ui.ws]);
  const d0 = days[0], d1 = days[days.length - 1];
  const monthNo = parse(addMonths(date, 0)).getMonth();

  // ── Couleurs
  const colorOf = useMemo(() => {
    const m = {};
    cap.cols.forEach(c => { m[c.m.id] = { color: c.color, label: c.m.titre }; });
    return m;
  }, [cap]);
  const info = t => colorOf[todoGoalId(t)] || { color: GREY, label: "Sans objectif du mois" };
  const calCol = useMemo(() => { const m = {}; cals.forEach(c => { m[c.id] = calColors[c.id] || c.color; }); return m; }, [cals, calColors]);
  const evColor = e => eventColor(e.colorId) || calCol[e.calId] || e.color;
  const writable = useMemo(() => cals.filter(c => c.writable).map(c => ({ ...c, color: calCol[c.id] || c.color })), [cals, calCol]);

  // ── Chargement Google
  const loadEvents = useCallback(async () => {
    if (!isLinked()) { setEvents([]); return; }
    const my = ++reqId.current;
    try {
      if (!hasToken()) { setGState("expired"); return; }
      let list = cals;
      if (!list.length) { list = await listCalendars(); if (my !== reqId.current) return; setCals(list); }
      const ids = shown?.length ? shown : list.filter(c => c.primary).map(c => c.id);
      const use = list.filter(c => ids.includes(c.id));
      const evs = await fetchRange(d0, d1, use);
      if (my !== reqId.current) return;
      setEvents(evs); setGState("ok"); setGErr("");
    } catch (e) {
      if (e.message === "EXPIRED") setGState("expired");
      else { setGErr(e.message); setGState("error"); }
    }
  }, [d0, d1, shown, cals.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadEvents(); }, [loadEvents, showConnect]);

  const reconnect = async () => {
    try { await requestToken(true); await loadEvents(); }
    catch (e) { setGErr(e.message); setGState("error"); }
  };
  const toggleCal = id => {
    const cur = shown?.length ? shown : cals.filter(c => c.primary).map(c => c.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    setShown(next); setPrefs({ calIds: next });
  };
  const setCalColor = (id, hex) => { const n = { ...calColors, [id]: hex }; setCalColors(n); setPrefs({ calColors: n }); setColorFor(null); };
  const shownIds = shown?.length ? shown : cals.filter(c => c.primary).map(c => c.id);

  // ── Données par jour
  const tasksOf = ds => todos.filter(t => t.slotDate === ds && t.slotMin).sort((a, b) => a.slotStart - b.slotStart);
  const plannedAll = days.flatMap(ds => slotsOf(todos, ds));
  const timedOf = ds => events.filter(e => e.ds === ds && !e.allDay);
  const fixedOf = ds => timedOf(ds).map(e => ({ a: e.start, b: e.end }));
  const match = s => !q.trim() || (s || "").toLowerCase().includes(q.trim().toLowerCase());

  const backlog = todos
    .filter(t => !t.done && t.gtd !== "projet" && !t.recurrence?.enabled && !(t.slotMin && days.includes(t.slotDate)))
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
  const objHours = useMemo(() => {
    const m = {};
    plannedAll.forEach(t => { const i = info(t); m[i.label] = m[i.label] || { color: i.color, min: 0 }; m[i.label].min += t.slotMin; });
    return Object.entries(m).sort((a, b) => b[1].min - a[1].min);
  }, [plannedAll, colorOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const plannedMin = plannedAll.reduce((a, t) => a + t.slotMin, 0);
  const dayMin = (END_H - START_H) * 60 * (view === "m" ? 0 : days.length);
  const fixedMin = view === "m" ? 0 : days.reduce((tot, ds) => tot + fixedOf(ds).reduce((a, f) => a + Math.max(0, Math.min(f.b, END_H * 60) - Math.max(f.a, START_H * 60)), 0), 0);
  const freeMin = Math.max(0, dayMin - fixedMin - plannedMin);

  // ── Tâches : poser / déplacer / durée (pas de chevauchement avec un autre élément)
  const clash = (ds, start, min, ignoreId) => {
    const end = start + min;
    if (start < START_H * 60 || end > END_H * 60) return `Hors de la grille ${START_H} h – ${END_H} h`;
    if (fixedOf(ds).some(f => start < f.b && end > f.a)) return "Créneau pris par un événement Google";
    if (slotsOf(todos, ds).some(t => t.id !== ignoreId && start < t.slotStart + t.slotMin && end > t.slotStart)) return "Créneau déjà planifié";
    return "";
  };
  const place = (id, ds, start, min) => {
    const err = clash(ds, start, min, id);
    if (err) { setMsg(err); return false; }
    setMsg("");
    updateTodo(id, { slotDate: ds, slotStart: start, slotMin: min });
    return true;
  };
  const unplan = t => { updateTodo(t.id, { slotDate: undefined, slotStart: undefined, slotMin: undefined }); setBlockSel(null); };
  const setDurOnBlock = (t, m) => { const er = clash(t.slotDate, t.slotStart, m, t.id); if (!er) updateTodo(t.id, { slotMin: m }); else setMsg(er); };
  const pickDur = m => { patchUi({ dur: m }); const b = plannedAll.find(t => t.id === blockSel); if (b) setDurOnBlock(b, m); };

  const validate = async () => {
    if (!isLinked()) { setShowConnect(true); return; }
    setBusy(true); setMsg("");
    try {
      if (!hasToken()) await requestToken(true);
      const removed = todos.filter(t => t.slotEventId && (!t.slotDate || t.done));
      const { ids, gone } = await pushBlocks(plannedAll, removed);
      Object.entries(ids).forEach(([id, ev]) => updateTodo(id, { slotEventId: ev }));
      gone.forEach(id => updateTodo(id, { slotEventId: undefined }));
      setMsg(`✓ ${plannedAll.length} bloc${plannedAll.length > 1 ? "s" : ""} envoyé${plannedAll.length > 1 ? "s" : ""} dans ton calendrier Polaris`);
      setGState("ok");
    } catch (e) { setMsg("Envoi impossible : " + (e.message === "EXPIRED" ? "reconnecte Google" : e.message)); }
    setBusy(false);
  };

  // ── Événements Google : ouvrir, créer, modifier, supprimer
  const editable = e => canEdit() && e.writable && !e.multi;
  const openEvent = e => { setPErr(""); setPanel({ ...e, isNew: false }); };
  const defaultCal = () => {
    const last = getPrefs().lastCalId;
    return writable.find(c => c.id === last) || writable.find(c => c.primary) || writable[0];
  };
  const openNew = (ds, a, b, allDay = false) => {
    if (!isLinked()) { setShowConnect(true); return; }
    if (!canEdit()) { setMsg("Reconnecte Google pour pouvoir créer des événements (bouton en haut à droite)."); return; }
    const c = defaultCal();
    if (!c) { setMsg("Aucun calendrier modifiable trouvé."); return; }
    setPErr("");
    setPanel({ isNew: true, ds, start: a, end: b, allDay, calId: c.id, writable: true, title: "", loc: "", desc: "", colorId: null, source: "", reminder: "default" });
  };
  const newNow = () => {
    const n = new Date(); const m = Math.ceil((n.getHours() * 60 + n.getMinutes()) / 15) * 15;
    const ds = days.includes(today) ? today : d0;
    const a = ds === today ? Math.min(Math.max(m, START_H * 60), (END_H - 1) * 60) : 9 * 60;
    openNew(ds, a, a + 60);
  };
  const savePanel = async (p, calId) => {
    setPBusy(true); setPErr("");
    try {
      if (panel.isNew) { await createEvent(calId, p); setPrefs({ lastCalId: calId }); }
      else await patchEvent(panel.calId, panel.id, p);
      setPanel(null); await loadEvents();
    } catch (e) { setPErr(e.message === "EXPIRED" ? "Session Google expirée : reconnecte Google." : e.message); if (e.message === "EXPIRED") setGState("expired"); }
    setPBusy(false);
  };
  const removePanel = async () => {
    if (!window.confirm(`Supprimer « ${panel.title} » de Google Agenda ?`)) return;
    setPBusy(true); setPErr("");
    try { await deleteEvent(panel.calId, panel.id); setPanel(null); await loadEvents(); }
    catch (e) { setPErr(e.message); }
    setPBusy(false);
  };
  const dupPanel = async () => {
    setPBusy(true); setPErr("");
    try {
      await createEvent(panel.calId, { title: panel.title + " (copie)", ds: panel.ds, start: panel.start, end: panel.end, allDay: panel.allDay, loc: panel.loc, desc: panel.desc, colorId: panel.colorId, link: panel.source, reminder: panel.reminder });
      setPanel(null); await loadEvents();
    } catch (e) { setPErr(e.message); }
    setPBusy(false);
  };
  const meetPanel = async () => {
    setPBusy(true); setPErr("");
    try {
      const url = await addMeet(panel.calId, panel.id);
      if (url) setPanel(p => ({ ...p, link: { url, label: "Meet" } }));
      await loadEvents();
    } catch (e) { setPErr(e.message); }
    setPBusy(false);
  };
  // Déplacer / étirer un événement à la souris : on met à jour tout de suite, Google ensuite.
  const commitGoogle = async (e, ds, a, b) => {
    const prev = events;
    setEvents(evs => evs.map(x => x.key === e.key ? { ...x, ds, start: a, end: b, key: e.id + "@" + ds } : x));
    try { await patchEvent(e.calId, e.id, { ds, start: a, end: b, allDay: false }); loadEvents(); }
    catch (er) { setEvents(prev); setMsg(er.message === "EXPIRED" ? "Session Google expirée : reconnecte Google." : er.message); if (er.message === "EXPIRED") setGState("expired"); }
  };

  // ── Souris sur la grille : créer (glisser sur du vide), déplacer, étirer
  const locate = (x, y) => {
    const cols = [...(gridRef.current?.querySelectorAll("[data-col]") || [])];
    if (!cols.length) return null;
    let col = cols.find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
    if (!col) col = x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
    const r = col.getBoundingClientRect();
    const raw = ((y - r.top) / PX) * 60 + START_H * 60;
    return { ds: col.dataset.col, min: Math.max(START_H * 60, Math.min(END_H * 60, raw)) };
  };
  const beginDrag = (e, kind, item) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const loc = locate(e.clientX, e.clientY);
    if (!loc) return;
    dragRef.current = { kind, item, ds: item.ds, x0: e.clientX, y0: e.clientY, moved: false, anchor: loc.min, grab: loc.min - item.a, dur: item.b - item.a, noDrag: !!item.noDrag };
  };
  const beginCreate = (e, ds) => {
    if (e.button !== 0 || picked || e.target.closest("[data-item]")) return;
    const loc = locate(e.clientX, e.clientY);
    if (!loc) return;
    dragRef.current = { kind: "create", item: { ds }, ds, x0: e.clientX, y0: e.clientY, moved: false, anchor: loc.min };
  };
  const snap = m => Math.round(m / 15) * 15;
  const floor15 = m => Math.floor(m / 15) * 15;
  act.current.move = ev => {
    const d = dragRef.current; if (!d || d.noDrag) return;
    if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return;
    d.moved = true;
    const loc = locate(ev.clientX, ev.clientY); if (!loc) return;
    if (d.kind === "move") {
      const a = Math.max(START_H * 60, Math.min(END_H * 60 - d.dur, snap(loc.min - d.grab)));
      d.ghost = { ds: loc.ds, a, b: a + d.dur };
    } else if (d.kind === "resize") {
      d.ghost = { ds: d.item.ds, a: d.item.a, b: Math.min(END_H * 60, Math.max(d.item.a + 15, snap(loc.min))) };
    } else {
      const f = floor15(loc.min), an = floor15(d.anchor);
      d.ghost = { ds: d.ds, a: Math.min(an, f), b: Math.max(an, f) + 15 };
    }
    setGhost({ ...d.ghost, kind: d.kind, color: d.item.color || null });
  };
  act.current.up = () => {
    const d = dragRef.current; dragRef.current = null; setGhost(null);
    if (!d) return;
    const g = d.ghost, it = d.item;
    if (d.kind === "create") {
      if (!d.moved) { const a = Math.min(floor15(d.anchor), END_H * 60 - ui.dur); openNew(d.ds, a, a + ui.dur); }
      else if (g) openNew(g.ds, g.a, g.b);
      return;
    }
    if (!d.moved || d.noDrag || !g) {
      if (d.kind === "resize") return;
      if (it.kind === "g") openEvent(it.e); else { setBlockSel(b => b === it.t.id ? null : it.t.id); setPicked(null); patchUi({ dur: it.t.slotMin }); }
      return;
    }
    if (it.kind === "g") {
      if (g.ds === it.ds && g.a === it.a && g.b === it.b) return;
      commitGoogle(it.e, g.ds, g.a, g.b);
    } else if (d.kind === "move") place(it.t.id, g.ds, g.a, g.b - g.a);
    else setDurOnBlock(it.t, g.b - g.a);
  };
  useEffect(() => {
    const mv = e => act.current.move(e), up = e => act.current.up(e);
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, []);

  const onColClick = (e, ds) => {
    if (!picked || e.target.closest("[data-item]")) return;
    const loc = locate(e.clientX, e.clientY);
    if (loc && place(picked, ds, snap(loc.min), ui.dur)) setPicked(null);
  };
  const onColDrop = (e, ds) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || picked;
    if (!id) return;
    const t = todos.find(x => x.id === id);
    const loc = locate(e.clientX, e.clientY);
    if (loc && place(id, ds, snap(loc.min), t?.slotMin && t.slotDate ? t.slotMin : ui.dur)) setPicked(null);
  };

  // ── Navigation + clavier
  const step = dir => setDate(d => view === "m" ? addMonths(d, dir) : addDays(d, dir * (view === "7" ? 7 : Number(view))));
  const goDay = ds => { setDate(ds); };
  act.current.key = e => {
    if (e.target.closest?.("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) {
      if (e.key === "Escape" && e.target.closest?.("input")) e.target.blur();
      return;
    }
    if (e.key === "Escape") { if (panel) setPanel(null); else if (showSet) setShowSet(false); else if (!showConnect) onClose(); return; }
    if (panel || showConnect) return;
    const k = e.key.toLowerCase();
    if (k === "arrowleft") step(-1);
    else if (k === "arrowright") step(1);
    else if (k === "t") setDate(today);
    else if (k === "c") { e.preventDefault(); newNow(); }
    else if (k === "/") { e.preventDefault(); searchRef.current?.focus(); }
    else if ("1234".includes(k) && k.length === 1) patchUi({ view: ["1", "3", "7", "m"][Number(k) - 1] });
  };
  useEffect(() => {
    const kd = e => act.current.key(e);
    window.addEventListener("keydown", kd);
    return () => window.removeEventListener("keydown", kd);
  }, []);

  // Fait défiler jusqu'à l'heure actuelle à l'ouverture.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !gridRef.current || view === "m") return;
    const n = new Date(); const m = days.includes(today) ? Math.max(START_H * 60, n.getHours() * 60 - 60) : START_H * 60;
    gridRef.current.scrollTop = Math.max(0, (m - START_H * 60) / 60 * PX - 4);
    scrolled.current = true;
  });

  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  const topOf = m => (m - START_H * 60) / 60 * PX;
  const title = view === "m"
    ? parse(addMonths(date, 0)).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : view === "1" ? longDate(date)
      : `${parse(d0).getDate()}${parse(d0).getMonth() !== parse(d1).getMonth() ? " " + parse(d0).toLocaleDateString("fr-FR", { month: "short" }) : ""} – ${parse(d1).getDate()} ${parse(d1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
  const sub = view === "7" ? `Semaine ${isoWeek(d0)}` : "";
  const results = q.trim().length >= 2
    ? [...events.filter(e => match(e.title)).map(e => ({ k: "g" + e.key, ds: e.ds, label: e.title, at: e.allDay ? "journée" : hhmm(e.start), e })),
       ...todos.filter(t => t.slotDate && !t.done && match(t.name)).map(t => ({ k: "t" + t.id, ds: t.slotDate, label: t.name, at: hhmm(t.slotStart) }))].slice(0, 8)
    : [];
  const readOnly = gState === "ok" && !canEdit();

  // ── Rendu d'un élément de la grille (événement Google ou bloc de tâche)
  const renderItem = (it, ds) => {
    const a = Math.max(it.a, START_H * 60), b = Math.min(it.b, END_H * 60);
    if (b <= a) return null;
    const h = Math.max(16, (b - a) / 60 * PX - 2);
    const isG = it.kind === "g";
    const col = isG ? evColor(it.e) : (it.t.done ? GREY : info(it.t).color);
    const past = ui.gray && isG && (ds < today || (ds === today && it.b <= nowMin));
    const done = !isG && it.t.done;
    const sel = !isG && blockSel === it.t.id;
    const draggable = isG ? editable(it.e) : !it.t.done;
    const style = {
      top: topOf(a) + 1, height: h, left: `calc(${it.lane * 100 / it.lanes}% + 2px)`, width: `calc(${100 / it.lanes}% - 4px)`,
      background: col + "26", borderColor: col + "55", borderLeftColor: col, "--c": col,
    };
    const item = { ...it, ds, noDrag: !draggable };
    const small = h < 40;
    const t = it.kind === "g" ? it.e.title : it.t.name;
    const link = isG ? it.e.link : null;
    return (
      <div key={it.key} data-item className={"tb-card" + (isG ? " is-g" : " is-t") + (past ? " is-past" : "") + (done ? " is-done" : "") + (sel ? " is-sel" : "") + (draggable ? " is-drag" : "")} style={style}
        onMouseDown={e => beginDrag(e, "move", item)}>
        <div className={"tb-card-in" + (small ? " is-small" : "")}>
          <div className="tb-card-t">
            {!isG && (
              <button className={"tb-chk" + (done ? " is-on" : "")} style={{ borderColor: col, background: done ? col : "transparent" }} aria-label={done ? "Réouvrir" : "Terminé"}
                onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); toggleDone && toggleDone(it.t.id); }}>{done ? <Ic n="check" s={9} w={3.2} /> : null}</button>
            )}
            <span className="tb-card-n">{t}</span>
            {small && <span className="tb-card-s">{hhmm(it.a)}</span>}
          </div>
          {!small && <div className="tb-card-s" style={{ paddingLeft: isG ? 0 : 19 }}>{hhmm(it.a)} – {hhmm(it.b)}{!isG ? ` · ${fmtMin(it.b - it.a)}` : ""}</div>}
          {h >= 64 && isG && link && <a className="tb-card-badge" href={link.url} target="_blank" rel="noopener noreferrer" onMouseDown={e => e.stopPropagation()}><Ic n="video" s={11} />{link.label}</a>}
          {h >= 64 && isG && !link && it.e.loc && <div className="tb-card-loc"><Ic n="pin" s={11} /><span>{it.e.loc}</span></div>}
        </div>
        {sel && <button className="tb-x" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); unplan(it.t); }} aria-label="Retirer du plan">×</button>}
        {draggable && h >= 28 && <span className="tb-rs" onMouseDown={e => beginDrag(e, "resize", item)} />}
      </div>
    );
  };

  // ── Vue horaire (1 / 3 / 7 jours)
  const GUT = 52;
  const gh = (END_H - START_H) * PX;
  const timeView = (
    <div className="tb-grid" ref={gridRef}>
      <div className="tb-cols" style={{ gridTemplateColumns: `${GUT}px repeat(${days.length}, minmax(${view === "7" ? 96 : 0}px, 1fr))` }}>
        <div className="tb-corner" />
        {days.map(ds => (
          <button key={ds} className={"tb-dh" + (ds === today ? " is-today" : "")} onClick={() => { goDay(ds); patchUi({ view: "1" }); }} title="Voir ce jour">
            <span>{parse(ds).toLocaleDateString("fr-FR", { weekday: "short" })}</span><b>{parse(ds).getDate()}</b>
          </button>
        ))}
        <div className="tb-corner tb-ad-l"><span>Journée</span></div>
        {days.map(ds => (
          <div key={ds} className="tb-ad" onDoubleClick={() => openNew(ds, 9 * 60, 10 * 60, true)}>
            {events.filter(e => e.ds === ds && e.allDay && match(e.title)).map(e => (
              <button key={e.key} className="tb-ad-p" style={{ background: evColor(e) }} onClick={() => openEvent(e)}>{e.title}</button>
            ))}
          </div>
        ))}
        <div className="tb-gutter" style={{ height: gh }}>
          {Array.from({ length: END_H - START_H - 1 }, (_, i) => <span key={i} style={{ top: (i + 1) * PX - 8 }}>{START_H + i + 1}h</span>)}
          {days.includes(today) && nowMin >= START_H * 60 && nowMin < END_H * 60 && <span className="tb-now-l" style={{ top: topOf(nowMin) - 9 }}>{hhmm(nowMin)}</span>}
        </div>
        {days.map(ds => {
          const items = [
            ...timedOf(ds).filter(e => match(e.title)).map(e => ({ kind: "g", key: e.key, a: e.start, b: e.end, e })),
            ...tasksOf(ds).filter(t => match(t.name)).map(t => ({ kind: "t", key: t.id, a: t.slotStart, b: t.slotStart + t.slotMin, t })),
          ];
          const g = ghost && ghost.ds === ds ? ghost : null;
          return (
            <div key={ds} data-col={ds} className={"tb-col" + (ds === today ? " is-today" : "")} style={{ height: gh }}
              onMouseDown={e => beginCreate(e, ds)} onClick={e => onColClick(e, ds)} onDragOver={e => e.preventDefault()} onDrop={e => onColDrop(e, ds)}>
              {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="tb-hour" style={{ top: i * PX }} />)}
              {layout(items).map(it => renderItem(it, ds))}
              {g && <div className={"tb-ghost" + (g.kind === "create" ? " is-new" : "")} style={{ top: topOf(g.a), height: Math.max(8, (g.b - g.a) / 60 * PX), borderColor: g.color || "var(--acc)" }}><span>{hhmm(g.a)} – {hhmm(g.b)}</span></div>}
              {ds === today && nowMin >= START_H * 60 && nowMin < END_H * 60 && <div className="tb-now" style={{ top: topOf(nowMin) }} />}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Vue mois
  const monthView = (
    <div className="tb-month">
      <div className="tb-month-w">{days.slice(0, 7).map(ds => <span key={ds}>{parse(ds).toLocaleDateString("fr-FR", { weekday: "short" })}</span>)}</div>
      <div className="tb-month-g">
        {days.map(ds => {
          const evs = events.filter(e => e.ds === ds && match(e.title)).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
          const tk = tasksOf(ds).filter(t => !t.done).length;
          const out = parse(ds).getMonth() !== monthNo;
          return (
            <div key={ds} className={"tb-mc" + (out ? " is-out" : "") + (ds === today ? " is-today" : "")} onClick={() => { goDay(ds); patchUi({ view: "7" }); }}>
              <div className="tb-mc-h"><span className="tb-mc-n">{parse(ds).getDate()}</span>{tk > 0 && <span className="tb-mc-t">{tk} tâche{tk > 1 ? "s" : ""}</span>}</div>
              {evs.slice(0, 3).map(e => <button key={e.key} className="tb-mc-p" style={{ borderLeftColor: evColor(e), background: evColor(e) + "26" }} onClick={ev => { ev.stopPropagation(); openEvent(e); }}>{e.title}</button>)}
              {evs.length > 3 && <span className="tb-mc-more">+{evs.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <div className="tb-root" role="dialog" aria-label="Calendrier" style={{ "--acc": ui.accent }}>
      <header className="tb-head">
        <button className="tb-nav tb-menu" onClick={() => setSideOpen(s => !s)} aria-label="Menu"><Ic n="menu" s={17} /></button>
        <span className="tb-word">Calendrier</span>
        <button className="tb-nav" onClick={() => step(-1)} aria-label="Avant"><Ic n="chevl" s={17} /></button>
        <button className="tb-nav" onClick={() => step(1)} aria-label="Après"><Ic n="chevr" s={17} /></button>
        <button className="tb-pill" onClick={() => setDate(today)}>Aujourd'hui</button>
        <span className="tb-date">{title}</span>{sub && <span className="tb-sub">{sub}</span>}
        <span style={{ flex: 1 }} />
        <div className="tb-search">
          <Ic n="search" s={14} />
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" aria-label="Rechercher" />
          {!q && <kbd>/</kbd>}
          {results.length > 0 && (
            <div className="tb-search-r">
              {results.map(r => <button key={r.k} onClick={() => { goDay(r.ds); setQ(""); if (r.e) openEvent(r.e); }}><b>{r.label}</b><span>{shortDay(r.ds)} · {r.at}</span></button>)}
            </div>
          )}
        </div>
        <span className="tb-seg" role="tablist" aria-label="Vue">
          {VIEWS.map(([v, l]) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "is-on" : ""} onClick={() => patchUi({ view: v })}>{l}</button>)}
        </span>
        {gState === "ok" && !readOnly && <button className="tb-pill tb-pill-ok" onClick={() => setShowConnect(true)}>● Google connecté</button>}
        {readOnly && <button className="tb-pill tb-pill-warn" onClick={() => { disconnect(); setShowConnect(true); setGState("off"); }} title="Reconnecte et laisse tout coché">Lecture seule : reconnecter</button>}
        {gState === "expired" && <button className="tb-pill tb-pill-warn" onClick={reconnect}>Reconnecter Google</button>}
        {gState === "off" && <button className="tb-pill" onClick={() => setShowConnect(true)}>Connecter Google Agenda</button>}
        {gState === "error" && <button className="tb-pill tb-pill-warn" onClick={reconnect} title={gErr}>Google : erreur, réessayer</button>}
        <button className="tb-nav" onClick={() => setShowSet(s => !s)} aria-label="Personnaliser" title="Personnaliser"><Ic n="sliders" s={16} /></button>
        <button className="tb-btn tb-primary tb-new" onClick={newNow}><Ic n="plus" s={15} w={2.4} />Événement</button>
        <button className="tb-btn tb-primary tb-validate" onClick={validate} disabled={busy || !plannedAll.length}>{busy ? "Envoi…" : "Valider mon plan"}</button>
        <button className="tb-btn" onClick={onClose} aria-label="Fermer"><Ic n="close" s={15} /></button>
      </header>

      {showSet && (
        <div className="tb-set" onClick={e => e.stopPropagation()}>
          <b>Personnaliser</b>
          <div className="tb-set-r"><span>Couleur d'accent</span><span className="tb-set-sw">{ACCENTS.map(c => <button key={c} aria-label={c} className={ui.accent === c ? "is-on" : ""} style={{ background: c }} onClick={() => patchUi({ accent: c })} />)}</span></div>
          <label className="tb-set-r"><span>Vue au démarrage</span><select value={ui.view} onChange={e => patchUi({ view: e.target.value })}>{VIEWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="tb-set-r"><span>Début de semaine</span><select value={ui.ws} onChange={e => patchUi({ ws: Number(e.target.value) })}><option value={1}>Lundi</option><option value={0}>Dimanche</option></select></label>
          <label className="tb-set-r"><span>Heures visibles</span><span><select value={ui.startH} onChange={e => patchUi({ startH: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i}h</option>)}</select> – <select value={ui.endH} onChange={e => patchUi({ endH: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 13}>{i + 13}h</option>)}</select></span></label>
          <label className="tb-set-r"><span>Durée par défaut</span><select value={ui.dur} onChange={e => patchUi({ dur: Number(e.target.value) })}>{[15, 25, 30, 45, 60, 90].map(m => <option key={m} value={m}>{fmtMin(m)}</option>)}</select></label>
          <label className="tb-set-r"><span>Mode compact</span><input type="checkbox" checked={ui.compact} onChange={e => patchUi({ compact: e.target.checked })} /></label>
          <label className="tb-set-r"><span>Griser les événements passés</span><input type="checkbox" checked={ui.gray} onChange={e => patchUi({ gray: e.target.checked })} /></label>
          <p className="tb-note">Raccourcis : ← → naviguer · T aujourd'hui · C créer · 1 2 3 4 vues · / chercher · Échap fermer.</p>
        </div>
      )}

      <div className={"tb-body" + (sideOpen ? " is-side" : "")} onClick={() => { if (showSet) setShowSet(false); }}>
        <aside className="tb-back">
          <MiniMonth date={date} today={today} ws={ui.ws} days={view === "m" ? [] : days} onPick={ds => { setDate(ds); setSideOpen(false); }} onMonth={n => setDate(d => addMonths(d, n))} />
          <div className="tb-tabs" role="tablist">
            <button role="tab" aria-selected={ui.tab === "plan"} className={ui.tab === "plan" ? "is-on" : ""} onClick={() => patchUi({ tab: "plan" })}>À planifier{backlog.length ? ` (${backlog.length})` : ""}</button>
            <button role="tab" aria-selected={ui.tab === "cal"} className={ui.tab === "cal" ? "is-on" : ""} onClick={() => patchUi({ tab: "cal" })}>Calendriers</button>
          </div>
          {ui.tab === "plan" ? (<>
            {groups.length === 0 && <p className="tb-note">Plus rien à planifier.</p>}
            {groups.map(g => (
              <div key={g.label}>
                <div className="tb-gl"><i style={{ background: g.color }} />{g.label}</div>
                {g.items.map(t => (
                  <div key={t.id} draggable
                    onDragStart={e => { e.dataTransfer.setData("text/plain", t.id); setPicked(t.id); }}
                    onClick={() => { setPicked(p => p === t.id ? null : t.id); setBlockSel(null); setSideOpen(false); }}
                    className={"tb-item" + (picked === t.id ? " is-picked" : "")} style={{ borderLeftColor: g.color }}>
                    <span className="tb-grip">⋮⋮</span>
                    <span className="tb-name">{t.name}</span>
                    <span className="tb-when">{(t.dateAssignee || t.dateFin) ? parse(t.dateAssignee || t.dateFin).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span>
                  </div>
                ))}
              </div>
            ))}
          </>) : (<>
            <div className="tb-gl">Mes calendriers</div>
            {gState === "off" && <p className="tb-note">Connecte Google Agenda pour voir tes calendriers.</p>}
            {cals.filter(c => c.name !== "Polaris").map(c => {
              const on = shownIds.includes(c.id);
              return (
                <div key={c.id} className="tb-cal">
                  <button className="tb-cal-box" aria-label={on ? "Masquer" : "Afficher"} aria-pressed={on} onClick={() => toggleCal(c.id)} style={{ background: on ? calCol[c.id] : "transparent", borderColor: calCol[c.id] }}>{on && <Ic n="check" s={11} w={3.2} />}</button>
                  <span className="tb-cal-n">{c.name}</span>
                  <button className="tb-cal-c" aria-label="Changer la couleur" style={{ background: calCol[c.id] }} onClick={() => setColorFor(colorFor === c.id ? null : c.id)} />
                  {colorFor === c.id && <div className="tb-cal-sw">{EVENT_COLORS.map(x => <button key={x.id} aria-label={x.name} title={x.name} style={{ background: x.hex }} onClick={() => setCalColor(c.id, x.hex)} />)}</div>}
                </div>
              );
            })}
            <div className="tb-gl">Tâches planifiées · objectifs</div>
            {objHours.length === 0 && <p className="tb-note">Aucune tâche posée sur cette période.</p>}
            {objHours.map(([label, o]) => (
              <div key={label} className="tb-obj"><span><i style={{ background: o.color }} />{label}</span><b>{fmtMin(o.min)}</b></div>
            ))}
          </>)}
        </aside>

        <section className="tb-day">
          {view !== "m" && (
            <div className="tb-bar">
              <span className="tb-count"><b style={{ color: "#2ee59d" }}>{fmtMin(freeMin)}</b> libres</span>
              <span className="tb-count"><b style={{ color: "var(--acc)" }}>{plannedMin ? fmtMin(plannedMin) : "0 min"}</b> planifiées</span>
              <span style={{ flex: 1 }} />
              <span className="tb-durl">Durée :</span>
              {DURS.map(([m, l]) => <button key={m} className={"tb-chip" + (ui.dur === m ? " is-on" : "")} onClick={() => pickDur(m)}>{l}</button>)}
            </div>
          )}
          <div className="tb-hint">{msg || (picked ? "Clique ou dépose sur un créneau libre." : view === "m" ? "Clique un jour pour voir la semaine." : "Glisse sur du vide pour créer · glisse un événement pour le déplacer · tire le bas pour la durée · clique pour modifier.")}</div>
          {view === "m" ? monthView : timeView}
          <div className="tb-legend"><span><i className="tb-lg-t" />Tâche Polaris (couleur = objectif)</span><span><i className="tb-lg-g" />Événement Google (couleur = calendrier ou choisie)</span></div>
        </section>
      </div>

      {panel && (
        <div className="tb-ep-wrap" onClick={() => setPanel(null)}>
          <EventPanel key={panel.key || "new" + panel.ds + panel.start} ev={panel} cals={writable.length ? writable : cals} editable={panel.isNew || editable(panel)}
            busy={pBusy} err={pErr} onSave={savePanel} onDelete={removePanel} onDuplicate={dupPanel} onMeet={meetPanel}
            onReconnect={() => { setPanel(null); disconnect(); setShowConnect(true); setGState("off"); }} onClose={() => setPanel(null)} />
        </div>
      )}

      {showConnect && (
        <div className="tb-modal" onClick={() => setShowConnect(false)}>
          <div className="tb-gcw" onClick={e => e.stopPropagation()}>
            <GoogleConnect onClose={() => setShowConnect(false)} onDone={() => { setShowConnect(false); setCals([]); setGState(isLinked() ? (hasToken() ? "ok" : "expired") : "off"); }} />
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
