import { overviewFrame } from "./motor/client/src/world/camera";
import { BUILDING_H, COL_W, TILE } from "./motor/client/src/world/constants";

export function enquadramentoDoEscritorio(colunas: number, largura: number, altura: number, geral = false) {
  const cols = Number.isFinite(colunas) ? Math.max(2, Math.floor(colunas)) : 2;
  const w = Number.isFinite(largura) ? Math.max(1, largura) : 800;
  const h = Number.isFinite(altura) ? Math.max(1, altura) : 600;
  const predio = geral
    ? { x: -TILE, y: -8 * TILE, w: cols * COL_W * TILE + 2 * TILE, h: BUILDING_H * TILE + 20 * TILE }
    : { x: 0, y: 0, w: cols * COL_W * TILE, h: BUILDING_H * TILE };
  const frame = overviewFrame(predio, w, h, { top: 0, bottom: 12, left: 0, right: 0 });
  return {
    ...frame,
    zoom: Math.min(1.6, frame.zoom),
    minZoom: Math.min(1, overviewFrame({ x: -TILE, y: -8 * TILE, w: cols * COL_W * TILE + 2 * TILE, h: BUILDING_H * TILE + 20 * TILE }, w, h, { top: 0, bottom: 12, left: 0, right: 0 }).zoom),
    bounds: { x: -7 * TILE, y: -10 * TILE, w: cols * COL_W * TILE + 14 * TILE, h: BUILDING_H * TILE + 32 * TILE },
  };
}
