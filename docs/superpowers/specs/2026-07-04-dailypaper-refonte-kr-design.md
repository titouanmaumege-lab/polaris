# Refonte DailyPaper + suivi KR mensuels — Design

**Date:** 2026-07-04
**Fichier concerné:** `src/App.jsx` (`DailyPaperModule` ~L4429, `RetrospectiveCards` ~L4284, `WeeklyReview` ~L4800)
**Modules touchés:** DailyPaper (principal), Weekly Review (énergie), utils `math.js` (réutilisé).

## Objectif

Deux buts en un :
1. **Refonte DA + modernisation** de la page DailyPaper, avec allègement des champs peu utiles.
2. **Ajouter le suivi des Key Results mensuels** directement dans DailyPaper : voir les KR chiffrés des objectifs mensuels et mettre à jour leur valeur `actuelle` au quotidien, avec visuel d'avancement.

## Modèle de données (existant, inchangé)

- Objectifs stockés dans `localStorage["lp_goals"]` : `{ longterme, annuel, trimestre, mensuel }`, chaque niveau = tableau d'objectifs.
- Objectif : `{ id, titre, statut, spaces, krs: [] }`.
- Key Result : `{ nom, depart, actuelle, cible }`.
- Helpers (`src/utils/math.js`, déjà importés dans App.jsx) :
  - `krPct(kr)` → % d'un KR (gère sens croissant/décroissant).
  - `krsProgress(krs)` → % global objectif (moyenne KR + bonus complétion).
- Entrée journal : `localStorage["lp_daily"][date]` normalisée par `djEntry()` / `DJ_EMPTY()`.
  Champs énergie : `morning`, `noon`, `evening`, `focus`, `stress`, `happy` (valeurs = strings de `DJ_ENERGY`/`DJ_FOCUS`/…).

## Décisions actées

| Sujet | Décision |
|---|---|
| But | DA + modernisation + questionner l'utilité des champs |
| Énergie | Fusionner matin/midi/soir en **1 seule énergie/jour** (`morning`). C'est la seule énergie partout, y compris Weekly. |
| KR affichés | **Objectifs mensuels seulement**, filtrés sur `krs.length > 0` |
| Édition KR | Mise à jour de **`actuelle` uniquement** (départ/cible non modifiables ici) |
| Visuel KR | Barre de progression + valeurs `actuelle / cible` + stepper |
| Stepper | Pas de **1** + champ de saisie libre |
| Emplacement bloc KR | **Haut de page, sous la nav date** |

## Architecture

### 1. Nouveau composant `MonthlyKRTracker`

Composant autonome, isolé et testable seul.

**Props:** `{ onNav }`.

**État interne:**
- `goals` : `useState(() => getLS("lp_goals", NOTION_GOALS))`.
- Sauvegarde : `saveGoals(g) => { setGoals(g); setLS("lp_goals", g); }`.

**Dérivé:**
- `monthlyWithKR = (goals.mensuel || []).filter(o => (o.krs || []).length > 0)`.

**Rendu:**
- Titre de section : eyebrow uppercase « 🎯 Objectifs du mois » (style cohérent app).
- Si `monthlyWithKR` vide → message discret + lien « → Objectifs » via `onNav("objectifs:mensuel")`.
- Sinon, pour chaque objectif :
  - Ligne titre : `titre` + badge % global (`krsProgress(o.krs)`).
  - Pour chaque KR :
    - Nom du KR.
    - Barre de progression : largeur = `krPct(kr)`%, gradient accent.
    - Valeurs : `actuelle / cible` (+ `%`).
    - Contrôle : `[ − ] [ input actuelle ] [ + ]`.
      - `−` / `+` : `actuelle ± 1`.
      - `input` : saisie libre numérique (parse `Number`, fallback valeur courante ; vide toléré pendant frappe).

