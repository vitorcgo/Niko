import type { TabIsland, SectionToday } from "../../../state/settings";
import { useIsland } from "../../../state/island";

export function toggleTabBar(tab: TabIsland, section?: SectionToday) {
  const island = useIsland.getState();
  const sameSection = !section || island.secaoHoje === section;
  if (section) island.setSectionToday(section);
  if (island.estado === "expandida" && island.aba === tab && sameSection) island.collapse();
  else island.open(tab);
}

export function tabNeighbor(tabs: TabIsland[], current: TabIsland, step: 1 | -1): TabIsland | undefined {
  if (tabs.length === 0) return undefined;
  const index = tabs.indexOf(current);
  if (index < 0) return tabs[0];
  return tabs[Math.min(tabs.length - 1, Math.max(0, index + step))];
}

export function createToggleStart(read: () => Promise<{ aberto: boolean }>, execute: (openBefore?: boolean) => Promise<unknown>) {
  let readResult: Promise<boolean | undefined> | null = null;
  let busy = false;
  let preparing = false;
  return {
    preparar() {
      if (busy || preparing) return;
      preparing = true;
      readResult = read().then((r) => r.aberto).catch(() => undefined).finally(() => { preparing = false; });
    },
    limpar() {
      readResult = null;
    },
    async alternar() {
      if (busy) return;
      busy = true;
      const previous = readResult;
      readResult = null;
      try {
        const openBefore = await (previous ?? read().then((r) => r.aberto).catch(() => undefined));
        const result = await execute(openBefore);
        if (result && typeof result === "object" && "aberto" in result && typeof result.aberto === "boolean") readResult = Promise.resolve(result.aberto);
      } finally {
        busy = false;
      }
    },
  };
}
