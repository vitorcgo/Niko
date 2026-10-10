import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

globalThis.BroadcastChannel = undefined;

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());
const { normalizarCalendarioGithub, montarGradeGithub, resumirContribuicoesGithub } = await vite.ssrLoadModule("/src/utilitarios/contribuicoesGithub.ts");
const { lerContribuicoesGithub } = await vite.ssrLoadModule("/servidor/github.ts");
const { ContribuicoesGithub } = await vite.ssrLoadModule("/src/modulos/conexoes/ContribuicoesGithub.tsx");

const dia = (data, quantidade = 0, nivel = "NONE") => ({ date: data, contributionCount: quantidade, contributionLevel: nivel });
const resposta = (dias, total = 0) => ({ data: { viewer: { contributionsCollection: { contributionCalendar: { totalContributions: total, weeks: [{ contributionDays: dias }] } } } } });

test("calendário do GitHub preserva zeros, total oficial e níveis, sem converter a data pelo fuso", () => {
  const calendario = normalizarCalendarioGithub(resposta([dia("2026-10-10", 8, "FOURTH_QUARTILE"), dia("2026-10-09")], 8));
  assert.equal(calendario.total, 8);
  assert.deepEqual(calendario.dias, [{ data: "2026-10-09", quantidade: 0, nivel: 0 }, { data: "2026-10-10", quantidade: 8, nivel: 4 }]);
  const grade = montarGradeGithub(calendario);
  assert.equal(grade.celulas[5].data, "2026-10-09");
  assert.equal(grade.celulas[6].data, "2026-10-10");
});

test("calendário rejeita erro GraphQL, formato inválido, dias repetidos, lacunas e valores inválidos", () => {
  for (const r of [
    { errors: [{ message: "Sem permissão" }] },
    { ...resposta([dia("2026-10-10")]), errors: [{}] },
    resposta([]), resposta([dia("2026-02-30")]), resposta([dia("2026-10-10", -1)]),
    resposta([dia("2026-10-10", 1.5)]), resposta([dia("2026-10-10", 1, "INVENTADO")]),
    resposta([dia("2026-10-10"), dia("2026-10-10")]),
    resposta([dia("2026-10-08"), dia("2026-10-10")]), resposta([dia("2026-10-10")], -1),
  ]) assert.throws(() => normalizarCalendarioGithub(r));
});

test("consulta oficial pede total, dias e níveis, e falha sem inventar eventos de push", async () => {
  const calendario = await lerContribuicoesGithub({ authorization: "Bearer simulado" }, async (url, cabecalhos, corpo) => {
    assert.equal(url, "https://api.github.com/graphql");
    assert.equal(cabecalhos.authorization, "Bearer simulado");
    assert.match(corpo.query, /totalContributions/);
    assert.match(corpo.query, /contributionLevel/);
    assert.doesNotMatch(corpo.query, /mutation/);
    return resposta([dia("2026-10-10")]);
  });
  assert.equal(calendario.total, 0);
  await assert.rejects(lerContribuicoesGithub({}, async () => { throw new Error("http_403"); }), /http_403/);
});

test("resumo soma só os últimos sete dias e calcula dias ativos e melhor dia", () => {
  const dias = Array.from({ length: 10 }, (_, i) => dia(`2026-10-${String(i + 1).padStart(2, "0")}`, i === 0 ? 20 : i === 9 ? 3 : 0, i === 0 ? "FOURTH_QUARTILE" : i === 9 ? "FIRST_QUARTILE" : "NONE"));
  const resumo = resumirContribuicoesGithub(normalizarCalendarioGithub(resposta(dias, 23)));
  assert.equal(resumo.ultimos7dias, 3);
  assert.equal(resumo.diasAtivos, 2);
  assert.equal(resumo.melhorDia.quantidade, 20);
});

