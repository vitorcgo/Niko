import { create } from "zustand";
import type { Route, ServiceId } from "../types";
import { generateId } from "../utils/basics";
import { NATIVE, sendCommand, outsideSystem, showSystem } from "../desktop/desktop";
import { routeEnabled } from "../utils/features";

export interface NoticeFooter {
  id: string;
  texto: string;
  undo?: () => void;
}

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ConnectionWindow {
  id: ServiceId;
  z: number;
  minimizada: boolean;
  maximizada: boolean;
  geometria: Geometry;
}

interface StateInterface {
  janelasConexao: ConnectionWindow[];
  zSistema: number;
  proximoZ: number;
  openWindowConnection: (id: ServiceId) => void;
  openWindowConnectionLocal: (id: ServiceId) => void;
  goToLocal: (route: Route, parameters?: Record<string, string>) => void;
  closeWindowConnection: (id: ServiceId) => void;
  updateWindowConnection: (id: ServiceId, partial: Partial<ConnectionWindow>) => void;
  focusSystem: () => void;
  focusConnection: (id: ServiceId) => void;
  rota: Route;
  historico: Route[];
  parametros: Record<string, string>;
  buscaAberta: boolean;
  capturaAberta: boolean;
  avisos: NoticeFooter[];
  sistemaAberto: boolean;
  sistemaMinimizado: boolean;
  sistemaMaximizado: boolean;
  geometria: Geometry;
  navigateTo: (route: Route, parameters?: Record<string, string>) => void;
  back: () => void;
  openSearch: (isOpen: boolean) => void;
  openCapture: (isOpen: boolean) => void;
  notify: (text: string, undo?: () => void) => void;
  dismissNotice: (id: string) => void;
  setSystem: (partial: Partial<Pick<StateInterface, "sistemaAberto" | "sistemaMinimizado" | "sistemaMaximizado" | "geometria">>) => void;
}

function geometrySalva(): Geometry | null {
  try {
    const rawValue = localStorage.getItem("niko:janela-v2");
    if (!rawValue) return null;
    const g = JSON.parse(rawValue) as Geometry;
    if ([g.x, g.y, g.w, g.h].every((n) => Number.isFinite(n))) return g;
    return null;
  } catch {
    return null;
  }
}

const KEY_SYSTEM_OPEN = "niko:sistema-aberto";

function systemOpenSaved(): boolean {
  if (NATIVE) return true;
  try {
    return localStorage.getItem(KEY_SYSTEM_OPEN) !== "0";
  } catch {
    return true;
  }
}

function saveSystemOpen(isOpen: boolean) {
  if (NATIVE) return;
  try {
    localStorage.setItem(KEY_SYSTEM_OPEN, isOpen ? "1" : "0");
  } catch {
    return;
  }
}

const timers = new Map<string, number>();

