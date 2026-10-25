import test, { after } from "node:test";
import assert from "node:assert/strict";
import { criarServidorDeTeste } from "./vite-para-testes.mjs";

const vite = await criarServidorDeTeste({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => vite.close());

const forjas = await vite.ssrLoadModule("/servidor/forjas.ts");
const { calendarioDeContagens } = await vite.ssrLoadModule("/src/utilitarios/contribuicoesGithub.ts");

function pedidoFalso(respostas) {
  const pedidos = [];
  const pedir = async (url, cabecalhos) => {
    pedidos.push({ url, cabecalhos });
    const caminho = new URL(url).pathname + new URL(url).search;
    const achada = Object.entries(respostas).find(([prefixo]) => caminho.startsWith(prefixo));
    if (!achada) throw new Error(`http_404 ${caminho}`);
    return typeof achada[1] === "function" ? achada[1](caminho) : achada[1];
  };
  return { pedir, pedidos };
}

test("credencial da forja: gitlab.com por padrão, gitea exige endereço e rede local só com https", () => {
  assert.deepEqual(JSON.parse(forjas.credencialDaForja("gitlab", "", "glpat-12345678")), { site: "https://gitlab.com", token: "glpat-12345678" });
  assert.throws(() => forjas.credencialDaForja("gitea", "", "token-12345678"), /forja_sem_site/);
  assert.equal(JSON.parse(forjas.credencialDaForja("gitea", "https://codeberg.org/", "token-12345678")).site, "https://codeberg.org");
  assert.equal(JSON.parse(forjas.credencialDaForja("gitea", "https://192.168.0.10:3000", "token-12345678")).site, "https://192.168.0.10:3000");
  assert.throws(() => forjas.credencialDaForja("gitea", "http://192.168.0.10:3000", "token-12345678"), /chave_sem_criptografia/);
  assert.throws(() => forjas.credencialDaForja("gitlab", "", "curto"), /chave_invalida/);
});

test("status de CI do gitlab e do gitea viram os mesmos estados do github", () => {
  assert.equal(forjas.ciDoPipeline("running"), "rodando");
  assert.equal(forjas.ciDoPipeline("pending"), "rodando");
  assert.equal(forjas.ciDoPipeline("failed"), "falhou");
  assert.equal(forjas.ciDoPipeline("success"), "sucesso");
  assert.equal(forjas.ciDoPipeline("canceled"), "nenhum");
  assert.equal(forjas.ciDoPipeline(undefined), "nenhum");
  assert.equal(forjas.ciDoStatusCombinado("pending", 2), "rodando");
  assert.equal(forjas.ciDoStatusCombinado("error", 1), "falhou");
  assert.equal(forjas.ciDoStatusCombinado("success", 3), "sucesso");
  assert.equal(forjas.ciDoStatusCombinado("pending", 0), "nenhum");
  assert.equal(forjas.revisaoDoGitea([{ state: "COMMENT" }, { state: "REQUEST_CHANGES" }, { state: "APPROVED" }]), "aprovado");
  assert.equal(forjas.revisaoDoGitea([{ state: "APPROVED" }, { state: "REQUEST_CHANGES" }]), "mudancas");
  assert.equal(forjas.revisaoDoGitea([]), "pendente");
});

test("calendário de contribuições a partir de contagens por dia", () => {
  const c = calendarioDeContagens({ "2026-10-25": 8, "2026-10-24": 1, "2026-10-20": 3, "2025-01-01": 99 }, "2026-10-25", 7);
  assert.equal(c.dias.length, 7);
  assert.equal(c.dias[0].data, "2026-10-19");
  assert.equal(c.dias.at(-1).data, "2026-10-25");
  assert.equal(c.total, 12);
  assert.equal(c.dias.at(-1).nivel, 4);
  assert.equal(c.dias.find((d) => d.data === "2026-10-21").nivel, 0);
  assert.ok(c.dias.find((d) => d.data === "2026-10-24").nivel >= 1);
});

test("gitlab vira o mesmo formato do github", async () => {
  const agora = new Date().toISOString();
  const { pedir, pedidos } = pedidoFalso({
    "/api/v4/user": { username: "vitor" },
    "/api/v4/merge_requests?state=opened&scope=created_by_me": [{ iid: 7, project_id: 3, title: "Ajusta login", web_url: "https://gitlab.com/g/app/-/merge_requests/7", created_at: agora, author: { username: "vitor" }, references: { full: "g/app!7" } }],
    "/api/v4/merge_requests?state=opened&scope=reviews_for_me": [{ iid: 9, project_id: 3, title: "Nova tela", web_url: "u", created_at: agora, author: { username: "ana" }, references: { full: "g/app!9" } }],
    "/api/v4/issues": [{ iid: 4, title: "Bug no menu", web_url: "u", created_at: agora, labels: ["bug"], references: { full: "g/app#4" } }],
    "/api/v4/projects?": [{ id: 3, name: "app", default_branch: "main", last_activity_at: agora, visibility: "private", star_count: 2 }],
    "/api/v4/events": [{ created_at: agora }, { created_at: agora }],
    "/api/v4/projects/3/merge_requests/7/approvals": { approved: true },
    "/api/v4/projects/3/merge_requests/7": { head_pipeline: { status: "failed" } },
    "/api/v4/projects/3/pipelines": [{ id: 55, status: "success", ref: "main", created_at: "2026-10-25T10:00:00Z", updated_at: "2026-10-25T10:02:00Z" }, { id: 54, status: "canceled", ref: "main", created_at: agora, updated_at: agora }],
  });
  const d = await forjas.lerGitlab(JSON.stringify({ site: "https://gitlab.com", token: "glpat-12345678" }), pedir);
  assert.ok(pedidos.every((p) => p.cabecalhos["private-token"] === "glpat-12345678"));
  assert.equal(d.usuario, "vitor");
  assert.deepEqual(d.prs.map((p) => [p.tipo, p.repo, p.numero]), [["revisar", "app", 9], ["meu", "app", 7]]);
  assert.equal(d.prs[1].ci, "falhou");
  assert.equal(d.prs[1].revisao, "aprovado");
  assert.deepEqual(d.issues[0], { titulo: "Bug no menu", repo: "app", numero: 4, rotulos: ["bug"], data: agora });
  assert.deepEqual(d.actions.map((a) => [a.workflow, a.status, a.duracao]), [["#55", "sucesso", 120]]);
  assert.equal(d.repositorios[0].privado, true);
  assert.equal(d.contribuicoes.total, 2);
  assert.equal(d.commits, null);
});

test("gitea vira o mesmo formato do github e usa o token no cabeçalho certo", async () => {
  const agora = new Date().toISOString();
  const { pedir, pedidos } = pedidoFalso({
    "/api/v1/user/repos": [{ name: "site", full_name: "vitor/site", default_branch: "main", updated_at: agora, private: false, language: "TypeScript", stars_count: 5 }],
    "/api/v1/users/vitor/heatmap": [{ timestamp: Math.floor(Date.now() / 1000), contributions: 4 }],
    "/api/v1/user": { login: "vitor" },
    "/api/v1/repos/issues/search?state=open&limit=20&type=pulls&created=true": [{ number: 3, title: "Rodapé", html_url: "u", created_at: agora, user: { login: "vitor" }, repository: { full_name: "vitor/site", name: "site" } }],
    "/api/v1/repos/issues/search?state=open&limit=20&type=pulls&review_requested=true": [],
    "/api/v1/repos/issues/search?state=open&limit=20&type=issues&assigned=true": [{ number: 1, title: "Logo", html_url: "u", created_at: agora, labels: [{ name: "design" }], repository: { full_name: "vitor/site", name: "site" } }],
    "/api/v1/repos/vitor/site/pulls/3/reviews": [{ state: "REQUEST_CHANGES" }],
    "/api/v1/repos/vitor/site/pulls/3": { head: { sha: "abc123" } },
    "/api/v1/repos/vitor/site/commits/abc123/status": { state: "pending", total_count: 1, statuses: [{ context: "build", updated_at: agora }] },
    "/api/v1/repos/vitor/site/commits/main/status": { state: "failure", total_count: 2, statuses: [{ context: "test", created_at: "2026-10-25T10:00:00Z", updated_at: "2026-10-25T10:00:30Z" }, { context: "lint", updated_at: "2026-10-25T10:01:00Z" }] },
  });
  const d = await forjas.lerGitea(JSON.stringify({ site: "https://codeberg.org", token: "token-12345678" }), pedir);
  assert.ok(pedidos.every((p) => p.cabecalhos.authorization === "token token-12345678"));
  assert.equal(d.usuario, "vitor");
  assert.deepEqual(d.prs.map((p) => [p.tipo, p.repo, p.numero, p.ci, p.revisao]), [["meu", "site", 3, "rodando", "mudancas"]]);
  assert.deepEqual(d.issues[0].rotulos, ["design"]);
  assert.deepEqual(d.actions.map((a) => [a.workflow, a.repo, a.status, a.duracao]), [["test", "site", "falhou", 30]]);
  assert.equal(d.repositorios[0].linguagem, "TypeScript");
  assert.equal(d.contribuicoes.total, 4);
});

test("resposta fora do formato não derruba a leitura da forja", async () => {
  const { pedir } = pedidoFalso({
    "/api/v1/user/repos": { erro: "x" },
    "/api/v1/users/vitor/heatmap": { message: "not found" },
    "/api/v1/user": { login: "vitor" },
    "/api/v1/repos/issues/search": { message: "x" },
  });
  const d = await forjas.lerGitea(JSON.stringify({ site: "https://codeberg.org", token: "token-12345678" }), pedir);
  assert.deepEqual([d.prs.length, d.issues.length, d.repositorios.length, d.contribuicoes.total], [0, 0, 0, 0]);
});
