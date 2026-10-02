# Confidentialité de Tora

Tora ne possède aucun serveur, n'envoie aucune statistique d'usage et ne contient aucun outil de suivi. Tout ce qu'il retient reste sur votre ordinateur.

## Ce qui est enregistré sur votre ordinateur

Dans le dossier de données de Tora (visible dans *À propos de Tora*) :

| Donnée | Détail |
|---|---|
| Favoris, raccourcis, historique (500 entrées) | Fichiers JSON locaux |
| Mots de passe | Chiffrés avec le coffre de votre système (DPAPI sous Windows, Trousseau sous macOS) ; Tora ne les enregistre pas si ce chiffrement est indisponible |
| Réglages, conteneurs, listes de sites bloqués (Mode Focus) | Fichiers JSON locaux |
| Téléchargements | Liste des fichiers (pas les fichiers eux-mêmes) |
| Cookies et données de sites | Dans le stockage de Chromium, séparés par conteneur |
| Journaux d'erreurs | Fichiers texte locaux, jamais envoyés |

La **navigation privée** n'enregistre ni historique, ni cookies, ni mots de passe, ni session, et efface ses données à la fermeture de la fenêtre. Le menu *Paramètres › Effacer les données de navigation* supprime l'historique, les téléchargements, les cookies, le cache et les autorisations (cookies et cache toujours en totalité).

## Connexions réseau initiées par Tora lui-même

| Quand | Où | Ce qui est envoyé |
|---|---|---|
| Au démarrage | `easylist.to` | Une requête de téléchargement des listes de filtres (aucune donnée personnelle) |
| Toutes les 6 heures | `urlhaus.abuse.ch`, `openphish.com` | Une requête de téléchargement des listes de sites dangereux. La vérification des pages visitées se fait **localement** |
| Si le filtre adulte est actif | `raw.githubusercontent.com` | Une requête de téléchargement de la liste |
| À votre demande (« Vérifier les fuites ») | `api.pwnedpasswords.com` | Les **5 premiers caractères** de l'empreinte SHA-1 de chaque mot de passe (k-anonymat) : le mot de passe ne peut pas être retrouvé |
| Si vous choisissez un DNS sécurisé | Cloudflare, Quad9 ou Google | Les noms des sites que vous visitez (à la place de votre fournisseur d'accès) |
| Au démarrage puis toutes les 6 heures (version installée avec canal configuré) | Canal de publication de Tora | Une requête de recherche de mise à jour |

Aucune frappe de la barre d'adresse n'est envoyée à un moteur de recherche avant que vous ne validiez la recherche ; les suggestions viennent uniquement de vos favoris et de votre historique.

## Ce que Tora ajoute aux sites que vous visitez

- Les en-têtes `Sec-GPC` et `DNT` (demande de ne pas vendre ni partager vos données), si cette option est active
- Un `Referer` réduit à l'origine pour les requêtes entre sites
- Aucun identifiant propre à Tora

## Vos choix

Chaque protection se règle dans la page *Protections* ; les conteneurs, le moteur de recherche, le dossier de téléchargement et le DNS dans *Paramètres*.
