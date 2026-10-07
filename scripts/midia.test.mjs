import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const servidor = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => servidor.close());
const { useMidia, midiaAtivaNaIlha } = await servidor.ssrLoadModule("/src/estado/midia.ts");
const faixa = { titulo: "Faixa de teste", artista: "Artista", app: "Spotify", duracao: 180, capa: null };
const estado = (tocando) => ({ sessao: true, titulo: faixa.titulo, artista: faixa.artista, app: "Spotify.exe", duracao: 180, tocando, posicao: 30 });
beforeEach(() => {
  useMidia.setState({ disponivel: true, podeAlternar: true, faixa: null, tocando: false, tocouPorUltimoEm: 0, lidoEm: 0, posicao: 0, podeAvancar: false, podeVoltar: false, podeBuscar: false });
});

test("música pausada não toma a ilha, mesmo tocando há poucos segundos", () => {
  const agora = Date.now();
  assert.equal(midiaAtivaNaIlha({ faixa, tocando: false, tocouPorUltimoEm: agora - 1000 }), false);
  assert.equal(midiaAtivaNaIlha({ faixa, tocando: true, tocouPorUltimoEm: agora }), true);
  assert.equal(midiaAtivaNaIlha({ faixa: null, tocando: true, tocouPorUltimoEm: agora }), false);
});

test("consulta antiga não desfaz uma pausa confirmada pelo Windows", async () => {
  let devolverAntiga;
  globalThis.fetch = async (url) => url === "/ponte/midia"
    ? new Promise((resolver) => { devolverAntiga = resolver; })
    : Response.json(estado(false));
  useMidia.setState({ faixa, tocando: true });
  const antiga = useMidia.getState().sincronizar();
  await useMidia.getState().alternar();
  devolverAntiga(Response.json(estado(true)));
  await antiga;
  assert.equal(useMidia.getState().tocando, false);
});

test("atualizações periódicas não acumulam consultas simultâneas", async () => {
  let chamadas = 0;
  const devolucoes = [];
  globalThis.fetch = async () => { chamadas++; return new Promise((resolver) => { devolucoes.push(resolver); }); };
  const primeira = useMidia.getState().sincronizar();
  const segunda = useMidia.getState().sincronizar();
  const quantidade = chamadas;
  devolucoes.forEach((devolver) => devolver(Response.json(estado(false))));
  await Promise.all([primeira, segunda]);
  assert.equal(quantidade, 1);
});

test("falha ao tocar não inventa uma reprodução", async () => {
  useMidia.setState({ faixa, tocando: false });
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await useMidia.getState().alternar();
  assert.equal(useMidia.getState().tocando, false);
});


test("leitura Linux não envia controles indisponíveis", async () => {
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; return Response.json({}); };
  useMidia.setState({ podeAlternar: false, podeAvancar: false, podeVoltar: false, podeBuscar: false });
  await useMidia.getState().alternar();
  await useMidia.getState().proxima();
  await useMidia.getState().anterior();
  await useMidia.getState().buscar(10);
  assert.equal(chamadas, 0);
});

 test("comandos usam o player exibido e não se sobrepõem", async () => {
  const alvo = {player: "org.mpris.MediaPlayer2.firefox", dono: ":1.42", faixaId: "/track/test"};
  let resolver;
  const pedidos = [];
  globalThis.fetch = async (url, options) => {
    pedidos.push({url, body: JSON.parse(options.body)});
    return new Promise(r => { resolver = r; });
  };
  useMidia.setState({alvo, faixa, podeAlternar: true, podeAvancar: true});
  const primeira = useMidia.getState().alternar();
  await useMidia.getState().proxima();
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0].body, alvo);
  resolver(Response.json({sessao: false}));
  await primeira;
  assert.equal(useMidia.getState().faixa, null);
  assert.equal(useMidia.getState().podeAlternar, false);
});