**Écriture (mise à jour d'un `actuelle`):**
```
updateKR(objId, krIndex, newActuelle):
  goals.mensuel map -> si o.id === objId :
    krs = o.krs.map((k,i) => i===krIndex ? { ...k, actuelle: newActuelle } : k)
    return { ...o, krs }
  saveGoals(next)   // écrit lp_goals en localStorage
```

**Synchronisation avec ObjectifsModule:**
`ObjectifsModule` lit `lp_goals` via `getLS` à son montage. Les modules se démontent/remontent au changement de vue (`setModule`). Donc écrire `lp_goals` depuis DailyPaper suffit : à la prochaine ouverture d'Objectifs, les valeurs à jour sont relues. C'est le pattern de synchro déjà utilisé par l'app (localStorage = source de vérité partagée). Aucune remontée d'état / contexte global à ajouter.

### 2. Refonte `DailyPaperModule`

Ordre des sections (haut → bas) :
1. Nav date — inchangée.
2. **`<MonthlyKRTracker onNav={onNav} />`** — nouveau, sous la nav date.
3. Méta : `type` (Select) + `remark` (Input) sur une ligne — inchangé fonctionnellement, style modernisé.
4. **Énergie & ressenti — 4 ratings** :
   - `DJRating "Énergie"` lié à `entry.morning` (remplace le trio Matin/Midi/Soir).
   - `DJRating "Focus"` / `"Stress"` / `"Bonheur"` — inchangés.
   - Les `DJRating` Midi (`noon`) et Soir (`evening`) sont **retirés de l'UI**. Les clés restent dans le modèle (données historiques intactes) mais ne sont plus saisies.
5. `RetrospectiveCards` (WIN / LOSS / À améliorer + custom items + rappel Finances) — inchangé.
6. Entrées récentes — inchangé.

### 3. Weekly Review — énergie unifiée

Dans le panneau « Énergie — journée » (~L4982) :
- Utiliser **une seule énergie** = `avgEnergy` (basée sur `morning`).
- Supprimer la ventilation Matin/Midi/Soir (les lignes `avgNoon`/`avgEve`) et les calculs `noonVals`/`eveVals`/`avgNoon`/`avgEve`/`avgEnergyDay` devenus inutiles.
- `RingGauge` affiche `avgEnergy`. Label « Énergie ».
- `persistReview` : `summary.avgEnergy` inchangé (déjà basé sur `avgEnergy`).

## DA / modernisation

- Réutiliser tokens `CF` / `CF_GRAD` / `CF_GLOW` déjà en place (cohérence avec Budget Pro).
- Titres de section : eyebrow uppercase, letterspacing, comme le reste de l'app.
- Barres KR : gradient accent (`linear-gradient(90deg, accent99, accent)`), coins arrondis, transition width.
- Steppers : boutons ronds compacts, input centré étroit.
- Aucune dépendance nouvelle.

## Gestion d'erreurs / cas limites

- `depart === cible` : `pct()` gère déjà (retourne 100 si atteint, sinon 0). Pas de division par zéro.
- KR sans `actuelle` : `krPct` fallback sur `depart ?? 0`. Input initialisé sur `actuelle ?? depart ?? 0`.
- Input vidé pendant la frappe : tolérer chaîne vide en état local, ne committer un `Number` valide qu'au blur/change valide.
- Aucun objectif mensuel / aucun KR : état vide géré (message + lien).
- `actuelle` peut dépasser `cible` ou passer sous `depart` : autorisé (valeur brute stockée) ; la barre `krPct` reste clampée 0–100.

## Tests / vérification

Vérification manuelle dans l'app (dev server) :
1. Bloc KR mensuels s'affiche sous la nav date avec les objectifs mensuels ayant des KR.
2. `+` / `−` modifient `actuelle` de 1 ; saisie libre fonctionne ; barre et % se recalculent.
3. Ouvrir Objectifs → la valeur `actuelle` mise à jour est bien reflétée (relecture localStorage).
4. Bloc énergie : 4 ratings, « Énergie » écrit dans `entry.morning`.
5. Entrées récentes / filtres (basés sur `morning`) fonctionnent toujours.
6. Weekly Review : une seule énergie affichée, pas de régression.
7. État vide (aucun KR mensuel) : message + lien vers Objectifs.

## Hors périmètre (YAGNI)

- Édition de `nom` / `depart` / `cible` d'un KR depuis DailyPaper (reste dans le modal Objectifs).
- Ajout / suppression de KR depuis DailyPaper.
- KR d'autres niveaux (LT / annuel / trimestre).
- Épinglage/sélection manuelle de KR.
- Historisation de la valeur `actuelle` par date (on écrit la valeur courante de l'objectif, pas un snapshot journalier).
