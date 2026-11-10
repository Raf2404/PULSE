# PULSE

> Ta montre mesure, PULSE t'explique quoi faire aujourd'hui.

Coach santé perso façon Whoop, à partir des données d'Apple Santé. Site statique (HTML, CSS, JavaScript) :
aucun serveur, aucun compte, aucune donnée envoyée ailleurs. Tout est calculé et stocké sur ton téléphone.

La spécification complète est dans [`docs/SPEC.md`](docs/SPEC.md) (la section 0 résume les choix actuels).

## Mettre en ligne sur Netlify (gratuit)

1. Sur [app.netlify.com](https://app.netlify.com), **Add new site → Import an existing project → GitHub**, puis choisis ce dépôt.
2. Netlify lit `netlify.toml` tout seul : dossier publié `site`, aucune commande de build. Clique sur **Deploy**.
3. Ouvre l'adresse `https://<nom>.netlify.app` dans **Safari** sur l'iPhone, puis **Partager → Sur l'écran d'accueil**.

Chaque `git push` sur `main` redéploie le site automatiquement.

## Développer

Le site n'a besoin d'aucune installation pour tourner. Les outils de dev (tests, contrôle des types) demandent Node 22 :

```bash
npm install
```

```bash
npm run serve
```

Puis ouvre http://localhost:8080.

```bash
npm run check
```

Contrôle des types (JSDoc + TypeScript) et tests unitaires (`node --test`).

```bash
node scripts/smoke.mjs --shots
```

Test de bout en bout dans un navigateur au format iPhone (Playwright requis), captures dans `screenshots/`.

## Organisation

```
site/        le site publié (index.html, css/, js/, icons/, fonts/, sw.js, manifest)
tests/       tests unitaires
scripts/     outils de dev : icônes, écrans de lancement, test de bout en bout
docs/        cahier des charges
```

PULSE n'est pas un dispositif médical : les scores sont indicatifs.

Polices Inter et Space Grotesk (SIL Open Font License), icônes [Lucide](https://lucide.dev) (ISC).
