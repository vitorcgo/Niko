import { useConfig } from "../state/settings";
import { useInterface, type Geometry } from "../state/interface";

export const HEIGHT_BAR_TASKS = 0;
export const HEIGHT_DOCK = 62;
export const SLACK_DOCK = 10;
export const TOP_RESERVED = 40;

export function fallbackDock(): number {
  const dock = useConfig.getState().dock;
  return dock.ativo && dock.modo === "fixo" ? HEIGHT_DOCK : 0;
}

export function workArea() {
  return { w: window.innerWidth, h: window.innerHeight - HEIGHT_BAR_TASKS - fallbackDock() };
}

export function rectanglesOpen(): Geometry[] {
  const s = useInterface.getState();
  const area = workArea();
  const list: Geometry[] = [];
  if (s.sistemaAberto && !s.sistemaMinimizado) list.push(s.sistemaMaximizado ? { x: 0, y: 0, w: area.w, h: area.h } : s.geometria);
  for (const j of s.janelasConexao) if (!j.minimizada) list.push(j.maximizada ? { x: 0, y: 0, w: area.w, h: area.h } : j.geometria);
  return list.filter((g) => g.w > 0);
}

export function overlaps(a: Geometry, b: Geometry): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function someoneCovers(target: Geometry): boolean {
  return rectanglesOpen().some((r) => overlaps(r, target));
}
