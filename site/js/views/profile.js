// @ts-check
/** Écran « Profil » : infos, objectifs, progression, coach IA, notifications, données, apparence. */
import { icon } from '../ui/icons.js';
import { header, cardHead, chips, segmented, toggle, xpBar, sectionTitle } from '../ui/components.js';
import { esc, num, longDate, shortDate } from '../ui/format.js';
import { S, AI_DAILY_LIMIT, todayKey } from '../state.js';
import { GOALS, SPORTS, COACH_STYLES, hrMaxOf, ageOf } from '../data/profile.js';
import { xpForLevel } from '../scoring/gamification.js';
import { CONFIG } from '../scoring/config.js';
import { mean } from '../scoring/stats.js';
import { localDateKey } from '../data/schema.js';

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || /** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone === true;
}

/** @param {string} href @param {string} iconName @param {string} title @param {string} sub @param {string} [tone] */
const linkCard = (href, iconName, title, sub, tone = '') => `<a class="card link-card reveal" href="${href}">${cardHead(iconName, title, { tone, sub, right: icon('chevron-right', { size: 20 }) })}</a>`;

export function renderProfile() {
  const p = S.profile;
  const head = header('profil', 'Profil');
  const pr = S.progress;
  const age = ageOf(p);
  return `${head}
    ${pr ? `<a class="card link-card xp-card reveal" href="#/profil/progression">
      <div class="xp-head"><span class="level-badge">${pr.level}</span><div><strong>${esc(p.firstName || 'Ton personnage')} · ${esc(pr.rank)}</strong><span class="note">${num(pr.xpTotal)} XP · ${pr.badges.filter((b) => b.earnedAt).length}/${pr.badges.length} badges</span></div>${icon('chevron-right', { size: 20 })}</div>
      ${xpBar(pr.ratio)}
    </a>` : ''}
    ${sectionTitle('Moi')}
    <form class="card form reveal" data-form="profile-info">
      ${cardHead('user-round', 'Mes infos', { sub: 'Pour tes zones cardio et ton besoin de sommeil' })}
      <div class="grid-2">
        <label class="field"><span class="field-label">Prénom</span><input name="firstName" maxlength="30" value="${esc(p.firstName)}" autocomplete="given-name"></label>
        <label class="field"><span class="field-label">Année de naissance</span><input name="birthYear" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${p.birthYear ?? ''}" placeholder="1994"></label>
        <label class="field"><span class="field-label">Sexe</span><select name="sex"><option value="">—</option>${[['f', 'Femme'], ['m', 'Homme'], ['x', 'Autre']].map(([v, l]) => `<option value="${v}" ${p.sex === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Taille (cm)</span><input name="heightCm" inputmode="numeric" value="${p.heightCm ?? ''}"></label>
        <label class="field"><span class="field-label">Poids (kg)</span><input name="weightKg" inputmode="decimal" value="${p.weightKg ?? ''}"></label>
        <label class="field"><span class="field-label">FC max</span><input name="hrMax" inputmode="numeric" value="${p.hrMax ?? ''}" placeholder="${hrMaxOf({ ...p, hrMax: null })} (estimée)"></label>
        <label class="field"><span class="field-label">Réveil visé</span><input name="wakeTime" type="time" value="${esc(p.wakeTime)}"></label>
        ${p.sex === 'f' || p.trackCycle ? `<label class="field"><span class="field-label">Cycle menstruel</span><select name="trackCycle"><option value="0">Ne pas en tenir compte</option><option value="1" ${p.trackCycle ? 'selected' : ''}>En tenir compte</option></select></label>` : ''}
      </div>
      <p class="note">${age ? `${age} ans · ` : ''}FC max utilisée : ${hrMaxOf(p)} bpm${p.hrMax ? '' : ' (formule 208 − 0,7 × âge)'}.</p>
      <button class="btn" type="submit">${icon('check', { size: 16 })}Enregistrer</button>
    </form>
    <form class="card form reveal" data-form="profile-goals">
      ${cardHead('target', 'Objectifs et sports')}
      ${chips({ name: 'goals', multiple: true, options: Object.entries(GOALS), selected: p.goals })}
      ${chips({ name: 'sports', multiple: true, options: Object.entries(SPORTS), selected: p.sports })}
      <button class="btn" type="submit">${icon('check', { size: 16 })}Enregistrer</button>
    </form>
    ${sectionTitle('Réglages')}
    ${linkCard('#/profil/coach', 'sparkles', 'Coach IA', `${COACH_STYLES[p.coachStyle].label} · ${S.apiKey ? (p.aiConsent ? 'IA active' : 'consentement requis') : 'pas de clé API'}`, 'xp')}
    ${linkCard('#/profil/notifications', 'bell', 'Notifications', S.notif.enabled ? 'Activées' : 'Désactivées')}
    ${linkCard('#/profil/donnees', 'database', 'Données et sources', S.mode === 'demo' ? 'Données démo' : S.lastImport ? `Dernier import : ${shortDate(localDateKey(S.lastImport.at))}` : 'Aucune donnée')}
    ${linkCard('#/rapport', 'file-text', 'Rapport mensuel', 'Bilan à garder ou montrer à un coach (PDF)')}
    <div class="card reveal">
      ${cardHead('settings', 'Apparence et unités')}
      <span class="field-label">Thème</span>
      ${segmented({ name: 'theme', value: p.theme, options: [['dark', 'Sombre'], ['light', 'Clair'], ['auto', 'Auto']], action: 'set-theme' })}
      <span class="field-label">Unités</span>
      ${segmented({ name: 'units', value: p.units, options: [['metric', 'km · kg'], ['imperial', 'mi · lb']], action: 'set-units' })}
    </div>
    ${standalone() ? '' : `<div class="card reveal">
      ${cardHead('smartphone', 'Installer sur l\'iPhone')}
      <ol class="steps"><li>Ouvre ce site dans <strong>Safari</strong>.</li><li>Touche ${icon('share', { size: 15 })} <strong>Partager</strong>.</li><li>Choisis <strong>Sur l'écran d'accueil</strong>.</li></ol>
      <p class="note">Installé, PULSE s'ouvre en plein écran, reçoit les notifications et Safari ne supprime plus tes données.</p>
    </div>`}
    <div class="card reveal">
      ${cardHead('shield-check', 'Confidentialité', { tone: 'green' })}
      <p>Tes données de santé restent dans ce navigateur, sur cet appareil. Aucun serveur PULSE ne les reçoit. Si tu actives le coach IA, seuls des résumés chiffrés (sans prénom ni identifiant) sont envoyés à l'API Claude d'Anthropic, avec ta propre clé.</p>
      <p class="note">PULSE n'est pas un dispositif médical : les scores sont indicatifs et ne remplacent pas l'avis d'un professionnel de santé.</p>
    </div>`;
}

export function renderProgression() {
  const head = header('profil', 'Progression', { back: '#/profil' });
  const pr = S.progress;
  if (!pr) return `${head}<div class="card reveal"><p>Ta progression apparaîtra dès que tu auras des données.</p></div>`;
  const attrs = /** @type {[keyof typeof pr.attributes, string, string][]} */ ([['endurance', 'Endurance', 'heart-pulse'], ['force', 'Force', 'dumbbell'], ['recuperation', 'Récupération', 'battery-medium'], ['discipline', 'Discipline', 'target']]);
  const nextRank = CONFIG.xp.ranks.find((r) => r.from > pr.level);
  const recent = [...pr.events].reverse().slice(0, 12);
  return `${head}
    <div class="card hero reveal">
      <span class="level-badge big">${pr.level}</span>
      <h2>${esc(pr.rank)}</h2>
      <p class="note">${num(pr.xpTotal)} XP · niveau ${pr.level + 1 > CONFIG.xp.maxLevel ? 'max' : `${pr.level + 1} à ${num(xpForLevel(pr.level + 1))} XP`}${nextRank ? ` · ${esc(nextRank.name)} au niveau ${nextRank.from}` : ''}</p>
      ${xpBar(pr.ratio)}
    </div>
    <div class="card reveal">
      ${cardHead('zap', 'Attributs', { tone: 'xp', sub: 'Ils montent avec tes actions' })}
      ${attrs.map(([k, label, ic]) => `<div class="attr">${icon(ic, { size: 16 })}<span>${label}</span><div class="pillar-track"><span class="pillar-fill f-xp" data-width="${Math.min(100, pr.attributes[k] * 4)}"></span></div><strong>${pr.attributes[k]}</strong></div>`).join('')}
    </div>
    <div class="card reveal">
      ${cardHead('flame', 'Séries', { tone: 'xp' })}
      <dl class="stat-list">
        <div><dt>Couchers réguliers</dt><dd>${pr.streaks.regularSleep.current} j (record ${pr.streaks.regularSleep.best})</dd></div>
        <div><dt>Joker de la semaine</dt><dd>${pr.streaks.regularSleep.jokerAvailable ? 'disponible' : 'utilisé'}</dd></div>
        <div><dt>Semaines de programme complètes</dt><dd>${pr.streaks.programWeeks.current} (record ${pr.streaks.programWeeks.best})</dd></div>
      </dl>
    </div>
    ${pr.challenge ? `<div class="card reveal">${cardHead('target', 'Défi de la semaine', { tone: 'xp', sub: `+${pr.challenge.reward} XP si réussi` })}
      <p class="lead">${esc(pr.challenge.title)}</p><p class="note">${esc(pr.challenge.why)}</p>
      <div class="pillar-track"><span class="pillar-fill f-xp" data-width="${((pr.challenge.progress / pr.challenge.target) * 100).toFixed(0)}"></span></div>
      <p>${pr.challenge.progress}/${pr.challenge.target}${pr.challenge.status === 'done' ? ' · réussi !' : ''}</p></div>` : ''}
    ${sectionTitle('Badges')}
    <div class="badges reveal">${pr.badges.map((b) => `<div class="badge-tile ${b.earnedAt ? 'earned' : 'locked'}" title="${esc(b.description)}">
      <span class="badge-icon">${icon(b.earnedAt ? b.icon : 'lock', { size: 22 })}</span><strong>${esc(b.name)}</strong><span class="note">${b.earnedAt ? esc(shortDate(b.earnedAt)) : esc(b.description)}</span></div>`).join('')}</div>
    ${sectionTitle('Derniers gains d\'XP')}
    <div class="card list reveal">${recent.map((e) => `<div class="list-row"><span class="list-main"><strong>${esc(e.label)}</strong><span class="note">${esc(longDate(e.date))}</span></span><span class="xp-pill">+${e.points}</span></div>`).join('')}</div>
    ${pr.pastChallenges.length ? `${sectionTitle('Défis passés')}<div class="card list reveal">${[...pr.pastChallenges].reverse().slice(0, 8).map((c) => `<div class="list-row"><span class="list-main"><strong>${esc(c.title.replace('Cette semaine : ', ''))}</strong><span class="note">Semaine du ${esc(shortDate(c.week))}</span></span><span class="badge ${c.status === 'done' ? 'ok' : ''}">${c.status === 'done' ? 'Réussi' : `${c.progress}/${c.target}`}</span></div>`).join('')}</div>` : ''}`;
}

export function renderCoachSettings() {
  const head = header('profil', 'Coach IA', { back: '#/profil' });
  const p = S.profile;
  const masked = S.apiKey ? `${S.apiKey.slice(0, 10)}…${S.apiKey.slice(-4)}` : '';
  return `${head}
    <div class="card reveal">
      ${cardHead('sparkles', 'Personnalité', { tone: 'xp' })}
      <div class="choice-list">${Object.entries(COACH_STYLES).map(([k, v]) => `<label class="choice"><input type="radio" name="coachStyle" value="${k}" ${p.coachStyle === k ? 'checked' : ''} data-change="coach-style"><span><strong>${esc(v.label)}</strong><span class="note">${esc(v.hint)}</span></span></label>`).join('')}</div>
    </div>
    <form class="card form reveal" data-form="api-key">
      ${cardHead('key', 'Ta clé API Claude', { tone: 'xp', sub: S.apiKey ? `Clé enregistrée : ${esc(masked)}` : 'Facultatif · payant à l\'usage' })}
      <p>Le coach utilise Claude Sonnet 5.5 pour discuter et Claude Haiku 5.5 pour le brief du matin et le bilan hebdo. Crée une clé sur <strong>console.anthropic.com</strong> (compte séparé de l'abonnement Claude), puis colle-la ici.</p>
      <label class="field"><span class="field-label">Clé API</span><input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <div class="actions row">
        <button class="btn primary" type="submit">${icon('check', { size: 16 })}Vérifier et enregistrer</button>
        ${S.apiKey ? `<button class="btn danger" type="button" data-action="remove-key">${icon('trash-2', { size: 16 })}Retirer</button>` : ''}
      </div>
      <p class="note">La clé est stockée uniquement dans ce navigateur. Les appels partent directement de ton téléphone vers l'API d'Anthropic. Limite de sécurité : ${AI_DAILY_LIMIT} échanges par jour (${S.aiUsage.date === todayKey() ? S.aiUsage.count : 0} aujourd'hui). Pense à fixer une limite de dépense dans la console Anthropic.</p>
    </form>
    <div class="card reveal">
      ${toggle({ name: 'aiConsent', checked: p.aiConsent, label: 'J\'accepte l\'envoi de résumés chiffrés à l\'IA', hint: 'Moyennes, scores et séances, sans prénom ni identifiant. Révocable à tout moment.', action: 'ai-consent' })}
      <p class="note">Sous-traitant : Anthropic (API Claude). Sans ce consentement, le coach reste en mode « à règles » et rien n'est envoyé.</p>
    </div>
    <div class="card reveal">
      ${cardHead('brain', 'Mémoire du coach', { tone: 'xp', sub: 'Ce que ton coach retient de toi' })}
      ${S.memory.length ? `<div class="list">${S.memory.map((m) => `<div class="list-row"><span class="list-main"><strong>${esc(m.key)}</strong><span class="note">${esc(m.value)}</span></span><button class="icon-btn" data-action="memory-delete" data-key="${esc(m.key)}" aria-label="Oublier ${esc(m.key)}">${icon('trash-2', { size: 18 })}</button></div>`).join('')}</div>` : '<p class="note">Rien pour l\'instant. Dis par exemple au coach : « je déteste courir » ou « genou gauche fragile ».</p>'}
      <form class="inline-form" data-form="memory-add">
        <input name="key" maxlength="60" placeholder="Sujet (ex. blessure)" aria-label="Sujet">
        <input name="value" maxlength="300" placeholder="Détail" aria-label="Détail">
        <button class="btn small" type="submit">${icon('plus', { size: 16 })}Ajouter</button>
      </form>
    </div>`;
}

export function renderNotifications() {
  const head = header('profil', 'Notifications', { back: '#/profil' });
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const n = S.notif;
  return `${head}
    <div class="card reveal">
      ${cardHead('bell', 'Rappels', { sub: supported ? (Notification.permission === 'denied' ? 'Bloquées dans les réglages du téléphone' : n.enabled ? 'Activées sur cet appareil' : 'Désactivées') : 'Non disponibles ici' })}
      ${supported ? '' : '<p>Sur iPhone, les notifications fonctionnent quand PULSE est <strong>installé sur l\'écran d\'accueil</strong> (iOS 16.4 ou plus récent). Installe-le puis reviens ici.</p>'}
      ${toggle({ name: 'enabled', checked: n.enabled, label: 'Activer les notifications', action: 'notif-enable' })}
      ${toggle({ name: 'bedtime', checked: n.bedtime, label: 'Rappel coucher', hint: '30 min avant ton heure de coucher conseillée', action: 'notif-bedtime' })}
      ${toggle({ name: 'challenge', checked: n.challenge, label: 'Défi de la semaine', hint: 'Le lundi matin', action: 'notif-challenge' })}
      <label class="field"><span class="field-label">Brief du matin à</span><input type="time" name="briefTime" value="${esc(n.briefTime)}" data-change="notif-brief-time"></label>
      <button class="btn small" data-action="notif-test" ${n.enabled ? '' : 'disabled'}>${icon('bell', { size: 16 })}Envoyer une notification de test</button>
      <p class="note">Les rappels passent par un petit service gratuit de ton site Netlify : il ne connaît que les heures de rappel, jamais tes données de santé.</p>
    </div>`;
}

export function renderData() {
  const head = header('profil', 'Données et sources', { back: '#/profil' });
  const li = S.lastImport;
  const metrics = /** @type {[string, (r: import('../scoring/scores.js').DayRecord) => unknown][]} */ ([
    ['Sommeil', (r) => r.night], ['Phases de sommeil', (r) => (r.night?.hasStages ? 1 : null)], ['VFC nocturne', (r) => r.hrv], ['FC repos', (r) => r.rhr],
    ['Respiration', (r) => r.resp], ['Température', (r) => r.tempAbs], ['SpO2', (r) => r.spo2], ['Pas', (r) => r.steps], ['FC (effort)', (r) => (r.hasHr ? 1 : null)],
  ]);
  const last30 = S.records.slice(-30);
  const quality = metrics.map(([label, f]) => {
    const pct = last30.length ? Math.round((last30.filter((r) => f(r) !== null && f(r) !== undefined).length / last30.length) * 100) : 0;
    return `<div class="quality-row"><span>${label}</span><div class="pillar-track"><span class="pillar-fill ${pct >= 80 ? 'f-green' : pct >= 40 ? 'f-yellow' : 'f-red'}" data-width="${Math.max(2, pct)}"></span></div><strong>${pct} %</strong></div>`;
  }).join('');
  const water = mean(last30.map((r) => r.water).filter((v) => v !== null).map(Number));
  const protein = mean(last30.map((r) => r.protein).filter((v) => v !== null).map(Number));
  return `${head}
    <div class="card reveal">
      ${cardHead('database', 'Sources connectées', { sub: S.mode === 'demo' ? 'Données démo (fictives)' : li ? `Dernière synchro : ${longDate(localDateKey(li.at)).toLowerCase()}` : 'Aucune' })}
      ${li ? `<p>${li.sources.map(esc).join(' · ') || '—'}</p><p class="note">Fichier ${esc(li.fileName)} · ${num(Object.values(li.counts).reduce((a, b) => a + b, 0))} mesures et ${li.workouts} séances sur 120 jours.</p>` : ''}
      <div class="actions">
        <button class="btn primary" data-action="pick-import">${icon('upload', { size: 18 })}<span>Importer mon export Apple Santé</span><span class="progress"></span></button>
        <button class="btn" data-action="load-demo">${icon('flask-conical', { size: 18 })}<span>${S.mode === 'demo' ? 'Régénérer la démo à aujourd\'hui' : 'Charger la démo (remplace tes données)'}</span><span class="progress"></span></button>
      </div>
      <details class="howto"><summary>Comment exporter depuis l'app Santé ?</summary>
        <ol class="steps"><li>Ouvre l'app <strong>Santé</strong> et touche ta photo en haut à droite.</li><li>Touche <strong>Exporter toutes les données de santé</strong>, puis confirme (quelques minutes).</li><li>Choisis <strong>Enregistrer dans Fichiers</strong>.</li><li>Ici, touche <strong>Importer</strong> et choisis <strong>export.zip</strong>.</li></ol>
        <p class="note">Le fichier est lu sur ton téléphone puis oublié : seules les mesures des 120 derniers jours sont gardées.</p>
      </details>
    </div>
    <a class="card link-card reveal" href="#/profil/raccourcis">${cardHead('zap', 'Synchro automatique', { tone: 'xp', sub: S.syncSecret ? (S.lastSync ? `Activée · dernière synchro ${shortDate(localDateKey(S.lastSync.at))}` : 'Activée · en attente du raccourci') : 'Ta nuit dans PULSE chaque matin, sans export', right: icon('chevron-right', { size: 20 }) })}</a>
    <div class="card reveal">
      ${cardHead('gauge', 'Qualité des données', { sub: 'Part des 30 derniers jours avec la mesure' })}
      ${S.records.length ? quality : '<p class="note">Pas encore de données.</p>'}
      <p class="note">Selon la montre, certaines mesures n'arrivent pas dans Apple Santé (VFC nocturne, phases). Les scores s'adaptent et affichent « précision réduite ».</p>
    </div>
    ${water !== null || protein !== null ? `<div class="card reveal">${cardHead('droplet', 'Nutrition simple', { sub: 'Saisie dans Apple Santé · moyenne 30 j' })}
      <dl class="stat-list">${water !== null ? `<div><dt>Hydratation</dt><dd>${num(water / 1000, 1)} L / jour</dd></div>` : ''}${protein !== null ? `<div><dt>Protéines</dt><dd>${num(protein)} g / jour${S.profile.weightKg ? ` (${num(protein / S.profile.weightKg, 1)} g/kg)` : ''}</dd></div>` : ''}</dl></div>` : ''}
    <div class="card reveal">
      ${cardHead('download', 'Exporter mes données')}
      <div class="actions row">
        <button class="btn" data-action="export-json">${icon('download', { size: 16 })}Tout (JSON)</button>
        <button class="btn" data-action="export-csv">${icon('download', { size: 16 })}Résumés (CSV)</button>
      </div>
      <button class="btn danger" data-action="clear-data">${icon('trash-2', { size: 18 })}Tout effacer de cet appareil</button>
      <p class="note">« Tout effacer » supprime définitivement données, programme, conversation, clé API et réglages.</p>
    </div>`;
}

export function renderShortcuts() {
  const head = header('profil', 'Synchro automatique', { back: '#/profil/donnees' });
  const on = Boolean(S.syncSecret);
  const url = on ? `${location.origin}/api/sync/${S.syncSecret}` : '';
  const last = S.lastSync;
  /** @param {string} t */
  const code = (t) => `<code>${esc(t)}</code>`;
  return `${head}
    <div class="card reveal">
      ${cardHead('zap', on ? 'Synchro activée' : 'Ta nuit dans PULSE, sans rien faire', { tone: 'xp', sub: on ? (last ? `Dernière synchro : ${esc(longDate(localDateKey(last.at)).toLowerCase())} à ${new Date(last.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${num(last.samples)} mesures` : 'En attente du premier envoi du raccourci') : 'Avec l\'app Raccourcis d\'Apple (gratuite)' })}
      <p>Chaque matin, un raccourci envoie les mesures récentes de Santé à <strong>ton</strong> site. À l'ouverture, PULSE les récupère puis les fait supprimer du serveur (sinon, elles s'effacent seules après 48 h).</p>
      ${on ? `
        <span class="field-label">Ton adresse de synchro (à coller dans le raccourci, garde-la pour toi)</span>
        <code class="sync-url">${esc(url)}</code>
        <div class="actions row">
          <button class="btn primary" data-action="autosync-copy">${icon('file-text', { size: 16 })}Copier l'adresse</button>
          <button class="btn" data-action="autosync-test">${icon('refresh-cw', { size: 16 })}Tester</button>
        </div>
        <button class="btn danger" data-action="autosync-disable">${icon('trash-2', { size: 16 })}Désactiver et effacer la boîte</button>`
    : `<button class="btn primary" data-action="autosync-enable">${icon('zap', { size: 18 })}Activer la synchro automatique</button>`}
      <p class="note">Tes mesures transitent quelques instants par ton compte Netlify, protégées par un code secret que seul ce téléphone connaît.</p>
    </div>
    <div class="card reveal">
      ${cardHead('list-checks', 'Créer le raccourci (une fois, ~10 min)')}
      <ol class="steps">
        <li>Ouvre <strong>Raccourcis</strong>, touche <strong>+</strong>, nomme-le ${code('PULSE Synchro')}.</li>
        <li>Ajoute <strong>Rechercher des échantillons de santé</strong> : type <strong>Fréquence cardiaque</strong>, filtre <strong>Date de début</strong> « est dans les 2 derniers jours ». Puis <strong>Ajouter à la variable</strong> ${code('Mesures')}.</li>
        <li>Recommence ces 2 actions pour : <strong>Variabilité de la fréquence cardiaque</strong>, <strong>Fréquence cardiaque au repos</strong>, <strong>Fréquence respiratoire</strong>, <strong>Analyse du sommeil</strong>, <strong>Saturation en oxygène</strong>, <strong>Température du poignet</strong> (si ta montre la mesure), <strong>Nombre de pas</strong>.</li>
        <li>Ajoute <strong>Répéter avec chaque élément</strong> de ${code('Mesures')}. Dedans, un bloc <strong>Texte</strong> avec, séparés par ${code(';')} : Élément répété › <strong>Type</strong> ; <strong>Valeur</strong> ; <strong>Unité</strong> ; <strong>Date de début</strong> ; <strong>Date de fin</strong> ; <strong>Source</strong>. Pour les deux dates, touche la variable et choisis le format <strong>ISO 8601</strong>.</li>
        <li>Après <strong>Fin de la répétition</strong> : <strong>Combiner le texte</strong> (Résultats de Répéter, séparateur <strong>Nouvelle ligne</strong>).</li>
        <li>Ajoute <strong>Obtenir le contenu de l'URL</strong> : colle ton adresse de synchro, touche la flèche, <strong>Méthode : POST</strong>, <strong>Corps de la requête : Fichier</strong>, et choisis le <strong>Texte combiné</strong>.</li>
        <li>Lance-le une fois à la main : iOS te demande l'accès à Santé, accepte. Ouvre ensuite PULSE : « Synchro » doit s'afficher.</li>
      </ol>
    </div>
    <div class="card reveal">
      ${cardHead('clock', 'L\'automatiser (chaque matin)')}
      <ol class="steps">
        <li>Raccourcis › <strong>Automatisation</strong> › <strong>+</strong> › <strong>Réveil</strong> › <strong>Est arrêté</strong> (ou « Heure de la journée » si tu n'as pas de réveil).</li>
        <li>Choisis <strong>Exécuter immédiatement</strong> (pas de confirmation) et désactive <strong>Notifier lors de l'exécution</strong> si tu veux.</li>
        <li>Action : <strong>Exécuter le raccourci</strong> › ${code('PULSE Synchro')}.</li>
      </ol>
      <p class="note">iOS ne laisse lire Santé que téléphone déverrouillé : l'arrêt du réveil est le meilleur moment. Les séances ne passent pas par Raccourcis : refais un export complet de temps en temps (une fois par mois suffit) pour ton historique sport.</p>
    </div>
    <details class="card reveal howto">
      <summary>${icon('file-text', { size: 16 })} Coller des données à la main</summary>
      <form data-form="paste-shortcut"><textarea name="payload" rows="4" placeholder="Fréquence cardiaque;56;bpm;2026-11-10T03:12:00+01:00;…"></textarea>
      <button class="btn" type="submit">${icon('upload', { size: 16 })}Importer ce texte</button></form>
    </details>`;
}
