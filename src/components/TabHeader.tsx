import type { ReactNode } from "react";
import type { AgentId } from "../types";
import { Character } from "../characters/Character";

interface Props {
  rotulo?: string;
  titulo: string;
  subtitulo?: string;
  acoes?: ReactNode;
  agente?: AgentId;
}

export function TabHeader({ rotulo: label, titulo: title, subtitulo: subtitle, acoes: actions, agente: agent }: Props) {
  return (
    <header className="cabecalho-aba">
      <div className="cabecalho-aba-texto">
        {label && <span className="rotulo-pequeno">{label}</span>}
        <h1 className="titulo-pagina">{title}</h1>
        {subtitle && <p className="texto-2">{subtitle}</p>}
        {actions && <div className="cabecalho-aba-acoes">{actions}</div>}
      </div>
      {agent && (
        <div className="cabecalho-aba-ilustracao">
          <Character agente={agent} tamanho={84} />
        </div>
      )}
    </header>
  );
}
