// El juez de Abismo: lo puro, sin `cloudflare:workers`, para probarlo con `node --test`.
//
// Una respuesta se juzga con un modelo de lenguaje: ¿pertenece a la categoría? ¿qué tan nicho es (0 a 100)? De
// ahí sale el nivel (`tierForRarity`). Acá está cómo se le pregunta (`buildJudgePrompt`), cómo se lee lo que
// contesta (`parseVerdict`, `verdictToResult`), un juez de mentira para probar sin modelo (`fakeVerdict`), la
// firma de cada veredicto (`signAnswer`: con eso el ranking sabe que los puntos salieron del juez y no de la
// consola) y el límite de pedidos por persona. El Durable Object que lo usa está en abismo.js.
import { MAX_NOTE, NICHE_TIERS, TIER_BY_ID, answerKey, cleanAnswer, tierById, tierForRarity } from '../src/abismo/tiers.js';
import { PROMPT_BY_ID } from '../src/abismo/prompts.js';

export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 40;          // veredictos por minuto por persona (hash de la IP)
export const MAX_KEPT_PLAYERS = 300; // cuántos jugadores guarda el ranking
export const MAX_PERLAS = 120;       // cuántas respuestas nicho guarda la vitrina
export const MAX_RANKING_NAME = 20;
export const DEFAULT_SECRET = 'abismo-sin-clave';

// ¿Puede pedir otro veredicto ahora? `times` son los momentos de sus pedidos recientes.
export function allowJudge(times, now) {
  const recent = (times || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return { ok: false, error: 'Frená un poco: demasiadas respuestas seguidas.' };
  return { ok: true, times: [...recent, now] };
}

// El JSON que tiene que devolver el modelo.
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    valid: { type: 'boolean' },
    canonical: { type: 'string' },
    rarity: { type: 'integer' },
    reason: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['valid', 'canonical', 'rarity', 'reason', 'note'],
  additionalProperties: false,
};

const SYSTEM = `Sos el juez de Abismo, un juego donde cada jugador responde una consigna con la respuesta MÁS NICHO que se le ocurra, siempre que sea válida. Te dan la consigna, las respuestas más obvias (de referencia) y la respuesta de un jugador. Decidís tres cosas:

1. "valid": si la respuesta es un miembro genuino, real y verificable de la categoría. Aceptá errores de tipeo, faltas de ortografía, mayúsculas, nombres en inglés o en otra variante del español y nombres incompletos pero inequívocos; escribí la forma correcta y completa en "canonical" (en español si existe). Rechazá lo que no existe o no pertenece a la categoría, la categoría misma o algo demasiado genérico (p. ej. «un pez» cuando piden un pez), una descripción en vez de un nombre, varias respuestas juntas, groserías sueltas y cosas tan oscuras que no podés verificar que existan.

2. "rarity" (0 a 100): qué tan nicho es la respuesta para gente joven hispanohablante, sobre todo de Argentina. 0 = lo primero que diría cualquiera. 15 = muy común. 35 = conocida, pero no la primera que sale. 55 = la sabe una minoría. 75 = la conocen pocos, hay que saber del tema. 90 o más = casi nadie la conoce o la recordaría; es de entendido. Las respuestas de referencia valen entre 0 y 15. Ojo con la trampa clásica: lo que dice todo el que se quiere hacer el vivo (p. ej. «ornitorrinco» para un animal que pone huevos, «Tehachapi»-style para una ciudad famosa por ser «la rara») vale 25 a 40, no 80. Sé exigente: 85 o más solo para respuestas que de verdad casi nadie daría.

3. "note": un comentario de una sola línea sobre la respuesta, en español rioplatense (con vos), con onda y sin ofender, de hasta 60 caracteres y sin comillas. Si la respuesta no vale, "reason" explica por qué en hasta 60 caracteres (y "note" puede quedar vacío).

Respondé únicamente con un JSON con esta forma: {"valid": true, "canonical": "…", "rarity": 0, "reason": "", "note": "…"}.`;

// El mensaje para el modelo. `prompt` es una consigna de prompts.js; `answer`, lo que escribió el jugador.
export function buildJudgePrompt(prompt, answer) {
  const user = [
    `Consigna: «${prompt.text}».`,
    `Respuestas de referencia (las más obvias, rareza 0 a 15): ${prompt.ex.join(', ')}.`,
    `Respuesta del jugador: «${cleanAnswer(answer)}».`,
  ].join('\n');
  return { system: SYSTEM, user };
}

// Lo que contestó el modelo (texto o ya objeto) → { valid, canonical, rarity, reason, note } o null si no se entiende.
export function parseVerdict(raw) {
  let v = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    try { v = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  }
  if (!v || typeof v !== 'object') return null;
  if (typeof v.valid !== 'boolean') return null;
  const rarity = Math.max(0, Math.min(100, Math.round(Number(v.rarity))));
  if (v.valid && !Number.isFinite(rarity)) return null;
  const line = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  return { valid: v.valid, canonical: cleanAnswer(v.canonical), rarity: Number.isFinite(rarity) ? rarity : 0, reason: line(v.reason), note: line(v.note) };
}

