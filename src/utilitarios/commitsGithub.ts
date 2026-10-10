export interface CommitGithub {
  sha: string;
  repo: string;
  titulo: string;
  mensagem: string;
  autor: string;
  data: string;
  privado: boolean;
  url: string;
}

const objeto = (valor: unknown): Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : {};
const texto = (valor: unknown, limite: number) => typeof valor === "string" ? valor.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, limite) : "";

export function urlDoCommitGithub(repo: string, sha: string): string | null {
  const partes = repo.split("/");
  if (partes.length !== 2 || !/^[a-z\d][a-z\d-]{0,38}$/i.test(partes[0])
    || !/^[\w.-]{1,100}$/.test(partes[1]) || [".", ".."].includes(partes[1])
    || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(sha)) return null;
  return `https://github.com/${repo}/commit/${sha}`;
}

export function normalizarCommitsGithub(resposta: unknown): CommitGithub[] {
  const r = objeto(resposta);
  if (!Array.isArray(r.items) || r.incomplete_results === true) throw new Error("commits_indisponiveis");
  const encontrados = new Map<string, CommitGithub>();
  for (const valor of r.items.slice(0, 200)) {
    const item = objeto(valor);
    const commit = objeto(item.commit);
    const repositorio = objeto(item.repository);
    const sha = typeof item.sha === "string" ? item.sha : "";
    const repo = typeof repositorio.full_name === "string" ? repositorio.full_name : "";
    const url = urlDoCommitGithub(repo, sha);
    const mensagem = texto(commit.message, 4000);
    const data = texto(objeto(commit.committer).date, 40) || texto(objeto(commit.author).date, 40);
    if (!url || !mensagem || !/^\d{4}-\d{2}-\d{2}T/.test(data) || !Number.isFinite(Date.parse(data))) continue;
    encontrados.set(`${repo}:${sha}`, {
      sha, repo, url, mensagem, titulo: mensagem.split(/\r?\n/)[0].slice(0, 300),
      autor: texto(objeto(item.author).login, 100) || texto(objeto(commit.author).name, 100),
      data: new Date(data).toISOString(), privado: repositorio.private === true,
    });
  }
  return [...encontrados.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12);
}
