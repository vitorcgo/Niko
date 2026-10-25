import { Component, Fragment, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { T } from "../textos/textos";

interface Props {
  children: ReactNode;
  aoVoltar?: () => void;
  recuperarSozinho?: boolean;
}

const ESPERA_PARA_REMONTAR = 1200;
const JANELA_DE_FALHAS = 30_000;
const FALHAS_ATE_RECARREGAR = 3;

export function proximaRecuperacao(falhas: number[], agora: number): { falhas: number[]; acao: "remontar" | "recarregar" } {
  const recentes = [...falhas.filter((t) => agora - t < JANELA_DE_FALHAS), agora];
  return { falhas: recentes, acao: recentes.length >= FALHAS_ATE_RECARREGAR ? "recarregar" : "remontar" };
}

export class LimiteDeErro extends Component<Props, { falhou: boolean; geracao: number }> {
  state = { falhou: false, geracao: 0 };
  private falhas: number[] = [];
  private espera = 0;

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  componentDidCatch(erro: unknown) {
    console.error("Falha na interface do Niko", erro);
    if (!this.props.recuperarSozinho) return;
    const { falhas, acao } = proximaRecuperacao(this.falhas, Date.now());
    this.falhas = falhas;
    window.clearTimeout(this.espera);
    this.espera = window.setTimeout(() => {
      if (acao === "recarregar") window.location.reload();
      else this.setState((s) => ({ falhou: false, geracao: s.geracao + 1 }));
    }, ESPERA_PARA_REMONTAR);
  }

  componentWillUnmount() {
    window.clearTimeout(this.espera);
  }

  render() {
    if (!this.state.falhou) return <Fragment key={this.state.geracao}>{this.props.children}</Fragment>;
    if (this.props.recuperarSozinho) return null;
    return <section className={`falha-interface ${this.props.aoVoltar ? "" : "falha-interface-geral"}`} role="alert">
      <AlertTriangle size={28} aria-hidden="true" />
      <h1>{this.props.aoVoltar ? T.app.paginaFalhou : T.app.interfaceFalhou}</h1>
      <p>{T.app.interfaceFalhouDica}</p>
      <div className="falha-interface-acoes">
        {this.props.aoVoltar && <button type="button" className="botao" onClick={this.props.aoVoltar}>{T.app.voltarInicio}</button>}
        <button type="button" className="botao botao-primario" onClick={() => window.location.reload()}>{T.app.recarregar}</button>
      </div>
    </section>;
  }
}
