// Renderização procedural dos personagens chibi (puro: desenha num PixelBuf).
// Folha de 24x34 px com âncora (12, 31) no centro dos pés. Em pé: cabelo a partir de y≈5,
// cabeça y 7–17, tronco 18–23, calça 24–28, sapatos 29–30. Sentado: tronco/cabeça 4px abaixo.
import type { Appearance, CharacterFrameRequest, HeldItem, Pose } from '../api';
import { luminance, mix, ramp, shade, type Ramp } from '../core/color';
import { PixelBuf, type Palette } from '../core/pixbuf';
import type { BufSprite } from '../core/sprite';
import { HAIR, HEAD_BASE, TEXTURED, type HeadView, type Tpl } from './hair';

export const CHAR_W = 24;
export const CHAR_H = 34;
export const CHAR_AX = 12;
export const CHAR_AY = 31;
/** Origem da grade da cabeça (coluna 0, linha 0) em pé. */
const HX = 5;
const HY = 3;
/** Quanto o corpo desce quando sentado. */
export const SEAT_DROP = 4;

export const POSE_FRAMES: Readonly<Record<Pose, number>> = {
  stand: 2, walk: 4, run: 4, sit: 2, type: 4, sleep: 2, drink: 2, use: 2, raise_hand: 2, talk: 2, stretch: 2,
  read: 2, play: 2, wait: 2, cheer: 2, laugh: 2, game: 2, rps: 2, groom: 2, sulk: 2,
};

export const POSE_DURATION: Readonly<Record<Pose, number>> = {
  stand: 650, walk: 140, run: 95, sit: 800, type: 120, sleep: 1000, drink: 700, use: 380, raise_hand: 320, talk: 280,
  stretch: 800, read: 1100, play: 200, wait: 480, cheer: 260, laugh: 190, game: 150, rps: 300, groom: 420, sulk: 1300,
};

const SEATED_ONLY: ReadonlySet<Pose> = new Set<Pose>(['sit', 'type', 'sleep', 'wait']);
const NEVER_SEATED: ReadonlySet<Pose> = new Set<Pose>(['walk', 'run', 'stretch', 'play', 'groom']);
/** Poses que posicionam as mãos (e o item) por conta própria: a lógica genérica de itens não mexe nelas. */
const OWN_HANDS: ReadonlySet<Pose> = new Set<Pose>(['play', 'drink', 'raise_hand', 'stretch', 'cheer', 'laugh', 'game', 'rps', 'groom', 'sulk']);
/** Gestos do jokenpô (a mão vira pedra, papel ou tesoura). */
const GESTURES: ReadonlySet<HeldItem> = new Set<HeldItem>(['rock', 'paper', 'scissors']);

export function isSeated(pose: Pose, seated?: boolean): boolean {
  return SEATED_ONLY.has(pose) || (!!seated && !NEVER_SEATED.has(pose));
}

// ---------------------------------------------------------------- paleta

interface CharPal {
  skin: Ramp;
  hair: Ramp;
  top: Ramp;
  acc: Ramp;
  bottom: Ramp;
  shoes: Ramp;
  item: Ramp;
  eyeTop: string;
  eyeBot: string;
  blush: string;
  mouth: string;
  mouthOpen: string;
  shaved: string;
  stubble: string;
}

const palCache = new Map<Appearance, CharPal>();

function paletteOf(a: Appearance): CharPal {
  let p = palCache.get(a);
  if (p) return p;
  const skin = ramp(a.skin, 0.07);
  const dark = luminance(a.skin) < 0.38;
  p = {
    skin,
    hair: ramp(a.hair, 0.09),
    top: ramp(a.top, 0.08),
    acc: ramp(a.topAccent, 0.08),
    bottom: ramp(a.bottom, 0.07),
    shoes: ramp(a.shoes, 0.08),
    item: ramp(a.accessoryColor, 0.1),
    eyeTop: dark ? '#ece8f2' : '#1d1826',
    eyeBot: dark ? mix(a.eyes, '#0c0910', 0.55) : mix(a.eyes, '#1d1826', 0.25),
    blush: mix(a.skin, '#ff7a7a', 0.32),
    mouth: shade(a.skin, -0.2),
    mouthOpen: '#7a2e35',
    shaved: mix(a.skin, a.hair, 0.42),
    stubble: mix(a.skin, a.hair, 0.3),
  };
  if (palCache.size > 4096) palCache.clear();
  palCache.set(a, p);
  return p;
}

// ---------------------------------------------------------------- rig (pose -> posições)

type Pt = readonly [number, number];

interface Arm {
  /** Caminho do pincel 2x2: ombro -> ... -> mão (coordenadas em pé, sem deslocamento). */
  pts: readonly Pt[];
}

interface Rig {
  view: HeadView;
  seated: boolean;
  /** Deslocamento vertical do tronco/braços/cabeça (sentado, respiração, quique). */
  ub: number;
  /** Deslocamento extra só da cabeça (cochilo). */
  hd: number;
  /** Inclinação para frente no perfil (corrida): desloca cabeça/tronco em x. */
  lean: number;
  /** Pés: deslocamento vertical (frente/costas) ou horizontal (perfil) de cada perna. */
  legA: { dx: number; dy: number };
  legB: { dx: number; dy: number };
  /** Braço A = esquerdo da tela (frente/costas) ou distante (perfil). B = direito/próximo. */
  armA: Arm;
  armB: Arm;
  /** 'half' = pálpebras a meio mastro (tédio/impaciência); 'happy' = olhos fechados em arco (^ ^), rindo. */
  eyes: 'open' | 'closed' | 'half' | 'happy';
  /** 'wide' = gargalhada (boca larga com a língua aparecendo); 'frown' = boca triste (cantos para baixo). */
  mouth: 'none' | 'open' | 'wide' | 'frown';
  held: HeldItem;
  /** Item atrás do corpo (costas). */
  itemBehind: boolean;
  /** Mãos que seguram o item com as duas mãos (desenhadas por cima do item). */
  twoHands: boolean;
  /**
   * Posição FIXA do item (coordenadas em pé, sem ub/lean), independente da mão — ex.: o balde de
   * pipoca no colo enquanto a mão vai do balde à boca. null = o item acompanha a mão do braço B.
   */
  itemAt: Pt | null;
  /** Sentado: a ponta do sapato direito sobe 1px (pé batendo, impaciência). */
  toeTap: boolean;
  /** Pontas dos dedos (2 px de pele) batendo sobre o braço — de costas, nos braços cruzados. */
  tapAt: Pt | null;
  /** Uma pipoca entre os dedos (2 px), a caminho da boca. */
  kernelAt: Pt | null;
  /** De frente: braços cruzados desenhados à mão (ver drawCrossedArms); 1 = dedos levantados. */
  crossFront: 0 | 1 | null;
}

/** Braços retos ao lado do corpo (frente/costas). */
const DOWN_A: Arm = { pts: [[6, 18], [6, 22]] };
const DOWN_B: Arm = { pts: [[16, 18], [16, 22]] };

function arm(...pts: Pt[]): Arm {
  return { pts };
}

const TWO_HANDED: ReadonlySet<HeldItem> = new Set<HeldItem>(['box', 'laptop', 'papers', 'book']);

