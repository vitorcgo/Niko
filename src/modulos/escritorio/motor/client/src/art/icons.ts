// Ícones pixel art de estado (acima da cabeça), puros. Templates ASCII com contorno automático.
import type { IconName } from './api';
import { PixelBuf, type Palette } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

interface IconDef {
  rows: readonly string[];
  pal: Palette;
  /**
   * Opacidade do contorno (0–1). Padrão 1. Fios finos (teia) ficam com contorno translúcido para
   * não virarem traços grossos e escuros — continuam legíveis tanto no piso claro quanto na cadeira.
   */
  outlineAlpha?: number;
  /**
   * Opacidade do contorno nos "buracos" (áreas transparentes cercadas pelo desenho, como as células
   * da teia). Sem isso o halo enche cada célula e a teia vira um borrão cinza. Padrão = outlineAlpha.
   */
  holeOutlineAlpha?: number;
}

// Ampulheta: tampas de madeira, vidro azulado com brilho à esquerda e areia dourada.
const HOURGLASS_PAL: Palette = {
  t: '#e6b37a', // madeira (brilho)
  c: '#c48a52', // madeira
  C: '#8f5d36', // madeira (sombra)
  g: '#e4f3fc', // vidro
  w: '#ffffff', // reflexo
  G: '#a6c9e3', // vidro na sombra (direita)
  s: '#f5c451', // areia
  S: '#d6952a', // areia na sombra
};

