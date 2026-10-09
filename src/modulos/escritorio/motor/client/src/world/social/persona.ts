// Personalidades dos personagens — funções PURAS e determinísticas (mesma semente = mesma pessoa em
// qualquer navegador). Cada agente tem 2 ou 3 traços, que mudam o que prefere fazer quando está à toa,
// com quem anda e o que fala; pares de agentes podem ter amizade ou rivalidade.
//
// Os rótulos são substantivos ("Competição", "Vaidade"): não dependem do gênero de ninguém.
import { mulberry32 } from '../../../../shared/hash';
import { IDLE_WEIGHTS, type IdleActivity } from '../sim/behavior';

export type TraitId =
  | 'competicao'
  | 'apostas'
  | 'games'
  | 'series'
  | 'fofoca'
  | 'vaidade'
  | 'cafeina'
  | 'piadas'
  | 'esporte'
  | 'timidez'
  | 'economia'
  | 'sonecas'
  | 'calma'
  | 'leitura';

export interface Trait {
  id: TraitId;
  emoji: string;
  label: string;
  /** Uma frase explicando o efeito no escritório (dica na interface). */
  desc: string;
}

export const TRAITS: Readonly<Record<TraitId, Trait>> = {
  competicao: { id: 'competicao', emoji: '🏆', label: 'Competição', desc: 'Adora competir: desafia os colegas no ping-pong, no videogame e no jokenpô.' },
  apostas: { id: 'apostas', emoji: '🎲', label: 'Apostas', desc: 'Topa qualquer aposta e aposta alto no jokenpô.' },
  games: { id: 'games', emoji: '🎮', label: 'Games', desc: 'Vive no videogame do lounge e nos fliperamas — e costuma ganhar.' },
  series: { id: 'series', emoji: '📺', label: 'Séries e TV', desc: 'Não perde um programa na TV do lounge (de preferência com pipoca).' },
  fofoca: { id: 'fofoca', emoji: '🗣️', label: 'Fofoca', desc: 'Puxa papo na copa e sabe de tudo o que acontece nas salas.' },
  vaidade: { id: 'vaidade', emoji: '💄', label: 'Vaidade', desc: 'Passa no espelho do banheiro para se arrumar sempre que pode.' },
  cafeina: { id: 'cafeina', emoji: '☕', label: 'Cafeína', desc: 'Movido a café: a cafeteira da copa é a segunda casa.' },
  piadas: { id: 'piadas', emoji: '😂', label: 'Piadas', desc: 'Conta piada em toda conversa e faz a roda rir.' },
  esporte: { id: 'esporte', emoji: '🏓', label: 'Esporte', desc: 'Joga ping-pong, se alonga e vibra com o futebol na TV.' },
  timidez: { id: 'timidez', emoji: '🙈', label: 'Timidez', desc: 'Prefere ficar na sua: lê, olha a janela e entra menos nas rodas.' },
  economia: { id: 'economia', emoji: '💰', label: 'Economia', desc: 'Pão-duro: aposta pouco e às vezes foge da aposta.' },
  sonecas: { id: 'sonecas', emoji: '😴', label: 'Sonecas', desc: 'Qualquer sofá ou puff vira cama.' },
  calma: { id: 'calma', emoji: '🧘', label: 'Calma', desc: 'Zen: alongamentos, janela e conversas tranquilas.' },
  leitura: { id: 'leitura', emoji: '📚', label: 'Leitura', desc: 'Sempre com um livro da estante (ou o celular) na mão.' },
};

/** Ordem fixa (o sorteio depende dela: não reordene). */
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** Pares que não combinam na mesma pessoa. */
const CLASHES: readonly (readonly [TraitId, TraitId])[] = [
  ['timidez', 'piadas'],
  ['timidez', 'fofoca'],
  ['apostas', 'economia'],
  ['esporte', 'sonecas'],
  ['calma', 'competicao'],
];

