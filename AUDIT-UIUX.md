# Audit UI/UX — Tora (navigateur Electron + React 19 + Tailwind 4 + motion)

> **Statut (octobre 2026) :** corrections appliquées (focus clavier, contrastes, états de chargement/erreur, annulation des suppressions, tokens de couleur, police locale…). Ce document décrit l'état *avant* correction.

> Audit en lecture seule : aucun fichier source modifié. Périmètre : `src/` (4 366 lignes, 26 composants), `index.css`, `index.html`, et les pages HTML générées par `electron/main.ts`.
> **Contexte clé** : Tora est une **application desktop Electron** (pas du mobile). Les critères « tactile 44 px », « safe-area », « haptique », « WebP/AVIF » sont donc majoritairement **N/A** ; je les évalue quand même sous l'angle pertinent (cibles souris/clavier, WCAG 2.5.8 = 24 px, fenêtre redimensionnable).

---

## PARTIE 1 — Système de design

| Élément | Constat | Verdict |
|---|---|---|
| Tokens centralisés | Aucun `@theme` Tailwind, aucune variable CSS. `index.css` ne contient que reset + scrollbars + a11y. Seul `lib/motion.ts` est centralisé (ressorts, durées, easings, presets). | **DISPERSÉ** |
| Couleurs | ~40 hex en dur. Gris dominants : `#A1A1A1` (105×), `#E5E5E5` (77×), `#888` (54×), `#2A2A2A` (37×), `#222` (33×), `#161616`, `#1A1A1A`, `#1E1E1E`, `#121212`, `#101014`, `#121216`, `#141414`, `#0A0A0A`, `#0E0E0E`, `#050505`, `#000`… Au moins **12 fonds sombres quasi identiques** (écart de 1-3 niveaux), 3 teintes « bleutées » (`#101014`, `#121216`, `#18181B`) mêlées aux neutres. Accents : indigo (Tailwind) + `#FBBF24/#F87171/#34D399/#60A5FA/#C084FC`. | **DISPERSÉ** |
| Échelle typographique | Tailles arbitraires en px : 10, 11, 12, 13, 14, 15, 16, 18, 28, 56 (≈ 180 occurrences `text-[Npx]`). 13/12/11 couvrent 80 %. Pas d'échelle modulaire nommée. Police `Outfit` appliquée par `style={{fontFamily}}` inline, répété sur chaque `<h1>` (≥ 8×) au lieu d'un token `font-display`. | **DISPERSÉ** |
| Espacement | Majoritairement l'échelle Tailwind (multiples de 4), mais mélange `space-x-*` / `gap-*` et valeurs `px-10 py-16`, `pt-[8vh]`, `w-[68px]`, `w-[380px]`… acceptable. | **COHÉRENT** (globalement) |
| Rayons | `rounded-lg/xl/2xl/full/md` utilisés sans règle (boutons : `lg` ou `xl` ou `full` selon le fichier). | **DISPERSÉ** |
| Ombres | `shadow-lg`, `shadow-2xl`, `shadow-[0_10px_30px…]`, `shadow-[0_8px_30px…]`, `shadow-indigo-600/20`… ad hoc. | **DISPERSÉ** |
| Mode sombre | L'UI est **sombre uniquement** (pas de thème clair, pas de `prefers-color-scheme`). Ce n'est pas un « filtre global » mais il n'existe **aucun jeu de tokens** clair/sombre : passer en clair imposerait de réécrire ~600 classes. Le réglage `darkModeForced` ne concerne que les sites visités. | **ABSENT (thème clair)** — acceptable pour un navigateur « dark-first », mais non préparé |
| Bouton primaire | Plusieurs variantes non intentionnelles : `bg-indigo-500 hover:bg-indigo-400` (Passwords), `bg-indigo-500 hover:bg-indigo-600` (App, ajout raccourci), `bg-indigo-600 hover:bg-indigo-500` (App 404, bannières), `h-10` / `h-9` / `py-1.5` / `py-2`, tailles de texte 11/12/13. Aucun composant `<Button>` partagé (seul `Switch.tsx` est factorisé). | **DISPERSÉ** |
| Cartes (Historique / Favoris / Téléchargements) | Même structure `bg-[#101014] border-white/5` dupliquée 3×, vs `bg-[#121212] border-[#1E1E1E]` dans Mots de passe. | **DISPERSÉ** |
| Titres de page | `h1 text-[28px] font-semibold text-white mb-1` + sous-titre, identique partout. | **COHÉRENT** (par copier-coller) |