function makeRig(req: CharacterFrameRequest, view: HeadView): Rig {
  const pose = req.pose;
  const n = POSE_FRAMES[pose];
  const f = ((Math.floor(req.frame) % n) + n) % n;
  const seated = isSeated(pose, req.seated);
  const held: HeldItem = req.held ?? 'none';
  const rig: Rig = {
    view,
    seated,
    ub: seated ? SEAT_DROP : 0,
    hd: 0,
    lean: 0,
    legA: { dx: 0, dy: 0 },
    legB: { dx: 0, dy: 0 },
    armA: view === 'side' ? arm([12, 18], [12, 22]) : DOWN_A,
    armB: view === 'side' ? arm([10, 18], [10, 22]) : DOWN_B,
    eyes: 'open',
    mouth: 'none',
    held,
    itemBehind: view === 'up',
    twoHands: false,
    itemAt: null,
    toeTap: false,
    tapAt: null,
    kernelAt: null,
    crossFront: null,
  };
  const side = view === 'side';

  switch (pose) {
    case 'stand':
    case 'sit':
      // Respiração: a cabeça desce 1px no segundo quadro.
      if (f === 1) rig.hd = 1;
      break;
    case 'walk':
    case 'run': {
      const run = pose === 'run';
      const amp = run ? 2 : 1;
      if (f === 1 || f === 3) rig.ub -= 1;
      if (side) {
        const sw = [amp + 2, 0, -(amp + 2), 0][f];
        rig.legB = { dx: -sw, dy: f === 3 ? -2 : 0 };
        rig.legA = { dx: sw, dy: f === 1 ? -2 : 0 };
        const hs = [-2 - (run ? 1 : 0), 0, 2 + (run ? 1 : 0), 0][f];
        rig.armB = arm([10, 18], [10 + hs, run ? 21 : 22]);
        rig.armA = arm([12, 18], [12 - hs, run ? 21 : 22]);
        if (run) rig.lean = -1;
      } else {
        rig.legA.dy = [1, 0, 0, -amp][f];
        rig.legB.dy = [0, -amp, 1, 0][f];
        const sA = [-1, 0, 1, 0][f] * (run ? 2 : 1);
        rig.armA = arm([6, 18], [6 - (run ? 1 : 0), 22 + sA]);
        rig.armB = arm([16, 18], [16 + (run ? 1 : 0), 22 - sA]);
      }
      break;
    }
    case 'type': {
      const up = f % 2 === 0;
      if (view === 'up') {
        rig.armA = arm([7, 19], [5, 21], [6, 18 + (up ? -1 : 0)]);
        rig.armB = arm([15, 19], [17, 21], [16, 18 + (up ? 0 : -1)]);
      } else if (view === 'down') {
        rig.armA = arm([6, 18], [6, 21], [8, 22 + (up ? 0 : 1)]);
        rig.armB = arm([16, 18], [16, 21], [14, 22 + (up ? 1 : 0)]);
      } else {
        rig.armB = arm([10, 18], [9, 21], [6, 21 + (up ? 0 : -1)]);
        rig.armA = arm([12, 18], [11, 21], [7, 21 + (up ? -1 : 0)]);
      }
      break;
    }
    case 'sleep':
      rig.hd = f === 0 ? 2 : 3;
      rig.eyes = 'closed';
      if (view === 'down') {
        rig.armA = arm([6, 18], [7, 21], [9, 22]);
        rig.armB = arm([16, 18], [15, 21], [13, 22]);
      }
      break;
    case 'raise_hand': {
      const wave = f === 1 ? 1 : 0;
      if (side) {
        rig.armB = arm([10, 18], [4, 14], [3 - wave, 6]);
      } else {
        rig.armB = arm([16, 18], [19, 14], [19 + wave, 7 + wave]);
      }
      rig.mouth = view === 'down' && f === 0 ? 'open' : 'none';
      break;
    }
    case 'talk':
      rig.mouth = f === 0 ? 'open' : 'none';
      if (side) {
        rig.armB = arm([10, 18], [9, 21], f === 0 ? [6, 19] : [7, 21]);
      } else if (f === 0) {
        rig.armB = arm([16, 18], [17, 21], [18, 19]);
      } else {
        rig.armA = arm([6, 18], [5, 21], [4, 19]);
      }
      break;
    case 'stretch':
      rig.eyes = 'closed';
      rig.mouth = view === 'down' ? 'open' : 'none';
      if (f === 1) rig.ub -= 1;
      if (side) {
        rig.armB = arm([10, 18], [5, 13], [5, f === 0 ? 4 : 3]);
        rig.armA = arm([12, 18], [17, 12], [16, f === 0 ? 4 : 3]);
      } else {
        rig.armA = arm([6, 18], [4, 13], f === 0 ? [5, 5] : [4, 4]);
        rig.armB = arm([16, 18], [18, 13], f === 0 ? [17, 5] : [18, 4]);
      }
      break;
    case 'read': {
      rig.held = held === 'none' ? 'book' : held;
      if (f === 1) rig.hd = 1;
      break;
    }
    case 'play':
      rig.held = 'paddle';
      if (side) {
        rig.armB = f === 0 ? arm([10, 18], [13, 20], [15, 18]) : arm([10, 18], [8, 19], [5, 18]);
      } else {
        rig.armB = f === 0 ? arm([16, 18], [18, 20], [19, 18]) : arm([16, 18], [18, 17], [19, 14]);
      }
      break;
    case 'use': {
      const p = f === 1 ? 1 : 0;
      if (view === 'up') rig.armB = arm([16, 18], [17, 15], [16, 12 - p]);
      else if (view === 'down') rig.armB = arm([16, 18], [16, 21], [14, 23 + p]);
      else rig.armB = arm([10, 18], [8, 20], [5 - p, 20]);
      break;
    }
    case 'wait':
      waitRig(rig, view, f, held);
      break;
    case 'drink': {
      if (held === 'none') rig.held = 'coffee';
      const up = f === 1;
      if (side) rig.armB = up ? arm([10, 18], [8, 19], [6, 15]) : arm([10, 18], [10, 21], [8, 21]);
      else if (view === 'down') rig.armB = up ? arm([16, 18], [16, 19], [13, 15]) : arm([16, 18], [17, 21], [16, 21]);
      else rig.armB = up ? arm([16, 18], [18, 17], [16, 14]) : arm([16, 18], [17, 21], [16, 21]);
      break;
    }
    case 'cheer':
      cheerRig(rig, view, f);
      break;
    case 'laugh':
      laughRig(rig, view, f);
      break;
    case 'game':
      gameRig(rig, view, f);
      break;
    case 'rps':
      rpsRig(rig, view, f, held);
      break;
    case 'groom':
      groomRig(rig, view, f, held);
      break;
    case 'sulk':
      sulkRig(rig, view, f);
      break;
  }

  // Itens segurados: braços e posição do item (exceto poses que já posicionam a mão).
  const h = rig.held;
  if (h !== 'none' && !rig.itemAt && !OWN_HANDS.has(pose)) {
    if (TWO_HANDED.has(h) || pose === 'read') {
      rig.twoHands = true;
      if (side) {
        rig.armB = arm([10, 18], [10, 21], [7, 21]);
        rig.armA = arm([12, 18], [12, 21], [8, 20]);
      } else {
        rig.armA = arm([6, 18], [6, 20], [8, 21]);
        rig.armB = arm([16, 18], [16, 20], [14, 21]);
      }
    } else if (pose !== 'type' && pose !== 'use' && pose !== 'sleep' && pose !== 'talk') {
      // Copo, garrafa ou raquete numa mão só, braço dobrado à frente.
      if (side) rig.armB = arm([10, 18], [10, 21], [8, 21]);
      else rig.armB = arm([16, 18], [17, 21], [16, 21]);
    }
  }
  if (h === 'paddle' && pose !== 'play') rig.held = pose === 'stand' || pose === 'walk' || pose === 'run' ? 'paddle' : 'none';
  return rig;
}

/**
 * Pose 'wait' (esperando um shell terminar): sentado e recostado 1px para trás — para cima de frente
 * (o encosto fica ao norte), para baixo de costas (encosto ao sul) e para trás no perfil.
 * - Com pipoca: balde no colo/abraçado e a mão alternando entre o balde (quadro 0) e a boca (1).
 *   De costas o balde fica apoiado ao lado do quadril (fora do encosto) para continuar legível.
 * - Sem item: braços cruzados, dedos batendo no braço e a ponta do pé batendo; olhar entediado.
 * - Outros itens: como 'sit' segurando o item (a lógica genérica de itens cuida dos braços).
 */
function waitRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  if (view === 'down') rig.ub -= 1;
  else if (view === 'up') rig.ub += 1;
  else rig.lean = 1;
  const eat = f === 1;
  if (held === 'popcorn') {
    rig.itemBehind = false;
    if (view === 'down') {
      // Balde abraçado colado ao queixo: a desk_back (verso do monitor) esconde o sprite a partir de
      // y≈26, então pipoca, aro e três listras precisam caber acima disso. A mão vai da lateral do
      // balde (mastigando, boca aberta) até a boca (cobrindo-a, com uma pipoca entre os dedos).
      rig.itemAt = [9, 17];
      rig.armA = arm([6, 18], [6, 21], [9, 21]);
      rig.armB = eat ? arm([16, 18], [17, 19], [11, 15]) : arm([16, 18], [16, 20], [15, 20]);
      rig.mouth = eat ? 'none' : 'open';
      if (eat) rig.kernelAt = [11, 14];
    } else if (view === 'up') {
      // De costas: balde ao lado do quadril esquerdo; o braço esquerdo mergulha nele e leva à boca
      // (a mão some atrás da cabeça, o cotovelo aparece para fora).
      rig.itemAt = [0, 18];
      rig.armB = arm([16, 18], [16, 22]);
      rig.armA = eat ? arm([6, 18], [3, 16], [6, 13]) : arm([6, 18], [4, 20], [3, 18]);
    } else {
      // Perfil (virado à esquerda): balde no colo, à frente da barriga.
      rig.itemAt = [3, 18];
      rig.armA = arm([12, 18], [12, 21], [8, 22]);
      rig.armB = eat ? arm([10, 18], [9, 21], [5, 16]) : arm([10, 18], [10, 21], [6, 19]);
      rig.mouth = eat ? 'none' : 'open';
      if (eat) rig.kernelAt = [5, 15];
    }
    return;
  }
  if (held !== 'none') return;
  // Braços cruzados, batendo os dedos (no 2º quadro a mão de cima sobe 1px) e o pé.
  const lifted = f === 1;
  rig.eyes = 'half';
  rig.toeTap = lifted;
  const tap = lifted ? -1 : 0;
  if (view === 'down') {
    rig.crossFront = lifted ? 1 : 0;
  } else if (view === 'up') {
    // De costas só aparecem os cotovelos para fora; a ponta dos dedos bate no braço esquerdo.
    rig.armA = arm([6, 18], [4, 20], [6, 22]);
    rig.armB = arm([16, 18], [18, 20], [16, 22]);
    rig.tapAt = [3, 19 + tap];
  } else {
    rig.armA = arm([12, 18], [12, 21], [9, 21]);
    rig.armB = arm([10, 18], [10, 21], [7, 20 + tap]);
  }
}

