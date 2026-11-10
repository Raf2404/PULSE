// @ts-check
/** Journal du soir (facultatif, 10 secondes) : caféine, alcool, écrans, repas tardif, stress. */
import { icon } from '../ui/icons.js';
import { esc, longDate } from '../ui/format.js';
import { S } from '../state.js';

/**
 * Formulaire du journal pour une date.
 * @param {string} date
 */
export function journalForm(date) {
  const j = S.journal.find((x) => x.date === date);
  const v = j ?? { lateCaffeine: false, alcohol: 0, screens: false, lateMeal: false, stress: 2, notes: '' };
  /** @param {string} name @param {string} label @param {string} iconName @param {boolean} checked */
  const yesNo = (name, label, iconName, checked) => `<label class="journal-toggle"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${icon(iconName, { size: 18 })}${esc(label)}</span></label>`;
  return `<form class="journal" data-form="journal" data-date="${esc(date)}">
    <p class="note">Soirée du ${esc(longDate(date).toLowerCase())}. Coche ce qui s'applique : PULSE calculera l'effet réel sur TON sommeil.</p>
    <div class="journal-grid">
      ${yesNo('lateCaffeine', 'Caféine après 14 h', 'coffee', v.lateCaffeine)}
      ${yesNo('screens', 'Écrans au lit', 'monitor-smartphone', v.screens)}
      ${yesNo('lateMeal', 'Repas tardif', 'utensils', v.lateMeal)}
    </div>
    <div class="field-row">
      <span class="field-label">${icon('wine', { size: 18 })}Verres d'alcool</span>
      <div class="stepper" data-stepper>
        <button type="button" class="icon-btn" data-step="-1" aria-label="Moins">${icon('minus', { size: 18 })}</button>
        <output name="alcoholOut">${v.alcohol}</output>
        <input type="hidden" name="alcohol" value="${v.alcohol}">
        <button type="button" class="icon-btn" data-step="1" aria-label="Plus">${icon('plus', { size: 18 })}</button>
      </div>
    </div>
    <fieldset class="field-row">
      <legend class="field-label">${icon('brain', { size: 18 })}Stress ressenti</legend>
      <div class="scale">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="stress" value="${n}" ${v.stress === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    </fieldset>
    <label class="field"><span class="field-label">Note (facultatif)</span><input type="text" name="notes" maxlength="140" value="${esc(v.notes)}" placeholder="Ex. dîner tardif chez des amis"></label>
    <button class="btn primary" type="submit">${icon('check', { size: 18 })}${j ? 'Mettre à jour' : 'Enregistrer (+10 XP)'}</button>
  </form>`;
}
