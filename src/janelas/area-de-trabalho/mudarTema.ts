import { flushSync } from "react-dom";
import { useConfig, type Tema } from "../../estado/configuracoes";
import { animarTrocaDeTema } from "../../utilitarios/transicaoTema";

export function mudarTema(tema: Tema, origem: Element | null) {
  const cfg = useConfig.getState();
  const efetivo = tema === "sistema"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro")
    : tema;
  animarTrocaDeTema(origem, () => {
    flushSync(() => useConfig.getState().definir({ tema }));
  }, !cfg.reduzirAnimacoes && efetivo !== document.documentElement.dataset.tema);
}
