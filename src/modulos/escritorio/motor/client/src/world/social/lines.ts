// Falas curtas dos personagens (balõezinhos) — puro. `{nome}` = um colega, `{sala}` = um projeto,
// `{v}` = valor da aposta, `{a}`/`{b}` = placar. Nada aqui depende do gênero de quem fala.
import type { TraitId } from './persona';

export type Pool = readonly string[];

export const INVITE = {
  tv: ['Bora ver TV? 📺', 'Sessão pipoca? 🍿', 'Vai começar o programa!', 'Bora ver um pouco de TV?'],
  futebol: ['Vai começar o jogo! ⚽', 'Bora ver o futebol?', 'Tá passando o clássico! ⚽'],
  novela: ['Tá passando a novela! 📺', 'Bora ver o capítulo de hoje?'],
  desenho: ['Tá passando desenho! 😄', 'Bora ver desenho?'],
  videogame: ['Bora uma partida no videogame? 🎮', 'Duvido você me ganhar 🎮', 'Videogame? Melhor de três!'],
  arcade: ['Fliperama? 👾', 'Aposto que bato teu recorde 👾', 'Bora no fliperama?'],
  pingpong: ['Pingue-pongue? 🏓', 'Bora uma partidinha? 🏓', 'Vem jogar ping-pong!'],
  pingpongRival: ['Vem tomar uma surra no ping-pong 😏', 'Revanche no ping-pong? 🏓'],
  kitchen: ['Bora tomar um café? ☕', 'Pausa pro café? ☕', 'Bora dar uma pausa na copa?'],
  kitchenGossip: ['Tenho uma fofoca… 👀', 'Copa. Agora. Tenho novidade 👀'],
  talk: ['E aí, tudo certo?', 'Ei, {nome}!', 'Bora trocar uma ideia?', 'Opa, {nome}! Beleza?'],
  rps: ['Jokenpô valendo 🪙{v}?', 'Aposto 🪙{v} no jokenpô!', 'Pedra, papel e tesoura? 🪙{v}!'],
  rpsHonor: ['Jokenpô? Só pela honra 😅', 'Jokenpô valendo nada?'],
  mirror: ['Bora dar um tapa no visual? 💄', 'Espelho? Preciso me arrumar ✨'],
} satisfies Record<string, Pool>;

export const ACCEPT: Pool = ['Bora!', 'Partiu!', 'Fechado! 🤝', 'Só se for agora!', 'Opa!', 'Já é!', 'Demorou!'];
export const ACCEPT_BET: Pool = ['Fechado! 🤝', 'Prepara o bolso 💰', 'Vai perder!', 'Aceito!'];
export const ACCEPT_BROKE: Pool = ['Tô liso 😅 Só pela honra!', 'Sem 🪙… valendo nada?'];
export const ACCEPT_SLEEPY: Pool = ['Hã? Ah… bora 😴', 'Acordei! Bora.', 'Cinco minutinhos… tá, bora.'];
export const ACCEPT_SHELL: Pool = ['Enquanto o build roda… bora! ⏳', 'Meu comando tá rodando, dá tempo ⏳', 'Tô esperando o terminal mesmo…'];
export const ACCEPT_STINGY: Pool = ['Aposta? Só um pouquinho 💰', 'Valendo pouco, hein'];

