# Audit fonctionnel de Tora — ce qui manque, ce qui est fragile, ce qu'il faut renforcer

> **Statut (octobre 2026) :** sprints 1 à 4 appliqués. Restent ouverts : branchement d'un canal de publication et d'un certificat de signature (voir README), et le découpage du reste de `main.ts` (onglets, IPC, coffre de mots de passe). Ce document décrit l'état *avant* correction.

> Audit en lecture seule (aucun fichier modifié). Base : lecture de `electron/main.ts` (2 098 lignes), `view-preload.ts`, `preload.ts`, `url-utils.ts`, `download-engine.ts`, `extension-manager.ts`, `memory-saver.ts`, `package.json`, `vite.config.ts` et de l'UI `src/`.
> Légende : ✅ présent et correct · 🟡 présent mais partiel/fragile · ❌ absent · 🐞 bug confirmé dans le code · 🔎 à vérifier à l'exécution (je n'ai pas lancé l'app).

---

## 0. Ce que Tora fait déjà bien (à préserver)

| Domaine | État |
|---|---|
| Protections | Bloqueur pubs/traqueurs (Ghostery + EasyList/EasyPrivacy, cache `engine.bin`), anti-popup, anti-redirection (détection de boucle, geste utilisateur), anti-scareware, rejet auto des cookies, en-têtes GPC/DNT, mise à niveau HTTPS avec repli, filtre adulte, anti-fingerprinting (canvas/WebGL/audio, injecté en monde principal via `webFrame`) |
| Données | Mots de passe chiffrés via `safeStorage` (coffre OS), export/import chiffré avec mot de passe maître, écriture atomique `.tmp` → `rename`, presse-papier effacé après 30 s |
| Navigation | Onglets, glisser-déposer, onglets verticaux, couleur de groupe, sourdine, suspension des onglets inactifs (15 min), restauration de session, multi-fenêtres, recherche dans la page, zoom, plein écran vidéo, devtools |
| Outils | Mode lecture, Picture-in-Picture, téléchargement vidéo multi-segments, détection de médias, Mode Focus planifié, QR code de page, identité fictive, palette de commandes (Ctrl+K), import favoris/mots de passe Chrome, extensions Chrome |
| Robustesse | Page d'erreur réseau dédiée, détection de plantage de rendu avec « Recharger », `ErrorBoundary` sur chaque vue, logs `electron-log` |
| Vie privée | Aucune télémétrie |

---

## 1. 🐞 Bugs et incohérences confirmés (à corriger en premier)

