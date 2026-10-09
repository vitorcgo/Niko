// "Esperando o shell terminar" — regras PURAS (testáveis sem DOM) da gag do escritório.
//
// Escalada cômica pela idade do shell mais antigo que o agente espera:
// - 0–3 min   ('popcorn'):  recostado com o balde de pipoca, assistindo o terminal como um filme;
// - 3–10 min  ('restless'): a pipoca acabou; braços cruzados e, de vez em quando, um giro na cadeira;
// - 10–25 min ('cobweb'):   teia de aranha no canto (cresce para 2x depois de 20 min) e bocejos;
// - > 25 min  ('nap'):      cochila na mesa, coberto de teia.
// Sempre: ampulheta virando acima da cabeça, monitor em 'progress' e balão "⏳ <rótulo> · <tempo>".
import type { Activity, AgentStatus, ShellJob } from '../../../../shared/types';
import type { Dir, IconName } from '../../art/api';

export type ShellStage = 'popcorn' | 'restless' | 'cobweb' | 'nap';

/** Ferramenta da Activity que o servidor registra quando um shell termina (contrato combinado). */
export const SHELL_DONE_TOOL = 'ShellDone';

/** Limiares (ms de espera) da escalada. */
export const SHELL_RESTLESS_MS = 3 * 60_000;
export const SHELL_COBWEB_MS = 10 * 60_000;
export const SHELL_COBWEB_BIG_MS = 20 * 60_000;
export const SHELL_NAP_MS = 25 * 60_000;

/**
 * Comando em PRIMEIRO plano: só vira "espera" depois disto. Comandos rápidos (ls, git status...)
 * não tiram o personagem da digitação.
 */
export const FOREGROUND_WAIT_MS = 10_000;

/** Giro completo na cadeira: duração e intervalo entre giros (estágio 'restless'). */
export const SPIN_MS = 800;
export const SPIN_GAP_MIN_MS = 15_000;
export const SPIN_GAP_MAX_MS = 25_000;
/** Primeiro giro logo depois que a pipoca acaba (não espera um intervalo inteiro). */
const SPIN_FIRST_MS = 2_500;

/** Bocejo (estágio 'cobweb'): duração e intervalo. */
export const YAWN_MS = 1_300;
export const YAWN_GAP_MIN_MS = 18_000;
export const YAWN_GAP_MAX_MS = 32_000;
const YAWN_FIRST_MS = 4_000;

/** A nuvenzinha de chuva ('storm') fica um pouco mais alta que os outros ícones: os pingos caem até a cabeça. */
export const STORM_LIFT = 3;

/** A ampulheta vira a cada isto (alterna 'hourglass' / 'hourglass_flip'). */
export const HOURGLASS_FLIP_MS = 1_200;

/** Balão no modo 'important': ao entrar no estado, depois por 4 s a cada ~30 s. */
export const SHELL_BUBBLE_ENTER_MS = 6_000;
export const SHELL_BUBBLE_EVERY_MS = 30_000;
export const SHELL_BUBBLE_SHOW_MS = 4_000;
const BUBBLE_FADE_IN_MS = 150;
const BUBBLE_FADE_OUT_MS = 400;

/** Estágio da gag pela idade (ms) da espera. */
export function shellStage(ageMs: number): ShellStage {
  if (ageMs >= SHELL_NAP_MS) return 'nap';
  if (ageMs >= SHELL_COBWEB_MS) return 'cobweb';
  if (ageMs >= SHELL_RESTLESS_MS) return 'restless';
  return 'popcorn';
}

/** Escala inteira da teia de aranha: 0 = sem teia, 1x depois de 10 min, 2x depois de 20 min. */
export function cobwebScale(ageMs: number): 0 | 1 | 2 {
  if (ageMs < SHELL_COBWEB_MS) return 0;
  return ageMs >= SHELL_COBWEB_BIG_MS ? 2 : 1;
}

