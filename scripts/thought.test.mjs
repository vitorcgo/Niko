import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const { createThoughtFilter } = await server.ssrLoadModule("/server/thought.ts");

test("Thought tags split across stream chunks never expose hidden content", () => {
  const filter = createThoughtFilter();
  const chunks = ["<thi", "nk>Hidden", " reasoning</th", "ink> Answer <thinking>More hidden", " text</thinking>done"];
  const output = chunks.map((chunk) => filter.receive(chunk)).join("") + filter.finish();
  assert.equal(output, "Answer done");
  assert.equal(filter.hasThought(), true);
});

test("An unfinished thought block stays hidden when the stream ends", () => {
  const filter = createThoughtFilter();
  assert.equal(filter.receive("Visible<think>private"), "Visible");
  assert.equal(filter.finish(), "");
});

test("An incomplete opening tag is restored if no thought block begins", () => {
  const filter = createThoughtFilter();
  assert.equal(filter.receive("Literal <thi"), "Literal ");
  assert.equal(filter.finish(), "<thi");
  assert.equal(filter.hasThought(), false);
});
