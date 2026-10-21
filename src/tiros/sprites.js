// Sprites de A los Tiros: los dibujos de `sprites/*.svg` (sierra, nubes, explosión, escudo…). Cada uno se
// pasa una vez a un canvas chico al cargarse, así dibujarlo en cada cuadro es copiar píxeles y no
// volver a leer el SVG. Mientras no cargó, `sprite` no dibuja nada.
const URLS = import.meta.glob('./sprites/*.svg', { eager: true, query: '?url', import: 'default' });

// Lado en píxeles del canvas de cada sprite: más grande los que se ven grandes en la pantalla.
const RES = { vortice: 512, abismo: 384, sierra: 384, curativo: 384, escudo: 256, sol: 384, onda: 384, tormenta: 256, explosion: 256 };

const cache = new Map();
if (typeof Image !== 'undefined') {
  for (const [path, url] of Object.entries(URLS)) {
    const name = path.match(/([^/]+)\.svg$/)[1];
    const img = new Image();
    img.onload = () => {
      const side = RES[name] || 128;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side;
      canvas.getContext('2d').drawImage(img, 0, 0, side, side);
      cache.set(name, canvas);
    };
    img.src = url;
  }
}

// Dibuja el sprite `name` centrado en (x, y), de `size` unidades de lado, girado `rot` y con `alpha`.
export function sprite(ctx, name, x, y, size, rot = 0, alpha = 1) {
  const img = cache.get(name);
  if (!img || alpha <= 0.01 || size <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}
