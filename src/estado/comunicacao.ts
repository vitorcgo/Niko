import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import type { AgenteId, Conexao, Conversa, EventoConexao, Memoria, Mensagem, ServicoId, UsoIa } from "../tipos";
import { gerarId } from "../utilitarios/basicos";
import { conexaoEmTestes } from "../utilitarios/disponibilidadeConexoes";

export const SERVICOS: ServicoId[] = ["stripe", "github", "vercel", "google", "supabase", "cloudflare", "resend", "notion", "calcom", "n8n"];

export const CATEGORIA_SERVICO: Record<ServicoId, "pagamentos" | "codigo" | "deploy" | "produtividade"> = {
  stripe: "pagamentos",
  github: "codigo",
  vercel: "deploy",
  resend: "produtividade",
  notion: "produtividade",
  calcom: "produtividade",
  n8n: "deploy",
  google: "produtividade",
  supabase: "codigo",
  cloudflare: "deploy",
};

export const INTERVALO_PADRAO: Record<ServicoId, number> = {
  stripe: 60,
  github: 300,
  vercel: 60,
  resend: 120,
  notion: 300,
  calcom: 300,
  n8n: 60,
  google: 120,
  supabase: 300,
  cloudflare: 300,
};

function conexaoInicial(id: ServicoId): Conexao {
  return { id, ligada: false, chaveSalva: false, intervalo: INTERVALO_PADRAO[id], status: conexaoEmTestes(id) ? "pausado" : "sem_chave", resumo: "", fixadaNaIlha: false };
}

function conexaoDisponivel(conexao: Conexao): Conexao {
  return conexaoEmTestes(conexao.id) ? { ...conexao, ligada: false, fixadaNaIlha: false, status: "pausado" } : conexao;
}

export interface DadosComunicacao {
  conversas: Conversa[];
  memoria: Memoria[];
  conexoes: Conexao[];
  eventosConexao: EventoConexao[];
  usoIa: UsoIa[];
}

interface EstadoComunicacao extends DadosComunicacao {
  criarConversa: (agenteId: AgenteId) => Conversa;
  adicionarMensagem: (conversaId: string, mensagem: Omit<Mensagem, "id" | "criadaEm">) => Mensagem;
  atualizarMensagem: (conversaId: string, mensagemId: string, parcial: Partial<Mensagem>) => void;
  trocarAgente: (conversaId: string, agenteId: AgenteId) => void;
  excluirConversa: (id: string) => Conversa | undefined;
  restaurarConversa: (c: Conversa) => void;
  limparConversas: () => void;
  lembrar: (texto: string, agenteId: AgenteId, origem: Memoria["origem"]) => void;
  esquecer: (id: string) => void;
  atualizarConexao: (id: ServicoId, parcial: Partial<Conexao>) => void;
  registrarEventoConexao: (evento: Omit<EventoConexao, "id" | "data">) => void;
  marcarFalhasVistas: (id: ServicoId) => void;
  definirUsoIa: (uso: UsoIa[]) => void;
  substituir: (dados: Partial<DadosComunicacao>) => void;
}

export const useComunicacao = create<EstadoComunicacao>()(
  persist(
    (set) => ({
      conversas: [],
      memoria: [],
      conexoes: SERVICOS.map(conexaoInicial),
      eventosConexao: [],
      usoIa: [],
      criarConversa: (agenteId) => {
        const agora = new Date().toISOString();
        const conversa: Conversa = { id: gerarId(), titulo: "", agenteId, criadaEm: agora, atualizadaEm: agora, mensagens: [] };
        set((s) => ({ conversas: [conversa, ...s.conversas] }));
        return conversa;
      },
      adicionarMensagem: (conversaId, dados) => {
        const mensagem: Mensagem = { ...dados, texto: dados.texto.slice(0, 8000), id: gerarId(), criadaEm: new Date().toISOString() };
        set((s) => ({
          conversas: s.conversas.map((c) =>
            c.id === conversaId
              ? {
                  ...c,
                  titulo: c.titulo || (dados.autor === "usuario" ? dados.texto.slice(0, 48) : c.titulo),
                  atualizadaEm: mensagem.criadaEm,
                  mensagens: [...c.mensagens, mensagem],
                }
              : c,
          ),
        }));
        return mensagem;
      },
      atualizarMensagem: (conversaId, mensagemId, parcial) =>
        set((s) => ({
          conversas: s.conversas.map((c) =>
            c.id === conversaId ? { ...c, mensagens: c.mensagens.map((m) => (m.id === mensagemId ? { ...m, ...parcial } : m)) } : c,
          ),
        })),
      trocarAgente: (conversaId, agenteId) => set((s) => ({ conversas: s.conversas.map((c) => (c.id === conversaId ? { ...c, agenteId } : c)) })),
      excluirConversa: (id) => {
        let removida: Conversa | undefined;
        set((s) => {
          removida = s.conversas.find((c) => c.id === id);
          return { conversas: s.conversas.filter((c) => c.id !== id) };
        });
        return removida;
      },
      restaurarConversa: (c) => set((s) => ({ conversas: [c, ...s.conversas] })),
      limparConversas: () => set({ conversas: [] }),
      lembrar: (texto, agenteId, origem) =>
        set((s) => ({ memoria: [...s.memoria, { id: gerarId(), texto: texto.trim().slice(0, 300), agenteId, origem, data: new Date().toISOString() }] })),
      esquecer: (id) => set((s) => ({ memoria: s.memoria.filter((m) => m.id !== id) })),
      atualizarConexao: (id, parcial) => set((s) => ({ conexoes: s.conexoes.map((c) => (c.id === id ? conexaoDisponivel({ ...c, ...parcial }) : c)) })),
      marcarFalhasVistas: (id) => set((s) => ({ conexoes: s.conexoes.map((c) => (c.id === id ? { ...c, falhasVistasEm: new Date().toISOString() } : c)) })),
      registrarEventoConexao: (evento) =>
        set((s) => ({ eventosConexao: [{ ...evento, id: gerarId(), data: new Date().toISOString() }, ...s.eventosConexao].slice(0, 200) })),
      definirUsoIa: (usoIa) => set({ usoIa }),
      substituir: (dados) => set({ ...dados, ...(dados.conexoes ? { conexoes: dados.conexoes.map(conexaoDisponivel) } : {}) }),
    }),
    {
      name: chave("comunicacao"),
      storage: armazenamento,
      merge: (persistido, atual) => {
        const salvo = (persistido ?? {}) as Partial<DadosComunicacao>;
        const conexoes = SERVICOS.map((id) => conexaoDisponivel({ ...conexaoInicial(id), ...salvo.conexoes?.find((c) => c.id === id) }));
        const eventosConexao = (salvo.eventosConexao ?? atual.eventosConexao).filter((e) => SERVICOS.includes(e.servico));
        return { ...atual, ...salvo, conexoes, eventosConexao };
      },
    },
  ),
);

export function falhasNaoVistas(conexao: Conexao, eventos: EventoConexao[]): number {
  const desde = conexao.falhasVistasEm ? Date.parse(conexao.falhasVistasEm) : 0;
  return eventos.filter((e) => e.servico === conexao.id && e.tipo === "falha" && Date.parse(e.data) > desde).length;
}
