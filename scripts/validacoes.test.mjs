import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function testarVolumeDoPlayer() {
  const { VolumeDoPlayer } = await vite.ssrLoadModule("/src/janelas/ilha/VolumeDoPlayer.tsx");
  const { useControleRapido } = await vite.ssrLoadModule("/src/estado/controleRapido.ts");
  const anterior = useControleRapido.getState();
  // No servidor, o Zustand lê o snapshot inicial, não o estado do cliente.
  const inicial = { ...useControleRapido.getInitialState() };
  const renderizar = () => {
    Object.assign(useControleRapido.getInitialState(), useControleRapido.getState());
    return renderToStaticMarkup(createElement(VolumeDoPlayer));
  };
  try {
    useControleRapido.setState({ audio: { saida: { volume: 65, mudo: false }, entrada: null, sessoes: [] }, audioIndisponivel: false });
    assert.match(renderizar(), /65%/);
    assert.match(renderizar(), /aria-label="Volume do Windows"/);
    assert.doesNotMatch(renderizar(), /disabled/);
    useControleRapido.setState({ audio: { saida: { volume: 65, mudo: true }, entrada: null, sessoes: [] } });
    assert.match(renderizar(), /aria-pressed="true"/);
    assert.match(renderizar(), /value="0"/);
    useControleRapido.setState({ audioIndisponivel: true });
    assert.equal((renderizar().match(/disabled=""/g) ?? []).length, 2);
    useControleRapido.setState({ audio: null, audioIndisponivel: false });
    assert.equal((renderizar().match(/disabled=""/g) ?? []).length, 2);
  } finally {
    useControleRapido.setState(anterior);
    Object.assign(useControleRapido.getInitialState(), inicial);
  }
}

