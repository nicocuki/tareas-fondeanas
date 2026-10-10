// Novedades: se leen del archivo `updates` de la raíz, el mismo registro de siempre.
// La versión que muestra la página sale de ahí (la entrada marcada con LATEST).
import raw from '../../updates?raw';

export function parseUpdates(text) {
  return text
    .split(/\r?\n-{8,}\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [head, ...rest] = block.split(/\r?\n/);
      const match = head.match(/^(LATEST\s+)?v?(\d+(?:\.\d+)*)\s*=\s*(.*)$/);
      if (!match) return null;
      return {
        latest: Boolean(match[1]),
        version: match[2],
        title: match[3].trim(),
        notes: rest.map((l) => l.trim()).filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '')),
      };
    })
    .filter(Boolean)
    .reverse();
}

export const UPDATES = parseUpdates(raw);
export const APP_VERSION = `v${(UPDATES.find((u) => u.latest) || UPDATES[0])?.version ?? '0'}`;
