# POLARIS — Audit de conformité et de sécurité (Phase 1)

Date : 5 juillet 2026
Périmètre : dépôt `polaris` (branche master), déploiement Vercel, projet Supabase `icryobuoqrsybktbrrgs`.
Statut : audit en lecture seule — aucune modification du code.

---

## 1. Cartographie de la stack

| Composant | Détail |
|---|---|
| Framework | React 18 + Vite 6 — **SPA 100 % statique**, aucun backend applicatif propre (pas d'API routes) |
| Hébergement front | Vercel Inc. (USA) — fichiers statiques + CDN edge |
| Auth | **Supabase Auth** (email + mot de passe, confirmation email, reset par lien) — solution éprouvée, pas d'auth maison |
| Base de données | **Supabase Postgres**, projet `icryobuoqrsybktbrrgs.supabase.co`. Région : **`eu-west-1` (AWS Irlande) — UE** ✅ (vérifié au dashboard le 05/07/2026) |
| Accès données | Le client parle **directement** à Supabase (PostgREST) avec la clé `anon`. Il n'y a pas de couche serveur : **la sécurité repose entièrement sur le Row Level Security** |
| Stockage local | `localStorage` : copie intégrale des données « vie quotidienne » (habits, journal, objectifs…) + jeton de session Supabase (`sb-…-auth-token`) |
| Analytics | **Aucun** (pas de Vercel Analytics, GA, Sentry, etc.) |
| Scripts tiers | **Aucun** dans `index.html` |
| Ressources externes | **Google Fonts CDN** (`fonts.googleapis.com`, police Space Grotesk) importé dans `src/index.css:1` ; iframes **YouTube** et **Miro** possibles dans le module Base de connaissances |
| Email transactionnel | Emails d'auth envoyés par Supabase (SMTP par défaut de Supabase — **à vérifier** : serveur custom configuré ou non) |
| Config Vercel | **Aucun `vercel.json` / `vercel.ts`** → aucun header de sécurité configuré |

### Modèle de données
- **Table `user_data`** : une ligne par utilisateur (`id` = user id), colonnes JSONB : `habits`, `todos`, `goals`, `daily`, `workperf`, `highlight`, `weekly_reviews`, `view_mode`, `updated_at`. Synchronisation débouncée depuis localStorage (`src/utils/storage.js`).
- **Migrations versionnées** (`supabase/migrations/`) : module connaissance (`knowledge_*`) et module finances (`finance_*`), toutes avec RLS owner-only.
- ⚠️ **Trois tables utilisées par le code n'ont AUCUNE migration dans le dépôt** : `user_data`, `profiles`, `knowledge_base_members`. Elles ont été créées à la main dans le dashboard. Leur configuration RLS est invérifiable depuis le code → point critique § 4.

---

## 2. Registre des données personnelles collectées

Voir le document séparé `registre-traitements.md` (à archiver — obligation d'accountability, art. 30 RGPD).

Résumé des catégories :

| Catégorie | Données | Où | Art. 9 ? |
|---|---|---|---|
| Identification / compte | Email, mot de passe (haché par Supabase Auth), horodatages de connexion, IP dans les logs d'auth Supabase | Supabase Auth | Non |
| Journal quotidien (« Daily Paper ») | **Énergie, focus, stress, bonheur** (échelles), type de journée, victoire/défaite du jour, points à améliorer, remarques et réflexions en **texte libre** | `user_data.daily` + localStorage | **OUI** |
| Habitudes | Habitudes suivies et leur statut quotidien (peut inclure sport, sommeil, méditation…) | `user_data.habits` | **Potentiellement** (selon les habitudes créées) |
| Objectifs / OKR | Objectifs de vie, dont sphère « Sport & Santé » | `user_data.goals` | Partiellement (objectifs santé/forme) |
| Performance de travail | Sessions de travail chronométrées, type (DEEP/SHALLOW…), efficience | `user_data.workperf` | Non (mais révélateur du rythme de vie) |
| Revues hebdomadaires | Bilans en texte libre | `user_data.weekly_reviews` | Texte libre → peut en contenir |
| Finances | Comptes, soldes, transactions, budgets, dettes, investissements, abonnements | Tables `finance_*` | Non (mais donnée à forte attente de confidentialité) |
| Base de connaissances | Pages, notes, liens, embeds (contenu libre) ; partage entre utilisateurs | Tables `knowledge_*` | Texte libre → peut en contenir |
| Partage | Email des autres utilisateurs (table `profiles`), rôles de membres | `profiles`, `knowledge_base_members` | Non |
| Logs techniques | IP, user-agent (logs Vercel + Supabase) | Vercel / Supabase | Non |

## 3. Classification article 9 RGPD

Position retenue (alignée doctrine CNIL apps bien-être, qualification large) : **les données du journal quotidien sont des données de santé** au sens de l'art. 9 — les échelles d'énergie, stress et bonheur révèlent l'état de santé mentale et la fatigue. S'y ajoutent les habitudes à caractère santé/sport et tout texte libre décrivant l'état physique ou mental.

Conséquences :
- Base légale requise : **consentement explicite art. 9(2)(a)**, distinct de l'acceptation des CGU (→ Phase 3).
- Sécurité renforcée attendue (RLS strict, chiffrement au repos, minimisation des logs).
- Pour le portage App Store : déclaration « Health & Fitness » + guideline 5.1.1 déjà anticipée.

---

## 4. Audit sécurité

> **Avertissement — lisez cette section en entier avant la Phase 2.** Le point S1 peut exposer l'intégralité des données de tous les utilisateurs. Il se vérifie en 5 minutes dans le dashboard Supabase et doit être traité avant toute autre chose si le RLS est absent.

### S1 — ~~CRITIQUE~~ → LEVÉ (vérifié au dashboard le 05/07/2026)
RLS vérifié via `pg_class`/`pg_policies` : **activé sur les 18 tables du schéma `public`**, y compris les trois tables sans migration. Policies constatées :
- `user_data` : `own data only` — ALL, `auth.uid() = id` ✅ (le USING s'applique aussi en WITH CHECK pour une policy ALL)
- `knowledge_base_members` : `members: owner gère` (ALL, `is_base_owner(base_id)`) + `members: self lecture` (SELECT, `user_id = auth.uid()`) ✅
- `profiles` : voir S2 ❌

Reste à faire (Phase 4) : **versionner** ces policies dans une migration du dépôt (aujourd'hui elles n'existent que dans la base — pas de trace auditable dans le code).

### S2 — ~~ÉLEVÉ~~ → CORRIGÉ (migration 009, appliquée en prod le 05/07/2026)
Policy constatée : `profiles: lecture publique` — SELECT, rôles `{public}`, `qual = true`. Concrètement : **toute la table des emails est lisible sans restriction, y compris par un client non authentifié muni de la seule clé `anon`** (le rôle `anon` est couvert par `{public}`). C'est plus large que l'énumération décrite initialement : un script peut télécharger l'annuaire complet des emails des utilisateurs.
**Remédiation (Phase 4)** : restreindre le SELECT aux utilisateurs authentifiés ET pertinents (soi-même + co-membres de bases partagées), et faire passer l'invitation par email via une fonction RPC `security definer` qui ne renvoie qu'un id opaque.

### S3 — ~~ÉLEVÉ~~ → CORRIGÉ (Phase 4) : fuite de données entre comptes sur un même navigateur
`AuthGate.jsx` : à la déconnexion, le localStorage n'est **pas purgé**. Sur machine partagée : (a) les données du compte A (journal intime, finances) restent lisibles hors session ; (b) si un utilisateur B se connecte ensuite avec un compte vierge, `handleSession` déclenche la « migration » et **téléverse les données locales de A dans le compte de B** (`syncToSupabase` lit le localStorage résiduel).
**Remédiation** : purger toutes les clés `lp_*`/`leplan_*`/`LE_PLAN_*` au signOut et avant hydratation d'un autre utilisateur.

### S4 — ~~MOYEN~~ → CORRIGÉ (Phase 4) : headers de sécurité via vercel.json
Pas de `vercel.json`/`vercel.ts` → pas de CSP, ni HSTS, ni `X-Frame-Options`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `Permissions-Policy`. → Phase 4 (CSP à construire sur : self + `*.supabase.co` + fonts si encore externes + frames YouTube/Miro).

### S5 — ~~MOYEN~~ → CORRIGÉ (Phase 4) : police auto-hébergée (@fontsource)
`src/index.css:1` : chaque visiteur transmet son IP à Google LLC (USA) avant tout consentement. Jurisprudence défavorable (CNIL / LG München). **Remédiation simple : self-héberger Space Grotesk** (fichiers woff2 dans `/public`). Supprime en même temps un transfert hors UE.

### S6 — ~~MOYEN~~ → CORRIGÉ : minimum 8 caractères (dashboard, 05/07/2026) + minLength=8 côté client
Réglages Auth constatés le 05/07/2026 : minimum **6 caractères**, aucune exigence de composition (« Password requirements » non défini), « Prevent leaked passwords » indisponible (plan Free), « Secure password change » OFF, « Require current password when updating » OFF. Points positifs : « Confirm email » ON, « Secure email change » ON, signups ouverts (voulu).
**Remédiation** : passer le minimum à 8+ (CNIL/ANSSI : 12 avec règles, ou plus long sans), activer « Require current password when updating » (cohérent avec le flux de suppression de compte Phase 3), refléter `minLength` côté client. Hachage bcrypt géré par Supabase Auth : conforme.

### S7 — FAIBLE : rate limiting
Auth : rate limiting natif Supabase (le client gère déjà le cooldown renvoyé). Écritures PostgREST : pas de rate limiting applicatif — acceptable en l'état (RLS limite l'impact à ses propres données), à noter au registre des mesures.

### S8 — FAIBLE : validation d'input
Pas de serveur applicatif → la validation serveur = contraintes SQL + RLS. Les tables finances ont des contraintes (migration 005) ; `user_data` accepte des blobs JSONB arbitraires (pas de limite de taille). Risque faible (chaque utilisateur ne pollue que sa ligne). Option Phase 4 : contrainte de taille sur les colonnes JSONB.

### S9 — INFO : messages d'erreur
Les messages d'erreur Supabase sont affichés bruts dans l'UI d'auth (`error.message`, en anglais). Pas de stack trace ni SQL exposés. Cosmétique : messages génériques FR en Phase 4. Point positif : `signInWithPassword` ne révèle pas si l'email existe (« Invalid login credentials »), mais **le signup révèle les comptes existants** (comportement Supabase standard) — mitigeable via confirmation email silencieuse (déjà le cas si « Confirm email" activé).

### S10 — INFO : secrets
- `.env` correctement gitignoré, non commité. ✅
- Clé `anon` dans le bundle : **normal et par design** (clé publique). Elle n'est un risque QUE si le RLS est défaillant (→ S1).
- Aucune trace de `service_role` dans le code ou le bundle. ✅

### Chiffrement
- Transit : HTTPS partout (Vercel + Supabase). ✅
- Repos : Supabase chiffre les volumes (AES-256) par défaut. ✅
- Option (Phase 4, à discuter) : chiffrement applicatif du journal (`daily`) — coût : casse toute exploitation côté requêtes, et la clé devrait vivre côté client. Non recommandé tant que le modèle reste mono-utilisateur par ligne ; à réévaluer pour le portage mobile.

---

## 5. Cookies et traceurs

| Élément | Type | Consentement ? |
|---|---|---|
| `sb-<ref>-auth-token` (localStorage, pas un cookie) | Session/auth | **Exempté** (strictement nécessaire) |
| Clés `lp_*`, `leplan_todos`, `LE_PLAN_ACTIVE_SESSION` (localStorage) | Fonctionnel, stockage des données de l'utilisateur | **Exempté** |
| Cookies propres | — | **Aucun cookie posé par l'app** |
| Analytics / pub | — | Néant |
| **Iframes YouTube** (module connaissance) | Traceurs tiers Google dès chargement de l'iframe | **NON exempté** |
| **Iframes Miro** | Cookies Miro | **NON exempté** |
| Google Fonts CDN | Pas un cookie, mais transfert IP → Google | Voir S5 (à self-héberger) |

**Conclusion** : pas de bandeau cookies nécessaire, À CONDITION de traiter les embeds : passer YouTube en `youtube-nocookie.com` **et** charger les iframes YouTube/Miro en « façade click-to-load » (placeholder cliquable avec mention). Sinon, bandeau obligatoire. Recommandation : façade (meilleure UX, pas de bandeau). Une section « cookies et stockage local » dans la politique de confidentialité suffit alors.

---

## 6. Transferts hors UE

| Sous-traitant | Rôle | Localisation | Mécanisme |
|---|---|---|---|
| Vercel Inc. | Hébergement front, CDN, logs edge (IP, user-agent) | USA (edge mondial) | **Certifié EU-U.S. Data Privacy Framework** (à re-vérifier sur dataprivacyframework.gov au moment de la rédaction) + SCC en secours (DPA Vercel) |
| Supabase Inc. | Base de données, auth, emails d'auth | Société US ; **données hébergées dans la région choisie à la création du projet (AWS)** → à vérifier au dashboard. Si région UE (ex. `eu-west-3` Paris, `eu-central-1` Francfort) : données au repos dans l'UE ; l'accès support US reste couvert par le DPA Supabase (SCC/DPF) | DPA Supabase + SCC ; sous-traitant ultérieur AWS |
| Google LLC (Fonts) | Police de caractères | USA | **Aucun** → à éliminer (S5) |
| Google/YouTube, Miro (embeds) | Contenus intégrés | USA | À neutraliser par façade (§ 5) |

Notes :
- Si la région Supabase est hors UE (ex. `us-east-1`), les données de santé seraient stockées aux USA → fortement déconseillé ; migration de projet vers une région UE à planifier avant toute ouverture commerciale.
- Les emails d'auth partent du SMTP Supabase par défaut → sous-traitant email à documenter dans la politique (ou configurer un SMTP UE).

---

## 7. Points à vérifier manuellement (dashboard, hors code)

1. ~~RLS des 3 tables~~ ✅ vérifié 05/07/2026 — RLS actif partout ; reste S2 (`profiles`) à corriger en Phase 4.
2. ~~Région Supabase~~ ✅ `eu-west-1` (Irlande, UE).
3. Statut DPF de Vercel et Supabase (dataprivacyframework.gov).
4. ~~Auth Supabase~~ ✅ vérifié : Confirm email ON, min mot de passe 6 (à monter à 8+, Phase 4).
5. SMTP custom configuré ou défaut Supabase.
6. Sauvegardes Supabase : rétention des backups (les données supprimées y survivent — à mentionner dans la politique : « délai de suppression des sauvegardes : X jours »).
7. Le dossier `graphify-out/` et `*.jsonl` à la racine sont bien gitignorés (contiennent potentiellement du contenu personnel) — vérifié pour git, mais ne pas les déployer.

## 8. Prochaines phases (pour mémoire)

- **Phase 2** : `/mentions-legales`, `/confidentialite`, `/cgu` + footer ; pas de bandeau cookies si façade embeds réalisée.
- **Phase 3** : double consentement à l'inscription (CGU + art. 9, horodatés en base), export JSON, retrait de consentement, suppression de compte réelle (Apple 5.1.1(v)), purge automatique.
- **Phase 4** : migration RLS des 3 tables orphelines, purge localStorage au signOut, headers de sécurité (`vercel.json`), self-host de la police, façade embeds, mots de passe 8+, messages d'erreur FR.
