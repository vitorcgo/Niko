import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useConfig } from "../../estado/configuracoes";
import { montarGradeGithub, resumirContribuicoesGithub, type CalendarioContribuicoesGithub } from "../../utilitarios/contribuicoesGithub";
import { T } from "../../textos/textos";
import "./contribuicoesGithub.css";

const G = T.janelaConexao.github;
const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const mes = (iso: string) => new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)).replace(".", "");

export function ContribuicoesGithub({ calendario, compacto = false }: { calendario?: CalendarioContribuicoesGithub | null; compacto?: boolean }) {
  const privacidade = useConfig((s) => s.privacidade);
  const [selecionada, selecionar] = useState<string | null>(null);
  if (privacidade) return <div className="github-contribuicoes-aviso">{G.privacidade}</div>;
  if (!calendario?.dias.length) return <div className="github-contribuicoes-aviso" role="status">{G.indisponivel}</div>;
  const grade = montarGradeGithub(calendario);
  const resumo = resumirContribuicoesGithub(calendario);
  const indice = Math.max(0, selecionada ? calendario.dias.findIndex((d) => d.data === selecionada) : calendario.dias.length - 1);
  const escolhida = calendario.dias[indice];
  const descrever = (dia: (typeof calendario.dias)[number]) => G.dia(data(dia.data), dia.quantidade);
  const navegar = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const movimento: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    if (!(e.key in movimento) && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const proximo = e.key === "Home" ? 0 : e.key === "End" ? calendario.dias.length - 1 : Math.max(0, Math.min(calendario.dias.length - 1, i + movimento[e.key]));
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-dia="${calendario.dias[proximo].data}"]`)?.focus();
  };
  return (
    <section className={`github-contribuicoes${compacto ? " github-contribuicoes-compacta" : ""}`} aria-label={G.contribuicoes}>
      <header className="github-contribuicoes-cabecalho">
        <strong className="numero">{G.total(calendario.total)}</strong>
        {!compacto && <span>{data(calendario.dias[0].data)} · {data(calendario.dias.at(-1)!.data)}</span>}
      </header>
      {!compacto && (
        <div className="github-contribuicoes-metricas">
          <span><strong className="numero">{resumo.ultimos7dias.toLocaleString("pt-BR")}</strong>{G.ultimos7dias}</span>
          <span><strong className="numero">{resumo.diasAtivos.toLocaleString("pt-BR")}</strong>{G.diasAtivos}</span>
          <span title={descrever(resumo.melhorDia)}><strong className="numero">{resumo.melhorDia.quantidade.toLocaleString("pt-BR")}</strong>{G.melhorDia}</span>
        </div>
      )}
      <div className="github-contribuicoes-rolagem" style={{ "--github-semanas": grade.semanas } as CSSProperties}>
        <div className="github-contribuicoes-meses" aria-hidden="true">
          {grade.meses.map((dia, i) => <span key={i}>{dia ? mes(dia) : ""}</span>)}
        </div>
        <div className="github-contribuicoes-corpo">
          <div className="github-contribuicoes-semana" aria-hidden="true">
            {["", T.calendario.diasSemana[0], "", T.calendario.diasSemana[2], "", T.calendario.diasSemana[4], ""].map((dia, i) => <span key={i}>{dia}</span>)}
          </div>
          <div className="github-contribuicoes-grade" role="group" aria-label={G.navegar}>
            {grade.celulas.map((dia, i) => dia ? (
              <button key={dia.data} type="button" className="github-contribuicoes-dia" data-nivel={dia.nivel} data-dia={dia.data}
                title={descrever(dia)} aria-label={descrever(dia)} aria-pressed={dia.data === escolhida.data}
                tabIndex={dia.data === escolhida.data ? 0 : -1}
                onClick={() => selecionar(dia.data)} onFocus={() => selecionar(dia.data)}
                onKeyDown={(e) => navegar(e, i - (grade.celulas.length - calendario.dias.length))} />
            ) : <span key={i} className="github-contribuicoes-dia github-contribuicoes-vazia" />)}
          </div>
        </div>
      </div>
      <footer className="github-contribuicoes-rodape">
        <span className="github-contribuicoes-detalhe" aria-live="polite">{descrever(escolhida)}</span>
        <span className="github-contribuicoes-legenda" aria-hidden="true">
          {T.conquistas.menos}{[0, 1, 2, 3, 4].map((nivel) => <span key={nivel} className="github-contribuicoes-dia" data-nivel={nivel} />)}{T.conquistas.mais}
        </span>
      </footer>
      {!compacto && <p className="github-contribuicoes-escopo">{G.escopo}</p>}
    </section>
  );
}
