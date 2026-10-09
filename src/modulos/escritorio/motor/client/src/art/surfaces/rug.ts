// Tapetes decorativos (puros): borda escura, filete claro, franjas nas pontas e padrão no campo.
import { ramp, shade } from '../core/color';
import { PixelBuf } from '../core/pixbuf';

export function renderRug(w: number, h: number, color: string, seed: number): PixelBuf {
  const b = new PixelBuf(w, h);
  const m = ramp(color, 0.06);
  const fringe = '#efe6d2';
  // Franjas nas laterais curtas (1px para fora do corpo).
  const x0 = 1;
  const x1 = w - 2;
  for (let y = 2; y < h - 2; y += 2) {
    b.set(0, y, fringe);
    b.set(w - 1, y, fringe);
  }
  b.rect(x0, 0, x1 - x0 + 1, h, m.dk);
  b.rect(x0 + 1, 1, x1 - x0 - 1, h - 2, m.base);
  // Filete claro interno.
  b.rect(x0 + 2, 2, x1 - x0 - 3, 1, m.hi);
  b.rect(x0 + 2, h - 3, x1 - x0 - 3, 1, m.hi);
  b.rect(x0 + 2, 2, 1, h - 4, m.hi);
  b.rect(x1 - 2, 2, 1, h - 4, m.hi);
  // Campo com padrão.
  const fx = x0 + 3;
  const fy = 3;
  const fw = x1 - x0 - 5;
  const fh = h - 6;
  const kind = Math.abs(seed) % 3;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      let c = m.lt;
      if (kind === 0) {
        // Losangos.
        const d = (Math.abs(((x + 3) % 8) - 4) + Math.abs(((y + 3) % 8) - 4)) % 8;
        if (d === 4) c = m.base;
        else if (d === 0) c = m.hi;
      } else if (kind === 1) {
        // Listras.
        if (y % 6 === 0) c = m.base;
        else if (y % 6 === 3) c = shade(m.lt, 0.03);
      } else if ((x * 7 + y * 13) % 11 === 0) c = m.base;
      b.set(fx + x, fy + y, c);
    }
  }
  // Cantos arredondados.
  for (const [cx, cy] of [[x0, 0], [x1, 0], [x0, h - 1], [x1, h - 1]] as const) b.clear(cx, cy);
  return b;
}
