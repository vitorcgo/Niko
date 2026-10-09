// Grade de caminhabilidade do prédio (1 célula por tile).
//   0 = bloqueado, 1 = livre, 2 = livre porém evitado (assentos: o A* só passa se precisar).

export const BLOCKED = 0;
export const FREE = 1;
export const SEAT = 2;

export class WalkGrid {
  readonly cells: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly version = 0,
  ) {
    this.cells = new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.cells[y * this.w + x] : BLOCKED;
  }

  set(x: number, y: number, v: number): void {
    if (this.inside(x, y)) this.cells[y * this.w + x] = v;
  }

  walkable(x: number, y: number): boolean {
    return this.get(x, y) !== BLOCKED;
  }

  fill(x: number, y: number, w: number, h: number, v: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, v);
  }

  /** Tile caminhável mais próximo (busca em anel), ou null. */
  nearestWalkable(x: number, y: number, maxR = 12): { x: number; y: number } | null {
    if (this.walkable(x, y)) return { x, y };
    for (let r = 1; r <= maxR; r++) {
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.walkable(x + dx, y + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { x: x + dx, y: y + dy };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** BFS: conjunto de índices alcançáveis a partir de (x, y). */
  reachableFrom(x: number, y: number): Uint8Array {
    const seen = new Uint8Array(this.w * this.h);
    if (!this.walkable(x, y)) return seen;
    const queue = new Int32Array(this.w * this.h);
    let head = 0;
    let tail = 0;
    queue[tail++] = y * this.w + x;
    seen[y * this.w + x] = 1;
    while (head < tail) {
      const i = queue[head++];
      const cx = i % this.w;
      const cy = (i - cx) / this.w;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!this.walkable(nx, ny)) continue;
        const j = ny * this.w + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    return seen;
  }
}
