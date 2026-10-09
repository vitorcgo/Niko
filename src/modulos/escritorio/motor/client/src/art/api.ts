// CONTRATO do módulo de arte (pixel art procedural).
//
// - Implementação: client/src/art/index.ts (+ arquivos internos de art/).
// - Consumidores: client/src/world/** (render do escritório) e client/src/ui/** (avatares).
// - Regra: mudanças aqui devem ser ADITIVAS. Não renomeie/remova tipos, kinds ou funções.
//
// Convenções gerais
// - Mundo em "pixels de mundo"; 1 tile = TILE px. Tudo é pixel art em 1x, ampliado pela câmera
//   com imageSmoothingEnabled = false.
// - Perspectiva: top-down 3/4, como em tilesets de escritório moderno em pixel art. Ver DIREÇÃO DE ARTE abaixo. Vemos o topo e a FRENTE (face sul)
//   dos objetos. Paredes norte mostram a face (2 tiles de altura); paredes laterais e sul aparecem
//   só como "tampa" fina para não esconder o interior das salas.
// - Luz vem de cima/esquerda: topos mais claros, faces frontais mais escuras, sombra suave embaixo.
// - Sprites são HTMLCanvasElement em cache (gere uma vez, reutilize sempre).

// DIREÇÃO DE ARTE (pixel art top-down 3/4 de escritório moderno, claro e detalhado)
// - Escritório claro e limpo: porcelanato claro com rejunte sutil, madeira quente no lounge, paredes claras,
//   divisórias de vidro azulado, estantes com pastas coloridas, plantas em vasos, quadros, placa com o nome.
// - Ilhas de mesas com 1–2 monitores de tela azulada brilhante, teclado, mouse, caneca, papéis; cadeiras grafite.
// - Copa com bancada clara e frontão de mármore, pia inox, cafeteira, geladeira; bebedouro com galão azul.
// - Lounge com sofá azul/cinza-azulado e almofadas laranja, tapete, mesa de centro, bonsai, impressora grande.
// - Paleta clara (neutros frios + madeira quente + acentos saturados nos objetos); contorno 1px cinza-azulado
//   escuro (não preto); 3–4 tons por material; brilhos especulares; sombras de contato; muitos detalhes pequenos.

export const TILE = 16;

export type Dir = 'down' | 'up' | 'left' | 'right';

/**
 * Poses do personagem. Entre parênteses: nº de frames esperado.
 * Poses "sentadas" (sit/type/sleep) assumem que o personagem está sobre um assento: as pernas
 * ficam escondidas/dobradas e o corpo fica ~4px mais baixo que em pé.
 */
export type Pose =
  | 'stand' // em pé parado, respiração sutil (2)
  | 'walk' // andando (4)
  | 'run' // correndo, passos mais largos e corpo inclinado (4)
  | 'sit' // sentado parado (2)
  | 'type' // sentado digitando — normalmente dir 'up', de costas para a câmera, braços alternando (4)
  | 'sleep' // sentado cochilando: cabeça baixa (2)
  | 'drink' // em pé levando o copo à boca (2) — use com held 'coffee' ou 'water'
  | 'use' // em pé operando máquina: braço estendido para frente (2)
  | 'raise_hand' // braço levantado acenando — pedindo atenção (2); funciona em pé e sentado (opts.seated)
  | 'talk' // em pé conversando, gesticulando (2)
  | 'stretch' // em pé se espreguiçando, braços para cima (2)
  | 'read' // em pé ou sentado segurando livro/papéis à frente (2)
  | 'play' // ping-pong: raquete na mão, alternando braço (2)
  | 'wait' // sentado esperando algo terminar (ex.: um shell), recostado (2). Com held 'popcorn': mão do balde à boca, comendo pipoca; sem item: braços cruzados, dedos/pé batendo
  // --- vida social (aditivo)
  | 'cheer' // comemorando: os dois braços para o alto, punhos cerrados, boca aberta, pulinho no quadro 1 (2). Em pé ou sentado (opts.seated)
  | 'laugh' // gargalhando: olhos fechados em arco, boca aberta, uma mão na barriga, corpo sacudindo 1px (2). Em pé ou sentado
  | 'game' // jogando videogame: controle (held 'controller') nas duas mãos à frente do peito, polegares mexendo, corpo inclinado para a tela (2). Em pé ou sentado
  | 'rps' // pedra-papel-tesoura. held 'none': punho fechado subindo (quadro 0) e descendo (1) na contagem "jo-ken-pô"; held 'rock'|'paper'|'scissors': braço estendido à frente mostrando o gesto (2). Em pé (sentado também funciona)
  | 'groom' // diante do espelho (normalmente dir 'up', de costas): uma mão perto do rosto/cabelo indo e voltando — batom, pente, ajeitar o cabelo (2). held opcional 'lipstick'|'comb'. Em pé
  | 'sulk'; // chateado (perdeu a aposta/partida): ombros caídos, cabeça baixa, olhos semicerrados, braços pendurados (2). Em pé ou sentado