export const useInterface = create<StateInterface>()((set, get) => ({
  janelasConexao: [],
  zSistema: 10,
  proximoZ: 11,
  openWindowConnection: (id) => {
    if (outsideSystem()) {
      sendCommand({ tipo: "abrirConexao", id });
      return;
    }
    get().openWindowConnectionLocal(id);
  },
  openWindowConnectionLocal: (id) => {
    const s = get();
    const existing = s.janelasConexao.find((j) => j.id === id);
    if (existing) {
      set({
        janelasConexao: s.janelasConexao.map((j) => (j.id === id ? { ...j, minimizada: false, z: s.proximoZ } : j)),
        proximoZ: s.proximoZ + 1,
      });
      return;
    }
    const offset = s.janelasConexao.length * 28;
    const width = Math.min(880, window.innerWidth - 80);
    const height = Math.min(640, window.innerHeight - 160);
    set({
      janelasConexao: [
        ...s.janelasConexao,
        {
          id,
          z: s.proximoZ,
          minimizada: false,
          maximizada: false,
          geometria: {
            x: Math.max(16, (window.innerWidth - width) / 2 + 60 + offset),
            y: Math.max(56, (window.innerHeight - height) / 2 - 20 + offset),
            w: width,
            h: height,
          },
        },
      ],
      proximoZ: s.proximoZ + 1,
    });
  },
  closeWindowConnection: (id) => set((s) => ({ janelasConexao: s.janelasConexao.filter((j) => j.id !== id) })),
  updateWindowConnection: (id, partial) => set((s) => ({ janelasConexao: s.janelasConexao.map((j) => (j.id === id ? { ...j, ...partial } : j)) })),
  focusSystem: () => {
    const s = get();
    if (s.zSistema === s.proximoZ - 1) return;
    set({ zSistema: s.proximoZ, proximoZ: s.proximoZ + 1 });
  },
  focusConnection: (id) => {
    const s = get();
    const j = s.janelasConexao.find((x) => x.id === id);
    if (!j || j.z === s.proximoZ - 1) return;
    set({ janelasConexao: s.janelasConexao.map((x) => (x.id === id ? { ...x, z: s.proximoZ } : x)), proximoZ: s.proximoZ + 1 });
  },
  rota: "inicio",
  historico: [],
  parametros: {},
  buscaAberta: false,
  capturaAberta: false,
  avisos: [],
  sistemaAberto: systemOpenSaved(),
  sistemaMinimizado: false,
  sistemaMaximizado: false,
  geometria: geometrySalva() ?? { x: 0, y: 0, w: 0, h: 0 },
  navigateTo: (route, parameters = {}) => {
    if (outsideSystem()) {
      sendCommand({ tipo: "irPara", rota: route, parametros: parameters });
      return;
    }
    get().goToLocal(route, parameters);
  },
  goToLocal: (routeRequested, parametersRequests = {}) => {
    if (NATIVE) void showSystem();
    const route = routeEnabled(routeRequested) ? routeRequested : "inicio";
    const parameters = route === routeRequested ? parametersRequests : {};
    const current = get();
    const sameDestination = current.rota === route && JSON.stringify(parameters) === JSON.stringify(current.parametros);
    saveSystemOpen(true);
    set({
      rota: route,
      parametros: { ...parameters },
      historico: sameDestination ? current.historico : [...current.historico.slice(-30), current.rota],
      sistemaAberto: true,
      sistemaMinimizado: false,
      zSistema: current.proximoZ,
      proximoZ: current.proximoZ + 1,
    });
  },
  back: () => {
    const { historico: historyValue } = get();
    if (historyValue.length === 0) return;
    const previous = historyValue[historyValue.length - 1];
    set({ rota: previous, parametros: {}, historico: historyValue.slice(0, -1) });
  },
  openSearch: (isOpen) => {
    if (isOpen && outsideSystem()) {
      sendCommand({ tipo: "abrirBusca" });
      return;
    }
    set({ buscaAberta: isOpen });
  },
  openCapture: (isOpen) => {
    if (isOpen && outsideSystem()) {
      sendCommand({ tipo: "abrirCaptura" });
      return;
    }
    set({ capturaAberta: isOpen });
  },
  notify: (text, undo) => {
    const id = generateId();
    set((s) => ({ avisos: [...s.avisos.slice(-2), { id, texto: text, undo }] }));
    timers.set(id, window.setTimeout(() => get().dismissNotice(id), undo ? 6000 : 3200));
  },
  dismissNotice: (id) => {
    window.clearTimeout(timers.get(id));
    timers.delete(id);
    set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
  },
  setSystem: (partial) => {
    if (outsideSystem()) {
      if (partial.sistemaAberto || partial.sistemaMinimizado === false) void showSystem();
      return;
    }
    set(partial);
    if (partial.sistemaAberto !== undefined) saveSystemOpen(partial.sistemaAberto);
    if (partial.geometria) {
      try {
        localStorage.setItem("niko:janela-v2", JSON.stringify(partial.geometria));
      } catch {
        return;
      }
    }
  },
}));
