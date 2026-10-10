import test, { after } from "node:test";
import assert from "node:assert/strict";
import { criarServidorDeTeste as createServer } from "./vite-para-testes.mjs";
import { readFileSync } from "node:fs";

globalThis.BroadcastChannel = undefined;
globalThis.localStorage = { getItem: () => null, setItem: () => undefined };
globalThis.window = { setTimeout, clearTimeout };
const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { abaVizinha, alternarAbaDaBarra, criarAlternadorDoIniciar } = await servidor.ssrLoadModule("/src/janelas/ilha/barra/acoesDaBarra.ts");
const { useIlha } = await servidor.ssrLoadModule("/src/estado/ilha.ts");
const { atrasoDeFechamento, editandoNaIlha } = await servidor.ssrLoadModule("/src/janelas/ilha/fechamento.ts");
const { controle, sistema } = await servidor.ssrLoadModule("/src/ponte/ponteLocal.ts");
const { areaDeTrabalhoNaFrente, focoDaAreaPeloElemento, mostrarLateraisDaIlha } = await servidor.ssrLoadModule("/src/janelas/ilha/barra/visibilidadeDaBarra.ts");

test("fechamento permite sair imediatamente ou esperar menos de cinco segundos, preservando Nunca", () => {
  assert.equal(atrasoDeFechamento(0, "hoje"), null);
  for (const aba of ["hoje", "chat", "time", "claude"]) assert.equal(atrasoDeFechamento(-1, aba), 0);
  for (const s of [.5, 1, 2, 3, 5, 15]) assert.equal(atrasoDeFechamento(s, "hoje"), s * 1000);
  assert.equal(atrasoDeFechamento(5, "time"), null);
  assert.equal(atrasoDeFechamento(5, "claude"), null);
  for (const valor of [NaN, Infinity, -2]) assert.equal(atrasoDeFechamento(valor, "hoje"), null);
});

test("edição protege inputs, texto, seletores e conteúdo editável, mas não foco fora da ilha", () => {
  const raiz = { contains: (foco) => foco.dentro === true };
  for (const tag of ["input", "textarea", "select", "contenteditable"]) {
    const foco = { dentro: true, closest: (seletor) => { assert.match(seletor, /input, textarea, select/); return tag; } };
    assert.equal(editandoNaIlha(raiz, foco), true);
    assert.equal(editandoNaIlha(raiz, { ...foco, dentro: false }), false);
  }
  assert.equal(editandoNaIlha(raiz, null), false);
  assert.equal(editandoNaIlha(raiz, { dentro: true, closest: () => null }), false);
});

test("grade de conexões mantém 350 px e somente os detalhes do GitHub conectado usam 500 px", async () => {
  const { alturaDasConexoes } = await servidor.ssrLoadModule("/src/janelas/ilha/alturaDasConexoes.ts");
  assert.equal(alturaDasConexoes(null, true), 350);
  assert.equal(alturaDasConexoes(null, false), 350);
  assert.equal(alturaDasConexoes("github", true), 500);
  assert.equal(alturaDasConexoes("github", false), 350);
  for (const servico of ["stripe", "vercel", "resend", "notion", "calcom", "n8n", "google", "supabase", "cloudflare"])
    assert.equal(alturaDasConexoes(servico, true), 350);
});

test("voltar, fechar ou trocar de aba restaura a grade compacta sem perder a rolagem dos commits", () => {
  const ilha = readFileSync(new URL("../src/janelas/ilha/Ilha.tsx", import.meta.url), "utf8");
  const visoes = readFileSync(new URL("../src/janelas/ilha/Visoes.tsx", import.meta.url), "utf8");
  const detalhes = readFileSync(new URL("../src/janelas/ilha/ConexaoNaIlha.tsx", import.meta.url), "utf8");
  assert.match(ilha, /estadoEfetivo !== "expandida" \|\| abaAtual !== "conexoes"\) setConexaoSelecionada\(null\)/);
  assert.match(ilha, /<VisaoConexoes aberta=\{conexaoSelecionada\} aoSelecionar=\{setConexaoSelecionada\}/);
  assert.match(visoes, /onClick=\{\(\) => aoSelecionar\(null\)\}/);
  assert.match(detalhes, /ilha-rolagem ilha-conexao-conteudo/);
});

