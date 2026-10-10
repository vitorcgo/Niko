import test, { after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const opcoes = { configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } };
const vite = await criarServidorDeTeste(opcoes);
after(() => vite.close());
const { LimiteDeErro } = await vite.ssrLoadModule("/src/componentes/LimiteDeErro.tsx");

test("servidores de teste usam caches distintos e nunca sobrescrevem o cache do localhost", async () => {
  const arquivos = [".vite", ".vite-niko"].map((nome) => new URL(`../node_modules/${nome}/deps/_metadata.json`, import.meta.url));
  const anteriores = arquivos.map((arquivo) => existsSync(arquivo) ? readFileSync(arquivo) : null);
  const isolado = await criarServidorDeTeste({ ...opcoes, cacheDir: vite.config.cacheDir });
  const caminho = isolado.config.cacheDir;
  try {
    assert.notEqual(caminho, vite.config.cacheDir);
    assert.match(caminho.replaceAll("\\", "/"), /\/node_modules\/\.vite-testes\/[^/]+$/);
    await isolado.ssrLoadModule("/src/utilitarios/contribuicoesGithub.ts");
  } finally {
    await isolado.close();
  }
  assert.equal(existsSync(caminho), false);
  assert.deepEqual(arquivos.map((arquivo) => existsSync(arquivo) ? readFileSync(arquivo) : null), anteriores);
});

test("barreira mantém o conteúdo enquanto não há erro", () => {
  const conteudo = createElement("p", null, "Página funcionando");
  assert.equal(new LimiteDeErro({ children: conteudo }).render(), conteudo);
});

function comFalha(props = {}) {
  const limite = new LimiteDeErro({ children: createElement("p", null, "Conteúdo que falhou"), ...props });
  limite.state = LimiteDeErro.getDerivedStateFromError(new Error("mensagem com dados privados"));
  return limite;
}

test("falha geral apresenta recuperação sem expor detalhes do erro nem recarregar automaticamente", () => {
  const html = renderToStaticMarkup(comFalha().render());
  assert.match(html, /role="alert"/);
  assert.match(html, /Não foi possível exibir o Niko/);
  assert.match(html, /Recarregar o Niko/);
  assert.match(html, /ainda não salvas podem ser perdidas/);
  assert.doesNotMatch(html, /dados privados|Conteúdo que falhou|Voltar ao início/);
});

test("falha de página oferece retorno ao início e mantém a navegação fora da barreira", () => {
  let voltou = false;
  const limite = comFalha({ aoVoltar: () => { voltou = true; } });
  const arvore = limite.render();
  const html = renderToStaticMarkup(arvore);
  assert.match(html, /Não foi possível abrir esta página/);
  assert.match(html, /Voltar ao início/);
  arvore.props.children[3].props.children[0].props.onClick();
  assert.equal(voltou, true);
  const janela = readFileSync(new URL("../src/janelas/sistema/JanelaSistema.tsx", import.meta.url), "utf8");
  assert.match(janela, /<BarraLateral[^]*<LimiteDeErro key=\{rota\}[^]*<Suspense[^]*<Pagina[^]*<\/LimiteDeErro>/);
  const principal = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(principal, /<LimiteDeErro>\s*<Raiz\s*\/>\s*<\/LimiteDeErro>/);
});

test("todos os testes com Vite passam pelo isolamento de cache", () => {
  for (const nome of ["validacoes", "escritorio", "personalizacao-agentes", "github", "configuracao-vite", "ilha"]) {
    const codigo = readFileSync(new URL(`./${nome}.test.mjs`, import.meta.url), "utf8");
    assert.match(codigo, /from "\.\/vite-para-testes\.mjs"/);
    assert.doesNotMatch(codigo, /import\s*\{[^}]*createServer[^}]*\}\s*from "vite"/);
  }
});

function coresDoBloco(arquivo, seletor) {
  const css = readFileSync(new URL(arquivo, import.meta.url), "utf8");
  const inicio = css.indexOf(`${seletor} {`);
  assert.ok(inicio >= 0, seletor);
  const bloco = css.slice(inicio, css.indexOf("}", inicio));
  return Object.fromEntries([...bloco.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminancia(cor) {
  const canais = cor.slice(1).match(/../g).map((canal) => parseInt(canal, 16) / 255);
  const [r, g, b] = canais.map((canal) => canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

test("tema claro mantém textos secundários legíveis sobre fundos suaves em todas as paletas", () => {
  const arquivo = "../src/estilos/estilo-sistema.css";
  const claro = coresDoBloco(arquivo, '[data-tema="claro"] .estilo-sistema');
  const fundos = [claro["--p-f"], claro["--p-s"]];
  for (const paleta of ["areia", "grafite", "floresta", "oceano"]) {
    const cores = coresDoBloco(arquivo, `[data-tema="claro"][data-paleta="${paleta}"] .estilo-sistema`);
    fundos.push(cores["--p-f"], cores["--p-s"]);
  }
  for (const token of ["--texto", "--texto-corpo", "--texto-2", "--texto-3", "--texto-4"]) {
    for (const fundo of fundos) {
      const contraste = (luminancia(fundo) + 0.05) / (luminancia(claro[token]) + 0.05);
      assert.ok(contraste >= 4.5, `${token} sobre ${fundo}: ${contraste}`);
    }
  }
  assert.notEqual(claro["--p-s"], "#ffffff");
  assert.equal(claro["--borda"], "color-mix(in srgb, var(--p-f), #000 18%)");
  assert.equal(claro["--borda-controle"], "color-mix(in srgb, var(--p-f), #000 22%)");
});

test("ajustes do calendário claro preservam as cores base do tema escuro", () => {
  const escuro = coresDoBloco("../src/estilos/estilo-sistema.css", '[data-tema="escuro"] .estilo-sistema');
  assert.equal(escuro["--p-f"], "#0e0e10");
  assert.equal(escuro["--p-s"], "#161618");
  assert.equal(escuro["--texto"], "#f2efe9");
  assert.equal(escuro["--texto-3"], "#6f6d69");
  const css = readFileSync(new URL("../src/estilos/telas/calendario.css", import.meta.url), "utf8");
  assert.match(css, /\[data-tema="claro"\] \.estilo-sistema \.cl-mes\s*\{\s*background: var\(--borda\)/);
  assert.match(css, /\[data-tema="claro"\] \.estilo-sistema \.cl-dia\[data-fora="sim"\] \.cl-dia-numero\s*\{\s*color: var\(--texto-4\)/);
});
