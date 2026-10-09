// Núcleo do prédio (colunas 0 e 1): recepção com elevadores, banheiros, copa e lounge.
import type { WallStyle } from '../../art/api';
import { COL_W, NORTH_Y, ROOM_H, SOUTH_Y, TILE } from '../constants';
import { AreaBuilder, SEATED_SORT_BIAS } from './builder';
import type { AreaLayout } from './types';

export const RECEPTION_ID = 'core:recepcao';
export const RESTROOM_ID = 'core:banheiros';
export const CAFE_ID = 'core:copa';
export const LOUNGE_ID = 'core:lounge';

/** Paredes do núcleo: tons claros e neutros (frios), com acabamentos diferentes por ambiente. */
export const CORE_WALLS = {
  reception: { base: '#e9e5dc', trim: '#a88e6c', pattern: 'wood_panel' } satisfies WallStyle,
  restroom: { base: '#dce8ee', trim: '#8fb0c0', pattern: 'tiles' } satisfies WallStyle,
  cafe: { base: '#eef0ee', trim: '#9aa6ad', pattern: 'plain' } satisfies WallStyle,
  cafeSplash: { base: '#d9dcdf', trim: '#8d969e', pattern: 'marble' } satisfies WallStyle,
  lounge: { base: '#e6e2ea', trim: '#8f8aa3', pattern: 'plain' } satisfies WallStyle,
  glass: { base: '#cfe6f0', trim: '#9fb9c6', pattern: 'glass' } satisfies WallStyle,
};

/** Centros (em tiles locais) dos dois elevadores na face norte da recepção. */
export const ELEVATOR_CX = [3, 6.5] as const;