const ICONS: Readonly<Record<IconName, IconDef>> = {
  alert: {
    rows: [
      '....o....',
      '...oyo...',
      '...yky...',
      '..yykyy..',
      '..yykyy..',
      '.yyykyyy.',
      '.yyyyyyy.',
      'yyyykyyyy',
      'ddddddddd',
    ],
    pal: { o: '#fff2a8', y: '#f7c843', k: '#4a3510', d: '#d9a12a' },
  },
  question: {
    rows: [
      '..bbbbb..',
      '.bbwwwbb.',
      'bbwbbbwbb',
      'bbbbbbwbb',
      'bbbbbwbbb',
      'bbbbwbbbb',
      'bbbbbbbbb',
      '.bbbwbbb.',
      '..ddddd..',
    ],
    pal: { b: '#4f8fe6', w: '#ffffff', d: '#3466b8' },
  },
  zzz: {
    rows: [
      '.....zzzz',
      '.......z.',
      '......z..',
      'zzz..zzzz',
      '..z......',
      '.z.......',
      'zzz......',
    ],
    pal: { z: '#cfe3ff' },
  },
  check: {
    rows: [
      '..ggggg..',
      '.ggggggg.',
      'gggggggwg',
      'ggggggwwg',
      'gwggggwgg',
      'gwwggwwgg',
      'ggwwwwggg',
      '.ggwwggg.',
      '..ddddd..',
    ],
    pal: { g: '#45b866', w: '#ffffff', d: '#2f8a4a' },
  },
  heart: {
    rows: [
      '.rr...rr.',
      'rhrr.rrrr',
      'rhrrrrrrr',
      'rrrrrrrrr',
      '.rrrrrrd.',
      '..rrrrd..',
      '...rrd...',
      '....d....',
    ],
    pal: { r: '#ef5a6f', h: '#ffb3bf', d: '#c23a50' },
  },
  coffee: {
    rows: [
      '..s..s...',
      '.s..s....',
      '..s..s...',
      'wwwwwww..',
      'wccccchhh',
      'wrrrrrw.h',
      'wrrrrrwhh',
      'wwwwwww..',
      '.ddddd...',
    ],
    pal: { s: '#e6ecf5', w: '#f4f2ee', c: '#6b4226', r: '#e2604f', h: '#d6d2c8', d: '#b9b3a6' },
  },
  music: {
    rows: [
      '...nnnnnn',
      '...nhhhhn',
      '...n....n',
      '...n....n',
      '...n....n',
      '.nnn..nnn',
      'nnnn.nnnn',
      '.nn...nn.',
    ],
    pal: { n: '#8d66cf', h: '#b89aea' },
  },
  idea: {
    rows: [
      '..yyyyy..',
      '.yhhyyyy.',
      'yhhyyyyyy',
      'yhyyyyyyy',
      'yyyyyyyyd',
      '.yyyyyyd.',
      '..yyyyd..',
      '..ggggg..',
      '...ggg...',
    ],
    pal: { y: '#ffd84d', h: '#fff4b8', d: '#e0b12e', g: '#9aa2ae' },
  },
  sweat: {
    rows: [
      '...b...',
      '...b...',
      '..bbb..',
      '.bwbbb.',
      '.bwbbb.',
      'bbbbbbb',
      '.bbbbd.',
      '..ddd..',
    ],
    pal: { b: '#6fc3f2', w: '#e6f6ff', d: '#3f9ad6' },
  },
  star: {
    rows: [
      '....y....',
      '...yhy...',
      '...yhy...',
      'yyyyhyyyy',
      '.yyyyyyy.',
      '..yyyyy..',
      '..yyyyy..',
      '.yyd.dyy.',
      '.yd...dy.',
    ],
    pal: { y: '#ffcf3f', h: '#fff2a8', d: '#d99e1f' },
  },
  lightning: {
    rows: [
      '....yyy',
      '...yyy.',
      '..yyy..',
      '.yyyyyy',
      '...yyy.',
      '..yyy..',
      '.yyd...',
      '.yd....',
      'yd.....',
    ],
    pal: { y: '#ffd84d', d: '#e0a62e' },
  },
  chat: {
    rows: [
      '.wwwwwwww.',
      'wwwwwwwwww',
      'wwkwwkwwkw',
      'wwwwwwwwww',
      '.wwwwwwww.',
      '..ww......',
      '.w........',
    ],
    pal: { w: '#ffffff', k: '#5b6b85' },
  },
  box: {
    rows: [
      '.hhhtthhh.',
      'hhhhtthhhh',
      'ccccttcccc',
      'cccctttccd',
      'ccccccccdd',
      'cccllllccd',
      'ccccccccdd',
      '.ddddddddd',
    ],
    pal: { h: '#e2b47a', c: '#c99a5e', t: '#f1dfb6', l: '#8b6a43', d: '#a87b45' },
  },
  hourglass: {
    // Em pé: quase toda a areia em cima, um fio caindo e um montinho embaixo.
    rows: [
      'tcccccccC',
      'CCCCCCCCC',
      '.wgggggG.',
      '.wsssssG.',
      '..wsssG..',
      '...gSG...',
      '..wgsgG..',
      '.wggsggG.',
      '.wgsssSG.',
      'tcccccccC',
      'CCCCCCCCC',
    ],
    pal: HOURGLASS_PAL,
  },
  hourglass_flip: {
    // A mesma ampulheta deitada (meio giro): a areia escorre para o lado de baixo dos dois bulbos.
    // Alternada com 'hourglass' (mesma âncora no centro inferior) parece girar sobre a cabeça.
    rows: [
      'tc.......tc',
      'tcw.....Gtc',
      'tcwg...gGtc',
      'tcggg.ggGtc',
      'tcsssSggGtc',
      'tcsss.ggGtc',
      'tcSs...sStc',
      'tcS.....Stc',
      'tc.......tc',
    ],
    pal: { ...HOURGLASS_PAL, t: '#d9a46c', c: '#a8723f' },
  },
  cobweb: {
    // Teia de canto, triangular (o canto fica em cima à esquerda; espelhe para outros cantos):
    // fios das bordas, o raio diagonal e dois arcos de quarto de círculo; uma aranhinha de olhos
    // claros na borda de fora. Fios brancos com contorno translúcido só na silhueta (as células
    // ficam quase limpas), legível tanto no piso claro quanto no estofado escuro.
    rows: [
      'wwwwwwwwwwww',
      'wf...w....w.',
      'w.f..w....w.',
      'w..fw.....w.',
      'w..wf....w..',
      'www..f...w..',
      'w.....f.w...',
      'w......w....',
      'w.....w.l.l.',
      'w...ww.lkKkl',
      'wwww....eke.',
      'w......l...l',
    ],
    pal: { w: '#ffffff', f: '#d3dbe5', k: '#3a3346', K: '#6f6287', e: '#fff7d6', l: '#55496a' },
    outlineAlpha: 0.6,
    holeOutlineAlpha: 0.14,
  },
  storm: {
    // Nuvem carregada com chuva e um raio amarelo (algo falhou).
    rows: [
      '...hHHh....',
      '.hhHHHHhhh.',
      'hhHhhhhhhcc',
      'cccccccccdd',
      '.dddddddddd',
      '......yo..b',
      '.b...yo...B',
      '.B..yyyyo..',
      '......yo...',
      '.b...yo....',
      '.B...o.....',
    ],
    pal: { h: '#8d97ab', H: '#b3bccc', c: '#6b7489', d: '#4f566a', y: '#ffd84d', o: '#e3a530', b: '#9fd2f6', B: '#5a9fd8' },
  },
  wave: {
    rows: [
      '..s.s.s..',
      '..s.s.s.s',
      '..s.s.s.s',
      's.sssssss',
      'sssssssss',
      '.sssssssd',
      '..ssssssd',
      '...ssssd.',
    ],
    pal: { s: '#ffd2a8', d: '#e0a87a' },
  },
  coin: {
    // Moeda dourada de frente: aro claro em cima à esquerda, sombra embaixo à direita, um "C"
    // gravado no meio e um brilho.
    rows: [
      '..yyyy..',
      '.yhwyyy.',
      'yhyKKyyd',
      'yhKyyyyd',
      'yhKyyyyd',
      'yyyKKyyd',
      '.yyyyydd',
      '..dddd..',
    ],
    pal: { y: '#ffcf3f', h: '#fff2a8', w: '#ffffff', K: '#d4931c', d: '#c98a1c' },
  },
  sparkle: {
    // Brilho de 4 pontas: centro branco e braços finos e longos.
    rows: [
      '....y....',
      '....y....',
      '...yhy...',
      '..yhwhy..',
      'yyhwwwhyy',
      '..yhwhy..',
      '...yhy...',
      '....y....',
      '....y....',
    ],
    pal: { y: '#ffe07a', h: '#fff6c8', w: '#ffffff' },
  },
  trophy: {
    // Taça dourada com alças e pedestal de madeira.
    rows: [
      'yhhhyyyyd',
      'yhwhyyydy',
      'y.hhyyd.y',
      '.yhhyyd.y',
      '..hyyyd..',
      '...yyd...',
      '....y....',
      '..bbbbb..',
      '.BBBBBBB.',
    ],
    pal: { y: '#ffcf3f', h: '#fff2a8', w: '#ffffff', d: '#d99e1f', b: '#a8723f', B: '#7a4f2a' },
  },
  hand_rock: {
    // Punho fechado de frente: três nós dos dedos em cima, vincos entre os dedos e o polegar
    // atravessado embaixo (tom mais quente).
    rows: [
      '.LL.LL.LL.',
      'LsskssksSS',
      'LsskssksSS',
      'LssssssssS',
      'LTTTTTsssS',
      '.TTTTTssS.',
      '..SSSSSS..',
    ],
    pal: { L: '#ffe0c4', s: '#f6c9a2', S: '#d99d72', k: '#c48660', T: '#ecb68b' },
  },
  hand_paper: {
    // Mão aberta: quatro dedos esticados e separados, polegar aberto para o lado.
    rows: [
      '..L.L....',
      '.LsLsL...',
      '.LsLsLs..',
      '.LsLsLs..',
      'LLsssss..',
      'sLssssss.',
      '.sssssSS.',
      '..ssssS..',
      '..SSSS...',
    ],
    pal: { L: '#ffe0c4', s: '#f6c9a2', S: '#d99d72' },
  },
  hand_scissors: {
    // Indicador e médio abertos em V; os outros dedos dobrados no punho.
    rows: [
      '.L...L...',
      '.Ls..Ls..',
      '..Ls.Ls..',
      '..LsLs...',
      '.LLsssk..',
      '.LsksksS.',
      '.sssssSS.',
      '..SSSSS..',
    ],
    pal: { L: '#ffe0c4', s: '#f6c9a2', S: '#d99d72', k: '#c48660' },
  },
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Ícone com contorno; âncora no centro inferior. */
export function renderIcon(name: IconName): BufSprite {
  const def = ICONS[name];
  const w = Math.max(...def.rows.map((r) => r.length));
  const h = def.rows.length;
  const b = new PixelBuf(w + 2, h + 2);
  b.stamp(def.rows, 1, 1, def.pal);
  const soft = def.outlineAlpha !== undefined || def.holeOutlineAlpha !== undefined;
  const before = soft ? b.data.slice() : null;
  b.outline();
  if (before) {
    // Só os pixels criados pelo contorno ganham a opacidade reduzida (menor ainda nos buracos).
    const outer = alpha255(def.outlineAlpha ?? 1);
    const hole = alpha255(def.holeOutlineAlpha ?? def.outlineAlpha ?? 1);
    const outside = reachableFromBorder(before, b.w, b.h);
    for (let p = 0; p < b.w * b.h; p++) {
      const i = p * 4 + 3;
      if (before[i] === 0 && b.data[i] > 0) b.data[i] = outside[p] ? outer : hole;
    }
  }
  return { buf: b, ax: Math.floor((w + 2) / 2), ay: h + 2 };
}

function alpha255(a: number): number {
  return Math.round(Math.max(0, Math.min(1, a)) * 255);
}

/**
 * Pixels transparentes alcançáveis a partir da borda andando só por transparentes (vizinhança 4).
 * Os demais transparentes são "buracos" cercados pelo desenho (linhas diagonais também fecham,
 * porque a vizinhança 4 não atravessa um degrau diagonal).
 */
function reachableFromBorder(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p] || data[p * 4 + 3] !== 0) return;
    seen[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop() as number;
    const x = p % w;
    const y = (p - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return seen;
}

export function iconTemplates(): Readonly<Record<IconName, IconDef>> {
  return ICONS;
}
