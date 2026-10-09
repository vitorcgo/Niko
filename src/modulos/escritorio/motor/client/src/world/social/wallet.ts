// Carteiras dos personagens (moedinhas fictícias 🪙). Quem chega ao escritório já entra com um
// saldo; ganha mais a cada tarefa concluída e perde ou ganha nas apostas com os colegas.
//
// Fica no navegador (localStorage), por agente: cada navegador tem a sua economia (as apostas são
// sorteadas na simulação local). Sem localStorage (testes, aba anônima bloqueada), só em memória.

/** Saldo de quem chega ao escritório. */
export const START_COINS: Readonly<Record<'main' | 'sub', number>> = { main: 100, sub: 30 };
/** Item da lista de tarefas concluído. */
export const TASK_REWARD = 10;
/** Subagente entregou o resultado ao agente que o chamou (a tarefa dele). */
export const DELIVERY_REWARD = 15;
/** Pedido do usuário atendido (fim de turno). */
export const TURN_REWARD = 5;

const STORAGE_KEY = 'niko.escritorio.carteiras.v1';
const LEDGER_MAX = 12;
const PAID_MAX = 300;
/** Carteiras de agentes que não aparecem há mais que isso são esquecidas. */
const FORGET_MS = 3 * 24 * 3_600_000;
const MAX_WALLETS = 400;

export interface LedgerEntry {
  at: number;
  delta: number;
  icon: string;
  text: string;
}

export interface WalletEntry {
  name: string;
  coins: number;
  /** Total ganho trabalhando (saldo inicial, tarefas, entregas, pedidos). */
  earned: number;
  wins: number;
  losses: number;
  /** Retrospecto por adversário (id): [vitórias, derrotas]. */
  vs: Record<string, [number, number]>;
  /** Tarefas já pagas ("id|título"). */
  paid: string[];
  /** Extrato: movimentações mais recentes primeiro. */
  ledger: LedgerEntry[];
  createdAt: number;
  seenAt: number;
}

/** O mínimo de AgentInfo que a carteira usa. */
export interface WalletAgent {
  id: string;
  name: string;
  kind: 'main' | 'sub';
  tasks: readonly { id: string; title: string; status: string }[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage, se existir e funcionar (aba anônima/bloqueada lança ao acessar). */
export function browserStorage(): StorageLike | null {
  try {
    const s = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!s) return null;
    s.getItem(STORAGE_KEY);
    return s;
  } catch {
    return null;
  }
}

function taskKey(t: { id: string; title: string }): string {
  return `${t.id}|${t.title}`;
}

export class Wallets {
  private map = new Map<string, WalletEntry>();
  private dirty = false;

  constructor(private readonly storage: StorageLike | null) {
    this.load();
  }

  get(id: string): WalletEntry | undefined {
    return this.map.get(id);
  }

  coins(id: string): number {
    return this.map.get(id)?.coins ?? 0;
  }

  /**
   * Garante a carteira do agente. Na primeira vez: saldo inicial e as tarefas que já estavam
   * concluídas pagas em silêncio (quem já trabalhou antes de a página abrir não perde o que fez).
   */
  ensure(a: WalletAgent, now: number): { entry: WalletEntry; created: boolean } {
    let w = this.map.get(a.id);
    if (w) {
      if (w.name !== a.name) w.name = a.name;
      if (now - w.seenAt > 60_000) {
        w.seenAt = now;
        this.dirty = true;
      }
      return { entry: w, created: false };
    }
    const start = START_COINS[a.kind] ?? START_COINS.main;
    w = { name: a.name, coins: start, earned: start, wins: 0, losses: 0, vs: {}, paid: [], ledger: [], createdAt: now, seenAt: now };
    this.map.set(a.id, w);
    this.log(w, { at: now, delta: start, icon: '🏢', text: 'Chegou ao escritório' });
    const done = a.tasks.filter((t) => t.status === 'completed');
    if (done.length) {
      for (const t of done) w.paid.push(taskKey(t));
      const v = done.length * TASK_REWARD;
      w.coins += v;
      w.earned += v;
      this.log(w, { at: now, delta: v, icon: '✅', text: done.length === 1 ? '1 tarefa já concluída' : `${done.length} tarefas já concluídas` });
    }
    this.dirty = true;
    return { entry: w, created: true };
  }

