# Audit UI/UX #2 — Tora (état d'octobre 2026, après les corrections de `AUDIT-UIUX.md`)

**Méthode.** (1) Lecture du code de `src/` et des points d'entrée d'`electron/main.ts`. (2) Interface réelle lancée dans Chromium (Vite + API `window.tora` simulée), 11 écrans à 1280×800, plus 640×480, 480×400, onglets verticaux, 18 onglets, bannières. (3) axe-core (WCAG 2.0 à 2.2 AA + bonnes pratiques) et script de mesure maison : contraste calculé avec fusion des transparences, tailles de texte, cibles, ordre de tabulation.
**Limite.** Electron n'a pas été lancé : ce qui dépend de la `BrowserView` native est marqué *(déduit du code)*.

> **Statut :** tous les points ci-dessous ont été traités dans la même PR, sauf :
> - **#3 (scrollbars masquées)** : choix assumé, conservé tel quel.
> - **#20 (échelle de l'interface)** : non faite. Un zoom CSS de l'interface décalerait la `BrowserView`, car les hauteurs d'en-tête sont codées dans `electron/main.ts`. Le support `forced-colors` est ajouté.
> - **#18 (design system)** : fonds et bordures migrés vers les tokens (il ne reste que 3 teintes spécifiques). Le composant `Button` existe et sert à 7 endroits ; les autres boutons restent à migrer progressivement.
> - **#9** : le mot de passe de session OS avant l'affichage d'un mot de passe n'est pas demandé (nécessite le processus principal).
> - **#7** : la saisie d'une URL dans la palette n'est pas ajoutée.
> - **#6 (toasts)**, **#2** et l'e2e (`includeHidden` pour les boutons « Fermer l'onglet », désormais cachés aux lecteurs d'écran) sont à valider dans Electron, qui n'a pas pu être lancé ici.

## Bilan : ce qui est réellement corrigé

Vérifié en rendu : **0 échec de contraste** sur les 10 écrans internes (le seul cas détecté est un bouton `disabled`, donc exempté), focus visible partout, libellés sur les icônes, états chargement/erreur/vide, annulation des suppressions, page d'erreur réseau avec « Réessayer », `lang="fr"`, polices locales, taille minimale de fenêtre (640×480), `prefers-reduced-motion`. Aucun débordement horizontal à 640 px. Les lacunes qui restent sont d'une autre nature : **structure ARIA, comportements aux limites, sécurité perçue, cohérence**.

---

## 🔴 Bloquants