// Del veredicto al resultado que ve el jugador.
export function verdictToResult(answer, v) {
  const text = cleanAnswer(answer);
  if (!v) return { ok: false, reason: 'El juez no se decidió. Probá de nuevo.' };
  if (!v.valid) return { ok: false, reason: v.reason || 'Eso no entra en la categoría.' };
  const tier = tierForRarity(v.rarity);
  return { ok: true, text, canonical: v.canonical || text, tier: tier.id, pts: tier.pts, rarity: v.rarity, note: v.note };
}

// Un juez de mentira para probar la interfaz sin modelo (`wrangler dev --var JUEZ_FALSO:1`): las respuestas de
// referencia son Plancton, lo demás sale de un hash del texto, y lo muy corto o con números no vale.
export function fakeVerdict(prompt, answer) {
  const key = answerKey(answer);
  if (key.length < 3) return { valid: false, canonical: '', rarity: 0, reason: 'Muy corto para ser una respuesta.', note: '' };
  if (/\d/.test(key)) return { valid: false, canonical: '', rarity: 0, reason: 'Eso no parece de la categoría.', note: '' };
  if (prompt.ex.some((e) => answerKey(e) === key)) return { valid: true, canonical: cleanAnswer(answer), rarity: 5, reason: '', note: 'Lo primero que se le ocurre a cualquiera.' };
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  const rarity = 16 + (h % 85);
  return { valid: true, canonical: cleanAnswer(answer), rarity, reason: '', note: 'Juez de prueba: la rareza sale de un hash.' };
}

// ─── Firma ───────────────────────────────────────────────────────────────────
// Cada veredicto va firmado con un secreto del Worker (ABISMO_CLAVE, o la del admin). El ranking global solo
// suma puntos que traigan una firma válida: así nadie se anota una partida inventada desde la consola.
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  // 8 bytes (16 hex): alcanza para que no se adivine, y la sala guarda una firma por respuesta.
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const signAnswer = (secret, promptId, canonical, tier) => hmac(secret, `abismo|${promptId}|${answerKey(canonical)}|${tier}`);

export async function verifyAnswer(secret, a) {
  if (!a || typeof a.sig !== 'string') return false;
  return (await signAnswer(secret, a.promptId, a.canonical, a.tier)) === a.sig;
}

export const judgeSecret = (env) => String(env?.ABISMO_CLAVE || env?.ADMIN_CLAVE || env?.SUGERENCIAS_CLAVE || DEFAULT_SECRET);

// ─── Ranking ─────────────────────────────────────────────────────────────────
// Lo que manda cada pantalla al terminar una partida, limpio: { name, avatar, answers } o { error }.
export function cleanResult(body) {
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_RANKING_NAME);
  const avatar = typeof body?.avatar === 'string' ? body.avatar.slice(0, 4) : '';
  if (!name) return { error: 'Falta el nombre.' };
  const list = Array.isArray(body?.answers) ? body.answers.slice(0, 20) : [];
  const answers = [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || !PROMPT_BY_ID[a.promptId] || !tierById(a.tier)) continue;
    const canonical = cleanAnswer(a.canonical) || cleanAnswer(a.text);
    if (!canonical) continue;
    answers.push({ promptId: a.promptId, canonical, tier: a.tier, sig: typeof a.sig === 'string' ? a.sig : '' });
  }
  if (!answers.length) return { error: 'No hay respuestas que contar.' };
  return { name, avatar, answers };
}

export const scoreOf = (answers) => answers.reduce((sum, a) => sum + (TIER_BY_ID[a.tier]?.pts || 0), 0);
export const nicheCount = (answers) => answers.filter((a) => NICHE_TIERS.includes(a.tier)).length;
export const krillCount = (answers) => answers.filter((a) => a.tier === 'krill').length;

// La clave de un jugador en el ranking: el nombre sin mayúsculas ni tildes (el avatar no cuenta, para que cambiarlo no te parta en dos).
export const playerKey = (name) => answerKey(name);

// Suma una partida a lo que ya tenía el jugador.
export function mergePlayer(prev, result, now) {
  const score = scoreOf(result.answers);
  const p = prev || { games: 0, best: 0, niche: 0, krill: 0, total: 0 };
  return {
    name: result.name,
    avatar: result.avatar || p.avatar || '',
    games: p.games + 1,
    best: Math.max(p.best, score),
    niche: p.niche + nicheCount(result.answers),
    krill: p.krill + krillCount(result.answers),
    total: p.total + score,
    at: now,
  };
}

// Las dos tablas que muestra la portada del juego: más respuestas nicho acumuladas y mejor inmersión.
export function rankingTables(players, limit = 30) {
  const list = Object.values(players);
  const byNiche = [...list].sort((a, b) => b.niche - a.niche || b.krill - a.krill || b.best - a.best).slice(0, limit);
  const byBest = [...list].sort((a, b) => b.best - a.best || b.niche - a.niche).slice(0, limit);
  return { niche: byNiche, best: byBest };
}
