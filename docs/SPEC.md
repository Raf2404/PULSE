# Cahier des charges — App coach santé (type Whoop)

> Version du 10 nov. 2026 · auteur : Rafaël · nom de code **PULSE** (provisoire)

## 0. Décisions qui remplacent la spec d'origine (10 nov. 2026)

**Cette section prime sur tout le reste du document.** Les sections 2, 3, 7, 8 et 9 décrivent la version « grand public » d'origine ; elles restent comme référence pour plus tard.

- **Usage perso, 0 € de coût.** Pas de Supabase, pas de serveur, pas de compte, pas de compte Apple Developer payant.
- **Site statique HTML + CSS + JavaScript**, sans étape de build, hébergé gratuitement sur **Netlify** (déploiement depuis le dépôt Git).
- **Données stockées uniquement dans le navigateur** (IndexedDB) sur l'appareil de l'utilisateur. Rien ne part sur un serveur. Le site s'installe sur l'écran d'accueil de l'iPhone (PWA) pour que Safari ne vide pas les données.
- **Accès à Apple Santé, gratuit :**
  - **Voie A — import de `export.zip`** depuis l'app Santé, traité entièrement dans le navigateur (dézippage + XML en streaming dans un Web Worker, seuls les ~120 derniers jours sont gardés).
  - **Voie Raccourcis (à prototyper)** : un Raccourci iOS gratuit lit les données de la veille dans Santé et ouvre PULSE avec ces données dans le fragment d'URL (`#import=…`, jamais envoyé au serveur). Peut être déclenché par une automatisation (ex. à l'arrêt du réveil).
  - Les voies B (app tierce payante) et C (app compagnon) sont abandonnées pour l'instant.
- **Clé de dédoublonnage des mesures** : type + début + **fin** + source (la section 7 ne prévoyait pas la fin ; deux mesures distinctes peuvent démarrer au même instant).
- **Moteur de scores** (section 5) inchangé, en fonctions JS pures testées avec `node --test`.
- **XP calculée localement** (usage perso, pas d'enjeu de triche).
- **Coach IA = clé API Claude personnelle** : l'utilisateur colle sa propre clé dans les réglages ; elle est stockée uniquement sur son appareil et les appels partent directement du navigateur vers `api.anthropic.com` (usage perso, coût à l'usage). Jamais de clé dans le dépôt. Sans clé, l'app reste utilisable (scores et conseils à règles).

### Arborescence cible

```
pulse/
├─ site/                      seul dossier publié par Netlify
│  ├─ index.html              app (5 onglets)
│  ├─ manifest.webmanifest, sw.js, icons/, fonts/
│  ├─ css/tokens.css, css/app.css
│  └─ js/
│     ├─ app.js               navigation et rendu
│     ├─ ui/                  icônes, anneaux, composants d'écran
│     ├─ scoring/             fonctions pures + config.js (poids et seuils)
│     ├─ data/                db.js (IndexedDB), schema.js (format commun), demo.js (générateur 90 j)
│     ├─ import/              worker d'import export.zip
│     └─ vendor/              petites libs copiées en fichier (ex. fflate pour le zip)
├─ tests/                     *.test.js (node --test)
├─ scripts/                   outils de dev (icônes, captures, test de fumée)
├─ netlify.toml               publie site/, en-têtes de sécurité, pas de build
└─ docs/SPEC.md, CLAUDE.md
```

### Roadmap révisée (état au 10 nov. 2026)

- **Phase 0 — Fondations** : fait.
- **Phase 1 — Données + scores** : fait. Import `export.zip` (worker + dézippage en flux), moteur de scores complet, écrans Aujourd'hui / Sommeil / Sport, onboarding en 5 écrans.
- **Phase 2 — Coach + Level up** : fait. Coach IA (clé perso), coach à règles sans clé, brief du matin et bilan hebdo, programmes + séance du jour adaptative + bibliothèque, XP / niveaux / rangs / séries / badges / défis / attributs / level up, journal du soir + corrélations, notifications push.
- **Phase 3 — Synchro Raccourcis** : fait. Synchro automatique quotidienne par raccourci iOS et boîte aux lettres du site (à valider sur iPhone), import collé en secours, moniteur de stress, respiration guidée, rapport mensuel PDF (impression).
- **Phase 4 — Extensions** : nutrition simple (hydratation, protéines) et cycle menstruel faits. Hors périmètre « site statique gratuit » : widgets iOS (app native), mode amis / ligue (comptes et serveur), Android / Health Connect (app native).

### Choix faits pendant le développement