export const TV = {
  futebol: {
    goal: ['GOOOL! ⚽', 'É GOL!!', 'GOLAÇO! ⚽', 'Que golaço!'],
    miss: ['Uuuuh! 😱', 'Na trave!', 'Quase!', 'Perdeu essa?!'],
    against: ['Ah não! Gol deles 😩', 'Que fase…', 'Acorda, zaga!', 'Não acredito…'],
    talk: ['Juiz ladrão! 😤', 'Que jogada!', 'Esse goleiro é bom demais', 'Bora, time!', 'Isso foi pênalti!', 'Tá jogando muito!'],
  },
  novela: {
    twist: ['Não acredito! 😱', 'Eu sabia!', 'Que reviravolta!', 'Mentira!!'],
    love: ['Esse casal! 😍', 'Finalmente! 😍', 'Que romance…'],
    talk: ['Shhh, vai começar!', 'Chora não… 😭', 'Esse vilão não presta', 'Amanhã é o último capítulo!'],
  },
  desenho: {
    funny: ['KKKKK 😂', 'Hahaha!', 'Muito bom 😂', 'Esse desenho é demais!'],
    talk: ['Eu assistia isso criança!', 'Clássico!', 'Olha a cara dele 😂'],
  },
  end: ['Bom demais!', 'Amanhã tem mais 📺', 'Que episódio!', 'Valeu a pausa!'],
} as const;

export const GAME = {
  trash: ['Vou te passar! 🏎️', 'Que lag é esse?!', 'Combo! 💥', 'Não vale!', 'Tá fácil 😎', 'Só aquecendo…', 'Ninguém me para!', 'Olha essa!'],
  round: ['Ganhei essa! 🏆', 'Uma a zero!', 'Toma!'],
  cheer: ['Vai, {nome}!', 'Uooou!', 'Que jogada!', 'Aperta o botão!'],
};

export const PINGPONG = {
  point: ['Ponto! 🏓', 'Toma!', 'Na quina!', 'Corta!', 'Defende essa!'],
  cheer: ['Boa!', 'Vai, {nome}!', 'Uooou!', 'Que ralo!'],
  final: ['{a} a {b}! 🏆', 'Ganhei de {a} a {b}! 🏆'],
};

export const RPS = {
  count: ['Jo…', 'Ken…', 'Pô!'],
  tie: ['Empate! De novo!', 'Pensamos igual 😂', 'De novo!'],
  win: ['Ganhei! 💰', 'Hoje é meu dia!', 'Passa o 🪙!', 'Mole demais 😎', 'Sabia!'],
  winHonor: ['Ganhei! 😎', 'Sabia!', 'Hoje é meu dia!'],
  lose: ['Não valeu!', 'Sorte sua…', 'Meu dinheiro… 😭', 'Tá, tá…', 'Era pra ser pedra!'],
  rematch: ['Revanche!', 'Melhor de três!', 'De novo, valendo!'],
  stalemate: ['Deixa quieto 😅', 'Empatamos, então.'],
  watch: ['KKKKK', 'Uou!', 'Eita!', 'Paga!'],
};

export const MIRROR = {
  solo: ['Arrasei ✨', 'Hoje eu tô on 😎', 'Cabelo no lugar ✅', 'Look aprovado ✨', 'Esse cabelo não colabora…', 'Pronto pra próxima reunião ✨'],
  lipstick: ['Batom perfeito 💄', 'Agora sim 💋'],
  duo: ['Empresta o pente?', 'Ficou ótimo!', 'Que tal?', 'Tá arrasando!'],
};

