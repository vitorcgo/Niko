import { useInterface } from "../../../state/interface";
import { useIsland } from "../../../state/island";

export function openSettingsClaude() {
  useInterface.getState().navigateTo("configuracoes", { secao: "claude" });
  useIsland.getState().collapse();
}
