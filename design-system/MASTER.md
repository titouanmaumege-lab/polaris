# LE PLAN — Design System (MASTER)

> Source of truth visuelle pour **tous** les écrans. Refonte strictement visuelle —
> aucune fonctionnalité, route, hook ou logique métier ne change.
> Nom de code : **Lumen Protocol** (clair, structuré, motivant par l'action).
>
> Statut : v1 — appliqué d'abord au **Dashboard**. Les autres écrans suivront,
> chacun pouvant déposer un override dans `design-system/pages/<page>.md`.

---

## 1. Principes

1. **Aéré, pas cloisonné.** Séparer par l'espace, la typographie et la hiérarchie —
   pas par des bordures lourdes. Cartes blanches qui *flottent* via ombres douces.
2. **Accent parcimonieux.** Violet/magenta/cyan réservés aux éléments clés
   (progress rings, badges, CTA, valeurs fortes). Jamais en fond plein.
3. **Gros chiffres assertifs.** Les indicateurs clés (habitudes, Deep Work, %)
   sont la respiration visuelle : grands, gras, chiffres tabulaires.
4. **Un seul CTA primaire par zone.** Le reste est secondaire/visuellement discret.
5. **Mobile-first**, agréable des deux côtés. Layout mobile et desktop peuvent
   diverger mais partagent couleurs + typo + esprit.

---

## 2. Couleurs (thème clair)

Accents utilisés **avec parcimonie**. Fond jamais en accent plein.

| Rôle | Hex | Token CSS | Usage |
|------|-----|-----------|-------|
| Fond base | `#F6F6FB` | `--bg-base` | Fond app (off-white cool, pas blanc pur) |
| Surface | `#FFFFFF` | `--bg-surface` | Cartes flottantes |
| Surface subtile | `#EFEFF7` | `--bg-subtle` | Chips, fills doux, états hover |
| Texte primaire | `#15132E` | `--text-primary` | Titres, gros chiffres |
| Texte secondaire | `#5A5775` | `--text-secondary` | Labels, descriptions |
| Texte discret | `#9C9AB4` | `--text-muted` | Méta, placeholders, eyebrows |
| Bordure hairline | `#EAEAF3` | `--border-subtle` | Inputs / séparateurs fins UNIQUEMENT |
| Accent (violet) | `#7C5CFC` | `--accent` | Primaire : rings, liens, CTA |
| Accent magenta | `#D946EF` | `--accent-2` | Fin de gradient, badges emphase |
| Accent cyan | `#22C7E0` | `--accent-3` | Deep Work, indicateur secondaire |
| Dégradé primaire | `linear-gradient(135deg,#7C5CFC,#D946EF)` | `--accent-gradient` | CTA, ring highlight |
| Succès | `#10B981` | `--success` | Habitudes validées |
| Attention | `#F59E0B` | `--warning` | Objectifs mensuels, streaks |
| Danger | `#EF4444` | `--danger` | Invalidé, destructif |
| Orange | `#F97316` | `--orange` | Objectifs hebdo (conservé) |

**Couleurs de domaines/objectifs** (Sport/Business/etc.) : conservées telles quelles,
juste re-saturées pour rester lisibles sur fond clair (≥ 4.5:1 sur blanc).

### Contraste (vérifié)
- `--text-primary` #15132E sur `#FFFFFF` ≈ **16:1** (AAA)
- `--text-secondary` #5A5775 sur `#FFFFFF` ≈ **6.4:1** (AA)
- `--accent` #7C5CFC sur `#FFFFFF` ≈ **4.6:1** → OK texte normal ; sinon réserver
  aux gros éléments / le foncer (`#6A48E8`) pour petit texte.

---

## 3. Ombres & élévation (remplacent les bordures)

| Token | Valeur | Usage |
|-------|--------|-------|
| `--shadow-sm` | `0 1px 2px rgba(20,19,46,.04), 0 1px 3px rgba(20,19,46,.05)` | Chips, petits éléments |
| `--shadow-card` | `0 2px 8px rgba(20,19,46,.05), 0 8px 24px rgba(20,19,46,.05)` | Cartes flottantes |
| `--shadow-card-hover` | `0 4px 12px rgba(20,19,46,.07), 0 12px 32px rgba(20,19,46,.08)` | Hover carte |
| `--shadow-accent` | `0 8px 24px rgba(124,92,252,.22)` | CTA primaire, ring highlight |

Règle : une **échelle d'ombre cohérente**, pas de valeurs aléatoires. Pas de bordure
sur les cartes — l'ombre + le fond blanc sur `--bg-base` suffit à les détacher.

---

## 4. Typographie

- **Display / titres / gros chiffres : Geist** (Google Fonts, variable 100–900)
- **Body / UI : Inter** (Google Fonts, 300–700)
- Chiffres d'indicateurs : `font-variant-numeric: tabular-nums` (évite le jitter)

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
```

| Token | Taille / line-height / weight | Police | Usage |
|-------|------------------------------|--------|-------|
| `--font-display` | — | Geist | titres, chiffres |
| `--font-body` | — | Inter | texte, UI |
| Eyebrow | 11px / 1.2 / 600, letter-spacing .12em, uppercase | Inter | labels de section |
| Body S | 13px / 1.5 / 400 | Inter | méta |
| Body | 15px / 1.55 / 400 | Inter | texte courant |
| Title | 18px / 1.3 / 600 | Geist | titres de carte |
| Heading | 22px / 1.25 / 700 | Geist | titres d'écran |
| Metric | 40px / 1.0 / 700, tabular | Geist | gros indicateurs |
| Metric XL | 56px / 1.0 / 800, tabular | Geist | hero chiffre (timer, %) |

Hiérarchie par **poids + taille + espace**, pas par couleur.

---

## 5. Spacing, rayons, layout

- **Échelle d'espacement (4/8) :** 4, 8, 12, 16, 24, 32, 48, 64
- **Rythme vertical sections :** 16 (interne) · 24 (entre blocs) · 40 (entre zones majeures)
- **Rayons :** `--radius-card: 20px` · `--radius-btn: 12px` · `--radius-pill: 999px`
- **Container desktop :** `max-width: 1100px`, centré, gutters 24px (≥1024px)
- **Breakpoints :** 375 / 768 / 1024 / 1440
- **Mobile :** single column, gutters 16px
- **Desktop :** grille 12 col possible ; le Dashboard peut passer en 2–3 colonnes
  (highlight pleine largeur + stats côte à côte). Même langage visuel.

---

## 6. Composants (règles)

- **Carte :** `background: var(--bg-surface)`, `border-radius: var(--radius-card)`,
  `box-shadow: var(--shadow-card)`, **pas de bordure**, padding 16–20.
- **CTA primaire :** fond `--accent-gradient`, texte blanc, `--shadow-accent`,
  radius pill ou 12px, hauteur ≥ 44px. **Un seul par zone.**
- **Bouton secondaire :** fond `--bg-subtle`, texte `--accent`, pas d'ombre forte.
- **Chip / pill :** `--bg-subtle`, texte `--text-secondary`, actif = teinte accent 12%.
- **Progress ring :** track `#EAEAF3`, valeur en `--accent` (ou cyan pour Deep Work),
  chiffre central en Metric/Geist tabular.
- **Input :** fond blanc, `1px solid --border-subtle`, focus ring `--accent` 2px.
- **Zone tactile mobile : ≥ 44×44px**, espacement ≥ 8px entre cibles.

---

## 7. Motion

- Micro-interactions **150–300ms**, `cubic-bezier(.4,0,.2,1)`.
- Entrée `ease-out`, sortie plus courte (~60–70%).
- `transform`/`opacity` uniquement (pas width/height/top/left).
- **Respecter `prefers-reduced-motion`** : réduire/désactiver.
- Press : `scale(0.97)` (déjà en place), conservé.

---

## 8. Icônes

- **Pas d'emoji comme icône structurelle.** Migrer vers SVG inline (style Lucide :
  stroke 1.75px, currentColor) au fil des écrans.