export type HeldItem = 'none' | 'coffee' | 'water' | 'papers' | 'laptop' | 'book' | 'box' | 'paddle' | 'popcorn'
  // --- vida social (aditivo)
  | 'controller' // controle de videogame (pose 'game'; em pé/andando, numa mão)
  | 'rock' // pose 'rps': mão fechada (pedra)
  | 'paper' // pose 'rps': mão aberta, palma para baixo (papel)
  | 'scissors' // pose 'rps': indicador e médio em V (tesoura)
  | 'phone' // celular (com 'read' ou 'sit': olhando a tela, polegar rolando; tela acesa azulada)
  | 'lipstick' // batom (pose 'groom')
  | 'comb'; // pente (pose 'groom')

export type HairStyle =
  | 'short' | 'buzz' | 'spiky' | 'side_part' | 'curly' | 'afro' | 'bob' | 'long' | 'ponytail' | 'bun' | 'pigtails'
  | 'mohawk' | 'bald' | 'wavy';

export type TopStyle = 'tshirt' | 'hoodie' | 'shirt_tie' | 'sweater' | 'jacket' | 'blouse' | 'polo';

export type Accessory = 'none' | 'glasses' | 'sunglasses' | 'headphones' | 'cap' | 'beanie' | 'earrings' | 'bow';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eyes: string;
  top: string;
  topAccent: string;
  topStyle: TopStyle;
  bottom: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  /** Crachá/cordão no pescoço (usado para distinguir subagentes). null = sem crachá. */
  lanyard: string | null;
  look: 'f' | 'm';
  /** (Opcional, aditivo) Barba/bigode — só sorteado para look 'm'. Ausente = sem pelos faciais. */
  facialHair?: 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee';
  /** (Opcional, aditivo) Parte de baixo da roupa. Ausente = calça. */
  bottomStyle?: 'pants' | 'shorts' | 'skirt';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Regiões dinâmicas dentro de um sprite (em px do sprite, relativas ao canto superior esquerdo). */
export type SpriteRectName = 'screen' | 'board' | 'glass' | 'face' | 'tv' | 'sign' | 'art' | 'glow'
  /**
   * (Aditivo) 2º monitor/notebook da `desk`, quando existe. O sprite já traz um conteúdo fixo
   * escurecido (planilha/editor/painel); o mundo PODE desenhar por cima (ex.: drawScreen 'off'
   * quando a sala apaga, ou outro modo quando o dono trabalha). Ignorar também funciona.
   */
  | 'screen2';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Ponto de ancoragem dentro do sprite (px). Ver convenções em FurnitureDef / characterSprite. */
  ax: number;
  ay: number;
  rects?: Partial<Record<SpriteRectName, Rect>>;
}

/** `front` é desenhado POR CIMA de quem está sentado/dentro (ex.: encosto da cadeira, porta da cabine). */
export interface FurnitureSprites {
  base: Sprite;
  front?: Sprite;
}