// ---------------------------------------------------------------- vida social

/**
 * 'cheer' (comemorando): os dois braços para o alto em V com os punhos fechados e a boca aberta.
 * No quadro 1, pulinho (o corpo inteiro sobe 2 px; sentado, só um quique) e olhos de alegria.
 * De perfil o braço de trás passa por trás da cabeça e aparece acima dela.
 */
function cheerRig(rig: Rig, view: HeadView, f: number): void {
  const jump = f === 1;
  rig.mouth = 'open';
  if (jump) rig.eyes = 'happy';
  if (jump) {
    if (rig.seated) rig.ub -= 1;
    else {
      rig.ub -= 2;
      rig.legA = { dx: 0, dy: -2 };
      rig.legB = { dx: 0, dy: -2 };
    }
  }
  // Punhos acima do topo da cabeça: sentado de costas (sofá diante da TV) só a cabeça e as mãos
  // passam do encosto.
  if (view === 'side') {
    rig.armB = jump ? arm([10, 18], [5, 13], [3, 3]) : arm([10, 18], [6, 13], [4, 4]);
    rig.armA = jump ? arm([12, 18], [17, 12], [18, 2]) : arm([12, 18], [16, 12], [17, 3]);
    return;
  }
  rig.armA = jump ? arm([6, 18], [3, 12], [2, 3]) : arm([6, 18], [4, 12], [3, 4]);
  rig.armB = jump ? arm([16, 18], [19, 12], [20, 3]) : arm([16, 18], [18, 12], [19, 4]);
}

/**
 * 'laugh' (gargalhando): olhos fechados em arco, boca larga, uma mão na barriga e o corpo
 * sacudindo 1 px; no quadro 1 a outra mão bate na coxa e, de perfil, o corpo dobra para a frente.
 */
function laughRig(rig: Rig, view: HeadView, f: number): void {
  rig.eyes = 'happy';
  rig.mouth = f === 0 ? 'wide' : 'open';
  if (f === 0) rig.ub -= 1;
  if (view === 'side') {
    rig.lean = f === 0 ? 1 : -1;
    rig.armB = arm([10, 18], [10, 21], [7, 22]);
    rig.armA = f === 0 ? arm([12, 18], [12, 22]) : arm([12, 18], [11, 21], [9, 23]);
    return;
  }
  if (view === 'up') {
    // De costas: cotovelos para fora (as mãos estão na barriga, escondidas pelo corpo).
    rig.armA = arm([6, 18], [4, 21], [7, 22]);
    rig.armB = arm([16, 18], [18, 21], [15, 22]);
    return;
  }
  rig.armB = arm([16, 18], [17, 21], [14, 22]);
  rig.armA = f === 0 ? arm([6, 18], [6, 22]) : arm([6, 18], [5, 21], [4, 23]);
}

/**
 * 'game' (videogame): controle nas duas mãos à frente do peito, polegares alternando (uma mão sobe
 * 1 px a cada quadro). De perfil o corpo inclina para a tela; de costas só os cotovelos para fora,
 * mexendo — o controle fica escondido pelo corpo.
 */
function gameRig(rig: Rig, view: HeadView, f: number): void {
  rig.held = 'controller';
  rig.twoHands = true;
  const a = f === 0 ? 0 : 1;
  const b = 1 - a;
  if (view === 'down') {
    rig.itemAt = [9, 20];
    rig.armA = arm([6, 18], [6, 20], [8, 20 + a]);
    rig.armB = arm([16, 18], [16, 20], [15, 20 + b]);
    return;
  }
  if (view === 'side') {
    rig.lean = -1;
    rig.itemAt = [4, 19];
    rig.armA = arm([12, 18], [11, 21], [7, 20 + a]);
    rig.armB = arm([10, 18], [10, 21], [6, 20 + b]);
    return;
  }
  rig.held = 'none';
  rig.twoHands = false;
  rig.armA = arm([6, 18], [4, 20], [7, 21 + a]);
  rig.armB = arm([16, 18], [18, 20], [15, 21 + b]);
}

/**
 * 'rps' (pedra-papel-tesoura). Sem gesto: o punho sobe (quadro 0, gritando) e desce (1) na
 * contagem. Com gesto: braço estendido para o adversário mostrando a mão — de perfil para a frente,
 * de frente diante do peito e de costas para o lado (para continuar legível).
 */
function rpsRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  const reveal = GESTURES.has(held);
  rig.held = reveal ? held : 'rock';
  rig.itemBehind = false;
  if (!reveal) {
    const up = f === 0;
    if (view !== 'up') rig.mouth = up ? 'open' : 'none';
    if (view === 'side') {
      rig.armB = up ? arm([10, 18], [6, 16], [3, 12]) : arm([10, 18], [6, 18], [3, 16]);
      rig.armA = arm([12, 18], [12, 22]);
    } else if (view === 'down') {
      rig.armB = up ? arm([16, 18], [18, 15], [18, 11]) : arm([16, 18], [18, 18], [18, 15]);
      rig.armA = arm([6, 18], [5, 21], [6, 22]);
    } else {
      rig.armB = up ? arm([16, 18], [19, 15], [20, 11]) : arm([16, 18], [19, 18], [20, 15]);
      rig.armA = arm([6, 18], [6, 22]);
    }
    return;
  }
  const bob = f === 1 ? -1 : 0;
  if (view === 'side') {
    rig.armB = arm([10, 18], [7, 19], [4, 19 + bob]);
    rig.armA = arm([12, 18], [12, 22]);
  } else if (view === 'down') {
    rig.armB = arm([16, 18], [16, 20], [13, 20 + bob]);
    rig.armA = arm([6, 18], [6, 22]);
  } else {
    rig.armB = arm([16, 18], [19, 18], [21, 17 + bob]);
    rig.armA = arm([6, 18], [6, 22]);
  }
}

/**
 * 'groom' (diante do espelho): uma mão perto do rosto/cabelo indo e voltando. De costas (o normal,
 * virado para o espelho) o cotovelo fica levantado para fora e a mão aparece na lateral da cabeça;
 * de frente a mão passa o batom/pente na altura da boca/cabelo.
 */
function groomRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  rig.itemBehind = false;
  const comb = held === 'comb';
  if (view === 'up') {
    rig.armB = f === 0 ? arm([16, 18], [20, 15], [18, 11]) : arm([16, 18], [20, 14], [17, 9]);
    return;
  }
  if (view === 'side') {
    rig.armB = comb
      ? f === 0 ? arm([10, 18], [8, 15], [9, 9]) : arm([10, 18], [8, 14], [11, 8])
      : f === 0 ? arm([10, 18], [9, 17], [6, 15]) : arm([10, 18], [9, 16], [6, 14]);
    return;
  }
  rig.armB = comb
    ? f === 0 ? arm([16, 18], [19, 14], [18, 9]) : arm([16, 18], [19, 13], [16, 8])
    : f === 0 ? arm([16, 18], [18, 17], [14, 15]) : arm([16, 18], [18, 17], [13, 15]);
  if (!comb) rig.mouth = 'none';
}

/** 'sulk' (chateado): ombros caídos, cabeça baixa, olhos semicerrados e braços pendurados. */
function sulkRig(rig: Rig, view: HeadView, f: number): void {
  rig.eyes = 'half';
  rig.mouth = 'frown';
  rig.hd = f === 0 ? 1 : 2;
  if (!rig.seated) rig.ub += 1;
  if (view === 'side') {
    rig.lean = -1;
    rig.armB = arm([10, 18], [10, 22]);
    rig.armA = arm([12, 18], [12, 22]);
    return;
  }
  rig.armA = arm([6, 18], [7, 22]);
  rig.armB = arm([16, 18], [15, 22]);
}

/**
 * Braços cruzados de frente (pixel a pixel: com mangas compridas o pincel 2x2 some na blusa).
 * O antebraço direito da tela passa por cima (linha clara + base), o outro aparece por baixo
 * (linha escura); a mão de cima segura o braço esquerdo e bate os dedos; a de baixo espia à direita.
 */
function drawCrossedArms(dc: Dc, sleeveCol: Ramp, sleeve: number, fingersUp: boolean): void {
  const { b, p, r } = dc;
  const y = r.ub;
  const sl = sleeveCol;
  const fa = sleeve < 4 ? p.skin : sl; // antebraço: pele em mangas curtas
  const sk = p.skin;
  // Tudo bem alto no peito: atrás da desk_back só ~4 px do tronco ficam à mostra.
  // Braços (ombro -> cotovelo) dos dois lados.
  for (let yy = 18; yy <= 20; yy++) {
    b.set(6, yy + y, yy === 20 ? sl.dk : sl.base);
    b.set(7, yy + y, sl.dk);
    b.set(16, yy + y, sl.base);
    b.set(17, yy + y, yy === 20 ? sl.dd : sl.dk);
  }
  // Antebraço de baixo (só a borda inferior aparece) e a mão escondida espiando à direita.
  b.hline(8, 15, 21 + y, fa.dk);
  b.set(16, 21 + y, sk.base);
  b.set(17, 21 + y, sk.dk);
  // Antebraço de cima, do cotovelo direito até a mão sobre o braço esquerdo.
  b.hline(8, 17, 19 + y, fa.lt);
  b.hline(8, 17, 20 + y, fa.base);
  b.set(17, 20 + y, fa.dk);
  b.set(12, 20 + y, fa.dk); // dobra onde os antebraços se cruzam
  // Mão sobre o braço esquerdo; nos quadros ímpares os dedos sobem (batendo).
  const hy = fingersUp ? 18 : 19;
  b.set(5, hy + y, sk.lt);
  b.set(6, hy + y, sk.base);
  b.set(5, hy + 1 + y, sk.base);
  b.set(6, hy + 1 + y, sk.dk);
  b.set(7, 19 + y, sk.base);
  b.set(7, 20 + y, sk.dk);
}