test("laterais seguem o foco, não o tamanho da janela, e preservam foco ao usar sobreposições", () => {
  const area = { frente: "area_de_trabalho", telaCheia: false, maximizada: false, cobre: false };
  assert.equal(areaDeTrabalhoNaFrente(area, false), true);
  for (const maximizada of [false, true]) {
    assert.equal(areaDeTrabalhoNaFrente({ ...area, frente: "app", maximizada }, true), false);
  }
  for (const anterior of [true, false]) {
    assert.equal(areaDeTrabalhoNaFrente({ ...area, frente: "sobreposta" }, anterior), anterior);
  }
  assert.equal(areaDeTrabalhoNaFrente({ ...area, telaCheia: true, frente: "sobreposta" }, true), false);
});

test("abrir a ilha mostra os dois lados mesmo sobre uma janela, recolher respeita o foco", () => {
  const base = { ativadas: true, estado: "compacta", saudando: false, telaCheia: false, areaEmFoco: false };
  assert.equal(mostrarLateraisDaIlha(base), false);
  assert.equal(mostrarLateraisDaIlha({ ...base, areaEmFoco: true }), true);
  assert.equal(mostrarLateraisDaIlha({ ...base, estado: "expandida" }), true);
  assert.equal(mostrarLateraisDaIlha({ ...base, estado: "escondida", areaEmFoco: true }), false);
  for (const bloqueio of [{ ativadas: false }, { saudando: true }, { telaCheia: true }]) {
    assert.equal(mostrarLateraisDaIlha({ ...base, estado: "expandida", areaEmFoco: true, ...bloqueio }), false);
  }
});

test("foco no localhost distingue área de trabalho, janelas e controles da ilha", () => {
  const elemento = (janela, area) => ({ closest: () => janela ? {} : null, matches: () => area });
  assert.equal(focoDaAreaPeloElemento(elemento(true, false)), false);
  assert.equal(focoDaAreaPeloElemento(elemento(false, true)), true);
  assert.equal(focoDaAreaPeloElemento(elemento(false, false)), undefined);
  assert.equal(focoDaAreaPeloElemento(null), undefined);
});

test("usar os controles das pontas não recolhe a ilha nem dispara o fechamento automático", () => {
  const codigo = readFileSync(new URL("../src/janelas/ilha/Ilha.tsx", import.meta.url), "utf8");
  assert.match(codigo, /sobre \|\| barraEmUso \|\| atraso === null \|\| fixada/);
  assert.match(codigo, /e\.target\.closest\("\.ilha-barra, \.ilha-pop"\)\) return/);
  assert.match(codigo, /!areaEmFocoNoNavegador && alguemCobre/);
});

test("a ilha coberta desaparece gradualmente e retorna sem atraso ou deslocamento residual", async () => {
  const { movimentoDaVisibilidade } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/visibilidade.ts");
  const saida = movimentoDaVisibilidade(true, false);
  const entrada = movimentoDaVisibilidade(false, false);
  assert.equal(saida.animate.opacity, 0);
  assert.ok(saida.animate.y < 0);
  assert.ok(saida.transition.duration >= 0.25 && saida.transition.duration <= 0.4);
  assert.deepEqual(entrada.animate, { opacity: 1, y: 0 });
  assert.deepEqual(entrada.transition, saida.transition);
  assert.ok(!Object.hasOwn(entrada.transition, "delay"));
  assert.deepEqual(movimentoDaVisibilidade(true, false), saida);
});

test("movimento reduzido mantém a saída com fade curto, sem deslocar a ilha", async () => {
  const { movimentoDaVisibilidade } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/visibilidade.ts");
  const saida = movimentoDaVisibilidade(true, true);
  assert.deepEqual(saida.animate, { opacity: 0, y: 0 });
  assert.ok(saida.transition.duration > 0 && saida.transition.duration <= 0.12);
  assert.deepEqual(movimentoDaVisibilidade(false, true).animate, { opacity: 1, y: 0 });
});

