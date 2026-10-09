import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import { acumular, HISTORY_EMPTY, type EventCode, type HistoryCode } from "../utils/weeklySummary";

const RECORDED_EVENTS = new Set(["Stop", "StopFailure", "SessionEnd"]);
const MAX_WRITE_INTERVAL_MS = 60_000;

interface StateHistoryCode {
  historico: HistoryCode;
  esconderProjetos: boolean;
  ultimoResumoVisto: string | null;
  register: (e: EventCode) => void;
  set: (partial: Partial<Pick<StateHistoryCode, "esconderProjetos" | "ultimoResumoVisto">>) => void;
  clear: () => void;
}

let pending: HistoryCode | null = null;
let gravadoAt = 0;
let clock: ReturnType<typeof setTimeout> | null = null;
const WRITE_PENDING_AT_MS = 15_000;

function writePending() {
  if (clock) clearTimeout(clock);
  clock = null;
  if (!pending) return;
  gravadoAt = Date.now();
  const historyValue = pending;
  pending = null;
  useCodeHistory.setState({ historico: historyValue });
}
const beforeLoad: EventCode[] = [];
const LIMIT_BEFORE_LOAD = 500;

export const useCodeHistory = create<StateHistoryCode>()(
  persist(
    (set, get) => ({
      historico: HISTORY_EMPTY,
      esconderProjetos: false,
      ultimoResumoVisto: null,
      register: (e) => {
        if (!useCodeHistory.persist.hasHydrated()) {
          if (beforeLoad.length < LIMIT_BEFORE_LOAD) beforeLoad.push(e);
          return;
        }
        const base = pending ?? get().historico;
        const next = acumular(base, e);
        if (next === base) return;
        pending = next;
        if (RECORDED_EVENTS.has(e.evento) || Date.now() - gravadoAt > MAX_WRITE_INTERVAL_MS) writePending();
        else if (!clock) clock = setTimeout(writePending, WRITE_PENDING_AT_MS);
      },
      set: (partial) => set(partial),
      clear: () => {
        if (clock) clearTimeout(clock);
        clock = null;
        pending = null;
        set({ historico: HISTORY_EMPTY });
      },
    }),
    { name: key("historico-codigo"), storage: storage, partialize: (s) => ({ historico: s.historico, esconderProjetos: s.esconderProjetos, ultimoResumoVisto: s.ultimoResumoVisto }) },
  ),
);

useCodeHistory.persist.onFinishHydration(() => {
  for (const e of beforeLoad.splice(0)) useCodeHistory.getState().register(e);
});
if (typeof window !== "undefined") window.addEventListener("beforeunload", writePending);

export { writePending as gravarPendente };
