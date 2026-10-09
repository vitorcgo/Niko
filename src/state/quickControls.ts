import { useEffect } from "react";
import { create } from "zustand";
import { control, system, type TargetAudio, type StateAudio, type StateSystem, type ItemTray } from "../bridge/localBridge";

interface StateControlQuick {
  audio: StateAudio | null;
  audioIndisponivel: boolean;
  rede: StateSystem | null;
  temaEscuro: boolean | null;
  bandeja: ItemTray[];
  bandejaLida: boolean;
  synchronizeAudio: () => Promise<void>;
  synchronizeNetwork: () => Promise<void>;
  setVolume: (target: TargetAudio, volume: number) => void;
  toggleMute: (target: TargetAudio) => void;
  adjustApp: (pids: number[], adjustment: { volume?: number; mudo?: boolean }) => void;
  readTheme: () => Promise<void>;
  toggleTheme: () => Promise<void>;
  readTray: () => Promise<void>;
}

const BREAK_APOS_CHANGE_MS = 1500;
let lastChange = 0;
let readingNetwork = false;
const lastRequest = new Map<string, () => Promise<unknown>>();
const atProgress = new Set<string>();

function sendAtSequence(key: string, request: () => Promise<unknown>) {
  lastChange = Date.now();
  lastRequest.set(key, request);
  if (atProgress.has(key)) return;
  const next = async () => {
    const current = lastRequest.get(key);
    if (!current) {
      atProgress.delete(key);
      return;
    }
    lastRequest.delete(key);
    atProgress.add(key);
    await current().catch(() => undefined);
    await next();
  };
  void next();
}

export const useControlQuick = create<StateControlQuick>()((set, get) => ({
  audio: null,
  audioIndisponivel: false,
  rede: null,
  temaEscuro: null,
  bandeja: [],
  bandejaLida: false,
  synchronizeAudio: async () => {
    try {
      const audio = await control.audio();
      if (Date.now() - lastChange < BREAK_APOS_CHANGE_MS) return;
      set({ audio, audioIndisponivel: false });
    } catch {
      set({ audioIndisponivel: true });
    }
  },
  synchronizeNetwork: async () => {
    if (readingNetwork) return;
    readingNetwork = true;
    try {
      set({ rede: await system.estado() });
    } catch {
      return;
    } finally {
      readingNetwork = false;
    }
  },
  setVolume: (target, volume) => {
    const audio = get().audio;
    const level = audio?.[target];
    if (!audio || !level) return;
    set({ audio: { ...audio, [target]: { volume, mudo: volume === 0 ? level.mudo : false } } });
    sendAtSequence(`volume-${target}`, async () => {
      await control.volume(target, volume);
      if (level.mudo && volume > 0) await control.mudo(target, false);
    });
  },
  toggleMute: (target) => {
    const audio = get().audio;
    const level = audio?.[target];
    if (!audio || !level) return;
    const mute = !level.mudo;
    set({ audio: { ...audio, [target]: { ...level, mudo: mute } } });
    sendAtSequence(`mudo-${target}`, () => control.mudo(target, mute));
  },
  adjustApp: (pids, adjustment) => {
    const audio = get().audio;
    if (!audio || pids.length === 0) return;
    set({ audio: { ...audio, sessoes: audio.sessoes.map((s) => (pids.includes(s.pid) ? { ...s, ...adjustment } : s)) } });
    sendAtSequence(`app-${pids.join(",")}-${adjustment.volume !== undefined ? "volume" : "mudo"}`, () => control.sessao(pids, adjustment));
  },
  readTheme: async () => {
    try {
      set({ temaEscuro: (await control.tema()).escuro });
    } catch {
      set({ temaEscuro: null });
    }
  },
  toggleTheme: async () => {
    const current = get().temaEscuro;
    if (current === null) return;
    set({ temaEscuro: !current });
    try {
      set({ temaEscuro: (await control.definirTema(!current)).escuro });
    } catch {
      set({ temaEscuro: current });
    }
  },
  readTray: async () => {
    try {
      set({ bandeja: await control.bandeja(), bandejaLida: true });
    } catch {
      set({ bandejaLida: true });
    }
  },
}));

function useRecurrence(action: () => Promise<void>, active: boolean, intervalMs: number) {
  useEffect(() => {
    if (!active) return;
    void action();
    const t = window.setInterval(() => !document.hidden && void action(), intervalMs);
    return () => window.clearInterval(t);
  }, [action, active, intervalMs]);
}

export function useAudio(active: boolean, intervalMs: number) {
  useRecurrence(useControlQuick((s) => s.synchronizeAudio), active, intervalMs);
}

export function useNetwork(active: boolean, intervalMs: number) {
  useRecurrence(useControlQuick((s) => s.synchronizeNetwork), active, intervalMs);
}

export function useTray(active: boolean, intervalMs: number) {
  useRecurrence(useControlQuick((s) => s.readTray), active, intervalMs);
}

export function groupSessions(sessions: StateAudio["sessoes"]) {
  const groups = new Map<string, StateAudio["sessoes"]>();
  for (const s of sessions) {
    const key = s.sistema ? "sistema" : (s.caminho ?? `pid-${s.pid}`);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].map(([key, list]) => ({
    chave: key,
    pids: [...new Set(list.map((s) => s.pid))],
    nome: list[0].nome,
    icone: list[0].icone,
    sistema: list[0].sistema,
    ativa: list.some((s) => s.ativa),
    volume: Math.max(...list.map((s) => s.volume)),
    mudo: list.every((s) => s.mudo),
  }));
}
