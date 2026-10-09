// Tipos do layout do escritório. Módulos de layout são PUROS (sem DOM): geram descrições
// que o render transforma em pixels e a simulação usa para caminhos e pontos de interesse.
import type { Dir, FloorKind, FurnitureKind, WallStyle } from '../../art/api';

export type AreaKind = 'reception' | 'restroom' | 'cafe' | 'lounge' | 'room' | 'corridor';

/** Retângulo em tiles (coordenadas absolutas do mundo). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Móvel de chão posicionado. */
export interface FurniturePlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  /** Canto superior esquerdo do footprint, em tiles absolutos. */
  tx: number;
  ty: number;
  /** Deslocamento do desenho em px (ex.: cadeira centralizada numa mesa de 2 tiles). Não afeta o footprint. */
  dx?: number;
  dy?: number;
  /** Ordem relativa na animação de montagem (0..1). */
  order: number;
  /** Para mesas: índice do lugar (a tela segue a atividade de quem senta ali). */
  seat?: string;
}

/** Item montado em parede. `cx` = centro em px de mundo; `baseY` = linha do rodapé em px. */
export interface WallItemPlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  cx: number;
  baseY: number;
  /** 'face' = face da parede norte; 'south' = sobre a mureta da parede sul. */
  on: 'face' | 'south';
  order: number;
}

export interface Doorway {
  x: number;
  w: number;
}

/** Trecho de parede em px de mundo. */
export type WallSegment =
  | { kind: 'face'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'south'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'cap'; x: number; y: number; w: number; h: number; style: WallStyle };

export interface FloorPatch {
  kind: FloorKind;
  /** px de mundo */
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  tint?: string;
  tint2?: string;
}

export interface RugPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  seed: number;
}

export type SpotKind =
  | 'desk' // lugar de trabalho (mesa + cadeira)
  | 'stool' // banqueta da mesa de reunião
  | 'nook' // poltrona/puff dentro da sala de projeto (lugar extra de trabalho, com notebook)
  | 'stand' // ponto em pé dentro da sala (trabalho sem mesa)
  | 'switch' // interruptor de luz
  | 'whiteboard'
  | 'coffee'
  | 'water'
  | 'snack'
  | 'fridge'
  | 'cafe_seat'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'bench'
  | 'pingpong'
  | 'arcade'
  | 'shelf'
  | 'window'
  | 'stall'
  | 'sink'
  | 'elevator'
  | 'talk'
  | 'watch'; // ponto em pé da torcida (assistir a uma partida)

/**
 * Ponto de interesse. O personagem anda até o tile de aproximação (tx, ty), caminhável,
 * e então "encaixa" na posição final (x, y) em px, virado para `dir`.
 */
export interface SpotDef {
  id: string;
  kind: SpotKind;
  areaId: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  dir: Dir;
  seated?: boolean;
  /** Móvel associado (cadeira, máquina, cabine...). */
  furnitureId?: string;
  /** Profundidade a usar quando ocupado (assentos: logo depois do móvel). */
  sortY?: number;
  /** Spots em par (ping-pong, conversa) compartilham o grupo. */
  group?: string;
  /** Mesa cuja tela acompanha quem está sentado aqui. */
  deskId?: string;
  /** Ordem de preferência (mesas). */
  rank?: number;
  /** Lado da ilha: 'S' = de costas (tela visível), 'N' = de frente (desk_back). */
  side?: 'S' | 'N';
}

export interface AreaLayout {
  id: string;
  kind: AreaKind;
  /** Retângulo da área em tiles absolutos. */
  rect: TileRect;
  floors: FloorPatch[];
  rugs: RugPatch[];
  walls: WallSegment[];
  wallItems: WallItemPlacement[];
  furniture: FurniturePlacement[];
  spots: SpotDef[];
  /** Tiles caminháveis (absolutos), além dos que são bloqueados por móveis. */
  walkable: TileRect[];
  /** Tiles explicitamente bloqueados (divisórias desenhadas como piso, etc.). */
  blocked?: TileRect[];
  /** Tiles da porta (absolutos). */
  door?: TileRect;
  /** Para salas de projeto: o lado do corredor em que está. */
  side?: 'north' | 'south';
  /** Tom (cor hex) aplicado de leve sobre o piso, para cada sala ter identidade própria. */
  floorTint?: string;
  /** Retângulo (px) escurecido quando a luz está apagada. */
  shade?: { x: number; y: number; w: number; h: number };
  /** Retângulo (px) da placa com o nome. */
  signId?: string;
}

/** Elemento decorativo externo (árvore, arbusto, poste...) desenhado pelo próprio mundo. */
export interface ExteriorProp {
  kind: 'tree' | 'pine' | 'bush' | 'flowers' | 'lamp' | 'bench' | 'rock' | 'hedge' | 'parasol' | 'totem' | 'paving' | 'loja';
  /** px de mundo: ponto central inferior (base). */
  x: number;
  y: number;
  seed: number;
  /** Slot ao qual pertence (some quando há sala ali). */
  slot?: number;
  /** O contrário: só aparece quando HÁ sala neste slot (ex.: cerca viva que fecha o caminho do jardim). */
  whenRoom?: number;
}