/** Quadro da ampulheta animada. */
export function hourglassIcon(now: number): IconName {
  return Math.floor(now / HOURGLASS_FLIP_MS) % 2 ? 'hourglass_flip' : 'hourglass';
}

// ------------------------------------------------------------------ shells do agente

/** Entra na conta? Em primeiro plano, só os comandos sem resultado (background === false). */
function counts(j: ShellJob, foregroundOnly: boolean): boolean {
  return !foregroundOnly || j.background === false;
}

/** O shell mais antigo considerado (sem alocar). `foregroundOnly`: só os de primeiro plano. */
export function oldestShell(shells: readonly ShellJob[] | undefined, foregroundOnly: boolean): ShellJob | null {
  if (!shells) return null;
  let best: ShellJob | null = null;
  for (const j of shells) {
    if (!counts(j, foregroundOnly) || !Number.isFinite(j.startedAt)) continue;
    if (!best || j.startedAt < best.startedAt) best = j;
  }
  return best;
}

/** Quantos shells o agente espera (mesmo critério de `oldestShell`). */
export function countShells(shells: readonly ShellJob[] | undefined, foregroundOnly: boolean): number {
  if (!shells) return 0;
  let n = 0;
  for (const j of shells) if (counts(j, foregroundOnly)) n++;
  return n;
}

/**
 * Esperando um comando em primeiro plano há mais de FOREGROUND_WAIT_MS? (status 'working' com um
 * Bash longo ainda sem resultado: o agente está parado olhando o comando rodar.)
 */
export function foregroundWaiting(shells: readonly ShellJob[] | undefined, now: number): boolean {
  const j = oldestShell(shells, true);
  return !!j && now - j.startedAt > FOREGROUND_WAIT_MS;
}

/**
 * Início (epoch ms) da espera de um agente no modo 'shell': o shell mais antigo (em primeiro plano,
 * quando o status é 'working'); sem nenhum listado, o momento em que o status mudou.
 */
export function shellWaitSince(a: { status: AgentStatus; shells?: ShellJob[]; statusSince: number }): number {
  const j = oldestShell(a.shells, a.status !== 'shell');
  return j ? j.startedAt : a.statusSince;
}

/** Rótulo do balão: o do shell mais antigo ou um texto genérico. */
export function shellLabel(a: { status: AgentStatus; shells?: ShellJob[] }): string {
  const fg = a.status !== 'shell';
  const j = oldestShell(a.shells, fg);
  const label = j?.label?.trim();
  if (label) return label;
  if (j?.kind === 'monitor') return 'Monitorando um processo';
  return fg ? 'Comando no terminal' : 'Comando em segundo plano';
}

/**
 * A Activity 'ShellDone' mais recente do agente (a atual ou nas recentes — outra atividade pode ter
 * chegado no mesmo snapshot), ou null. Sem alocação.
 */
export function latestShellDone(a: { activity?: Activity; recent?: readonly Activity[] }): Activity | null {
  let best: Activity | null = a.activity?.tool === SHELL_DONE_TOOL ? a.activity : null;
  const recent = a.recent;
  if (recent) {
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i];
      if (r.tool === SHELL_DONE_TOOL && (!best || r.at > best.at)) best = r;
    }
  }
  return best;
}

// ------------------------------------------------------------------ tempo e balão