// ---------------------------------------------------------------- desenho

/** Contexto de desenho: buffer + paleta + rig. */
interface Dc {
  b: PixelBuf;
  a: Appearance;
  p: CharPal;
  r: Rig;
}

function hairPalette(p: CharPal, buzz: boolean): Palette {
  const h = p.hair;
  if (buzz) {
    const b = mix(h.base, p.skin.base, 0.3);
    return { o: b, h: mix(h.lt, p.skin.base, 0.3), H: mix(h.hi, p.skin.base, 0.35), d: mix(h.dk, p.skin.base, 0.2), D: h.dd, z: p.shaved, k: p.skin.hi };
  }
  return { o: h.base, h: h.lt, H: h.hi, d: h.dk, D: h.dd, z: p.shaved, k: p.skin.hi };
}

function stampTpl(dc: Dc, tpl: Tpl, pal: Palette, dy: number, textured = false): void {
  const { b } = dc;
  const ox = HX + tpl.x + dc.r.lean;
  const oy = HY + tpl.y + dy;
  if (!textured) {
    b.stamp(tpl.rows, ox, oy, pal);
    return;
  }
  // Textura de cachos: pontilhado determinístico nas áreas de base.
  for (let r = 0; r < tpl.rows.length; r++) {
    const row = tpl.rows[r];
    for (let i = 0; i < row.length; i++) {
      let ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      if (ch === 'o') {
        const k = (i * 5 + (tpl.y + r) * 3) % 7;
        if (k === 0) ch = 'd';
        else if (k === 3 && r < tpl.rows.length / 2) ch = 'h';
      }
      b.set(ox + i, oy + r, pal[ch]);
    }
  }
}

function drawHead(dc: Dc): void {
  const { p, r } = dc;
  const tpl = HEAD_BASE[r.view];
  const dy = r.ub + r.hd;
  const closed = r.eyes === 'closed' || r.eyes === 'happy';
  const half = r.eyes === 'half';
  // Semicerrado: a linha de cima vira pálpebra e a de baixo usa o tom mais escuro do olho
  // (em peles escuras eyeTop é o brilho claro, então a pupila fica com eyeBot).
  const pupil = luminance(p.eyeTop) > 0.5 ? p.eyeBot : p.eyeTop;
  const pal: Palette = {
    s: p.skin.base,
    S: p.skin.dk,
    L: p.skin.lt,
    e: closed ? p.skin.base : half ? shade(p.skin.base, -0.16) : p.eyeTop,
    E: closed ? shade(p.skin.base, -0.3) : half ? pupil : p.eyeBot,
    b: p.blush,
    m: r.mouth === 'open' || r.mouth === 'wide' ? p.mouthOpen : dc.a.look === 'f' ? mix(p.mouth, '#c0505a', 0.25) : p.mouth,
    r: p.skin.dk,
  };
  dc.b.stamp(tpl.rows, HX + tpl.x + r.lean, HY + tpl.y + dy, pal);
  const ox = HX + tpl.x + r.lean;
  const oy = HY + tpl.y + dy;
  if (r.eyes === 'happy' && r.view !== 'up') {
    // Olhos de riso: arco "^" de 3 px no lugar de cada olho (a pupila vira pele).
    const ink = mix(p.skin.base, '#1d1826', 0.7);
    for (const cx of r.view === 'down' ? [4, 9] : [3]) {
      dc.b.set(ox + cx, oy + 6, ink);
      dc.b.set(ox + cx, oy + 7, p.skin.base);
      dc.b.set(ox + cx - 1, oy + 7, ink);
      dc.b.set(ox + cx + 1, oy + 7, ink);
    }
  }
  if (r.mouth === 'frown' && r.view !== 'up') {
    // Boca triste: os cantos descem 1 px (um arco virado para baixo).
    const corner = shade(p.mouth, -0.12);
    if (r.view === 'down') {
      dc.b.set(ox + 5, oy + 10, corner);
      dc.b.set(ox + 8, oy + 10, corner);
    } else dc.b.set(ox + 3, oy + 10, corner);
  }
  if (r.mouth === 'wide' && r.view !== 'up') {
    // Gargalhada: a boca abre para os lados e a língua aparece embaixo.
    const tongue = '#d8646e';
    if (r.view === 'down') {
      dc.b.set(ox + 5, oy + 9, p.mouthOpen);
      dc.b.set(ox + 8, oy + 9, p.mouthOpen);
      dc.b.set(ox + 6, oy + 10, tongue);
      dc.b.set(ox + 7, oy + 10, tongue);
    } else {
      dc.b.set(ox + 1, oy + 9, p.mouthOpen);
      dc.b.set(ox + 2, oy + 10, tongue);
    }
  }
  // Brilho na testa (luz de cima/esquerda).
  if (r.view !== 'up') dc.b.set(HX + 3 + r.lean, HY + 7 + dy, p.skin.lt);
}

function drawFacialHair(dc: Dc): void {
  const style = dc.a.facialHair ?? 'none';
  if (style === 'none' || dc.r.view === 'up') return;
  const { b, p, r } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const c = style === 'stubble' ? p.stubble : p.hair.base;
  const cd = style === 'stubble' ? shade(p.stubble, -0.04) : p.hair.dk;
  const put = (cx: number, cy: number, col = c) => b.set(ox + cx, oy + cy, col);
  if (r.view === 'down') {
    if (style === 'beard' || style === 'stubble') {
      for (const cx of [1, 12]) for (const cy of [10, 11]) put(cx, cy, cd);
      for (let cx = 1; cx <= 12; cx++) put(cx, 12, cx > 9 ? cd : c);
      for (let cx = 2; cx <= 11; cx++) if (cx < 6 || cx > 7) put(cx, 13, cx > 9 ? cd : c);
      for (let cx = 3; cx <= 10; cx++) put(cx, 14, cd);
      if (style === 'beard') {
        put(5, 12, p.hair.dk);
        put(8, 12, p.hair.dk);
      }
    } else if (style === 'mustache') {
      for (let cx = 5; cx <= 8; cx++) put(cx, 12, cx === 8 ? cd : c);
    } else if (style === 'goatee') {
      put(5, 13, c);
      put(8, 13, cd);
      for (let cx = 5; cx <= 8; cx++) put(cx, 14, cx > 6 ? cd : c);
    }
  } else {
    if (style === 'beard' || style === 'stubble') {
      for (const cy of [10, 11]) put(7, cy, cd);
      for (let cx = 1; cx <= 8; cx++) put(cx, 12, c);
      for (let cx = 1; cx <= 8; cx++) if (cx !== 2) put(cx, 13, cx > 5 ? cd : c);
      for (let cx = 2; cx <= 8; cx++) put(cx, 14, cd);
    } else if (style === 'mustache') {
      put(1, 12, c);
      put(2, 12, c);
      put(3, 12, cd);
    } else if (style === 'goatee') {
      put(1, 13, c);
      put(2, 14, c);
      put(3, 14, cd);
    }
  }
}

function drawHair(dc: Dc, layer: 'front' | 'back'): void {
  const style = dc.a.hairStyle;
  const set = HAIR[style]?.[dc.r.view];
  const tpl = set?.[layer];
  if (!tpl) return;
  // Boné/gorro escondem a parte de cima do cabelo.
  const pal = hairPalette(dc.p, style === 'buzz');
  const pal2: Palette = { ...pal, a: dc.a.accessory === 'bow' ? dc.p.item.base : shade(dc.a.top, 0.05) };
  stampTpl(dc, tpl, pal2, dc.r.ub + dc.r.hd, TEXTURED.has(style));
}

