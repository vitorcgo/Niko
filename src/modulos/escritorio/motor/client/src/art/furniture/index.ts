// Despacho dos móveis por kind (puro). Cada combinação (kind, variant, state, variação) é gerada uma
// vez e guardada em cache por quem chama (ver art/index.ts).
import { FURNITURE, type FurnitureKind } from '../api';
import { trim, type BufFurniture } from '../core/sprite';
import * as C from './common';
import * as O from './office';
import * as W from './wall';

/** Quantas variações de detalhes (seed) cada kind tem; os demais ignoram a seed. */
export const SEED_VARIATIONS: Partial<Record<FurnitureKind, number>> = {
  desk: 6,
  desk_back: 4,
  bookshelf: 4,
  binder_shelf: 4,
  meeting_table: 2,
  shelf_wall: 3,
  painting: 2,
  coffee_table: 2,
  plant_small: 3,
  plant_tall: 3,
};

/** Normaliza variante/estado para valores válidos do catálogo. */
export function normalizeFurniture(kind: FurnitureKind, variant?: string, state?: number, seed?: number): { variant: string | undefined; state: number; vseed: number } {
  const def = FURNITURE[kind];
  const v = def.variants ? (variant && def.variants.includes(variant) ? variant : def.variants[0]) : undefined;
  const states = def.states ?? 1;
  const st = Math.max(0, Math.min(states - 1, Math.floor(state ?? 0)));
  const n = SEED_VARIATIONS[kind] ?? 1;
  const vseed = n > 1 ? (((Math.floor(seed ?? 0) % n) + n) % n) : 0;
  return { variant: v, state: st, vseed };
}

function build(kind: FurnitureKind, variant: string | undefined, state: number, seed: number): BufFurniture {
  switch (kind) {
    case 'desk':
      return O.desk(variant, seed);
    case 'desk_back':
      return O.deskBack(variant, seed);
    case 'office_chair':
      return O.officeChair(variant);
    case 'office_chair_front':
      return O.officeChairFront(variant);
    case 'bookshelf':
      return O.bookshelf(seed);
    case 'filing_cabinet':
      return O.filingCabinet();
    case 'printer':
      return O.printer();
    case 'trash_bin':
      return O.trashBin();
    case 'plant_small':
      return O.plantSmall(variant, seed);
    case 'plant_tall':
      return O.plantTall(variant, seed);
    case 'glass_partition':
      return O.glassPartition(variant);
    case 'binder_shelf':
      return O.binderShelf(seed);
    case 'meeting_table':
      return O.meetingTable(seed);
    case 'stool':
      return O.stool();
    case 'floor_lamp':
      return O.floorLamp();
    case 'water_cooler':
      return O.waterCooler();
    case 'whiteboard':
      return W.whiteboard();
    case 'window':
      return W.windowItem();
    case 'clock':
      return W.clock();
    case 'poster':
      return W.poster(variant);
    case 'painting':
      return W.painting(seed);
    case 'tv':
      return W.tv();
    case 'light_switch':
      return W.lightSwitch(variant);
    case 'elevator':
      return W.elevator(state);
    case 'door_frame':
      return W.doorFrame();
    case 'sign':
      return W.sign();
    case 'mirror':
      return W.mirror();
    case 'shelf_wall':
      return W.shelfWall(seed);
    case 'counter':
      return C.counter(variant);
    case 'counter_sink':
      return C.counterSink();
    case 'coffee_machine':
      return C.coffeeMachine(state);
    case 'microwave':
      return C.microwave();
    case 'fridge':
      return C.fridge();
    case 'vending_machine':
      return C.vendingMachine();
    case 'cafe_table':
      return C.cafeTable();
    case 'cafe_chair':
      return C.cafeChair(variant);
    case 'sofa':
      return C.sofa(variant);
    case 'armchair':
      return C.armchair(variant);
    case 'coffee_table':
      return C.coffeeTable(seed);
    case 'pingpong_table':
      return C.pingpongTable();
    case 'beanbag':
      return C.beanbag(variant);
    case 'arcade':
      return C.arcade();
    case 'toilet_stall':
      return C.toiletStall(state);
    case 'sink':
      return C.sink();
    case 'reception_desk':
      return C.receptionDesk(seed);
    case 'bench':
      return C.bench();
  }
}

/** Gera os sprites (em buffer) de um móvel, recortados ao conteúdo. */
export function renderFurniture(kind: FurnitureKind, variant?: string, state?: number, seed?: number): BufFurniture {
  const n = normalizeFurniture(kind, variant, state, seed);
  const f = build(kind, n.variant, n.state, n.vseed);
  return { base: trim(f.base), front: f.front ? trim(f.front) : undefined };
}
