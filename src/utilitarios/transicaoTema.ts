interface TransicaoAtiva {
  transicao?: ViewTransition;
  animacao?: Animation;
}

let ativa: TransicaoAtiva | null = null;

export function circuloDoTema(origem: Element | null, largura: number, altura: number) {
  const caixa = origem?.getBoundingClientRect();
  const x = Math.max(0, Math.min(largura, caixa ? caixa.left + caixa.width / 2 : largura / 2));
  const y = Math.max(0, Math.min(altura, caixa ? caixa.top + caixa.height / 2 : altura / 2));
  const raio = Math.ceil(Math.hypot(Math.max(x, largura - x), Math.max(y, altura - y)));
  return { x, y, raio };
}

export function animarTrocaDeTema(origem: Element | null, atualizar: () => void, animar = true) {
  ativa?.animacao?.cancel();
  ativa?.transicao?.skipTransition();
  const atual: TransicaoAtiva = {};
  ativa = atual;
  const raiz = document.documentElement;
  const consulta = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const aplicar = () => {
    if (ativa === atual) atualizar();
  };
  const interromper = () => {
    atual.animacao?.cancel();
    atual.transicao?.skipTransition();
  };
  const aoMudarVisibilidade = () => {
    if (document.visibilityState === "hidden") interromper();
  };
  const aoReduzirMovimento = (evento: MediaQueryListEvent) => {
    if (evento.matches) interromper();
  };
  const limpar = () => {
    window.removeEventListener("resize", interromper);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    consulta?.removeEventListener("change", aoReduzirMovimento);
    if (ativa !== atual) return;
    delete raiz.dataset.transicaoTema;
    ativa = null;
  };

  if (!animar || consulta?.matches || raiz.dataset.reduzirAnimacoes === "sim"
    || document.visibilityState === "hidden" || !document.startViewTransition || !raiz.animate) {
    aplicar();
    limpar();
    return;
  }

  const { x, y, raio } = circuloDoTema(origem, window.innerWidth, window.innerHeight);
  raiz.dataset.transicaoTema = "sim";
  try {
    const transicao = document.startViewTransition(aplicar);
    atual.transicao = transicao;
    window.addEventListener("resize", interromper);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    consulta?.addEventListener("change", aoReduzirMovimento);
    void transicao.ready.then(() => {
      if (ativa !== atual) return;
      atual.animacao = raiz.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
        { duration: 1000, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both", pseudoElement: "::view-transition-new(root)" },
      );
    }).catch(interromper);
    void transicao.finished.then(limpar, limpar);
  } catch {
    aplicar();
    limpar();
  }
}