function drawAccessory(dc: Dc): void {
  const { b, p, r, a } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  const it = p.item;
  const v = r.view;
  switch (a.accessory) {
    case 'glasses': {
      // Duas lentes emolduradas (o olho continua visível dentro) + ponte e hastes.
      const fr = shade(it.dk, -0.08);
      const lens = 'rgba(225,240,255,0.6)';
      if (v === 'down') {
        for (const x0 of [3, 8]) {
          put(x0, 10, fr);
          put(x0 + 1, 10, fr);
          put(x0 + 2, 10, fr);
          put(x0, 11, fr);
          put(x0 + 2, 11, lens);
        }
        for (const cx of [1, 2, 6, 7, 11, 12]) put(cx, 10, it.base);
      } else if (v === 'side') {
        put(2, 10, fr);
        put(3, 10, fr);
        put(4, 10, fr);
        put(2, 11, fr);
        put(4, 11, fr);
        for (let cx = 5; cx <= 8; cx++) put(cx, 10, it.base);
      } else {
        put(0, 10, it.dk);
        put(13, 10, it.dk);
      }
      break;
    }
    case 'sunglasses': {
      if (v === 'down') {
        for (let cx = 2; cx <= 11; cx++) put(cx, 10, '#15161c');
        for (const cx of [2, 3, 4, 5, 8, 9, 10, 11]) put(cx, 11, cx === 3 || cx === 9 ? '#5a6b8a' : '#15161c');
        put(0, 10, '#15161c');
        put(13, 10, '#15161c');
      } else if (v === 'side') {
        for (let cx = 1; cx <= 4; cx++) put(cx, 10, '#15161c');
        for (let cx = 1; cx <= 3; cx++) put(cx, 11, cx === 2 ? '#5a6b8a' : '#15161c');
        for (let cx = 5; cx <= 8; cx++) put(cx, 10, '#15161c');
      } else {
        put(0, 10, '#15161c');
        put(13, 10, '#15161c');
      }
      break;
    }
    case 'headphones': {
      if (v === 'side') {
        for (let cx = 5; cx <= 9; cx++) put(cx, 2, cx === 7 ? it.lt : it.base);
        put(4, 3, it.base);
        put(10, 3, it.dk);
        for (let cy = 4; cy <= 8; cy++) put(7, cy, it.dk);
        for (let cy = 9; cy <= 12; cy++) for (let cx = 6; cx <= 9; cx++) put(cx, cy, cy === 9 || cx === 6 ? it.lt : it.base);
        put(9, 12, it.dk);
      } else {
        for (let cx = 3; cx <= 10; cx++) put(cx, 1, cx < 6 ? it.lt : it.base);
        put(2, 2, it.base);
        put(11, 2, it.dk);
        for (let cy = 3; cy <= 8; cy++) {
          put(1, cy, it.base);
          put(12, cy, it.dk);
        }
        for (let cy = 9; cy <= 12; cy++) {
          put(0, cy, it.base);
          put(1, cy, cy === 9 ? it.lt : it.base);
          put(12, cy, it.dk);
          put(13, cy, it.dk);
        }
      }
      break;
    }
    case 'cap': {
      const brim = it.dk;
      if (v === 'down') {
        const rows = ['....oooooo....', '..oohhhhoooo..', '.ohhHhhhooood.', '.oohhhooooood.', 'bbbbbbbbbbbbbb'];
        b.stamp(rows, ox, oy + 2, { o: it.base, h: it.lt, H: it.hi, d: it.dk, b: brim });
        put(6, 3, '#f4f2ee');
        put(7, 3, '#f4f2ee');
      } else if (v === 'up') {
        const rows = ['....oooooo....', '..oohhhhoooo..', '.ohhHhhhooood.', '.oohhhooooood.', '.oooo....oodd.', '.....d..d.....'];
        b.stamp(rows, ox, oy + 2, { o: it.base, h: it.lt, H: it.hi, d: it.dk });
      } else {
        const rows = ['.....oooooo...', '...oohhhhooo..', '..ohHhhhoooood', '..ohhhooooooo.', 'bbbbbboooood..'];
        b.stamp(rows, ox - 1, oy + 2, { o: it.base, h: it.lt, H: it.hi, d: it.dk, b: brim });
      }
      break;
    }
    case 'beanie': {
      const rib = it.dk;
      const rows =
        v === 'side'
          ? ['.....ww.......', '....oooooo....', '..oohhhooooo..', '.ohhHhhoooood.', '.ohhhhooooood.', '.rrrrrrrrrrrr.']
          : ['......ww......', '....oooooo....', '..oohhhooooo..', '.ohhHhhoooood.', '.ohhhhooooood.', 'rrrrrrrrrrrrrr'];
      b.stamp(rows, ox, oy + 1, { o: it.base, h: it.lt, H: it.hi, d: it.dk, r: rib, w: '#f4f2ee' });
      for (let cx = 1; cx <= 12; cx += 2) put(cx, 6, shade(rib, -0.06));
      break;
    }
    case 'earrings': {
      if (v === 'down') {
        put(0, 12, it.base);
        put(13, 12, it.dk);
      } else if (v === 'side') put(8, 12, it.base);
      break;
    }
    case 'bow': {
      const rows = ['oo.oo', 'ohdho', '.o.o.'];
      const pal = { o: it.base, h: it.lt, d: it.dd };
      if (v === 'down') b.stamp(rows, ox + 8, oy + 2, pal);
      else if (v === 'up') b.stamp(rows, ox + 1, oy + 2, pal);
      else b.stamp(rows, ox + 7, oy + 1, pal);
      break;
    }
    case 'none':
      break;
  }
}

// ----- corpo

/** Pincel 2x2 ao longo do caminho do braço: manga até `sleeve` pontos, depois pele; mão no fim. */
function drawArm(dc: Dc, a: Arm, sleeveCol: Ramp, sleeve: number, dim = 0, backShadow = false): void {
  const { b, p, r } = dc;
  const pts: [number, number][] = [];
  for (let i = 0; i < a.pts.length - 1; i++) {
    const [x0, y0] = a.pts[i];
    const [x1, y1] = a.pts[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      pts.push([Math.round(x0 + ((x1 - x0) * s) / Math.max(1, steps)), Math.round(y0 + ((y1 - y0) * s) / Math.max(1, steps))]);
    }
  }
  if (a.pts.length === 1) pts.push([a.pts[0][0], a.pts[0][1]]);
  const dy = r.ub;
  const lean = r.lean;
  const sk = dim ? ramp(shade(p.skin.base, -dim), 0.07) : p.skin;
  const sl = dim ? ramp(shade(sleeveCol.base, -dim), 0.08) : sleeveCol;
  if (backShadow) {
    // Linha de sombra atrás do braço (sobre o tronco) para separá-lo do corpo no perfil.
    const sep = shade(sleeveCol.dd, -0.06);
    for (const [x, y] of pts) {
      if (b.alpha(x + 2 + lean, y + dy) > 0) b.set(x + 2 + lean, y + dy, sep);
    }
  }
  pts.forEach(([x, y], i) => {
    const last = i === pts.length - 1;
    const isSleeve = i < sleeve && !last;
    const c = isSleeve ? sl : sk;
    b.set(x + lean, y + dy, c.base);
    b.set(x + 1 + lean, y + dy, c.dk);
    b.set(x + lean, y + 1 + dy, isSleeve && i === sleeve - 1 ? c.dk : c.base);
    b.set(x + 1 + lean, y + 1 + dy, c.dk);
  });
  const [hx, hy] = pts[pts.length - 1];
  b.set(hx + lean, hy + dy, sk.lt);
  b.set(hx + 1 + lean, hy + dy, sk.base);
  b.set(hx + lean, hy + 1 + dy, sk.base);
  b.set(hx + 1 + lean, hy + 1 + dy, sk.dk);
}

function sleeveLength(a: Appearance): number {
  switch (a.topStyle) {
    case 'tshirt':
    case 'polo':
      return 2;
    case 'blouse':
      return 3;
    default:
      return 99;
  }
}

function drawLegs(dc: Dc): void {
  const { b, p, r, a } = dc;
  const pants = p.bottom;
  const sh = p.shoes;
  const style = a.bottomStyle ?? 'pants';
  const skinLeg = style !== 'pants';
  if (r.view === 'side') {
    drawLegsSide(dc, pants, sh, skinLeg);
    return;
  }
  if (r.seated) {
    if (r.view === 'down') {
      // Colo (coxas em direção à câmera) e pontas dos sapatos.
      const y0 = 24 + r.ub;
      const lapTop = style === 'skirt' ? p.bottom : pants;
      b.rect(8, y0, 8, 1, lapTop.lt);
      b.rect(8, y0 + 1, 8, 1, lapTop.base);
      b.set(15, y0, lapTop.base);
      b.set(15, y0 + 1, lapTop.dk);
      b.set(11, y0 + 1, lapTop.dk);
      if (skinLeg) {
        b.rect(9, y0 + 2, 2, 1, p.skin.base);
        b.rect(13, y0 + 2, 2, 1, p.skin.dk);
      } else {
        b.rect(8, y0 + 2, 3, 1, pants.dk);
        b.rect(13, y0 + 2, 3, 1, pants.dk);
      }
      b.rect(8, 30, 3, 1, sh.base);
      b.set(8, 30, sh.lt);
      if (r.toeTap) {
        // Ponta do pé direito no ar (o calcanhar fica no chão).
        b.rect(13, 29, 3, 1, sh.base);
        b.set(13, 29, sh.lt);
        b.set(14, 30, sh.dk);
      } else {
        b.rect(13, 30, 3, 1, sh.base);
        b.set(13, 30, sh.lt);
      }
    } else {
      const y0 = 24 + r.ub;
      b.rect(8, y0, 8, 2, pants.base);
      b.rect(8, y0 + 1, 8, 1, pants.dk);
      b.set(11, y0, pants.dk);
      b.set(12, y0, pants.dk);
    }
    return;
  }
  // Em pé (frente/costas). Quadril/cintura.
  const top = 24 + r.ub;
  b.rect(8, top, 8, 2, pants.base);
  b.set(15, top, pants.dk);
  b.set(15, top + 1, pants.dk);
  if (style === 'skirt') {
    b.rect(7, top + 2, 10, 1, pants.base);
    b.set(16, top + 2, pants.dk);
    b.rect(8, top + 2, 1, 1, pants.lt);
    b.set(11, top + 1, pants.dk);
    b.set(12, top + 2, pants.dk);
  }
  const leg = (x: number, dyFoot: number, shadeRight: boolean) => {
    const y1 = 28 + dyFoot;
    for (let y = top + 2; y <= y1; y++) {
      const isSkin = skinLeg && y >= top + 3;
      const c = isSkin ? p.skin : pants;
      b.set(x, y, c.base);
      b.set(x + 1, y, c.base);
      b.set(x + 2, y, shadeRight ? c.dk : c.base);
    }
    // Sapato: duas linhas, ponta clara, sola escura.
    b.rect(x, y1 + 1, 3, 1, sh.base);
    b.set(x, y1 + 1, sh.lt);
    b.rect(x, y1 + 2, 3, 1, sh.dk);
  };
  const a1 = r.view === 'up' ? r.legB.dy : r.legA.dy;
  const b1 = r.view === 'up' ? r.legA.dy : r.legB.dy;
  leg(8, a1, true);
  leg(13, b1, true);
  if (!skinLeg || style === 'shorts') {
    b.set(10, top + 2, pants.dk);
    b.set(13, top + 2, pants.base);
  }
}

