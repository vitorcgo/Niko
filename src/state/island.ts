import { create } from "zustand";
import type { AgentId } from "../types";
import type { BrandId } from "../brands/Brand";
import { useConfig, type CategoryNotice, type SectionToday, type ViewIsland } from "./settings";

export type IslandMode = "escondida" | "compacta" | "expandida";

export function stateWithNotice(state: IslandMode, hasNotice: boolean): IslandMode {
  return hasNotice && state === "escondida" ? "compacta" : state;
}

export interface Reveal {
  texto: string;
  tipo: "sucesso" | "info" | "alerta";
  marca?: BrandId;
  agente?: AgentId;
  aba?: ViewIsland;
  categoria?: CategoryNotice;
}

const CATEGORY_TAB: Partial<Record<ViewIsland, CategoryNotice>> = { claude: "codigo", conexoes: "conexoes" };

export function noticeEnabled(category: CategoryNotice | null | undefined): boolean {
  return !category || !(useConfig.getState().avisosDesligados ?? []).includes(category);
}

interface Pending {
  r: Reveal;
  ms: number;
}

interface IslandState {
  estado: IslandMode;
  aba: ViewIsland;
  secaoHoje: SectionToday;
  saudacao: { id: number; versaoNova?: string } | null;
  revelacao: Reveal | null;
  ultimaInteracao: number;
  setState: (state: IslandMode) => void;
  open: (tab?: ViewIsland) => void;
  setSectionToday: (section: SectionToday) => void;
  greet: (versionNew?: string) => void;
  stopGreeting: () => void;
  collapse: () => void;
  revelar: (r: Reveal, ms?: number, importance?: "alta" | "normal") => boolean;
  dismissReveal: () => void;
  notifyFailure: (text: string) => void;
  play: () => void;
}

let timer: number | undefined;
let lastNormal = 0;
const queue: Pending[] = [];
const INTERVAL_NORMAL = 90000;

export const useIsland = create<IslandState>()((set, get) => {
  const show = (p: Pending) => {
    window.clearTimeout(timer);
    set({ revelacao: p.r, ultimaInteracao: Date.now() });
    timer = window.setTimeout(() => {
      const next = queue.shift();
      if (next) show(next);
      else set({ revelacao: null, ultimaInteracao: Date.now() });
    }, p.ms);
  };

  return {
    estado: "compacta",
    aba: "hoje",
    secaoHoje: "agenda",
    saudacao: null,
    revelacao: null,
    ultimaInteracao: Date.now(),
    setState: (state) => set({ estado: state, ultimaInteracao: Date.now() }),
    open: (tab) => set({ estado: "expandida", aba: tab ?? get().aba, ultimaInteracao: Date.now() }),
    setSectionToday: (sectionToday) => set({ secaoHoje: sectionToday, ultimaInteracao: Date.now() }),
    greet: (versionNew) => set({ saudacao: { id: Date.now(), versaoNova: versionNew }, estado: "compacta", ultimaInteracao: Date.now() }),
    stopGreeting: () => set({ saudacao: null, ultimaInteracao: Date.now() }),
    collapse: () => set({ estado: "compacta", ultimaInteracao: Date.now() }),
    revelar: (r, ms = 4500, importance = "alta") => {
      const { ilha: island, naoPerturbe: notDisturb } = useConfig.getState();
      const preference = island.notificacoes;
      if (preference === "nenhuma") return false;
      if (notDisturb && r.aba !== "foco") return false;
      if (!noticeEnabled(r.categoria ?? (r.aba ? CATEGORY_TAB[r.aba] : undefined))) return false;
      if (importance === "normal") {
        if (preference !== "todas") return false;
        if (Date.now() - lastNormal < INTERVAL_NORMAL) return false;
        lastNormal = Date.now();
      }
      const pending = { r, ms };
      if (get().revelacao) {
        if (queue.length >= 3 || queue.some((f) => f.r.texto === r.texto)) return false;
        queue.push(pending);
        return true;
      }
      show(pending);
      return true;
    },
    dismissReveal: () => {
      window.clearTimeout(timer);
      const next = queue.shift();
      if (next) show(next);
      else set({ revelacao: null });
    },
    notifyFailure: (text) => show({ r: { texto: text, tipo: "alerta" }, ms: 4500 }),
    play: () => set({ ultimaInteracao: Date.now() }),
  };
});
