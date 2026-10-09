// Dimensões e ritmos do mundo. Tudo em tiles (TILE px) salvo indicação em contrário.
import { TILE } from '../art/api';

export { TILE };

/** Largura de uma coluna do prédio (uma sala ao norte + uma ao sul). */
export const COL_W = 16;
/** Altura de uma sala: 2 linhas de face da parede norte + 9 de piso + 1 de parede sul. */
export const ROOM_H = 12;
/** Altura do corredor que corta o prédio de leste a oeste. */
export const CORRIDOR_H = 5;
/** Colunas do núcleo (recepção/banheiros e copa/lounge). */
export const CORE_COLS = 2;

export const NORTH_Y = 0;
export const CORRIDOR_Y = ROOM_H;
export const SOUTH_Y = ROOM_H + CORRIDOR_H;
export const BUILDING_H = ROOM_H * 2 + CORRIDOR_H;

/** Primeira coluna (local) da porta de 2 tiles das salas. */
export const DOOR_X = 7;
export const DOOR_W = 2;

/** Margens de área externa ao redor do prédio (tiles). */
export const EXT_WEST = 20;
export const EXT_EAST = 20;
export const EXT_NORTH = 16;
export const EXT_SOUTH = 24;

/** Velocidades em px de mundo por segundo. */
export const WALK_SPEED = 3.2 * TILE;
export const RUN_SPEED = 6 * TILE;

/** Deslocamento dos pés dentro do tile em que o personagem está em pé. */
export const FOOT_DX = TILE / 2;
export const FOOT_DY = 11;

/** Zoom permitido (pixels CSS por pixel de mundo). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

/** Duração das animações de sala (ms). */
export const BUILD_MS = 2600;
export const DISMANTLE_MS = 2200;
export const DISMANTLE_DELAY_MS = 1500;
/** Uma vaga livre antes da última sala espera isto antes de a sala mais distante se mudar para lá. */
export const COMPACT_DELAY_MS = 1200;
/** Debounce para agentes que somem do snapshot. */
export const MISSING_DEBOUNCE_MS = 3000;