export const CHAT = {
  fofoca: ['Viram o commit de {nome}? 👀', 'Dizem que {sala} vai pro ar hoje…', '{nome} tá há horas no mesmo bug 🤫', 'Ouvi dizer que vai ter pizza 🍕', 'Sabia que {nome} aposta tudo no jokenpô?'],
  work: ['Meu build passou de primeira 😎', 'Esse bug em {sala} tá osso', 'Deploy na sexta? 😈', 'Quem mexeu no package-lock?!', 'Os testes estão verdes ✅', 'Tô esperando o review…', 'Escrevi 300 linhas e apaguei 400', 'Refatorei {sala} inteiro hoje'],
  cafeina: ['Esse café tá forte!', 'Já é o quinto café ☕', 'Sem café não compila ☕'],
  piadas: ['Funciona na minha máquina! 😂', 'Por que o dev foi ao médico? Muitos bugs 🐛', 'Existem 10 tipos de pessoas… 😏', 'Commit: "ajustes finais (agora vai)"', 'Meu código não tem bug, tem feature surpresa'],
  esporte: ['Viu o jogo ontem? ⚽', 'Bora correr no fim de semana?'],
  series: ['Viram o último episódio? 📺', 'Sem spoiler, por favor!'],
  games: ['Zerei aquele jogo ontem 🎮', 'Bora jogar online hoje?'],
  leitura: ['Tô lendo um livro ótimo 📚', 'Terminei aquele livro!'],
  calma: ['Respira… tudo vai compilar 🧘', 'Um passo de cada vez.'],
  apostas: ['Quem topa um jokenpô depois? 🎲', 'Tô com sorte hoje 🍀'],
  economia: ['Tô juntando 🪙 pra férias', 'Café de graça é o melhor café'],
  generic: ['E o fim de semana?', 'Preciso de férias 🏖️', 'Que dia, hein', 'Tá tudo corrido hoje'],
  react: ['KKKKK', 'Sério?!', 'Não acredito 😮', 'Verdade!', 'Hahaha', 'Nem me fala…', '👀', 'Pois é', 'Mentira!', 'Que isso!'],
  laugh: ['KKKKK', 'Hahaha!', '😂😂😂'],
};

/** Saindo de uma roda porque o trabalho chamou. */
export const CALLED: Pool = ['Opa, me chamaram! 🏃', 'Fui! Trabalho chegou', 'Volto já!', 'Ih, tenho que ir!'];
export const SHELL_DONE: Pool = ['Meu comando terminou! 🏃', 'Terminou o build, fui!'];

/** Temas de papo que cada traço puxa. */
export const TRAIT_TOPICS: Partial<Record<TraitId, keyof typeof CHAT>> = {
  fofoca: 'fofoca',
  cafeina: 'cafeina',
  piadas: 'piadas',
  esporte: 'esporte',
  series: 'series',
  games: 'games',
  leitura: 'leitura',
  calma: 'calma',
  apostas: 'apostas',
  economia: 'economia',
};

/** Fala ligada ao dia/hora local, quando houver (sexta, segunda, manhã, almoço, noite). */
export function timeLine(d: Date): string | null {
  const day = d.getDay();
  const h = d.getHours();
  if (day === 5 && h >= 12) return 'Sextou! 🎉';
  if (day === 1 && h < 12) return 'Segunda-feira, né…';
  if (h >= 6 && h < 10) return 'Bom dia! ☀️';
  if (h >= 11 && h < 14) return 'Que fome… almoço? 🍽️';
  if (h >= 20 || h < 5) return 'Ainda aqui a essa hora? 🌙';
  return null;
}

export interface LineVars {
  nome?: string;
  sala?: string;
  v?: number | string;
  a?: number | string;
  b?: number | string;
}

/** Preenche os campos da fala. Sem valor para um campo, a fala é descartada (retorna null). */
export function fill(line: string, vars: LineVars): string | null {
  let ok = true;
  const out = line.replace(/\{(nome|sala|v|a|b)\}/g, (_, k: keyof LineVars) => {
    const v = vars[k];
    if (v === undefined || v === '') {
      ok = false;
      return '';
    }
    return String(v);
  });
  return ok ? out : null;
}

/** Sorteia uma fala do conjunto (evitando `avoid` e as que não dá para preencher). */
export function pick(pool: Pool, rng: () => number, vars: LineVars = {}, avoid?: string | null): string {
  const n = pool.length;
  const start = Math.floor(rng() * n);
  let fallback: string | null = null;
  for (let i = 0; i < n; i++) {
    const s = fill(pool[(start + i) % n], vars);
    if (s === null) continue;
    if (s !== avoid) return s;
    fallback ??= s;
  }
  return fallback ?? pool.find((l) => !/\{\w+\}/.test(l)) ?? '…';
}
