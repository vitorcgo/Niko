export interface ConfiguracaoEscritorio {
  ciclo: "auto" | "day" | "night"; estilo: "niko" | "original"; seguir: boolean;
  esconderDetalhes: boolean; guardarAnalises: boolean; nomes: Record<string, string>; salas: Record<string, string>;
}
export const CONFIG_ESCRITORIO: ConfiguracaoEscritorio = {
  ciclo: "auto", estilo: "niko", seguir: false, esconderDetalhes: false, guardarAnalises: true, nomes: {}, salas: {},
};
export function configuracaoEscritorioValida(bruto: unknown): ConfiguracaoEscritorio {
  const r = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto as Partial<ConfiguracaoEscritorio> : {};
  const nomes = (valor: unknown) => Object.fromEntries(Object.entries(valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {})
    .filter(([id, nome]) => id.length <= 200 && !["__proto__", "constructor", "prototype"].includes(id) && typeof nome === "string" && nome.trim().length > 0 && nome.length <= 40)
    .slice(-100).map(([id, nome]) => [id, String(nome).trim()]));
  return {
    ciclo: ["auto", "day", "night"].includes(r.ciclo ?? "") ? r.ciclo! : "auto",
    estilo: r.estilo === "original" ? "original" : "niko",
    seguir: r.seguir === true, esconderDetalhes: r.esconderDetalhes === true, guardarAnalises: r.guardarAnalises !== false,
    nomes: nomes(r.nomes), salas: nomes(r.salas),
  };
}
