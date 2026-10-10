import test, { after } from "node:test";
import assert from "node:assert/strict";
import { criarServidorDeTeste as createServer } from "./vite-para-testes.mjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
const memoriaLocal = new Map();
globalThis.localStorage ??= { getItem: (k) => memoriaLocal.get(k) ?? null, setItem: (k, v) => memoriaLocal.set(k, v), removeItem: (k) => memoriaLocal.delete(k) };
globalThis.BroadcastChannel = class { postMessage() {} addEventListener() {} };
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true }, plugins: [{ name: "detalhe-para-teste", transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/ConfigDasFerramentas.tsx')) return `${code}\nexport { Detalhe as DetalheParaTeste };`; } }] });
after(() => vite.close());
const dados = await vite.ssrLoadModule("/src/modulos/escritorio/dadosDoEscritorio.ts");
const { configuracaoEscritorioValida } = await vite.ssrLoadModule("/src/modulos/escritorio/configuracaoDoEscritorio.ts");
const { mascararSegredos, tarefasDaEntrada } = await vite.ssrLoadModule("/src/modulos/escritorio/detalhesDaSessao.ts");
const { useClaudeCode } = await vite.ssrLoadModule("/src/estado/claudeCode.ts");
const { metricasDaStatus } = await vite.ssrLoadModule("/src/modulos/escritorio/metricasDaSessao.ts");
const { snapshotDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/snapshotDoEscritorio.ts");
const { validarBackup } = await vite.ssrLoadModule("/src/utilitarios/backupValido.ts");
const { agruparSessoesDoEscritorio } = await vite.ssrLoadModule("/src/modulos/escritorio/sessoesDoEscritorio.ts");
const { hash32 } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/shared/hash.ts");
const { Camera } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/camera.ts");
const base = { id: "a", sessao: "segredo-sessao", cwd: "C:/Users/pessoa/MeuProjeto", ferramenta: "claude", recebidoEm: "2026-10-09T13:00:00Z", evento: "PreToolUse", dados: { prompt: "privado", tool_input: { command: "privado" } } };

test("reconexão atualiza o estado sem duplicar passos e ignora snapshots antigos ou inválidos", () => {
  const anterior = useClaudeCode.getState();
  const aplicar = anterior.aplicar;
  try {
    aplicar({ ...base, id: "snapshot-estado-inicio", sessao: "snapshot-estado" });
    const antes = useClaudeCode.getState().sessoes["snapshot-estado"];
    const snapshot = { ...base, evento: "NikoSessoesAtuais", sessao: "", dados: { sessoes: ["snapshot-estado"], pedidos: [], estados: [{ sessao: "snapshot-estado", estado: "terminou", atualizadaEm: "2026-10-09T13:01:00Z" }] } };
    aplicar({ ...snapshot, id: "snapshot-estado-fim" });
    let atual = useClaudeCode.getState().sessoes["snapshot-estado"];
    assert.equal(atual.estado, "terminou"); assert.equal(atual.ferramentasUsadas, antes.ferramentasUsadas); assert.deepEqual(atual.passos, antes.passos);
    for (const item of [{ estado: "trabalhando", atualizadaEm: base.recebidoEm }, { estado: "inventado", atualizadaEm: "2026-10-09T13:02:00Z" }, { estado: "trabalhando", atualizadaEm: "inválida" }]) {
      aplicar({ ...snapshot, id: `snapshot-${item.estado}-${item.atualizadaEm}`, dados: { ...snapshot.dados, estados: [{ sessao: "snapshot-estado", ...item }] } });
      atual = useClaudeCode.getState().sessoes["snapshot-estado"];
      assert.equal(atual.estado, "terminou");
    }
    aplicar({ ...base, id: "snapshot-estado-retomada", sessao: "snapshot-estado", recebidoEm: "2026-10-09T13:03:00Z" });
    aplicar({ ...base, id: "snapshot-estado-hook-antigo", sessao: "snapshot-estado", evento: "PostToolUse", recebidoEm: "2026-10-09T13:00:00Z" });
    aplicar({ ...snapshot, id: "snapshot-estado-atrasado" });
    assert.equal(useClaudeCode.getState().sessoes["snapshot-estado"].estado, "trabalhando");
  } finally { useClaudeCode.setState(anterior); }
});

test("métricas antigas ou inválidas de hooks não substituem a atualização oficial mais recente", () => {
  const anterior = useClaudeCode.getState();
  const aplicar = anterior.aplicar;
  const evento = { ...base, sessao: "metricas-ordem" };
  try {
    aplicar({ ...evento, id: "metricas-ordem-inicio" });
    aplicar({ ...evento, id: "metricas-ordem-status", evento: "NikoMetadadosSessao", dados: { metricas: { entrada: 900, em: "2026-10-09T13:02:00Z" } } });
    for (const em of ["2026-10-09T13:01:00Z", "inválida"]) {
      aplicar({ ...evento, id: `metricas-ordem-hook-${em}`, evento: "PostToolUse", dados: { metricas: { entrada: 100, em } } });
      assert.equal(useClaudeCode.getState().sessoes[evento.sessao].metricas.entrada, 900);
    }
    aplicar({ ...evento, id: "metricas-ordem-hook-recente", evento: "PostToolUse", dados: { metricas: { entrada: 1000, em: "2026-10-09T13:03:00Z" } } });
    aplicar({ ...evento, id: "metricas-ordem-status-antigo", evento: "NikoMetadadosSessao", dados: { metricas: { entrada: 200, em: "2026-10-09T13:02:00Z" } } });
    assert.equal(useClaudeCode.getState().sessoes[evento.sessao].metricas.entrada, 1000);
  } finally { useClaudeCode.setState(anterior); }
});

test("privacidade oculta o arquivo da conexão no texto e no tooltip, sem afetar o modo normal", async () => {
  const { DetalheParaTeste } = await vite.ssrLoadModule("/src/janelas/ilha/claude/ConfigDasFerramentas.tsx");
  const props = { id: "codex", estado: { id: "codex", caminho: "C:/Users/CAMINHO_PRIVADO_TESTE/.codex/hooks.json", detectado: true, instalado: true, desatualizado: false, invalido: false }, aoVoltar() {}, aoMudar() {} };
  const oculto = renderToStaticMarkup(createElement(DetalheParaTeste, { ...props, ocultarCaminhos: true }));
  assert.doesNotMatch(oculto, /CAMINHO_PRIVADO_TESTE|hooks\.json/);
  const normal = renderToStaticMarkup(createElement(DetalheParaTeste, props));
  assert.ok(normal.includes(`title="${props.estado.caminho}"`)); assert.ok(normal.includes(`>${props.estado.caminho}</code>`));
  const escritorio = readFileSync(new URL("../src/modulos/escritorio/EscritorioIas.tsx", import.meta.url), "utf8");
  const config = readFileSync(new URL("../src/janelas/ilha/claude/ConfigDasFerramentas.tsx", import.meta.url), "utf8");
  assert.match(escritorio, /<ConfigDasFerramentas[^\n]*ocultarCaminhos=\{config\.esconderDetalhes\}/);
  assert.match(config, /<Detalhe[^\n]*ocultarCaminhos=\{ocultarCaminhos\}/);
});
test("análises guardam só identificadores opacos e contagens, nunca prompts, comandos ou caminhos", () => {
  const registro = dados.registroDoEscritorio(base);
  assert.equal(registro.nome, "MeuProjeto");
  assert.equal(registro.acao, true);
  assert.doesNotMatch(JSON.stringify(registro), /segredo-sessao|Users|privado|command|prompt/);
  assert.equal(dados.registroDoEscritorio({ ...base, recebidoEm: "inválido" }), null);
});
test("análises somam sessões simultâneas sem perder eventos com a mesma data e limitam lacunas", () => {
  const eventos = [base, { ...base, id: "b", sessao: "outra" },
    { ...base, id: "c", evento: "Stop", recebidoEm: "2026-10-09T13:02:00Z" },
    { ...base, id: "d", sessao: "outra", evento: "Stop", recebidoEm: "2026-10-09T23:00:00Z" }];
  const registros = eventos.map(dados.registroDoEscritorio);
  const a = dados.analiseDoEscritorio(registros, dados.diaDoEscritorio(Date.parse(base.recebidoEm)));
  assert.equal(a.estados.trabalho, 7 * 60000);
  assert.equal(a.acoes, 2); assert.equal(a.sessoes, 2);
  assert.equal(a.horas.reduce((s, h) => s + h.trabalho, 0), a.estados.trabalho);
  const agora = Date.parse("2026-10-09T23:00:01Z");
  assert.equal(dados.registrosValidos([...registros, registros[0], { ...registros[0], id: "ruim", acao: "sim" }], agora).length, 4);
});
test("configuração corrompida não sobrescreve ações nem aceita nomes excessivos", () => {
  const c = configuracaoEscritorioValida({ ciclo: "ruim", estilo: "ruim", seguir: "sim", nomes: { a: " Ana ", b: "x".repeat(80), constructor: "ruim" }, salas: [], registrar: "ruim" });
  assert.equal(c.ciclo, "auto"); assert.equal(c.estilo, "niko"); assert.equal(c.seguir, false);
  assert.deepEqual(c.nomes, { a: "Ana" }); assert.deepEqual(c.salas, {});
  assert.equal(Object.hasOwn(c, "registrar"), false);
});
test("segredos reconhecíveis são mascarados e tarefas só aparecem se a ferramenta informou", () => {
  assert.doesNotMatch(mascararSegredos('api_key="privado" Authorization: Bearer privado sk-abcdefghijklmnop'), /privado|abcdefghijklmnop/);
  assert.equal(tarefasDaEntrada("Read", { todos: [] }), undefined);
  assert.deepEqual(tarefasDaEntrada("TodoWrite", { todos: [{ content: "Testar", status: "completed" }, { content: "Ruim", status: "inventado" }] }), [{ id: "0", titulo: "Testar", estado: "completed" }]);
});
test("conclusão associa duração ao tool_use_id, não conta a ação duas vezes nem inventa subagentes", () => {
  const aplicar = useClaudeCode.getState().aplicar;
  const evento = { ...base, sessao: "detalhes-teste", dados: { tool_name: "Read", tool_use_id: "chamada-a" } };
  aplicar({ ...evento, id: "d-1" });
  aplicar({ ...evento, id: "d-2", evento: "PostToolUse", dados: { ...evento.dados, duration_ms: 125 } });
  const s = useClaudeCode.getState().sessoes[evento.sessao];
  assert.equal(s.ferramentasUsadas, 1); assert.equal(s.passos[0].duracaoMs, 125); assert.equal(s.passos[0].resultado, "concluido");
  aplicar({ ...evento, id: "d-3", evento: "SubagentStop", dados: { agent_id: "nunca-começou" } });
  assert.equal(useClaudeCode.getState().sessoes[evento.sessao].subagentes, undefined);
  aplicar({ ...evento, id: "d-4", evento: "SubagentStart", dados: { agent_id: "agente-a", agent_type: "Explore" } });
  aplicar({ ...evento, id: "d-5", evento: "SubagentStop", dados: { agent_id: "agente-a" } });
  assert.equal(useClaudeCode.getState().sessoes[evento.sessao].subagentes[0].estado, "terminou");
  const snapshot = snapshotDoEscritorio([useClaudeCode.getState().sessoes[evento.sessao]]);
  const sub = snapshot.agents.find((a) => a.kind === "sub");
  assert.equal(sub.parentId, evento.sessao); assert.equal(sub.status, "done");
});

test("equipe passeia sem sessões e um boneco livre recebe cada sessão nova", async () => {
  const { atribuirEquipe, IDS_DA_EQUIPE, SALA_DA_EQUIPE } = await vite.ssrLoadModule("/src/modulos/escritorio/equipeDoEscritorio.ts");
  const vazio = snapshotDoEscritorio([]);
  assert.equal(vazio.agents.length, IDS_DA_EQUIPE.length);
  assert.ok(vazio.agents.every((a) => a.roomId === SALA_DA_EQUIPE && a.status === "idle"));
  const s = { id: "sessao-da-equipe", ferramenta: "claude", projeto: "Projeto", cwd: "C:/Projeto", estado: "trabalhando", passos: [], ferramentasUsadas: 0, iniciadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString() };
  const equipe = atribuirEquipe(new Map(), [s.id]);
  const comSessao = snapshotDoEscritorio([s], {}, false, Date.now(), equipe);
  const boneco = equipe.get(s.id);
  const agente = comSessao.agents.find((a) => a.id === boneco);
  assert.equal(agente.sessionId, s.id); assert.notEqual(agente.roomId, SALA_DA_EQUIPE);
  assert.equal(comSessao.agents.filter((a) => a.roomId === SALA_DA_EQUIPE).length, IDS_DA_EQUIPE.length - 1);
  const depois = atribuirEquipe(equipe, ["outra", s.id]);
  assert.equal(depois.get(s.id), boneco); assert.notEqual(depois.get("outra"), boneco);
  assert.equal(atribuirEquipe(depois, ["outra"]).has(s.id), false);
  const muitas = atribuirEquipe(new Map(), Array.from({ length: IDS_DA_EQUIPE.length + 2 }, (_, i) => `s${i}`));
  assert.equal(muitas.size, IDS_DA_EQUIPE.length);

  const { Sim } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/sim/sim.ts");
  const arte = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/index.ts");
  const { DEFAULT_WORLD_OPTIONS } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/api.ts");
  const agora = Date.parse("2026-10-09T12:00:00Z");
  const sim = new Sim(arte, () => ({ ...DEFAULT_WORLD_OPTIONS, passearOcioso: true }), null);
  sim.applySnapshot(snapshotDoEscritorio([], {}, false, agora, new Map(), agora), agora);
  assert.equal(sim.chars.size, IDS_DA_EQUIPE.length);
  const inicio = new Map([...sim.chars].map(([id, c]) => [id, `${c.tx},${c.ty}`]));
  for (let i = 1; i <= 2400; i++) sim.update(.05, agora + i * 50);
  assert.ok([...sim.chars].some(([id, c]) => inicio.get(id) !== `${c.tx},${c.ty}`), "algum boneco da equipe andou");
  const recebeu = atribuirEquipe(new Map(), [s.id]);
  const t = agora + 2400 * 50;
  sim.applySnapshot(snapshotDoEscritorio([{ ...s, atualizadaEm: new Date(t).toISOString() }], {}, false, t, recebeu, agora), t);
  const ch = sim.chars.get(recebeu.get(s.id));
  assert.notEqual(ch.roomId, SALA_DA_EQUIPE);
  for (let i = 1; i <= 2400; i++) sim.update(.05, t + i * 50);
  assert.equal(ch.mode, "work"); assert.equal(sim.chars.size, IDS_DA_EQUIPE.length);
});

test("tempo pertence ao projeto anterior ao mudar de diretório", () => {
  const a = dados.analiseDoEscritorio([dados.registroDoEscritorio(base), dados.registroDoEscritorio({ ...base, id: "novo", cwd: "C:/Outro", evento: "Stop", recebidoEm: "2026-10-09T13:02:00Z" })], dados.diaDoEscritorio(Date.parse(base.recebidoEm)));
  assert.equal(a.projetos[0].nome, "MeuProjeto"); assert.equal(a.projetos[0].trabalho, 120000);
});
test("métricas oficiais preservam ausência, validam números e não mudam estado ou criam sessão", () => {
  assert.equal(metricasDaStatus({ session_id: "a", context_window: { total_input_tokens: null }, cost: { total_cost_usd: NaN } }), undefined);
  const m = metricasDaStatus({ session_id: "detalhes-teste", context_window: { total_input_tokens: 900, used_percentage: 15, total_output_tokens: -1 }, cost: { total_cost_usd: 0.12 }, prompt: "privado" });
  assert.equal(m.metricas.saida, undefined); assert.equal(m.metricas.custoUSD, 0.12); assert.doesNotMatch(JSON.stringify(m), /prompt|privado/);
  const anterior = useClaudeCode.getState().sessoes["detalhes-teste"];
  useClaudeCode.getState().aplicar({ ...base, id: "meta-1", sessao: m.sessao, evento: "NikoMetadadosSessao", dados: m });
  const atual = useClaudeCode.getState().sessoes[m.sessao];
  assert.equal(atual.atualizadaEm, anterior.atualizadaEm); assert.equal(atual.estado, anterior.estado); assert.equal(atual.metricas.entrada, 900);
  useClaudeCode.getState().aplicar({ ...base, id: "meta-2", sessao: "desconhecida", evento: "NikoMetadadosSessao", dados: m });
  assert.equal(useClaudeCode.getState().sessoes.desconhecida, undefined);
});
test("backup restaura configurações do escritório sem carregar comandos ou dados extras", () => {
  const config = configuracaoEscritorioValida({});
  const registro = dados.registroDoEscritorio({ ...base, recebidoEm: new Date().toISOString() });
  const b = validarBackup({ tipo: "niko-backup", versao: 1, dados: { "niko:escritorio-ias": JSON.stringify({ state: { config, registros: [{ ...registro, prompt: "privado" }], executar: "privado" } }) } });
  assert.doesNotMatch(b["niko:escritorio-ias"], /privado|prompt|executar/);
  assert.equal(JSON.parse(b["niko:escritorio-ias"]).state.config.estilo, "niko");
});
test("buscar nome personalizado encontra a sessão sem renomear o caminho original", () => {
  const s = useClaudeCode.getState().sessoes["detalhes-teste"];
  const nomes = { [String(hash32(s.id))]: "João" };
  assert.equal(agruparSessoesDoEscritorio([s], "joao", nomes)[0].sessoes[0].cwd, s.cwd);
  const idSala = agruparSessoesDoEscritorio([s])[0].id;
  assert.equal(agruparSessoesDoEscritorio([s], "equipe", {}, { [String(hash32(idSala))]: "Equipe" }).length, 1);
});
test("zoom inicial fracionado avança para o próximo nível sem saltar um nível nem inverter o sentido", () => {
  const c = new Camera(); c.minZoom = 0.2; c.zoom = 0.9;
  assert.equal(c.stepZoom(1), 1); assert.ok(c.stepZoom(-1) < c.zoom);
  c.zoom = 1.6; assert.equal(c.stepZoom(-1), 1); assert.equal(c.stepZoom(1), 2);
  assert.equal(c.stepZoom(0), c.zoom); assert.equal(c.stepZoom(NaN), c.zoom);
});

test("mapa arrasta sem clique acidental, limpa captura perdida e faz zoom contínuo no cursor", async () => {
  const { attachInput } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/input.ts");
  const documentoAnterior = globalThis.document; const janelaAnterior = globalThis.window;
  const eventos = new Map(); const teclas = new Map(); let cliques = 0;
  const canvas = {
    style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    focus: () => { globalThis.document.activeElement = canvas; }, setPointerCapture() {},
    addEventListener: (tipo, fn) => eventos.set(tipo, fn), removeEventListener: (tipo) => eventos.delete(tipo),
    closest: (seletor) => seletor.includes('[role="dialog"]') ? {} : null,
  };
  globalThis.document = { activeElement: null, querySelector: () => null };
  globalThis.window = { addEventListener: (tipo, fn) => teclas.set(tipo, fn), removeEventListener: (tipo) => teclas.delete(tipo) };
  const c = new Camera(); c.bounds = { x: -5000, y: -5000, w: 10000, h: 10000 }; c.x = 0; c.y = 0; c.zoom = 1;
  const soltar = attachInput(canvas, c, { pick: () => null, click: () => cliques++, doubleClick() {}, hover() {}, interact() {}, overview() {}, zoomStep: (n) => c.zoom = c.stepZoom(n) });
  const pointer = (tipo, x, y = 100, pointerId = 1) => eventos.get(tipo)({ button: 0, pointerType: 'mouse', pointerId, clientX: x, clientY: y });
  try {
    pointer('pointerdown', 100); pointer('pointermove', 110); pointer('pointerup', 110);
    assert.equal(c.x, -10); assert.equal(cliques, 0);
    pointer('pointerdown', 100); pointer('pointerup', 102); assert.equal(cliques, 1);
    pointer('pointerdown', 100); pointer('lostpointercapture', 100); pointer('pointermove', 200); assert.equal(c.x, -10);
    const antes = c.screenToWorld(300, 200);
    eventos.get('wheel')({ preventDefault() {}, clientX: 300, clientY: 200, deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false, shiftKey: false });
    assert.ok(c.zoom > 1 && c.zoom < 1.3);
    const depois = c.screenToWorld(300, 200);
    assert.ok(Math.abs(antes.x - depois.x) < 1); assert.ok(Math.abs(antes.y - depois.y) < 1);
    const x = c.x;
    teclas.get('keydown')({ key: 'ArrowRight', target: canvas, preventDefault() {} });
    assert.ok(c.x > x);
  } finally { soltar(); globalThis.document = documentoAnterior; globalThis.window = janelaAnterior; }
  assert.equal(eventos.size, 0); assert.equal(teclas.size, 0);
});

test("sessão ociosa antiga continua no lazer e volta ao trabalho ou à aprovação", async () => {
  const { Sim } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/sim/sim.ts");
  const arte = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/art/index.ts");
  const { DEFAULT_WORLD_OPTIONS } = await vite.ssrLoadModule("/src/modulos/escritorio/motor/client/src/world/api.ts");
  const { sessoesDeDemonstracao } = await vite.ssrLoadModule("/src/modulos/escritorio/sessoesDoEscritorio.ts");
  const agora = Date.parse("2026-10-09T12:00:00Z");
  const exemplos = sessoesDeDemonstracao(agora);
  exemplos[4] = { ...exemplos[4], atualizadaEm: new Date(agora - 30 * 60000).toISOString() };
  const sim = new Sim(arte, () => ({ ...DEFAULT_WORLD_OPTIONS, passearOcioso: true }), null);
  sim.applySnapshot(snapshotDoEscritorio(exemplos, {}, false, agora), agora);
  const ch = sim.chars.get("demo:4"); ch.nextOutingAt = 1;
  let foiAoLazer = false;
  for (let i = 1; i <= 3600; i++) {
    sim.update(.05, agora + i * 50);
    foiAoLazer ||= sim.building.core.some((area) => ['core:copa', 'core:lounge', 'core:recepcao'].includes(area.id) && ch.tx >= area.rect.x && ch.ty >= area.rect.y && ch.tx < area.rect.x + area.rect.w && ch.ty < area.rect.y + area.rect.h);
  }
  assert.ok(foiAoLazer); assert.notEqual(ch.pose, 'sleep');
  for (const estado of ['trabalhando', 'aprovacao']) {
    exemplos[4] = { ...exemplos[4], estado, atualizadaEm: new Date(agora + 180000).toISOString() };
    sim.applySnapshot(snapshotDoEscritorio(exemplos, {}, false, agora + 180000), agora + 180000);
    for (let i = 1; i <= 1200; i++) sim.update(.05, agora + 180000 + i * 50);
    assert.equal(ch.mode, estado === 'trabalhando' ? 'work' : 'wait'); assert.equal(ch.atSpot, ch.homeSpot);
  }
});

test("privacidade não renderiza comandos, diffs ou decisões cegas de aprovação", async () => {
  const { PainelDaSessao } = await vite.ssrLoadModule("/src/modulos/escritorio/PainelDaSessao.tsx");
  const sessao = { id: "privacidade-teste", ferramenta: "claude", projeto: "Projeto", cwd: "C:/CAMINHO_PRIVADO_TESTE", estado: "aprovacao", passos: [], ferramentasUsadas: 0, iniciadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString() };
  const pedido = { pedidoId: "privacidade-pendente", ferramentaDeCodigo: "claude", sessao: sessao.id, projeto: "Projeto", ferramenta: "Bash", alvo: "", entrada: "COMANDO_PRIVADO_TESTE", recebidoEm: sessao.iniciadaEm, sugestoes: [{ toolName: "Bash", ruleContent: "SEGREDO_REGRA_TESTE" }] };
  for (const alteracao of [undefined, { arquivo: "ARQUIVO_PRIVADO_TESTE", trechos: [{ antes: "ANTES_PRIVADO_TESTE", depois: "DEPOIS_PRIVADO_TESTE" }] }]) {
    const html = renderToStaticMarkup(createElement(PainelDaSessao, { sessao, nome: "Teste", pedido: { ...pedido, alteracao }, demonstracao: false, ocultar: true, agora: Date.now(), aoFechar() {}, aoRenomear() {}, aoMostrarPedido() {} }));
    assert.doesNotMatch(html, /PRIVADO_TESTE|SEGREDO_REGRA_TESTE|vsc-permissao|Permitir/);
    assert.match(html, /Desativar privacidade e ver pedido/);
  }
  const html = renderToStaticMarkup(createElement(PainelDaSessao, { sessao, nome: "Teste", pedido, demonstracao: false, ocultar: false, agora: Date.now(), aoFechar() {}, aoRenomear() {} }));
  assert.match(html, /COMANDO_PRIVADO_TESTE/);
});

test("mais de oito sessões nunca expulsa as ativas ou uma aprovação pendente", () => {
  const anterior = useClaudeCode.getState();
  const aplicar = anterior.aplicar;
  try {
    useClaudeCode.setState({ sessoes: {}, ordem: [], pedidos: [], focada: null });
    aplicar({ ...base, id: "limite-pedido", sessao: "limite-pendente", evento: "PermissionRequest", pedidoId: "limite-pendente-id", recebidoEm: new Date().toISOString() });
    for (let i = 0; i < 12; i++) aplicar({ ...base, id: `limite-ativa-${i}`, sessao: `limite-ativa-${i}`, recebidoEm: new Date().toISOString() });
    for (let i = 0; i < 12; i++) aplicar({ ...base, id: `limite-ociosa-${i}`, sessao: `limite-ociosa-${i}`, evento: "SessionStart", recebidoEm: new Date().toISOString() });
    const s = useClaudeCode.getState();
    assert.ok(s.sessoes['limite-pendente']);
    assert.ok(s.pedidos.some((p) => p.sessao === 'limite-pendente'));
    assert.equal(s.ordem.length, 21);
    assert.equal(s.ordem.filter((id) => s.sessoes[id].estado === 'trabalhando').length, 12);
  } finally { useClaudeCode.setState(anterior); }
});

test("reconexão elimina sessões encerradas e aprovações expiradas mesmo sem os eventos antigos", () => {
  const anterior = useClaudeCode.getState();
  const aplicar = anterior.aplicar;
  try {
    useClaudeCode.setState({ sessoes: {}, ordem: [], pedidos: [], focada: null });
    aplicar({ ...base, id: "sincronia-encerrada", sessao: "sincronia-encerrada" });
    aplicar({ ...base, id: "sincronia-pedido", sessao: "sincronia-viva", evento: "PermissionRequest", pedidoId: "sincronia-expirou" });
    aplicar({ ...base, id: "sincronia-malformada", evento: "NikoSessoesAtuais", dados: { sessoes: null, pedidos: [] } });
    assert.ok(useClaudeCode.getState().sessoes['sincronia-encerrada']);
    aplicar({ ...base, id: "sincronia-atual", evento: "NikoSessoesAtuais", dados: { sessoes: ['sincronia-viva'], pedidos: [] } });
    const s = useClaudeCode.getState();
    assert.deepEqual(s.ordem, ['sincronia-viva']);
    assert.equal(s.pedidos.length, 0);
    assert.equal(s.sessoes['sincronia-viva'].estado, 'esperando');
    aplicar({ ...base, id: "sincronia-reinicio-ponte", evento: "NikoSessoesAtuais", dados: { sessoes: [], pedidos: [] } });
    assert.equal(useClaudeCode.getState().ordem.length, 0);
  } finally { useClaudeCode.setState(anterior); }
});

test("apagar análises bloqueia replay após reidratar e mantém o corte no backup", async () => {
  const { useEscritorioIas } = await vite.ssrLoadModule("/src/estado/escritorioIas.ts");
  await useEscritorioIas.persist.rehydrate();
  const anterior = useEscritorioIas.getState();
  const em = Date.now();
  const antigo = { ...base, id: "limpeza-replay", recebidoEm: new Date(em - 1000).toISOString() };
  try {
    useEscritorioIas.setState({ registros: [], ignorarAte: 0 });
    const s = useEscritorioIas.getState(); s.registrar(antigo); s.descarregar();
    assert.equal(useEscritorioIas.getState().registros.length, 1);
    s.limpar();
    const corte = useEscritorioIas.getState().ignorarAte;
    const salvo = { state: { config: s.config, registros: [], ignorarAte: corte } };
    const b = validarBackup({ tipo: "niko-backup", versao: 1, dados: { 'niko:escritorio-ias': JSON.stringify(salvo) } });
    assert.equal(JSON.parse(b['niko:escritorio-ias']).state.ignorarAte, corte);
    const storage = useEscritorioIas.persist.getOptions().storage;
    await storage.setItem('niko:escritorio-ias', salvo);
    useEscritorioIas.setState({ ignorarAte: 0 });
    await storage.setItem('niko:escritorio-ias', salvo);
    await useEscritorioIas.persist.rehydrate();
    s.registrar(antigo); s.descarregar();
    assert.equal(useEscritorioIas.getState().registros.length, 0);
    s.registrar({ ...antigo, id: "limpeza-evento-novo", recebidoEm: new Date(corte + 1).toISOString() }); s.descarregar();
    assert.equal(useEscritorioIas.getState().registros.length, 1);
  } finally { useEscritorioIas.getState().descarregar(); useEscritorioIas.setState(anterior); }
});

test("rajada de eventos das análises salva um lote e deduplica antes de persistir", async () => {
  const { useEscritorioIas } = await vite.ssrLoadModule("/src/estado/escritorioIas.ts");
  await useEscritorioIas.persist.rehydrate();
  const anterior = useEscritorioIas.getState();
  useEscritorioIas.setState({ registros: [], ignorarAte: 0 });
  let atualizacoes = 0;
  const soltar = useEscritorioIas.subscribe(() => atualizacoes++);
  try {
    const s = useEscritorioIas.getState();
    for (let i = 0; i < 100; i++) {
      const e = { ...base, id: `lote-${i}`, recebidoEm: new Date().toISOString() };
      s.registrar(e); s.registrar(e);
    }
    assert.equal(atualizacoes, 0);
    s.descarregar();
    assert.equal(atualizacoes, 1);
    assert.equal(useEscritorioIas.getState().registros.length, 100);
  } finally { soltar(); useEscritorioIas.getState().descarregar(); useEscritorioIas.setState(anterior); }
});

test("métricas mostram data real e sinalizam quando a última informação ficou antiga", async () => {
  const { metricasDesatualizadas } = await vite.ssrLoadModule("/src/modulos/escritorio/metricasDaSessao.ts");
  const { AtualizacaoDasMetricas } = await vite.ssrLoadModule("/src/modulos/escritorio/AtualizacaoDasMetricas.tsx");
  const agora = Date.now(); const metricas = { entrada: 42, em: new Date(agora - 300000).toISOString() };
  assert.equal(metricasDesatualizadas({ ...metricas, em: new Date(agora).toISOString() }, agora), false);
  assert.equal(metricasDesatualizadas(metricas, agora), true);
  assert.equal(metricasDesatualizadas({ ...metricas, em: 'inválida' }, agora), true);
  const html = renderToStaticMarkup(createElement(AtualizacaoDasMetricas, { metricas, agora }));
  assert.match(html, /Métricas atualizadas em/); assert.match(html, /Dados antigos/); assert.ok(html.includes(metricas.em));
});

test("mapa pausado mantém câmera e zoom, ignora tamanho zero e não agenda animações", async () => {
  const originais = Object.fromEntries(['window', 'document', 'ResizeObserver', 'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((k) => [k, globalThis[k]]));
  const quadros = new Map(); let sequencia = 0; let redimensionar; let camera;
  const desenho = { valor: 0 };
  const medida = { width: 800, height: 600, left: 0, top: 0 };
  const canvas = Object.assign(new EventTarget(), { style: {}, width: 800, height: 600, getBoundingClientRect: () => medida, focus() {}, setPointerCapture() {} });
  globalThis.window = Object.assign(new EventTarget(), { devicePixelRatio: 1, matchMedia: () => Object.assign(new EventTarget(), { matches: true }) });
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.ResizeObserver = class { constructor(fn) { redimensionar = fn; } observe() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const id = ++sequencia; quadros.set(id, fn); return id; };
  globalThis.cancelAnimationFrame = (id) => quadros.delete(id);
  globalThis.__capturarCameraEscritorio = (c) => { camera = c; };
  globalThis.__desenhoEscritorio = desenho;
  const isolado = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true }, plugins: [{
    name: 'diagnostico-ciclo-camera',
    load(id) {
      const caminho = id.replace(/\\/g, '/');
      if (caminho.endsWith('/world/render/renderer.ts')) return 'export class Renderer { ctx = { fillText() {} }; heads = new Map(); sync() {} frame() { globalThis.__desenhoEscritorio.valor++; } pruneHeads() {} }';
      if (caminho.endsWith('/world/render/overlay.ts')) return 'export class Overlay { draw() {} }';
      if (caminho.endsWith('/world/camera.ts')) return `export * from ${JSON.stringify(`${id}?original`)}; import { Camera as Original } from ${JSON.stringify(`${id}?original`)}; export class Camera extends Original { constructor() { super(); globalThis.__capturarCameraEscritorio(this); } }`;
    },
  }] });
  let mundo;
  try {
    const { criarMundoDoEscritorio } = await isolado.ssrLoadModule('/src/modulos/escritorio/mundoDoEscritorio.ts');
    mundo = criarMundoDoEscritorio(canvas, () => {}, () => assert.fail('Erro inesperado na cena'));
    mundo.aproximar(1);
    const antes = { x: camera.x, y: camera.y, zoom: camera.zoom };
    mundo.visibilidade(false);
    assert.equal(quadros.size, 0);
    const pinturasAntes = desenho.valor;
    medida.width = 0; medida.height = 0; redimensionar();
    assert.deepEqual({ x: camera.x, y: camera.y, zoom: camera.zoom }, antes);
    assert.equal(desenho.valor, pinturasAntes);
    medida.width = 800; medida.height = 600; redimensionar();
    assert.equal(quadros.size, 0);
    mundo.visibilidade(true);
    assert.deepEqual({ x: camera.x, y: camera.y, zoom: camera.zoom }, antes);
    assert.equal(quadros.size, 1);
    globalThis.document.hidden = true;
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(quadros.size, 0);
    globalThis.document.hidden = false;
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual({ x: camera.x, y: camera.y, zoom: camera.zoom }, antes);
    assert.equal(quadros.size, 1);
    mundo.destruir(); mundo = undefined; assert.equal(quadros.size, 0);
  } finally {
    mundo?.destruir(); await isolado.close();
    for (const [k, v] of Object.entries(originais)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    delete globalThis.__capturarCameraEscritorio; delete globalThis.__desenhoEscritorio;
  }
});

test("esconder a janela mantém o canvas montado em vez de recriar o escritório", async () => {
  const documentoAnterior = globalThis.document;
  const { EscritorioIas } = await vite.ssrLoadModule("/src/modulos/escritorio/EscritorioIas.tsx");
  try {
    globalThis.document = { hidden: true };
    const html = renderToStaticMarkup(createElement(EscritorioIas));
    assert.match(html, /<section[^>]+class="escritorio-ias ei"[^>]+hidden=""/);
    assert.match(html, /<canvas[^>]+class="ei-mundo-canvas"/);
  } finally { if (documentoAnterior === undefined) delete globalThis.document; else globalThis.document = documentoAnterior; }
});