function clashes(a: TraitId, b: TraitId): boolean {
  return CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Bordões: cada um tem o seu (aparece de vez em quando nas falas). */
export const CATCHPHRASES = [
  'Bora!',
  'Partiu!',
  'Tá pago!',
  'É hoje!',
  'Simbora!',
  'Bora codar!',
  'Deu bom!',
  'Que isso!',
  'Show de bola!',
  'Tamo junto!',
  'Sem estresse.',
  'Vai dar certo!',
] as const;

export interface Persona {
  traits: TraitId[];
  /** 0..1: vontade de entrar em rodas (timidez puxa para baixo; fofoca e piadas para cima). */
  sociability: number;
  /** 0..1: sorte/habilidade em jogos (games e esporte puxam para cima). */
  skill: number;
  catchphrase: string;
}

/** Mistura de 32 bits (sementes próximas viram sequências bem diferentes). */
function mix(seed: number): number {
  let h = (seed ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

const cache = new Map<number, Persona>();

/** Personalidade do agente com esta semente (2 ou 3 traços sem conflito). */
export function personaFor(seed: number): Persona {
  const hit = cache.get(seed);
  if (hit) return hit;
  const rng = mulberry32(mix(seed));
  const n = rng() < 0.55 ? 2 : 3;
  const traits: TraitId[] = [];
  for (let guard = 0; traits.length < n && guard < 40; guard++) {
    const t = TRAIT_IDS[Math.floor(rng() * TRAIT_IDS.length) % TRAIT_IDS.length];
    if (traits.includes(t) || traits.some((o) => clashes(o, t))) continue;
    traits.push(t);
  }
  let sociability = 0.45 + rng() * 0.3;
  if (traits.includes('timidez')) sociability -= 0.3;
  if (traits.includes('fofoca')) sociability += 0.2;
  if (traits.includes('piadas')) sociability += 0.12;
  let skill = 0.3 + rng() * 0.4;
  if (traits.includes('games')) skill += 0.2;
  if (traits.includes('esporte')) skill += 0.15;
  if (traits.includes('sonecas')) skill -= 0.1;
  const catchphrase = CATCHPHRASES[Math.floor(rng() * CATCHPHRASES.length) % CATCHPHRASES.length];
  const p: Persona = { traits, sociability: clamp01(sociability), skill: clamp01(skill), catchphrase };
  if (cache.size > 500) cache.clear();
  cache.set(seed, p);
  return p;
}

function clamp01(v: number): number {
  return Math.max(0.05, Math.min(0.95, v));
}

export function hasTrait(p: Persona, t: TraitId): boolean {
  return p.traits.includes(t);
}

export type Bond = 'amizade' | 'rivalidade';

/**
 * Vínculo entre dois agentes (simétrico): ~22% amizade, ~12% rivalidade, o resto só colegas.
 * Competição dos dois lados puxa para rivalidade; fofoca/piadas para amizade.
 */
export function bondBetween(seedA: number, seedB: number): Bond | null {
  if (seedA === seedB) return null;
  const lo = Math.min(seedA >>> 0, seedB >>> 0);
  const hi = Math.max(seedA >>> 0, seedB >>> 0);
  const r = mulberry32(mix(lo ^ Math.imul(hi, 0x9e3779b1)))();
  const a = personaFor(seedA);
  const b = personaFor(seedB);
  const rivalry = 0.12 + (hasTrait(a, 'competicao') && hasTrait(b, 'competicao') ? 0.18 : 0);
  const friendship = 0.22 + ([a, b].some((p) => hasTrait(p, 'fofoca') || hasTrait(p, 'piadas')) ? 0.08 : 0);
  if (r < rivalry) return 'rivalidade';
  if (r < rivalry + friendship) return 'amizade';
  return null;
}

/** Quanto cada traço multiplica a vontade de cada passeio sozinho. */
const SOLO_K: Partial<Record<TraitId, Partial<Record<IdleActivity, number>>>> = {
  cafeina: { coffee: 3 },
  vaidade: { mirror: 5, bathroom: 1.3 },
  leitura: { shelf: 3, phone: 1.6, window: 1.2 },
  sonecas: { lounge: 2.5 },
  esporte: { stretch: 2.5, water: 1.5 },
  calma: { window: 2.5, stretch: 1.5 },
  games: { arcade: 3, phone: 1.4 },
  timidez: { window: 1.5, shelf: 1.5, phone: 1.5 },
  fofoca: { coffee: 1.4, phone: 1.4 },
  series: { phone: 1.5, lounge: 1.3 },
  economia: { snack: 0.4, water: 1.6 },
};

/** Pesos dos passeios sozinho para esta personalidade. */
export function soloWeights(p: Persona): Record<IdleActivity, number> {
  const out = { ...IDLE_WEIGHTS };
  for (const t of p.traits) for (const [k, v] of Object.entries(SOLO_K[t] ?? {})) out[k as IdleActivity] *= v as number;
  return out;
}