function drawLegsSide(dc: Dc, pants: Ramp, sh: Ramp, skinLeg: boolean): void {
  const { b, p, r, a } = dc;
  const style = a.bottomStyle ?? 'pants';
  if (r.seated) {
    const y0 = 24 + r.ub; // linha do quadril
    // Coxa horizontal para a frente (esquerda) e canela para baixo.
    b.rect(7, y0 - 1, 7, 2, pants.base);
    b.rect(7, y0 - 1, 6, 1, pants.lt);
    b.set(13, y0, pants.dk);
    const shin = skinLeg ? p.skin : pants;
    b.rect(7, y0 + 1, 2, 30 - (y0 + 1), shin.base);
    b.set(8, y0 + 1, shin.dk);
    if (r.toeTap) {
      // Ponta do pé levantada, calcanhar apoiado.
      b.rect(5, 29, 2, 1, sh.base);
      b.set(5, 29, sh.lt);
      b.rect(7, 30, 2, 1, sh.base);
    } else {
      b.rect(5, 30, 4, 1, sh.base);
      b.set(5, 30, sh.lt);
    }
    return;
  }
  const top = 24 + r.ub;
  b.rect(9, top, 5, 2, pants.base);
  b.set(9, top, pants.lt);
  b.set(13, top, pants.dk);
  b.set(13, top + 1, pants.dk);
  if (style === 'skirt') {
    b.rect(8, top + 1, 7, 2, pants.base);
    b.set(8, top + 1, pants.lt);
    b.set(14, top + 2, pants.dk);
  }
  const leg = (dx: number, lift: number, dim: boolean) => {
    // Perna de 3px do quadril (x≈11) ao pé deslocado `dx`.
    const pc = dim ? ramp(pants.dk, 0.07) : pants;
    const sc = dim ? ramp(p.skin.dk, 0.07) : p.skin;
    const shc = dim ? ramp(sh.dk, 0.08) : sh;
    const y0 = top + 2;
    const y1 = 28 - lift;
    for (let y = y0; y <= y1; y++) {
      const tt = (y - y0) / Math.max(1, y1 - y0);
      const x = Math.round(10 + dx * tt);
      const c = skinLeg && y >= top + 3 ? sc : pc;
      b.set(x, y, c.lt);
      b.set(x + 1, y, c.base);
      b.set(x + 2, y, c.dk);
    }
    const fx = Math.round(10 + dx);
    b.rect(fx - 1, y1 + 1, 4, 1, shc.base);
    b.set(fx - 1, y1 + 1, shc.lt);
    b.rect(fx - 1, y1 + 2, 4, 1, shc.dk);
  };
  leg(r.legA.dx, -r.legA.dy, true);
  leg(r.legB.dx, -r.legB.dy, false);
}

function drawTorso(dc: Dc): void {
  const { b, p, r, a } = dc;
  const y = 18 + r.ub;
  const t = p.top;
  const ac = p.acc;
  const lx = r.lean;
  if (r.view === 'side') {
    // Tronco de perfil (x 8..14), frente à esquerda.
    b.rect(8 + lx, y, 7, 6, t.base);
    for (let yy = y; yy < y + 6; yy++) {
      b.set(8 + lx, yy, t.lt);
      b.set(14 + lx, yy, t.dk);
    }
    b.rect(8 + lx, y + 5, 7, 1, t.dk);
    switch (a.topStyle) {
      case 'hoodie':
        b.rect(12 + lx, y - 1, 3, 2, t.dk);
        b.set(13 + lx, y - 1, t.base);
        b.set(9 + lx, y + 1, ac.base);
        b.set(9 + lx, y + 2, ac.base);
        b.rect(9 + lx, y + 4, 4, 1, t.dk);
        break;
      case 'shirt_tie':
        b.set(9 + lx, y, t.hi);
        b.set(10 + lx, y, t.hi);
        for (let yy = y + 1; yy <= y + 4; yy++) b.set(9 + lx, yy, ac.base);
        b.set(9 + lx, y, ac.dk);
        break;
      case 'jacket':
        b.set(9 + lx, y + 1, ac.base);
        b.set(9 + lx, y + 2, ac.base);
        b.set(9 + lx, y + 3, ac.base);
        b.set(10 + lx, y, t.hi);
        break;
      case 'sweater':
        b.rect(9 + lx, y + 2, 6, 1, ac.base);
        b.rect(9 + lx, y + 5, 6, 1, t.dd);
        break;
      case 'polo':
        b.set(10 + lx, y, ac.base);
        b.set(11 + lx, y, ac.base);
        break;
      case 'blouse':
        b.set(9 + lx, y, ac.lt);
        b.set(10 + lx, y, ac.lt);
        b.set(9 + lx, y + 2, ac.base);
        b.rect(8 + lx, y + 5, 7, 1, t.dk);
        break;
      case 'tshirt':
        b.set(9 + lx, y + 2, ac.base);
        break;
    }
    drawLanyard(dc);
    return;
  }
  // Frente / costas: x 8..15.
  b.rect(8, y, 8, 6, t.base);
  for (let yy = y; yy < y + 6; yy++) {
    b.set(8, yy, t.lt);
    b.set(15, yy, t.dk);
  }
  b.rect(8, y + 5, 8, 1, t.dk);
  b.set(8, y + 5, t.base);
  const front = r.view === 'down';
  switch (a.topStyle) {
    case 'tshirt':
      b.rect(10, y, 4, 1, t.dk);
      if (front) {
        b.rect(10, y + 2, 2, 2, ac.base);
        b.set(11, y + 3, ac.dk);
      }
      break;
    case 'hoodie':
      if (front) {
        b.rect(9, y, 6, 1, t.dk);
        b.set(9, y, t.lt);
        b.set(10, y + 1, ac.lt);
        b.set(10, y + 2, ac.base);
        b.set(13, y + 1, ac.lt);
        b.set(13, y + 2, ac.base);
        b.rect(9, y + 3, 6, 2, t.dk);
        b.rect(10, y + 3, 4, 1, t.base);
      } else {
        b.rect(9, y, 6, 3, t.dk);
        b.rect(10, y, 4, 2, t.dd);
        b.rect(10, y, 4, 1, t.dk);
      }
      b.rect(8, y + 5, 8, 1, t.dd);
      break;
    case 'shirt_tie':
      if (front) {
        b.set(9, y, t.hi);
        b.set(10, y, t.hi);
        b.set(13, y, t.hi);
        b.set(14, y, t.hi);
        b.set(11, y, ac.lt);
        b.set(12, y, ac.base);
        for (let yy = y + 1; yy <= y + 4; yy++) {
          b.set(11, yy, ac.base);
          b.set(12, yy, ac.dk);
        }
        b.set(11, y + 5, ac.dk);
      } else {
        b.rect(9, y, 6, 1, t.hi);
      }
      break;
    case 'sweater':
      if (front) b.rect(10, y, 4, 1, t.dd);
      b.rect(8, y + 2, 8, 1, ac.base);
      b.set(15, y + 2, ac.dk);
      b.rect(8, y + 5, 8, 1, t.dd);
      break;
    case 'jacket':
      if (front) {
        b.rect(10, y, 4, 6, ac.base);
        b.set(13, y, ac.dk);
        for (let yy = y; yy < y + 6; yy++) b.set(13, yy, ac.dk);
        b.set(10, y, t.hi);
        b.set(13, y, t.lt);
        b.set(10, y + 1, t.lt);
        b.set(13, y + 1, t.base);
      } else {
        b.vline(11, y + 1, y + 5, t.dk);
        b.rect(9, y, 6, 1, t.lt);
      }
      break;
    case 'blouse':
      if (front) {
        b.rect(9, y, 6, 1, ac.lt);
        b.set(11, y + 1, ac.lt);
        b.set(12, y + 1, ac.base);
        b.set(11, y + 3, ac.dk);
      } else b.rect(9, y, 6, 1, ac.base);
      b.rect(7, y + 5, 10, 1, t.dk);
      b.set(7, y + 5, t.base);
      break;
    case 'polo':
      if (front) {
        b.set(9, y, ac.lt);
        b.set(10, y, ac.base);
        b.set(13, y, ac.base);
        b.set(14, y, ac.dk);
        b.set(11, y, t.dk);
        b.set(12, y, t.dk);
        b.set(11, y + 1, t.dk);
        b.set(11, y + 2, ac.lt);
      } else b.rect(9, y, 6, 1, ac.base);
      break;
  }
  drawLanyard(dc);
}

