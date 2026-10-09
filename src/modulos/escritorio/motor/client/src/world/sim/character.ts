// Estado de um personagem: posição, pose, animação, fila de passos e marcadores visuais.
import type { AgentInfo } from '../../../../shared/types';
import type { Appearance, Dir, HeldItem, IconName, Pose } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { FOOT_DX, FOOT_DY, TILE } from '../constants';
import type { Mode } from './behavior';
import type { Gathering } from '../social/gathering';
import type { ShellStage } from './shell';
import type { Step } from './steps';

export class Character {
  readonly id: string;
  info: AgentInfo;
  appearance: Appearance;
  readonly rng: () => number;

  // posição (px de mundo; pés) e tile lógico (sempre caminhável quando parado)
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;
  dir: Dir = 'down';
  pose: Pose = 'stand';
  held: HeldItem = 'none';
  seated = false;
  alpha = 1;
  visible = true;
  /** Profundidade forçada (assentos). null = usa y. */
  sortY: number | null = null;
  /** Tempo (ms) na pose atual, para escolher o frame da animação. */
  animT = 0;

  // comportamento
  mode: Mode = 'idle';
  queue: Step[] = [];
  step: Step | null = null;
  stepT = 0;
  stepStarted = false;
  /** Replanejar assim que o passo atual (não interrompível) terminar. */
  replan = false;
  /** Spot da mesa/banqueta/ponto de trabalho (reservado enquanto o personagem existir). */
  homeSpot: string | null = null;
  /** Spot onde está agora (assento/máquina), além do home. */
  atSpot: string | null = null;
  /** Spots temporários reservados durante um passeio. */
  tempSpots: string[] = [];
  roomId: string;
  leaving = false;
  gone = false;
  arriving = false;
  missingSince: number | null = null;
  /** Próximo passeio do ocioso (ms epoch). */
  nextOutingAt = 0;
  /** Roda de que participa (ou a caminho dela). */
  gathering: Gathering | null = null;
  /** Quem espera um shell: próxima tentativa de entrar numa roda (ms epoch; 0 = agendar). */
  nextSocialAt = 0;
  /** Desenha só depois deste instante (fila no elevador). */
  hiddenUntil = 0;
  /** Escondido (dentro de cabine ou elevador fechado). */
  inside = false;
  /** Próxima vez que o planejador pode rodar (evita replanejar a cada frame sem necessidade). */
  thinkAt = 0;
  /** Subagente já entregou o resultado ao pai. */
  delivered = false;
  /** Fim do uso da cabine (ms epoch). */
  stallUntil = 0;
  /** Origem do encaixe/saída de um assento (interpolação curta). */
  enterFrom: { x: number; y: number } | null = null;
  /** Sala lotada: tile em que trabalha em pé (sem lugar reservado). */
  standTile: { x: number; y: number } | null = null;
  /** Ritmo próprio da caminhada (±8%), para quem sai junto não andar em fila perfeita. */
  readonly speedK: number;
  /** Faixa lateral (px) ao andar: dois personagens no mesmo caminho não se sobrepõem. */
  readonly lane: number;
  /** Deslocamento visual atual (px), suavizado em direção à faixa enquanto anda. */
  offX = 0;
  offY = 0;

  // marcadores
  icon: IconName | null = null;
  iconUntil = 0;
  iconAt = 0;
  bubbleText: string | null = null;
  bubbleIcon = '';
  bubbleAt = 0;
  bubbleUntil = 0;
  /** Mini-balão de conversa (emoji). */
  chatEmoji = '';
  chatUntil = 0;
  /** Fala curta (balãozinho com texto) das rodas: convites, papo, torcida, apostas. */
  sayText = '';
  sayAt = 0;
  sayUntil = 0;
  lastActivityId: string | null = null;
  activityChangedAt = 0;

  // espera de shell (modo 'shell'; regras em sim/shell.ts)
  /** Início (epoch ms) da espera atual: o shell mais antigo. 0 = não está esperando. */
  shellSince = 0;
  /** Quantos shells espera (o "×N" da ampulheta). */
  shellCount = 0;
  shellLabel = '';
  /** Estágio da gag (recalculado a cada frame pela idade da espera). */
  shellStage: ShellStage | null = null;
  /** Quando entrou no modo 'shell' (relógio do mundo): ritmo do balão no modo 'important'. */
  shellEnteredAt = 0;
  /** Texto do balão em cache: refeito só quando o tempo exibido muda (sem string nova por frame). */
  shellText = '';
  shellTextKey = -1;
  /**
   * Reação ao fim de um shell (comemoração/lamento) em andamento até este instante: uma mudança de
   * modo não a interrompe (a fila termina de volta na mesa e o planejador segue o status atual).
   */
  reactUntil = 0;
  /** `at` da última Activity 'ShellDone' já tratada (as anteriores à chegada não comemoram). */
  shellDoneAt = 0;
  /** Render: próxima pipoca que pula do balde (epoch ms). */
  popcornAt = 0;

  constructor(info: AgentInfo, appearance: Appearance) {
    this.id = info.id;
    this.info = info;
    this.appearance = appearance;
    this.roomId = info.roomId;
    this.rng = mulberry32((info.seed ^ 0x9e3779b9) >>> 0);
    // derivados de outro gerador para não alterar a sequência de sorteios do comportamento
    const r = mulberry32((info.seed ^ 0x51ed27a3) >>> 0);
    this.speedK = 0.92 + r() * 0.16;
    this.lane = Math.round((r() * 2 - 1) * 3.5);
  }

  /** Aproxima o deslocamento visual da faixa (andando) ou do centro (parado). */
  updateLane(dt: number): void {
    const walking = this.pose === 'walk' || this.pose === 'run';
    const horiz = this.dir === 'left' || this.dir === 'right';
    const tx = walking && !horiz ? this.lane : 0;
    const ty = walking && horiz ? this.lane * 0.6 : 0;
    const k = Math.min(1, dt * 5);
    this.offX += (tx - this.offX) * k;
    this.offY += (ty - this.offY) * k;
    if (Math.abs(this.offX) < 0.05) this.offX = 0;
    if (Math.abs(this.offY) < 0.05) this.offY = 0;
  }

  /** Coloca os pés no ponto padrão de um tile. */
  placeAtTile(tx: number, ty: number): void {
    this.tx = tx;
    this.ty = ty;
    this.x = tx * TILE + FOOT_DX;
    this.y = ty * TILE + FOOT_DY;
  }

  setPose(pose: Pose, held: HeldItem = 'none'): void {
    if (this.pose !== pose) {
      this.pose = pose;
      this.animT = 0;
    }
    this.held = held;
  }

  setIcon(icon: IconName | null, ms: number, now: number): void {
    this.icon = icon;
    this.iconAt = now;
    this.iconUntil = icon ? now + ms : 0;
  }

  showBubble(icon: string, text: string, ms: number, now: number): void {
    this.bubbleIcon = icon;
    this.bubbleText = text;
    this.bubbleAt = now;
    this.bubbleUntil = now + ms;
  }

  depth(): number {
    return this.sortY ?? this.y;
  }
}

/** Direção dominante de um deslocamento. */
export function dirOf(dx: number, dy: number, fallback: Dir): Dir {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Direção de A olhando para B. */
export function facing(ax: number, ay: number, bx: number, by: number): Dir {
  return dirOf(bx - ax, by - ay, 'down');
}
