import { useEffect } from "react";
import { useConfig } from "../state/settings";
import { useAgents } from "../state/agents";
import { useAchievements } from "../state/achievements";
import { useCommunication } from "../state/communication";
import { useRoutine } from "../state/routine";
import { useFinances } from "../state/finances";
import { usePomodoro } from "../state/pomodoro";
import { useStudies } from "../state/studies";
import { useOrganization } from "../state/organization";
import { onChangeOutside, key } from "../bridge/storage";

const STORES: Record<string, { persist: { rehydrate: () => Promise<void> | void } }> = {
  [key("configuracoes")]: useConfig,
  [key("agentes")]: useAgents,
  [key("conquistas")]: useAchievements,
  [key("comunicacao")]: useCommunication,
  [key("rotina")]: useRoutine,
  [key("financas")]: useFinances,
  [key("pomodoro")]: usePomodoro,
  [key("estudos")]: useStudies,
  [key("organizacao")]: useOrganization,
};

export function useSynchronization() {
  useEffect(
    () =>
      onChangeOutside((nameValue) => {
        const store = STORES[nameValue];
        if (store) void store.persist.rehydrate();
      }),
    [],
  );
}
