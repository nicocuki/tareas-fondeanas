// Plantillas de memes: vienen de la API pública de Imgflip (los ~100 memes más usados del último
// mes), pasan por nuestro Worker (/api/memes) y quedan así para los juegos.
export const IMGFLIP_URL = 'https://api.imgflip.com/get_memes';
export const MAX_BOXES = 5;

// Respuesta de Imgflip → [{ id, name, url, w, h, boxes }], solo lo que se puede usar.
export function parseImgflip(data) {
  const memes = data?.success ? data.data?.memes : null;
  if (!Array.isArray(memes)) return [];
  return memes
    .filter((m) => m && m.id && /^https:\/\/i\.imgflip\.com\//.test(m.url) && m.width > 50 && m.height > 50 && m.box_count >= 1)
    .map((m) => ({
      id: String(m.id),
      name: String(m.name || '').slice(0, 80),
      url: m.url,
      w: m.width,
      h: m.height,
      boxes: Math.min(MAX_BOXES, m.box_count),
    }));
}

// Dónde arranca cada texto (centro, en % de la imagen): arriba y abajo, como un meme clásico.
export function defaultTexts(boxes) {
  if (boxes <= 1) return [{ t: '', x: 50, y: 12, s: 9 }];
  if (boxes === 2) return [{ t: '', x: 50, y: 12, s: 9 }, { t: '', x: 50, y: 88, s: 9 }];
  return Array.from({ length: boxes }, (_, i) => ({ t: '', x: 50, y: Math.round(10 + (80 * i) / (boxes - 1)), s: 7 }));
}
