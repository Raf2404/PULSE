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