export function layoutReception(): AreaLayout {
  const b = new AreaBuilder(RECEPTION_ID, 'reception', { x: 0, y: NORTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.reception;
  b.floor('marble', 0, 0, 16, 12, 101);
  b.rug(1.5, 2.2, 6.5, 2.6, '#3d5a80', 102);
  b.rug(8.6, 6.4, 5.2, 3.2, '#b65f3a', 103);
  b.face(0.5, 15, wall);
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);

  // elevadores (é por onde todos chegam e vão embora)
  ELEVATOR_CX.forEach((cx, i) => {
    b.wall('elevator', cx, undefined, { order: 0.2 + i * 0.1 });
    const lx = Math.floor(cx - 0.5);
    b.spot('elevator', lx, 2, 'up', { x: b.px(cx), y: b.py(2) + 2, group: `elevator:${i}` });
  });
  b.wall('sign', 11, undefined, { order: 0.9 });
  b.wall('clock', 8.15, undefined, { order: 0.7 });
  b.wall('painting', 14.25, undefined, { order: 0.6 });

  b.furn('plant_tall', 1, 2, 'monstera', { order: 0.2 });
  b.furn('plant_tall', 14, 4, 'ficus', { order: 0.21 });
  b.furn('reception_desk', 9, 5, undefined, { order: 0.4 });
  b.furn('plant_small', 12, 5, 'flower', { order: 0.45 });
  b.furn('filing_cabinet', 8, 5, undefined, { order: 0.42 });
  // cantinho de espera com poltronas
  b.seat('armchair', 'armchair', 9, 8, 'right', 'right', { order: 0.6 });
  b.furn('coffee_table', 10, 8, undefined, { order: 0.58 });
  b.seat('armchair', 'armchair', 12, 8, 'left', 'left', { order: 0.61 });
  b.furn('plant_tall', 14, 9, 'palm', { order: 0.22 });

  // banco de espera (olhando para baixo)
  const bench = b.furn('bench', 2, 7, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 2 + i, 7, 'down', undefined, { noFurniture: true, furnitureId: bench });
  b.furn('plant_small', 4, 7, 'fern', { order: 0.52 });
  b.furn('water_cooler', 1, 7, undefined, { order: 0.53 });
  b.spot('water', 1, 8, 'up', { dy: -3 });

  // aberta para o corredor: divisórias de vidro nas pontas
  for (const lx of [1, 2, 3, 12, 13, 14]) b.furn('glass_partition', lx, 11, 'h', { order: 0.15 });
  b.walk(1, 2, 14, 10);
  b.spot('talk', 6, 9, 'right', { group: 'talk:recepcao', dx: -1 });
  b.spot('talk', 7, 9, 'left', { group: 'talk:recepcao', dx: 1 });

  const a = b.build();
  a.shade = undefined;
  return a;
}

export function layoutRestroom(): AreaLayout {
  const b = new AreaBuilder(RESTROOM_ID, 'restroom', { x: 0, y: SOUTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.restroom;
  b.floor('tile_white', 0, 0, 16, 12, 201);
  // tapetinho só na frente das pias (nada de tapete grande no meio do banheiro)
  b.rug(2, 3.15, 3, 0.85, '#6fa3b8', 202);
  b.face(0.5, 15, wall, [{ lx: 7, w: 2 }]);
  b.wall('door_frame', 8, undefined, { order: 0.05 });
  b.south(0.5, 15, 11, { ...wall, exterior: true });
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);
  b.walk(1, 2, 14, 9);
  b.walk(7, 0, 2, 2);
  b.area.door = { x: 7, y: SOUTH_Y, w: 2, h: 2 };

  // pias com espelho
  for (let i = 0; i < 3; i++) {
    b.wall('mirror', 2.5 + i, undefined, { order: 0.3 });
    b.furn('sink', 2 + i, 2, undefined, { order: 0.35 });
    b.spot('sink', 2 + i, 3, 'up', { dy: -3 });
  }
  b.furn('trash_bin', 5, 2, undefined, { order: 0.4 });
  b.furn('plant_small', 1, 2, 'fern', { order: 0.2 });
  b.wall('clock', 6, undefined, { order: 0.5 });

  // cabines encostadas na parede norte (entram pela porta ao sul e somem)
  for (let i = 0; i < 3; i++) {
    const lx = 9 + i * 2;
    const stall = b.furn('toilet_stall', lx, 2, undefined, { order: 0.3 + i * 0.05 });
    b.spot('stall', lx, 4, 'up', { furnitureId: stall, x: b.px(lx + 1), y: b.py(4) - 3, sortY: b.py(4) - 0.5 });
  }
  b.wall('poster', 1.5, 'cat', { order: 0.5 });
  b.furn('plant_small', 14, 6, 'succulent', { order: 0.2 });
  b.furn('plant_tall', 1, 10, 'ficus', { order: 0.21 });
  b.furn('plant_tall', 14, 10, 'monstera', { order: 0.22 });
  const bench = b.furn('bench', 3, 9, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) b.seat('bench', 'bench', 3 + i, 9, 'down', undefined, { noFurniture: true, furnitureId: bench });
  b.furn('trash_bin', 9, 10, undefined, { order: 0.6 });
  b.rug(2.5, 9.9, 3, 0.9, '#9cc3cf', 203);
  b.furn('plant_small', 1, 6, 'flower', { order: 0.24 });
  b.furn('plant_small', 12, 10, 'fern', { order: 0.25 });
  return b.build();
}

export function layoutCafe(): AreaLayout {
  const b = new AreaBuilder(CAFE_ID, 'cafe', { x: COL_W, y: NORTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.cafe;
  b.floor('tile_check', 0, 0, 16, 12, 301);
  // frontão de mármore atrás da bancada + parede clara com janelas
  b.face(0.5, 9, CORE_WALLS.cafeSplash);
  b.face(9.5, 6, wall);
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);

  // bancada encostada na parede norte
  b.furn('fridge', 1, 2, undefined, { order: 0.2 });
  b.spot('fridge', 1, 3, 'up', { dy: -3 });
  b.furn('counter', 2, 2, 'drawers', { order: 0.22 });
  b.furn('counter_sink', 3, 2, undefined, { order: 0.24 });
  b.spot('sink', 3, 3, 'up', { dy: -3 });
  b.furn('counter', 4, 2, 'plain', { order: 0.26 });
  for (const lx of [5, 6]) {
    const m = b.furn('coffee_machine', lx, 2, undefined, { order: 0.28 });
    b.spot('coffee', lx, 3, 'up', { dy: -3, furnitureId: m });
  }
  b.furn('microwave', 7, 2, undefined, { order: 0.3 });
  b.furn('counter', 8, 2, 'drawers', { order: 0.32 });
  b.wall('shelf_wall', 3, undefined, { order: 0.4 });
  // cardápio do café acima das cafeteiras
  b.wall('poster', 5.5, 'coffee', { order: 0.45 });
  b.wall('clock', 7.5, undefined, { order: 0.6 });

  const vend = b.furn('vending_machine', 9, 2, undefined, { order: 0.34 });
  b.spot('snack', 9, 3, 'up', { dy: -3, furnitureId: vend });
  b.furn('water_cooler', 10, 2, undefined, { order: 0.36 });
  b.spot('water', 10, 3, 'up', { dy: -3 });
  // janelas (nada alto na frente delas)
  b.wall('window', 12, undefined, { order: 0.4 });
  b.wall('window', 14.25, undefined, { order: 0.45 });
  b.spot('window', 11, 2, 'up', { dx: 8, dy: 1 });
  b.spot('window', 13, 2, 'up', { dx: 12, dy: 1 });

  // mesa comunitária comprida no centro, sobre um tapete, com cadeiras dos dois lados
  b.rug(2.6, 4.15, 8.8, 3.7, '#b98a5e', 302);
  b.furn('meeting_table', 4, 5, undefined, { order: 0.5 });
  b.furn('meeting_table', 7, 5, undefined, { order: 0.51 });
  for (let i = 0; i < 6; i++) {
    const lx = 4 + i;
    b.seat('cafe_seat', 'cafe_chair', lx, 4, 'down', 'down', { order: 0.55 + i * 0.01 });
    b.seat('cafe_seat', 'cafe_chair', lx, 7, 'up', 'up', { order: 0.62 + i * 0.01 });
  }
  b.furn('plant_small', 3, 5, 'flower', { order: 0.52 });

  // mesinhas bistrô junto às janelas
  for (const [lx, ly, i] of [
    [12, 5, 0],
    [12, 8, 1],
  ] as const) {
    b.furn('cafe_table', lx, ly, undefined, { order: 0.7 + i * 0.03 });
    b.seat('cafe_seat', 'cafe_chair', lx - 1, ly, 'right', 'right', { order: 0.72 + i * 0.03 });
    b.seat('cafe_seat', 'cafe_chair', lx + 1, ly, 'left', 'left', { order: 0.73 + i * 0.03 });
  }
  b.furn('plant_tall', 1, 10, 'monstera', { order: 0.2 });
  b.furn('plant_tall', 14, 10, 'ficus', { order: 0.21 });
  b.furn('trash_bin', 1, 6, undefined, { order: 0.6 });

  // aberta para o corredor com vidro
  for (const lx of [1, 2, 3, 4, 5, 10, 11, 12, 13, 14]) b.furn('glass_partition', lx, 11, 'h', { order: 0.15 });
  b.walk(1, 2, 14, 10);
  b.spot('talk', 7, 9, 'right', { group: 'talk:copa', dx: -1 });
  b.spot('talk', 8, 9, 'left', { group: 'talk:copa', dx: 1 });
  b.area.shade = undefined;
  return b.build();
}

export function layoutLounge(): AreaLayout {
  const b = new AreaBuilder(LOUNGE_ID, 'lounge', { x: COL_W, y: SOUTH_Y, w: COL_W, h: ROOM_H });
  const wall = CORE_WALLS.lounge;
  b.floor('wood', 0, 0, 16, 12, 401);
  b.rug(1.5, 3.2, 7, 5.2, '#4f8a5b', 402);
  b.rug(9.2, 4.6, 5.6, 4.4, '#d7c8a8', 403);
  // parede com TV a oeste; vidro a leste; passagem larga no meio
  b.face(0.5, 6.5, wall);
  b.face(10, 5.5, CORE_WALLS.glass);
  b.south(0.5, 15, 11, { ...wall, exterior: true });
  b.cap(0, 0, 0.5, 12, wall);
  b.cap(15.5, 0, 0.5, 12, wall);
  b.walk(1, 2, 14, 9);
  b.walk(7, 0, 3, 2);
  b.area.door = { x: COL_W + 7, y: SOUTH_Y, w: 3, h: 2 };

  b.wall('tv', 4.5, undefined, { order: 0.4 });
  b.wall('painting', 1.75, undefined, { order: 0.5 });

  // sofá de costas para a câmera, de frente para a TV
  const sofa = b.furn('sofa', 3, 6, 'up', { order: 0.5 });
  for (let i = 0; i < 3; i++) b.seat('sofa', 'sofa', 3 + i, 6, 'up', 'up', { noFurniture: true, furnitureId: sofa });
  b.furn('coffee_table', 3, 4, undefined, { dx: TILE / 2, order: 0.45 });
  b.block(5, 4, 1, 1);
  b.seat('armchair', 'armchair', 2, 4, 'right', 'right', { order: 0.55 });
  b.seat('armchair', 'armchair', 6, 4, 'left', 'left', { order: 0.56 });

  // ping-pong (jogadores nas pontas oeste/leste)
  b.furn('pingpong_table', 10, 6, undefined, { order: 0.4 });
  const ppY = b.py(7) + 5;
  const ppSort = b.py(8) + SEATED_SORT_BIAS;
  b.spot('pingpong', 9, 7, 'right', { x: b.px(10) - 8, y: ppY, group: 'pingpong', sortY: ppSort });
  b.spot('pingpong', 13, 7, 'left', { x: b.px(13) + 8, y: ppY, group: 'pingpong', sortY: ppSort });

  // fliperamas e estantes
  for (const lx of [13, 14]) {
    b.furn('arcade', lx, 2, undefined, { order: 0.3 });
    b.spot('arcade', lx, 3, 'up', { dy: -3 });
  }
  b.furn('bookshelf', 10, 2, undefined, { order: 0.3 });
  b.spot('shelf', 10, 3, 'up', { dx: 8, dy: -2 });
  b.furn('binder_shelf', 12, 2, undefined, { order: 0.31 });
  // planta baixa sob o quadro (uma alta cobriria a pintura)
  b.furn('plant_small', 1, 2, 'fern', { order: 0.2 });
  b.furn('plant_tall', 6, 2, 'palm', { order: 0.21 });
  b.furn('printer', 1, 10, undefined, { order: 0.3 });
  b.furn('floor_lamp', 1, 7, undefined, { order: 0.32 });
  b.furn('plant_tall', 14, 10, 'monstera', { order: 0.22 });

  // puffs
  (['red', 'blue', 'yellow'] as const).forEach((c, i) => {
    b.seat('beanbag', 'beanbag', 6 + i * 2, 9, 'down', c, { order: 0.6 + i * 0.02 });
  });
  b.spot('talk', 11, 9, 'right', { group: 'talk:lounge', dx: -1 });
  b.spot('talk', 12, 9, 'left', { group: 'talk:lounge', dx: 1 });
  // torcida do ping-pong: atrás da mesa, de frente para a câmera
  b.spot('watch', 10, 5, 'down', { group: 'watch:pingpong', dx: 2 });
  b.spot('watch', 12, 5, 'down', { group: 'watch:pingpong', dx: -2 });
  return b.build();
}
