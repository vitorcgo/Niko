import test, { after } from "node:test";
import assert from "node:assert/strict";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());

const { resumoDeUso, temUso } = await vite.ssrLoadModule("/src/utilitarios/resumoDeUso.ts");

test("resumo de uso conta só o que foi feito e acha o primeiro dia", () => {
  const r = resumoDeUso({
    tarefas: [
      { status: "concluida", criadaEm: "2026-09-01T12:00:00", concluidaEm: "2026-09-02T12:00:00" },
      { status: "a_fazer", criadaEm: "2026-08-20T12:00:00" },
    ],
    habitos: [{ id: "agua", tipo: "quantidade", meta: 8 }, { id: "ler", tipo: "sim_nao", meta: 1 }],
    registros: { "2026-09-02": { agua: 8, ler: 1 }, "2026-09-03": { agua: 3 }, "2026-09-04": { sumiu: 1 } },
    sessoes: [
      { etapa: "foco", situacao: "concluida", minutos: 25, inicio: "2026-09-05T15:00:00" },
      { etapa: "foco", situacao: "interrompida", minutos: 10, inicio: "2026-09-05T16:00:00" },
      { etapa: "pausa", situacao: "concluida", minutos: 5, inicio: "2026-09-05T15:30:00" },
    ],
    registroRevisoes: [{ data: "2026-09-06", quantidade: 12 }, { data: "2026-09-07", quantidade: 0 }],
    conversas: [{ mensagens: [{ autor: "usuario", criadaEm: "2026-09-08T10:00:00" }, { autor: "agente", criadaEm: "2026-09-08T10:00:05" }] }],
    conquistas: 3,
  });
  assert.equal(r.tarefasConcluidas, 1);
  assert.equal(r.minutosDeFoco, 25);
  assert.equal(r.habitosCumpridos, 2);
  assert.equal(r.cartoesRevisados, 12);
  assert.equal(r.mensagensAoTime, 1);
  assert.equal(r.conquistas, 3);
  assert.equal(r.diasAtivos, 4);
  assert.equal(r.desde, "2026-08-20");
  assert.ok(temUso(r));
});

test("sem uso nenhum, o resumo não aparece", () => {
  const r = resumoDeUso({ tarefas: [], habitos: [], registros: {}, sessoes: [], registroRevisoes: [], conversas: [], conquistas: 0 });
  assert.equal(r.desde, null);
  assert.equal(temUso(r), false);
});