test("ano bissexto mantém todas as datas e a grade cabe em no máximo 54 semanas", () => {
  const dias = Array.from({ length: 366 }, (_, i) => dia(new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10)));
  const calendario = normalizarCalendarioGithub(resposta(dias));
  assert.ok(calendario.dias.some((d) => d.data === "2024-02-29"));
  const grade = montarGradeGithub(calendario);
  assert.ok(grade.semanas <= 54);
  assert.equal(grade.celulas.filter(Boolean).length, 366);
});

test("painel e ilha mostram a mesma grade, com datas acessíveis e estado indisponível", () => {
  const calendario = normalizarCalendarioGithub(resposta([dia("2026-10-09"), dia("2026-10-10", 3, "SECOND_QUARTILE")], 3));
  for (const compacto of [false, true]) {
    const html = renderToStaticMarkup(createElement(ContribuicoesGithub, { calendario, compacto }));
    assert.match(html, /3 contribuições no último ano/);
    assert.match(html, /data-nivel="2"/);
    assert.match(html, /data-nivel="0"/);
    assert.match(html, /10\/10\/2026: 3 contribuições/);
    assert.match(html, /github-contribuicoes-rolagem/);
    assert.doesNotMatch(html, /Commits/);
  }
  const html = renderToStaticMarkup(createElement(ContribuicoesGithub, {}));
  assert.match(html, /Não foi possível carregar/);
  assert.doesNotMatch(html, /0 contribuições no último ano/);
  for (const caminho of ["../src/modulos/conexoes/JanelaConexao.tsx", "../src/janelas/ilha/ConexaoNaIlha.tsx"])
    assert.match(readFileSync(new URL(caminho, import.meta.url), "utf8"), /<ContribuicoesGithub/);
});

test("modo de privacidade não renderiza valores, datas nem dicas das contribuições", async () => {
  const { useConfig } = await vite.ssrLoadModule("/src/estado/configuracoes.ts");
  const inicial = useConfig.getInitialState();
  const anterior = inicial.privacidade;
  inicial.privacidade = true;
  try {
    const calendario = normalizarCalendarioGithub(resposta([dia("2026-10-10", 777, "FOURTH_QUARTILE")], 777));
    const html = renderToStaticMarkup(createElement(ContribuicoesGithub, { calendario }));
    assert.match(html, /ocultas pelo modo de privacidade/);
    assert.doesNotMatch(html, /777|2026-10-10|10\/10\/2026|title=/);
  } finally {
    inicial.privacidade = anterior;
  }
});

test("falha de contribuições não derruba repositórios e PRs nem fabrica um histórico por pushes", async () => {
  const fonte = stripTypeScriptTypes(readFileSync(new URL("../servidor/conexoes.ts", import.meta.url), "utf8"));
  const inicio = fonte.indexOf("  github: async");
  const fim = fonte.indexOf("\n  vercel: async", inicio);
  const consultadas = [];
  const contexto = vm.createContext({
    lerContribuicoesGithub: async () => { throw new Error("Sem acesso ao GraphQL"); },
    pedir: async (url) => {
      consultadas.push(url);
      if (url.endsWith("/user")) return { login: "teste" };
      if (url.includes("/user/repos")) return [{ name: "niko", full_name: "teste/niko", language: "TypeScript", stargazers_count: 1, updated_at: "2026-10-10", private: false }];
      if (url.includes("/search/issues")) return { items: [] };
      if (url.includes("/actions/runs")) return { workflow_runs: [] };
      throw new Error(`Consulta inesperada: ${url}`);
    },
    LIMITE_DE_PRS_DETALHADOS: 6,
  });
  vm.runInContext(`globalThis.ler = ${fonte.slice(inicio, fim).trim().replace(/^github: /, "").replace(/,$/, "")};`, contexto);
  const dados = await contexto.ler("simulado");
  assert.equal(dados.contribuicoes, null);
  assert.equal(dados.repositorios.length, 1);
  assert.equal(Object.keys(dados.commitsPorDia).length, 0);
  assert.ok(!consultadas.some((url) => url.includes("/events")));
});
