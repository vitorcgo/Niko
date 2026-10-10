import { create } from "zustand";
import { NATIVO, prepararAtualizacao } from "../desktop/desktop";
import { salvarAgora } from "../ponte/armazenamento";
import { tocarSom } from "../ponte/sons";
import { T } from "../textos/textos";
import { versaoMaisNova } from "../utilitarios/versoes";
import manifesto from "../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";

type Fase = "nada" | "disponivel" | "baixando" | "instalando" | "erro";
type Verificacao = "nada" | "verificando" | "atualizado" | "sem_versoes" | "disponivel" | "erro";

interface EstadoAtualizacao {
  fase: Fase;
  verificacao: Verificacao;
  versaoAtual: string;
  ultimaVerificacao: string;
  automatica: boolean;
  versao: string;
  notas: string;
  progresso: number;
  erro: string;
  carregarVersao: () => Promise<void>;
  verificar: (manual?: boolean) => Promise<void>;
  instalar: () => Promise<void>;
  dispensar: () => void;
}

let pendente: Update | null = null;

export const useAtualizacao = create<EstadoAtualizacao>()((set, get) => ({
  fase: "nada",
  verificacao: "nada",
  versaoAtual: manifesto.version,
  ultimaVerificacao: "",
  automatica: false,
  versao: "",
  notas: "",
  progresso: 0,
  erro: "",
  carregarVersao: async () => {
    if (!NATIVO) return;
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      set({ versaoAtual: await getVersion() });
    } catch {
      set({ versaoAtual: "", erro: T.atualizacao.versaoFalhou });
    }
  },
  verificar: async (manual = false) => {
    if ((!NATIVO && !manual) || get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    set({ verificacao: "verificando", erro: "" });
    try {
      await get().carregarVersao();
      if (!get().versaoAtual) throw new Error("versao_indisponivel");
      const resposta = await fetch("/ponte/atualizacao", { headers: { "x-niko": "1" }, signal: AbortSignal.timeout(20000) });
      if (!resposta.ok) throw new Error(`http_${resposta.status}`);
      const dados = await resposta.json() as { versao: string | null; notas: string };
      if (dados.versao !== null && typeof dados.versao !== "string") throw new Error("versao_invalida");
      const anterior = pendente;
      pendente = null;
      await anterior?.close().catch(() => undefined);
      const ultimaVerificacao = new Date().toISOString();
      if (!dados.versao || !versaoMaisNova(dados.versao, get().versaoAtual)) {
        set({ fase: "nada", verificacao: dados.versao ? "atualizado" : "sem_versoes", automatica: false, versao: dados.versao ?? "", notas: dados.notas, ultimaVerificacao });
        return;
      }
      if (NATIVO) {
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          pendente = await check({ timeout: 15000 });
        } catch {
          pendente = null;
        }
      }
      if (pendente && get().fase !== "disponivel") void tocarSom("peek", "avisos");
      set({ fase: pendente ? "disponivel" : "nada", verificacao: "disponivel", automatica: Boolean(pendente), versao: pendente?.version ?? dados.versao, notas: pendente?.body ?? dados.notas, ultimaVerificacao });
    } catch {
      set({ verificacao: "erro", erro: get().versaoAtual ? T.atualizacao.erroVerificacao : T.atualizacao.versaoFalhou });
    }
  },
  instalar: async () => {
    if (!pendente || get().verificacao === "verificando" || get().fase === "baixando" || get().fase === "instalando") return;
    set({ fase: "baixando", progresso: 0, erro: "" });
    let total = 0;
    let baixado = 0;
    let ponteParada = false;
    try {
      await pendente.download((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") {
          baixado += e.data?.chunkLength ?? 0;
          set({ progresso: total > 0 ? Math.min(0.99, baixado / total) : 0.5 });
        }
        if (e.event === "Finished") set({ fase: "instalando", progresso: 1 });
      });
      set({ fase: "instalando", progresso: 1 });
      void tocarSom("approve", "avisos");
      await salvarAgora();
      await prepararAtualizacao();
      ponteParada = true;
      await pendente.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {
      if (ponteParada) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch().catch(() => undefined);
        return;
      }
      set({ fase: "erro", erro: T.atualizacao.erroInstalacao });
      void tocarSom("error", "avisos");
    }
  },
  dispensar: () => set({ fase: "nada" }),
}));
