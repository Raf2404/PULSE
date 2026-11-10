// @ts-check
/**
 * Client du coach IA : appels directs du navigateur vers l'API Claude avec la clé personnelle
 * de l'utilisateur (stockée sur son appareil). SDK officiel empaqueté dans js/vendor/anthropic.js,
 * chargé seulement quand le coach sert.
 *
 * - Coach (chat, outils) : Claude Sonnet 5.5, en streaming, boucle d'outils manuelle.
 * - Textes courts (brief du matin, bilan hebdo) : Claude Haiku 5.5.
 * - Repli côté serveur activé (« fallbacks: default ») si le modèle décline une demande.
 */
import { TOOLS, validateToolInput, runTool } from './tools.js';
import { systemPrompt, SUMMARY_RULES } from './prompts.js';

/** @typedef {import('../vendor/anthropic.js').Anthropic} AnthropicClient */
/** @typedef {import('../vendor/anthropic.js').Anthropic.Beta.BetaMessageParam} MessageParam */
/** @typedef {import('../vendor/anthropic.js').Anthropic.Beta.BetaToolResultBlockParam} ToolResultParam */
/** @typedef {import('./tools.js').Card} Card */
/** @typedef {import('./tools.js').ToolHost} ToolHost */
/** @typedef {import('../data/profile.js').CoachStyle} CoachStyle */

export const COACH_MODEL = 'claude-sonnet-5-5';
export const FAST_MODEL = 'claude-haiku-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_STEPS = 8;

/** @type {Promise<typeof import('../vendor/anthropic.js').Anthropic> | null} */
let sdk = null;
function loadSdk() {
  sdk ??= import('../vendor/anthropic.js').then((m) => m.Anthropic);
  return sdk;
}

/** @type {typeof fetch | undefined} */
let fetchOverride;
/** Tests uniquement : remplace fetch pour simuler l'API. @param {typeof fetch | undefined} f */
export function setFetchForTests(f) { fetchOverride = f; }

/** @param {string} apiKey */
async function clientFor(apiKey) {
  const Anthropic = await loadSdk();
  // Usage personnel : la clé appartient à l'utilisateur et ne quitte son appareil que vers l'API.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: fetchOverride ? 0 : 2, ...(fetchOverride ? { fetch: fetchOverride } : {}) });
}

/**
 * Message d'erreur compréhensible.
 * @param {unknown} err
 */
export async function friendlyError(err) {
  const A = await loadSdk();
  if (err instanceof A.APIUserAbortError) return 'Réponse interrompue.';
  if (err instanceof A.AuthenticationError) return 'Ta clé API est refusée. Vérifie-la dans Profil → Coach IA.';
  if (err instanceof A.PermissionDeniedError) return 'Ta clé API n\'a pas accès à ce modèle. Vérifie ton compte sur console.anthropic.com.';
  if (err instanceof A.RateLimitError) return 'Trop de demandes d\'un coup : réessaie dans une minute.';
  if (err instanceof A.APIConnectionError) return 'Pas de connexion à l\'API Claude. Vérifie ta connexion internet.';
  if (err instanceof A.InternalServerError) return 'Le service est momentanément surchargé : réessaie dans un instant.';
  if (err instanceof A.BadRequestError) return `Requête refusée par l'API : ${err.message}`;
  if (err instanceof A.APIError) return `Erreur de l'API (${err.status ?? '?'}).`;
  return err instanceof Error ? err.message : String(err);
}

/**
 * Vérifie qu'une clé fonctionne (sans consommer de tokens).
 * @param {string} apiKey
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function testKey(apiKey) {
  try {
    const c = await clientFor(apiKey);
    await c.models.retrieve(COACH_MODEL);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: await friendlyError(err) };
  }
}

/**
 * Un tour de conversation avec le coach : streaming du texte, outils exécutés localement.
 * @param {{ apiKey: string, style: CoachStyle, context: string, history: MessageParam[], userText: string,
 *   host: ToolHost, today: string, signal?: AbortSignal,
 *   onText: (text: string) => void, onCard: (card: Card) => void, onTool?: (name: string) => void }} o
 * @returns {Promise<{ text: string, cards: Card[], newMessages: MessageParam[], refused: boolean }>}
 */
export async function coachTurn(o) {
  const A = await loadSdk();
  const client = await clientFor(o.apiKey);
  /** @type {MessageParam[]} */
  const newMessages = [{ role: 'user', content: o.userText }];
  /** @type {Card[]} */
  const cards = [];
  let text = '';
  let refused = false;
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const stepStart = text.length;
    const stream = client.beta.messages.stream({
      model: COACH_MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: systemPrompt(o.style), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Contexte chiffré de la personne (calculé par l'app) :\n\n${o.context}` },
      ],
      tools: TOOLS,
      messages: [...o.history, ...newMessages],
    }, { signal: o.signal });

    stream.on('text', (delta) => {
      if (text.length === stepStart && stepStart > 0) text += '\n\n';
      text += delta;
      o.onText(text);
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Seul le cas « entrée d'outil illisible » est relancé ; les erreurs d'API remontent.
      if (err instanceof A.APIError || jsonRetries++ >= 2) throw err;
      text = text.slice(0, stepStart);
      continue;
    }

    if (message.stop_reason === 'refusal') {
      refused = true;
      text += `${text ? '\n\n' : ''}Je ne peux pas répondre à cette demande. Reformule-la autrement, ou parlons de ton sommeil, de ta récupération ou de tes séances.`;
      o.onText(text);
      break;
    }
    const toolUses = message.content.filter((b) => b.type === 'tool_use');
    if (message.stop_reason === 'max_tokens' && toolUses.length) {
      throw new Error('Réponse trop longue, interrompue avant la fin. Réessaie avec une demande plus simple.');
    }
    newMessages.push({ role: 'assistant', content: message.content });
    if (toolUses.length === 0) break;

    /** @type {ToolResultParam[]} */
    const results = [];
    for (const t of toolUses) {
      if (t.type !== 'tool_use') continue;
      o.onTool?.(t.name);
      const problem = validateToolInput(t.name, t.input);
      if (problem) {
        results.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: `Entrée invalide : ${problem}. Corrige et rappelle l'outil.` });
        continue;
      }
      try {
        const r = await runTool(t.name, /** @type {Record<string, unknown>} */ (t.input), o.host, o.today);
        if (r.card) { cards.push(r.card); o.onCard(r.card); }
        results.push({ type: 'tool_result', tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: err instanceof Error ? err.message : String(err) });
      }
    }
    newMessages.push({ role: 'user', content: results });
  }
  return { text: text.trim(), cards, newMessages, refused };
}

/**
 * Texte court (brief du matin, bilan hebdo) avec le modèle rapide.
 * @param {{ apiKey: string, prompt: string, maxTokens?: number }} o
 * @returns {Promise<string | null>} null si le modèle décline
 */
export async function shortText(o) {
  const client = await clientFor(o.apiKey);
  const message = await client.messages.create({
    model: FAST_MODEL,
    max_tokens: o.maxTokens ?? 4000,
    output_config: { effort: 'low' },
    system: SUMMARY_RULES,
    messages: [{ role: 'user', content: o.prompt }],
  });
  if (message.stop_reason === 'refusal') return null;
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  return text || null;
}