export interface CharacterFrameRequest {
  appearance: Appearance;
  dir: Dir;
  pose: Pose;
  frame: number;
  held?: HeldItem;
  /** Para poses que podem ser em pé ou sentado (raise_hand, read, talk). */
  seated?: boolean;
}

export type FurnitureKind =
  // --- escritório (salas de projeto)
  | 'desk' // 2x1. Mesa com monitor virado para o SUL (tela visível para a câmera), teclado e caneca. rects.screen = área da tela.
  | 'desk_back' // 2x1. Mesa vista pelo outro lado: vemos a TRASEIRA do monitor; a pessoa senta ao NORTE dela, virada para baixo (rosto visível). Para ilhas de mesas face a face. Mesmas variants de desk.
  | 'office_chair_front' // 1x1 assento virado para BAIXO (encosto ao norte, desenhado ANTES do personagem; sem front). Par da desk_back.
  | 'office_chair' // 1x1 assento. Encosto ao sul (personagem senta virado para cima, de costas). front = encosto.
  | 'bookshelf' // 2x1 encostada na parede norte. Livros coloridos.
  | 'filing_cabinet' // 1x1 arquivo de gavetas.
  | 'printer' // 1x1 impressora sobre móvel baixo.
  | 'trash_bin' // 1x1 lixeira pequena (pode ser bem menor que o tile).
  | 'plant_small' // 1x1 vaso pequeno. variants: 'fern' | 'succulent' | 'flower'
  | 'plant_tall' // 1x1 planta alta (até ~2 tiles de altura). variants: 'palm' | 'ficus' | 'monstera' | 'bonsai'
  | 'glass_partition' // 1x1 segmento de divisória de vidro sobre base branca (meia-parede + vidro azulado com reflexo). variants: 'h' (corre leste-oeste) | 'v' (corre norte-sul) | 'end' (ponta/coluna)
  | 'binder_shelf' // 1x1 estante alta e estreita com pastas coloridas (azul/laranja/verde) e caixas.
  | 'meeting_table' // 3x2 mesa de reunião/bancada para subagentes.
  | 'stool' // 1x1 assento simples (banqueta). Personagem pode sentar em qualquer direção.
  | 'floor_lamp' // 1x1 luminária de chão. rects.glow = centro da luz.
  | 'water_cooler' // 1x1 bebedouro com galão azul. Uso: personagem fica ao SUL, virado para cima.
  // --- montados na parede norte (mount: 'wall')
  | 'whiteboard' // 3 tiles de largura. Quadro kanban. rects.board = área onde o render desenha post-its.
  | 'window' // 2 tiles. Janela; rects.glass = vidro (o render desenha o céu antes da moldura).
  | 'clock' // 1 tile. Relógio; rects.face = mostrador (ponteiros desenhados pelo render).
  | 'poster' // 1 tile. variants: 'code' | 'coffee' | 'rocket' | 'cat' | 'bug' | 'ship_it'
  | 'painting' // 2 tiles. Quadro com moldura; rects.art = área da pintura (pode receber imagem gerada por IA).
  | 'tv' // 2 tiles. TV de parede; rects.tv = tela.
  | 'light_switch' // 1 tile (o sprite é pequeno). variants: 'on' | 'off'
  | 'elevator' // 2 tiles. Porta de elevador; state 0..4 = porta fechada .. totalmente aberta. Inclui luz/seta acima.
  | 'door_frame' // 2 tiles. Batente desenhado sobre a passagem na face da parede norte.
  | 'sign' // 3 tiles. Placa com o nome da sala; rects.sign = área do texto (o render escreve o nome).
  | 'mirror' // 1 tile. Espelho (acima das pias do banheiro). (Aditivo) rects.glass = área refletora (o mundo pode desenhar o reflexo de quem está na frente).
  | 'shelf_wall' // 2 tiles. Prateleira de parede com objetos.
  // --- copa / café
  | 'counter' // 1x1 segmento de bancada (encostado na parede norte). variants: 'plain' | 'drawers'
  | 'counter_sink' // 1x1 bancada com pia.
  | 'coffee_machine' // 1x1 bancada com cafeteira em cima. Uso: personagem ao SUL, virado para cima. state 0 = parada, 1 = passando café.
  | 'microwave' // 1x1 bancada com micro-ondas.
  | 'fridge' // 1x1 geladeira alta.
  | 'vending_machine' // 1x1 máquina de snacks alta e iluminada.
  | 'cafe_table' // 1x1 mesinha redonda.
  | 'cafe_chair' // 1x1 assento. variant = direção para onde quem senta olha: 'up' | 'down' | 'left' | 'right'. front quando 'up'.
  // --- lounge
  | 'sofa' // 3x1 assento. variant 'down' (de frente p/ câmera) | 'up' (de costas, front = encosto).
  | 'armchair' // 1x1 assento. variants como cafe_chair.
  | 'coffee_table' // 2x1 mesa de centro.
  | 'pingpong_table' // 3x2 mesa de ping-pong (rede vertical no meio; jogadores nas pontas oeste/leste).
  | 'beanbag' // 1x1 puff (assento). variants de cor: 'red' | 'blue' | 'yellow' | 'green'
  | 'arcade' // 1x1 fliperama (uso como máquina: personagem ao sul virado para cima). (Aditivo) rects.screen = tela (o mundo pode desenhar drawScreen 'game' por cima durante uma partida).
  // --- banheiro
  | 'toilet_stall' // 2x2 cabine com vaso. Personagem entra pela porta (lado SUL) e some. front = divisória/porta. state 0 = livre (porta entreaberta), 1 = ocupada (porta fechada, indicador vermelho).
  | 'sink' // 1x1 pia com gabinete (encostada na parede norte; use 'mirror' na parede acima).
  // --- recepção
  | 'reception_desk' // 3x1 balcão de recepção.
  | 'bench'; // 2x1 banco de espera (assento, olhando para baixo).

