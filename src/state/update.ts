import { create } from "zustand";
import { NATIVE, prepareUpdate } from "../desktop/desktop";
import { saveNow } from "../bridge/storage";
import { playSound } from "../bridge/sounds";
import { T } from "../i18n/ptBR";
import { versionMaisNew } from "../utils/versions";
import manifesto from "../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";

type Phase = "nada" | "disponivel" | "baixando" | "instalando" | "erro";
type Check = "nada" | "verificando" | "atualizado" | "sem_versoes" | "disponivel" | "erro";

interface StateUpdate {
  fase: Phase;
  verificacao: Check;
  versaoAtual: string;
  ultimaVerificacao: string;
  automatica: boolean;
  versao: string;
  notas: string;
  progresso: number;
  erro: string;
  loadVersion: () => Promise<void>;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

let pending: Update | null = null;

export const useUpdate = create<StateUpdate>()((set, get) => ({
  fase: "nada",
  verificacao: "nada",
  versaoAtual: manifesto.version,
  ultimaVerificacao: "",
  automatica: false,
  versao: "",
  notas: "",
  progresso: 0,
  erro: "",
  loadVersion: async () => {
    if (!NATIVE) return;
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      set({ versaoAtual: await getVersion() });
    } catch {
      set({ versaoAtual: "", erro: T.atualizacao.versaoFalhou });
    }
  },
  check: async (manual = false) => {
    if ((!NATIVE && !manual) || get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    set({ verificacao: "verificando", erro: "" });
    try {
      await get().loadVersion();
      if (!get().versaoAtual) throw new Error("versao_indisponivel");
      const response = await fetch("/ponte/atualizacao", { headers: { "x-niko": "1" }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const payload = await response.json() as { versao: string | null; notas: string };
      if (payload.versao !== null && typeof payload.versao !== "string") throw new Error("versao_invalida");
      const previous = pending;
      pending = null;
      await previous?.close().catch(() => undefined);
      const lastCheck = new Date().toISOString();
      if (!payload.versao || !versionMaisNew(payload.versao, get().versaoAtual)) {
        set({ fase: "nada", verificacao: payload.versao ? "atualizado" : "sem_versoes", automatica: false, versao: payload.versao ?? "", notas: payload.notas, ultimaVerificacao: lastCheck });
        return;
      }
      if (NATIVE) {
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          pending = await check({ timeout: 15000 });
        } catch {
          pending = null;
        }
      }
      if (pending && get().fase !== "disponivel") void playSound("peek", "avisos");
      set({ fase: pending ? "disponivel" : "nada", verificacao: "disponivel", automatica: Boolean(pending), versao: pending?.version ?? payload.versao, notas: pending?.body ?? payload.notas, ultimaVerificacao: lastCheck });
    } catch {
      set({ verificacao: "erro", erro: get().versaoAtual ? T.atualizacao.erroVerificacao : T.atualizacao.versaoFalhou });
    }
  },
  install: async () => {
    if (!pending || get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    set({ fase: "baixando", progresso: 0, erro: "" });
    let total = 0;
    let downloaded = 0;
    let bridgeStopped = false;
    try {
      await pending.download((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") {
          downloaded += e.data?.chunkLength ?? 0;
          set({ progresso: total > 0 ? Math.min(0.99, downloaded / total) : 0.5 });
        }
        if (e.event === "Finished") set({ fase: "instalando", progresso: 1 });
      });
      set({ fase: "instalando", progresso: 1 });
      void playSound("approve", "avisos");
      await saveNow().catch(() => undefined);
      await prepareUpdate();
      bridgeStopped = true;
      await pending.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      if (bridgeStopped) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch().catch(() => undefined);
        return;
      }
      set({ fase: "erro", erro: T.atualizacao.erroInstalacao });
      void playSound("error", "avisos");
    }
  },
  dismiss: () => set({ fase: "nada" }),
}));