test("a ilha integra a saída animada sem zerar sua opacidade diretamente no estilo", () => {
  const fonte = readFileSync(new URL("../src/janelas/ilha/Ilha.tsx", import.meta.url), "utf8");
  assert.ok(!fonte.includes('opacity: coberta && estadoEfetivo === "escondida" ? 0 : 1'));
  assert.match(fonte, /<motion\.div\s+ref=\{raiz\}/);
  assert.match(fonte, /movimentoDaVisibilidade\(oculta, Boolean\(reduzirAnimacoes\)\)/);
  assert.match(fonte, /ilha-raiz-oculta/);
});

test("clicar novamente na mesma aba recolhe a ilha", () => {
  useIlha.setState({ estado: "compacta", aba: "hoje" });
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "expandida");
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "compacta");
});

test("saudação ao abrir: primeira vez, dia novo e versão nova saúdam, mesmo dia não", async () => {
  const { decidirSaudacaoAoAbrir } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/usarSaudacaoDiaria.ts");
  assert.deepEqual(decidirSaudacaoAoAbrir(null, "2026-10-07", "0.2.1"), { saudar: true });
  assert.deepEqual(decidirSaudacaoAoAbrir({ dia: "2026-10-07", versao: "0.2.1" }, "2026-10-07", "0.2.1"), { saudar: false });
  assert.deepEqual(decidirSaudacaoAoAbrir({ dia: "2026-10-06", versao: "0.2.1" }, "2026-10-07", "0.2.1"), { saudar: true });
  assert.deepEqual(decidirSaudacaoAoAbrir({ dia: "2026-10-07", versao: "0.2.0" }, "2026-10-07", "0.2.1"), { saudar: true, versaoNova: "0.2.1" });
});

test("saudação na volta: só depois de 30 min longe ou do PC dormir, e quando a pessoa mexe de novo", async () => {
  const { voltouDepoisDeAusencia } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/usarSaudacaoDiaria.ts");
  const minuto = 60_000;
  assert.deepEqual(voltouDepoisDeAusencia(minuto, 5_000, false), { ausente: false, voltou: false });
  assert.deepEqual(voltouDepoisDeAusencia(minuto, 40 * minuto, false), { ausente: true, voltou: false });
  assert.deepEqual(voltouDepoisDeAusencia(minuto, 10_000, true), { ausente: false, voltou: true });
  assert.deepEqual(voltouDepoisDeAusencia(8 * 60 * minuto, 3_000, false), { ausente: false, voltou: true });
  assert.deepEqual(voltouDepoisDeAusencia(minuto, 5 * minuto, true), { ausente: true, voltou: false });
});

test("volta ao PC: saúda no primeiro retorno do dia, só avisa depois de muito tempo fora e nunca atrapalha", async () => {
  const { reagirAVolta } = await servidor.ssrLoadModule("/src/janelas/ilha/animacoes/usarSaudacaoDiaria.ts");
  const hora = 3_600_000;
  const base = { jaSaudouHoje: false, ausenciaMs: hora, naoPerturbe: false, ilhaEmUso: false };
  assert.equal(reagirAVolta(base), "saudar");
  assert.equal(reagirAVolta({ ...base, naoPerturbe: true }), "nada");
  assert.equal(reagirAVolta({ ...base, ilhaEmUso: true }), "esperar");
  assert.equal(reagirAVolta({ ...base, jaSaudouHoje: true }), "nada");
  assert.equal(reagirAVolta({ ...base, jaSaudouHoje: true, ausenciaMs: 3 * hora }), "boasVindas");
});

test("subtítulo da saudação diz o que tem para hoje", async () => {
  const { T } = await servidor.ssrLoadModule("/src/textos/textos.ts");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 3, habitos: 1 }), "Hoje: 3 tarefas e 1 hábito.");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 1, habitos: 0 }), "Hoje: 1 tarefa.");
  assert.equal(T.ilha.saudacao.hoje({ tarefas: 0, habitos: 0 }), T.ilha.saudacao.equipe);
});