export interface FurnitureDef {
  mount: 'floor' | 'wall';
  /**
   * Floor: tiles ocupados no chão (w x h).
   * Wall: largura em tiles na face da parede (h ignorado).
   */
  footprint: { w: number; h: number };
  /** Floor: se os tiles bloqueiam a passagem. Assentos não bloqueiam (o personagem "entra" neles). */
  blocks: boolean;
  /** É um assento (personagem pode sentar sobre ele). */
  seat?: boolean;
  variants?: readonly string[];
  /** Quantidade de estados visuais (ex.: elevator 5, toilet_stall 2). */
  states?: number;
}

/**
 * Catálogo de móveis. Ancoragem (ax, ay) dos sprites de móveis:
 * - mount 'floor': (ax, ay) corresponde ao ponto CENTRAL INFERIOR do footprint no mundo,
 *   ou seja, (x0 + w*TILE/2, y0 + h*TILE) onde (x0, y0) é o canto superior esquerdo do footprint.
 *   O sprite pode se estender para cima (altura) e um pouco para os lados.
 * - mount 'wall': (ax, ay) corresponde ao ponto CENTRAL INFERIOR do trecho de parede, isto é,
 *   na linha do rodapé (base da face da parede). O sprite "flutua" na altura certa por conta própria.
 * Ordenação de profundidade: por y da âncora no mundo (maior y = desenhado depois).
 */
