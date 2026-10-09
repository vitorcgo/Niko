// Fonte bitmap minúscula (3x5) para rótulos nítidos na página de prévia. Puro.
// Acentos e til ficam 2 linhas ACIMA do glifo (y-3..y-2, com 1 linha de folga) e a cedilha 2 linhas
// abaixo (y+5..y+6): reserve esse espaço ao posicionar rótulos com acentos.
const GLYPHS: Readonly<Record<string, string>> = {
  a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110', e: '111100110100111',
  f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010',
  p: '110101110100100', q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010',
  u: '101101101101111', v: '101101101101010', w: '101101111111101', x: '101101010101101', y: '101101010010010',
  z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '_': '000000000000111', '-': '000000111000000', '#': '101111101111101', '.': '000000000000010',
  '(': '010100100100010', ')': '010001001001010', '/': '001001010100100', ' ': '000000000000000', ':': '000010000010000',
  ',': '000000000010100', '×': '000101010101000', '—': '000000111000000', '>': '100010001010100', '<': '001010100010001',
  '+': '000010111010000',
};

/** Marcas diacríticas: linhas de 3 colunas e deslocamento vertical da primeira linha. */
const MARKS = {
  acute: { dy: -3, rows: ['001', '010'] },
  grave: { dy: -3, rows: ['100', '010'] },
  circ: { dy: -3, rows: ['010', '101'] },
  tilde: { dy: -3, rows: ['011', '110'] },
  cedilla: { dy: 5, rows: ['010', '110'] },
} as const;

type Mark = keyof typeof MARKS;

const DIACRITIC: Readonly<Record<string, readonly [string, Mark]>> = {
  á: ['a', 'acute'], à: ['a', 'grave'], â: ['a', 'circ'], ã: ['a', 'tilde'],
  é: ['e', 'acute'], ê: ['e', 'circ'], í: ['i', 'acute'],
  ó: ['o', 'acute'], ô: ['o', 'circ'], õ: ['o', 'tilde'], ú: ['u', 'acute'], ç: ['c', 'cedilla'],
};

/** Largura em px de `text` desenhado por pixelText (3 px por letra + 1 px de espaço). */
export function pixelTextWidth(text: string): number {
  return Math.max(0, [...text].length * 4 - 1);
}

/** Desenha texto em minúsculas (3x5 por letra, 1px de espaço, com acentos e cedilha) via fillRect. */
export function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): number {
  ctx.fillStyle = color;
  let cx = x;
  for (const raw of text.toLowerCase()) {
    const dia = DIACRITIC[raw];
    const ch = dia ? dia[0] : raw;
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    if (dia) {
      const m = MARKS[dia[1]];
      m.rows.forEach((row, r) => {
        for (let c = 0; c < 3; c++) if (row[c] === '1') ctx.fillRect(cx + c, y + m.dy + r, 1, 1);
      });
    }
    cx += 4;
  }
  return cx - x;
}
