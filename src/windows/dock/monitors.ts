import type { NikoMonitor } from "../../desktop/desktop";

export const ALL_THE_MONITORS = "todos";

export function myMonitor(list: NikoMonitor[], label: string | null): NikoMonitor | undefined {
  return list.find((m) => m.rotulo === label);
}

export function dockActiveMonitor(selection: string, mine: NikoMonitor | undefined, list: NikoMonitor[], label: string | null): boolean {
  if (list.length < 2) return mine ? mine.principal : label === null || label === "dock";
  if (!mine) return false;
  if (selection === ALL_THE_MONITORS) return true;
  if (list.some((m) => m.nome === selection)) return mine.nome === selection;
  return mine.principal;
}

export function eachDockShowsTheirApps(selection: string, list: NikoMonitor[]): boolean {
  return list.length >= 2 && selection === ALL_THE_MONITORS;
}
