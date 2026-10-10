import type { Configuracoes } from "../estado/configuracoes";
import { exigir, objeto } from "./validacoes";
import { validarAssistive } from "../janelas/assistive/regras";
import type { AgenteId } from "../tipos";
import { aparenciaValida, personaValida, textoDeIdentidade } from "../personagens/personalizacao";
import { acessoriosValidos, corAcessorioValida } from "../personagens/acessorios";

function conformePadrao(valor: unknown, padrao: unknown): unknown {
  if (padrao === null) return valor === null || typeof valor === "string" || objeto(valor) ? valor : null;
  if (Array.isArray(padrao)) {
    if (!Array.isArray(valor)) return padrao;
    const modelo = padrao[0];
    if (modelo === undefined) return valor.filter((v) => typeof v === "string");
    return valor.filter((v) => typeof v === typeof modelo && (typeof modelo !== "object" || objeto(v))).map((v) => conformePadrao(v, modelo));
  }
  if (objeto(padrao)) {
    const fonte = objeto(valor) ? valor : {};
    if (!Object.keys(padrao).length) return Object.fromEntries(Object.entries(fonte).filter(([k, v]) => !["__proto__", "constructor", "prototype"].includes(k) && typeof v === "string"));
    return Object.fromEntries(Object.entries(padrao).map(([k, v]) => [k, conformePadrao(fonte[k], v)]));
  }
  if (typeof padrao === "number") return typeof valor === "number" && Number.isFinite(valor) ? valor : padrao;
  return typeof valor === typeof padrao ? valor : padrao;
}