export const FURNITURE: Readonly<Record<FurnitureKind, FurnitureDef>> = {
  desk: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  desk_back: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark'] },
  office_chair_front: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  office_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray'] },
  bookshelf: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  filing_cabinet: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  printer: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  trash_bin: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  plant_small: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['fern', 'succulent', 'flower'] },
  plant_tall: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['palm', 'ficus', 'monstera', 'bonsai'] },
  glass_partition: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['h', 'v', 'end'] },
  binder_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  meeting_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  stool: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true },
  floor_lamp: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  water_cooler: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  whiteboard: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  window: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  clock: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  poster: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['code', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'] },
  painting: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  tv: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  light_switch: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['on', 'off'] },
  elevator: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false, states: 5 },
  door_frame: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  sign: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  mirror: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  shelf_wall: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  counter: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['plain', 'drawers'] },
  counter_sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  coffee_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, states: 2 },
  microwave: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  fridge: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  vending_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_table: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  sofa: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: false, seat: true, variants: ['down', 'up'] },
  armchair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  coffee_table: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  pingpong_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  beanbag: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['red', 'blue', 'yellow', 'green'] },
  arcade: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  toilet_stall: { mount: 'floor', footprint: { w: 2, h: 2 }, blocks: true, states: 2 },
  sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  reception_desk: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  bench: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: false, seat: true },
};

export type FloorKind =
  | 'carpet' // salas de projeto (usa tint/tint2 do tema da sala)
  | 'wood' // lounge
  | 'tile_check' // copa (xadrez)
  | 'tile_white' // banheiro
  | 'concrete' // corredor (cimento queimado/polido)
  | 'marble' // recepção
  | 'grass' // área externa
  | 'sidewalk' // calçada externa
  | 'street'; // rua externa (faixas desenhadas pelo render se quiser)

export type WallPattern = 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'brick' | 'glass' | 'marble';

export interface WallStyle {
  /** Cor base da face da parede. */
  base: string;
  /** Cor de detalhes (rodapé/faixa). */
  trim?: string;
  pattern?: WallPattern;
  /** Parede externa do prédio (tom mais sóbrio, pode ter textura de tijolo/concreto). */
  exterior?: boolean;
}

export interface Doorway {
  /** Início da passagem em px de mundo (absoluto) e largura em px. */
  x: number;
  w: number;
}

export type ScreenMode =
  | 'off' // monitor desligado (azul-marinho fosco com reflexo diagonal; nunca quase preto)
  | 'standby' // (aditivo) ligado sem uso: fundo azul com logo pulsando devagar — p.ex. mesa vaga com a sala acesa
  | 'idle' // descanso de tela suave
  | 'code' // editor com linhas de código coloridas rolando
  | 'terminal' // terminal escuro com texto verde surgindo
  | 'browser' // página web (barra de endereço + blocos)
  | 'search' // resultados de busca / lupa
  | 'chat' // conversa (balões alternados)
  | 'docs' // documento de texto
  | 'tasks' // lista de checkboxes
  | 'alert' // tela piscando em âmbar (precisa de atenção)
  | 'progress' // terminal escuro com uma barra de progresso/spinner andando (esperando um comando terminar)
  // --- vida social (aditivo; pensados para a TV do lounge e o fliperama, mas valem para qualquer tela)
  | 'show' // programa de TV animado; mapeamento FIXO pelo `seed`: seed % 3 === 0 futebol (campo, jogadores, bola; de tempos em tempos a bola entra no gol e a tela pisca "GOL"), 1 novela (dois rostos em close, corações), 2 desenho animado (cores vivas)
  | 'game'; // videogame (dois jogadores); mapeamento FIXO pelo `seed`: seed % 2 === 0 corrida em tela dividida (dois carrinhos na pista), 1 luta (dois bonecos e barras de vida)

export interface RoomTheme {
  carpet: string;
  carpet2: string;
  wall: WallStyle;
  accent: string;
  deskVariant: string;
  chairVariant: string;
}

