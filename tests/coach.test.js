// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemo } from '../site/js/data/demo.js';
import { buildDays, groupByType } from '../site/js/scoring/daily.js';
import { computeScores } from '../site/js/scoring/scores.js';
import { computeCorrelations } from '../site/js/scoring/correlations.js';
import { buildContext } from '../site/js/coach/context.js';
import { TOOLS, validateToolInput, runTool } from '../site/js/coach/tools.js';
import { systemPrompt } from '../site/js/coach/prompts.js';
import { coachTurn, shortText, setFetchForTests, COACH_MODEL, FAST_MODEL } from '../site/js/coach/api.js';
import { normalizeProfile } from '../site/js/data/profile.js';

const demo = generateDemo({ end: new Date(2026, 10, 10, 9, 30) });
const { days } = buildDays({ byType: groupByType(demo.samples), workouts: demo.workouts, hrMax: 190, hrRest: null });
const records = computeScores(days);
const profile = normalizeProfile({ firstName: 'Rafaël', birthYear: 1994, sex: 'm', goals: ['sleep'], sports: ['running'] });

/** @type {import('../site/js/coach/tools.js').ToolHost} */
const host = {
  metrics: (d) => records.slice(-d).map((r) => ({ date: r.date, recovery: r.recovery })),
  workouts: (d) => records.slice(-d).flatMap((r) => r.workouts),
  createProgram: async () => ({ programId: 'prog-1', summary: 'Programme créé : 8 semaines.' }),
  adjustToday: async (mode) => `Séance passée en mode ${mode}.`,
  saveMemory: async () => {},
  hasSession: (date) => date === '2026-11-10',
};

