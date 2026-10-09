export interface StageVisual {
  id: string;
  texto: string;
}

export interface StateStages {
  contexto: string;
  anterior: StageVisual | null;
  atual: StageVisual | null;
  fila: StageVisual[];
  ultimaId: string | null;
}

export function createStateStages(context: string, stages: readonly StageVisual[]): StateStages {
  return { contexto: context, anterior: stages.at(-2) ?? null, atual: stages.at(-1) ?? null, fila: [], ultimaId: stages.at(-1)?.id ?? null };
}

export function receiveStages(state: StateStages, context: string, stages: readonly StageVisual[]): StateStages {
  if (state.contexto !== context || !state.ultimaId || stages.length === 0) return createStateStages(context, stages);
  const index = stages.findLastIndex((stage) => stage.id === state.ultimaId);
  if (index < 0) return createStateStages(context, stages);
  const newItems = stages.slice(index + 1);
  if (newItems.length === 0) return state;
  return { ...state, ultimaId: newItems.at(-1)!.id, fila: [...state.fila, ...newItems].slice(-4) };
}

export function advanceStage(state: StateStages): StateStages {
  if (state.fila.length === 0) return state;
  return { ...state, anterior: state.atual, atual: state.fila[0], fila: state.fila.slice(1) };
}

interface RectangleVisual {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectangleValid(rectangle: RectangleVisual) {
  return [rectangle.left, rectangle.top, rectangle.width, rectangle.height].every(Number.isFinite) && rectangle.width > 0 && rectangle.height > 0;
}

export function calculateDestinationCharacter(island: RectangleVisual, space: RectangleVisual, scale: number) {
  if (!rectangleValid(island) || !rectangleValid(space) || !Number.isFinite(scale) || scale <= 0) return null;
  return { x: (space.left - island.left + space.width / 2) / scale - 35, y: (space.top - island.top + space.height / 2) / scale - 35, escala: space.width / scale / 70 };
}

export function calculatePathFile(zone: RectangleVisual, character: RectangleVisual, point: { x: number; y: number }, scale: number) {
  if (!rectangleValid(zone) || !rectangleValid(character) || ![point.x, point.y, scale].every(Number.isFinite) || scale <= 0) return null;
  if (point.x < zone.left || point.x > zone.left + zone.width || point.y < zone.top || point.y > zone.top + zone.height) return null;
  return {
    origem: { x: (point.x - zone.left) / scale, y: (point.y - zone.top) / scale },
    destino: { x: (character.left - zone.left + character.width / 2) / scale, y: (character.top - zone.top + character.height * 0.55) / scale },
  };
}
