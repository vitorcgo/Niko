import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.BroadcastChannel = undefined;
const memoria = new Map();
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout, location: { search: "" } });
globalThis.document = Object.assign(new EventTarget(), { body: {} });
globalThis.fetch = async () => { throw new Error("Sem rede nos testes"); };
const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());
const roupas = await vite.ssrLoadModule("/src/personagens/acessorios.ts");
const { personalizarSvg } = await vite.ssrLoadModule("/src/personagens/artePersonalizada.ts");
const { CONFIG_PADRAO, useConfig, ABAS_ILHA } = await vite.ssrLoadModule("/src/estado/configuracoes.ts");
const { configuracoesValidas } = await vite.ssrLoadModule("/src/utilitarios/configuracoesValidas.ts");
const { salvarPersonalizacao, personalizacaoSalva } = await vite.ssrLoadModule("/src/estado/personalizacaoAgentes.ts");
const { ESTADOS_SVG } = await vite.ssrLoadModule("/src/personagens/cores.ts");
const { primeiroQuadroSvg, encaixeDoAcessorio } = await vite.ssrLoadModule("/src/personagens/desenhosDosAcessorios.ts");
const { PersonalizacaoDoTime } = await vite.ssrLoadModule("/src/modulos/agentes/PersonalizacaoDoTime.tsx");
const agentes = ["organizador", "tutor", "java", "operador"];

test("guarda-roupa rejeita conteúdo arbitrário e acessórios na posição errada", () => {
  assert.deepEqual(roupas.acessoriosValidos({ cabeca: '<script>', rosto: 'coroa', detalhe: {}, costas: 'url(x)' }), roupas.SEM_ACESSORIOS);
  assert.deepEqual(roupas.acessoriosValidos({ cabeca: 'bruxa', rosto: 'oculos', detalhe: 'colar', costas: 'capa', cor: 'javascript:x' }), { ...roupas.SEM_ACESSORIOS, rosto: 'oculos' });
  assert.ok(roupas.ACESSORIOS.length >= 12);
});

test("acessórios salvam e reidratam sem alterar formato, cor, persona ou os outros integrantes", async () => {
  useConfig.getState().definir(CONFIG_PADRAO);
  const antes = structuredClone(useConfig.getState().agentes);
  const acessorios = { ...roupas.SEM_ACESSORIOS, cabeca: 'fone' };
  salvarPersonalizacao('java', { ...personalizacaoSalva('java'), acessorios, corAcessorio: '#ABCDEF' });
  assert.deepEqual(useConfig.getState().agentes.aparencias, antes.aparencias);
  assert.deepEqual(useConfig.getState().agentes.personas, antes.personas);
  assert.deepEqual(useConfig.getState().agentes.acessorios.java, acessorios);
  assert.equal(useConfig.getState().agentes.coresAcessorios.java, '#abcdef');
  assert.deepEqual(useConfig.getState().agentes.acessorios.tutor, antes.acessorios.tutor);
  await useConfig.persist.rehydrate();
  assert.deepEqual(useConfig.getState().agentes.acessorios.java, acessorios);
  assert.equal(useConfig.getState().agentes.coresAcessorios.java, '#abcdef');
  const antiga = structuredClone(antes);
  delete antiga.acessorios;
  delete antiga.coresAcessorios;
  assert.deepEqual(configuracoesValidas({ agentes: antiga }, CONFIG_PADRAO).agentes.acessorios, CONFIG_PADRAO.agentes.acessorios);
});

