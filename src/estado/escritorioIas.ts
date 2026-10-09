import { create } from "zustand";
import { persist } from "zustand/middleware";
import { armazenamento, chave } from "../ponte/armazenamento";
import { CONFIG_ESCRITORIO, configuracaoEscritorioValida, type ConfiguracaoEscritorio } from "../modulos/escritorio/configuracaoDoEscritorio";
import { corteDasAnalisesValido, registroDoEscritorio, registrosValidos, type RegistroEscritorio } from "../modulos/escritorio/dadosDoEscritorio";
import type { EventoClaude } from "../ponte/claudeCode";

interface EstadoEscritorio {
  config: ConfiguracaoEscritorio; registros: RegistroEscritorio[]; ignorarAte: number;
  definir: (config: Partial<ConfiguracaoEscritorio>) => void; registrar: (evento: EventoClaude) => void; limpar: () => void; descarregar: () => void;
}
const fila = new Map<string, RegistroEscritorio>();
let temporizador: ReturnType<typeof setTimeout> | undefined;
const limparFila = () => { clearTimeout(temporizador); temporizador = undefined; fila.clear(); };
export const useEscritorioIas = create<EstadoEscritorio>()(persist((set, get) => ({
  config: CONFIG_ESCRITORIO, registros: [], ignorarAte: 0,
  definir: (config) => set({ config: configuracaoEscritorioValida({ ...get().config, ...config }) }),
  registrar: (evento) => {
    const registro = registroDoEscritorio(evento);
    if (!registro || registro.em <= get().ignorarAte || !get().config.guardarAnalises) return;
    fila.set(registro.id, registro);
    if (fila.size > 5000) fila.delete(fila.keys().next().value!);
    if (useEscritorioIas.persist.hasHydrated() && !temporizador) temporizador = setTimeout(() => get().descarregar(), 100);
  },
  descarregar: () => {
    if (!useEscritorioIas.persist.hasHydrated()) return;
    const novos = [...fila.values()].filter((r) => r.em > get().ignorarAte);
    limparFila();
    if (!get().config.guardarAnalises || !novos.length) return;
    const ids = new Set(get().registros.map((r) => r.id));
    const unicos = novos.filter((r) => !ids.has(r.id));
    if (unicos.length) set({ registros: registrosValidos([...get().registros, ...unicos]) });
  },
  limpar: () => { limparFila(); set({ registros: [], ignorarAte: Date.now() }); },
}), {
  name: chave("escritorio-ias"), storage: armazenamento,
  partialize: (s) => ({ config: s.config, registros: s.registros, ignorarAte: s.ignorarAte }),
  merge: (salvo, atual) => {
    const r = salvo && typeof salvo === "object" ? salvo as Partial<EstadoEscritorio> : {};
    const ignorarAte = corteDasAnalisesValido(r.ignorarAte);
    return { ...atual, config: configuracaoEscritorioValida(r.config), registros: registrosValidos(r.registros).filter((r) => r.em > ignorarAte), ignorarAte };
  },
}));
useEscritorioIas.persist.onFinishHydration(() => useEscritorioIas.getState().descarregar());
