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
