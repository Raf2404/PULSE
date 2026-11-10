// @ts-check
/**
 * Onboarding en 5 écrans : objectif → toi et tes sports → tes données (consentement) → ton coach → premier score.
 */
import { icon } from '../ui/icons.js';
import { chips } from '../ui/components.js';
import { ringsHTML } from '../ui/rings.js';
import { esc } from '../ui/format.js';
import { S, latest } from '../state.js';
import { GOALS, SPORTS, COACH_STYLES } from '../data/profile.js';
import { briefText } from '../coach/rules.js';

export let onboardingStep = 0;
/** @param {number} n */
export function setOnboardingStep(n) { onboardingStep = Math.max(0, Math.min(4, n)); }

const TITLES = ['Ton objectif', 'Toi et tes sports', 'Tes données', 'Ton coach', 'Ton premier score'];

function step0() {
  return `<div class="ob-hero">${icon('activity', { size: 36 })}</div>
    <h2>Ta montre mesure, PULSE t'explique quoi faire aujourd'hui.</h2>
    <p>Chaque matin : 3 scores lisibles en 2 secondes et un conseil concret. Qu'est-ce qui compte le plus pour toi ?</p>
    ${chips({ name: 'goals', multiple: true, options: Object.entries(GOALS), selected: S.profile.goals })}`;
}

function step1() {
  const p = S.profile;
  return `<p>Pour calculer tes zones cardio et ton besoin de sommeil. Tout reste sur ton téléphone.</p>
    ${chips({ name: 'sports', multiple: true, options: Object.entries(SPORTS), selected: p.sports })}
    <div class="grid-2">
      <label class="field"><span class="field-label">Prénom (facultatif)</span><input name="firstName" maxlength="30" value="${esc(p.firstName)}"></label>
      <label class="field"><span class="field-label">Année de naissance</span><input name="birthYear" inputmode="numeric" maxlength="4" value="${p.birthYear ?? ''}" placeholder="1994"></label>
      <label class="field"><span class="field-label">Sexe</span><select name="sex"><option value="">—</option>${[['f', 'Femme'], ['m', 'Homme'], ['x', 'Autre']].map(([v, l]) => `<option value="${v}" ${p.sex === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Réveil visé</span><input name="wakeTime" type="time" value="${esc(p.wakeTime)}"></label>
    </div>`;
}

function step2() {
  const has = S.records.length > 0;
  return `<p>PULSE lit l'export de l'app Santé, quelle que soit ta montre (Apple Watch, Garmin, Withings, Oura…).</p>
    <label class="consent"><input type="checkbox" name="healthConsent" ${S.profile.healthConsent ? 'checked' : ''}>
      <span>J'accepte que PULSE traite mes données de santé <strong>sur cet appareil uniquement</strong>, pour calculer mes scores. Je peux tout exporter et tout supprimer à tout moment.</span></label>
    <div class="actions">
      <button type="button" class="btn primary" data-action="pick-import" data-needs-consent>${icon('upload', { size: 18 })}<span>Importer mon export Apple Santé</span><span class="progress"></span></button>
      <button type="button" class="btn" data-action="load-demo" data-needs-consent>${icon('flask-conical', { size: 18 })}<span>Essayer avec 90 jours de démo</span><span class="progress"></span></button>
    </div>
    ${has ? `<p class="ok-line">${icon('circle-check', { size: 16 })} ${S.mode === 'demo' ? 'Données démo chargées.' : 'Données importées.'}</p>` : ''}
    <details class="howto"><summary>Comment exporter depuis l'app Santé ?</summary><ol class="steps"><li>App <strong>Santé</strong> → ta photo en haut à droite.</li><li><strong>Exporter toutes les données de santé</strong>.</li><li><strong>Enregistrer dans Fichiers</strong>, puis choisis <strong>export.zip</strong> ici.</li></ol></details>`;
}

function step3() {
  return `<p>Choisis le ton de ton coach. Tu pourras le changer quand tu veux.</p>
    <div class="choice-list">${Object.entries(COACH_STYLES).map(([k, v]) => `<label class="choice"><input type="radio" name="coachStyle" value="${k}" ${S.profile.coachStyle === k ? 'checked' : ''}><span><strong>${esc(v.label)}</strong><span class="note">${esc(v.hint)}</span></span></label>`).join('')}</div>
    <details class="howto"><summary>${icon('key', { size: 16 })} Activer le coach IA (facultatif)</summary>
      <p class="note">Avec ta propre clé API Claude (console.anthropic.com, payant à l'usage), le coach discute avec toi et rédige ton brief. Sans clé, PULSE reste complet avec un coach à règles.</p>
      <label class="field"><span class="field-label">Clé API</span><input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <label class="consent"><input type="checkbox" name="aiConsent" ${S.profile.aiConsent ? 'checked' : ''}><span>J'accepte l'envoi de résumés chiffrés (sans prénom ni identifiant) à l'API Claude d'Anthropic.</span></label>
    </details>`;
}

function step4() {
  const r = latest();
  if (!r) {
    return `<p>Pas encore de données : importe ton export ou essaie la démo depuis l'accueil quand tu veux.</p>`;
  }
  return `${ringsHTML([
    { kind: 'recovery', label: 'Récupération', value: r.recovery, max: 100, suffix: '%', color: r.zone ? `var(--recovery-${r.zone})` : undefined },
    { kind: 'sleep', label: 'Sommeil', value: r.sleepScore, max: 100 },
    { kind: 'strain', label: 'Effort', value: Math.round(r.strain * 10) / 10, max: 21 },
  ])}
    <p class="lead">${esc(briefText({ records: S.records, session: null, style: S.profile.coachStyle }))}</p>
    <p class="note">PULSE n'est pas un dispositif médical : les scores sont indicatifs.</p>`;
}

export function renderOnboarding() {
  const steps = [step0, step1, step2, step3, step4];
  const s = onboardingStep;
  const canNext = s !== 2 || S.records.length > 0;
  return `<div class="onboarding" role="dialog" aria-modal="true" aria-labelledby="ob-title">
    <form class="ob-panel" data-form="onboarding" data-ob-step="${s}">
      <div class="ob-dots" aria-label="Étape ${s + 1} sur 5">${[0, 1, 2, 3, 4].map((i) => `<span class="${i === s ? 'on' : i < s ? 'done' : ''}"></span>`).join('')}</div>
      <h1 id="ob-title">${TITLES[s]}</h1>
      <div class="ob-body">${steps[s]()}</div>
      <div class="ob-nav">
        ${s > 0 ? `<button type="button" class="btn" data-action="ob-back">${icon('chevron-left', { size: 18 })}Retour</button>` : '<span></span>'}
        ${s === 2 && !canNext ? '<button type="button" class="btn" data-action="ob-skip">Plus tard</button>' : `<button type="submit" class="btn primary">${s === 4 ? 'C\'est parti' : 'Suivant'}${icon('arrow-right', { size: 18 })}</button>`}
      </div>
    </form>
  </div>`;
}
