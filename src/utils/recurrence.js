// Logique pure des récurrences, partagée entre l'app et la fonction serveur
// /api/bank (aucune dépendance au navigateur ni à Supabase).

const pad = n => String(n).padStart(2, "0");
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Avance une date d'occurrence selon la récurrence (strictement > date donnée).
export function advanceOccurrence(rec, fromStr) {
  const d = new Date(fromStr + "T12:00:00");
  const iv = Math.max(1, rec.interval || 1);
  if (rec.freq === "jour") d.setDate(d.getDate() + iv);
  else if (rec.freq === "semaine") d.setDate(d.getDate() + 7 * iv);
  else if (rec.freq === "mois") {
    d.setDate(1);                                   // évite le 31 janv. + 1 mois = 3 mars
    d.setMonth(d.getMonth() + iv);
    const lm = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(rec.day_of_month || new Date(fromStr + "T12:00:00").getDate(), lm));
  } else if (rec.freq === "annee") {
    d.setFullYear(d.getFullYear() + iv);
    if (rec.month_of_year) d.setMonth(rec.month_of_year - 1);
    if (rec.day_of_month) { const lm = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(rec.day_of_month, lm)); }
  }
  return fmt(d);
}

// Mots qui changent d'une échéance à l'autre ou n'identifient rien.
const STOP = new Set([
  "prlv", "prelevement", "sepa", "vir", "virement", "inst", "instantane", "recu", "emis", "sct", "sdd",
  "carte", "paiement", "achat", "retrait", "dab", "ref", "reference", "mandat", "ech", "echeance",
  "frais", "date", "motif", "objet", "libelle", "the",
  "sas", "sasu", "sarl", "eurl", "sci", "ste", "societe", "cie", "and", "des", "les", "pour", "par", "sur", "avec", "com", "www", "fra",
  "janv", "fevr", "mars", "avril", "mai", "juin", "juil", "aout", "sept", "octo", "nove", "dece",
  "janvier", "fevrier", "juillet", "septembre", "octobre", "novembre", "decembre",
]);

export function labelTokens(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, " ").split(" ")
    .filter(w => w.length >= 3 && !STOP.has(w));
}

// Empreinte d'un libellé : ses 3 premiers mots significatifs (sans chiffres ni
// références). « PRLV SEPA NETFLIX.COM 8842 REF 12 » → « netflix ».
export const matchKeyOf = label => [...new Set(labelTokens(label))].slice(0, 3).join(" ");

// Fenêtre de tolérance autour de l'échéance attendue, en jours.
const WINDOW = { jour: 1, semaine: 3, mois: 10, annee: 30 };
const daysBetween = (a, b) => Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 864e5);

// Libellés connus d'une récurrence : celui d'origine + ceux appris à la main.
export const recKeys = rec => [...new Set([...(rec.match_keys || []), rec.match_key].filter(k => k && k !== "*"))];

// Un libellé ressemble-t-il à une empreinte ? Le premier mot (en général le
// prestataire ou l'employeur) doit être là, plus au moins un tiers des mots :
// « acme salaire » reconnaît « ACME PAIE OCTOBRE », pas « DUPONT SALAIRE » ;
// « carrefour market paris » reconnaît « CARREFOUR CITY ». Le montant et la
// date (vérifiés à côté) évitent de confondre deux achats chez la même enseigne.
export function labelMatchesKey(key, tokens) {
  const want = key.split(" ").filter(Boolean);
  if (!want.length || !tokens.has(want[0])) return false;
  return want.filter(w => tokens.has(w)).length >= Math.ceil(want.length / 3);
}

// Une opération correspond-elle à cette récurrence ?
export function matchesRecurring(rec, t) {
  if (!rec.active || !rec.match_key || t.recurring_id) return false;
  if (rec.account_id !== t.account_id || rec.type !== t.type) return false;
  const have = new Set(labelTokens(t.bank_label || t.note));
  if (!recKeys(rec).some(k => labelMatchesKey(k, have))) return false;
  const tol = Math.max(2, Number(rec.amount) * 0.25);        // salaires et factures varient un peu
  if (Math.abs(Number(t.amount) - Number(rec.amount)) > tol) return false;
  // Pas plus tôt que l'échéance moins la fenêtre ; en retard, on accepte.
  return daysBetween(t.date, rec.next_occurrence) >= -(WINDOW[rec.freq] ?? 10);
}

// Échéance suivante une fois l'opération t rattachée (payée en avance ou en retard).
export function nextAfter(rec, t) {
  let next = rec.next_occurrence;
  do { next = advanceOccurrence(rec, next); } while (next <= t.date);
  return next;
}

// Rattache les opérations aux récurrences. Renvoie les changements à écrire,
// sans rien écrire soi-même : { txUpdates: [{id, patch}], recUpdates: [{id, next_occurrence}] }.
export function planRecurringMatches(recs, txs) {
  const state = recs.map(r => ({ ...r }));
  const txUpdates = [], recUpdates = new Map();
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    const rec = state.find(r => matchesRecurring(r, t));
    if (!rec) continue;
    const patch = { recurring_id: rec.id };
    if (!t.category_id && rec.category_id) patch.category_id = rec.category_id;
    if (t.type === "revenu" && !t.revenu_kind && rec.revenu_kind) {
      patch.revenu_kind = rec.revenu_kind;
      if (rec.revenu_kind === "salaire" && rec.employer_id) patch.employer_id = rec.employer_id;
      if (rec.revenu_kind === "aides_sociales" && rec.aide_type_id) patch.aide_type_id = rec.aide_type_id;
    }
    txUpdates.push({ id: t.id, patch });
    // L'opération consomme l'échéance en cours, même payée un peu en avance.
    const next = nextAfter(rec, t);
    rec.next_occurrence = next;
    recUpdates.set(rec.id, next);
  }
  return { txUpdates, recUpdates: [...recUpdates].map(([id, next_occurrence]) => ({ id, next_occurrence })) };
}
