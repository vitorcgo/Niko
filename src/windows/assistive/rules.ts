export interface PositionAssistive { x: number; y: number }
export interface ScreenAssistive { largura: number; altura: number }
export interface ShortcutAssistive { id: string; nome: string }
export interface ConfigAssistive {
  ativo: boolean;
  fixado: boolean;
  opacidade: number;
  origemCor: "ilha" | "dock";
  posicao: PositionAssistive;
  apps: ShortcutAssistive[];
}

export const SIZE_BUTTON = 40;
export const LIMIT_SHORTCUTS = 24;
export const ASSISTIVE_DEFAULT: ConfigAssistive = { ativo: false, fixado: false, opacidade: 0.65, origemCor: "ilha", posicao: { x: 1, y: 0.24 }, apps: [] };
const limit = (n: number, min: number, max: number) => Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);

function limits(screenValue: ScreenAssistive) {
  const marginX = Math.min(16, Math.max(0, (screenValue.largura - SIZE_BUTTON) / 2));
  const marginY = Math.min(16, Math.max(0, (screenValue.altura - SIZE_BUTTON) / 2));
  return { minX: marginX, maxX: Math.max(marginX, screenValue.largura - SIZE_BUTTON - marginX), minY: marginY, maxY: Math.max(marginY, screenValue.altura - SIZE_BUTTON - marginY) };
}

export function limitPosition(position: PositionAssistive, screenValue: ScreenAssistive): PositionAssistive {
  const l = limits(screenValue);
  return { x: limit(position.x, l.minX, l.maxX), y: limit(position.y, l.minY, l.maxY) };
}

export function normalizePosition(position: PositionAssistive, screenValue: ScreenAssistive): PositionAssistive {
  const l = limits(screenValue), p = limitPosition(position, screenValue);
  return { x: l.maxX === l.minX ? 0 : (p.x - l.minX) / (l.maxX - l.minX), y: l.maxY === l.minY ? 0 : (p.y - l.minY) / (l.maxY - l.minY) };
}

export function positionScreen(position: PositionAssistive, screenValue: ScreenAssistive): PositionAssistive {
  const l = limits(screenValue);
  return limitPosition({ x: l.minX + limit(position.x, 0, 1) * (l.maxX - l.minX), y: l.minY + limit(position.y, 0, 1) * (l.maxY - l.minY) }, screenValue);
}

export function positionMenu(position: PositionAssistive, screenValue: ScreenAssistive, heightDesired: number, widthDesired = 44) {
  const width = Math.min(widthDesired, Math.max(0, screenValue.largura - 24));
  const availableBelow = Math.max(0, screenValue.altura - position.y - SIZE_BUTTON - 8);
  const availableAcima = Math.max(0, position.y - 8);
  const acima = heightDesired > availableBelow && availableAcima > availableBelow;
  const height = Math.min(heightDesired, Math.max(0, acima ? availableAcima : availableBelow));
  return {
    x: limit(position.x + SIZE_BUTTON / 2 - width / 2, 12, Math.max(12, screenValue.largura - width - 12)),
    y: limit(acima ? position.y - height + 4 : position.y + SIZE_BUTTON - 4, 12, Math.max(12, screenValue.altura - height - 12)),
    largura: width, altura: height, acima,
  };
}

export function validateAssistive(input: unknown): ConfigAssistive {
  const s = (input && typeof input === "object" ? input : {}) as Partial<ConfigAssistive>;
  const uniqueItems = new Set<string>();
  const apps: ShortcutAssistive[] = [];
  for (const item of Array.isArray(s.apps) ? s.apps : []) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 2048 || typeof item.nome !== "string" || !item.nome.trim() || uniqueItems.has(item.id) || apps.length >= LIMIT_SHORTCUTS) continue;
    uniqueItems.add(item.id);
    apps.push({ id: item.id, nome: item.nome.trim().slice(0, 160) });
  }
  return { ativo: typeof s.ativo === "boolean" ? s.ativo : ASSISTIVE_DEFAULT.ativo, fixado: s.fixado === true, origemCor: s.origemCor === "dock" ? "dock" : "ilha", opacidade: limit(s.opacidade ?? ASSISTIVE_DEFAULT.opacidade, 0.3, 1), posicao: { x: limit(s.posicao?.x ?? ASSISTIVE_DEFAULT.posicao.x, 0, 1), y: limit(s.posicao?.y ?? ASSISTIVE_DEFAULT.posicao.y, 0, 1) }, apps };
}

export function moveShortcut<T extends { id: string }>(apps: T[], id: string, direction: -1 | 1): T[] {
  const from = apps.findIndex((a) => a.id === id), to = from + direction;
  if (from < 0 || to < 0 || to >= apps.length) return apps;
  const copy = [...apps];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}
