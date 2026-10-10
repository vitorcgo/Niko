import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { T } from "../textos/textos";

interface Props {
  children: ReactNode;
  aoVoltar?: () => void;
}

export class LimiteDeErro extends Component<Props, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    if (!this.state.falhou) return this.props.children;
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
