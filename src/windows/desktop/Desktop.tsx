import { AnimatePresence } from "motion/react";
import { Island } from "../island/Island";
import { Dock } from "../dock/Dock";
import { AssistiveTouch } from "../assistive/AssistiveTouch";
import { SystemWindow } from "../system/SystemWindow";
import { ConnectionWindow } from "../../features/connections/ConnectionWindow";
import { GlobalSearch } from "../../features/search/GlobalSearch";
import { QuickCapture } from "../../features/search/QuickCapture";
import { FirstRun } from "../../features/settings/FirstRun";
import { useInterface } from "../../state/interface";
import { useConfig } from "../../state/settings";
import { useTheme } from "./useTheme";
import { useShortcuts } from "./useShortcuts";
import { useServices } from "../../services/services";

export function Desktop() {
  useTheme();
  useShortcuts();
  useServices();
  const isOpen = useInterface((s) => s.sistemaAberto);
  const minimized = useInterface((s) => s.sistemaMinimizado);
  const windows = useInterface((s) => s.janelasConexao);
  const first = useConfig((s) => s.primeiraExecucaoFeita);

  return (
    <div className="area-trabalho">
      <AnimatePresence>{isOpen && !minimized && <SystemWindow key="sistema" />}</AnimatePresence>
      <AnimatePresence>
        {windows.filter((j) => !j.minimizada).map((j) => (
          <ConnectionWindow key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <Island />
      <Dock />
      <AssistiveTouch />
      <GlobalSearch />
      <QuickCapture />
      {!first && <FirstRun />}
    </div>
  );
}
