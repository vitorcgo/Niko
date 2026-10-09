import { useEffect, useState } from "react";
import { useConfig } from "../../estado/configuracoes";
import { comAlfa, contraste, hexValido, textoSobre } from "../../utilitarios/cores";

export const DESTAQUE_PADRAO = { claro: "#7c5ce0", escuro: "#a78bfa" };
export const DESTAQUE_SISTEMA = "#ff3b47";

function textoSobreBotao(cor: string) {
  return contraste(cor, "#ffffff") >= 2.4 ? "#ffffff" : "#111111";
}

export function usarTema() {
  const tema = useConfig((s) => s.tema);
  const paleta = useConfig((s) => s.paleta);
  const destaque = useConfig((s) => s.destaque);
  const escala = useConfig((s) => s.escala);
  const reduzir = useConfig((s) => s.reduzirAnimacoes);
  const privacidade = useConfig((s) => s.privacidade);
  const [sistemaEscuro, setSistemaEscuro] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);

  useEffect(() => {
    const consulta = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!consulta) return;
    const aoMudar = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  useEffect(() => {
    const efetivo = tema === "sistema" ? (sistemaEscuro ? "escuro" : "claro") : tema;
    const raiz = document.documentElement;
    raiz.dataset.tema = efetivo;
    raiz.dataset.paleta = paleta;
    raiz.style.setProperty("--fundo-do-tema", getComputedStyle(raiz).getPropertyValue("--fundo"));
    raiz.dataset.reduzirAnimacoes = reduzir ? "sim" : "nao";
    raiz.dataset.privacidade = privacidade ? "sim" : "nao";
    const escolhida = destaque && hexValido(destaque) ? destaque : null;
    const cor = escolhida ?? DESTAQUE_PADRAO[efetivo];
    const corDoSistema = escolhida ?? DESTAQUE_SISTEMA;
    raiz.style.setProperty("--destaque", cor);
    raiz.style.setProperty("--destaque-texto", textoSobre(cor));
    raiz.style.setProperty("--destaque-suave", comAlfa(cor, efetivo === "escuro" ? 0.18 : 0.12));
    raiz.style.setProperty("--foco", comAlfa(cor, 0.32));
    raiz.style.setProperty("--destaque-sistema", corDoSistema);
    raiz.style.setProperty("--destaque-sistema-sobre", textoSobreBotao(corDoSistema));
    raiz.style.setProperty("--escala", String(escala));
  }, [tema, paleta, destaque, escala, reduzir, privacidade, sistemaEscuro]);
}
