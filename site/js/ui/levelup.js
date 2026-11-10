// @ts-check
/**
 * Level up plein écran (2,5 s) : flash, confettis, nouveau rang, vibration, son léger,
 * et carte partageable en story (image 1080 × 1920 générée sur le téléphone).
 */
import { icon } from './icons.js';
import { esc } from './format.js';
import { confetti, haptic, chime } from './fx.js';

/**
 * @param {{ level: number, rank: string, rankChanged: boolean, badges: string[] }} o
 */
export function showLevelUp(o) {
  const el = document.createElement('div');
  el.className = 'levelup';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `Niveau ${o.level}`);
  el.innerHTML = `<div class="levelup-flash"></div>
    <div class="levelup-card">
      <span class="eyebrow">Level up</span>
      <span class="level-badge huge">${o.level}</span>
      <h2>${o.rankChanged ? `Nouveau rang : ${esc(o.rank)}` : `Niveau ${o.level}`}</h2>
      ${o.badges.length ? `<p>Badge${o.badges.length > 1 ? 's' : ''} : ${o.badges.map(esc).join(', ')}</p>` : '<p>Tes bonnes habitudes paient.</p>'}
      <div class="actions row">
        <button class="btn" data-levelup-share>${icon('share-2', { size: 18 })}Partager</button>
        <button class="btn primary" data-levelup-close>Continuer</button>
      </div>
    </div>`;
  document.body.append(el);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const card = /** @type {HTMLElement} */ (el.querySelector('.levelup-card'));
  if (reduced) card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  else {
    /** @type {HTMLElement} */ (el.querySelector('.levelup-flash')).animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
    card.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'scale(1.04)', offset: 0.6 }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: 'cubic-bezier(0.34, 1.32, 0.64, 1)' });
    confetti(el);
  }
  haptic([20, 40, 30]);
  chime();
  const close = () => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(() => el.remove(), () => el.remove());
  };
  el.querySelector('[data-levelup-close]')?.addEventListener('click', close);
  el.querySelector('[data-levelup-share]')?.addEventListener('click', () => { void shareStory(o.level, o.rank); });
  /** @type {HTMLElement | null} */ (el.querySelector('[data-levelup-close]'))?.focus();
}

/**
 * Génère l'image story et la partage (ou la télécharge si le partage de fichiers n'existe pas).
 * @param {number} level @param {string} rank
 */
export async function shareStory(level, rank) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  await document.fonts.ready;
  ctx.fillStyle = '#0a0b0d';
  ctx.fillRect(0, 0, 1080, 1920);
  // Anneaux PULSE
  const rings = [['#16ec8e', 330, 0.78], ['#7b8cff', 250, 0.65], ['#3fa9f5', 170, 0.6]];
  for (const [color, r, ratio] of rings) {
    ctx.beginPath();
    ctx.lineWidth = 56;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.arc(540, 760, Number(r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = String(color);
    ctx.arc(540, 760, Number(r), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Number(ratio));
    ctx.stroke();
  }
  const grad = ctx.createLinearGradient(300, 0, 780, 0);
  grad.addColorStop(0, '#b57bff');
  grad.addColorStop(1, '#ff7bd5');
  ctx.fillStyle = grad;
  ctx.textAlign = 'center';
  ctx.font = '600 150px "Space Grotesk", sans-serif';
  ctx.fillText(String(level), 540, 815);
  ctx.fillStyle = '#f5f7fa';
  ctx.font = '600 96px "Space Grotesk", sans-serif';
  ctx.fillText(`Niveau ${level}`, 540, 1290);
  ctx.fillStyle = '#8a9099';
  ctx.font = '500 60px Inter, sans-serif';
  ctx.fillText(rank, 540, 1380);
  ctx.fillStyle = '#f5f7fa';
  ctx.font = '600 52px "Space Grotesk", sans-serif';
  ctx.fillText('P U L S E', 540, 1760);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!(blob instanceof Blob)) return;
  const file = new File([blob], `pulse-niveau-${level}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Niveau ${level} sur PULSE` }); return; } catch { /* partage annulé */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