test("rolar sobre as abas anda uma aba por vez e para nas pontas", () => {
  const abas = ["hoje", "conexoes", "chat"];
  assert.equal(abaVizinha(abas, "hoje", 1), "conexoes");
  assert.equal(abaVizinha(abas, "conexoes", -1), "hoje");
  assert.equal(abaVizinha(abas, "chat", 1), "chat");
  assert.equal(abaVizinha(abas, "hoje", -1), "hoje");
  assert.equal(abaVizinha(abas, "midia", 1), "hoje");
  assert.equal(abaVizinha([], "hoje", 1), undefined);
});

test("botão de tarefas da barra abre a seção certa sem recolher outra seção do Hoje", () => {
  useIlha.setState({ estado: "expandida", aba: "hoje", secaoHoje: "agenda" });
  alternarAbaDaBarra("hoje", "tarefas");
  assert.equal(useIlha.getState().estado, "expandida");
  assert.equal(useIlha.getState().secaoHoje, "tarefas");
  alternarAbaDaBarra("hoje", "tarefas");
  assert.equal(useIlha.getState().estado, "compacta");
});

test("trocar de aba não recolhe uma ilha expandida", () => {
  useIlha.setState({ estado: "expandida", aba: "chat" });
  alternarAbaDaBarra("hoje");
  assert.equal(useIlha.getState().estado, "expandida");
  assert.equal(useIlha.getState().aba, "hoje");
});

test("Iniciar usa o estado capturado antes de o clique roubar o foco", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: true }), async (abertoAntes) => pedidos.push(abertoAntes));
  alternador.preparar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [true]);
});

test("cliques rápidos não acumulam comandos para o Iniciar", async () => {
  let finalizar;
  let pedidos = 0;
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: false }), async () => {
    pedidos++;
    await new Promise((resolver) => { finalizar = resolver; });
  });
  const primeiro = alternador.alternar();
  await new Promise((resolver) => setImmediate(resolver));
  await alternador.alternar();
  assert.equal(pedidos, 1);
  finalizar();
  await primeiro;
});

test("falha na leitura do Iniciar não inventa um estado aberto", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => { throw new Error("indisponivel"); }, async (estado) => pedidos.push(estado));
  alternador.preparar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [undefined]);
});

test("segundo clique usa a confirmação real do Windows mesmo sem mover o mouse", async () => {
  const pedidos = [];
  const alternador = criarAlternadorDoIniciar(async () => ({ aberto: false }), async (abertoAntes) => {
    pedidos.push(abertoAntes);
    return { aberto: !abertoAntes };
  });
  alternador.preparar();
  await alternador.alternar();
  await alternador.alternar();
  assert.deepEqual(pedidos, [false, true]);
});

test("ponte preserva estado real do Bluetooth e o estado anterior do Iniciar", async () => {
  const pedidos = [];
  globalThis.fetch = async (url, opcoes) => {
    pedidos.push({ url, corpo: opcoes?.body ? JSON.parse(opcoes.body) : null });
    return Response.json(url.endsWith("bluetooth") ? { aparelhos: { id: "teste", nome: "Fone", ativo: false, conectado: null } } : { aberto: true });
  };
  assert.equal((await sistema.bluetooth())[0].conectado, null);
  assert.equal((await controle.iniciar()).aberto, true);
  await controle.alternarIniciar(true);
  assert.deepEqual(pedidos.at(-1).corpo, { nome: "iniciar", abertoAntes: true });
});

test("leitura nativa do Bluetooth não usa status do driver como conexão", { skip: process.platform !== "win32" }, async () => {
  const { listarBluetooth } = await servidor.ssrLoadModule("/servidor/sistema.ts");
  const resultado = await listarBluetooth();
  assert.ok(Array.isArray(resultado.aparelhos));
  for (const aparelho of resultado.aparelhos) {
    assert.equal(typeof aparelho.id, "string");
    assert.ok(aparelho.conectado === null || typeof aparelho.conectado === "boolean");
    assert.equal(aparelho.ativo, aparelho.conectado === true);
  }
});

test("detecção nativa do Iniciar compila e retorna um booleano sem abrir janelas", { skip: process.platform !== "win32" }, async () => {
  const { lerIniciar, encerrarControle } = await servidor.ssrLoadModule("/servidor/controleRapido.ts");
  try {
    assert.equal(typeof (await lerIniciar()).aberto, "boolean");
  } finally {
    encerrarControle();
  }
});
