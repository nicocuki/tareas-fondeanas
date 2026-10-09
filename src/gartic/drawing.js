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
