# PULSE

> Ta montre mesure, PULSE t'explique quoi faire aujourd'hui.

Coach santé perso façon Whoop, à partir des données d'Apple Santé (Apple Watch, Garmin, Withings, Oura…).
Site statique (HTML, CSS, JavaScript) installable sur l'iPhone. Les données de santé restent sur ton téléphone.

La spécification complète est dans [`docs/SPEC.md`](docs/SPEC.md) (la section 0 résume les choix actuels).

## Ce que fait PULSE

- **Aujourd'hui** : récupération, sommeil et effort en 3 anneaux, brief du matin, effort cible, séance du jour adaptée,
  métriques (VFC, FC repos, respiration, température, SpO2, pas) avec tendance 30 jours, alerte de dérive, stress, XP.
- **Sommeil** : score en 4 piliers, hypnogramme, besoin personnalisé, heure de coucher conseillée, dette et plan de
  rattrapage, régularité, journal du soir et ce qui pèse sur TON sommeil, historique.
- **Sport** : séances et zones cardio, charge aiguë/chronique, records, programmes sur mesure de 4 à 12 semaines
  ajustés chaque matin à ta récupération, bibliothèque d'exercices.
- **Coach** : coach IA (avec ta propre clé API Claude) qui connaît tes 30 derniers jours, ou coach à règles sans clé.
- **Level up** : XP pour les comportements sains, niveaux et rangs, séries avec joker, badges, défis, attributs.
- **Extras** : respiration guidée, rapport mensuel PDF, synchro par Raccourcis, rappels, thème clair, cycle, nutrition.

## Mettre en ligne sur Netlify (gratuit)

1. Sur [app.netlify.com](https://app.netlify.com), **Add new site → Import an existing project → GitHub**, choisis ce dépôt.
2. Netlify lit `netlify.toml` : dossier publié `site`, pas de build, fonctions de rappels dans `netlify/functions`. **Deploy**.
3. Ouvre `https://<nom>.netlify.app` dans **Safari** sur l'iPhone, puis **Partager → Sur l'écran d'accueil**.

Chaque `git push` sur `main` redéploie le site.

## Coach IA (facultatif)

Crée une clé sur [console.anthropic.com](https://console.anthropic.com) (compte séparé de l'abonnement Claude, payant à
l'usage ; fixe une limite de dépense), puis colle-la dans **Profil → Coach IA** et coche le consentement. La clé reste sur
ton téléphone ; seuls des résumés chiffrés, sans prénom, partent vers l'API Claude.

## Rappels (facultatif)

Sur iPhone (iOS 16.4+), installe d'abord PULSE sur l'écran d'accueil, puis **Profil → Notifications**. Le petit service de
rappels du site (fonctions Netlify gratuites) ne connaît que les heures de rappel, jamais tes données de santé.

## Développer

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

Parcours complet dans un navigateur au format iPhone (Playwright requis), captures dans `screenshots/`.

## Organisation

```
site/              le site publié (index.html, css/, js/, icons/, fonts/, sw.js, manifest)
  js/scoring/      moteur de scores (fonctions pures, poids dans config.js)
  js/import/       import export.zip (worker) et Raccourcis
  js/coach/        coach IA et coach à règles
  js/views/        écrans
netlify/functions/ rappels push (abonnement + envoi planifié)
tests/             tests unitaires
scripts/           outils de dev
docs/              cahier des charges
```

PULSE n'est pas un dispositif médical : les scores sont indicatifs.

Polices Inter et Space Grotesk (SIL Open Font License), icônes [Lucide](https://lucide.dev) (ISC),
[fflate](https://github.com/101arrowz/fflate) (MIT), SDK Anthropic (MIT).
