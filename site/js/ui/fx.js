// @ts-check
/**
 * Effets : confettis (canvas), « +50 XP » qui monte, vibration, son léger.
 * Tout se dégrade proprement avec prefers-reduced-motion et sans API Vibration (iPhone).
 */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vibration courte si le navigateur la supporte. @param {number | number[]} pattern */
export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* non supporté */ }
}

/** Petit carillon de level up (Web Audio, très court et doux). */
export function chime() {
  try {
    const w = /** @type {{ AudioContext?: typeof AudioContext, webkitAudioContext?: typeof AudioContext }} */ (/** @type {unknown} */ (window));
    const Ctx = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.09);
      g.gain.linearRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* audio indisponible */ }
}

/**
 * Confettis plein écran pendant ~2,2 s.
 * @param {HTMLElement} host
 */
export function confetti(host) {
  if (reduced()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = (canvas.width = host.clientWidth * dpr);
  const h = (canvas.height = host.clientHeight * dpr);
  const colors = ['#b57bff', '#ff7bd5', '#16ec8e', '#7b8cff', '#3fa9f5', '#ffd43b'];
  const parts = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.42,
    vx: (Math.random() - 0.5) * 16 * dpr,
    vy: (-Math.random() * 16 - 6) * dpr,
    r: (Math.random() * 5 + 3) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  /** @param {number} now */
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.45 * dpr;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (t < 2200) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/**
 * « +50 XP » qui monte et s'efface (800 ms), puis remplit les barres d'XP visibles.
 * @param {number} points @param {Element | null} [anchor]
 */
export function xpGain(points, anchor = null) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = `+${points} XP`;
  document.body.append(el);
  const r = anchor?.getBoundingClientRect();
  el.style.setProperty('--x', `${r ? r.left + r.width / 2 : window.innerWidth / 2}px`);
  el.style.setProperty('--y', `${r ? r.top : window.innerHeight * 0.4}px`);
  const frames = reduced()
    ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }]
    : [{ opacity: 0, transform: 'translate(-50%, 0) scale(0.9)' }, { opacity: 1, transform: 'translate(-50%, -24px) scale(1)', offset: 0.3 }, { opacity: 0, transform: 'translate(-50%, -60px) scale(1)' }];
  el.animate(frames, { duration: 800, easing: 'ease-out' }).finished.then(() => el.remove(), () => el.remove());
  haptic(10);
}
