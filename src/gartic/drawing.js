// Balde con pila de líneas: evita recursión y funciona en lienzos grandes.
export function floodFill(image, x, y, color) {
  const { data, width, height } = image;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const start = (y * width + x) * 4;
  const target = Array.from(data.slice(start, start + 4));
  if (target.every((c, i) => Math.abs(c - color[i]) <= 12)) return false;
  const matches = (px, py) => {
    const p = (py * width + px) * 4;
    return target.every((c, i) => Math.abs(data[p + i] - c) <= 12);
  };
  const paint = (px, py) => data.set(color, (py * width + px) * 4);
  const stack = [[x, y]];
  while (stack.length) {
    const [sx, sy] = stack.pop();
    if (!matches(sx, sy)) continue;
    let left = sx;
    while (left > 0 && matches(left - 1, sy)) left--;
    let above = false, below = false;
    for (let px = left; px < width && matches(px, sy); px++) {
      paint(px, sy);
      const up = sy > 0 && matches(px, sy - 1);
      const down = sy < height - 1 && matches(px, sy + 1);
      if (up && !above) stack.push([px, sy - 1]);
      if (down && !below) stack.push([px, sy + 1]);
      above = up; below = down;
    }
  }
  return true;
}

// Trazos grabados, para reproducir el dibujo en el álbum. Cada operación es un array corto:
// [herramienta, color, grosor, ...coordenadas enteras]. Herramientas: 'p' lápiz, 'e' goma,
// 'l' línea, 'r'/'R' rectángulo (vacío/relleno), 'o'/'O' círculo, 'b' balde, 'c' limpiar.
export const TOOL_CODES = { pencil: 'p', eraser: 'e', line: 'l', rect: 'r', filledRect: 'R', ellipse: 'o', filledEllipse: 'O', bucket: 'b' };

export function parseStrokes(text) {
  if (!text) return null;
  try {
    const ops = JSON.parse(text);
    return Array.isArray(ops) && ops.every((op) => Array.isArray(op) && typeof op[0] === 'string') ? ops : null;
  } catch { return null; }
}

// Cuánto "pesa" cada operación en la reproducción: el lápiz, un paso por punto; lo demás, uno.
export function opUnits(op) {
  return op[0] === 'p' || op[0] === 'e' ? Math.max(1, (op.length - 3) / 2) : 1;
}

function style(ctx, op) {
  const color = op[0] === 'e' ? '#ffffff' : op[1];
  ctx.lineWidth = op[2]; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.fillStyle = color;
}

function hexRgb(color) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

// Dibuja los puntos [from, to) del trazo de lápiz/goma `op`.
function drawPencil(ctx, op, from, to) {
  style(ctx, op);
  for (let i = from; i < to; i++) {
    const x = op[3 + i * 2], y = op[4 + i * 2];
    ctx.beginPath();
    if (i === 0) { ctx.arc(x, y, op[2] / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    ctx.moveTo(op[1 + i * 2], op[2 + i * 2]);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

// Dibuja una operación entera (salvo el lápiz, que va por puntos).
export function drawOp(ctx, op, width, height) {
  const [t] = op;
  if (t === 'p' || t === 'e') { drawPencil(ctx, op, 0, (op.length - 3) / 2); return; }
  if (t === 'c') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); return; }
  style(ctx, op);
  const [, , , x, y, ex, ey] = op;
  if (t === 'b') {
    const pixels = ctx.getImageData(0, 0, width, height);
    floodFill(pixels, x, y, [...hexRgb(op[1]), 255]);
    ctx.putImageData(pixels, 0, 0);
    return;
  }
  ctx.beginPath();
  if (t === 'l') { ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); }
  else if (t === 'r') ctx.strokeRect(x, y, ex - x, ey - y);
  else if (t === 'R') ctx.fillRect(x, y, ex - x, ey - y);
  else {
    ctx.ellipse((x + ex) / 2, (y + ey) / 2, Math.abs(ex - x) / 2, Math.abs(ey - y) / 2, 0, 0, Math.PI * 2);
    if (t === 'O') ctx.fill(); else ctx.stroke();
  }
}

// Reproducción incremental: cada llamada a `advance(units)` dibuja lo que falta hasta ahí.
export function makeReplayer(ctx, ops, width, height) {
  const total = ops.reduce((sum, op) => sum + opUnits(op), 0);
  let op = 0, point = 0, done = 0;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  return {
    total,
    advance(target) {
      while (op < ops.length && done < target) {
        const current = ops[op];
        if (current[0] === 'p' || current[0] === 'e') {
          const points = (current.length - 3) / 2;
          const to = Math.min(points, point + Math.ceil(target - done));
          drawPencil(ctx, current, point, to);
          done += to - point; point = to;
          if (point < points) return;
        } else {
          drawOp(ctx, current, width, height);
          done += 1;
        }
        op++; point = 0;
      }
    },
  };
}
