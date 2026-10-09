// Partículas em pixel art (px de mundo): pipoca pulando do balde, confete da comemoração, chuva
// da nuvenzinha de quando um shell falha, moedinhas voando (aposta paga) e brilhos (espelho).
// Pool fixo em arrays tipados: nada é alocado por frame.

/** Tipos de partícula. */
const enum PK {
  Popcorn,
  Confetti,
  Rain,
  Coin,
  Sparkle,
}

/** Cores do confete (saturadas, legíveis sobre o piso claro e o carpete). */
export const CONFETTI_COLORS: readonly string[] = ['#ff4d6d', '#ffb11f', '#ffe14d', '#3ddc84', '#3fa7ff', '#b06bff', '#ff7ad9'];
const POPCORN_BODY = '#fff6dc';
const POPCORN_SHADE = '#f2c75c';
const RAIN_COLOR = '#7cc4ff';
const COIN_BODY = '#ffcf3a';
const COIN_EDGE = '#c98a12';
const COIN_SHINE = '#fff6c2';
const SPARKLE_COLORS: readonly string[] = ['#ffffff', '#fff3a6', '#ffd1f0', '#bfe9ff'];

/** Gravidade por tipo (px/s²). */
const GRAVITY: Readonly<Record<PK, number>> = { [PK.Popcorn]: 260, [PK.Confetti]: 150, [PK.Rain]: 0, [PK.Coin]: 240, [PK.Sparkle]: -14 };
/** Arrasto horizontal por tipo (fração perdida por segundo): confete plana, pipoca não. */
const DRAG: Readonly<Record<PK, number>> = { [PK.Popcorn]: 0, [PK.Confetti]: 2.2, [PK.Rain]: 0, [PK.Coin]: 0, [PK.Sparkle]: 3 };

export class Particles {
  readonly cap: number;
  private n = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  /** Fase própria (oscilação do confete). */
  private readonly ph: Float32Array;
  private readonly kind: Uint8Array;
  private readonly color: Uint8Array;

