import { useMemo } from "react";
import { Code2 } from "lucide-react";
import { claudeCode } from "../../../bridge/claudeCode";
import { useIsland } from "../../../state/island";
import { linesDiff, type ChangeFile, type LineDiff } from "../../../utils/diff";
import { T } from "../../../i18n/ptBR";

const C = T.ilha.claude;

function nameShort(path: string) {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function openFile(cwd: string, file: string) {
  claudeCode.abrirArquivo(cwd, file).catch((e: Error) => {
    useIsland.getState().revelar({ texto: C.abrirFalhou[e.message] ?? C.abrirFalhou.outro, tipo: "alerta", marca: "claudecode", aba: "claude" }, 4500);
  });
}

export function CompactDiff({ alteracao: change, maximo: maximum = 60, cwd }: { alteracao: ChangeFile; maximo?: number; cwd?: string }) {
  const { linhas: lines, mais: more, menos: less } = useMemo(() => {
    const all: (LineDiff | { tipo: "separador"; texto: string })[] = [];
    let sumMais = 0;
    let sumMenos = 0;
    change.trechos.forEach((t, i) => {
      if (i > 0) all.push({ tipo: "separador", texto: "" });
      for (const l of linesDiff(t.antes, t.depois)) {
        if (l.tipo === "mais") sumMais++;
        if (l.tipo === "menos") sumMenos++;
        all.push(l);
      }
    });
    return { linhas: all, mais: sumMais, menos: sumMenos };
  }, [change]);
  const visible = lines.slice(0, maximum);

  return (
    <div className="vsc-diff">
      <div className="vsc-diff-topo">
        <span className="vsc-diff-arquivo" title={change.arquivo}>{nameShort(change.arquivo)}</span>
        {change.novo && <span className="vsc-chip">{C.arquivoNovo}</span>}
        <span className="vsc-diff-mais">+{more}</span>
        <span className="vsc-diff-menos">-{less}</span>
        {cwd && (
          <button type="button" className="vsc-icone-botao vsc-diff-abrir" aria-label={C.abrirArquivo} title={C.abrirArquivo} onClick={() => openFile(cwd, change.arquivo)}>
            <Code2 size={12} />
          </button>
        )}
      </div>
      <div className="vsc-diff-corpo">
        {visible.map((l, i) =>
          l.tipo === "separador" ? (
            <div key={i} className="vsc-diff-separador" />
          ) : (
            <div key={i} className="vsc-diff-linha" data-tipo={l.tipo}>
              <span className="vsc-diff-sinal">{l.tipo === "mais" ? "+" : l.tipo === "menos" ? "-" : " "}</span>
              <span className="vsc-diff-texto">{l.texto || " "}</span>
            </div>
          ),
        )}
        {lines.length > maximum && <div className="vsc-diff-mais-linhas">{C.maisLinhas(lines.length - maximum)}</div>}
      </div>
    </div>
  );
}
