import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const { useMedia, mediaActiveIsland } = await server.ssrLoadModule("/src/state/media.ts");
const banner = { titulo: "Faixa de teste", artista: "Artista", app: "Spotify", duracao: 180, capa: null };
const state = (playing) => ({ sessao: true, titulo: banner.titulo, artista: banner.artista, app: "Spotify.exe", duracao: 180, tocando: playing, posicao: 30 });
beforeEach(() => {
  useMedia.setState({ disponivel: true, faixa: null, tocando: false, tocouPorUltimoEm: 0, lidoEm: 0, posicao: 0, podeAvancar: false, podeVoltar: false, podeBuscar: false });
});

test("Paused music does not take over the island even if it played recently", () => {
  const now = Date.now();
  assert.equal(mediaActiveIsland({ faixa: banner, tocando: false, tocouPorUltimoEm: now - 1000 }), false);
  assert.equal(mediaActiveIsland({ faixa: banner, tocando: true, tocouPorUltimoEm: now }), true);
  assert.equal(mediaActiveIsland({ faixa: null, tocando: true, tocouPorUltimoEm: now }), false);
});

test("Stale reads do not undo a pause confirmed by Windows", async () => {
  let returnPrevious;
  globalThis.fetch = async (url) => url === "/ponte/midia"
    ? new Promise((resolve) => { returnPrevious = resolve; })
    : Response.json(state(false));
  useMedia.setState({ faixa: banner, tocando: true });
  const previous = useMedia.getState().synchronize();
  await useMedia.getState().toggle();
  returnPrevious(Response.json(state(true)));
  await previous;
  assert.equal(useMedia.getState().tocando, false);
});

test("Periodic updates do not accumulate simultaneous requests", async () => {
  let calls = 0;
  const refunds = [];
  globalThis.fetch = async () => { calls++; return new Promise((resolve) => { refunds.push(resolve); }); };
  const first = useMedia.getState().synchronize();
  const second = useMedia.getState().synchronize();
  const quantity = calls;
  refunds.forEach((returnValue) => returnValue(Response.json(state(false))));
  await Promise.all([first, second]);
  assert.equal(quantity, 1);
});

test("Playback failures do not invent a playing state", async () => {
  useMedia.setState({ faixa: banner, tocando: false });
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await useMedia.getState().toggle();
  assert.equal(useMedia.getState().tocando, false);
});
