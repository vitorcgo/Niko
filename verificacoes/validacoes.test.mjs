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