/** Ícones pixel art pequenos (~8–12px) para estados acima da cabeça. */
export type IconName = 'alert' | 'question' | 'zzz' | 'check' | 'heart' | 'coffee' | 'music' | 'idea' | 'sweat' | 'star' | 'lightning' | 'chat' | 'box' | 'wave'
  | 'hourglass' // ampulheta (esperando um shell)
  | 'hourglass_flip' // a mesma ampulheta virando (alterne com 'hourglass' para animar)
  | 'cobweb' // teia de aranha (~12px) para o canto da cadeira/personagem quando a espera fica longa
  | 'storm' // nuvenzinha de chuva com raio (algo falhou)
  // --- vida social (aditivo)
  | 'coin' // moeda dourada com brilho (~8px) — ganhou dinheiro
  | 'sparkle' // brilho de 4 pontas (~9px) — ficou arrumado(a) no espelho
  | 'trophy' // troféu dourado (~10px) — venceu a partida/aposta
  | 'hand_rock' // gesto de pedra (punho) (~10px) — revelação do jokenpô
  | 'hand_paper' // gesto de papel (mão aberta) (~10px)
  | 'hand_scissors'; // gesto de tesoura (V) (~10px)

/** Assinatura que art/index.ts deve exportar (o mundo e a UI dependem disto). */
export interface ArtModule {
  appearanceFromSeed(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean }): Appearance;
  /** Ancoragem: (ax, ay) = centro dos pés (ponto no chão). Personagem ocupa ~14–18px de largura e ~24–28px de altura. */
  characterSprite(req: CharacterFrameRequest): Sprite;
  poseFrameCount(pose: Pose): number;
  /** Duração de cada frame da pose em ms. */
  poseFrameDuration(pose: Pose): number;
  /**
   * `opts.seed` (opcional, aditivo) varia os detalhes de itens repetidos (objetos sobre a mesa, livros da
   * estante, pastas...). Sem seed, usa a variação 0. Sprites continuam em cache por (kind, variant, state, seed % N).
   */
  furnitureSprites(kind: FurnitureKind, variant?: string, state?: number, opts?: { seed?: number }): FurnitureSprites;
  /** Desenha uma área de piso (px de mundo, múltiplos de TILE). `seed` varia detalhes por tile. */
  drawFloor(ctx: CanvasRenderingContext2D, kind: FloorKind, x: number, y: number, w: number, h: number, opts: { seed: number; tint?: string; tint2?: string }): void;
  /** Tapete decorativo sobre o piso. */
  drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed: number): void;
  /** Face de parede norte: altura 2*TILE a partir de y, com "tampa" escura no topo e rodapé na base. */
  drawWallFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Tampa de parede (laterais e trechos sem face), retângulo arbitrário. */
  drawWallTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: WallStyle): void;
  /** Parede sul: 1 tile de altura (tampa + mureta curta), com passagens opcionais. */
  drawSouthWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Conteúdo animado de tela (monitor/TV). `r` em px de mundo. `t` em ms. */
  drawScreen(ctx: CanvasRenderingContext2D, r: Rect, mode: ScreenMode, t: number, seed: number): void;
  /** Post-its do quadro kanban (colunas: a fazer / fazendo / feito). */
  drawBoard(ctx: CanvasRenderingContext2D, r: Rect, items: readonly { status: 'pending' | 'in_progress' | 'completed' }[], t: number): void;
  /** Céu + horizonte visto pela janela conforme a hora local (0–24, fracionária). */
  drawWindowView(ctx: CanvasRenderingContext2D, r: Rect, hour: number, t: number, seed: number): void;
  drawClock(ctx: CanvasRenderingContext2D, r: Rect, date: Date): void;
  roomTheme(seed: number): RoomTheme;
  iconSprite(name: IconName): Sprite;
  /**
   * (Opcional, aditivo) Lance do futebol de drawScreen('show') com seed % 3 === 0, no instante `t`:
   * a partir de `progress >= goalAt` a tela pisca "GOL" (bola no gol da direita se `right`). O mundo
   * usa para a torcida comemorar junto com a TV.
   */
  footballLance?(t: number, seed: number): { lance: number; progress: number; right: boolean; period: number; goalAt: number };
  /** Avatar (cabeça + ombros) ampliado para a UI. */
  avatarCanvas(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean; scale?: number }): HTMLCanvasElement;
}
