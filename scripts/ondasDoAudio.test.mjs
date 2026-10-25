import test, { after } from "node:test";
import assert from "node:assert/strict";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());

const { ondasDoAudio, formatarDuracao } = await vite.ssrLoadModule("/src/utilitarios/ondasDoAudio.ts");

test("ondas do áudio seguem o volume real e a mais alta vale 1", () => {
  const amostras = new Float32Array(400);
  for (let i = 0; i < 400; i++) amostras[i] = i < 100 ? 0 : i < 200 ? 0.2 : i < 300 ? 0.8 : 0.4;
  assert.deepEqual(ondasDoAudio(amostras, 4), [0, 0.25, 1, 0.5]);
  assert.deepEqual(ondasDoAudio(new Float32Array(0), 3), [0, 0, 0]);
  assert.deepEqual(ondasDoAudio(new Float32Array(10), 2), [0, 0]);
  assert.equal(ondasDoAudio(new Float32Array(5).fill(0.5), 34).length, 34);
});

test("duração do áudio aparece em minutos e horas", () => {
  assert.equal(formatarDuracao(0), "0:00");
  assert.equal(formatarDuracao(7.9), "0:07");
  assert.equal(formatarDuracao(83), "1:23");
  assert.equal(formatarDuracao(3725), "1:02:05");
  assert.equal(formatarDuracao(Infinity), "0:00");
  assert.equal(formatarDuracao(Number.NaN), "0:00");
});
