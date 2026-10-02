# Tora

Un navigateur de bureau (Electron) rapide, sombre, qui protège votre vie privée sans rien collecter.

## Ce que fait Tora

**Protection**
- Bloqueur de publicités et de traqueurs (EasyList / EasyPrivacy), anti-popups, anti-redirections, anti-fausses alertes
- Blocage des cookies tiers, réduction du `Referer`, nettoyage des liens de suivi (`utm_*`, `fbclid`, `gclid`…)
- Mise à niveau automatique vers HTTPS, protection WebRTC, anti-empreinte (canvas / WebGL / audio), DNS sécurisé optionnel
- Navigation sécurisée : blocage des sites de malware et d'hameçonnage connus (vérification locale)
- Avertissement de certificat invalide avec choix explicite de continuer

**Navigation**
- Onglets (horizontaux ou verticaux), conteneurs isolés, fenêtre privée, session restaurée, onglets suspendus pour libérer la mémoire
- Barre d'adresse avec suggestions, cadenas, recherche dans la page, zoom, impression, PDF, code source
- Mode lecture, Picture-in-Picture, téléchargement de vidéos, Mode Focus planifié, QR code de page

**Données**
- Mots de passe chiffrés par le système, export/import chiffré, générateur, santé et vérification des fuites (à la demande)
- Favoris, historique, téléchargements (pause / reprise / réessai), effacement des données par période
- Import des favoris et mots de passe depuis Chrome (Windows)

Voir [PRIVACY.md](PRIVACY.md) pour le détail de ce qui est stocké et des connexions réseau.

## Raccourcis clavier

| Action | Raccourci |
|---|---|
| Nouvel onglet / fermer l'onglet / rouvrir l'onglet fermé | `Ctrl+T` / `Ctrl+W` / `Ctrl+Maj+T` |
| Nouvelle fenêtre / fenêtre privée | `Ctrl+N` / `Ctrl+Maj+N` |
| Onglet suivant / précédent | `Ctrl+Tab`, `Ctrl+PageDown` / `Ctrl+Maj+Tab`, `Ctrl+PageUp` |
| Aller à l'onglet 1 à 8 / dernier onglet | `Ctrl+1…8` / `Ctrl+9` |
| Barre d'adresse / rechercher dans la page | `Ctrl+L` / `Ctrl+F` |
| Recharger / sans cache | `F5`, `Ctrl+R` / `Ctrl+Maj+R` |
| Précédent / suivant | `Alt+←` / `Alt+→` |
| Favori / historique / téléchargements | `Ctrl+D` / `Ctrl+H` / `Ctrl+J` |
| Imprimer / enregistrer la page / code source | `Ctrl+P` / `Ctrl+S` / `Ctrl+U` |
| Zoom + / − / 100 % | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| Palette de commandes | `Ctrl+K` |
| Effacer les données de navigation | `Ctrl+Maj+Suppr` |
| Outils de développement | `F12` |

## Développement

Prérequis : Node.js 22 ou plus.

```bash
npm install
npm run dev:electron   # interface avec rechargement à chaud + application Electron
```

| Commande | Rôle |
|---|---|
| `npm run lint` | Vérification des types (interface et processus principal) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests de bout en bout : lance la vraie application (Playwright) |
| `npm run build` | Construit l'interface (`dist/`) et compile Electron (`dist-electron/`, vidé avant chaque build) |
| `npm run pack` | Application décompressée dans `release/` (vérification rapide) |
| `npm run dist` | Installateur pour le système courant (`dist:win`, `dist:mac`, `dist:linux`) |

### Structure

```
electron/        processus principal (main.ts), préchargements, modules testés
  storage.ts       stockage JSON (écritures atomiques en file, sauvegardes, récupération)
  error-pages.ts   pages d'erreur réseau
  privacy-utils.ts nettoyage d'URL, détection de tiers, parseurs de listes
  password-tools.ts santé des mots de passe, vérification de fuites (k-anonymat)
  threat-feed.ts   listes de sites dangereux
  url-utils.ts     saisie de la barre d'adresse, hôtes locaux, chemins sûrs
src/             interface React (pages internes tora://…)
e2e/             tests de bout en bout
resources/       icônes de l'application
scripts/         scripts de build
```

Les données de test peuvent être isolées avec la variable d'environnement `TORA_USER_DATA` (dossier de données alternatif).

## Publier une version

1. Mettre à jour `version` dans `package.json`.
2. Construire l'installateur : `npm run dist:win` (ou `dist:mac`, `dist:linux`). Les fichiers sont dans `release/`.

### Mises à jour automatiques

Tora vérifie les mises à jour au démarrage puis toutes les 6 heures, **uniquement dans la version installée** et si un canal de publication est configuré. Pour l'activer, ajoutez dans `package.json`, section `build` :

```json
"publish": [{ "provider": "github", "owner": "VOTRE-COMPTE", "repo": "VOTRE-DEPOT" }]
```

puis publiez avec `npx electron-builder --publish always` en définissant `GH_TOKEN`. Sans canal, la page *À propos* indique simplement que les mises à jour ne sont pas configurées.

### Signature du code

Un installateur non signé déclenche un avertissement du système. Pour signer, définissez avant `npm run dist:win` :
`CSC_LINK` (certificat `.pfx`, chemin ou URL) et `CSC_KEY_PASSWORD`. Sur macOS, un compte développeur Apple et la notarisation sont nécessaires (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

## Données

Les données vivent dans le dossier de l'application (`%APPDATA%\Tora` sous Windows). Une ancienne installation de développement dans `react-example` est déplacée automatiquement vers `Tora` au premier lancement.
