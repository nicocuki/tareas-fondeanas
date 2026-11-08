// Durable Object único de Abismo (`idFromName('abismo')`): el juez y el ranking global (ver juez.js).
//
//   POST /api/abismo/juzgar   { promptId, text }        → { ok, text, canonical, tier, pts, note, sig } o { ok: false, reason }
//   GET  /api/abismo/ranking                            → { niche: [...], best: [...], perlas: [...] }
//   POST /api/abismo/partida  { name, avatar, answers } → { ok, score } (solo suma respuestas con firma válida)
//
// Quién juzga, en este orden: la API de Claude si está el secreto ANTHROPIC_API_KEY (modelo en ABISMO_MODELO,
// por defecto claude-opus-5-5), si no Workers AI (el binding `AI` de wrangler.jsonc, gratis hasta la cuota del
// día; modelo en ABISMO_MODELO_AI), y si no hay nada, el juez de mentira con `JUEZ_FALSO=1` (solo para probar).
// Cada veredicto queda guardado por consigna y respuesta normalizada: la misma respuesta vale lo mismo para
// todos, siempre, y no se vuelve a preguntar.
import { DurableObject } from 'cloudflare:workers';
import Anthropic from '@anthropic-ai/sdk';
import { PROMPT_BY_ID } from '../src/abismo/prompts.js';
import { NICHE_TIERS, answerKey, cleanAnswer } from '../src/abismo/tiers.js';
import {
  MAX_KEPT_PLAYERS, MAX_PERLAS, VERDICT_SCHEMA, allowJudge, buildJudgePrompt, cleanResult, fakeVerdict, judgeSecret, mergePlayer,
  parseVerdict, playerKey, rankingTables, scoreOf, signAnswer, verdictToResult, verifyAnswer,
} from './juez.js';

const DEFAULT_CLAUDE = 'claude-opus-5-5';
const DEFAULT_AI = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`abismo:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class Abismo extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.perlas = [];
    ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of await ctx.storage.list({ prefix: 'p:' })) this.players.set(key.slice(2), value);
      this.perlas = (await ctx.storage.get('perlas')) || [];
    });
  }

  // ─── El juez ───────────────────────────────────────────────────────────────
  async askClaude(prompt, answer) {
    const client = new Anthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
    const { system, user } = buildJudgePrompt(prompt, answer);
    const response = await client.beta.messages.create({
      model: this.env.ABISMO_MODELO || DEFAULT_CLAUDE,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseVerdict(text);
  }

  async askWorkersAi(prompt, answer) {
    const { system, user } = buildJudgePrompt(prompt, answer);
    const out = await this.env.AI.run(this.env.ABISMO_MODELO_AI || DEFAULT_AI, {
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 400,
      response_format: { type: 'json_schema', json_schema: VERDICT_SCHEMA },
    });
    return parseVerdict(out?.response ?? out);
  }

  async verdictFor(prompt, answer) {
    if (this.env.JUEZ_FALSO) return fakeVerdict(prompt, answer); // solo para probar en local
    if (this.env.ANTHROPIC_API_KEY) return this.askClaude(prompt, answer);
    if (this.env.AI) return this.askWorkersAi(prompt, answer);
    return undefined; // no hay juez configurado
  }

  async juzgar(body, ip) {
    const prompt = PROMPT_BY_ID[body?.promptId];
    const text = cleanAnswer(body?.text);
    if (!prompt || !text) return json({ ok: false, reason: 'Falta la respuesta.' }, 400);
    const key = `j:${prompt.id}:${answerKey(text)}`;
    let verdict = await this.ctx.storage.get(key);
    if (!verdict) {
      const now = Date.now();
      const who = `rl:${await hashIp(ip)}`;
      const allowed = allowJudge((await this.ctx.storage.get(who)) || [], now);
      if (!allowed.ok) return json({ ok: false, reason: allowed.error }, 429);
      await this.ctx.storage.put(who, allowed.times);
      try {
        verdict = await this.verdictFor(prompt, text);
      } catch (e) {
        console.error('juez', e?.message || e);
        return json({ ok: false, reason: 'El juez no contestó. Probá de nuevo.', retry: true }, 502);
      }
      if (verdict === undefined) return json({ ok: false, reason: 'No hay juez configurado en este servidor.' }, 503);
      if (!verdict) return json({ ok: false, reason: 'El juez no se decidió. Probá de nuevo.', retry: true }, 502);
      // Las respuestas que no valen también se recuerdan: así el mismo error no vuelve a gastar un pedido.
      await this.ctx.storage.put(key, { ...verdict, at: now });
    }
    const result = verdictToResult(text, verdict);
    if (!result.ok) return json(result);
    result.sig = await signAnswer(judgeSecret(this.env), prompt.id, result.canonical, result.tier);
    return json(result);
  }

  // ─── El ranking ────────────────────────────────────────────────────────────
  ranking() {
    const tables = rankingTables(Object.fromEntries(this.players));
    return { ...tables, perlas: this.perlas.slice(0, 40) };
  }

  async partida(body) {
    const clean = cleanResult(body);
    if (clean.error) return json({ error: clean.error }, 400);
    const secret = judgeSecret(this.env);
    const valid = [];
    for (const a of clean.answers) if (await verifyAnswer(secret, a)) valid.push(a);
    if (!valid.length) return json({ error: 'Ninguna respuesta trae una firma válida.' }, 400);
    const result = { ...clean, answers: valid };
    const now = Date.now();
    const key = playerKey(result.name);
    const merged = mergePlayer(this.players.get(key), result, now);
    this.players.set(key, merged);
    await this.ctx.storage.put(`p:${key}`, merged);
    // Las respuestas nicho van a la vitrina.
    const perlas = valid.filter((a) => NICHE_TIERS.includes(a.tier)).map((a) => ({ name: result.name, avatar: result.avatar, promptId: a.promptId, text: a.canonical, tier: a.tier, at: now }));
    if (perlas.length) {
      this.perlas = [...perlas, ...this.perlas].slice(0, MAX_PERLAS);
      await this.ctx.storage.put('perlas', this.perlas);
    }
    // Tope de jugadores guardados: se van los que hace más tiempo no juegan.
    if (this.players.size > MAX_KEPT_PLAYERS) {
      const oldest = [...this.players.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, this.players.size - MAX_KEPT_PLAYERS);
      for (const [k] of oldest) { this.players.delete(k); await this.ctx.storage.delete(`p:${k}`); }
    }
    return json({ ok: true, score: scoreOf(valid), player: merged });
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/api/abismo/ranking' && request.method === 'GET') return json(this.ranking());
    if (request.method !== 'POST') return json({ error: 'No existe.' }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'No se entendió el pedido.' }, 400); }
    if (path === '/api/abismo/juzgar') return this.juzgar(body, request.headers.get('x-ip') || 'sin-ip');
    if (path === '/api/abismo/partida') return this.partida(body);
    return json({ error: 'No existe.' }, 404);
  }
}