| # | Constat (preuve) | Effet utilisateur | Correction |
|---|---|---|---|
| 1.1 | `ipcMain.on('navigate')` (`main.ts` ~1301) ignore `sanitizeNavigationUrl()` — fonction pourtant écrite et **testée** (`url-sanitizer.test.ts`) mais **jamais appelée** dans `main.ts`. La logique est dupliquée en ligne, plus faible. | Les tests donnent une fausse assurance : ils valident du code mort. | Utiliser `sanitizeNavigationUrl` dans `navigate` (et supprimer la copie locale de `isInternalUrl`/`getRegistrableDomain`, aussi dupliquées dans `main.ts:218-233`). |
| 1.2 | `navigate(id, '')` → `''` ne commence pas par `http` et ne contient pas `.` → **recherche Google vide** (`google.com/search?q=`). Utilisé par le bouton « Retour à l'accueil » de la page « introuvable ». | Le bouton censé ramener à l'accueil ouvre Google. | Traiter `''` comme « page nouvel onglet » (et `tora://…` comme interne). |
| 1.3 | Taper `tora://settings`, `localhost:3000`, `192.168.1.1`, `about:blank`, `file:///…` dans la barre d'adresse : `tora://…` et `localhost:3000` (pas de `.`) deviennent des **recherches Google** ; `192.168.1.1` devient `https://192.168.1.1` (échec). | Impossible d'ouvrir une page interne ou un serveur local depuis l'omnibox ; les développeurs sont bloqués. | Règles : `tora://` → interne ; `localhost`/IPv4/IPv6/`:port` → `http://` ; sinon domaine → `https://` ; sinon recherche. |
| 1.4 | Moteur de recherche **incohérent** : Google dans `main.ts` (navigate), DuckDuckGo dans `url-utils.ts`. | Pour un navigateur « vie privée », la recherche part vers Google sans que l'utilisateur l'ait choisi. | Un réglage « Moteur de recherche » unique (voir §4.3) ; défaut DuckDuckGo ou Brave Search. |
| 1.5 | **Mise à niveau HTTPS appliquée à tout `http://`** y compris `localhost`, IP privées et ports de dev (`main.ts` ~1067). Le repli n'arrive qu'après l'échec de chargement. | Latence + erreur transitoire sur chaque serveur de développement/routeur/NAS. | Exempter `localhost`, `*.local`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `[::1]`. |
| 1.6 | `memorySaverEngine` est **importé mais jamais utilisé** ; `main.ts` possède sa propre suspension d'onglets (15 min) alors que `memory-saver.ts` (10 min, capture d'écran) existe. Deux implémentations, une seule active. | Code mort, comportement de suspension différent de celui documenté dans le fichier. | Garder une seule implémentation (idéalement `memory-saver.ts`, testée) et la brancher. |
| 1.7 | `createTab(window, url, partitionId)` accepte une partition, **jamais utilisée**. Une session non principale n'aurait ni bloqueur, ni gestion de permissions, ni téléchargements (les handlers sont posés sur `browsingSession` uniquement). | Si on l'activait demain pour la navigation privée, la protection serait absente en silence. | Appliquer les handlers via une fonction `configureSession(session)` appelée pour chaque session. |
| 1.8 | Téléchargements natifs : tableau `downloads` **en mémoire seulement** (aucun `saveData('downloads.json')`). | La page Téléchargements est vide après redémarrage. | Persister (limite 200) et marquer les fichiers supprimés. |
| 1.9 | Page Téléchargements : aucune action **Pause / Reprendre / Annuler / Réessayer** ni suppression de la liste ; le moteur multi-segments a pourtant `cancelled`/`interrupted`. | Un téléchargement interrompu est définitif. | Exposer `pause/resume/cancel/retry` via IPC. |
| 1.10 | `download-video` : le nom de fichier est généré sans contrôle d'existence et `.mp4` est forcé même pour un flux HLS (`.m3u8`) ou audio. | Écrasement possible, fichier inutilisable si la source n'est pas du MP4. | Détecter le type MIME/extension, suffixer `(1)`, `(2)`…, remuxer HLS (ffmpeg) ou annoncer clairement la limite. |
| 1.11 | Fichiers compilés **orphelins** dans `dist-electron/` : `ghost-shield.js`, `bionic-reading.js` n'ont plus de source dans `electron/`. | Confusion, risque d'embarquer du code obsolète. | Nettoyer `dist-electron` au build (`rimraf` avant `tsc`). |
| 1.12 | `README.md`, `.env.example`, `metadata.json`, `vite.config.ts` sont des **restes d'AI Studio** (GEMINI_API_KEY, commentaires « AI Studio », nom de paquet `react-example`, version `0.0.0`). | Image non professionnelle ; une clé API pourrait être attendue par erreur. | Réécrire README, renommer le paquet `tora`, supprimer `GEMINI_API_KEY`/`metadata.json`. |

---

## 2. Sécurité à renforcer (c'est un navigateur : tolérance zéro)