export function configuracoesValidas(valor: unknown, padrao: Configuracoes): Configuracoes {
  const c = conformePadrao(valor, padrao) as Configuracoes;
  c.assistive = validarAssistive(objeto(valor) ? valor.assistive : undefined);
  const escolher = <T extends string>(v: T, permitidos: readonly string[], alternativa: T): T => permitidos.includes(v) ? v : alternativa;
  const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  c.tema = escolher(c.tema, ["claro", "escuro", "sistema"], padrao.tema);
  c.paleta = escolher(c.paleta, ["padrao", "areia", "grafite", "floresta", "oceano"], padrao.paleta);
  c.escala = limitar(c.escala, 0.5, 2);
  for (const borda of [c.ilha, c.dock]) {
    borda.modo = escolher(borda.modo, ["fixo", "esconder", "inteligente"], "inteligente");
    borda.opacidade = limitar(borda.opacidade, 0, 1);
  }
  c.ilha.repouso = escolher(c.ilha.repouso, ["nada", "relogio", "midia", "agente"], padrao.ilha.repouso);
  c.ilha.tamanho = escolher(c.ilha.tamanho, ["pequena", "media", "grande"], padrao.ilha.tamanho);
  c.ilha.notificacoes = escolher(c.ilha.notificacoes, ["todas", "importantes", "nenhuma"], padrao.ilha.notificacoes);
  c.ilha.fechamentoSeg = limitar(c.ilha.fechamentoSeg, 0, 300);
  c.ilha.esconderSeg = limitar(c.ilha.esconderSeg, 0, 300);
  c.ilha.ordemAbas = [...new Set(c.ilha.ordemAbas)];
  if (!c.ilha.ordemAbas.includes("time")) {
    const codigo = c.ilha.ordemAbas.indexOf("claude");
    c.ilha.ordemAbas.splice(codigo < 0 ? 1 : codigo, 0, "time");
  }
  c.dock.buscador = escolher(c.dock.buscador, ["google", "duckduckgo", "bing"], padrao.dock.buscador);
  const rotas = [...padrao.barraLateral.map((r) => r.rota), "configuracoes"];
  const barra = objeto(valor) && Array.isArray(valor.barraLateral) ? valor.barraLateral : padrao.barraLateral;
  const vistas = new Set<string>();
  c.barraLateral = barra.flatMap((item) => {
    if (!objeto(item) || typeof item.rota !== "string" || !rotas.includes(item.rota) || vistas.has(item.rota)) return [];
    vistas.add(item.rota);
    return [{ rota: item.rota as Configuracoes["barraLateral"][number]["rota"], visivel: typeof item.visivel === "boolean" ? item.visivel : true, ...(typeof item.nome === "string" ? { nome: item.nome } : {}) }];
  });
  c.dock.favoritos = [...new Set(c.dock.favoritos.filter((r) => rotas.includes(r)))];
  const bruto = objeto(valor) && objeto(valor.dock) ? valor.dock.atalhos : [];
  c.dock.atalhos = Array.isArray(bruto) ? bruto.filter((a) => objeto(a) && typeof a.id === "string" && typeof a.nome === "string" && typeof a.url === "string").slice(0, 100) as Configuracoes["dock"]["atalhos"] : [];
  c.agentes.favorito = escolher(c.agentes.favorito, Object.keys(padrao.agentes.nomes), padrao.agentes.favorito);
  c.agentes.inatividadeMin = limitar(c.agentes.inatividadeMin, 1, 1440);
  for (const agente of Object.keys(padrao.agentes.nomes) as AgenteId[]) {
    c.agentes.nomes[agente] = textoDeIdentidade(c.agentes.nomes[agente], padrao.agentes.nomes[agente], 20);
    c.agentes.cargos[agente] = textoDeIdentidade(c.agentes.cargos[agente], padrao.agentes.cargos[agente], 32);
    c.agentes.aparencias[agente] = aparenciaValida(c.agentes.aparencias[agente], agente);
    c.agentes.acessorios[agente] = acessoriosValidos(c.agentes.acessorios[agente]);
    c.agentes.coresAcessorios[agente] = corAcessorioValida(c.agentes.coresAcessorios[agente]);
    c.agentes.personas[agente] = personaValida(c.agentes.personas[agente]);
  }
  for (const k of ["foco", "curta", "longa"] as const) c.pomodoro[k] = Math.round(limitar(c.pomodoro[k], 1, 1440));
  c.pomodoro.ciclos = Math.round(limitar(c.pomodoro.ciclos, 1, 100));
  c.agua.meta = limitar(c.agua.meta, 1, 100000);
  c.agua.copo = limitar(c.agua.copo, 1, 10000);
  c.sons.volume = limitar(c.sons.volume, 0, 1);
  for (const k of ["precoEntrada", "precoSaida", "limiteMensal"] as const) c.consumo[k] = limitar(c.consumo[k], 0, Number.MAX_SAFE_INTEGER);
  c.foto = typeof c.foto === "string" ? c.foto : null;
  c.destaque = typeof c.destaque === "string" && /^#[a-f\d]{6}$/i.test(c.destaque) ? c.destaque : null;
  c.ia.provedorId = typeof c.ia.provedorId === "string" ? c.ia.provedorId : null;
  c.ultimaSaudacao = objeto(c.ultimaSaudacao) && typeof c.ultimaSaudacao.dia === "string" && typeof c.ultimaSaudacao.versao === "string" ? c.ultimaSaudacao as Configuracoes["ultimaSaudacao"] : null;
  return c;
}

export function validarFormatoConfiguracoes(valor: unknown, padrao: unknown, campo = "") {
  if (valor === undefined) return;
  if (padrao === null) {
    if (campo === "ultimaSaudacao") exigir(valor === null || (objeto(valor) && typeof valor.dia === "string" && typeof valor.versao === "string"));
    else exigir(valor === null || typeof valor === "string");
  } else if (Array.isArray(padrao)) {
    exigir(Array.isArray(valor));
    for (const item of valor) {
      if (campo === "apps") exigir(objeto(item) && typeof item.id === "string" && typeof item.nome === "string");
      else if (campo === "atalhos") exigir(objeto(item) && typeof item.id === "string" && typeof item.nome === "string" && typeof item.url === "string");
      else validarFormatoConfiguracoes(item, padrao[0] ?? "", campo);
    }
  } else if (objeto(padrao)) {
    exigir(objeto(valor));
    if (Object.keys(padrao).length === 0) exigir(Object.values(valor).every((v) => typeof v === "string"));
    else for (const [k, v] of Object.entries(padrao)) validarFormatoConfiguracoes(valor[k], v, k);
  } else exigir(typeof valor === typeof padrao && (typeof valor !== "number" || Number.isFinite(valor)));
}