| # | Constat | Preuve | Correction |
|---|---|---|---|
| 1 | **La bannière « Enregistrer le mot de passe » tronque le domaine.** Le message `username sur domaine ?` est en `truncate`. Avec un identifiant long, le domaine disparaît, alors que c'est l'information qui protège du hameçonnage. | `CredentialSaveBanner.tsx:31`. Rendu à 900 px : « Enregistrer le mot de passe de pren… » | Mettre le domaine en premier et en gras, sur sa propre ligne non tronquée. Tronquer seulement l'identifiant (`min-w-0`). Même défaut, moins grave, sur `RedirectBanner`. |
| 2 | **Barre d'onglets : avec beaucoup d'onglets, l'onglet actif et le bouton « + » sortent de l'écran.** Aucun `scrollIntoView`, scrollbar masquée, aucune flèche. | Mesuré avec 18 onglets sur 1100 px : « + » à x = 2755, onglet actif à x = 2599. | `scrollIntoView({inline:'nearest'})` sur l'onglet actif. Sortir « + » du conteneur défilant (collé à droite). Réduire la largeur des onglets sous un seuil (comme les autres navigateurs) avant de faire défiler. |
| 3 | **Les scrollbars sont supprimées partout** (`index.css`) et plusieurs écrans coupent leur contenu sans aucun indice. | Menu principal à 800 px de haut : « Favoris… » coupé à la limite des 75 vh. À 640×480 : les raccourcis de l'accueil sont sous le pli, avec un bouton flottant par-dessus. | Remettre des scrollbars fines dans les panneaux de contenu (garder `no-scrollbar` pour la barre d'onglets). Au minimum : dégradé en bas des zones défilantes, et menu en une colonne sous 700 px de haut. |
| 4 | **Demande de permission : « Se souvenir » est coché par défaut.** Un clic sur « Autoriser » accorde donc la caméra, la position ou les notifications **définitivement**. « Refuser » est aussi mémorisé. Pour un navigateur « vie privée », la valeur par défaut est trop permissive. | `PermissionPromptBanner.tsx:27`. `checked = true` constaté dans le DOM. | Décocher par défaut. Ou proposer « Autoriser cette fois / Toujours » en boutons explicites. |
| 5 | **Les onglets ne sont pas valides côté accessibilité.** axe remonte, sur **chaque** écran, `aria-required-children` (critique) et `nested-interactive` (grave) : des `<button>` (fermer, muet) sont dans un `role="tab"`. Le bouton « fermer » d'un onglet inactif est focusable mais en `opacity-0` (opacité mesurée = 0 au focus). Résultat : le focus clavier est invisible, et chaque onglet ajoute 2 arrêts de tabulation (34 arrêts pour 18 onglets). | `TabStrip.tsx:138`, `VerticalTabStrip.tsx:148`. Le point E5 de l'audit précédent n'a été traité qu'à moitié (flèches ←/→ ajoutées). | Sortir les boutons du `role="tab"` : un conteneur frère `role="presentation"` portant l'onglet et ses boutons. Ajouter `focus-visible:opacity-100`. Mettre `tabIndex={-1}` sur les boutons de fermeture et garder la touche Suppr (déjà gérée). |
| 6 | **Les toasts sont probablement invisibles sur une page web réelle** *(déduit du code)*. Ils sont affichés en `fixed bottom-20 right-6` dans la couche React, or la `BrowserView` native recouvre cette zone. Le mécanisme `setOverlayActive` sert précisément à la retirer pour les menus et bannières, mais `Toast.tsx` ne l'appelle jamais. Sont concernés : « Ajouté aux favoris » (avec « Annuler »), « Recherche du flux vidéo… », « Mise à jour prête », « Impossible d'enregistrer vos données », « Copié ». | `Toast.tsx:50-52`. Aucune référence à `toast` dans `electron/`. | Déplacer les toasts dans la zone de chrome (sous la barre d'outils, au-dessus de la vue), ou activer l'overlay pendant leur affichage, ou les afficher dans une vue native dédiée. **À vérifier en priorité dans Electron.** |

## 🟠 Gênants

| # | Constat | Preuve / lieu | Correction |
|---|---|---|---|
| 7 | **Palette de commandes (Ctrl+K) : modèle ARIA incomplet et défilement cassé.** Le champ n'est pas un `combobox`, il n'y a pas d'`aria-activedescendant`, et les options sont des `<button>` tabulables. ↓ déplace la sélection hors de la zone visible : pas de `scrollIntoView`, `max-h-80` pour plus de 6 commandes. Deux commandes ont la même icône (« Historique » et « Effacer les données »). On ne peut pas saisir une URL. Catégories en 10 px. | `CommandPaletteModal.tsx:176-276` | Pattern combobox + listbox (`aria-activedescendant`, options `tabIndex=-1`) et `scrollIntoView({block:'nearest'})`. Icônes distinctes. |
| 8 | **Recherche dans la page : Entrée n'avance pas.** `handleSubmit` rappelle `findInPage(query)` sans `findNext`, ce qui relance au premier résultat. L'infobulle promet « Entrée » et « Maj+Entrée », mais Maj+Entrée n'est pas géré. À la fermeture, le focus n'est pas restauré et la requête est perdue. | `FindBar.tsx:50`, `main.ts:2094` | Entrée → `findInPageNext(q,true)`, Maj+Entrée → `false`. Restaurer le focus. Conserver la dernière requête. |
| 9 | **Mots de passe : suppression définitive sans annulation**, alors que historique, favoris, raccourcis et sites bloqués ont un « Annuler ». La confirmation tient en une icône de 12 px qui devient rouge, sans texte. Un mot de passe révélé reste affiché sans limite de durée. | `PasswordsPage.tsx:96-115, 366-376` | Confirmation en texte (« Supprimer ? ») ou fenêtre dédiée. Masquage automatique après 15 s et à la perte de focus. Idéalement, redemander le mot de passe de session OS avant de révéler. |
| 10 | **Actions cachées au survol.** Modifier, supprimer, copier et afficher n'apparaissent qu'au survol ou au focus. Un utilisateur à la souris ne les découvre pas, et rien n'existe pour le tactile ou un stylet. Deux boutons font la même chose (le texte `••••` et l'icône œil). | `PasswordsPage.tsx:360-440` | Rendre « Copier » et « Afficher » visibles en permanence (icônes atténuées). Regrouper modifier/supprimer dans un menu « ⋯ ». |
| 11 | **Noms accessibles non uniques.** Chaque carte répète « Supprimer cette entrée de l'historique », « Supprimer cet identifiant », « Afficher le mot de passe », « Copier le mot de passe ». Pour un lecteur d'écran ou la commande vocale (WCAG 2.4.6, 2.5.3), autant de boutons que de cartes portent le même nom. | History, Bookmarks, Passwords | Inclure la cible : « Supprimer github.com — moi@mail.fr ». |
| 12 | **Cibles trop petites (WCAG 2.5.8, 24 px) sur les pages Mots de passe.** « Copier l'identifiant » et « Afficher le mot de passe » mesurent 197×18 et 72×18 px. | Mesuré | `py-1` (24 px de haut minimum). |
| 13 | **Accueil : navigation redondante et iconographie trompeuse.** Le bouton « bouclier » ouvre les **Paramètres**. « Protections » apparaît 3 fois (lien du haut, pastille dans la barre de recherche, et le bouclier). « Personnaliser Tora » ouvre aussi les Paramètres. Les raccourcis par défaut (GitHub, Notion, YouTube) sont codés en dur et **non supprimables**, ce qui est discutable dans un navigateur « vie privée ». | `App.tsx:509-522, 550-575, 627-635` | Un seul chemin vers chaque destination : icône engrenage pour les Paramètres, un seul lien « Protections ». Permettre de masquer les raccourcis par défaut. |
| 14 | **Texte non sélectionnable dans toute l'interface** : `select-none` est posé sur la racine. Impossible de copier le chemin du dossier de données ou des journaux (page À propos), l'URL d'un téléchargement, les détails d'erreur d'un certificat, ou un domaine. | `App.tsx:337` | `select-text` sur les zones de contenu des pages internes. Garder `select-none` uniquement sur la barre de titre et les onglets. |
| 15 | **Textes en anglais dans une interface française.** Onglet vide : `'New Tab'` (`main.ts:816, 1886`), chargement : `'Loading...'` (`main.ts:816`), slogan « NAVIGATE FREELY » (`App.tsx:528`), « Fake Persona » dans la palette. | grep | « Nouvel onglet », « Chargement… », slogan traduit ou assumé, « Fausse identité » partout. |
| 16 | **Bouton « Télécharger la vidéo » toujours visible**, en vert (couleur hors palette), sur chaque page web, même sans média. Le clic lance « Recherche du flux… » puis échoue souvent. C'est du bruit permanent dans la zone la plus précieuse de la barre d'adresse. | `Toolbar.tsx:306` | N'afficher le bouton que si le script de la page détecte un média. Sinon, le ranger dans le menu. |
| 17 | **Structure de page absente** : aucun `<main>`, `<nav>` ni `<header>` (axe : `landmark-one-main`, `region`, de 4 à 42 contenus hors repère selon la page). Aucun `<h1>` quand une page web est affichée (la barre d'adresse est le seul repère). | axe, 10 écrans sur 10 | `<header>` autour des onglets et de la barre d'outils, `<main>` autour de la zone de contenu, `<nav aria-label>` pour les onglets verticaux. |

## 🟡 Cohérence et finition

| # | Constat | Preuve | Correction |
|---|---|---|---|
| 18 | **Les design tokens existent mais sont peu adoptés** : `@theme` déclare `surface-0..3`, `line`, `ink`, `muted`, mais il reste **165 `bg-[#hex]`**, dont 12 fonds sombres quasi identiques (`#161616` ×29, `#121212` ×28, `#1E1E1E` ×23, `#1A1A1A` ×18, `#101014` ×13…). Les bordures varient entre `#5A5A5A`, `#2A2A2A`, `#222`, `#333` et `white/10`. Il n'y a toujours pas de composant `<Button>` : 7 variantes de bouton secondaire. | grep | Migrer vers les tokens, fichier par fichier, et introduire `<Button variant>` (primaire, secondaire, danger, fantôme). |
| 19 | **17 occurrences de texte à 10-11 px** (menu principal, palette, Mots de passe, Fausse identité, titres d'onglets). | grep + mesure : titres d'onglets = 11 px | Plancher à 12 px. |
| 20 | **Aucun réglage de taille de l'interface.** Les textes sont en px figés, et le zoom (Ctrl +/−) ne s'applique qu'aux pages web. Rien pour `prefers-contrast` ni `forced-colors` (Windows contraste élevé). Thème sombre uniquement. | `index.css` | Échelle d'interface (100/110/125 %), `@media (forced-colors: active)` pour les bordures et le focus. À arbitrer selon le public visé. |
| 21 | **Téléchargements** : annuler un téléchargement en cours (« Annuler et retirer ») se fait sans confirmation. « Vider la liste » n'est pas annulable. Les badges d'état (9 px) portent leur `aria-label` sur le SVG, non sur un élément `role="img"`. Un pied de carte vide avec sa bordure apparaît quand aucune action n'est possible. | `DownloadsPage.tsx:97-175` | Toast « Annuler » (comme dans l'historique), badge `role="img"`, ne pas rendre le pied vide. |
| 22 | **Minuteries de confirmation non nettoyées** : `setTimeout` du « Confirmer ? » dans l'historique (4 s) et les mots de passe (3,5 s). Mise à jour d'état après démontage possible, et deux clics espacés peuvent annuler la confirmation en cours. | `HistoryPage.tsx:56`, `PasswordsPage.tsx:100` (et `ExtensionsPage.tsx:64`, `SettingsSections.tsx:172, 307`) | `useRef` + `clearTimeout`. |
| 23 | **Cartes d'historique : titres tronqués à ~21 caractères** alors que la ligne d'URL en police monospace occupe la même largeur. | Capture 1280×800 | `line-clamp-2` sur le titre. |
| 24 | **Transitions parasites** : `transition-all duration-200` sur le conteneur de chaque bannière (aucune propriété animée). Mouvements de survol marqués sur les cartes (`cardHover`, `y:-3`). | Bannières | Retirer les classes inutiles. |

---

## Ordre d'exécution recommandé

1. **#1, #4, #6** : sécurité perçue et feedback. Un hameçonnage plus facile et des retours d'action invisibles sont les risques les plus coûteux.
2. **#2, #3** : un navigateur qui perd l'onglet actif ou coupe son menu sans avertir perd la confiance dès l'usage courant.
3. **#5, #17, #11** : une passe ARIA sur la structure (onglets, repères, noms uniques). C'est 1 à 2 heures, et axe passe à zéro erreur critique.
4. **#7, #8, #9, #10, #12** : clavier et gestes destructeurs.
5. **#13, #14, #15, #16** : cohérence de contenu et de navigation.
6. **#18 à #24** : dette de design system, en tâche de fond.

## Annexe : mesures

- axe-core, 10 écrans : `aria-required-children` ×1 (critique), `nested-interactive` ×2 (grave), `landmark-one-main` ×1, `region` ×3 à 42 (modéré), `page-has-heading-one` sur l'écran web. **Aucune violation `color-contrast`.**
- Contraste calculé (fusion des alphas) : 0 échec sur les 10 écrans, à l'état repos.
- Texte < 12 px à l'état repos : uniquement les titres d'onglets (11 px). Les overlays n'ont pas été mesurés en rendu : le décompte par `grep` (17 occurrences) les couvre.
- Cibles < 24 px : copier/afficher dans Mots de passe (18 px de haut), et les champs de saisie (hauteur de la balise `input` de 20 px dans une zone cliquable de 40 px, sans impact).
- Ordre de tabulation (accueil, 22 premières touches Tab) : cohérent visuellement. Seul le bouton « fermer » d'un onglet inactif est invisible au focus.
