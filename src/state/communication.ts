import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import type { AgentId, Connection, Conversation, EventConnection, Memory, Message, ServiceId, UsageAi } from "../types";
import { generateId } from "../utils/basics";

export const SERVICES: ServiceId[] = ["stripe", "github", "vercel", "gmail", "agenda", "supabase", "cloudflare", "resend", "notion", "calcom", "n8n"];

export const CATEGORY_SERVICE: Record<ServiceId, "pagamentos" | "codigo" | "deploy" | "produtividade"> = {
  stripe: "pagamentos",
  github: "codigo",
  vercel: "deploy",
  resend: "produtividade",
  notion: "produtividade",
  calcom: "produtividade",
  n8n: "deploy",
  gmail: "produtividade",
  agenda: "produtividade",
  supabase: "codigo",
  cloudflare: "deploy",
};

export const INTERVAL_DEFAULT: Record<ServiceId, number> = {
  stripe: 60,
  github: 300,
  vercel: 60,
  resend: 120,
  notion: 300,
  calcom: 300,
  n8n: 60,
  gmail: 120,
  agenda: 60,
  supabase: 300,
  cloudflare: 300,
};

function connectionInitial(id: ServiceId): Connection {
  return { id, ligada: false, chaveSalva: false, intervalo: INTERVAL_DEFAULT[id], status: "sem_chave", resumo: "", fixadaNaIlha: false };
}

export interface DataCommunication {
  conversas: Conversation[];
  memoria: Memory[];
  conexoes: Connection[];
  eventosConexao: EventConnection[];
  usoIa: UsageAi[];
}

interface StateCommunication extends DataCommunication {
  createConversation: (agentId: AgentId) => Conversation;
  addMessage: (conversationId: string, message: Omit<Message, "id" | "criadaEm">) => Message;
  updateMessage: (conversationId: string, messageId: string, partial: Partial<Message>) => void;
  swapAgent: (conversationId: string, agentId: AgentId) => void;
  deleteConversation: (id: string) => Conversation | undefined;
  restoreConversation: (c: Conversation) => void;
  clearConversations: () => void;
  remind: (text: string, agentId: AgentId, originValue: Memory["origem"]) => void;
  forget: (id: string) => void;
  updateConnection: (id: ServiceId, partial: Partial<Connection>) => void;
  registerEventConnection: (eventValue: Omit<EventConnection, "id" | "data">) => void;
  markFailuresViews: (id: ServiceId) => void;
  setUsageAi: (usage: UsageAi[]) => void;
  replace: (payload: Partial<DataCommunication>) => void;
}

export const useCommunication = create<StateCommunication>()(
  persist(
    (set) => ({
      conversas: [],
      memoria: [],
      conexoes: SERVICES.map(connectionInitial),
      eventosConexao: [],
      usoIa: [],
      createConversation: (agentId) => {
        const now = new Date().toISOString();
        const conversation: Conversation = { id: generateId(), titulo: "", agenteId: agentId, criadaEm: now, atualizadaEm: now, mensagens: [] };
        set((s) => ({ conversas: [conversation, ...s.conversas] }));
        return conversation;
      },
      addMessage: (conversationId, payload) => {
        const message: Message = { ...payload, texto: payload.texto.slice(0, 8000), id: generateId(), criadaEm: new Date().toISOString() };
        set((s) => ({
          conversas: s.conversas.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  titulo: c.titulo || (payload.autor === "usuario" ? payload.texto.slice(0, 48) : c.titulo),
                  atualizadaEm: message.criadaEm,
                  mensagens: [...c.mensagens, message],
                }
              : c,
          ),
        }));
        return message;
      },
      updateMessage: (conversationId, messageId, partial) =>
        set((s) => ({
          conversas: s.conversas.map((c) =>
            c.id === conversationId ? { ...c, mensagens: c.mensagens.map((m) => (m.id === messageId ? { ...m, ...partial } : m)) } : c,
          ),
        })),
      swapAgent: (conversationId, agentId) => set((s) => ({ conversas: s.conversas.map((c) => (c.id === conversationId ? { ...c, agenteId: agentId } : c)) })),
      deleteConversation: (id) => {
        let removed: Conversation | undefined;
        set((s) => {
          removed = s.conversas.find((c) => c.id === id);
          return { conversas: s.conversas.filter((c) => c.id !== id) };
        });
        return removed;
      },
      restoreConversation: (c) => set((s) => ({ conversas: [c, ...s.conversas] })),
      clearConversations: () => set({ conversas: [] }),
      remind: (text, agentId, originValue) =>
        set((s) => ({ memoria: [...s.memoria, { id: generateId(), texto: text.trim().slice(0, 300), agenteId: agentId, origem: originValue, data: new Date().toISOString() }] })),
      forget: (id) => set((s) => ({ memoria: s.memoria.filter((m) => m.id !== id) })),
      updateConnection: (id, partial) => set((s) => ({ conexoes: s.conexoes.map((c) => (c.id === id ? { ...c, ...partial } : c)) })),
      markFailuresViews: (id) => set((s) => ({ conexoes: s.conexoes.map((c) => (c.id === id ? { ...c, falhasVistasEm: new Date().toISOString() } : c)) })),
      registerEventConnection: (eventValue) =>
        set((s) => ({ eventosConexao: [{ ...eventValue, id: generateId(), data: new Date().toISOString() }, ...s.eventosConexao].slice(0, 200) })),
      setUsageAi: (usageAi) => set({ usoIa: usageAi }),
      replace: (payload) => set(payload),
    }),
    {
      name: key("comunicacao"),
      storage: storage,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DataCommunication>;
        const connections = SERVICES.map((id) => ({ ...connectionInitial(id), ...saved.conexoes?.find((c) => c.id === id) }));
        return { ...current, ...saved, conexoes: connections };
      },
    },
  ),
);

export function failuresNotViews(connection: Connection, events: EventConnection[]): number {
  const since = connection.falhasVistasEm ? Date.parse(connection.falhasVistasEm) : 0;
  return events.filter((e) => e.servico === connection.id && e.tipo === "falha" && Date.parse(e.data) > since).length;
}