function drawLanyard(dc: Dc): void {
  const col = dc.a.lanyard;
  if (!col) return;
  const { b, r } = dc;
  const y = 18 + r.ub;
  const card = '#f6f4ee';
  const lx = r.lean;
  if (r.view === 'down') {
    b.set(10, y, col);
    b.set(13, y, col);
    b.set(10, y + 1, col);
    b.set(13, y + 1, col);
    b.set(11, y + 2, col);
    b.set(12, y + 2, col);
    b.rect(10, y + 3, 4, 3, card);
    b.rect(10, y + 3, 4, 1, shade(col, -0.05));
    b.set(11, y + 4, '#7f93b3');
    b.set(12, y + 4, '#c9d2e0');
    b.set(13, y + 5, '#d6d3cb');
  } else if (r.view === 'up') {
    b.hline(9, 14, y, col);
    b.set(9, y + 1, shade(col, -0.1));
    b.set(14, y + 1, shade(col, -0.1));
  } else {
    b.set(11 + lx, y, col);
    b.set(10 + lx, y + 1, col);
    b.set(9 + lx, y + 2, col);
    b.rect(8 + lx, y + 3, 2, 3, card);
    b.set(8 + lx, y + 3, shade(col, -0.05));
    b.set(9 + lx, y + 3, shade(col, -0.05));
  }
}

// ----- itens segurados

const MUG: readonly string[] = ['wwwo', 'cccw', 'rrrh', 'wwwh', 'www.'];
const CUP: readonly string[] = ['bbb', 'www', 'www', '.w.'];

function drawItem(dc: Dc, x: number, y: number): void {
  const { b, r } = dc;
  const it = r.held;
  const side = r.view === 'side';
  switch (it) {
    case 'coffee':
      b.stamp(MUG, x, y, { w: '#f4f2ee', c: '#6b4226', r: '#e2604f', h: '#cfcac0', o: '#f4f2ee' }, side);
      break;
    case 'water':
      b.stamp(CUP, x, y, { b: '#9ad4f5', w: '#eef6fb' });
      break;
    case 'papers':
      if (side) {
        b.rect(x, y, 2, 6, '#f6f4ee');
        b.vline(x + 1, y, y + 5, '#d9d5cb');
      } else {
        b.rect(x + 1, y - 1, 6, 6, '#e7e3d8');
        b.rect(x, y, 6, 6, '#f8f6f0');
        for (let i = 0; i < 3; i++) b.hline(x + 1, x + 3 + (i % 2), y + 1 + i * 2, '#a6b0c0');
      }
      break;
    case 'book':
      if (side) {
        b.rect(x, y, 2, 6, '#3f63a8');
        b.vline(x + 1, y + 1, y + 4, '#f2efe6');
      } else if (r.view === 'down' && r.twoHands) {
        // Livro aberto diante do peito.
        b.rect(x, y, 8, 5, '#f6f3ea');
        b.vline(x + 3, y, y + 4, '#cfc8b8');
        b.vline(x + 4, y, y + 4, '#e2dccd');
        for (let i = 0; i < 2; i++) {
          b.hline(x + 1, x + 2, y + 1 + i * 2, '#a8b0bf');
          b.hline(x + 5, x + 6, y + 1 + i * 2, '#a8b0bf');
        }
        b.hline(x, x + 7, y + 5, '#3f63a8');
      } else {
        b.rect(x, y, 5, 6, '#3f63a8');
        b.rect(x + 1, y + 1, 3, 1, '#f2c14e');
        b.vline(x + 4, y, y + 5, '#2d4a85');
      }
      break;
    case 'laptop':
      if (side) {
        b.rect(x, y, 2, 7, '#aeb6c2');
        b.vline(x, y, y + 6, '#d3d8df');
      } else {
        b.rect(x, y, 8, 5, '#b9c0cb');
        b.hline(x, x + 7, y, '#d9dee5');
        b.rect(x + 3, y + 2, 2, 1, '#eef1f5');
        b.hline(x, x + 7, y + 4, '#8d96a5');
      }
      break;
    case 'box': {
      const w = side ? 6 : 10;
      b.rect(x, y, w, 7, '#c99a5e');
      b.hline(x, x + w - 1, y, '#dcb27a');
      b.hline(x, x + w - 1, y + 6, '#a87b45');
      b.rect(x + Math.floor(w / 2) - 1, y, 2, 7, '#e8d3a8');
      b.vline(x + w - 1, y + 1, y + 5, '#b3854d');
      break;
    }
    case 'paddle':
      b.stamp(['.rr.', 'rRrr', 'rrrd', '.rd.', '.h..', '.h..'], x, y, { r: '#d64545', R: '#ef7a6a', d: '#a83232', h: '#6b4a32' }, side);
      break;
    case 'popcorn':
      b.stamp(POPCORN, x, y, POPCORN_PAL);
      break;
    case 'controller':
      b.stamp(side ? CONTROLLER_SIDE : CONTROLLER, x, y, CONTROLLER_PAL);
      break;
    case 'phone':
      b.stamp(side ? PHONE_SIDE : PHONE, x, y, PHONE_PAL);
      break;
    case 'lipstick':
      // Batom deitado, ponta vermelha para o lado da boca (de costas não aparece).
      if (r.view !== 'up') b.stamp(['rgG'], x, y, { r: '#d8365a', g: '#f0c75a', G: '#b38a2e' });
      break;
    case 'comb':
      b.stamp(['cccc', 'c.c.'], x, y, { c: '#3d4252' });
      break;
    case 'rock':
    case 'paper':
    case 'scissors':
      drawGesture(dc, it, x, y);
      break;
    case 'none':
      break;
  }
}

/** Controle de videogame (7x3): corpo grafite com brilho, direcional escuro e dois botões. */
const CONTROLLER: readonly string[] = ['.hLLLL.', 'LdLLrbL', 'cc...cc'];
const CONTROLLER_SIDE: readonly string[] = ['hLL', 'cLr'];
const CONTROLLER_PAL: Palette = { L: '#4c5263', h: '#737b8f', d: '#1d2029', r: '#e8545a', b: '#4f8fe6', c: '#363b48' };
/** Celular (3x5) com a tela azul acesa; de perfil (2x4), a borda com a tela virada para o rosto. */
const PHONE: readonly string[] = ['dDd', 'dBd', 'dbd', 'dbd', 'ddd'];
const PHONE_SIDE: readonly string[] = ['dB', 'db', 'db', 'dd'];
const PHONE_PAL: Palette = { d: '#2b2f3a', D: '#5a6172', b: '#6fbdf0', B: '#c8eaff' };

/**
 * Gestos do jokenpô em pele (L = luz, s = base, S = sombra), relativos à mão (canto do pincel 2x2).
 * De perfil apontam para a frente (esquerda); de costas usam o mesmo desenho espelhado (para a
 * direita, braço aberto para o lado); de frente aparecem diante do peito.
 */
interface GestureTpl {
  rows: readonly string[];
  dx: number;
  dy: number;
}
const GESTURE_SIDE: Readonly<Record<'rock' | 'paper' | 'scissors', GestureTpl>> = {
  // Punho redondo, maior que a mão parada.
  rock: { rows: ['.LLs', 'LsLs', 'sssS', '.SS.'], dx: -2, dy: -1 },
  // Mão aberta em leque: quatro dedos separados e o polegar para cima.
  paper: { rows: ['..L.L.', 'L.L.Ls', '.LsLss', 'LsssSS', '.SSSS.'], dx: -4, dy: -3 },
  // Indicador e médio abertos em V para a frente.
  scissors: { rows: ['L....', '.L...', '..Lss', '.SsSS', 'S....'], dx: -3, dy: -2 },
};
const GESTURE_FRONT: Readonly<Record<'rock' | 'paper' | 'scissors', GestureTpl>> = {
  rock: { rows: ['.LL.', 'LsLs', 'sSsS', '.SS.'], dx: -1, dy: -1 },
  paper: { rows: ['L.L.L', 'L.L.s', 'sLsLs', 'sssss', 'SsssS', '.SSS.'], dx: -2, dy: -4 },
  scissors: { rows: ['L...s', 'L...s', '.L.s.', '.LsS.', '.sSS.', '..S..'], dx: -2, dy: -4 },
};

