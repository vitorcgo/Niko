// Registro de spots com reservas (1 ocupante por spot) e busca de alternativas livres.
import type { SpotDef, SpotKind } from '../layout/types';

export class SpotRegistry {
  private spots = new Map<string, SpotDef>();
  private owners = new Map<string, string>();
  private byKind = new Map<SpotKind, SpotDef[]>();
  private byGroup = new Map<string, SpotDef[]>();

  /** Substitui o conjunto de spots mantendo as reservas dos que continuam existindo. Retorna as reservas perdidas. */
  setSpots(spots: Iterable<SpotDef>): { spotId: string; owner: string }[] {
    this.spots.clear();
    this.byKind.clear();
    this.byGroup.clear();
    for (const s of spots) {
      this.spots.set(s.id, s);
      let list = this.byKind.get(s.kind);
      if (!list) this.byKind.set(s.kind, (list = []));
      list.push(s);
      if (s.group) {
        let g = this.byGroup.get(s.group);
        if (!g) this.byGroup.set(s.group, (g = []));
        g.push(s);
      }
    }
    const lost: { spotId: string; owner: string }[] = [];
    for (const [spotId, owner] of this.owners) {
      if (!this.spots.has(spotId)) {
        lost.push({ spotId, owner });
        this.owners.delete(spotId);
      }
    }
    return lost;
  }

  get(id: string | null | undefined): SpotDef | undefined {
    return id ? this.spots.get(id) : undefined;
  }

  all(): IterableIterator<SpotDef> {
    return this.spots.values();
  }

  ofKind(kind: SpotKind): readonly SpotDef[] {
    return this.byKind.get(kind) ?? [];
  }

  group(group: string): readonly SpotDef[] {
    return this.byGroup.get(group) ?? [];
  }

  ownerOf(id: string): string | undefined {
    return this.owners.get(id);
  }

  isFree(id: string, by?: string): boolean {
    const o = this.owners.get(id);
    return o === undefined || o === by;
  }

  reserve(id: string, by: string): boolean {
    if (!this.spots.has(id) || !this.isFree(id, by)) return false;
    this.owners.set(id, by);
    return true;
  }

  release(id: string | null | undefined, by: string): void {
    if (id && this.owners.get(id) === by) this.owners.delete(id);
  }

  releaseAll(by: string): void {
    for (const [id, o] of this.owners) if (o === by) this.owners.delete(id);
  }

  /** Spots reservados por alguém. */
  reservedBy(by: string): string[] {
    const out: string[] = [];
    for (const [id, o] of this.owners) if (o === by) out.push(id);
    return out;
  }

  /**
   * Spot livre de um tipo, o mais próximo de `near` (distância Manhattan em tiles), opcionalmente
   * filtrado. Com `rng`, sorteia entre os 3 mais próximos para variar o destino.
   */
  findFree(kind: SpotKind, opts: { near?: { tx: number; ty: number }; filter?: (s: SpotDef) => boolean; by?: string; rng?: () => number } = {}): SpotDef | null {
    const list = this.byKind.get(kind);
    if (!list) return null;
    const cands: { s: SpotDef; d: number }[] = [];
    for (const s of list) {
      if (!this.isFree(s.id, opts.by)) continue;
      if (opts.filter && !opts.filter(s)) continue;
      const d = opts.near ? Math.abs(s.tx - opts.near.tx) + Math.abs(s.ty - opts.near.ty) : 0;
      cands.push({ s, d });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    if (opts.rng) return cands[Math.floor(opts.rng() * Math.min(3, cands.length))].s;
    return cands[0].s;
  }

  /** Grupo (par) totalmente livre de um tipo: retorna os spots do grupo. */
  findFreeGroup(kind: SpotKind, opts: { rng?: () => number; filter?: (g: readonly SpotDef[]) => boolean } = {}): readonly SpotDef[] | null {
    const groups: (readonly SpotDef[])[] = [];
    const seen = new Set<string>();
    for (const s of this.byKind.get(kind) ?? []) {
      if (!s.group || seen.has(s.group)) continue;
      seen.add(s.group);
      const g = this.group(s.group);
      if (g.length < 2 || !g.every((x) => this.isFree(x.id))) continue;
      if (opts.filter && !opts.filter(g)) continue;
      groups.push(g);
    }
    if (!groups.length) return null;
    return groups[Math.floor((opts.rng ?? Math.random)() * groups.length)];
  }
}
