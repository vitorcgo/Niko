import test, { after } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { createHmac } from "node:crypto";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());

const caixa = await vite.ssrLoadModule("/servidor/whatsapp/caixa.ts");
const zip = await vite.ssrLoadModule("/servidor/whatsapp/zip.ts");
const gowa = await vite.ssrLoadModule("/servidor/whatsapp/gowa.ts");

function zipComArquivo(nome, conteudo, compactar) {
  const dados = compactar ? deflateRawSync(conteudo) : conteudo;
  const nomeB = Buffer.from(nome);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(compactar ? 8 : 0, 8);
  local.writeUInt32LE(crc32(conteudo), 14);
  local.writeUInt32LE(dados.length, 18);
  local.writeUInt32LE(conteudo.length, 22);
  local.writeUInt16LE(nomeB.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(compactar ? 8 : 0, 10);
  central.writeUInt32LE(crc32(conteudo), 16);
  central.writeUInt32LE(dados.length, 20);
  central.writeUInt32LE(conteudo.length, 24);
  central.writeUInt16LE(nomeB.length, 28);
  central.writeUInt32LE(0, 42);
  const inicioCentral = local.length + nomeB.length + dados.length;
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(1, 8);
  fim.writeUInt16LE(1, 10);
  fim.writeUInt32LE(central.length + nomeB.length, 12);
  fim.writeUInt32LE(inicioCentral, 16);
  return Buffer.concat([local, nomeB, dados, central, nomeB, fim]);
}

test("extrator de zip tira o arquivo certo, com e sem compressão", () => {
  const conteudo = Buffer.from("binario do gateway ".repeat(200));
  for (const compactar of [false, true]) {
    const z = zipComArquivo("windows-amd64.exe", conteudo, compactar);
    assert.deepEqual(zip.nomesNoZip(z), ["windows-amd64.exe"]);
    assert.ok(zip.extrairDoZip(z, "windows-amd64.exe").equals(conteudo));
    assert.throws(() => zip.extrairDoZip(z, "outro"), /zip_sem_arquivo/);
  }
  assert.throws(() => zip.extrairDoZip(Buffer.from("nao e zip"), "x"), /zip_invalido/);
});

test("gateway do whatsapp escolhe o build certo e só baixa do github", () => {
  assert.deepEqual(gowa.alvoDaPlataforma("win32", "x64"), { so: "windows", arq: "amd64" });
  assert.deepEqual(gowa.alvoDaPlataforma("linux", "arm64"), { so: "linux", arq: "arm64" });
  assert.equal(gowa.alvoDaPlataforma("win32", "arm64"), null);
  assert.equal(gowa.alvoDaPlataforma("darwin", "x64"), null);
  const arquivos = [
    { nome: "whatsapp_9.6.0_windows_amd64.zip", url: "https://github.com/a", tamanho: 1, digest: `sha256:${"a".repeat(64)}` },
    { nome: "checksums.txt", url: "https://github.com/b", tamanho: 1 },
  ];
  const escolha = gowa.escolherArquivos(arquivos, "9.6.0", { so: "windows", arq: "amd64" });
  assert.equal(escolha.binario, "windows-amd64.exe");
  assert.equal(gowa.sha256Esperado(escolha.zip, `${"b".repeat(64)}  whatsapp_9.6.0_windows_amd64.zip\n`), "b".repeat(64));
  assert.equal(gowa.sha256Esperado(escolha.zip, null), "a".repeat(64));
  assert.equal(gowa.escolherArquivos(arquivos, "9.6.0", { so: "linux", arq: "amd64" }), null);
  assert.ok(gowa.hostDoGithub("https://objects.githubusercontent.com/x"));
  assert.ok(!gowa.hostDoGithub("https://github.com.evil.com/x"));
  const ambiente = gowa.ambienteDoGowa({ porta: 51234, acesso: "niko:x", urlDoWebhook: "http://127.0.0.1:1/w", segredoDoWebhook: "s" }, {});
  assert.equal(ambiente.APP_HOST, "127.0.0.1");
  assert.equal(ambiente.APP_UI_ENABLED, "false");
  assert.equal(ambiente.WHATSAPP_AUTO_DOWNLOAD_MEDIA, "false");
  assert.equal(ambiente.WHATSAPP_WEBHOOK_EVENTS, "message");
});

test("caixa do whatsapp silencia grupos sem menção, ignora conversas e limita envios", () => {
  const c = new caixa.CaixaWhatsapp();
  const filtros = { silenciarGrupos: true, ignoradas: ["5511999990000@s.whatsapp.net"] };
  const m = (id, conversa, extra = {}) => ({ id, conversa, remetente: conversa, nomeRemetente: "Ana", texto: "oi", midia: "nenhuma", data: new Date(Date.now() + Number(id.slice(1)) * 1000).toISOString(), minha: false, mencionaMe: false, ...extra });
  assert.equal(c.adicionar(m("m1", "5511888880000@c.us"), filtros), "avisar");
  assert.equal(c.adicionar(m("m1", "5511888880000@c.us"), filtros), "repetida");
  assert.equal(c.adicionar(m("m2", "5511999990000:3@s.whatsapp.net"), filtros), "ignorada");
  assert.equal(c.adicionar(m("m3", "1203@g.us"), filtros), "silenciosa");
  assert.equal(c.adicionar(m("m4", "1203@g.us", { mencionaMe: true }), filtros), "avisar");
  assert.equal(c.adicionar(m("m5", "5511888880000@s.whatsapp.net", { minha: true }), filtros), "silenciosa");
  const pessoa = c.conversas.get("5511888880000@s.whatsapp.net");
  assert.equal(pessoa.nome, "Ana");
  assert.equal(pessoa.naoLidas, 0);
  assert.equal(c.naoLidasVisiveis(filtros), 2);
  c.registrarConversa("5511777770000@s.whatsapp.net", "Arquivo", new Date().toISOString(), filtros, true);
  assert.ok(!c.visiveis(filtros).some((x) => x.id === "5511777770000@s.whatsapp.net"));
  assert.ok(c.visiveis({ ...filtros, esconderArquivadas: false }).some((x) => x.id === "5511777770000@s.whatsapp.net"));
  assert.equal(c.adicionar(m("m6", "5511777770000@s.whatsapp.net"), filtros), "silenciosa");
  assert.ok(c.visiveis(filtros).some((x) => x.grupo));
  assert.ok(!c.visiveis({ ...filtros, esconderGrupos: true }).some((x) => x.grupo));
  assert.equal(c.adicionar(m("m7", "1203@g.us", { mencionaMe: true }), { ...filtros, esconderGrupos: true }), "silenciosa");
  assert.equal(caixa.recusaDaResposta("  ", "5511888880000@s.whatsapp.net", c), "vazia");
  assert.equal(caixa.recusaDaResposta("ok", "5500000000000@s.whatsapp.net", c), "sem_conversa");
  assert.equal(caixa.recusaDaResposta("ok", "5511888880000@c.us", c), null);
  const limite = new caixa.LimiteDeEnvios(2, 60_000);
  assert.ok(limite.permitir(0) && limite.permitir(1));
  assert.ok(!limite.permitir(2));
  assert.ok(limite.permitir(70_000));
  assert.equal(caixa.iniciais("Maria Clara"), "MC");
  assert.equal(caixa.iniciais("+55 11"), "#");
});

test("status e canais do whatsapp não viram conversa", () => {
  const c = new caixa.CaixaWhatsapp();
  const filtros = { silenciarGrupos: true, ignoradas: [] };
  const m = (id, conversa) => ({ id, conversa, remetente: "5511888880000@s.whatsapp.net", nomeRemetente: "Ana", texto: "foto", midia: "imagem", data: new Date().toISOString(), minha: false, mencionaMe: false });
  assert.equal(c.adicionar(m("s1", "status@broadcast"), filtros), "ignorada");
  assert.equal(c.adicionar(m("s2", "120363000000@newsletter"), filtros), "ignorada");
  c.registrarConversa("status@broadcast", "Status", new Date().toISOString(), filtros);
  assert.equal(c.visiveis(filtros).length, 0);
  assert.equal(c.naoLidasVisiveis(filtros), 0);
});

test("mensagem enviada pega o horário do servidor e para de furar a ordem da conversa", () => {
  const c = new caixa.CaixaWhatsapp();
  const filtros = { silenciarGrupos: true, ignoradas: [] };
  const jid = "5511888880000@s.whatsapp.net";
  const m = (id, data, extra = {}) => ({ id, conversa: jid, remetente: jid, nomeRemetente: "Ana", texto: id, midia: "nenhuma", data, minha: false, mencionaMe: false, ...extra });
  c.adicionar(m("antiga", "2026-10-25T12:00:00.000Z"), filtros, true);
  c.adicionar(m("minha", "2026-10-25T12:05:00.000Z", { minha: true, local: true }), filtros);
  c.adicionar(m("resposta", "2026-10-25T12:03:30.000Z"), filtros);
  assert.deepEqual(c.conversas.get(jid).mensagens.map((x) => x.id), ["antiga", "resposta", "minha"]);
  assert.equal(c.adicionar(m("minha", "2026-10-25T12:03:00.000Z", { minha: true }), filtros, true), "repetida");
  const conversa = c.conversas.get(jid);
  assert.deepEqual(conversa.mensagens.map((x) => x.id), ["antiga", "minha", "resposta"]);
  assert.equal(conversa.mensagens[1].local, false);
  assert.equal(conversa.ultimaAtividade, "2026-10-25T12:03:30.000Z");
  c.adicionar(m("resposta", "2026-10-25T13:00:00.000Z"), filtros, true);
  assert.equal(conversa.mensagens.at(-1).data, "2026-10-25T12:03:30.000Z");
});

test("lista do whatsapp na ilha filtra por não lidas, grupos e nome sem ligar para acento de caixa", async () => {
  const { filtrarConversas } = await vite.ssrLoadModule("/src/utilitarios/conversasWhatsapp.ts");
  const c = (id, nome, grupo, naoLidas) => ({ id, nome, grupo, naoLidas, mensagens: [], ultimaAtividade: "" });
  const lista = [c("1", "Juliana", false, 1), c("2", "Família Silva", true, 3), c("3", "Marcos", false, 0)];
  assert.deepEqual(filtrarConversas(lista, "naoLidas", "").map((x) => x.id), ["1", "2"]);
  assert.deepEqual(filtrarConversas(lista, "grupos", "").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarConversas(lista, "todas", "FAMÍ").map((x) => x.id), ["2"]);
  assert.deepEqual(filtrarConversas(lista, "grupos", "marcos"), []);
});

test("consulta antiga do whatsapp que chega atrasada não apaga mensagem recém-enviada", async () => {
  const { useWhatsapp } = await vite.ssrLoadModule("/src/estado/whatsapp.ts");
  const { whatsappPonte } = await vite.ssrLoadModule("/src/ponte/whatsapp.ts");
  const original = whatsappPonte.estado;
  const respostas = [];
  whatsappPonte.estado = () => new Promise((resolver) => respostas.push(resolver));
  try {
    const lenta = useWhatsapp.getState().carregar();
    await new Promise((r) => setTimeout(r, 5));
    const rapida = useWhatsapp.getState().carregar();
    respostas[1]({ naoLidas: 2 });
    await rapida;
    respostas[0]({ naoLidas: 1 });
    await lenta;
    assert.equal(useWhatsapp.getState().estado.naoLidas, 2);
  } finally {
    whatsappPonte.estado = original;
  }
});

test("webhook do whatsapp só aceita a assinatura certa e lê a mensagem", () => {
  const corpo = Buffer.from(JSON.stringify({ event: "message", device_id: "5511777770000@s.whatsapp.net", payload: { id: "ABC", chat_id: "1203@g.us", from: "5511888880000@s.whatsapp.net", from_name: "Bia", body: "@5511777770000 olha", timestamp: "2026-10-22T10:00:00Z", is_from_me: false, image: {} } }));
  const assinatura = `sha256=${createHmac("sha256", "segredo").update(corpo).digest("hex")}`;
  assert.ok(caixa.webhookAutentico(corpo, assinatura, "segredo"));
  assert.ok(!caixa.webhookAutentico(corpo, assinatura, "outro"));
  assert.ok(!caixa.webhookAutentico(corpo, undefined, "segredo"));
  const msg = caixa.mensagemDoWebhook(JSON.parse(corpo.toString()));
  assert.equal(msg.midia, "imagem");
  assert.equal(msg.mencionaMe, true);
  assert.equal(msg.nomeRemetente, "Bia");
  assert.equal(caixa.mensagemDoWebhook({ event: "message.ack", payload: {} }), null);
  assert.deepEqual(caixa.dispositivoDoGateway({ results: [{ id: "niko", state: "logged_in", jid: "551@s.whatsapp.net" }] }), { id: "niko", vinculo: "conectado", eu: "551@s.whatsapp.net" });
  assert.equal(caixa.dispositivoDoGateway({ results: [{ id: "niko", state: "disconnected" }] }).vinculo, "precisa_qr");
  assert.deepEqual(caixa.caminhoDoQr({ results: { qr_link: "http://localhost:3000/statics/qrcode/x.png", qr_duration: 30 } }), { caminho: "/statics/qrcode/x.png", segundos: 30 });
});

