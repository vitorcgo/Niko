import test from "node:test";
import assert from "node:assert/strict";
import { createLogger, createServer, loadConfigFromFile } from "vite";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const arquivo = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

for (const carregador of ["bundle", "native"]) {
  test(`configuração do Vite carrega com ${carregador} sem incompatibilidades nativas`, async () => {
    const avisos = [];
    const logger = createLogger("silent");
    logger.warn = (mensagem) => avisos.push(mensagem);
    const resultado = await loadConfigFromFile({ command: "serve", mode: "development" }, arquivo, raiz, "silent", logger, carregador);
    assert.ok(resultado);
    assert.equal(resultado.config.server.host, "localhost");
    assert.equal(resultado.config.server.port, 5420);
    const plugins = resultado.config.plugins.flat(Infinity).filter(Boolean);
    assert.ok(plugins.some((plugin) => plugin.name === "niko-ponte-local"));
    assert.ok(plugins.some((plugin) => plugin.name === "niko-politica-seguranca"));
    assert.ok(!avisos.some((aviso) => aviso.includes("unsupported by") || aviso.includes("without a file extension")), avisos.join("\n"));
  });
}

test("ponte no carregador nativo atende somente pedidos locais autorizados", async () => {
  const servidor = await createServer({
    root: raiz,
    configFile: arquivo,
    configLoader: "native",
    logLevel: "silent",
    appType: "custom",
    server: { host: "127.0.0.1", port: 0, strictPort: true, hmr: false, watch: null, preTransformRequests: false },
    optimizeDeps: { noDiscovery: true, entries: [] },
  });
  try {
    await servidor.listen();
    const endereco = servidor.httpServer.address();
    const url = `http://127.0.0.1:${endereco.port}/ponte/google/login-direto`;
    const semAutorizacao = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(semAutorizacao.status, 403);
    await semAutorizacao.body.cancel();
    const cabecalhos = { "x-niko": "1", "x-niko-token": process.env.NIKO_TOKEN };
    const origemExterna = await fetch(url, { headers: { ...cabecalhos, origin: "https://externo.example" }, signal: AbortSignal.timeout(5000) });
    assert.equal(origemExterna.status, 403);
    await origemExterna.body.cancel();
    const resposta = await fetch(url, { headers: cabecalhos, signal: AbortSignal.timeout(5000) });
    assert.equal(resposta.status, 200);
    assert.equal(typeof (await resposta.json()).disponivel, "boolean");
  } finally {
    await servidor.close();
  }
});
