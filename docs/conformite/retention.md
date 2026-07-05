# POLARIS — Procédures de rétention et d'effacement (Phase 3)

Complément du registre des traitements. Dernière mise à jour : 5 juillet 2026.

## Mécanismes automatiques

| Donnée | Règle | Mécanisme |
|---|---|---|
| Compte supprimé par l'utilisateur | Effacement **immédiat et complet** (toutes tables + auth) | RPC `delete_account()` (migration 008), déclenchée in-app après re-saisie du mot de passe |
| Comptes jamais confirmés (email non validé) | Purge après 30 jours | `purge_unconfirmed_accounts()` planifiée quotidiennement via pg_cron (job `purge-unconfirmed-accounts`, 03h15 UTC) — migration 008 |
| Consentements | Suivent le compte (cascade) ; l'historique donné/retiré reste horodaté tant que le compte existe | Table `user_consents` |
| Données bien-être après retrait du consentement | Traitement stoppé immédiatement (jauges désactivées) ; suppression des évaluations proposée à l'utilisateur au moment du retrait | UI « Le Poste » → Confidentialité & compte |

## Rétention déléguée aux sous-traitants (à surveiller, pas de code)

| Donnée | Rétention | Où vérifier |
|---|---|---|
| Sauvegardes base de données | Selon plan Supabase (Free : pas de backup automatique ; Pro : 7 jours). Engagement public : écrasement sous 30 jours max | Dashboard Supabase → Database → Backups |
| Logs Supabase (API, auth — contiennent des IP) | Free : 1 jour ; Pro : 7 jours — sous le plafond de 12 mois annoncé | Dashboard Supabase → Logs |
| Logs Vercel (edge, contiennent des IP) | Runtime logs : ~1h à 1 jour selon plan — sous le plafond | Dashboard Vercel → Logs |

## Procédure manuelle de secours (si pg_cron indisponible)

Une fois par mois, dans le SQL Editor Supabase :

```sql
SELECT purge_unconfirmed_accounts();
```

Vérifier que le job pg_cron tourne :

```sql
SELECT jobname, schedule, active FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

## Rappel des durées annoncées dans la politique de confidentialité

- Données de compte et contenus : durée du compte + 30 jours.
- Journaux techniques : 12 mois maximum.
- Sauvegardes : écrasées au plus tard 30 jours après suppression.

Toute évolution de ces durées doit être répercutée dans `/confidentialite` ET dans le registre.
