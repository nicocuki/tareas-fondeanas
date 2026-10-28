// Buzón de sugerencias de la portada. Cada sugerencia se guarda (respaldo) y se manda a un canal de
// Discord por webhook (`SUGERENCIAS_WEBHOOK`, un secreto del Worker: nunca va en el repo).
// Lo puro (limpiar, limitar envíos, armar el mensaje) está acá y se prueba con `node --test`.

export const MIN_TEXT = 5;
export const MAX_TEXT = 500;
export const MAX_NAME = 30;
export const MAX_KEPT = 200;        // cuántas se guardan de respaldo
export const GAP_MS = 30_000;       // entre un envío y el siguiente de la misma persona
export const PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

// Lo que escribió la persona, ya limpio. Devuelve { text, name } o { error } (en castellano, para mostrarlo).
export function cleanSuggestion(body) {
  const text = String(body?.text ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const name = String(body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (text.length < MIN_TEXT) return { error: `Escribí un poco más (al menos ${MIN_TEXT} letras).` };
  if (text.length > MAX_TEXT) return { error: `Es muy larga: hasta ${MAX_TEXT} caracteres.` };
  return { text, name };
}

// ¿Puede mandar otra ahora? `times` son los momentos de sus envíos anteriores.
export function allowSend(times, now) {
  const recent = times.filter((t) => now - t < HOUR_MS);
  const last = Math.max(0, ...recent);
  if (recent.length && now - last < GAP_MS) return { ok: false, error: 'Esperá unos segundos antes de mandar otra.' };
  if (recent.length >= PER_HOUR) return { ok: false, error: 'Ya mandaste varias: probá de nuevo más tarde.' };
  return { ok: true, times: [...recent, now] };
}

// El mensaje de Discord. Sin menciones: nadie puede hacer sonar @everyone desde la página.
export function discordPayload(s) {
  return {
    username: 'Buzón de Tareas Fondeanas',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: '💡 Nueva sugerencia',
      description: s.text.slice(0, 2000),
      color: 0xffd23f,
      footer: { text: `de ${s.name || 'alguien sin firmar'}` },
      timestamp: new Date(s.at).toISOString(),
    }],
  };
}