| # | Constat | Risque | Correction |
|---|---|---|---|
| 2.1 | Aucune **Content-Security-Policy** pour l'interface (`index.html`) ni via `onHeadersReceived`. | Une XSS dans l'UI (ex. titre de page injecté) pourrait atteindre le pont `window.tora` privilégié. | CSP stricte : `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'`. |
| 2.2 | `sandbox` non explicité sur la fenêtre principale ni les `BrowserView` (défaut Electron actuel = actif, mais non verrouillé) ; `webSecurity`, `allowRunningInsecureContent` non fixés. | Une mise à jour/une modification future pourrait affaiblir l'isolation sans alerte. | Poser explicitement `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, `webviewTag: false`. |
| 2.3 | **Aucune vérification d'expéditeur IPC** : 100+ canaux `ipcMain.on/handle`, aucune validation de `event.senderFrame`/origine. | Tout contenu qui parviendrait à émettre vers un canal (preload mal isolé, extension) agirait comme l'UI. | Wrapper `handleTrusted(channel, fn)` qui vérifie `senderFrame.url` (UI) ou l'id du `BrowserView` (preload de page) et valide chaque argument (types, longueur). |
| 2.4 | `open-item` / `show-item-in-folder` acceptent **n'importe quel chemin** (`shell.openPath(pathStr)`) ; `isSafeFilePath` existe mais utilise `startsWith` sans séparateur (`/a/b` autorise `/a/bc`) et n'est pas appelé. | Ouverture/exécution d'un fichier arbitraire si l'UI est compromise. | N'accepter que l'`id` d'un téléchargement connu, résoudre le chemin côté main ; corriger `isSafeFilePath` avec `path.relative`. |
| 2.5 | `download-media` : `browsingSession.downloadURL(url)` avec une URL fournie par le preload de page, sans contrôle de schéma/hôte. | Téléchargement forcé depuis une source choisie par une page malveillante (SSRF local, `file:`). | Limiter à `http(s)`, refuser les IP privées sauf si c'est la page elle-même. |
| 2.6 | Extensions chargées avec `allowFileAccess: true` et sans écran de **permissions/consentement** ni vérification du manifest (MV2/MV3, permissions larges). | Une extension tierce lit les fichiers locaux/tous les sites sans que l'utilisateur ne le sache. | Afficher les permissions du manifest avant installation, désactiver `allowFileAccess` par défaut, signaler MV2. |
| 2.7 | **Pas de cadenas / info de connexion** dans la barre d'adresse : l'utilisateur ne voit jamais si la page est HTTPS valide, HTTP, ou si le certificat est invalide. | Phishing plus facile (contraire à l'esprit du produit). | Icône cadenas/avertissement + volet « Informations du site » (certificat, cookies, permissions). |
| 2.8 | **Certificats invalides** : la page d'erreur `-200/-202` bloque sans issue. Aucun gestionnaire `certificate-error`, aucun « continuer malgré le risque » par site. | Impossible d'accéder à un intranet/dev en HTTPS auto-signé ; ou, à l'inverse, tentation de contourner globalement. | Page d'avertissement type Chrome (détails + « Continuer vers … (dangereux) » mémorisé par session et par hôte). |
| 2.9 | `setPermissionCheckHandler` non défini (seul `setPermissionRequestHandler` l'est) ; pas de `setDevicePermissionHandler` (USB/HID/série/Bluetooth). | Des API qui interrogent l'état de permission sans demande passent par les valeurs par défaut. | Définir les deux handlers en refus par défaut, aligné sur `domain-settings`. |
| 2.10 | Navigation de la **fenêtre UI** non verrouillée (`will-navigate`/`setWindowOpenHandler` posés seulement sur les `BrowserView`). 🔎 Glisser-déposer d'un fichier/lien sur l'UI. | Remplacement de l'interface par une page externe (qui garderait le preload). | `mainWindow.webContents.on('will-navigate', e => e.preventDefault())` + `setWindowOpenHandler(() => ({action:'deny'}))`. |
| 2.11 | **Schémas externes** : `mailto:`, `tel:`, `magnet:`, liens d'applications (`zoommtg:`, `steam:`) : aucune gestion (ni ouverture protégée, ni blocage). 🔎 | Liens inertes ou, selon le cas, lancement d'applications sans confirmation. | Boîte de confirmation « Ouvrir dans l'application … ? » avec liste blanche. |
| 2.12 | Pages internes `data:text/html` (erreur, Mode Focus) chargées via `loadURL(data:…)` : le **domaine bloqué** du Mode Focus est inséré non échappé dans le HTML (`${domain}`) — les erreurs réseau, elles, sont désormais échappées. | Faible (le domaine vient d'une URL parsée), mais à homogénéiser. | Utiliser la même fonction `escapeHtml`, ou un protocole `tora://` servi par `protocol.handle`. |
| 2.13 | Coffre de mots de passe : si `safeStorage` est indisponible, l'identifiant n'est **pas enregistré sans l'annoncer** (seul un `console.warn`). | L'utilisateur croit son mot de passe sauvegardé. | Message visible : « Chiffrement système indisponible ; impossible d'enregistrer ». |
| 2.14 | Mot de passe maître : pas de limite d'essais, pas de mesure de robustesse, dérivation de clé non vérifiée ici. 🔎 | Brute-force hors ligne du fichier exporté. | scrypt/argon2 avec paramètres élevés, indicateur de robustesse, 8 → 12 caractères minimum conseillés. |
| 2.15 | Pas de **Safe Browsing / liste de phishing** (seule une liste adulte et EasyList). | Sites de phishing/malware non bloqués. | Liste URLhaus/OpenPhish/Phishing.Database en local (hash prefix) ou API Google Safe Browsing (option). |
| 2.16 | Pas de **DNS sécurisé (DoH)** ni de proxy/VPN configurables. | Le FAI voit toutes les résolutions DNS. | `app.configureHostResolver({ secureDnsMode:'secure', secureDnsServers:[…] })` + réglage. |
| 2.17 | Adresse bar : `javascript:` bloqué dans `sanitizeNavigationUrl` mais pas appliqué (cf. 1.1) ; `data:`/`blob:` de haut niveau non traités. | Ingénierie sociale par collage de `data:` en barre d'adresse. | Refuser/avertir pour `data:`/`javascript:` saisis manuellement. |

---

## 3. Fiabilité et gestion des données

| # | Constat | Correction |
|---|---|---|
| 3.1 | `loadData()` : chaque lecture JSON est entourée de `catch (e) {}` **muet**. Un fichier corrompu (coupure pendant l'écriture) efface silencieusement favoris/historique/mots de passe au démarrage. | Journaliser, conserver un `.bak`, tenter la restauration, ne pas écraser un fichier illisible. |
| 3.2 | `saveData` : `catch (e) {}` vide ; échec disque plein/permission = perte silencieuse. | Logger + notifier l'UI (« Impossible d'enregistrer vos favoris »). |
| 3.3 | **Écriture de l'historique à chaque navigation** (fichier complet, 500 entrées, sans débounce). | Débounce 1-2 s, ou SQLite (`better-sqlite3`) pour historique/favoris. |
| 3.4 | Historique **plafonné à 500** sans pagination ni recherche serveur ; pas de dédoublonnage (rechargement = nouvelle entrée) ; pas de purge par période (« dernière heure / 24 h / tout »). | Dédoublonner par URL+minute, compteur de visites, effacement par plage. |
| 3.5 | Pas de **fermeture propre** : sauvegarde de session différée 1 s ; crash pendant ce délai = onglets perdus. 🔎 | Sauvegarde sur `before-quit`/`will-quit`, + sauvegarde périodique. |
| 3.6 | **Taille/position de fenêtre non mémorisées** (`1200×800` fixe) ; fenêtre maximisée non restaurée. | Persister `getBounds()`/`isMaximized()` et valider qu'elles tiennent sur un écran présent. |
| 3.7 | Pas de **verrou d'instance unique** (`requestSingleInstanceLock`) : deux instances partagent la même partition et les mêmes JSON → écritures concurrentes. | `app.requestSingleInstanceLock()` + `second-instance` pour ouvrir l'URL reçue. |
| 3.8 | Pas de **migration de schéma** (aucun champ `version` dans les JSON). | Ajouter `schemaVersion` et des migrations. |
| 3.9 | `crashReporter`/rapport de crash absent ; les `render-process-gone` sont enregistrés mais l'UI « Cette page a cessé de fonctionner » ne propose pas « Envoyer un rapport/Copier le journal ». | Option locale « Copier le journal d'erreurs », jamais d'envoi automatique. |
| 3.10 | Pages `unresponsive` : simplement journalisé (`main.ts:681`). | Bandeau « Page ne répond plus — Attendre / Fermer l'onglet ». |
| 3.11 | Tests : 6 fichiers `electron/__tests__` (20 tests) couvrent utilitaires ; **aucun test de `main.ts`, de l'UI ni d'intégration**. Les tests de `sanitizeNavigationUrl` portent sur du code non utilisé (cf. 1.1). | Extraire la logique pure de `main.ts` (2 098 lignes) en modules testables ; ajouter Playwright-Electron pour 5 parcours critiques. |
| 3.12 | `main.ts` = **monolithe de 2 098 lignes** (tabs, IPC, sécurité, coffre, import…). | Scinder : `tabs/`, `ipc/`, `security/`, `vault/`, `storage/`. |

---

## 4. Fonctionnalités de navigateur **attendues mais absentes**

### 4.1 Barre d'adresse (omnibox)
| Fonction | État |
|---|---|
| Suggestions (historique, favoris, recherche) pendant la saisie | ❌ |
| Autocomplétion inline du domaine | ❌ |
| Mots-clés de moteur (`g `, `yt `, `wiki `) | ❌ |
| Cadenas / info du site / certificat | ❌ (cf. 2.7) |
| Affichage de l'URL simplifiée (domaine en évidence, anti-usurpation) | ❌ |
| Coller et naviguer / glisser une URL sur la fenêtre | ❌ 🔎 |
| Saisie `tora://`, `about:`, `view-source:` | ❌ (cf. 1.3) |

### 4.2 Onglets et fenêtres
| Fonction | État |
|---|---|
| **Rouvrir l'onglet fermé** (Ctrl+Maj+T) + liste des onglets récemment fermés | ❌ |
| Épingler un onglet | ❌ |
| Dupliquer / fermer les autres / fermer à droite | ❌ (menu contextuel d'onglet = couleur uniquement) |
| Recherche d'onglets (Ctrl+Maj+A) / aperçu au survol | ❌ |
| Déplacer un onglet vers une nouvelle fenêtre / glisser hors de la barre | ❌ |
| Groupes d'onglets nommés/repliables (seulement une couleur) | 🟡 |
| Ctrl+1…9 / Ctrl+9 (dernier onglet), Alt+←/→, F5, Ctrl+Maj+R, Échap (stop), F11 | ❌ (seuls T, W, L, F, Tab, +, −, 0, R, F12 existent) |
| **Ctrl+N** (nouvelle fenêtre) — l'IPC existe, pas de raccourci | ❌ |
| Fermeture avec onglets multiples / téléchargement en cours : confirmation | ❌ |
| Nouveau lien en onglet d'arrière-plan (clic molette/Ctrl+clic) | 🔎 |

### 4.3 Réglages absents
| Réglage | État |
|---|---|
| **Moteur de recherche** par défaut (+ ajout personnalisé) | ❌ |
| Page d'accueil / au démarrage (nouvel onglet, reprendre, pages précises) | ❌ (session toujours restaurée) |
| Dossier de téléchargement + « demander où enregistrer » | ❌ |
| Langue de l'interface (tout est codé en français) et langue des pages (`Accept-Language`) | ❌ |
| Thème / accent (sombre figé, voulu — mais accent/densité/taille de police non réglables) | 🟡 |
| Taille de police / zoom par défaut | ❌ |
| Navigateur par défaut (`setAsDefaultProtocolClient('http'/'https')`) | ❌ |
| Démarrage avec Windows / en arrière-plan | ❌ |
| Réinitialiser les réglages / exporter-importer le profil | ❌ |

### 4.4 Confidentialité & données
| Fonction | État |
|---|---|
| **Effacer les données de navigation** (cookies, cache, stockage local, plage de temps) — Ctrl+Maj+Suppr | ❌ (seulement historique et permissions) |
| **Navigation privée** (fenêtre sans persistance) | ❌ (la partition `persist:` est la seule) |
| Gestionnaire de **cookies** par site (voir/supprimer) | ❌ |
| Effacer à la fermeture (cookies/historique) | ❌ |
| Page « Permissions par site » listant tous les sites | 🟡 (menu par site uniquement) |
| Blocage des cookies tiers / mode strict | ❌ (`session.cookies` non géré) |
| Nettoyage des paramètres de suivi dans les URLs (`utm_*`, `fbclid`, `gclid`) | ❌ — **idéal pour Tora** |
| Réduction du `Referer` (origine seule en inter-sites) | ❌ |
| Protection WebRTC (fuite d'IP locale) | ❌ (`setWebRTCIPHandlingPolicy`) |
| Fingerprinting : `navigator.*` (langues, plateforme, concurrence matérielle), polices, écrans, WebGPU, iframes/workers | 🟡 (canvas/WebGL/audio seulement ; exécution possible après les premiers scripts) |

### 4.5 Contenu et pages
| Fonction | État |
|---|---|
| **Imprimer** (Ctrl+P) / enregistrer en PDF | ❌ (`webContents.print/printToPDF` jamais appelé) |
| **Enregistrer la page sous** (Ctrl+S) | ❌ |
| **Afficher le code source** (Ctrl+U) | ❌ |
| Visionneuse PDF intégrée | 🔎 (dépend du plugin Chromium, non vérifié dans un `BrowserView`) |
| Correcteur orthographique (menu contextuel avec suggestions) | ❌ (`session.setSpellCheckerLanguages`) |
| Traduction de page | ❌ |
| Menu contextuel complet : Retour/Avancer, enregistrer l'image/le lien, ouvrir l'image dans un onglet, « Rechercher “…” », copier l'adresse de l'image, coller (hors champ éditable), imprimer, source | 🟡 (6 entrées) |
| Gestion des **boîtes de dialogue JS** (`alert/confirm/prompt`, `beforeunload`) | 🔎 |
| Authentification HTTP basique (`login` event) | ❌ 🔎 |
| Sélecteur de fichiers, drag & drop de fichiers dans une page, upload | 🔎 |
| **Plein écran** HTML5 | ✅ |
| Recherche : surlignage et compteur | ✅ |
| Zoom **mémorisé par site** (aujourd'hui par onglet, perdu à la fermeture) | 🟡 |
| Défilement fluide / geste précédent-suivant (souris 4/5, trackpad) | 🔎 |

### 4.6 Favoris, historique, téléchargements
| Fonction | État |
|---|---|
| Barre de favoris sous la barre d'outils (afficher/masquer) | ❌ |
| **Dossiers**, renommer/éditer, déplacer, tri, étiquettes | ❌ (liste plate, suppression uniquement) |
| Import **HTML** (standard Netscape) / export des favoris | ❌ |
| Import depuis **Firefox, Edge, Brave** ; macOS/Linux | ❌ (Chrome Windows seulement) |
| Détection des doublons / liens morts | ❌ |
| Historique : recherche plein texte, filtres par date, suppression par plage, visites multiples | 🟡 |
| Téléchargements : pause/reprise, ouvrir le dossier, supprimer de la liste, antivirus/avertissement de type de fichier dangereux (`.exe`, `.scr`) | 🟡 (ouvrir/afficher seulement) |
| Mots de passe : générateur, vérification des fuites (k-anonymity HIBP), mots de passe faibles/réutilisés, **modification** d'une entrée, notes | ❌ (liste/copier/supprimer uniquement) |
| Remplissage automatique d'adresses/cartes | ❌ (volontaire pour la sécurité ? à décider) |

### 4.7 Système et distribution
| Fonction | État |
|---|---|
| **Packaging** : `package.json` n'a **aucune section `build`** d'electron-builder (appId, icônes, NSIS, publish) ni script `dist`/`package`. Impossible de produire un installateur. | ❌ |
| Mises à jour automatiques | 🟡 (appel `electron-updater` sans cible `publish` : no-op) |
| Signature de code (Windows) / notarisation (macOS) | ❌ |
| Icône d'application, nom de produit, métadonnées | ❌ 🔎 |
| Menu d'application natif (Fichier/Édition/Affichage/Historique/Favoris/Aide) et raccourcis affichés | ❌ 🔎 |
| Intégration OS : protocole `http/https`, associations `.html/.pdf`, jump list Windows, notifications | ❌ |
| macOS/Linux : `titleBarStyle:'hidden'` + `WindowControls` custom sont pensés Windows ; boutons de fenêtre macOS (« traffic lights ») non gérés | 🔎 |
| Accessibilité du *navigateur* (pas des pages) : lecteur d'écran sur l'UI ✅ (audit UI fait), **mode contraste élevé OS**, `forced-colors` | 🟡 |
| Internationalisation (i18n) | ❌ |

---

## 5. Performance et ressources

| # | Constat | Piste |
|---|---|---|
| 5.1 | `BrowserView` est **déprécié** par Electron au profit de `WebContentsView`/`BaseWindow`. | Migrer à moyen terme (évite le blocage lors d'une prochaine montée de version Electron). |
| 5.2 | Démarrage : le bloqueur télécharge/analyse EasyList au lancement avant `createNewWindow()` (le `await` précède la fenêtre). 🔎 Hors-ligne ou lent = démarrage retardé. | Ouvrir la fenêtre d'abord, initialiser le bloqueur en tâche de fond (le cache `engine.bin` couvre le reste), rafraîchir les listes 1×/jour. |
| 5.3 | Listes adultes (`fetch` de ~MB) : parsées en mémoire, vérification `domain.endsWith` à chaque requête. | `Set` + remontée de suffixes, ou filtre de Bloom. |
| 5.4 | `onBeforeRequest` unique cumulant 5 tâches (HTTPS, focus, adulte, pubs, vidéo, media-grabber) sur **chaque requête**. | Court-circuiter par type de ressource, mesurer (`performance.now`) et mettre en cache les décisions par hôte. |
| 5.5 | `broadcastTabs()` envoie **l'état complet** de tous les onglets à chaque événement (`did-stop-loading`, titre, favicon…). | Diffs/événements ciblés + `requestAnimationFrame`/débounce 50 ms. |
| 5.6 | Suspension d'onglets via `loadURL('about:blank')` : **perte de l'état** (formulaire en cours, scroll, vidéo). | Ne pas suspendre les onglets avec saisie, appel (caméra/micro) ou audio ; mémoriser le scroll ; utiliser `webContents.setBackgroundThrottling` / `discard`. |
| 5.7 | Pas de préchargement DNS/connexion (`preconnect`, `session.preconnect`) sur les suggestions. | Gain perçu sur les liens fréquents. |
| 5.8 | Instantanés d'overlay (`capture-page`) en data-URL plein écran envoyés par IPC à chaque ouverture de menu. | Envoyer en `nativeImage` redimensionné/JPEG, ou garder côté main. |
| 5.9 | `backdrop-blur` + `blur(18px)` sur un snapshot plein écran : coûteux sur GPU intégrés. | Option « Réduire les effets » (respecter aussi `prefers-reduced-transparency`). |
| 5.10 | Pas de limite de mémoire ni d'indicateur d'utilisation par onglet (gestionnaire de tâches). | Page `tora://tasks` (mémoire/CPU par onglet, fermeture forcée) via `app.getAppMetrics()`. |

---

## 6. Idées de fonctionnalités **cohérentes avec l'identité de Tora** (vie privée + productivité)

| Idée | Valeur | Effort |
|---|---|---|
| **Tableau de bord de confidentialité** par site (pubs, traqueurs, cookies refusés, fingerprint bloqué, « score »), cliquable depuis le bouclier | Rend les protections visibles — différenciant fort | Moyen |
| **Nettoyeur d'URL** (`utm_*`, `fbclid`, `gclid`, `mc_eid`…) à la navigation et au « Copier le lien » | Gain immédiat, simple | Faible |
| **Conteneurs / profils** (Travail, Perso, Achats) avec cookies isolés (les partitions existent déjà) | Fonction phare de Firefox ; infrastructure à moitié prête (`partitionId`) | Moyen |
| **Navigation privée** et **« Effacer à la fermeture »** | Attendu d'un navigateur privacy | Moyen |
| **Redirection vers alternatives** (Invidious/Nitter/Teddit, archive.org) et **redirection AMP** vers la page canonique | Vie privée + confort | Faible |
| **Mode HTTPS-seulement strict** avec écran d'avertissement avant HTTP | Complète la mise à niveau HTTPS | Faible |
| **Écran « sites bloqués » avec action** (autoriser une fois / pour ce site) quand une ressource essentielle est bloquée (« site cassé ? ») | Réduit la frustration liée aux bloqueurs | Moyen |
| **Reprendre là où vous étiez** : sessions nommées (« Recherche voyage »), sauvegarde/restauration d'un ensemble d'onglets | Productivité | Moyen |
| **Notes/surlignage** de page, **capture d'écran** complète (la capture existe pour l'overlay) | Productivité | Moyen |
| **Raccourcis clavier personnalisables** + aide (`?`) | Pouvoir utilisateur | Faible |
| **Palette de commandes étendue** : rechercher onglets, favoris, historique et réglages ; actions « fermer à droite », « épingler »… | Cœur de l'UX déjà là (Ctrl+K) | Faible |
| **Mode lecture** enrichi : thème, taille, synthèse vocale (`speechSynthesis`), export Markdown/PDF | Prolonge un atout existant | Moyen |
| **Téléchargeur** : file d'attente, vitesse/ETA, limite de bande passante, détection de doublon, hash SHA-256 | Prolonge le moteur multi-segments | Moyen |
| **Synchronisation chiffrée de bout en bout** (fichier chiffré sur dossier cloud choisi, sans serveur Tora) | Sync respectant la vie privée | Élevé |
| **Vérification de fuites de mots de passe** (HIBP k-anonymity) et rappel de mots de passe faibles | Valeur sécurité évidente | Moyen |
| **Journal des protections** exportable (anonyme, local) | Transparence/preuve | Faible |

---

## 7. Qualité logicielle, build et process

| # | Constat | Action |
|---|---|---|
| 7.1 | Pas de **CI** (lint, tests, build) ; pas de Git dans ce dossier (aucun historique/restauration possible). | `git init`, GitHub Actions : `npm ci`, `lint`, `test`, `build`. |
| 7.2 | `npm audit` : des vulnérabilités signalées à l'installation de dépendances (message `npm audit fix --force`). 🔎 | `npm audit`, mises à jour ciblées (Electron, ghostery). |
| 7.3 | `vite.config.ts` : commentaires et options AI Studio (`DISABLE_HMR`), alias `@` non utilisé. | Nettoyer. |
| 7.4 | Aucune **télémétrie de qualité locale** (journal des erreurs lisible depuis l'app) ni page « À propos / Versions / Licences ». | Page `tora://about` (version, Chromium/Electron, chemin des logs, licences tierces — obligatoires pour Ghostery/EasyList). |
| 7.5 | **Licences des listes** (EasyList CC-BY-SA/GPL) et attributions absentes de l'UI. | Mentions légales dans « À propos ». |
| 7.6 | **Politique de confidentialité** et description des données stockées absentes (important pour un gestionnaire de mots de passe). | `PRIVACY.md` + lien dans l'app. |
| 7.7 | Typage : `(window as any).toraTabs/toraActiveTabId/…` partout dans `main.ts` (état global non typé sur `BrowserWindow`). | Classe `WindowState` en `WeakMap<BrowserWindow, …>`. |
| 7.8 | Le fichier `electron/types.ts` et `src/types.ts` dupliquent les types IPC. | Paquet de types partagé unique. |

---

## 8. Feuille de route recommandée

**Sprint 1 — Réparer et sécuriser (1-2 semaines)**
1. 1.1-1.5 : omnibox correcte (`sanitizeNavigationUrl`, localhost/IP/`tora://`, moteur de recherche unique, exemptions HTTPS).
2. 2.1-2.5, 2.10 : CSP, sandbox explicite, validation des expéditeurs IPC, chemins de fichiers sûrs, UI non navigable.
3. 3.1-3.2, 3.7 : lecture/écriture de données non silencieuses, instance unique.
4. 1.8-1.9 : persistance et contrôle des téléchargements.
5. 7.1 : Git + CI.

**Sprint 2 — Les bases attendues d'un navigateur (2-3 semaines)**
6. Rouvrir l'onglet fermé, raccourcis manquants (Ctrl+Maj+T, Ctrl+N, Ctrl+1-9, F5, Alt+←/→, Ctrl+P/S/U/D/H/J), menu contextuel complet.
7. Suggestions d'omnibox + cadenas/infos du site + page d'avertissement certificat.
8. Effacer les données de navigation, navigation privée, réglage moteur de recherche / dossier de téléchargement / page de démarrage.
9. Imprimer / PDF / enregistrer la page, correcteur orthographique.
10. Fenêtre : taille mémorisée.

**Sprint 3 — Différenciation vie privée (2-4 semaines)**
11. Tableau de bord de confidentialité, nettoyeur d'URL, blocage cookies tiers, WebRTC, DoH, Safe Browsing.
12. Conteneurs/profils (réutiliser `partitionId` + `configureSession`).
13. Mots de passe : modification, générateur, fuites.

**Sprint 4 — Distribution (1-2 semaines)**
14. Config `electron-builder` (icône, NSIS/DMG/AppImage), signature, `publish`, auto-update réel.
15. README/PRIVACY/À propos/licences, nettoyage des restes AI Studio et de `dist-electron`.
16. Migration `BrowserView` → `WebContentsView`, découpage de `main.ts`, tests d'intégration Playwright.

---

## 9. Synthèse chiffrée

| Catégorie | Éléments relevés |
|---|---|
| Bugs / incohérences confirmés | 12 |
| Renforcements de sécurité | 17 |
| Fiabilité / données | 12 |
| Fonctionnalités navigateur manquantes | ~70 lignes (omnibox, onglets, réglages, données, contenu, favoris, système) |
| Optimisations de performance | 10 |
| Idées différenciantes | 16 |
| Qualité / distribution | 8 |

**Ce que je recommande pour démarrer** : le lot « omnibox + sécurité de base » (§1.1-1.5, 2.1-2.5, 2.10), car il corrige des comportements visibles dès aujourd'hui et protège toutes les fonctions suivantes.
