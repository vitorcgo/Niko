import { create } from "zustand";
import { whatsappPonte, type EstadoWhatsapp } from "../ponte/whatsapp";

interface EstadoDoWhatsappNaInterface {
  estado: EstadoWhatsapp | null;
  pedidoEm: number;
  falhou: boolean;
  carregar: () => Promise<EstadoWhatsapp | null>;
  definir: (estado: EstadoWhatsapp) => void;
}

export const useWhatsapp = create<EstadoDoWhatsappNaInterface>()((set, get) => ({
  estado: null,
  pedidoEm: 0,
  falhou: false,
  carregar: async () => {
    const inicio = Date.now();
    try {
      const estado = await whatsappPonte.estado();
      if (inicio < get().pedidoEm) return get().estado;
      set({ estado, pedidoEm: inicio, falhou: false });
      return estado;
    } catch {
      set({ falhou: true });
      return null;
    }
  },
  definir: (estado) => set({ estado, pedidoEm: Date.now(), falhou: false }),
}));