function drawGesture(dc: Dc, kind: 'rock' | 'paper' | 'scissors', hx: number, hy: number): void {
  const { b, p, r } = dc;
  const pal: Palette = { L: p.skin.lt, s: p.skin.base, S: p.skin.dk };
  let rows: readonly string[];
  let x0: number;
  let flip = false;
  if (r.view === 'down') {
    const g = GESTURE_FRONT[kind];
    rows = g.rows;
    x0 = hx + g.dx;
    hy += g.dy;
  } else {
    const g = GESTURE_SIDE[kind];
    rows = g.rows;
    flip = r.view === 'up';
    // Espelhado em torno do centro da mão (o pincel ocupa hx..hx+1).
    x0 = flip ? hx - g.dx - rows[0].length + 2 : hx + g.dx;
    hy += g.dy;
  }
  b.stamp(rows, x0, hy, pal, flip);
  // Contorno próprio onde o gesto passa por cima da roupa (o contorno geral só pega o lado de fora).
  const ink = mix(p.skin.dd, '#1d2433', 0.45);
  const w = rows[0].length;
  const on = (cx: number, cy: number) => {
    if (cy < 0 || cy >= rows.length || cx < 0 || cx >= w) return false;
    const ch = rows[cy][flip ? w - 1 - cx : cx];
    return ch !== '.' && ch !== ' ';
  };
  const skins = [p.skin.lt, p.skin.base, p.skin.dk, p.skin.hi].map(hexKey);
  for (let cy = -1; cy <= rows.length; cy++) {
    for (let cx = -1; cx <= w; cx++) {
      if (on(cx, cy)) continue;
      if (!(on(cx - 1, cy) || on(cx + 1, cy) || on(cx, cy - 1) || on(cx, cy + 1))) continue;
      const X = x0 + cx;
      const Y = hy + cy;
      if (b.alpha(X, Y) < 160 || skins.includes(pixelKey(b, X, Y))) continue;
      b.set(X, Y, ink);
    }
  }
}

function hexKey(c: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  return m ? parseInt(m[1], 16) : -1;
}

function pixelKey(b: PixelBuf, x: number, y: number): number {
  const xi = x + b.ox;
  const yi = y + b.oy;
  if (!b.inside(xi, yi)) return -1;
  const i = (yi * b.w + xi) * 4;
  return (b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2];
}

/**
 * Balde de pipoca (6x7, canto superior esquerdo = início da pipoca): pipocas transbordando por cima,
 * aro claro e listras verticais vermelho/branco que afinam para baixo. Luz do alto-esquerda.
 */
const POPCORN: readonly string[] = ['.pk.p.', 'kpypkK', 'aAAAAa', 'lwrwrW', 'lwrwrW', 'lwrwrW', '.wrwr.'];
const POPCORN_PAL: Palette = {
  p: '#fff9e6', // pipoca (luz)
  k: '#f3e3b8', // pipoca (sombra)
  K: '#e2cc92',
  y: '#ffd75e', // manteiga
  a: '#e9e3d6', // aro (bordas)
  A: '#fbf8f1', // aro
  l: '#ef6457', // listra vermelha iluminada (borda esquerda)
  r: '#d8413f', // listra vermelha
  w: '#f6f1e6', // listra branca
  W: '#cfc6b6', // listra branca na sombra (borda direita)
};

/** Posição do item em relação à mão (mão = último ponto do braço B, em coordenadas desenhadas). */
function itemPos(dc: Dc): Pt | null {
  const { r } = dc;
  const it = r.held;
  if (it === 'none') return null;
  if (r.itemAt) return [r.itemAt[0] + r.lean, r.itemAt[1] + r.ub];
  const hand = r.armB.pts[r.armB.pts.length - 1];
  const hx = hand[0] + r.lean;
  const hy = hand[1] + r.ub;
  if (GESTURES.has(it)) return [hx, hy];
  if (r.twoHands) {
    if (r.view === 'side') return [hx - 2, hy - 3];
    const y = 18 + r.ub + 1;
    if (it === 'phone') return [10, y];
    if (it === 'box') return [7, y];
    if (it === 'laptop') return [8, y + 1];
    if (it === 'book' && r.view === 'down') return [8, y + 1];
    return [9, y];
  }
  switch (it) {
    case 'coffee':
      return r.view === 'side' ? [hx - 3, hy - 3] : [hx, hy - 3];
    case 'water':
      return r.view === 'side' ? [hx - 2, hy - 3] : [hx, hy - 3];
    case 'paddle':
      return r.view === 'side' ? [hx - 2, hy - 5] : [hx + 1, hy - 4];
    case 'popcorn':
      // Segurado pela lateral do balde (a mão fica na borda de trás/esquerda).
      return r.view === 'side' ? [hx - 5, hy - 4] : [hx + 1, hy - 4];
    case 'controller':
      return r.view === 'side' ? [hx - 2, hy] : [hx - 2, hy];
    case 'phone':
      return r.view === 'side' ? [hx - 2, hy - 3] : [hx, hy - 4];
    case 'lipstick':
      return r.view === 'side' ? [hx - 2, hy + 1] : [hx - 2, hy + 1];
    case 'comb':
      return [hx - 1, hy - 2];
    default:
      return [hx, hy - 2];
  }
}

// ---------------------------------------------------------------- composição

export function renderCharacter(req: CharacterFrameRequest): BufSprite {
  if (req.dir === 'right') {
    const left = renderCharacter({ ...req, dir: 'left' });
    return { buf: left.buf.flipped(), ax: CHAR_W - left.ax, ay: left.ay };
  }
  const view: HeadView = req.dir === 'up' ? 'up' : req.dir === 'down' ? 'down' : 'side';
  const b = new PixelBuf(CHAR_W, CHAR_H);
  const a = req.appearance;
  const dc: Dc = { b, a, p: paletteOf(a), r: makeRig(req, view) };
  const r = dc.r;
  const sleeve = sleeveLength(a);
  const sr = dc.p.top;
  const ip = itemPos(dc);

  // 1) Atrás de tudo: cabelo longo (frente), item nas costas.
  drawHair(dc, 'back');
  if (ip && r.itemBehind) drawItem(dc, ip[0], ip[1]);

  const headStack = () => {
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawAccessory(dc);
  };

  if (view !== 'side' && r.itemAt) {
    // Item em posição fixa (pipoca na pose 'wait'). De costas: balde e braços antes da cabeça (a mão
    // que vai à boca some atrás dela). De frente: cabeça, balde, braço que abraça e a mão por cima.
    drawLegs(dc);
    drawTorso(dc);
    if (view === 'up') {
      if (ip) drawItem(dc, ip[0], ip[1]);
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
      headStack();
    } else {
      headStack();
      if (ip) drawItem(dc, ip[0], ip[1]);
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
    }
  } else if (view === 'side') {
    drawArm(dc, r.armA, sr, sleeve, 0.08);
    drawLegs(dc);
    drawTorso(dc);
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawAccessory(dc);
    if (ip && !r.itemBehind) drawItem(dc, ip[0], ip[1]);
    drawArm(dc, r.armB, sr, sleeve, 0, true);
  } else {
    drawLegs(dc);
    const armsBehindHead = r.view === 'up' && (req.pose === 'type' || req.pose === 'use' || req.pose === 'drink');
    drawTorso(dc);
    if (armsBehindHead) {
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
    }
    const raisedHigh = (arm: Arm) => arm.pts[arm.pts.length - 1][1] < 16;
    if (r.crossFront === null && !armsBehindHead) {
      if (!raisedHigh(r.armA)) drawArm(dc, r.armA, sr, sleeve);
      if (!raisedHigh(r.armB) && !(ip && !r.itemBehind && r.twoHands)) drawArm(dc, r.armB, sr, sleeve);
    }
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawAccessory(dc);
    // Braços cruzados por cima do cabelo comprido que cai no peito (a mão que bate fica visível).
    if (r.crossFront !== null) drawCrossedArms(dc, sr, sleeve, r.crossFront === 1);
    if (ip && !r.itemBehind) {
      drawItem(dc, ip[0], ip[1]);
      if (r.twoHands) {
        // Mãos por cima das bordas do item.
        drawArm(dc, r.armA, sr, sleeve);
        drawArm(dc, r.armB, sr, sleeve);
      }
    }
    if (!armsBehindHead && r.crossFront === null) {
      if (raisedHigh(r.armA)) drawArm(dc, r.armA, sr, sleeve);
      if (raisedHigh(r.armB)) drawArm(dc, r.armB, sr, sleeve);
    }
  }
  if (r.tapAt) {
    const [tx, ty] = r.tapAt;
    b.set(tx + r.lean, ty + r.ub, dc.p.skin.base);
    b.set(tx + r.lean, ty + 1 + r.ub, dc.p.skin.dk);
  }
  if (r.kernelAt) {
    const [kx, ky] = r.kernelAt;
    b.set(kx + r.lean, ky + r.ub, POPCORN_PAL.p);
    b.set(kx + 1 + r.lean, ky + r.ub, POPCORN_PAL.y);
  }

  b.outline();
  if (!r.seated) b.shadow(CHAR_AX, CHAR_AY - 0.5, 6, 2, '#1c2034', 0.2);
  return { buf: b, ax: CHAR_AX, ay: CHAR_AY };
}
