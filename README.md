# Show All Links — Extension Chrome/Edge

Cette extension parcourt la page active et affiche tous les liens trouvés, regroupés par catégorie : liens internes, liens externes, emails, téléchargements et images.

Principales fonctionnalités
- Regroupement des liens internes et externes.
- Détection heuristique des liens cassés (HEAD, timeout 5s) — comportement conservateur pour éviter les faux positifs.
- Détection des emails (`mailto:` et adresses en texte clair).
- Marquage des liens de téléchargement (Content-Disposition ou extension connue).
- Grille d'images (vignettes 100×100) avec fond non blanc pour rendre visibles les images blanches.
- Ouvrir les images en arrière-plan et afficher une bulle (toast) confirmant l'ouverture.
- Popover injecté dans la page pour pointer/encadrer l'élément ciblé.

Limitations et notes techniques
- Les vérifications HEAD sont best-effort : à cause du CORS, un échec de fetch n'est pas systématiquement considéré comme "cassé".
- Le positionnement du popup d'extension est contrôlé par le navigateur — pour un positionnement précis, l'extension injecte un popover directement dans la page.

Installation et développement
1. Ouvrir `chrome://extensions/` ou `edge://extensions/`.
2. Activer "Mode développeur".
3. Cliquer sur "Charger l'extension non empaquetée" et sélectionner le dossier du projet (racine du dépôt).
4. Ouvrir une page web, cliquer sur l'icône de l'extension pour ouvrir le popup.

Remarques pour les développeurs
- Permissions requises (voir `manifest.json`): `scripting`, `activeTab`.
- Après modification des fichiers sources, recharger l'extension sur la page `chrome://extensions/` puis recharger l'onglet test.