test("todos os acessórios seguem a matriz de cada quadro nos quatro formatos e oito estados", () => {
  for (const modelo of agentes) for (const estado of ESTADOS_SVG) {
    const original = readFileSync(new URL(`../public/personagens/${modelo}/${estado}.svg`, import.meta.url), 'utf8');
    for (const acessorio of roupas.ACESSORIOS) {
      const vestido = personalizarSvg(original, { formato: modelo, cor: '#123456' }, modelo, { ...roupas.SEM_ACESSORIOS, [acessorio.posicao]: acessorio.id });
      const quadros = original.match(/<use\b[^>]*href="#s0"[^>]*>/g);
      const vestuario = vestido.match(new RegExp(`<use href="#niko-ac-${acessorio.id}" transform="[^"]+"`, 'g'));
      assert.equal(vestuario?.length, quadros.length, `${modelo}/${estado}/${acessorio.id}`);
      if (acessorio.posicao !== 'rosto') quadros.forEach((quadro, i) => assert.ok(vestuario[i].includes(quadro.match(/transform="([^"]+)"/)[1])));
      assert.match(vestido, /viewBox="66 78 380 380"/);
      assert.equal((vestido.match(/<animate\b/g) ?? []).length, (original.match(/<animate\b/g) ?? []).length);
      assert.ok(vestido.includes('#123456'));
      assert.doesNotMatch(vestido, /NaN|undefined/);
    }
  }
});

test("capa fica atrás e óculos depois dos olhos, com definições reutilizadas", () => {
  const original = readFileSync(new URL('../public/personagens/operador/ocioso.svg', import.meta.url), 'utf8');
  const svg = personalizarSvg(original, { formato: 'operador', cor: '#ffffff' }, 'operador', { ...roupas.SEM_ACESSORIOS, costas: 'capa' });
  const quadro = svg.slice(svg.indexOf('<g><animate')).split('<g opacity="0">')[0];
  assert.ok(quadro.indexOf('href="#niko-ac-capa"') < quadro.indexOf('href="#s0"'));
  const oculos = personalizarSvg(original, { formato: 'operador', cor: '#ffffff' }, 'operador', { ...roupas.SEM_ACESSORIOS, rosto: 'oculos' });
  const rosto = oculos.slice(oculos.indexOf('<g><animate')).split('<g opacity="0">')[0];
  assert.ok(rosto.indexOf('href="#niko-ac-oculos"') > rosto.lastIndexOf('<ellipse'));
  assert.equal((svg.match(/id="niko-ac-capa"/g) ?? []).length, 1);
});

test("Time é uma opção da ilha e o mesmo editor oferece guarda-roupa sem IA", () => {
  assert.ok(ABAS_ILHA.includes('time'));
  const ilha = readFileSync(new URL('../src/janelas/ilha/Ilha.tsx', import.meta.url), 'utf8');
  assert.match(ilha, /time: VisaoTime/);
  assert.match(ilha, /time: "agentes"/);
  const html = renderToStaticMarkup(createElement(PersonalizacaoDoTime, { compacto: true }));
  assert.match(html, /Guarda-roupa/);
  assert.match(html, /aria-label="Integrantes do time"/);
  assert.match(html, /guarda-roupa-compacto/);
  assert.doesNotMatch(html, /class="time-integrantes"/);
  assert.equal((html.match(/class="guarda-roupa-peca"/g) ?? []).length, roupas.ACESSORIOS.length + 1);
  const completo = renderToStaticMarkup(createElement(PersonalizacaoDoTime));
  assert.match(completo, /Nome/);
  assert.match(completo, /class="time-integrantes"/);
});

test("a aba Time entra antes de Código nas configurações antigas", () => {
  const antiga = { ilha: { ordemAbas: ['hoje', 'claude', 'conexoes'] } };
  const atual = configuracoesValidas(antiga, CONFIG_PADRAO);
  assert.equal(atual.ilha.ordemAbas.indexOf('time') + 1, atual.ilha.ordemAbas.indexOf('claude'));
});

test("trocar uma peça retira a anterior, inclusive quando está em outra posição", () => {
  const vestido = { ...roupas.SEM_ACESSORIOS, rosto: 'oculos' };
  assert.deepEqual(roupas.vestirAcessorio(vestido, 'coroa'), { ...roupas.SEM_ACESSORIOS, cabeca: 'coroa' });
  assert.deepEqual(roupas.vestirAcessorio(vestido, 'oculos'), roupas.SEM_ACESSORIOS);
});

test("cor do acessório é validada e não recolore o corpo nem permite conteúdo SVG", () => {
  assert.equal(roupas.corAcessorioValida('url(https://x)'), null);
  assert.equal(roupas.corAcessorioValida('#ABC123'), '#abc123');
  for (const item of roupas.ACESSORIOS) {
    const original = readFileSync(new URL('../public/personagens/operador/ocioso.svg', import.meta.url), 'utf8');
    const svg = personalizarSvg(original, { formato: 'operador', cor: '#123456' }, 'operador', { ...roupas.SEM_ACESSORIOS, [item.posicao]: item.id }, '#a1b2c3');
    assert.match(svg, /stop-color="#a1b2c3"/);
    assert.match(svg, /href="#s0"[^>]*fill="#123456"/);
    const parado = primeiroQuadroSvg(svg);
    assert.doesNotMatch(parado, /<animate\b/);
    assert.equal((parado.match(/href="#s0"/g) ?? []).length, 1);
    assert.match(parado, new RegExp(`href="#niko-ac-${item.id}"`));
  }
});

test("prévia não depende de uma URL temporária revogada e catálogo compacto não rola na horizontal", () => {
  const arte = readFileSync(new URL('../src/personagens/artePersonalizada.ts', import.meta.url), 'utf8');
  assert.match(arte, /data:image\/svg\+xml;charset=utf-8/);
  assert.doesNotMatch(arte, /revokeObjectURL|createObjectURL/);
  const estilo = readFileSync(new URL('../src/janelas/ilha/timeNaIlha.css', import.meta.url), 'utf8');
  assert.doesNotMatch(estilo, /overflow-x:\s*auto/);
  assert.match(estilo, /repeat\(auto-fit, minmax/);
  const previa = readFileSync(new URL('../src/modulos/agentes/PreviaGuardaRoupa.tsx', import.meta.url), 'utf8');
  assert.match(previa, /tocarSom\("pop", "personagens"\)/);
  assert.match(previa, /setTimeout/);
  assert.match(previa, /reduzir/);
});

test("guarda-roupa não aplica a textura que produz brilho fora do corpo", () => {
  const previa = readFileSync(new URL('../src/modulos/agentes/PreviaGuardaRoupa.tsx', import.meta.url), 'utf8');
  const catalogo = readFileSync(new URL('../src/modulos/agentes/GuardaRoupa.tsx', import.meta.url), 'utf8');
  assert.match(previa, /textura=\{false\}/);
  assert.match(catalogo, /textura=\{false\}/);
  assert.doesNotMatch(previa, /time-camarim-pedestal/);
  const personagem = readFileSync(new URL('../src/personagens/Personagem.tsx', import.meta.url), 'utf8');
  assert.match(personagem, /textura = true/);
  assert.match(personagem, /textura && visivel && caminhoDaArte/);
});

test("fumaça se dispersa em partículas só durante a troca e respeita movimento reduzido", () => {
  const previa = readFileSync(new URL('../src/modulos/agentes/PreviaGuardaRoupa.tsx', import.meta.url), 'utf8');
  const estilo = readFileSync(new URL('../src/modulos/agentes/agentes.css', import.meta.url), 'utf8');
  assert.match(previa, /fase !== "repouso" && !reduzir/);
  assert.match(previa, /className="time-fumaca-particula"/);
  assert.match(estilo, /transform-origin: 80px 85px/);
  assert.match(estilo, /100% \{ opacity: 0; transform: translate\(var\(--fumaca-x\)/);
  assert.match(estilo, /\.time-camarim-fumaca \{ display: none; \}/);
  assert.doesNotMatch(estilo, /time-camarim-pedestal/);
});

test("peças têm tamanhos próprios sem substituir a ancoragem dos óculos nos olhos", () => {
  for (const modelo of agentes) {
    for (const item of roupas.ACESSORIOS) assert.doesNotMatch(encaixeDoAcessorio(item.id, modelo), /NaN|undefined|Infinity/);
    assert.match(encaixeDoAcessorio('gravata', modelo), /scale\(1\.28\)/);
    assert.match(encaixeDoAcessorio('abobora', modelo), /scale\(1\.30\)/);
    assert.notEqual(encaixeDoAcessorio('capa', modelo), '');
    assert.equal(encaixeDoAcessorio('oculos', modelo), '');
    assert.equal(encaixeDoAcessorio('oculos-sol', modelo), '');
  }
  assert.notEqual(encaixeDoAcessorio('bone', 'operador'), encaixeDoAcessorio('bone', 'tutor'));
});
