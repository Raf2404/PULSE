# PULSE — règles du projet

- La spécification complète est dans docs/SPEC.md : la lire avant toute tâche.
  La section 0 (décisions du 10 nov. 2026) prime sur le reste du document.
- On avance phase par phase (roadmap révisée de la section 0). Ne pas coder une phase future sans demande.
- Site statique : HTML + CSS + JavaScript en modules ES, sans build, déployé sur Netlify.
  Aucun service payant. Les données de santé restent dans le navigateur (IndexedDB).
  Exceptions serveur (netlify/functions, gratuites) : les rappels push (abonnement + heures de
  rappel, jamais de données de santé) et la boîte de synchro automatique (/api/sync/<secret>) où le
  raccourci iOS dépose les mesures récentes : relevées puis supprimées par l'app, effacées après 48 h.
- JS typé en JSDoc (`// @ts-check`). Pas de dépendance npm à l'exécution côté site : une lib
  indispensable est copiée dans site/js/vendor/ avec sa licence (fflate, SDK Anthropic empaqueté).
  Les fonctions Netlify ont leurs dépendances (web-push, @netlify/blobs) dans package.json.
- Coach IA : claude-sonnet-5-5 (chat + outils), claude-haiku-5-5 (brief, bilan), via le SDK
  empaqueté, clé de l'utilisateur stockée sur son appareil. Jamais de prénom ni d'identifiant
  dans ce qui est envoyé à l'IA (voir coach/context.js).
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
- `node scripts/update-sw.mjs` : après l'ajout d'un fichier au site (liste hors ligne du service worker ;
  un test échoue si on l'oublie).
- `node scripts/vendor-anthropic.mjs` : ré-empaquette le SDK Anthropic après une mise à jour.
- `node scripts/make-test-export.mjs <fichier.zip>` : faux export Apple Santé (tests d'import).
