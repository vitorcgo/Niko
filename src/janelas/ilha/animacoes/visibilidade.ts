export function movimentoDaVisibilidade(oculta: boolean, reduzirAnimacoes: boolean) {
  return {
    animate: { opacity: oculta ? 0 : 1, y: oculta && !reduzirAnimacoes ? -12 : 0 },
    transition: { duration: reduzirAnimacoes ? 0.1 : 0.34, ease: [0.45, 0, 0.2, 1] as [number, number, number, number] },
  };
}