  constructor(cap = 600) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.ph = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.color = new Uint8Array(cap);
  }

  get count(): number {
    return this.n;
  }

  /** Adiciona uma partícula (ignorada se o pool estiver cheio). `life` em segundos. */
  private spawn(kind: PK, x: number, y: number, vx: number, vy: number, life: number, color = 0): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = Math.max(0.01, life);
    this.ph[i] = Math.random() * 6.283;
    this.color[i] = color;
  }

  /** Uma pipoca pula do balde: arco curto para cima e cai de volta. */
  popcorn(x: number, y: number): void {
    const vy = -(62 + Math.random() * 26);
    this.spawn(PK.Popcorn, x + (Math.random() * 4 - 2), y, Math.random() * 28 - 14, vy, (-2 * vy) / GRAVITY[PK.Popcorn] + 0.05);
  }

  /** Explosão de confete colorido a partir de (x, y). */
  confetti(x: number, y: number, count = 42): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 55 + Math.random() * 70;
      this.spawn(PK.Confetti, x + (Math.random() * 6 - 3), y, Math.cos(a) * sp, Math.sin(a) * sp, 1.3 + Math.random() * 0.9, Math.floor(Math.random() * CONFETTI_COLORS.length));
    }
  }

  /** Um confete caindo do alto (festa da sala): balança no ar e some depois de cair ~`fall` px. */
  confettiFall(x: number, y: number, fall: number): void {
    this.spawn(PK.Confetti, x, y, Math.random() * 24 - 12, 8 + Math.random() * 16, Math.max(0.3, fall / 34) * (0.85 + Math.random() * 0.3), Math.floor(Math.random() * CONFETTI_COLORS.length));
  }

  /** Um pingo de chuva caindo `fall` px a partir de (x, y). */
  rain(x: number, y: number, fall: number): void {
    const v = 32;
    this.spawn(PK.Rain, x, y, 0, v, Math.max(0.05, fall / v));
  }

  /**
   * Moedinhas em arco de (x0, y0) até (x1, y1): cada uma é um lançamento balístico que chega ao
   * destino no fim da vida (umas antes, outras depois, como um punhado jogado).
   */
  coins(x0: number, y0: number, x1: number, y1: number, count = 7): void {
    const g = GRAVITY[PK.Coin];
    for (let i = 0; i < count; i++) {
      const t = 0.55 + i * 0.07 + Math.random() * 0.06;
      const tx = x1 + (Math.random() * 6 - 3);
      const ty = y1 + (Math.random() * 3 - 1);
      const sx = x0 + (Math.random() * 4 - 2);
      this.spawn(PK.Coin, sx, y0, (tx - sx) / t, (ty - y0) / t - 0.5 * g * t, t);
    }
  }

  /** Brilhos subindo em volta de (x, y). */
  sparkle(x: number, y: number, count = 9): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = 5 + Math.random() * 6;
      this.spawn(PK.Sparkle, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8 - 6, Math.cos(a) * 6, -10 - Math.random() * 8, 0.8 + Math.random() * 0.6, Math.floor(Math.random() * SPARKLE_COLORS.length));
    }
  }

  update(dt: number): void {
    const d = Math.min(0.1, Math.max(0, dt));
    let i = 0;
    while (i < this.n) {
      this.age[i] += d;
      if (this.age[i] >= this.life[i]) {
        this.remove(i);
        continue;
      }
      const k = this.kind[i] as PK;
      this.vy[i] += GRAVITY[k] * d;
      if (DRAG[k]) this.vx[i] *= Math.max(0, 1 - DRAG[k] * d);
      // confete: queda limitada (plana balançando)
      if (k === PK.Confetti && this.vy[i] > 38) this.vy[i] = 38;
      this.x[i] += this.vx[i] * d;
      this.y[i] += this.vy[i] * d;
      i++;
    }
  }

  /** Desenha as partículas visíveis no retângulo (px de mundo). */
  draw(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number, now: number): void {
    if (!this.n) return;
    for (let i = 0; i < this.n; i++) {
      const x = Math.round(this.x[i]);
      const y = Math.round(this.y[i]);
      if (x < vx0 - 2 || x > vx1 + 2 || y < vy0 - 2 || y > vy1 + 2) continue;
      const k = this.kind[i] as PK;
      const left = 1 - this.age[i] / this.life[i];
      if (k === PK.Popcorn) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = POPCORN_BODY;
        ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = POPCORN_SHADE;
        ctx.fillRect(x + 1, y + 1, 1, 1);
      } else if (k === PK.Confetti) {
        ctx.globalAlpha = Math.min(1, left * 3.5);
        ctx.fillStyle = CONFETTI_COLORS[this.color[i] % CONFETTI_COLORS.length];
        // gira no ar: alterna entre 2x1 e 1x2
        const flip = Math.sin(now / 90 + this.ph[i]) > 0;
        ctx.fillRect(x, y, flip ? 2 : 1, flip ? 1 : 2);
      } else if (k === PK.Coin) {
        // moeda girando: alterna entre a face (3x3 com brilho) e o perfil (1x3)
        ctx.globalAlpha = 1;
        const face = Math.sin(now / 70 + this.ph[i]) > -0.3;
        if (face) {
          ctx.fillStyle = COIN_EDGE;
          ctx.fillRect(x - 1, y - 1, 3, 3);
          ctx.fillStyle = COIN_BODY;
          ctx.fillRect(x - 1, y - 1, 2, 2);
          ctx.fillStyle = COIN_SHINE;
          ctx.fillRect(x - 1, y - 1, 1, 1);
        } else {
          ctx.fillStyle = COIN_BODY;
          ctx.fillRect(x, y - 1, 1, 3);
        }
      } else if (k === PK.Sparkle) {
        // estrelinha de 4 pontas piscando (cruz 3x3 ou ponto)
        ctx.globalAlpha = Math.min(1, left * 2.5);
        ctx.fillStyle = SPARKLE_COLORS[this.color[i] % SPARKLE_COLORS.length];
        if (Math.sin(now / 90 + this.ph[i]) > 0) {
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        } else ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = RAIN_COLOR;
        ctx.fillRect(x, y, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.n = 0;
  }

  /** Remove trocando pelo último (ordem não importa). */
  private remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.ph[i] = this.ph[j];
    this.kind[i] = this.kind[j];
    this.color[i] = this.color[j];
  }
}
