import type { MonitorDoNiko } from "../../desktop/desktop";

export const TODOS_OS_MONITORES = "todos";

export function meuMonitor(lista: MonitorDoNiko[], rotulo: string | null): MonitorDoNiko | undefined {
  return lista.find((m) => m.rotulo === rotulo);
}

export function dockAtivoNoMonitor(escolha: string, meu: MonitorDoNiko | undefined, lista: MonitorDoNiko[], rotulo: string | null): boolean {
  if (lista.length < 2) return meu ? meu.principal : rotulo === null || rotulo === "dock";
  if (!meu) return false;
  if (escolha === TODOS_OS_MONITORES) return true;
  if (lista.some((m) => m.nome === escolha)) return meu.nome === escolha;
  return meu.principal;
}

export function cadaDockMostraSeusApps(escolha: string, lista: MonitorDoNiko[], appsDeTodosOsMonitores = false): boolean {
  return lista.length >= 2 && escolha === TODOS_OS_MONITORES && !appsDeTodosOsMonitores;
}
