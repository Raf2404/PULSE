# PULSE — règles du projet

- La spécification complète est dans docs/SPEC.md : la lire avant toute tâche.
  La section 0 (décisions du 10 nov. 2026) prime sur le reste du document.
- On avance phase par phase (roadmap révisée de la section 0). Ne pas coder une phase future sans demande.
- Site statique : HTML + CSS + JavaScript en modules ES, sans build, déployé sur Netlify.
  Aucun serveur, aucun service payant. Les données restent dans le navigateur (IndexedDB).
- JS typé en JSDoc (`// @ts-check`). Pas de dépendance npm à l'exécution : une lib indispensable
  est copiée dans js/vendor/ avec sa licence.
- Tout calcul de score vit dans js/scoring/, en fonctions pures testées (`node --test`).
- Les poids et seuils des scores sont dans js/scoring/config.js, jamais en dur.
- Aucune clé secrète dans le dépôt.
- UI : tokens de couleur de la section 6, animations CSS / Web Animations API,
  respect de prefers-reduced-motion.
- Interface et textes en français, ton simple, sans jargon par défaut.
- Jamais de vocabulaire de diagnostic médical dans l'app ni dans les réponses du coach.
- Toujours vérifier en mode démo avant de dire qu'une fonctionnalité est finie.
- Politique de sécurité stricte (netlify.toml) : pas de script ni de style en ligne, pas d'attribut
  `style="…"` dans le HTML généré ; passer par des classes ou `el.style.setProperty()`.

## Commandes

- `npm run check` : contrôle des types + tests unitaires (à lancer avant chaque commit).
- `node scripts/smoke.mjs --shots` : test de bout en bout au format iPhone, captures dans screenshots/.
- `npm run serve` : site en local sur http://localhost:8080.
- `node scripts/build-icons.mjs` : après ajout d'une icône Lucide dans la liste du script.
- `node scripts/make-icons.mjs` : régénère icônes PNG et écrans de lancement depuis site/icons/icon.svg.
- Si un fichier est ajouté au site, l'ajouter aussi à la liste SHELL de site/sw.js (mode hors ligne).
