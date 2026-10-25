# API Polaris — accès pour un assistant IA

Cette API permet à un assistant (par ex. Claude sur ton ordinateur) de **lire** tes tâches et tes reviews, d'**ajouter** des tâches et de les **modifier**. Elle ne permet **aucune suppression**.

## Base URL

```
https://polaris-mmg.vercel.app/api/v1
```

## Authentification

1. Dans Polaris : **Réglages → Accès API (assistant IA) → Générer une clé API**.
2. Copie la clé (`pol_…`) : elle n'est affichée qu'une seule fois.
3. Envoie-la dans chaque requête :

```
Authorization: Bearer pol_xxxxxxxxxxxxxxxx
```

Tu peux révoquer une clé à tout moment depuis les Réglages ; elle renvoie alors `401`.

Limite : **60 requêtes par minute et par clé** (au-delà : `429`, avec un header `Retry-After`).

Dans les exemples, on suppose :

```bash
export POLARIS_URL="https://polaris-mmg.vercel.app/api/v1"
export POLARIS_KEY="pol_xxxxxxxxxxxxxxxx"
```

## Modèle d'une tâche

| Champ | Type | Valeurs |
|---|---|---|
| `id` | string | généré par le serveur |
| `name` | string | obligatoire, 300 caractères max |
| `gtd` | string | `inbox` (défaut), `projet`, `memo`, `check`, `someday`, `waiting` |
| `sphere` | string | clé d'une sphère de vie (60 caractères max) |
| `matrice` | string | Eisenhower : `ui` (urgent·important), `uni` (urgent·secondaire), `nui` (important·pas urgent), `nuni` |
| `statut` | string | `a_planifier`, `planifie`, `en_cours`, `termine` |
| `dateDebut`, `dateFin`, `dateAssignee` | string | `YYYY-MM-DD` |
| `notes` | string | 5000 caractères max |
| `waitingFor` | string | pour `gtd: "waiting"` : qui on attend |
| `recurrence` | objet | `{ unit: day|week|month|year, interval: 1-99, dayOfWeek?: 0-6 (0 = dimanche), dayOfMonth?: 1-31, monthOfYear?: 1-12, durationCount?, durationUnit? }`. Sur memo, check, waiting ou projet, avec `dateAssignee` (ou `dateFin` pour un projet) = 1re occurrence. `null` la retire (PATCH) |
| `objectifId` | string | projet seulement : id d'un objectif **mensuel en cours** (statut « En cours », non archivé, période non dépassée) ; refusé sinon |
| `done` | boolean | |
| `source` | string | `"claude"` pour les tâches créées via l'API |

Conseils : un projet daté utilise `dateDebut` + `dateFin` ; un mémo ou une tâche du jour utilise `dateAssignee`.

---

## GET /todos

Liste les tâches. Les ajouts et modifications faits via l'API sont inclus même si l'app n'a pas encore été ouverte.

Paramètre optionnel : `done=false` (à faire) ou `done=true` (terminées).

```bash
curl -s "$POLARIS_URL/todos?done=false" \
  -H "Authorization: Bearer $POLARIS_KEY"
```

Réponse `200` :

```json
{ "todos": [ { "id": "mvf8jrgv8563a1cb", "name": "Appeler Paul", "gtd": "memo", "dateAssignee": "2026-10-20", "done": false, "source": "claude" } ], "count": 1 }
```

## POST /todos

Crée une tâche, ou jusqu'à 50 d'un coup avec `{ "todos": [ … ] }`.

Champs acceptés : `name` (obligatoire), `gtd`, `sphere`, `matrice`, `dateDebut`, `dateFin`, `dateAssignee`, `notes`, `waitingFor`, `objectifId` (projets), `recurrence`. Tout autre champ est refusé.

```bash
curl -s -X POST "$POLARIS_URL/todos" \
  -H "Authorization: Bearer $POLARIS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Appeler Paul pour le devis","gtd":"memo","dateAssignee":"2026-10-20","matrice":"ui"}'
```

Réponse `201` : `{ "todo": { "id": "…", … } }`

Plusieurs tâches :

```bash
curl -s -X POST "$POLARIS_URL/todos" \
  -H "Authorization: Bearer $POLARIS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"todos":[{"name":"Relire le contrat"},{"name":"Préparer la réunion","dateAssignee":"2026-10-21"}]}'
```