- **Notifications** : une PWA sur iPhone ne reçoit de rappel programmé que par Web Push, qui exige un serveur. Exception assumée à « aucun serveur » : deux **fonctions Netlify gratuites** (`netlify/functions`) stockent l'abonnement et les heures de rappel (Netlify Blobs) et envoient les push. Elles ne reçoivent **jamais** de données de santé. Clés VAPID générées au premier appel, gardées côté serveur.
- **Synchro automatique (Phase 3, choisie le 10 nov. 2026)** : un raccourci iOS (automatisation à l'arrêt du réveil) envoie les mesures des 2 derniers jours à une « boîte aux lettres » du site (`/api/sync/<code secret>`, fonction Netlify + Netlify Blobs). PULSE la relève à l'ouverture, importe, puis fait supprimer les dépôts ; ce qui n'est pas relevé s'efface après 48 h. Le code secret (256 bits) est généré par l'app ; le serveur n'en stocke qu'une empreinte. Exception assumée par l'utilisateur : les mesures de la nuit transitent quelques heures par son compte Netlify. Le lien `#import=` reste possible mais s'ouvre dans Safari, dont le stockage est séparé de l'app installée.
- **Coach IA** : Claude Sonnet 5.5 (`claude-sonnet-5-5`) pour le chat avec outils, Claude Haiku 5.5 (`claude-haiku-5-5`) pour le brief et le bilan. SDK officiel empaqueté dans `site/js/vendor/anthropic.js` (chargé à la demande). Repli côté serveur activé (`fallbacks: "default"`). Limite de 60 échanges IA par jour. Le prénom n'est jamais envoyé.
- **Cache du « brief » et du « bilan »** : générés une fois par jour / par semaine à l'ouverture de l'app (pas de cron serveur).
- **Corrélations** : affichées seulement si au moins 5 soirs avec le facteur et une taille d'effet (d de Cohen) ≥ 0,5 ; récupération et sommeil exprimés en points, VFC en %.
- **FC repos** : nocturne (moyenne des 20 % de mesures les plus basses pendant le sommeil), repli sur la FC repos d'Apple sans nuit.
- **Dette de sommeil** : manque par rapport au besoin de base (+ ajustement effort), ±1 h par nuit, une nuit longue rembourse.
- **Effort cible** : fourchettes exactes du tableau 5.4, avec un point à viser interpolé.
- **Cycle** : en phase lutéale, compensation de la FC repos (z −0,5), de la VFC (z +0,3) et +0,3 °C de tolérance sur la température.

### Précisions sur les formules

- **XP (5.6)** : `100 × n^1,5` est l'XP **cumulée** pour atteindre le niveau n (c'est ce que donnent les chiffres d'exemple).
- **`z_sommeil` (5.2)** : écart standardisé du score sommeil de la nuit par rapport à sa moyenne sur 30 jours.

## 1. Vision et objectifs

**Nom de code : PULSE** (provisoire). Une app web qui fait ce que fait Whoop, mais sans bracelet imposé : elle lit les données déjà présentes dans Apple Santé, quelle que soit la montre qui les écrit, et les transforme en scores clairs et en coaching IA personnalisé.

**Promesse en une phrase :** « Ta montre mesure, PULSE t'explique quoi faire aujourd'hui. »

### Objectifs produit

- Donner chaque matin **3 scores lisibles en 2 secondes** : Récupération, Sommeil, Effort.
- Transformer les données brutes en **recommandations concrètes** (intensité du jour, heure de coucher idéale, séance proposée).
- Offrir un **coach IA** qui connaît l'historique de l'utilisateur et répond en langage naturel.
- Rendre la progression **ludique** grâce à un système de niveaux, d'XP, de séries et de badges.
- Rester **compatible avec toutes les montres** qui synchronisent vers Apple Santé.

### Cible

- Sportifs amateurs à intermédiaires (muscu, course, vélo, sports co).
- Personnes qui veulent mieux dormir et comprendre leur fatigue.
- Possesseurs de montres non-Whoop qui veulent l'expérience Whoop sans abonnement matériel.

### Principes de conception (à respecter partout)

1. **Simple en surface, profond en dessous** : chaque écran montre 1 information clé ; le détail s'ouvre au tap.
2. **Toujours une action** : chaque score est accompagné d'un conseil (« fais une séance légère », « couche-toi avant 23 h 10 »).
3. **Zéro jargon par défaut** : la VFC devient « ta batterie nerveuse », avec la valeur technique accessible en détail.
4. **Mobile d'abord** : pensée pour iPhone (PWA installable), utilisable aussi sur ordinateur.
5. **Motivant, jamais culpabilisant** : un mauvais score donne un plan de rattrapage, pas un reproche.

## 2. Récupération des données Apple Santé

**Contrainte clé : une app web seule ne peut pas lire Apple Santé.** HealthKit n'est accessible que depuis une app iOS native installée sur l'iPhone. Il faut donc un petit « pont » natif qui lit HealthKit et envoie les données au serveur ; l'app web les affiche ensuite partout.

### Trois voies d'accès (à construire dans cet ordre)

| Voie | Comment ça marche | Avantages | Limites | Phase |
|---|---|---|---|---|
| A. Import manuel | L'utilisateur exporte ses données depuis l'app Santé (Profil › Exporter toutes les données) et dépose le fichier `export.zip` dans l'app web | Zéro app native, parfait pour tester les algos avec de vraies données | Pas de temps réel, fichier lourd (parfois plusieurs centaines de Mo) | MVP |
| B. Pont via app tierce | Une app iOS d'export automatique (type Health Auto Export) envoie les données en JSON vers un webhook de PULSE | Sync automatique sans développer d'app iOS | Dépend d'une app payante tierce, à vérifier | MVP+ |
| C. App compagnon PULSE | Mini app iOS (Expo + bibliothèque HealthKit) qui demande les autorisations et synchronise en arrière-plan | Expérience pro, temps quasi réel, publiable sur l'App Store | Compte développeur Apple nécessaire, revue App Store | V1 |

Le parseur de données doit être **commun aux trois voies** : chaque source produit le même format interne (voir section 7).

### Données HealthKit à lire

| Domaine | Types HealthKit | Utilisé pour |
|---|---|---|
| Cœur | Fréquence cardiaque, FC au repos, VFC (HRV SDNN), FC de marche | Récupération, effort, zones cardio |
| Sommeil | Analyse du sommeil (au lit, endormi, phases Core/Profond/REM/Éveil) | Score sommeil, dette, régularité |
| Respiration | Fréquence respiratoire, SpO2 | Récupération, alerte maladie |
| Température | Température au poignet pendant le sommeil (si dispo) | Détection de dérive (stress, maladie, cycle) |
| Activité | Pas, énergie active, minutes d'exercice, heures debout | Score effort, objectifs |
| Entraînements | Workouts (type, durée, calories, distance, FC) | Historique sport, charge d'entraînement |
| Forme | VO2 max, poids, % masse grasse | Progression long terme |
| Bien-être | Minutes de pleine conscience, humeur (iOS 17+) | Corrélations stress / sommeil |

**À noter :** Apple stocke la VFC en **SDNN**, alors que Whoop utilise le **RMSSD**. Les scores PULSE doivent donc se baser sur la tendance personnelle de l'utilisateur, pas sur des seuils copiés de Whoop.

### Compatibilité montres

Toute montre dont l'app écrit dans Apple Santé fonctionne : Apple Watch (données les plus complètes), Garmin, Withings, Polar, Suunto, Coros, Amazfit/Zepp, Oura (bague). La richesse varie selon la marque : l'app doit **détecter les données disponibles** et adapter les scores (ex. pas de VFC nocturne → score de récupération simplifié, signalé par un badge « précision réduite »).

**Question ouverte :** vérifier pour chaque marque quelles métriques sont réellement envoyées à Apple Santé (certaines n'envoient pas la VFC ni les phases de sommeil). Fitbit et Samsung ne synchronisent pas nativement avec Apple Santé.

**Plus tard (Android) :** Health Connect joue le même rôle que HealthKit ; l'architecture « pont natif → serveur → web » permet de l'ajouter sans toucher à l'app web.

## 3. Architecture technique et stack

**Une base de code TypeScript unique (monorepo)** : l'app web Next.js, le serveur Supabase et la future app compagnon Expo partagent les mêmes types et le même moteur de calcul des scores.

| Couche | Choix recommandé | Rôle |
|---|---|---|
| Front web | Next.js (App Router) + TypeScript | App web + PWA installable sur iPhone |
| UI | Tailwind CSS + shadcn/ui + Lucide icons | Composants propres et cohérents |
| Animations | Motion (ex-Framer Motion) + Lottie pour les célébrations | Transitions, anneaux animés, level up |
| Graphiques | Recharts (ou visx pour les visuels sur mesure) | Courbes, hypnogramme, barres |
| Backend | Supabase : Postgres, Auth, Storage, Edge Functions, Cron | Données, comptes, calcul quotidien des scores |
| Sécurité données | Row Level Security Postgres | Chaque utilisateur ne voit que ses données |
| IA | API Claude (Anthropic) : modèle Sonnet pour le coach, Haiku pour les résumés rapides | Coach, analyses, génération de programmes |
| App compagnon (V1) | Expo (React Native) + bibliothèque HealthKit (ex. `@kingstinct/react-native-healthkit`) | Lecture HealthKit + sync en arrière-plan |
| Parsing import | Parseur XML en streaming (ex. `sax`) dans un Web Worker | Lire `export.xml` sans bloquer le navigateur |
| Notifications | Web Push (PWA iOS 16.4+) puis push natif via l'app compagnon | Rappel coucher, résumé du matin |
| Hébergement | Vercel (web) + Supabase (données, région UE) | Déploiement simple |
| Tests | Vitest (moteur de scores) + Playwright (parcours clés) | Fiabilité des calculs |

### Règles d'architecture

- **Moteur de scores = package pur (`packages/scoring`)** : fonctions sans effet de bord, testées avec des jeux de données fictifs. Aucun calcul de score dans les composants React.
- **La clé API Claude ne va jamais côté client** : tous les appels IA passent par une Edge Function / route serveur.
- **Calcul quotidien automatique** : un cron recalcule les scores à chaque nouvelle nuit synchronisée, puis génère le « brief du matin » IA.
- **Mode démo** : un jeu de 90 jours de données fictives réalistes pour développer et montrer l'app sans montre.

### Flux de données

```
Montres connectées (Apple Watch, Garmin, Oura…)
        │
        ▼
Apple Santé (HealthKit sur l'iPhone)
        │
  ┌─────┼──────────────────────┐
  ▼     ▼                      ▼
A · Import manuel   B · App d'export tierce   C · App compagnon PULSE
export.zip (MVP)    webhook JSON automatique  Expo, sync en arrière-plan
  └─────┬──────────────────────┘
        ▼
Ingestion serveur — format commun validé par Zod, dédoublonnage
        │
        ▼
Base Supabase (UE) — mesures, nuits, séances, RLS  ⇄  Moteur de scores (cron à chaque nouvelle nuit)
        │ scores, historique                              │ brief du matin, bilan hebdo
        ▼                                                 ▼
App web PWA (Aujourd'hui, Sommeil, Sport, Profil)  ⇄ chat ⇄  Coach IA (API Claude) — résumé compact + outils serveur
```

Les trois voies d'accès convergent vers une seule ingestion : l'app web et le coach ne lisent que la base, jamais Apple Santé directement.

## 4. Fonctionnalités

**Navigation : une barre d'onglets en bas, 5 entrées** — Aujourd'hui · Sommeil · Sport · Coach · Profil. Le coach IA est aussi accessible partout via un bouton flottant.

### 4.1 Aujourd'hui (accueil)

- **Trois anneaux animés** en haut : Récupération (0–100 %, vert/jaune/rouge), Sommeil (0–100), Effort (0–21, comme le Strain Whoop).
- **Le brief du matin** (IA, 2–3 phrases) : « Récupération 78 %. Ta VFC remonte après 3 jours bas. Feu vert pour ta séance jambes, vise un effort de 14. »
- **Effort cible du jour** : une jauge qui montre l'effort conseillé selon la récupération, et l'effort déjà fait.
- **Cartes métriques clés** (balayables) : VFC, FC repos, fréquence respiratoire, température, SpO2, pas — chacune avec sa flèche de tendance vs moyenne 30 jours.
- **Ma journée** : chronologie séances + sommeil + activités de la journée.
- **Barre XP** discrète : niveau actuel et progression vers le suivant.
- **Alerte intelligente** si dérive anormale (ex. FC repos +8 bpm et température en hausse → « Ton corps lutte peut-être contre quelque chose, journée calme conseillée »). Toujours formulée sans diagnostic médical.

### 4.2 Sommeil

- **Score sommeil** détaillé en 4 piliers : durée vs besoin, efficacité, régularité, qualité des phases.
- **Hypnogramme interactif** de la nuit (Éveil / REM / Core / Profond), répartition en %.
- **Besoin de sommeil personnalisé** : base + dette accumulée + effort de la veille.
- **Coach de coucher** : « Pour te réveiller à 7 h avec 100 % de besoin couvert, couche-toi à 22 h 50 » + rappel push.
- **Dette de sommeil** sur 7 jours, avec plan de rattrapage.
- **Régularité** : graphique des heures de coucher/lever sur 14 jours.
- **Journal du soir** (facultatif, 10 secondes) : caféine tardive, alcool, écrans, repas tardif, stress. L'IA calcule ensuite leur impact réel sur TON sommeil (« Les soirs avec alcool, ta VFC baisse de 18 % en moyenne »).
- **Historique** semaine / mois / année et comparaison de périodes.

### 4.3 Sport

- **Historique des séances** importées (type, durée, FC moyenne et max, zones cardio, calories, effort).
- **Charge d'entraînement** : charge aiguë (7 j) vs chronique (28 j), avec zone optimale / risque de surentraînement.
- **Zones cardio** personnalisées (basées sur FC max et FC repos).
- **Records et progression** : VO2 max, allure, volume hebdo, records personnels.
- **Créateur de programme sur mesure (IA)** : questionnaire court (objectif, niveau, jours dispo, matériel, blessures) → programme de 4 à 12 semaines, séance par séance.
- **Programme adaptatif** : chaque matin, la séance du jour est ajustée selon la récupération (récup rouge → version allégée proposée automatiquement).
- **Détail d'une séance** : exercices, séries, reps, repos, consignes ; case « fait » + ressenti (RPE 1–10).
- **Bibliothèque d'exercices** avec consignes courtes.

### 4.4 Coach IA (le cœur de l'app)

- **Chat avec le coach** qui a accès au contexte de l'utilisateur : profil, objectifs, 30 derniers jours de scores, séances, journal.
- **Questions rapides en un tap** : « Pourquoi je suis fatigué ? », « Je m'entraîne aujourd'hui ? », « Analyse ma semaine », « Améliore mon sommeil ».
- **Bilan hebdo automatique** (chaque lundi) : ce qui a marché, ce qui a baissé, 3 actions pour la semaine.
- **Détection de corrélations** : l'IA reçoit des statistiques pré-calculées (pas des données brutes) et les explique en langage simple.
- **Mémoire du coach** : il retient objectifs, blessures, préférences (« je déteste courir ») dans un profil modifiable par l'utilisateur.
- **Personnalité réglable** : Bienveillant · Direct · Sergent instructeur.
- **Garde-fous** : jamais de diagnostic médical ; renvoi vers un médecin si signaux inquiétants ; les chiffres cités viennent toujours des données, jamais inventés.
- **Cartes de réponse** : quand c'est utile, le coach répond avec un mini-graphique ou une séance cliquable, pas seulement du texte.

### 4.5 Level up (gamification)

- **XP** gagnée par des comportements sains, pas par la performance brute : nuit ≥ besoin (+50), coucher régulier ± 30 min (+30), séance du programme faite (+80), effort dans la cible du jour (+40), journal rempli (+10), repos respecté un jour rouge (+40).
- **Niveaux 1 à 50** avec courbe progressive et **rangs** : Rookie → Athlète → Pro → Élite → Légende.
- **Séries (streaks)** : jours consécutifs de sommeil régulier, semaines de programme complètes ; un « joker » par semaine pour ne pas perdre sa série.
- **Badges** : « Lève-tôt », « 7 nuits parfaites », « Mur des 10 000 pas », « Retour de blessure »…
- **Défis hebdo** proposés par le coach selon le point faible du moment (« Cette semaine : 5 couchers avant 23 h »).
- **Attributs du personnage** (style RPG) : Endurance, Force, Récupération, Discipline, qui montent selon les actions.
- **Animation de level up** plein écran (confettis, son léger, vibration) et carte partageable en story.

### 4.6 Profil et réglages

- Infos (âge, taille, poids, sexe, FC max), objectifs, sports pratiqués.
- Sources connectées et dernière synchronisation ; qualité des données par métrique.
- Notifications (brief du matin, rappel coucher, défi).
- Thème clair / sombre, unités.
- Export et suppression complète des données.

### 4.7 Fonctionnalités ajoutées (proposées)

| Fonctionnalité | Pourquoi | Phase |
|---|---|---|
| Onboarding en 5 écrans | Objectif, sports, connexion des données, choix du coach, premier score | MVP |
| Mode démo | Tester l'app sans montre | MVP |
| Moniteur de stress | FC et VFC en journée → niveau de stress + exercice de respiration guidé animé | V1 |
| Respiration guidée | Cercle animé 4-7-8 / cohérence cardiaque, compté en XP | V1 |
| Rapport mensuel PDF | Bilan propre à garder ou montrer à un coach | V1 |
| Widgets iOS | Scores du jour sur l'écran d'accueil (via l'app compagnon) | V2 |
| Mode amis / ligue | Classement d'XP entre amis, jamais sur les données de santé brutes | V2 |
| Nutrition simple | Hydratation et protéines, si l'utilisateur les saisit dans Apple Santé | V2 |
| Suivi du cycle menstruel | Ajuste récupération et effort selon la phase, si données dispo | V2 |

## 5. Algorithmes des scores

**Tous les scores comparent l'utilisateur à lui-même** (sa ligne de base glissante sur 30 jours), jamais à une norme générale. Les formules ci-dessous sont une **V1 réglable** : tous les poids et seuils vont dans un fichier de config pour être ajustés après tests réels.

### 5.1 Ligne de base et calibration

- Ligne de base = médiane et écart-type sur 30 jours glissants pour : VFC (en logarithme), FC repos, fréquence respiratoire, température.
- **Calibration** : scores affichés dès 4 nuits avec badge « calibration » ; précision complète à 14 nuits.
- Valeurs nocturnes uniquement pour la VFC et la FC repos (fenêtre de sommeil), pour éviter le bruit de la journée.

### 5.2 Score de récupération (0–100 %)

On calcule un écart standardisé (z) pour chaque métrique, puis une somme pondérée passée dans une sigmoïde :

```
S = 0,50·z_VFC − 0,25·z_FCrepos + 0,15·z_sommeil − 0,10·z_resp

Récupération = 100 / (1 + e^(−1,5·S))
```

- Couleurs : **vert ≥ 67**, **jaune 34–66**, **rouge ≤ 33**.
- Si la température dévie de plus de 0,5 °C de la base : malus de 10 points + alerte.
- Donnée manquante (ex. pas de VFC) : son poids est redistribué sur les autres, badge « précision réduite ».

### 5.3 Score de sommeil (0–100)

| Pilier | Poids | Calcul |
|---|---|---|
| Durée | 40 % | temps endormi ÷ besoin de sommeil, plafonné à 100 % |
| Efficacité | 20 % | temps endormi ÷ temps au lit (85 % et plus = maximum) |
| Régularité | 20 % | écart d'heure de coucher et de lever vs moyenne 7 j (0 min = 100, 90 min et plus = 0) |
| Phases | 20 % | part de sommeil profond (cible 13–23 %) et REM (cible 20–25 %) |

**Besoin de sommeil** du jour :

```
Besoin = Base + 0,25 × Dette_7j + Ajust_effort
```

- Base = 8 h par défaut, puis apprise (durée moyenne des nuits suivies d'une récupération verte).
- Dette plafonnée à +1 h par nuit ; ajustement effort de 0 à +45 min si l'effort de la veille dépasse 14.

### 5.4 Score d'effort (0–21)

Charge cardio de la journée en TRIMP d'Edwards (minutes passées dans chaque zone × poids de la zone, de 1 à 5), puis compression logarithmique, comme le Strain Whoop :

```
Effort = 21 × (1 − e^(−TRIMP / k)),  k ≈ 170
```

- Zones = % de la réserve cardiaque (méthode Karvonen) : Z1 50–60 %, Z2 60–70 %, Z3 70–80 %, Z4 80–90 %, Z5 90–100 %.
- k est à calibrer pour qu'une heure en zone 3 donne environ 13.

**Effort cible du jour** selon la récupération :

| Récupération | Effort conseillé | Message type |
|---|---|---|
| Vert (67–100) | 14 à 18 | « Journée idéale pour pousser » |
| Jaune (34–66) | 10 à 14 | « Entraîne-toi, mais sans viser de record » |
| Rouge (0–33) | 0 à 10 | « Mobilité, marche, repos actif » |

### 5.5 Charge d'entraînement

- Ratio charge aiguë / chronique = moyenne effort 7 j ÷ moyenne effort 28 j.
- **0,8–1,3 = zone optimale** ; au-dessus de 1,5 = alerte risque de blessure ; sous 0,8 = désentraînement.

### 5.6 Courbe d'XP

```
XP nécessaire pour le niveau n = 100 × n^1,5
```

XP cumulée : niveau 2 ≈ 280, niveau 10 ≈ 3 160, niveau 30 ≈ 16 400, niveau 50 ≈ 35 400. Avec environ 175 XP par jour pour un utilisateur régulier : niveau 10 en 3 semaines, niveau 30 en 3 mois, niveau 50 en 7 mois environ. Les premiers niveaux tombent vite pour accrocher, puis ça ralentit.

## 6. Design, UX et animations

**Direction artistique : sombre, premium, minimaliste**, dans l'esprit Whoop et Apple Fitness. Fond quasi noir, une seule couleur vive par score, beaucoup d'espace, des chiffres très grands.

### 6.1 Couleurs (tokens)

| Token | Valeur | Usage |
|---|---|---|
| `bg` | #0A0B0D | Fond principal |
| `surface` | #15171B | Cartes |
| `surface-2` | #1E2126 | Cartes survolées, champs |
| `text` | #F5F7FA | Texte principal |
| `text-muted` | #8A9099 | Texte secondaire |
| `recovery-green` | #16EC8E | Récupération verte |
| `recovery-yellow` | #FFD43B | Récupération jaune |
| `recovery-red` | #FF4D5E | Récupération rouge |
| `sleep` | #7B8CFF | Tout ce qui touche au sommeil |
| `strain` | #3FA9F5 | Effort / sport |
| `xp` | #B57BFF → #FF7BD5 (dégradé) | XP, niveaux, badges uniquement |

Un thème clair est prévu mais le sombre est le thème par défaut.

### 6.2 Typographie et formes

- Police : **Inter** (texte) + **Space Grotesk** ou **SF Pro Rounded** pour les grands chiffres de score.
- Tailles : score principal 56–72 px, titres 20 px, texte 15 px, légendes 12 px.
- Coins arrondis 20 px pour les cartes, 999 px pour les boutons et pastilles.
- Icônes Lucide, trait 1,75 px.

### 6.3 Animations (Motion)

| Élément | Animation | Durée |
|---|---|---|
| Anneaux de score | Se remplissent de 0 à la valeur + compteur qui défile | 1,2 s, ressort doux |
| Changement d'onglet | Glissement + fondu | 250 ms |
| Cartes | Apparition en cascade (décalage 40 ms) | 300 ms |
| Ouverture d'un détail | Expansion de la carte en plein écran (shared layout) | 350 ms |
| Gain d'XP | « +50 XP » qui monte et s'efface, barre qui se remplit | 800 ms |
| Level up | Plein écran : flash, confettis Lottie, nouveau rang, vibration | 2,5 s |
| Coach qui écrit | Texte en streaming + pulsation de l'avatar | continu |
| Respiration guidée | Cercle qui grossit / rétrécit au rythme de l'exercice | selon exercice |

- Respecter `prefers-reduced-motion` : animations remplacées par de simples fondus.
- Vibrations via l'API Vibration quand c'est supporté (et natif dans l'app compagnon).

### 6.4 Règles UX

- **Règle des 3 niveaux** : 1) le chiffre, 2) la phrase d'explication, 3) le détail technique au tap.
- Maximum **5 cartes visibles** par écran avant de scroller.
- Chaque graphique a un **titre qui dit la conclusion** (« Ta VFC remonte depuis 3 jours »), pas juste « VFC ».
- États vides soignés (calibration, pas de données, synchro en cours) avec illustration et action.
- Squelettes de chargement animés, jamais d'écran blanc.
- Accessibilité : contraste AA minimum, couleur jamais seule porteuse de sens (icône ou texte en plus).

## 7. Modèle de données (Postgres / Supabase)

**Deux niveaux de données** : les mesures brutes (beaucoup de lignes, rarement lues) et les résumés quotidiens (peu de lignes, lus partout). L'app et l'IA lisent presque uniquement les résumés.

| Table | Champs principaux | Rôle |
|---|---|---|
| `profiles` | id, prénom, date de naissance, sexe, taille, poids, fc_max, objectifs (json), coach_style, fuseau horaire | Profil utilisateur |
| `data_sources` | user_id, type (import / webhook / compagnon), appareil, dernière_synchro | Sources connectées |
| `samples` | user_id, type (hr, hrv, resp, spo2, temp, steps…), valeur, unité, début, fin, source | Mesures brutes, dédupliquées (index unique user + type + début + source) |
| `sleep_sessions` | user_id, début, fin, au_lit_min, endormi_min, profond_min, rem_min, core_min, éveil_min, segments (json) | Nuits reconstituées |
| `workouts` | user_id, type, début, fin, durée, calories, distance, fc_moy, fc_max, zones (json), effort | Séances |
| `daily_metrics` | user_id, date, vfc, fc_repos, resp, temp_delta, pas, score_recup, score_sommeil, score_effort, effort_cible, besoin_sommeil, dette_sommeil, qualité_données | Résumé du jour, utilisé partout |
| `baselines` | user_id, métrique, médiane, écart_type, nb_jours, mis_à_jour | Lignes de base 30 j |
| `journal_entries` | user_id, date, caféine, alcool, écrans, repas_tardif, stress, notes | Journal du soir |
| `programs` | user_id, titre, objectif, semaines, statut, plan (json) | Programmes IA |
| `program_sessions` | program_id, date_prévue, contenu (json), fait, rpe, version_allégée | Séances planifiées |
| `coach_messages` | user_id, rôle, contenu, cartes (json), créé_le | Historique du chat |
| `coach_memory` | user_id, clé, valeur, modifiable | Ce que le coach retient |
| `insights` | user_id, type (brief, bilan_hebdo, corrélation, alerte), date, contenu | Textes IA générés |
| `xp_events` | user_id, type, points, date, référence | Journal des gains d'XP |
| `user_progress` | user_id, xp_total, niveau, rang, attributs (json), streaks (json) | État de progression |
| `badges` / `user_badges` | code, nom, description, icône / user_id, code, obtenu_le | Badges |
| `challenges` | user_id, semaine, objectif (json), progression, statut | Défis hebdo |

- **Toutes les tables ont RLS activé** avec la règle `user_id = auth.uid()`.
- Les gains d'XP sont **calculés côté serveur uniquement** (impossible de tricher depuis le navigateur).
- Format d'échange commun aux 3 sources (import, webhook, compagnon) : un tableau d'objets `{ type, value, unit, start, end, source }` validé par un schéma **Zod**.

### Contexte envoyé au coach IA

L'IA ne reçoit jamais les données brutes. À chaque requête, le serveur construit un **résumé compact** (environ 2 000 tokens) :

1. Profil + objectifs + mémoire du coach.
2. Les 7 derniers `daily_metrics` en détail + moyennes 30 j.
3. Les 5 dernières séances + programme en cours.
4. Corrélations pré-calculées (ex. impact de l'alcool sur la VFC, en %).
5. Consignes système : style du coach, interdiction du diagnostic médical, obligation de ne citer que les chiffres fournis, réponse courte par défaut.

Le coach peut appeler des **outils** côté serveur (`get_metrics(période)`, `get_workouts(période)`, `create_program(...)`, `adjust_today_session(...)`, `save_memory(...)`) pour aller chercher plus de détail ou agir.

## 8. Sécurité, RGPD et données de santé

**Les données de santé sont des données « sensibles » au sens du RGPD** : consentement explicite obligatoire, sécurité renforcée, et l'utilisateur doit pouvoir tout exporter et tout supprimer. Pour un usage perso, c'est simple ; pour un lancement public, ces points deviennent obligatoires.

- [ ] Consentement explicite et séparé à l'onboarding (données de santé + traitement par l'IA), révocable dans les réglages.
- [ ] Hébergement des données en **UE** (projet Supabase en région européenne).
- [ ] RLS sur toutes les tables, clés secrètes uniquement côté serveur, HTTPS partout.
- [ ] Le fichier `export.zip` importé est traité puis **supprimé** du stockage (on ne garde que les données extraites).
- [ ] Données envoyées à l'IA : résumés chiffrés sans nom ni identifiant ; mentionner le sous-traitant IA dans la politique de confidentialité.
- [ ] Export complet (JSON/CSV) et suppression définitive du compte en un clic.
- [ ] Politique de confidentialité + mentions légales + CGU avant tout lancement public.
- [ ] Avertissement clair : **PULSE n'est pas un dispositif médical**, les scores sont indicatifs. Éviter tout vocabulaire de diagnostic (sinon risque de requalification en dispositif médical).
- [ ] App compagnon : respecter les règles App Store sur HealthKit (pas de revente, pas de pub ciblée avec ces données, usage déclaré).
- [ ] Limite d'appels IA par utilisateur et par jour (coûts + abus).

**À faire valider** par un juriste ou via la CNIL si l'app devient publique et payante.

## 9. Roadmap et instructions pour Claude Code

**On construit en 5 phases, chacune utilisable à la fin.** Ne jamais passer à la phase suivante tant que la précédente ne marche pas avec le mode démo ET avec un vrai export Apple Santé.

### Phase 0 — Fondations

- [ ] Monorepo (pnpm + Turborepo) : `apps/web`, `packages/scoring`, `packages/shared` (types + schémas Zod).
- [ ] Next.js + Tailwind + shadcn/ui + Motion, thème sombre avec les tokens de la section 6.
- [ ] Projet Supabase (région UE), auth par e-mail + Apple, migrations des tables de la section 7 avec RLS.
- [ ] Générateur de **90 jours de données démo** réalistes (bonnes et mauvaises nuits, séances, une période « malade »).
- [ ] PWA installable (manifest, icônes, écran de lancement).

### Phase 1 — MVP données + scores

- [ ] Import de `export.zip` (parseur XML en streaming dans un Web Worker, barre de progression).
- [ ] Moteur de scores (section 5) avec tests unitaires sur les données démo.
- [ ] Écrans Aujourd'hui, Sommeil, Sport (historique) avec anneaux et graphiques animés.
- [ ] Onboarding en 5 écrans.

### Phase 2 — Coach IA + Level up

- [ ] Route serveur du coach (API Claude en streaming, outils de la section 7, garde-fous).
- [ ] Brief du matin et bilan hebdo générés par cron.
- [ ] Créateur de programme sur mesure + séance du jour adaptative.
- [ ] XP, niveaux, rangs, streaks, badges, défis hebdo, animation de level up.
- [ ] Journal du soir + corrélations.
- [ ] Notifications Web Push (brief du matin, rappel coucher).

### Phase 3 — Synchro automatique

- [ ] Webhook d'ingestion pour une app d'export tierce (voie B).
- [ ] App compagnon Expo : autorisations HealthKit, sync en arrière-plan, envoi vers le même endpoint (voie C).
- [ ] Moniteur de stress + respiration guidée, rapport mensuel PDF.

### Phase 4 — Extensions

- [ ] Widgets iOS, mode amis / ligue XP, Android via Health Connect, cycle menstruel, nutrition simple.
