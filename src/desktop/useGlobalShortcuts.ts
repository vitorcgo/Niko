import { useEffect } from "react";
import { create } from "zustand";
import { useConfig } from "../state/settings";
import { usePomodoro } from "../state/pomodoro";
import { useMedia } from "../state/media";
import { useIsland } from "../state/island";
import { playSound } from "../bridge/sounds";
import { claudeCode } from "../bridge/claudeCode";
import { sessionActive, useClaudeCode } from "../state/claudeCode";
import { T } from "../i18n/ptBR";
import { ACTIONS_GLOBAL, type ActionGlobal, type StatusShortcut } from "../utils/shortcuts";
import { NATIVE, setShortcutsGlobal, listenShortcut } from "./desktop";

export const useStatusShortcuts = create<{ situacoes: Partial<Record<ActionGlobal, StatusShortcut>> }>(() => ({ situacoes: {} }));

function executeSystem(action: string) {
  const cfg = useConfig.getState();
  if (action === "pomodoro") {
    usePomodoro.getState().toggle();
    void playSound("blip");
  } else if (action === "midia") useMedia.getState().toggle();
  else if (action === "privacidade") cfg.set({ privacidade: !cfg.privacidade });
  else if (action === "naoPerturbe") cfg.set({ naoPerturbe: !cfg.naoPerturbe });
}

let pausados = false;

export async function synchronizeShortcutsGlobal() {
  if (!NATIVE || pausados) return;
  const shortcuts = useConfig.getState().atalhosGlobais;
  const result = await setShortcutsGlobal(ACTIONS_GLOBAL.map((action) => ({ acao: action, teclas: shortcuts[action] ?? "" })));
  if (!result || pausados) return;
  useStatusShortcuts.setState({ situacoes: Object.fromEntries(result.map((r) => [r.acao, r.situacao])) as Partial<Record<ActionGlobal, StatusShortcut>> });
}

export async function pausarShortcutsGlobal(pausar: boolean) {
  if (!NATIVE) return;
  pausados = pausar;
  if (pausar) await setShortcutsGlobal([]);
  else await synchronizeShortcutsGlobal();
}

export function useGlobalShortcuts() {
  const key = useConfig((s) => JSON.stringify(s.atalhosGlobais));

  useEffect(() => {
    void synchronizeShortcutsGlobal();
  }, [key]);

  useEffect(() => {
    let alive = true;
    let disable: () => void = () => undefined;
    void listenShortcut(executeSystem).then((f) => {
      if (alive) disable = f;
      else f();
    });
    return () => {
      alive = false;
      disable();
    };
  }, []);
}

export function trazerTerminalSession(id?: string) {
  const claude = useClaudeCode.getState();
  const session = id ?? claude.pedidos[0]?.sessao ?? sessionActive(claude)?.id ?? claude.focada ?? claude.ordem[0];
  if (!session) {
    useIsland.getState().notifyFailure(T.ilha.claude.terminal.semSessao);
    return;
  }
  claudeCode.terminal(session).catch((e: Error) => useIsland.getState().notifyFailure(e.message === "sem_processo" ? T.ilha.claude.terminal.semProcesso : T.ilha.claude.terminal.falhou));
}

export function useShortcutsIsland() {
  useEffect(() => {
    let alive = true;
    let disable: () => void = () => undefined;
    void listenShortcut((action) => {
      if (action === "pedido") useIsland.getState().open("claude");
      if (action === "terminal") trazerTerminalSession();
    }).then((f) => {
      if (alive) disable = f;
      else f();
    });
    return () => {
      alive = false;
      disable();
    };
  }, []);
}