- Transition douce : les emojis actuels (🎯 ⏱️ ✦) peuvent rester tant qu'un set SVG
  n'est pas introduit — mais ne pas en ajouter de nouveaux. Pas de dépendance npm
  sans validation (SVG inline préféré).
- Taille cohérente via tokens : 16 / 20 / 24.

---

## 9. Anti-patterns (à éviter)

- ❌ Blanc pur `#FFFFFF` en **fond d'app** (utiliser `--bg-base` off-white ; le blanc
  est réservé aux surfaces/cartes).
- ❌ Accent en **fond plein** de grande surface.
- ❌ Bordures épaisses pour cloisonner — préférer ombre + espace.
- ❌ Couleur seule pour porter une info (ajouter icône/texte/forme).
- ❌ Hex bruts dans le JSX — passer par les tokens.
- ❌ Gros chiffres en chiffres proportionnels (jitter) — `tabular-nums`.

---

## 10. Mapping migration (dark → light)

Le code actuel duplique les tokens : CSS `:root` **et** objet JS `C` dans `App.jsx`
(+ `GRAD`, `GLOW`, `GLOW_SM`, `TR`). Stratégie : **réutiliser/étendre**, pas dupliquer.

| Ancien (dark) | Nouveau (light) |
|---------------|-----------------|
| `--bg-base #0d0d1a` | `#F6F6FB` |
| `--bg-surface #12112a` | `#FFFFFF` |
| `--bg-card #1a1830` | `#FFFFFF` (+ `--shadow-card`) |
| `--border-subtle` (violet 15%) | `#EAEAF3`, et surtout **retirer** des cartes |
| `--accent #8b5cf6` | `#7C5CFC` |
| `--text-primary #f1f0ff` | `#15132E` |
| `--text-secondary #9391b5` | `#5A5775` |
| `C.*` (objet JS) | re-pointé sur les mêmes valeurs light (single source) |
| `GLOW` (glow violet) | `--shadow-accent` (ombre portée, pas glow néon) |

Objectif : un seul jeu de valeurs, l'objet `C` lit la même palette que `:root`.
