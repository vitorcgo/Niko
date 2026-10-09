// Geração determinística de aparência a partir de uma semente (puro, sem DOM).
// `look` apenas enviesa as probabilidades de estilos; nada é exclusivo de um look, exceto barba ('m').
import { mulberry32 } from '../../../../shared/hash';
import type { Accessory, Appearance, HairStyle, TopStyle } from '../api';

export const SKINS = ['#ffe2cc', '#f6cfb0', '#eab894', '#d69f78', '#bd8560', '#9a6444', '#7a4a31', '#5a3623'] as const;

const HAIR_NATURAL: readonly (readonly [string, number])[] = [
  ['#2b2530', 5], // preto
  ['#3f2c22', 5], // castanho-escuro
  ['#5f3c28', 4], // castanho
  ['#87593a', 2.5], // castanho-claro
  ['#b0703c', 1.2], // ruivo-acobreado
  ['#8e3b2b', 1], // acaju
  ['#d6ae68', 1.8], // loiro
  ['#ebdcb0', 0.7], // platinado
  ['#8f929b', 0.7], // grisalho
  ['#d9dbe0', 0.5], // branco
];
const HAIR_FUN = ['#e47aa8', '#5b8fe0', '#8f6ad8', '#3fb3a0', '#e0584e', '#7cc45a', '#f0a24a'] as const;

const EYES = ['#2b2236', '#2b2236', '#4a2f22', '#5a3b22', '#2f5f9e', '#3c7a52'] as const;

const TOP_COLORS = [
  '#e2604f', '#4a86d8', '#4bab72', '#efb54a', '#8d66cf', '#36b0b0', '#e47aa8', '#3d4352', '#f1efe9',
  '#8a96a3', '#2f4c7d', '#c9713f', '#76913f', '#e3d3b2', '#f29b72', '#5bc0de', '#b04a5a', '#f2d16b',
] as const;
const SHIRT_COLORS = ['#f4f4f0', '#d3e3f4', '#f3d6de', '#dfe3e8', '#e9f1dc', '#fbf0d6'] as const;
const TIE_COLORS = ['#c0392b', '#2f4c7d', '#7b2d44', '#2e7d4f', '#d9a42e', '#5b3a8c', '#3d4352'] as const;
const JACKET_COLORS = ['#2f3b55', '#3d4352', '#6b4a35', '#55613b', '#262a33', '#b08a5e', '#7a2f3a', '#4a6a8a'] as const;
const LIGHT_ACCENTS = ['#f4f4f0', '#e8e3d6', '#dfe7ef', '#f6e7c8', '#c9ced6'] as const;
const BOTTOMS = [
  ['#3f5f8c', 5], ['#2e3e5e', 4], ['#2c2c35', 4], ['#b49c72', 2], ['#6d7480', 2], ['#6e4c38', 1.5],
  ['#5f6845', 1.2], ['#2c3655', 2], ['#7f9cc4', 1.5], ['#e2ded5', 0.5], ['#9b3b3b', 0.4],
] as const;
const SHOES = [
  ['#2b2b33', 5], ['#6b4630', 3], ['#ececec', 3], ['#d04848', 1], ['#3f63a8', 1], ['#b88752', 1.5], ['#7d8592', 1],
] as const;
const ACC_COLORS: Record<Accessory, readonly string[]> = {
  none: ['#2b2b33'],
  glasses: ['#2b2b33', '#5a3a28', '#3f63a8', '#b03a3a', '#8a8f99'],
  sunglasses: ['#22232b'],
  headphones: ['#2b2b33', '#f1efe9', '#e2604f', '#4a86d8', '#efb54a', '#36b0b0'],
  cap: ['#e2604f', '#4a86d8', '#2b2b33', '#4bab72', '#efb54a', '#f1efe9', '#2f4c7d'],
  beanie: ['#e2604f', '#efb54a', '#4bab72', '#8d66cf', '#3d4352', '#36b0b0'],
  earrings: ['#f2c14e', '#d9dde3'],
  bow: ['#e2604f', '#e47aa8', '#efb54a', '#4a86d8', '#8d66cf'],
};
const LANYARDS = ['#f2b33d', '#e2604f', '#4a86d8', '#4bab72', '#8d66cf', '#36b0b0'] as const;

type Weights<T extends string> = Readonly<Record<T, number>>;

const HAIR_W: Record<'f' | 'm', Weights<HairStyle>> = {
  m: {
    short: 16, buzz: 9, spiky: 9, side_part: 12, curly: 9, afro: 6, bob: 2, long: 4, ponytail: 3, bun: 4,
    pigtails: 0.4, mohawk: 4, bald: 5, wavy: 9,
  },
  f: {
    short: 4, buzz: 1.2, spiky: 2, side_part: 4, curly: 9, afro: 7, bob: 13, long: 16, ponytail: 13, bun: 10,
    pigtails: 6, mohawk: 1, bald: 0.4, wavy: 13,
  },
};