/** Tempo de espera em PT-BR: "45 s", "3 min", "1 h 05". */
export function formatShellAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h} h ${mm < 10 ? '0' : ''}${mm}`;
}

/**
 * Chave que muda exatamente quando o texto de `formatShellAge` muda (o balão só refaz a string
 * quando precisa — segundos no primeiro minuto, depois minutos).
 */
export function shellAgeKey(ms: number): number {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? s : 60 + Math.floor(s / 60);
}

/** Texto do balão (o ⏳ é o ícone do balão). */
export function shellBubbleText(label: string, ageMs: number): string {
  return `${label} · ${formatShellAge(ageMs)}`;
}

/**
 * Opacidade (0..1) do balão de espera no modo 'important', `ms` depois de entrar no estado:
 * visível nos primeiros SHELL_BUBBLE_ENTER_MS; depois por SHELL_BUBBLE_SHOW_MS a cada
 * SHELL_BUBBLE_EVERY_MS (deslocado por `offsetMs`, para os balões de vários personagens não piscarem juntos).
 */
export function shellBubbleAlpha(ms: number, offsetMs = 0): number {
  if (ms < 0) return 0;
  if (ms < SHELL_BUBBLE_ENTER_MS) return windowAlpha(ms, SHELL_BUBBLE_ENTER_MS);
  const off = ((offsetMs % SHELL_BUBBLE_EVERY_MS) + SHELL_BUBBLE_EVERY_MS) % SHELL_BUBBLE_EVERY_MS;
  // primeira repetição ~30 s depois de entrar
  const t = ms - SHELL_BUBBLE_EVERY_MS - off;
  if (t < 0) return 0;
  const inCycle = t % SHELL_BUBBLE_EVERY_MS;
  return inCycle < SHELL_BUBBLE_SHOW_MS ? windowAlpha(inCycle, SHELL_BUBBLE_SHOW_MS) : 0;
}

function windowAlpha(t: number, len: number): number {
  return Math.max(0, Math.min(1, t / BUBBLE_FADE_IN_MS, (len - t) / BUBBLE_FADE_OUT_MS));
}

// ------------------------------------------------------------------ giros e bocejos

/** Número pseudoaleatório em [0, 1) determinístico por (semente, índice, sal). */
export function unitHash(seed: number, k: number, salt: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca77)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Fase (0..1) de um evento periódico em `ageMs`, ou -1 fora dele. Eventos de `durMs` começam em
 * `fromMs + firstMs` e se repetem com intervalos sorteados (por semente) em [gapMin, gapMax],
 * só enquanto `ageMs < toMs`. Sem alocação (laço curto: dezenas de iterações no pior caso).
 */
export function periodicPhase(ageMs: number, fromMs: number, toMs: number, firstMs: number, gapMin: number, gapMax: number, durMs: number, seed: number, salt: number): number {
  if (ageMs < fromMs || ageMs >= toMs) return -1;
  let t = fromMs + firstMs;
  for (let k = 0; t <= ageMs && k < 10_000; k++) {
    if (ageMs < t + durMs) return (ageMs - t) / durMs;
    t += gapMin + unitHash(seed, k, salt) * (gapMax - gapMin);
  }
  return -1;
}

/** Fase (0..1) do giro na cadeira, ou -1. Giros a cada 15–25 s no estágio 'restless'. */
export function spinPhase(ageMs: number, seed: number): number {
  return periodicPhase(ageMs, SHELL_RESTLESS_MS, SHELL_COBWEB_MS, SPIN_FIRST_MS, SPIN_GAP_MIN_MS, SPIN_GAP_MAX_MS, SPIN_MS, seed, 1);
}

/** Fase (0..1) de um bocejo, ou -1. De vez em quando no estágio 'cobweb'. */
export function yawnPhase(ageMs: number, seed: number): number {
  return periodicPhase(ageMs, SHELL_COBWEB_MS, SHELL_NAP_MS, YAWN_FIRST_MS, YAWN_GAP_MIN_MS, YAWN_GAP_MAX_MS, YAWN_MS, seed, 2);
}

/** Sentido horário visto de cima: norte -> leste -> sul -> oeste. */
const CLOCKWISE: readonly Dir[] = ['up', 'right', 'down', 'left'];

/**
 * Direção durante o giro (fase 0..1): uma volta completa no sentido horário, um quarto por vez,
 * terminando de volta em `base`.
 */
export function spinDir(phase: number, base: Dir): Dir {
  if (phase < 0) return base;
  const i = CLOCKWISE.indexOf(base);
  const q = Math.min(3, Math.floor(phase * 4));
  return CLOCKWISE[(i + q + 1) % 4];
}