  /** Paga as tarefas concluídas que ainda não foram pagas. Retorna quanto pagou agora. */
  payTasks(a: WalletAgent, now: number): number {
    const w = this.map.get(a.id);
    if (!w) return 0;
    let total = 0;
    for (const t of a.tasks) {
      if (t.status !== 'completed') continue;
      const k = taskKey(t);
      if (w.paid.includes(k)) continue;
      w.paid.push(k);
      if (w.paid.length > PAID_MAX) w.paid.splice(0, w.paid.length - PAID_MAX);
      w.coins += TASK_REWARD;
      w.earned += TASK_REWARD;
      total += TASK_REWARD;
      this.log(w, { at: now, delta: TASK_REWARD, icon: '✅', text: `Tarefa concluída: ${t.title}` });
    }
    if (total) this.dirty = true;
    return total;
  }

  /** Crédito por trabalho (pedido atendido, entrega de subagente). */
  credit(id: string, amount: number, icon: string, text: string, now: number): number {
    const w = this.map.get(id);
    if (!w || amount <= 0) return 0;
    w.coins += amount;
    w.earned += amount;
    this.log(w, { at: now, delta: amount, icon, text });
    this.dirty = true;
    return amount;
  }

  /**
   * Aposta paga: tira até `amount` de quem perdeu (nunca deixa negativo) e dá a quem ganhou.
   * Retorna o valor que de fato mudou de mãos.
   */
  transfer(fromId: string, toId: string, amount: number, icon: string, what: string, now: number): number {
    const from = this.map.get(fromId);
    const to = this.map.get(toId);
    if (!from || !to || fromId === toId) return 0;
    const v = Math.max(0, Math.min(Math.floor(amount), from.coins));
    if (!v) return 0;
    from.coins -= v;
    to.coins += v;
    this.log(from, { at: now, delta: -v, icon, text: `Perdeu ${what} para ${to.name}` });
    this.log(to, { at: now, delta: v, icon, text: `Ganhou ${what} de ${from.name}` });
    this.dirty = true;
    return v;
  }

  /** Placar de uma partida/aposta (vale também sem dinheiro em jogo). */
  recordMatch(winnerId: string, loserId: string): void {
    const w = this.map.get(winnerId);
    const l = this.map.get(loserId);
    if (!w || !l) return;
    w.wins++;
    l.losses++;
    (w.vs[loserId] ??= [0, 0])[0]++;
    (l.vs[winnerId] ??= [0, 0])[1]++;
    this.dirty = true;
  }

  /** Grava no navegador se algo mudou (chamado com baixa frequência). */
  save(now: number): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.prune(now);
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, wallets: Object.fromEntries(this.map) }));
    } catch {
      // cota cheia/bloqueado: segue só em memória
    }
  }

  /** Esquece carteiras de quem não aparece há dias (e limita o total). */
  prune(now: number): void {
    for (const [id, w] of this.map) if (now - w.seenAt > FORGET_MS) this.map.delete(id);
    if (this.map.size <= MAX_WALLETS) return;
    const old = [...this.map.entries()].sort((a, b) => a[1].seenAt - b[1].seenAt);
    for (const [id] of old.slice(0, this.map.size - MAX_WALLETS)) this.map.delete(id);
  }

  private log(w: WalletEntry, e: LedgerEntry): void {
    w.ledger.unshift(e);
    if (w.ledger.length > LEDGER_MAX) w.ledger.length = LEDGER_MAX;
  }

  private load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as { v?: number; wallets?: Record<string, Partial<WalletEntry>> };
      for (const [id, w] of Object.entries(j.wallets ?? {})) {
        if (!w || typeof w.coins !== 'number' || !Number.isFinite(w.coins)) continue;
        this.map.set(id, {
          name: typeof w.name === 'string' ? w.name : id,
          coins: Math.max(0, Math.floor(w.coins)),
          earned: typeof w.earned === 'number' ? w.earned : w.coins,
          wins: typeof w.wins === 'number' ? w.wins : 0,
          losses: typeof w.losses === 'number' ? w.losses : 0,
          vs: w.vs && typeof w.vs === 'object' ? w.vs : {},
          paid: Array.isArray(w.paid) ? w.paid.filter((p): p is string => typeof p === 'string') : [],
          ledger: Array.isArray(w.ledger) ? w.ledger.slice(0, LEDGER_MAX) : [],
          createdAt: typeof w.createdAt === 'number' ? w.createdAt : 0,
          seenAt: typeof w.seenAt === 'number' ? w.seenAt : 0,
        });
      }
    } catch {
      // ilegível: começa do zero
    }
  }
}