const TOP_W: Record<'f' | 'm', Weights<TopStyle>> = {
  m: { tshirt: 20, hoodie: 16, shirt_tie: 10, sweater: 13, jacket: 13, blouse: 2, polo: 14 },
  f: { tshirt: 17, hoodie: 14, shirt_tie: 5, sweater: 14, jacket: 12, blouse: 20, polo: 8 },
};

const ACC_W: Record<'f' | 'm', Weights<Accessory>> = {
  m: { none: 40, glasses: 18, sunglasses: 4, headphones: 13, cap: 7, beanie: 6, earrings: 2, bow: 0.3 },
  f: { none: 36, glasses: 16, sunglasses: 4, headphones: 11, cap: 4, beanie: 5, earrings: 13, bow: 7 },
};

const FACIAL_W: Weights<FacialHair> = { none: 62, stubble: 12, beard: 13, mustache: 7, goatee: 6 };
const BOTTOM_W: Record<'f' | 'm', Weights<BottomStyle>> = {
  m: { pants: 88, shorts: 12, skirt: 0 },
  f: { pants: 62, shorts: 10, skirt: 28 },
};

export type FacialHair = NonNullable<Appearance['facialHair']>;
export type BottomStyle = NonNullable<Appearance['bottomStyle']>;

/** Mistura a semente (sementes consecutivas viram sequências bem diferentes). */
function scramble(seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function appearanceFromSeed(seed: number, opts: { look?: 'f' | 'm'; sub?: boolean } = {}): Appearance {
  const rnd = mulberry32(scramble(seed));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length) % arr.length];
  const weighted = <T extends string>(w: Weights<T>): T => {
    const entries = Object.entries(w) as [T, number][];
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let x = rnd() * total;
    for (const [k, v] of entries) {
      x -= v;
      if (x < 0) return k;
    }
    return entries[entries.length - 1][0];
  };
  const weightedPair = (arr: readonly (readonly [string, number])[]): string =>
    weighted(Object.fromEntries(arr) as Weights<string>);

  // A ordem dos sorteios é fixa: mudar a ordem muda todas as aparências.
  const lookRoll = rnd();
  const look: 'f' | 'm' = opts.look ?? (lookRoll < 0.5 ? 'f' : 'm');
  const skin = pick(SKINS);
  const fun = rnd() < 0.08;
  const hair = fun ? pick(HAIR_FUN) : weightedPair(HAIR_NATURAL);
  let hairStyle = weighted(HAIR_W[look]);
  const eyes = pick(EYES);
  const topStyle = weighted(TOP_W[look]);

  let top: string;
  let topAccent: string;
  switch (topStyle) {
    case 'shirt_tie':
      top = pick(SHIRT_COLORS);
      topAccent = pick(TIE_COLORS);
      break;
    case 'jacket':
      top = pick(JACKET_COLORS);
      topAccent = rnd() < 0.7 ? pick(LIGHT_ACCENTS) : pick(TOP_COLORS);
      break;
    case 'hoodie':
    case 'polo':
      top = pick(TOP_COLORS);
      topAccent = rnd() < 0.6 ? pick(LIGHT_ACCENTS) : pick(TOP_COLORS);
      break;
    default:
      top = pick(TOP_COLORS);
      topAccent = pick(TOP_COLORS);
  }
  if (topAccent === top) topAccent = pick(LIGHT_ACCENTS);

  const bottom = weightedPair(BOTTOMS);
  const shoes = weightedPair(SHOES);
  let accessory = weighted(ACC_W[look]);
  // Bonés e gorros não combinam com penteados volumosos no topo.
  if ((accessory === 'cap' || accessory === 'beanie') && (hairStyle === 'afro' || hairStyle === 'bun' || hairStyle === 'mohawk' || hairStyle === 'pigtails')) {
    accessory = 'glasses';
  }
  if (accessory === 'bow' && (hairStyle === 'bald' || hairStyle === 'buzz')) accessory = 'earrings';
  const accessoryColor = pick(ACC_COLORS[accessory]);
  const lanyardRoll = rnd();
  const facialRoll = weighted(FACIAL_W);
  const facialHair: FacialHair = look === 'm' ? facialRoll : 'none';
  const bottomStyle = weighted(BOTTOM_W[look]);
  // Cabelos raros e grisalhos pedem menos careca/raspado em looks femininos.
  if (look === 'f' && hairStyle === 'bald') hairStyle = 'buzz';

  return {
    skin,
    hair,
    hairStyle,
    eyes,
    top,
    topAccent,
    topStyle,
    bottom,
    shoes,
    accessory,
    accessoryColor,
    lanyard: opts.sub ? LANYARDS[Math.floor(lanyardRoll * LANYARDS.length) % LANYARDS.length] : null,
    look,
    facialHair,
    bottomStyle,
  };
}

/** Chave estável de uma aparência (para cache de sprites). */
export function appearanceKey(a: Appearance): string {
  return [
    a.skin, a.hair, a.hairStyle, a.eyes, a.top, a.topAccent, a.topStyle, a.bottom, a.shoes, a.accessory,
    a.accessoryColor, a.lanyard ?? '-', a.look, a.facialHair ?? '-', a.bottomStyle ?? '-',
  ].join('|');
}