---

## PARTIE 2 — Responsive et adaptation

| Critère | Constat | Verdict |
|---|---|---|
| Unités relatives / flex-grid | Flex/grid partout, grilles `repeat(auto-fill,minmax(180px,1fr))`, `max-w-*`. Quelques largeurs fixes (`w-[380px]` modale mot de passe, `w-48` formulaire raccourci, `w-[68px]`). | **COHÉRENT** |
| Breakpoints | Seulement 5 usages de `sm:`. Aucun `md/lg`. Pour une app desktop, la contrainte réelle est la **largeur de fenêtre**. | **Acceptable** |
| Taille minimale de fenêtre | **Aucun `minWidth/minHeight`** dans `electron/main.ts`. La barre d'outils (`min-w-[140px]` pour l'omnibox + 5 boutons + menu) et la barre d'onglets (min 130 px/onglet) débordent si la fenêtre est très étroite. | **À CORRIGER** |
| Hauteurs d'en-tête codées en dur | `top-[104px]` / `top-[56px]` dans `App.tsx:312` dupliquent `TOTAL_HEADER_HEIGHT` d'`electron/main.ts` (nécessaire pour le BrowserView, mais fragile : un changement de `h-14` désynchronise tout). | **Fragile** |
| Zones tactiles | Desktop → 44 px non applicable. Mais WCAG 2.5.8 (24 px) : boutons icône `p-1` + icône 12 px = **20 px** (fermeture d'onglet, ✕ des toasts/bannières, voir/copier mot de passe `p-1`+11 px = 19 px, suppression historique `p-1.5`+13 px = 25 px). | **À CORRIGER** (mineur) |
| Safe-area | N/A (desktop). | N/A |
| Images | Seulement favicons (`<img>` 14-16 px) et QR code (data-URL). Pas de médias lourds. | **N/A / OK** |

---

## PARTIE 3 — Accessibilité (WCAG 2.1 AA)

| Critère | Constat | Verdict |
|---|---|---|
| **1.4.3 Contraste texte** | Bon travail ponctuel : `index.css` remappe `text-[#666/#555/#444/#777/#888]` vers des gris plus clairs (hack global). Reste **non couvert** : • `hover:text-[#666]`, `text-[#555]` via autres préfixes ; • `placeholder-[#777]` sur `#121212` (Historique, Favoris) ≈ **4,2:1** ; • `text-white` sur `bg-indigo-400` (hover du bouton Passwords) ≈ 3:1 ; • `text-white` sur `bg-red-500` (confirmer suppression, 11-12 px) ≈ 3,8:1 ; • URL de la page d'erreur réseau `#555` sur `#050505` (≈ 2,8:1, `main.ts:~303`) ; • texte `#888` de la page d'erreur à 13 px OK (5,7:1). | **À CORRIGER** |
| **1.4.11 Contraste non-textuel** | Bordures de champs `#222` / `#2A2A2A` sur `#050505`-`#121212` ≈ **1,3-1,6:1** (seuil 3:1) : les champs de recherche, l'omnibox (`border-white/10`) et les formulaires ne se distinguent presque pas du fond. | **À CORRIGER** |
| Taille de texte | 42 occurrences à 10-11 px (étiquettes, compteurs, URLs). Lisibilité limite, notamment en `font-mono 11px #777`. | **À CORRIGER** (conseillé ≥ 12 px) |
| Labels des contrôles icônes | Très bon : 120+ `aria-label`, `title` redondants. Rien d'« icône muette » repéré. | **CONFORME** |
| Texte alternatif | Favicons `alt=""` (décoratifs, correct). QR : alt contextualisé. | **CONFORME** |
| **Focus visible (2.4.7)** | `index.css` impose `input:focus{outline:none!important; box-shadow:none!important}` : les champs n'ont **que** `focus:border-indigo-500/50` (≈ 1,3:1 → invisible). L'omnibox : `focus-within:border-white/30`. Les `<button>` natifs gardent l'anneau navigateur mais 17 `outline-none` + `focus:outline-none` sur le bouton bloqueur. Seuls `Switch` et 3-4 boutons de la page d'accueil ont `focus-visible:ring`. **Aucun style `focus-visible` global.** | **À CORRIGER** (bloquant conformité) |
| Navigation clavier — éléments cachés | Boutons « supprimer / copier / afficher » en `opacity-0 group-hover:opacity-100` sans `group-focus-within` : **tabulables mais invisibles** (Historique, Favoris, Mots de passe, raccourcis). | **À CORRIGER** |
| Navigation clavier — cartes cliquables | Cartes Historique/Favoris = `motion.div onClick` sans `role`, `tabIndex`, `onKeyDown` : **inaccessibles au clavier** (impossible d'ouvrir un favori/une page de l'historique sans souris). | **À CORRIGER** (bloquant) |
| Navigation clavier — overlays | Fonds cliquables `div onClick` (menu contextuel d'onglet, `SiteSettingsMenu`, modales) : OK pour la souris. | Acceptable |
| Modales / piège de focus | `role="dialog" aria-modal` + `aria-labelledby` + Échap sur 5 modales (bien). **Aucun piège de focus ni restauration du focus** à la fermeture, pas d'`inert` sur l'arrière-plan. Modale « coffre » (Passwords) : pas d'Échap, pas de `role="dialog"`. | **À CORRIGER** |
| Rôles ARIA | Corrects : `role="switch"`+`aria-checked`, `listbox/option` (palette), `tablist/tab/aria-selected`, `alert/alertdialog`. Bémols : onglets `role="tab"` sans `aria-controls`/flèches ←→ ; `tab` contient des `<button>` imbriqués (fermer, muet) — interactif imbriqué ; les `Switch` ont `aria-label` mais le libellé visible voisin n'est pas relié (`aria-labelledby`). | **À CORRIGER** (mineur) |
| `prefers-reduced-motion` | Triple protection : `MotionConfig reducedMotion="user"`, règle CSS globale, helper `getAccessibleMotion`. | **CONFORME** |
| Formulaires / labels | Presque tous les champs utilisent `aria-label` sans `<label>` visible ; le **placeholder sert de libellé visuel** (recherche, nom/URL raccourci, domaine, mot de passe maître). Les 3 `<label>` existants sont corrects (cases à cocher). | **À CORRIGER** (mineur : accessible aux lecteurs d'écran, pas aux voyants) |
| Titres | Un `h1` par page, `h2` en dessous : OK. Page « Page introuvable » : `h2` sans `h1`. Modales : `h2`. | **Conforme (1 écart)** |
| Langue | `<html lang="en">` alors que l'UI est en français. | **À CORRIGER** (1.-ligne) |

---

## PARTIE 4 — Hiérarchie et lisibilité

| Critère | Constat | Verdict |
|---|---|---|
| Action principale | Accueil : omnibox centrale dominante (bon). Pages de gestion : actions secondaires de poids égal (Exporter/Importer, Effacer tout). Mots de passe : « Exporter/Importer » au même niveau visuel que le contenu, sans action primaire claire. | **Correct** |
| Hiérarchie sémantique | h1 → h2 respectés. Mais les sections `h2` en 13 px majuscules `#A1A1A1` sont peu distinctes du corps (13 px aussi). | **Correct** |
| Densité | Barre d'outils : jusqu'à 8 icônes dans l'omnibox (bouclier, réglages site, effacer, favori, téléchargement vidéo, lecture…) à taille 12-14 px, bien groupées mais denses. Fiches 11-13 px. Respiration correcte ailleurs (`py-16`, `gap-3`). | **Correct** |
| Page d'accueil | « Personnaliser Tora » en `fixed bottom-6 right-6` peut chevaucher le contenu/les toasts (qui sont aussi `bottom-6 right-6`, `z-[100]`). | **Gênant** |

---

## PARTIE 5 — États d'interface

| Écran / composant | Chargement | Vide | Erreur | Succès | Hors-ligne |
|---|---|---|---|---|---|
| Historique | PRÉSENT (texte seul, pas de skeleton) | PRÉSENT (texte, **sans action**) | **ABSENT** (pas de `.catch` : spinner infini si l'IPC échoue) | ABSENT (suppression silencieuse, **pas d'annulation**) | N/A |
| Favoris | PRÉSENT (texte) | PRÉSENT (icône + consigne — le meilleur) | ABSENT | ABSENT | N/A |
| Téléchargements | **ABSENT** (aucun état loading) | PRÉSENT | PARTIEL (icône rouge, pas de message ni « Réessayer ») | PRÉSENT (icône) | N/A |
| Mots de passe | **ABSENT** (liste vide visible avant résolution → « Aucun mot de passe » clignote) | PRÉSENT | PARTIEL (messages `ok:false` dans la modale) | PRÉSENT (message coffre) ; copie sans retour visuel | N/A |
| Paramètres / Import Chrome | PRÉSENT (Loader2 dans le bouton) | N/A | PRÉSENT (message rouge) — non annoncé (`role` absent) | PRÉSENT | N/A |
| Extensions | ABSENT | PRÉSENT | PRÉSENT (`Erreur : …`) | PRÉSENT | N/A |
| Focus (sites bloqués) | ABSENT | PRÉSENT | ABSENT | ABSENT | N/A |
| Onglet / chargement de page | PRÉSENT (pastille pulsée, bouton stop) | — | PRÉSENT (page d'erreur réseau, écran « a cessé de fonctionner », `ErrorBoundary`) | — | **PRÉSENT** (`-106` « Pas de connexion Internet ») mais **pas de bouton « Réessayer »** sur la page d'erreur |
| Erreurs techniques brutes | `ErrorBoundary` affiche `error.message` brut ; `Erreur inconnue` fallback. `buildErrorPage` injecte `url` **sans échappement HTML** (risque d'injection + affichage de l'URL en `#555`). | | **À CORRIGER** | | |
| Toasts | `aria-live="polite"` sur le conteneur : bien. Mais `role="alert"` absent pour les erreurs, durée fixe 3,2 s sans pause au survol/focus (WCAG 2.2.1). | | | | |

**Skeletons : 0** dans tout le projet (le chargement est un texte « Chargement… » ou un spinner). La liste d'historique/favoris est en grille de cartes : bon candidat pour des skeletons.

---

## PARTIE 6 — Micro-interactions et retour utilisateur

| Critère | Constat | Verdict |
|---|---|---|
| Boutons désactivés / chargement | Bon : `disabled` + spinner sur import Chrome, vidéo, coffre ; navigation désactivée si pas d'historique. Mais `handleDownloadVideo` réactive après `setTimeout 2000` quel que soit le résultat ; les boutons « Ajouter » (raccourci, site bloqué) n'ont pas d'état busy. | **Partiel** |
| Actions destructrices | Approche « double-clic de confirmation » (4 s) pour Historique (Effacer tout), Favoris, Mots de passe : correct mais **pas d'annulation (undo)** — standard moderne = suppression + toast « Annuler ». Suppression d'une entrée d'historique, d'un raccourci, d'un site bloqué : **immédiate, sans undo**. Le bouton « Confirmer ? » n'annonce pas le changement (pas de `aria-live`). | **À AMÉLIORER** |
| Cohérence des transitions | Deux systèmes cohabitent : `lib/motion.ts` (ressorts, `DURATION`, `EASE`) **et** Tailwind `transition-colors` (139×) / `duration-200` (10×) / `animate-in` (classe `tw-animate-css` non installée → **sans effet**, `App.tsx:493`). Les hover `scale 1.05 / 1.12+rotate 2°` sur boutons et `y:-3` sur cartes sont intenses. | **Partiel** |
| Haptique / sonore | N/A (desktop). | N/A |

---

## PARTIE 7 — Performance perçue

| Critère | Constat | Verdict |
|---|---|---|
| FCP / ressources bloquantes | `index.html` charge **Google Fonts (Outfit)** en CSS bloquant depuis le réseau : (1) retarde le premier rendu, (2) **échoue hors-ligne** (repli sur `sans-serif` → saut visuel), (3) contredit le positionnement « vie privée » du navigateur (requête vers Google à chaque lancement). Pas de `font-display`/préchargement local. | **À CORRIGER** |
| CLS | Favicons : `<img>` avec taille fixe (OK). Écrans de liste : état « Chargement… » → grille = saut de hauteur. Pas de réservation d'espace. | **Gênant (mineur)** |
| Lazy loading | **Aucun** `React.lazy`/`Suspense` : les 7 pages internes sont toutes dans le bundle initial (`dist/assets/index-*.js` unique). Pas de `loading="lazy"` sur les favicons (peu de volume). | **À CORRIGER** (faible gain) |
| `backdrop-blur` | `backdrop-blur-xl/2xl/md` sur toolbar, toasts, modales + `blur(18px)` sur un snapshot plein écran : coûteux sur GPU modestes. | **À surveiller** |

---

## PARTIE 8 — Cohérence des parcours

| Parcours | Constat | Verdict |
|---|---|---|
| Ajouter un raccourci (accueil) | 2 champs + Ajouter/Annuler. Pas de validation en direct (URL non validée, `https://` ajouté silencieusement), pas d'Échap, aucune erreur visible ; si champs vides, ferme silencieusement. | **À CORRIGER** |
| Enregistrer / exporter / importer un coffre | Export : `minLength=8` HTML5 seul, pas de message visible en direct, **pas de confirmation du mot de passe** (risque de perte du coffre en cas de faute de frappe) ; titre du bouton « Choisir où enregistrer » ambigu. Fermeture : croix + clic extérieur (pas d'Échap). | **À CORRIGER** |
| Navigation / recherche (omnibox) | Court (1 étape). Pas de suggestions/historique dans l'omnibox, mais focus/sélection auto : bien. | **COHÉRENT** |
| Chemin de sortie | Croix + Échap + clic extérieur sur 4 modales sur 5 ; croix présente sur toutes les bannières. | **COHÉRENT** (1 écart : modale coffre) |
| Messages d'erreur de champ | Aucun message associé à un champ (`aria-describedby`/`aria-invalid` absents) ; messages globaux sous le formulaire. Pas « invalide » vide, mais pas liés au champ. | **À CORRIGER** (mineur) |

---

# PLAN DE CORRECTION PRIORISÉ

Légende — **Impact** : 🔴 bloquant · 🟠 gênant · 🟡 cosmétique. **WCAG** = manquement de conformité.

## Groupe A — Source commune : focus & clavier (WCAG 2.1.1, 2.4.7)
| # | Problème | Impact | WCAG | Correction minimale |
|---|---|---|---|---|
| A1 | Aucun focus visible sur les champs (`index.css` `!important`) et boutons | 🔴 | 2.4.7 | `index.css` : supprimer le bloc `input:focus {outline:none!important…}` ; ajouter `:focus-visible { outline: 2px solid #818CF8; outline-offset: 2px; }` global. Un seul changement couvre tous les composants. |
| A2 | Cartes Historique/Favoris non focusables/activables | 🔴 | 2.1.1 | `HistoryPage.tsx`/`BookmarksPage.tsx` : rendre la zone titre un `<button>`/`<a>` (ou ajouter `role="button" tabIndex={0} onKeyDown Enter/Espace`). |
| A3 | Boutons « supprimer/copier » `opacity-0` invisibles au focus | 🟠 | 2.4.7 | Ajouter `group-focus-within:opacity-100` / `focus-visible:opacity-100` (Historique, Favoris, Passwords ×2). |
| A4 | Modales sans piège de focus ni retour du focus ; modale coffre sans `role="dialog"`/Échap | 🟠 | 2.4.3 | Petit hook `useModalA11y(ref, onClose)` (focus au 1er champ, Tab cyclique, Échap, restauration) appliqué aux 5 modales + coffre. |

## Groupe B — Source commune : tokens de couleur (contraste, cohérence)
| # | Problème | Impact | WCAG | Correction minimale |
|---|---|---|---|---|
| B1 | Pas de tokens | 🟠 | — | `index.css` : bloc `@theme { --color-surface-0:#050505; --color-surface-1:#121212; --color-surface-2:#1A1A1A; --color-border:#2A2A2A; --color-text:#E5E5E5; --color-muted:#A1A1A1; … }` ; **ne pas** tout migrer d'un coup : adopter les tokens pour tout nouveau/modifié et fusionner les 12 fonds proches en 4-5 niveaux fichier par fichier. |
| B2 | Bordures de champs 1,3:1 | 🟠 | 1.4.11 | Passer `border-[#222]/#2A2A2A` des `<input>` à ≥ `#5A5A5A` (token `--color-border-strong`). |
| B3 | Placeholders `#777` sur `#121212` ; blanc sur `indigo-400`/`red-500` | 🟠 | 1.4.3 | `placeholder-[#777]`→`#949494` (Historique, Favoris) ; hover Passwords `indigo-400`→`indigo-600` ; `bg-red-500`→`bg-red-600` ; URL page d'erreur `#555`→`#949494` (`main.ts`). |
| B4 | Hack CSS `.text-\[\#666\]…` | 🟡 | — | Retirer progressivement en remplaçant ces classes par `text-muted` (B1) ; supprimera les cas non couverts. |
| B5 | Textes 10-11 px | 🟡 | (lisibilité) | Remonter à 12 px minimum (étiquettes de section, URLs, compteurs). |

## Groupe C — États d'interface (fichiers par écran)
| # | Problème | Impact | Correction minimale |
|---|---|---|---|
| C1 | Pas de `.catch` sur `getHistory/getBookmarks/getCredentials/getDownloads` → chargement infini | 🟠 | Ajouter `.catch` + état `error` avec message et bouton « Réessayer » (composant partagé `InlineError`). |
| C2 | Pas de skeleton ; listes qui « sautent » (CLS) | 🟡 | Composant `CardGridSkeleton` (6 cartes `animate-pulse`, mêmes dimensions) réutilisé dans Historique/Favoris/Téléchargements/Passwords. |
| C3 | Page d'erreur réseau sans « Réessayer », `url` non échappée | 🟠 | `main.ts` `buildErrorPage` : échapper `url`/`info.*` ; ajouter `<button onclick="location.reload()">Réessayer</button>`. |
| C4 | `ErrorBoundary` affiche `error.message` brut | 🟡 | Message générique + détail replié (`<details>`). |
| C5 | États vides sans action (Historique, Passwords) | 🟡 | Ajouter une phrase d'action comme dans Favoris. |

## Groupe D — Retours & actions destructrices
| # | Problème | Impact | Correction minimale |
|---|---|---|---|
| D1 | Suppression sans undo (historique, raccourcis, sites bloqués, favoris) | 🟠 | Remplacer par « suppression + toast `Annuler` (5 s) » via `useToast` (étendre `showToast` avec `action`). |
| D2 | Toasts : disparition fixe 3,2 s, erreurs non annoncées | 🟠 (WCAG 2.2.1) | Pause au survol/focus ; `role="alert"` pour `type==='error'`. |
| D3 | Messages d'import/coffre non annoncés | 🟡 (WCAG 4.1.3) | Ajouter `role="status"`/`role="alert"` aux `<p>` de résultat. |
| D4 | `animate-in` sans effet (`App.tsx:493`) | 🟡 | Remplacer par le preset `scaleIn` de `lib/motion.ts` (même système partout). |

## Groupe E — Formulaires & parcours
| # | Problème | Impact | Correction minimale |
|---|---|---|---|
| E1 | Mot de passe maître sans confirmation, validation seulement HTML5 | 🟠 | `PasswordsPage.tsx` : 2ᵉ champ « Confirmer » en mode export + message inline `aria-describedby`. |
| E2 | Formulaire raccourci sans validation/Échap | 🟡 | Valider l'URL (`new URL`), message sous le champ, Échap = Annuler. |
| E3 | `<html lang="en">` | 🟡 (WCAG 3.1.1) | `index.html` : `lang="fr"`. |
| E4 | `placeholder` seul comme libellé visuel | 🟡 | Ajouter un `<label>` visible (ou `sr-only` + libellé visuel) pour les champs de formulaire (pas pour les barres de recherche). |
| E5 | Tabs : boutons imbriqués, pas de flèches | 🟡 | `TabStrip`/`VerticalTabStrip` : navigation ←/→ (roving tabindex) ; garder les boutons mais sortir le bouton fermer du `role="tab"`. |

## Groupe F — Performance & robustesse
| # | Problème | Impact | Correction minimale |
|---|---|---|---|
| F1 | Google Fonts bloquant, hors-ligne et contraire à la vie privée | 🟠 | Installer `@fontsource/outfit` (ou fichiers WOFF2 locaux) + `font-display: swap` ; supprimer les 3 `<link>` de `index.html` ; définir `--font-display` dans `@theme` (supprime les 8 `style={{fontFamily}}` répétés). |
| F2 | Pas de taille minimale de fenêtre | 🟠 | `main.ts` : `minWidth: 640, minHeight: 480` sur la `BrowserWindow`. |
| F3 | Pages internes toutes dans le bundle | 🟡 | `React.lazy` + `Suspense` (fallback skeleton) pour les 7 pages `tora://`. |
| F4 | Hauteurs d'en-tête dupliquées (`104/56`) | 🟡 | Exporter une constante partagée (ou la lire via IPC) pour `App.tsx:312`. |
| F5 | Cibles < 24 px | 🟡 | `p-1`→`p-1.5` (min 24 px) sur ✕ onglet/toast/bannière et boutons voir/copier. |

## Ordre d'exécution recommandé
1. **A1** (focus global) → **A2, A3** (clavier) → **A4** (modales) — accessibilité critique, source unique A1.
2. **B2, B3** (contrastes) — petits correctifs ciblés, conformité.
3. **F1, E3** (police locale, `lang`) — 10 minutes, gain vie privée + FCP.
4. **C1, C3** (erreurs de chargement, page d'erreur) — robustesse.
5. **D1, D2, D3** (undo, toasts) — micro-interactions, **après** que les tokens/états soient stables.
6. **B1, B4, B5** (migration progressive des tokens) — cohérence, en tâche de fond.
7. Reste : C2, C4, C5, D4, E1, E2, E4, E5, F2, F3, F4, F5.

**Manquements WCAG à traiter en priorité conformité** : 2.1.1 (A2), 2.4.7 (A1, A3), 2.4.3 (A4), 1.4.3 (B3), 1.4.11 (B2), 4.1.3 (D3), 2.2.1 (D2), 3.1.1 (E3).

Aucune refonte visuelle globale n'est nécessaire : tout se corrige par un bloc `index.css`, un hook de modale et quelques composants partagés (`Button`, `InlineError`, `CardGridSkeleton`).