const memoria = new Map();
let receberMensagem;
globalThis.BroadcastChannel = class {
  constructor(nome) { this.nome = nome; }
  postMessage() {}
  addEventListener(_, fn) { receberMensagem = fn; }
};
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) };
globalThis.window = Object.assign(new EventTarget(), { location: { search: "?banco=validacoes" }, setTimeout, clearTimeout });
globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
globalThis.fetch = async () => { throw new Error("Rede bloqueada nos testes"); };
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());
const dinheiro = await vite.ssrLoadModule("/src/utilitarios/dinheiro.ts");
const { useFinancas } = await vite.ssrLoadModule("/src/estado/financas.ts");
const { useEstudos } = await vite.ssrLoadModule("/src/estado/estudos.ts");
const { useOrganizacao } = await vite.ssrLoadModule("/src/estado/organizacao.ts");
const { useConfig, CONFIG_PADRAO } = await vite.ssrLoadModule("/src/estado/configuracoes.ts");
const { validarBackup } = await vite.ssrLoadModule("/src/utilitarios/backupValido.ts");
const { configuracoesValidas } = await vite.ssrLoadModule("/src/utilitarios/configuracoesValidas.ts");
const armazenamento = await vite.ssrLoadModule("/src/ponte/armazenamento.ts");
const { rotas } = await vite.ssrLoadModule("/servidor/ponte.ts");
const { lerDataIcs, lerEventosIcs } = await vite.ssrLoadModule("/src/utilitarios/calendarioIcs.ts");
const { agruparSessoesDoEscritorio, poseDaSessao } = await vite.ssrLoadModule("/src/modulos/escritorio/sessoesDoEscritorio.ts");
const { filtrarSessoes, acontecimentosDoEscritorio, minutosDaSessao, nomeDoPersonagem, sessoesDeDemonstracao } = await vite.ssrLoadModule("/src/modulos/escritorio/sessoesDoEscritorio.ts");
const { aparenciaDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/aparenciaDoEscritorio.ts");
const { hash32 } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/shared/hash.ts");
const { appearanceFromSeed } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/character/appearance.ts");
const { renderCharacter, POSE_FRAMES } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/character/render.ts");
const { desk, officeChair } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/furniture/office.ts");
const { pedidoDaSessao } = await vite.ssrLoadModule("/src/utilitarios/pedidoDaSessao.ts");

test("demonstração do escritório é isolada e filtros não alteram suas sessões", () => {
  const exemplos = sessoesDeDemonstracao(Date.parse("2026-10-09T12:00:00Z"));
  const original = structuredClone(exemplos);
  assert.equal(exemplos.length, 5);
  assert.equal(agruparSessoesDoEscritorio(exemplos).length, 3);
  assert.ok(exemplos.every((s) => s.id.startsWith("demo:")));
  assert.equal(filtrarSessoes(exemplos, "codex", "todos").length, 2);
  assert.equal(filtrarSessoes(exemplos, "codex", "aprovacao").length, 1);
  assert.equal(filtrarSessoes(exemplos, "claude", "aprovacao").length, 0);
  assert.deepEqual(exemplos, original);
  assert.deepEqual(sessoesDeDemonstracao(Date.parse("2026-10-09T12:00:00Z")), original);
});

test("feed usa somente acontecimentos válidos e ordena os mais recentes", () => {
  const exemplos = sessoesDeDemonstracao(Date.parse("2026-10-09T12:00:00Z"));
  exemplos[0].passos.push({ id: "invalido", hora: "não é uma data", rotulo: "Ignorar" });
  const feed = acontecimentosDoEscritorio(exemplos);
  assert.equal(feed.length, 10);
  assert.ok(feed.every((p, i) => !i || Date.parse(feed[i - 1].passo.hora) >= Date.parse(p.passo.hora)));
  assert.ok(feed.every(({ sessao }) => exemplos.includes(sessao)));
  assert.deepEqual(acontecimentosDoEscritorio([]), []);
});

test("aparência Niko preserva identidade e tempo nunca fica negativo ou NaN", () => {
  const original = appearanceFromSeed(hash32("agente"));
  assert.deepEqual(aparenciaDoEscritorio("agente", "original"), original);
  const niko = aparenciaDoEscritorio("agente", "niko", "#112233");
  assert.deepEqual(niko, aparenciaDoEscritorio("agente", "niko", "#112233"));
  assert.equal(niko.top, "#112233");
  assert.equal(niko.topStyle, "hoodie");
  assert.equal(niko.accessory, "headphones");
  assert.equal(niko.skin, original.skin);
  assert.equal(nomeDoPersonagem("agente"), nomeDoPersonagem("agente"));
  assert.equal(minutosDaSessao("2026-10-09T12:00:00Z", Date.parse("2026-10-09T12:25:59Z")), 25);
  assert.equal(minutosDaSessao("2026-10-09T12:00:00Z", 0), 0);
  assert.equal(minutosDaSessao("inválido", NaN), 0);
});

test("escritório vazio não reutiliza painel vazio e demo não grava sessões reais", async () => {
  const { EscritorioIas } = await vite.ssrLoadModule("/src/modulos/escritorio/EscritorioIas.tsx");
  const { useClaudeCode } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
  const inicial = useClaudeCode.getInitialState();
  const anterior = { ...inicial };
  try {
    Object.assign(inicial, { sessoes: {}, ordem: [], pedidos: [] });
    const vazio = renderToStaticMarkup(createElement(EscritorioIas));
    assert.match(vazio, /ei-escritorio-conectado/);
    assert.match(vazio, /ei-mundo-canvas/);
    assert.doesNotMatch(vazio, /ei-sessao-real/);
    assert.doesNotMatch(vazio, /Ver demonstração|Voltar ao vivo|Demonstrar passeio|Projetos e personagens de exemplo/);
    assert.match(vazio, /ei-resumo-dados/);
    assert.match(vazio, /Equipe livre/);
    const { ConfigDasFerramentas } = await vite.ssrLoadModule("/src/janelas/ilha/claude/ConfigDasFerramentas.tsx");
    const conectando = renderToStaticMarkup(createElement(ConfigDasFerramentas, { aoFechar() {} }));
    assert.match(conectando, /Carregando/);
    assert.doesNotMatch(conectando, /Desligado/);
    assert.equal((conectando.match(/class="cfg-ladrilho"/g) ?? []).length, 8);
    const estadoReal = useClaudeCode.getState();
    const demo = renderToStaticMarkup(createElement(EscritorioIas, { demonstracaoInicial: true }));
    assert.equal((demo.match(/class="ei-projeto"/g) ?? []).length, 3);
    assert.match(demo, /<dt>.*?Sessões<\/dt><dd>5<\/dd>/);
    assert.match(demo, /Demonstrar passeio/);
    assert.doesNotMatch(demo, /copa-niko.png/);
    assert.doesNotMatch(demo, /ei-sessao-real/);
    assert.equal(useClaudeCode.getState(), estadoReal);
  } finally { Object.assign(inicial, anterior); }
});

test("snapshot visual mantém IDs reais e não inventa tarefas, contas autenticadas ou subagentes", async () => {
  const { snapshotDoEscritorio, estadoDoPersonagem } = await vite.ssrLoadModule("/src/modulos/escritorio/snapshotDoEscritorio.ts");
  const exemplos = sessoesDeDemonstracao(Date.parse("2026-10-09T12:00:00Z"));
  const { SALA_DA_EQUIPE, IDS_DA_EQUIPE } = await vite.ssrLoadModule("/src/modulos/escritorio/equipeDoEscritorio.ts");
  const snap = snapshotDoEscritorio(exemplos, { "demo:0": "Nome local" }, true, Date.parse("2026-10-09T12:00:00Z"));
  const salas = snap.rooms.filter((r) => r.id !== SALA_DA_EQUIPE);
  const sessoes = snap.agents.filter((a) => a.roomId !== SALA_DA_EQUIPE);
  assert.equal(salas.length, 3);
  assert.equal(sessoes.length, 5);
  assert.equal(snap.agents.length - sessoes.length, IDS_DA_EQUIPE.length);
  assert.equal(sessoes[0].name, "Nome local");
  assert.ok(sessoes.every((a) => exemplos.some((s) => s.id === a.id) && a.kind === "main" && !a.tasks.length && !a.permission && !a.shells));
  assert.ok(snap.agents.every((a) => !a.tasks.length && !a.permission && !a.shells));
  assert.ok(snap.accounts.every((a) => a.usageStatus === "disabled" && !a.usage && !a.configDir));
  assert.equal(snap.meta.messages, false);
  assert.equal(estadoDoPersonagem("terminou"), "idle");
  assert.equal(estadoDoPersonagem("aprovacao"), "waiting");
  assert.ok(snapshotDoEscritorio([]).agents.every((a) => a.roomId === SALA_DA_EQUIPE && a.status === "idle" && !a.sessionId));
});

test("prédio conectado alcança cada móvel utilizável pelos corredores e respeita bloqueios", async () => {
  const { Sim } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/sim/sim.ts");
  const arte = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/index.ts");
  const { DEFAULT_WORLD_OPTIONS } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/api.ts");
  const { snapshotDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/snapshotDoEscritorio.ts");
  const agora = Date.parse("2026-10-09T12:00:00Z");
  const sim = new Sim(arte, () => DEFAULT_WORLD_OPTIONS, null);
  sim.applySnapshot(snapshotDoEscritorio(sessoesDeDemonstracao(agora), {}, true, agora), agora);
  const elevador = sim.building.spots.find((s) => s.kind === "elevator");
  const caminho = [];
  for (const spot of sim.building.spots) {
    assert.ok(sim.finder.find(elevador.tx, elevador.ty, spot.tx, spot.ty, caminho), spot.id);
    for (let i = 0; i < caminho.length; i += 2) assert.ok(sim.building.grid.walkable(caminho[i], caminho[i + 1]), spot.id);
  }
  assert.ok(sim.building.core.some((s) => s.id === "core:copa"));
  assert.ok(sim.building.core.some((s) => s.id === "core:lounge"));
  assert.ok(sim.building.grid.cells.some((s) => s === 0));
});

test("cidade pixelada tem lojas e calçadas, sem gramado ou bosque externo", async () => {
  const { exteriorUrbano, patioUrbano, pixelsDaLoja } = await vite.ssrLoadModule("/src/modulos/escritorio/cenarioUrbano.ts");
  const cidade = exteriorUrbano(4);
  assert.ok(cidade.floors.every((p) => p.kind !== "grass"));
  assert.equal(cidade.props.filter((p) => p.kind === "loja").length, 3);
  for (const cols of [2, 3, 4, 8, 16]) {
    const lojas = exteriorUrbano(cols).props.filter((p) => p.kind === "loja");
    assert.ok(lojas.length >= 3 && lojas.length <= 5);
    const norte = lojas.filter((p) => p.y < 0);
    for (let j = 1; j < norte.length; j++) assert.ok(norte[j].x - norte[j - 1].x >= 112);
  }
  assert.ok(cidade.props.every((p) => p.kind !== "tree" && p.kind !== "pine"));
  assert.ok(cidade.lanes.every((l) => l.y > cidade.streetY && l.y < cidade.streetY + cidade.streetH));
  for (let i = 0; i < 5; i++) {
    const loja = pixelsDaLoja(i);
    assert.equal(loja.data.length, loja.w * loja.h * 4);
    assert.ok(loja.countOpaque() > 6000);
    assert.deepEqual(loja.data, pixelsDaLoja(i).data);
    assert.ok(patioUrbano(i, true).props.every((p) => p.kind !== "tree" && p.kind !== "pine"));
  }
  assert.notDeepEqual(pixelsDaLoja(0).data, pixelsDaLoja(1).data);
});

test("câmera entra mais próxima e ainda permite enquadrar o prédio inteiro em qualquer largura", async () => {
  const { enquadramentoDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/enquadramentoDoEscritorio.ts");
  for (const cols of [2, 4, 8, 16]) for (const largura of [280, 375, 720, 1280]) {
    const inicial = enquadramentoDoEscritorio(cols, largura, 540);
    const geral = enquadramentoDoEscritorio(cols, largura, 540, true);
    assert.ok(inicial.zoom >= geral.zoom);
    assert.ok(inicial.zoom <= 4 && geral.zoom > 0);
    assert.ok(inicial.minZoom <= geral.zoom);
    assert.ok([inicial.cx, inicial.cy, geral.cx, geral.cy, inicial.dy].every(Number.isFinite));
    assert.ok(inicial.bounds.y < -8 * 16);
  }
  assert.ok(enquadramentoDoEscritorio(4, 1000, 600).zoom > enquadramentoDoEscritorio(4, 1000, 600, true).zoom);
  assert.ok(Object.values(enquadramentoDoEscritorio(NaN, NaN, NaN)).filter((v) => typeof v === "number").every(Number.isFinite));
});

test("personagem ocioso caminha entre ambientes e volta à mesa quando chega trabalho", async () => {
  const { Sim } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/sim/sim.ts");
  const arte = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/index.ts");
  const { DEFAULT_WORLD_OPTIONS } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/api.ts");
  const { snapshotDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/snapshotDoEscritorio.ts");
  const agora = Date.parse("2026-10-09T12:00:00Z");
  const exemplos = sessoesDeDemonstracao(agora);
  const sim = new Sim(arte, () => DEFAULT_WORLD_OPTIONS, null);
  sim.applySnapshot(snapshotDoEscritorio(exemplos, {}, true, agora), agora);
  const ch = sim.chars.get("demo:4");
  const origem = [ch.x, ch.y];
  ch.nextOutingAt = 1;
  let caminhou = false; let saiuDaSala = false;
  const sala = sim.rooms.get(ch.roomId).layout.rect;
  for (let i = 1; i <= 1200; i++) {
    sim.update(.05, agora + i * 50);
    caminhou ||= ch.x !== origem[0] || ch.y !== origem[1];
    saiuDaSala ||= ch.tx < sala.x || ch.ty < sala.y || ch.tx >= sala.x + sala.w || ch.ty >= sala.y + sala.h;
  }
  assert.ok(caminhou);
  assert.ok(saiuDaSala);
  exemplos[4] = { ...exemplos[4], estado: "trabalhando", atualizadaEm: new Date(agora + 60_000).toISOString() };
  sim.applySnapshot(snapshotDoEscritorio(exemplos, {}, true, agora + 60_000), agora + 60_000);
  for (let i = 1; i <= 1200; i++) sim.update(.05, agora + 60_000 + i * 50);
  assert.equal(ch.mode, "work");
  assert.equal(ch.atSpot, ch.homeSpot);
  assert.equal(ch.pose, "type");
});

test("escritório não mostra aprovação de outra sessão ao selecionar um personagem", () => {
  const pedidos = [{ pedidoId: "1", sessao: "outro" }, { pedidoId: "2", sessao: "escolhido" }];
  assert.equal(pedidoDaSessao(pedidos, "escolhido", true), pedidos[1]);
  assert.equal(pedidoDaSessao(pedidos, "sem-pedido", true), undefined);
  assert.equal(pedidoDaSessao(pedidos, undefined, true), undefined);
  assert.equal(pedidoDaSessao(pedidos, "sem-pedido"), pedidos[0]);
  assert.equal(pedidoDaSessao([], "escolhido", true), undefined);
});

test("móveis originais geram sprites válidos com âncoras preservadas", () => {
  for (let seed = 0; seed < 6; seed++) {
    for (const movel of [desk("white", seed), officeChair("blue")]) {
      const { buf, ax, ay } = movel.base;
      assert.equal(buf.data.length, buf.w * buf.h * 4);
      assert.ok(buf.data.some((c) => c !== 0));
      assert.ok(Number.isFinite(ax) && Number.isFinite(ay));
    }
  }
});

test("escritório de IAs agrupa pelo caminho real, não apenas pelo nome da pasta", () => {
  const sessao = (id, cwd) => ({ id, cwd, projeto: "App", ferramenta: "claude", estado: "trabalhando" });
  const salas = agruparSessoesDoEscritorio([sessao("a", "V:\\Projetos\\App"), sessao("b", "v:/projetos/app/"), sessao("c", "V:\\Outros\\App")]);
  assert.equal(salas.length, 2);
  assert.deepEqual(salas[0].sessoes.map((s) => s.id), ["a", "b"]);
  assert.equal(salas[1].sessoes[0].id, "c");
});

test("escritório de IAs filtra sem acentos e não inventa sessões", () => {
  const s = { id: "a", cwd: "V:/App", projeto: "Programação", ferramenta: "codex", pedido: "Revisar calendário" };
  assert.equal(agruparSessoesDoEscritorio([s], "programacao").length, 1);
  assert.equal(agruparSessoesDoEscritorio([s], "codex").length, 1);
  assert.equal(agruparSessoesDoEscritorio([s], "calendario").length, 1);
  assert.deepEqual(agruparSessoesDoEscritorio([s], "inexistente"), []);
  assert.deepEqual(agruparSessoesDoEscritorio([]), []);
});

test("bonequinhos originais têm aparência estável e quadros válidos", () => {
  const appearance = appearanceFromSeed(1234);
  assert.deepEqual(appearance, appearanceFromSeed(1234));
  for (const estado of ["aprovacao", "trabalhando", "erro", "terminou"]) {
    const pose = poseDaSessao(estado);
    for (let frame = 0; frame < POSE_FRAMES[pose]; frame++) {
      const { buf } = renderCharacter({ appearance, pose, frame, dir: "down" });
      assert.equal(buf.data.length, buf.w * buf.h * 4);
      assert.ok(buf.data.some((c) => c !== 0));
    }
  }
  assert.equal(poseDaSessao("aprovacao"), "raise_hand");
  assert.equal(poseDaSessao("terminou"), "stand");
});

test("ICS do Google converte 11:30 UTC para 08:30 em São Paulo", () => {
  const texto = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261008T113000Z\r\nSUMMARY:Bate Papo Cultura e Pessoas\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const [evento] = lerEventosIcs(texto, "America/Sao_Paulo");
  assert.equal(evento.hora, "08:30");
  assert.equal(evento.data, "2026-10-08");
});

test("ICS respeita TZID e converte a data ao atravessar meia-noite", () => {
  assert.deepEqual(lerDataIcs("20261008T083000", ";TZID=America/Sao_Paulo", "America/Sao_Paulo"), { data: "2026-10-08", hora: "08:30" });
  assert.deepEqual(lerDataIcs("20261008T083000", ';TZID="Europe/London"', "America/Sao_Paulo"), { data: "2026-10-08", hora: "04:30" });
  assert.deepEqual(lerDataIcs("20261008T013000Z", "", "America/Sao_Paulo"), { data: "2026-10-07", hora: "22:30" });
  assert.deepEqual(lerDataIcs("20261008T233000Z", "", "Asia/Tokyo"), { data: "2026-10-09", hora: "08:30" });
});

test("ICS preserva dia inteiro e horário sem fuso, como a exportação do Niko", () => {
  assert.deepEqual(lerDataIcs("20261008", ";VALUE=DATE", "America/Sao_Paulo"), { data: "2026-10-08" });
  assert.deepEqual(lerDataIcs("20261008T083000", "", "Asia/Tokyo"), { data: "2026-10-08", hora: "08:30" });
});

test("ICS usa o deslocamento de verão da data, não o de hoje", () => {
  assert.deepEqual(lerDataIcs("20260708T083000", ";TZID=America/New_York", "America/Sao_Paulo"), { data: "2026-07-08", hora: "09:30" });
  assert.deepEqual(lerDataIcs("20260108T083000", ";TZID=America/New_York", "America/Sao_Paulo"), { data: "2026-01-08", hora: "10:30" });
  assert.deepEqual(lerDataIcs("20261101T013000", ";TZID=America/New_York", "UTC"), { data: "2026-11-01", hora: "05:30" });
});

test("ICS converte EXDATE com o mesmo critério e desdobra linhas longas", () => {
  const [evento] = lerEventosIcs("BEGIN:VEVENT\nDTSTART:20261008T013000Z\nSUMMARY:Reunião\\, com\n continuação\nRRULE:FREQ=DAILY\nEXDATE:20261009T013000Z,20261010T013000Z\nEND:VEVENT", "America/Sao_Paulo");
  assert.equal(evento.titulo, "Reunião, comcontinuação");
  assert.equal(evento.repeticao, "diaria");
  assert.deepEqual(evento.excecoes, ["2026-10-08", "2026-10-09"]);
});

test("ICS recusa datas, horas e fusos inválidos sem inventar outro horário", () => {
  for (const valor of ["20260230T083000Z", "20261008T253000Z", "20261008T086000Z", "20261008T083099Z", "20261008T083000Zlixo"]) assert.equal(lerDataIcs(valor, "", "UTC"), null);
  assert.throws(() => lerDataIcs("20261008T083000", ";TZID=Fuso/Inexistente", "UTC"), RangeError);
  assert.deepEqual(lerEventosIcs("BEGIN:VEVENT\nDTSTART:20260230T083000Z\nSUMMARY:Inválido\nEND:VEVENT", "UTC"), []);
});

const conta = { id: "c", nome: "Conta", tipo: "corrente", saldoInicial: 0, cor: "#000000", arquivada: false };
const transacao = { tipo: "despesa", descricao: "Compra", valor: 12345, contaId: "c", data: "2026-10-09" };
const evento = { titulo: "Reunião", data: "2026-10-09", hora: "09:30", tipo: "evento", repeticao: "nenhuma" };
test("volume do player mostra porcentagem, mudo e bloqueia sem dispositivo", testarVolumeDoPlayer);
beforeEach(() => {
  useFinancas.setState({ contas: [conta, { ...conta, id: "d" }], categorias: [], transacoes: [] });
  useEstudos.setState({ areas: [], materias: [], paginas: [], datas: [] });
  useOrganizacao.setState({ eventos: [] });
});

test("dinheiro rejeita separadores quebrados e números sem precisão", () => {
  for (const v of ["1.2.3,45", "12.34,56", "90071992547409,93", "NaN", "1,234"]) assert.equal(dinheiro.lerValorEmCentavos(v), null);
  for (const [v, esperado] of [["R$ 1.234,56", 123456], ["12.50", 1250], ["-1.234,56", -123456], ["1.234", 123400]]) assert.equal(dinheiro.lerValorEmCentavos(v), esperado);
});

test("transações inválidas são rejeitadas sem modificar o estado", () => {
  for (const parcial of [{ valor: NaN }, { valor: Infinity }, { valor: -1 }, { valor: 1.5 }, { valor: Number.MAX_SAFE_INTEGER + 1 }, { data: "2026-02-30" }, { contaId: "sumiu" }, { descricao: " " }, { categoriaId: "sumiu" }, { tipo: "outro" }]) assert.throws(() => useFinancas.getState().lancar({ ...transacao, ...parcial }));
  assert.equal(useFinancas.getState().transacoes.length, 0);
});

test("parcelas exigem inteiro entre 1 e 48 e preservam todos os centavos", () => {
  for (const parcelas of [NaN, Infinity, 0, 49, 1.5]) assert.throws(() => useFinancas.getState().lancar({ ...transacao, parcelas }));
  const novas = useFinancas.getState().lancar({ ...transacao, parcelas: 3 });
  assert.equal(novas.length, 3);
  assert.equal(novas.reduce((total, t) => total + t.valor, 0), transacao.valor);
});

test("transferências validam origem e destino", () => {
  for (const contaDestinoId of [undefined, "c", "sumiu"]) assert.throws(() => useFinancas.getState().lancar({ ...transacao, tipo: "transferencia", contaDestinoId }));
  assert.equal(useFinancas.getState().lancar({ ...transacao, tipo: "transferencia", contaDestinoId: "d" }).length, 1);
});

test("edição e importação financeira rejeitam entrada inválida sem gravação parcial", () => {
  const [t] = useFinancas.getState().lancar(transacao);
  assert.throws(() => useFinancas.getState().atualizarTransacao(t.id, { valor: NaN }));
  assert.throws(() => useFinancas.getState().importar([transacao, { ...transacao, contaId: "sumiu" }]));
  assert.equal(useFinancas.getState().transacoes.length, 1);
  assert.equal(useFinancas.getState().transacoes[0].valor, transacao.valor);
});

test("restaurar transações repetidamente não duplica IDs", () => {
  const [t] = useFinancas.getState().lancar(transacao);
  useFinancas.getState().excluirTransacao(t.id);
  useFinancas.getState().restaurarTransacoes([t, t]);
  useFinancas.getState().restaurarTransacoes([t]);
  assert.equal(useFinancas.getState().transacoes.length, 1);
});

test("eventos validam título, data, hora e repetição inclusive na edição", () => {
  for (const parcial of [{ titulo: " " }, { data: "2026-02-30" }, { hora: "25:00" }, { hora: 0 }, { repeticao: "anual" }, { feitos: ["ontem"] }]) assert.throws(() => useOrganizacao.getState().criarEvento({ ...evento, ...parcial }));
  const e = useOrganizacao.getState().criarEvento(evento);
  assert.throws(() => useOrganizacao.getState().atualizarEvento(e.id, { data: "inválida" }));
  assert.equal(useOrganizacao.getState().eventos[0].data, evento.data);
});

test("estudos impedem órfãos, ciclos e pais de outra matéria", () => {
  const e = useEstudos.getState();
  assert.throws(() => e.criarArea(" ", "cursos"));
  assert.throws(() => e.criarMateria("sumiu", "Curso"));
  assert.throws(() => e.criarPagina("sumiu"));
  const area = e.criarArea("Estudos", "cursos");
  const m = e.criarMateria(area.id, "Curso");
  const outra = e.criarMateria(area.id, "Outro curso");
  const pai = e.criarPagina(m.id);
  const filha = e.criarPagina(m.id, pai.id);
  assert.throws(() => e.criarPagina(outra.id, pai.id));
  assert.throws(() => e.criarPagina(m.id, 0));
  assert.throws(() => e.atualizarPagina(pai.id, { paiId: filha.id }));
  assert.throws(() => e.atualizarPagina(pai.id, { materiaId: outra.id }));
  assert.equal(useEstudos.getState().paginas[0].paiId, undefined);
});

test("datas de estudo e revisões rejeitam dados inválidos", () => {
  const e = useEstudos.getState();
  const a = e.criarArea("Estudos", "cursos"), m = e.criarMateria(a.id, "Curso"), p = e.criarPagina(m.id);
  const data = { materiaId: m.id, titulo: "Prova", tipo: "prova", data: "2026-02-30" };
  assert.throws(() => e.criarData(data));
  assert.throws(() => e.marcarEstudada(p.id, [NaN]));
  assert.throws(() => e.criarCartao("sumiu", "Pergunta", "Resposta"));
  e.atualizarPagina(p.id, { conteudo: "Conteúdo válido" });
  assert.equal(useEstudos.getState().paginas[0].conteudo, "Conteúdo válido");
});

test("configurações corrompidas caem no padrão e preservam atalhos válidos", () => {
  const c = configuracoesValidas({ ilha: { ordemAbas: "erro", modo: "erro", opacidade: Infinity }, agentes: { cargos: { java: 123 } }, barraLateral: [null], dock: { atalhos: [{ id: "a", nome: "Site", url: "https://example.com" }] }, assistive: { apps: [{ id: "app", nome: "App" }] } }, CONFIG_PADRAO);
  assert.equal(c.agentes.cargos.java, CONFIG_PADRAO.agentes.cargos.java);
  assert.equal(c.ilha.modo, "inteligente");
  assert.equal(c.ilha.opacidade, 1);
  assert.equal(c.dock.atalhos.length, 1);
  assert.equal(c.assistive.apps.length, 1);
  const personalizados = configuracoesValidas({ ilha: { fechamentoSeg: 0 }, barraLateral: [{ rota: "chat", nome: "Conversas", visivel: false }] }, CONFIG_PADRAO);
  assert.equal(personalizados.ilha.fechamentoSeg, 0);
  assert.equal(personalizados.barraLateral[0].nome, "Conversas");
  useConfig.getState().definir({ dock: { ...CONFIG_PADRAO.dock, opacidade: 99 } });
  assert.equal(useConfig.getState().dock.opacidade, 1);
});

function backup(nome, state, version = 0) {
  return { tipo: "niko-backup", versao: 1, dados: { [`niko:${nome}`]: JSON.stringify({ state, version }) } };
}

test("backup exige versão conhecida e dados realmente estruturados", () => {
  for (const b of [null, [], { tipo: "niko-backup", versao: 2, dados: {} }, backup("financas", { transacoes: "erro" }), backup("configuracoes", { agentes: { cargos: { java: 123 } } }, 10), backup("estudos", { paginas: [{ id: "p" }] }), backup("financas", { contas: [] }, 99)]) assert.throws(() => validarBackup(b));
  assert.ok(validarBackup(backup("configuracoes", CONFIG_PADRAO, 10))["niko:configuracoes"]);
  assert.ok(validarBackup(backup("agentes", { atividades: [], alertas: [] }, 1))["niko:agentes"]);
});

test("backup rejeita referências inválidas e elimina campos que sobrescreveriam ações", () => {
  assert.throws(() => validarBackup(backup("financas", { contas: [], transacoes: [{ ...transacao, id: "t", criadaEm: new Date().toISOString() }] })));
  const dados = validarBackup(backup("organizacao", { eventos: [], criarEvento: "quebrado" }));
  assert.equal(JSON.parse(dados["niko:organizacao"]).state.criarEvento, undefined);
});

test("todas as coleções reais atuais podem ser exportadas e validadas", async () => {
  for (const [nome, exportacao] of [["rotina", "useRotina"], ["comunicacao", "useComunicacao"], ["pomodoro", "usePomodoro"], ["conquistas", "useConquistas"], ["agentes", "useAgentes"]]) {
    const modulo = await vite.ssrLoadModule(`/src/estado/${nome}.ts`);
    modulo[exportacao].setState({});
  }
  for (const nome of ["configuracoes", "rotina", "estudos", "financas", "organizacao", "comunicacao", "pomodoro", "conquistas", "agentes"]) {
    const v = memoria.get(`niko:${nome}`);
    assert.ok(v, nome);
    assert.doesNotThrow(() => validarBackup({ tipo: "niko-backup", versao: 1, dados: { [`niko:${nome}`]: v } }), nome);
  }
});

test("ponte recusa JSON nulo, lista e valor simples com erro 400", async () => {
  for (const corpo of ["null", "[]", "42", '"texto"']) {
    const req = Object.assign(new EventEmitter(), { url: "/ponte/dados", method: "POST", headers: { host: "localhost", "x-niko": "1" } });
    const res = { setHeader() {}, end(texto) { this.corpo = texto; } };
    const p = rotas(req, res, () => assert.fail("Rota ausente"));
    req.emit("data", Buffer.from(corpo));
    req.emit("end");
    await p;
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.corpo).erro, "json_invalido");
  }
});

test("sincronização rejeita formatos inválidos e eventos de outro banco", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ dados: {} }) });
  await armazenamento.iniciarArmazenamento();
  receberMensagem({ data: { origem: "outra", banco: "", chave: "niko:teste", valor: "principal" } });
  receberMensagem({ data: { origem: "outra", banco: "validacoes", chave: "niko:teste", valor: {} } });
  assert.equal(armazenamento.lerChave("niko:teste"), null);
  receberMensagem({ data: { origem: "outra", banco: "validacoes", chave: "niko:teste", valor: "válido" } });
  assert.equal(armazenamento.lerChave("niko:teste"), "válido");
  await armazenamento.salvarAgora();
});
