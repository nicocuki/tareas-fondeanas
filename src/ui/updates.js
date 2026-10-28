// Novedades: se leen del archivo `updates` de la raíz, el mismo registro de siempre.
// La versión que muestra la página sale de ahí (la entrada marcada con LATEST).
// Una entrada con OCULTA (`LATEST OCULTA 1.23.0 = …`) cuenta para la versión pero no aparece en
// Novedades ni en la portada: para cambios que no conviene contar (el modo admin).
import raw from '../../updates?raw';

export function parseUpdates(text) {
  return text
    .split(/\r?\n-{8,}\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [head, ...rest] = block.split(/\r?\n/);
      const match = head.match(/^(LATEST\s+)?(OCULTA\s+)?v?(\d+(?:\.\d+)*)\s*=\s*(.*)$/);
      if (!match) return null;
      return {
        latest: Boolean(match[1]),
        hidden: Boolean(match[2]),
        version: match[3],
        title: match[4].trim(),
        notes: rest.map((l) => l.trim()).filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '')),
      };
    })
    .filter(Boolean)
    .reverse();
}

const ALL = parseUpdates(raw);
export const APP_VERSION = `v${(ALL.find((u) => u.latest) || ALL[0])?.version ?? '0'}`;
// Las que se muestran, la más nueva primero (sin las ocultas).
export const UPDATES = ALL.filter((u) => !u.hidden);
