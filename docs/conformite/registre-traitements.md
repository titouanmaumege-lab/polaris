# POLARIS — Registre des activités de traitement (art. 30 RGPD)

Responsable de traitement : Titouan Maumège, entrepreneur individuel (EI, « Titouanmmg »), SIRET 940 448 087 00012, 26 Rue des Grives, 23300 Saint-Agnant-de-Versillat, France — contact : titouanmmg.training@gmail.com.
Document établi le 5 juillet 2026. À tenir à jour à chaque évolution de l'app. À conserver et présenter à la CNIL sur demande.

> Les durées de conservation marquées « proposée » deviennent effectives une fois implémentées en Phase 3 ; jusque-là, la conservation est illimitée (non conforme — à corriger).

---

## T1 — Gestion des comptes utilisateurs

| Champ | Contenu |
|---|---|
| Finalité | Création, authentification et gestion du compte |
| Base légale | Exécution du contrat (art. 6(1)(b)) |
| Données | Email, mot de passe (haché bcrypt par Supabase Auth), horodatages de création/connexion, IP des événements d'auth (logs Supabase) |
| Personnes concernées | Utilisateurs inscrits |
| Destinataires | Éditeur uniquement |
| Sous-traitants | Supabase Inc. (BDD + auth, région UE `eu-west-1`), Vercel Inc. (diffusion du front) |
| Durée de conservation | Durée de vie du compte + 30 jours après suppression (proposée) ; logs d'auth : 12 mois max (proposée) |
| Transferts hors UE | Cf. § transferts de l'audit — DPA + SCC/DPF Supabase et Vercel |
| Mesures de sécurité | HTTPS, hachage bcrypt, RLS vérifié ✅ (05/07/2026), rate limiting Supabase Auth |

## T2 — Suivi personnel : habitudes, objectifs, tâches, revues

| Champ | Contenu |
|---|---|
| Finalité | Fourniture du service : suivi d'habitudes, todos, objectifs/OKR, revues hebdomadaires, highlight, sessions de travail |
| Base légale | Exécution du contrat (art. 6(1)(b)) |
| Données | `habits`, `todos`, `goals`, `workperf`, `highlight`, `weekly_reviews`, `view_mode` (JSONB table `user_data`) + copie localStorage sur l'appareil |
| Personnes concernées | Utilisateurs inscrits |
| Destinataires | L'utilisateur uniquement |
| Sous-traitants | Supabase Inc. |
| Durée | Durée de vie du compte + 30 jours (proposée) |
| Mesures | HTTPS, chiffrement au repos AES-256 (Supabase), RLS vérifié ✅ (05/07/2026) |

## T3 — Journal quotidien de bien-être (« Daily Paper ») — DONNÉES DE SANTÉ

| Champ | Contenu |
|---|---|
| Finalité | Auto-suivi du bien-être : énergie, focus, stress, bonheur, bilan du jour |
| Base légale | **Consentement explicite art. 9(2)(a)** (+ art. 6(1)(a)) — à recueillir séparément (Phase 3) ; retrait possible à tout moment |
| Données | Échelles énergie/focus/stress/bonheur, type de journée, victoire/défaite, points d'amélioration, remarques en texte libre (`user_data.daily`) ; habitudes à caractère santé (sommeil, sport…) ; objectifs sphère « Sport & Santé » |
| Qualification | **Données de santé (art. 9)** — état de santé mentale et physique révélé |
| Personnes concernées | Utilisateurs inscrits ayant consenti |
| Destinataires | L'utilisateur uniquement ; aucun partage, aucun profilage, aucune décision automatisée |
| Sous-traitants | Supabase Inc. |
| Durée | Durée du compte + 30 jours ; suppression anticipée sur retrait du consentement (proposée) |
| Mesures | HTTPS, chiffrement au repos, RLS vérifié ✅ (05/07/2026), minimisation (aucune donnée envoyée à des tiers) |

## T4 — Gestion financière personnelle

| Champ | Contenu |
|---|---|
| Finalité | Suivi budgétaire personnel : comptes, transactions, budgets, dettes, investissements, abonnements |
| Base légale | Exécution du contrat (art. 6(1)(b)) |
| Données | Tables `finance_accounts`, `finance_categories`, `finance_transactions`, `finance_budgets`, `finance_subscriptions`, `finance_goals`, `finance_recurring`, `finance_investments`, `finance_investment_moves`, `finance_debts` |
| Personnes concernées | Utilisateurs inscrits |
| Destinataires | L'utilisateur uniquement |
| Sous-traitants | Supabase Inc. |
| Durée | Durée du compte + 30 jours (proposée) |
| Mesures | HTTPS, chiffrement au repos, RLS activé et versionné (migrations 003-007) ✅ |

## T5 — Base de connaissances et partage

| Champ | Contenu |
|---|---|
| Finalité | Prise de notes, organisation de connaissances, partage de bases entre utilisateurs |
| Base légale | Exécution du contrat (art. 6(1)(b)) ; pour l'annuaire d'invitation (lookup email) : intérêt légitime (fonctionnement du partage) — à encadrer (finding S2) |
| Données | Pages, tags, liens, embeds (`knowledge_*`) ; emails et rôles des membres (`profiles`, `knowledge_base_members`) |
| Personnes concernées | Utilisateurs inscrits ; membres invités |
| Destinataires | Co-membres de la base partagée |
| Sous-traitants | Supabase Inc. ; Google/YouTube et Miro si embeds affichés |
| Durée | Durée du compte + 30 jours (proposée) |
| Mesures | RLS `knowledge_*` versionné ✅ ; RLS `members` vérifié ✅ ; `profiles` lisible publiquement ❌ (S2, correction Phase 4) |

## T6 — Logs techniques et sécurité

| Champ | Contenu |
|---|---|
| Finalité | Fonctionnement, sécurité, diagnostic |
| Base légale | Intérêt légitime (art. 6(1)(f)) |
| Données | IP, user-agent, horodatages (logs edge Vercel ; logs Supabase) |
| Durée | 12 mois maximum (proposée — vérifier rétention par défaut Vercel/Supabase) |
| Sous-traitants | Vercel Inc., Supabase Inc. |

---

## Synthèse sous-traitants

| Sous-traitant | Service | Localisation données | Garantie transfert |
|---|---|---|---|
| Supabase Inc. | BDD, auth, emails d'auth | **UE — AWS `eu-west-1` (Irlande)**, vérifié 05/07/2026 | DPA Supabase, SCC ; DPF à vérifier |
| Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA | Hébergement front, CDN, logs | USA / edge mondial | DPF (à vérifier) + SCC (DPA Vercel) |
| Amazon Web Services | Infra sous-jacente Supabase | Région du projet | Sous-traitant ultérieur, DPA AWS |
| Google LLC (Fonts) | Police | USA | AUCUNE — à supprimer (self-host, Phase 4) |

## Droits des personnes (état actuel → cible)

| Droit | Actuel | Cible (Phase 3) |
|---|---|---|
| Accès / portabilité | ❌ Rien | Export JSON complet en un clic |
| Rectification | ✅ Édition dans l'app | — |
| Effacement | ❌ Aucune suppression de compte | Suppression réelle in-app + confirmation, délai communiqué |
| Retrait consentement art. 9 | ❌ | Toggle dédié + proposition de suppression des données concernées |
| Réclamation | — | Mention CNIL (cnil.fr) dans la politique |

Aucune décision automatisée ni profilage à effet juridique. Aucune prospection. Aucun cookie publicitaire ou de mesure d'audience.
