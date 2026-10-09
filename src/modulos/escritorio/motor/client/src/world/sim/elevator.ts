// Elevadores da recepção: portas animadas (estados 0..4) que abrem enquanto alguém entra/sai.

/** Velocidade da porta: estados por segundo (0 -> 4 em ~0,45 s). */
const DOOR_SPEED = 9;
/** Tempo que a porta fica aberta depois do último uso. */
const HOLD_MS = 650;
/** Intervalo entre pessoas saindo do mesmo elevador. */
export const ELEVATOR_STAGGER_MS = 520;

export class Elevator {
  /** Abertura contínua da porta, 0 (fechada) .. 4 (aberta). */
  door = 0;
  private holdUntil = 0;
  private users = new Set<string>();
  /** Próximo instante livre para alguém surgir (fila de chegada). */
  nextAppearAt = 0;

  constructor(
    readonly index: number,
    readonly spotId: string,
  ) {}

  request(id: string): void {
    this.users.add(id);
  }

  release(id: string, now: number): void {
    if (this.users.delete(id)) this.holdUntil = Math.max(this.holdUntil, now + HOLD_MS);
  }

  get load(): number {
    return this.users.size;
  }

  get isOpen(): boolean {
    return this.door >= 3.95;
  }

  get state(): number {
    return Math.max(0, Math.min(4, Math.round(this.door)));
  }

  update(dt: number, now: number): void {
    const want = this.users.size > 0 || now < this.holdUntil;
    this.door = Math.max(0, Math.min(4, this.door + (want ? 1 : -1) * DOOR_SPEED * dt));
  }

  /** Reserva um horário para surgir dentro do elevador (escalonando chegadas simultâneas). */
  reserveAppear(now: number): number {
    const at = Math.max(now, this.nextAppearAt);
    this.nextAppearAt = at + ELEVATOR_STAGGER_MS;
    return at;
  }

  reset(): void {
    this.users.clear();
    this.door = 0;
    this.holdUntil = 0;
    this.nextAppearAt = 0;
  }
}
