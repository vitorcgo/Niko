// Corredor que atravessa o prédio de oeste a leste, com bebedouros, bancos e plantas.
import { COL_W, CORE_COLS, CORRIDOR_H, CORRIDOR_Y } from '../constants';
import { AreaBuilder } from './builder';
import type { AreaLayout } from './types';

export const CORRIDOR_ID = 'core:corredor';

const TALL = ['ficus', 'palm', 'monstera', 'bonsai'] as const;
const SMALL = ['fern', 'succulent', 'flower'] as const;
/** Passadeira: uma família de cor só (azul-acinzentado discreto), com leve variação de tom. */
const RUNNERS = ['#8b9bb0', '#8597ab', '#909fb3'] as const;

export function layoutCorridor(cols: number): AreaLayout {
  const w = cols * COL_W;
  const b = new AreaBuilder(CORRIDOR_ID, 'corridor', { x: 0, y: CORRIDOR_Y, w, h: CORRIDOR_H });
  b.floor('concrete', 0, 0, w, CORRIDOR_H, 501);
  // fachadas de vidro nas pontas do corredor (entrada principal a oeste)
  for (let ly = 0; ly < CORRIDOR_H; ly++) {
    b.furn('glass_partition', 0, ly, ly === 0 || ly === CORRIDOR_H - 1 ? 'end' : 'v', { order: 0.1 });
    b.furn('glass_partition', w - 1, ly, ly === 0 || ly === CORRIDOR_H - 1 ? 'end' : 'v', { order: 0.1 });
  }
  b.walk(1, 0, w - 2, CORRIDOR_H);

  for (let c = 0; c < cols; c++) {
    const x = c * COL_W;
    const last = c === cols - 1;
    if (c === 0) {
      b.furn('plant_tall', x + 2, 4, 'palm', { order: 0.5 });
      b.furn('plant_small', x + 13, 4, 'flower', { order: 0.5 });
    } else if (c === 1) {
      const bench = b.furn('bench', x + 2, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', x + 2 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.furn('plant_tall', x + 13, 0, 'monstera', { order: 0.5 });
    } else {
      // colunas de projeto alternam: bebedouro (pares) e banco de espera (ímpares)
      const k = c - CORE_COLS;
      if (k % 2 === 0) {
        b.furn('water_cooler', x + 3, 0, undefined, { order: 0.5 });
        b.spot('water', x + 3, 1, 'up', { dy: -3 });
        b.furn('plant_small', x + 4, 0, SMALL[k % SMALL.length], { order: 0.5 });
      } else {
        const bench = b.furn('bench', x + 11, 0, undefined, { order: 0.5 });
        for (let i = 0; i < 2; i++) b.seat('bench', 'bench', x + 11 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
        b.furn('plant_tall', x + 13, 0, TALL[k % TALL.length], { order: 0.5 });
      }
      if (k % 2 === 1) b.furn('plant_small', x + 12, 4, SMALL[(k + 1) % SMALL.length], { order: 0.5 });
    }
    // planta alta onde as paredes das salas se encontram (uma coluna sim, outra não)
    if (!last && c % 2 === 1) b.furn('plant_tall', x + 15, 4, TALL[(c + 1) % TALL.length], { order: 0.5 });
    // passadeira estreita (um trecho por coluna), centrada no corredor
    b.rug(x + 2, 1.95, COL_W - 4, 1.1, RUNNERS[c % RUNNERS.length], 502 + c);
    // pontos de conversa no meio do corredor
    b.spot('talk', x + 5, 2, 'right', { group: `talk:corredor:${c}`, dx: -1 });
    b.spot('talk', x + 6, 2, 'left', { group: `talk:corredor:${c}`, dx: 1 });
  }
  return b.build();
}