Réponse `201` : `{ "todos": [ … ], "count": 2 }`

## PATCH /todos/:id

Mise à jour partielle. Champs : `name`, `gtd`, `sphere`, `matrice`, `statut`, `dateDebut`, `dateFin`, `dateAssignee`, `notes`, `waitingFor`, `objectifId`, `recurrence`, `done`. Mettre un champ (sauf `name` et `gtd`) à `null` l'efface.

`"done": true` marque la tâche comme faite ; si elle est récurrente, Polaris crée automatiquement l'occurrence suivante.

```bash
curl -s -X PATCH "$POLARIS_URL/todos/mvf8jrgv8563a1cb" \
  -H "Authorization: Bearer $POLARIS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"done":true}'
```

Réponse `200` : `{ "todo": { … } }` (aperçu de la tâche après modification).

## GET /reviews

Lecture seule : weekly reviews, reviews mensuelles, objectifs de la semaine et objectifs mensuels.

```bash
curl -s "$POLARIS_URL/reviews" \
  -H "Authorization: Bearer $POLARIS_KEY"
```

Réponse `200` :

```json
{ "weekly_reviews": [ … ], "monthly_reviews": [ … ], "weekly_objectives": [ … ], "monthly_goals": [ … ] }
```

## Objectifs (OKR) : /goals

Niveaux : `lt`, `annuel`, `trimestriel`, `mensuel`. Un objectif a des résultats clés (`krs`) et peut avoir un parent du niveau supérieur. Comme les tâches, l'écriture passe par la file `api_ops` (migration 025) : l'app applique les ops à l'ouverture, au retour sur l'onglet et toutes les 60 s.

### GET /goals

`?archived=true` pour inclure les objectifs archivés. Réponse `200` : `{ "goals": { "lt": [ … ], "annuel": [ … ], "trimestriel": [ … ], "mensuel": [ … ] } }` (ops en attente incluses).

### POST /goals

Un objectif par requête.

| Champ | Règle |
|---|---|
| `level` | obligatoire : `lt` \| `annuel` \| `trimestriel` \| `mensuel` |
| `titre` | obligatoire, 200 caractères max |
| `statut` | `Ça arrive` \| `En cours` (défaut) \| `C'est chaud` \| `Atteint` \| `Échoué` \| `Abandonné` |
| `spaces` | tableau de 4 textes max (ex. `["Business"]`) |
| `periode` | niveaux annuel/trimestriel/mensuel : `{ "type": "year", "year": 2027 }`, `{ "type": "quarter", "year": 2026, "quarter": 3 }` (0 = T1), `{ "type": "month", "year": 2026, "month": 9 }` (0 = janvier). Défaut : période courante. Interdit au niveau `lt`. `dateCloture` est calculée |
| `parentId` | id d'un objectif existant du niveau supérieur |
| `krs` | 8 max : `{ "nom", "depart", "cible", "actuelle"? }` (nombres) |

6 objectifs actifs maximum par niveau (comme dans l'app). Réponse `201` : `{ "level", "goal" }`.

### PATCH /goals/:id

Champs : `titre`, `statut`, `spaces`, `periode`, `parentId` (`null` pour retirer), `krs` (**remplace la liste** : renvoyer les résultats clés existants avec leur `id`), `archived`. Pas de DELETE : `archived: true` pour retirer un objectif. Réponse `200` : `{ "level", "goal" }`.

---

## Erreurs

Toutes les erreurs sont en JSON : `{ "error": "code", "message": "explication", "details": [ … ] }`.

| Code HTTP | `error` | Cas |
|---|---|---|
| 400 | `bad_request` / `validation_error` | JSON invalide, champ inconnu, valeur hors liste, date mal formée, texte trop long (`details` liste les problèmes) |
| 401 | `unauthorized` | clé absente, invalide ou révoquée |
| 404 | `not_found` | aucune tâche avec cet id |
| 405 | `method_not_allowed` | méthode non prise en charge (il n'y a pas de DELETE) |
| 429 | `rate_limited` | plus de 60 requêtes dans la minute |
| 500 / 503 | `server_error` / `not_configured` | problème côté serveur |

## Délai d'apparition dans l'app

Une tâche créée via l'API apparaît dans Polaris au prochain chargement, au retour sur l'onglet, ou dans la minute si l'app est déjà ouverte. `GET /todos` la renvoie immédiatement.
