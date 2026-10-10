import { ChevronDown, ExternalLink, GitCommitHorizontal, Lock } from "lucide-react";
import { useConfig } from "../../estado/configuracoes";
import { horarioRelativo } from "../../utilitarios/datas";
import { urlDoCommitGithub, type CommitGithub } from "../../utilitarios/commitsGithub";
import { T } from "../../textos/textos";
import "./commitsGithub.css";

const G = T.janelaConexao.github;

export function CommitsGithub({ commits, compacto = false, filtro = "" }: { commits?: CommitGithub[] | null; compacto?: boolean; filtro?: string }) {
  const privacidade = useConfig((s) => s.privacidade);
  if (privacidade) return <div className="github-commits-aviso">{G.commitsPrivacidade}</div>;
  const busca = filtro.trim().toLocaleLowerCase("pt-BR");
  const lista = commits?.filter((c) => !busca || [c.mensagem, c.repo, c.autor, c.sha].some((v) => v.toLocaleLowerCase("pt-BR").includes(busca))).slice(0, compacto ? 6 : 12);
  return (
    <section className={`github-commits${compacto ? " github-commits-compactos" : ""}`} aria-label={G.ultimosCommits}>
      <header className="github-commits-cabecalho">
        <strong>{G.ultimosCommits}</strong>
        {Boolean(lista?.length) && <span>{G.detalhesCommit}</span>}
      </header>
      {!lista ? <p className="github-commits-aviso" role="status">{G.commitsIndisponiveis}</p>
        : lista.length === 0 ? <p className="github-commits-aviso">{busca ? T.janelaConexao.semResultados : G.commitsVazios}</p>
        : <div className="github-commits-lista">
          {lista.map((commit) => {
            const url = urlDoCommitGithub(commit.repo, commit.sha);
            return (
              <details className="github-commit" key={`${commit.repo}:${commit.sha}`}>
                <summary>
                  <GitCommitHorizontal size={15} className="github-commit-icone" />
                  <span className="github-commit-resumo">
                    <span className="cortar">{commit.titulo}</span>
                    <span className="github-commit-meta">
                      <span className="cortar">{commit.repo}</span>
                      {commit.privado && <Lock size={10} aria-label={T.janelaConexao.estados.privado} />}
                      <code>{commit.sha.slice(0, 7)}</code>
                      <time dateTime={commit.data}>{horarioRelativo(commit.data)}</time>
                    </span>
                  </span>
                  <ChevronDown size={13} className="github-commit-seta" />
                </summary>
                <div className="github-commit-detalhes">
                  <p className="github-commit-mensagem">{commit.mensagem}</p>
                  <dl>
                    <dt>{T.janelaConexao.colunas.autor}</dt><dd>{commit.autor || "-"}</dd>
                    <dt>{T.janelaConexao.colunas.data}</dt><dd>{new Date(commit.data).toLocaleString("pt-BR")}</dd>
                    <dt>{T.janelaConexao.colunas.commit}</dt><dd><code>{commit.sha}</code></dd>
                  </dl>
                  {url && <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} />{G.abrirCommit}</a>}
                </div>
              </details>
            );
          })}
        </div>}
      {!compacto && <p className="github-commits-escopo">{G.commitsEscopo}</p>}
    </section>
  );
}