test('contexte compact : chiffres agrégés, sans prénom, ~2 000 tokens', () => {
  const ctx = buildContext({ profile, memory: [{ key: 'blessure', value: 'genou gauche fragile' }], records, correlations: computeCorrelations(records, demo.journal), progress: null, program: null, todaySession: null, now: new Date(2026, 10, 10, 9, 30) });
  assert.ok(!ctx.includes('Rafaël'), 'pas de prénom envoyé à l\'IA');
  assert.match(ctx, /## 7 derniers jours/);
  assert.match(ctx, /genou gauche fragile/);
  assert.equal(ctx.split('\n').filter((l) => /^\d{4}-\d{2}-\d{2} \|/.test(l)).length, 7);
  const approxTokens = ctx.length / 3.5;
  assert.ok(approxTokens < 2600, `≈ ${Math.round(approxTokens)} tokens`);
});

test('consignes : garde-fous et personnalités', () => {
  for (const style of /** @type {const} */ (['bienveillant', 'direct', 'sergent'])) {
    const s = systemPrompt(style);
    assert.match(s, /pas médecin/);
    assert.match(s, /Ne cite que des chiffres/);
  }
  assert.notEqual(systemPrompt('direct'), systemPrompt('sergent'));
});

test('outils : schémas et validation des entrées', async () => {
  assert.equal(TOOLS.length, 7);
  assert.ok(TOOLS.every((t) => 'input_schema' in t && t.eager_input_streaming === true));
  assert.equal(validateToolInput('get_metrics', { days: 7 }), null);
  assert.ok(validateToolInput('get_metrics', { days: 0 }));
  assert.ok(validateToolInput('get_metrics', '{"days":7}'));
  assert.ok(validateToolInput('create_program', { goal: 'muscle', level: 'beginner', days: [1, 9], equipment: 'none', injuries: [], weeks: 8, cardio: 'none' }));
  assert.equal(validateToolInput('create_program', { goal: 'muscle', level: 'beginner', days: [1, 3], equipment: 'none', injuries: ['knee'], weeks: 8, cardio: 'none' }), null);
  assert.ok(validateToolInput('save_memory', { key: '', value: 'x' }));
  assert.ok(validateToolInput('bash', {}));
  const r = await runTool('show_session', { date: '2026-11-11' }, host, '2026-11-10');
  assert.equal(r.isError, true);
  const c = await runTool('show_chart', { metric: 'hrv', days: 30 }, host, '2026-11-10');
  assert.deepEqual(c.card, { kind: 'chart', metric: 'hrv', days: 30 });
});

/**
 * Réponse SSE simulée de l'API Messages.
 * @param {object[]} events
 */
function sse(events) {
  const body = events.map((e) => `event: ${/** @type {{ type: string }} */ (e).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}
/** @param {string} id @param {object[]} blocks @param {string} stop */
function messageEvents(id, blocks, stop) {
  /** @type {object[]} */
  const ev = [{ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: COACH_MODEL, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }];
  blocks.forEach((b, index) => {
    const block = /** @type {Record<string, unknown>} */ (b);
    if (block.type === 'text') {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      ev.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
    } else {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } });
      const json = JSON.stringify(block.input);
      ev.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(0, 5) } });
      ev.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(5) } });
    }
    ev.push({ type: 'content_block_stop', index });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 20 } });
  ev.push({ type: 'message_stop' });
  return ev;
}

test('boucle d\'outils en streaming avec le SDK empaqueté (API simulée)', async () => {
  /** @type {Record<string, unknown>[]} */
  const bodies = [];
  /** @type {Record<string, string>[]} */
  const headers = [];
  let call = 0;
  setFetchForTests(async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    call++;
    if (call === 1) {
      return sse(messageEvents('msg_1', [
        { type: 'text', text: 'Je regarde ta semaine.' },
        { type: 'tool_use', id: 'toolu_1', name: 'get_metrics', input: { days: 7 } },
        { type: 'tool_use', id: 'toolu_2', name: 'show_chart', input: { metric: 'hrv', days: 14 } },
      ], 'tool_use'));
    }
    return sse(messageEvents('msg_2', [{ type: 'text', text: 'Ta VFC remonte. Couche-toi à 22 h 50 ce soir.' }], 'end_turn'));
  });
  try {
    /** @type {string[]} */
    const seen = [];
    const out = await coachTurn({
      apiKey: 'sk-ant-test', style: 'direct', context: 'contexte', history: [], userText: 'Analyse ma semaine',
      host, today: '2026-11-10', onText: (t) => seen.push(t), onCard: () => {},
    });
    assert.equal(call, 2);
    assert.equal(out.text, 'Je regarde ta semaine.\n\nTa VFC remonte. Couche-toi à 22 h 50 ce soir.');
    assert.deepEqual(out.cards, [{ kind: 'chart', metric: 'hrv', days: 14 }]);
    assert.ok(seen.length >= 2);
    assert.equal(out.newMessages.length, 4, 'user, assistant (outils), user (résultats), assistant');
    const results = /** @type {{ content: { tool_use_id: string, is_error?: boolean }[] }} */ (out.newMessages[2]).content;
    assert.deepEqual(results.map((r) => r.tool_use_id), ['toolu_1', 'toolu_2'], 'tous les résultats dans un seul message');
    // Requête : bon modèle, repli serveur, cache, outils, en-tête navigateur
    const b = bodies[0];
    assert.equal(b.model, 'claude-sonnet-5-5');
    assert.equal(b.fallbacks, 'default');
    assert.equal(b.stream, true);
    assert.deepEqual(b.output_config, { effort: 'medium' });
    assert.ok(Array.isArray(b.system) && /** @type {{ cache_control?: object }[]} */ (b.system)[0].cache_control);
    assert.equal(/** @type {unknown[]} */ (b.tools).length, 7);
    assert.equal(headers[0]['anthropic-dangerous-direct-browser-access'], 'true');
    assert.match(headers[0]['anthropic-beta'], /server-side-fallback-2026-07-01/);
    assert.ok(headers[0]['x-api-key'] === 'sk-ant-test' || headers[0].authorization === 'Bearer sk-ant-test', 'clé transmise');
    // 2e requête : l'historique contient le tour d'outils complet
    assert.equal(/** @type {unknown[]} */ (bodies[1].messages).length, 3);
  } finally {
    setFetchForTests(undefined);
  }
});

test('entrée d\'outil invalide : renvoyée au modèle en erreur, sans exécution', async () => {
  let call = 0;
  let saved = false;
  setFetchForTests(async () => {
    call++;
    if (call === 1) return sse(messageEvents('m1', [{ type: 'tool_use', id: 't1', name: 'save_memory', input: { key: '' } }], 'tool_use'));
    return sse(messageEvents('m2', [{ type: 'text', text: 'OK.' }], 'end_turn'));
  });
  try {
    const out = await coachTurn({
      apiKey: 'k', style: 'bienveillant', context: '', history: [], userText: 'Retiens ça',
      host: { ...host, saveMemory: async () => { saved = true; } }, today: '2026-11-10', onText: () => {}, onCard: () => {},
    });
    assert.equal(saved, false);
    const r = /** @type {{ content: { is_error?: boolean }[] }} */ (out.newMessages[2]).content[0];
    assert.equal(r.is_error, true);
  } finally {
    setFetchForTests(undefined);
  }
});

test('refus du modèle : message clair, pas d\'outil exécuté', async () => {
  setFetchForTests(async () => sse(messageEvents('m1', [{ type: 'text', text: '' }], 'refusal')));
  try {
    const out = await coachTurn({ apiKey: 'k', style: 'direct', context: '', history: [], userText: '…', host, today: '2026-11-10', onText: () => {}, onCard: () => {} });
    assert.equal(out.refused, true);
    assert.match(out.text, /Je ne peux pas répondre/);
  } finally {
    setFetchForTests(undefined);
  }
});

test('texte court avec Haiku', async () => {
  /** @type {Record<string, unknown>} */
  let body = {};
  setFetchForTests(async (_u, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: FAST_MODEL, content: [{ type: 'text', text: 'Récupération 78 %.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  try {
    assert.equal(await shortText({ apiKey: 'k', prompt: 'brief' }), 'Récupération 78 %.');
    assert.equal(body.model, 'claude-haiku-5-5');
    assert.deepEqual(body.output_config, { effort: 'low' });
  } finally {
    setFetchForTests(undefined);
  }
});
