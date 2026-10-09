import { useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { Island } from "../windows/island/Island";
import { Dock } from "../windows/dock/Dock";
import { AssistiveTouch } from "../windows/assistive/AssistiveTouch";
import { SystemWindow } from "../windows/system/SystemWindow";
import { ConnectionWindow } from "../features/connections/ConnectionWindow";
import { GlobalSearch } from "../features/search/GlobalSearch";
import { QuickCapture } from "../features/search/QuickCapture";
import { FirstRun } from "../features/settings/FirstRun";
import { useInterface } from "../state/interface";
import { useConfig } from "../state/settings";
import { useTheme } from "../windows/desktop/useTheme";
import { useShortcuts } from "../windows/desktop/useShortcuts";
import { useServices } from "../services/services";
import { useWindowPreferences } from "../services/useWindowPreferences";
import { setMonitorIsland, windowCurrent, listenCommands, listenEvent, synchronizeStartWithWindows } from "./desktop";
import { useSynchronization } from "./synchronization";
import { useShortcutsIsland, useGlobalShortcuts } from "./useGlobalShortcuts";

export function AppSystem() {
  useTheme();
  useWindowPreferences();
  useShortcuts();
  useGlobalShortcuts();
  useSynchronization();
  const windows = useInterface((s) => s.janelasConexao);
  const first = useConfig((s) => s.primeiraExecucaoFeita);
  const startWithWindows = useConfig((s) => s.iniciarComWindows);

  useEffect(() => {
    void synchronizeStartWithWindows(startWithWindows);
  }, [startWithWindows]);

  useEffect(
    () =>
      listenCommands((c) => {
        const ui = useInterface.getState();
        if (c.tipo === "irPara") ui.goToLocal(c.rota, c.parametros);
        if (c.tipo === "abrirConexao") ui.openWindowConnectionLocal(c.id);
        if (c.tipo === "abrirBusca") ui.openSearch(true);
        if (c.tipo === "abrirCaptura") ui.openCapture(true);
      }),
    [],
  );

  useEffect(() => {
    let disable = () => undefined as void;
    void listenEvent("niko://captura", () => useInterface.getState().openCapture(true)).then((f) => (disable = f));
    return () => disable();
  }, []);

  return (
    <div className="area-trabalho area-nativa">
      <SystemWindow />
      <AnimatePresence>
        {windows.filter((j) => !j.minimizada).map((j) => (
          <ConnectionWindow key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <GlobalSearch />
      <QuickCapture />
      {!first && <FirstRun />}
    </div>
  );
}

function useShowOnMount() {
  useEffect(() => {
    const t = window.setTimeout(() => void windowCurrent().then((j) => j.show()), 120);
    return () => window.clearTimeout(t);
  }, []);
}

function useMonitorIsland() {
  const monitor = useConfig((s) => s.ilha.monitor);
  useEffect(() => {
    void setMonitorIsland(monitor);
  }, [monitor]);
}

export function AppIsland() {
  useShowOnMount();
  useMonitorIsland();
  useTheme();
  useSynchronization();
  useShortcutsIsland();
  useServices();
  return (
    <div className="area-sobreposta">
      <Island />
    </div>
  );
}

export function AppDock() {
  useShowOnMount();
  useTheme();
  useWindowPreferences();
  useSynchronization();
  return (
    <div className="area-sobreposta">
      <Dock />
    </div>
  );
}

export function AppAssistive() {
  useTheme();
  useSynchronization();
  const active = useConfig((s) => s.assistive.ativo);
  useEffect(() => {
    let alive = true;
    void windowCurrent().then((j) => { if (alive) return active ? j.show() : j.hide(); }).catch(() => undefined);
    return () => { alive = false; };
  }, [active]);
  return <div className="area-sobreposta"><AssistiveTouch /></div>;
}
