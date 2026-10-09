import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Box, LayoutGrid, MessageSquare } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Segmentado, AvisoFaixa } from "../../componentes/basicos";
import { Personagem } from "../../personagens/Personagem";
import { useAgentes, AGENTES } from "../../estado/agentes";
import { useConfig } from "../../estado/configuracoes";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { formatar } from "../../utilitarios/datas";
import { useComportamento, MESAS, LUGARES, type Acao } from "./comportamento";
import { Pensamento } from "./Pensamento";
import type { AgenteId } from "../../tipos";
import { EscritorioIas } from "./EscritorioIas";

const Cena3D = lazy(() => import("./Cena3D"));

class LimiteErro extends Component<{ reserva: ReactNode; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    return this.state.falhou ? this.props.reserva : this.props.children;
  }
}

const NOME_ACAO: Partial<Record<Acao, number>> = { cafe: 0, janela: 1, conversar: 2, esticar: 3, sofa: 4 };

function para2D([x, z]: [number, number]) {
  return { left: `${((x + 6) / 12) * 100}%`, top: `${((z + 4) / 8) * 100}%` };
}

function horaDaAcao(iso: string): string {
  return new Date(iso).toDateString() === new Date().toDateString() ? formatar(iso, "HH:mm") : formatar(iso, "dd/MM");
}

function Sala2D({ comportamento, tarefas, aoEscolher }: { comportamento: ReturnType<typeof useComportamento>; tarefas: Record<AgenteId, string>; aoEscolher: (a: AgenteId) => void }) {
  return (
    <div className="sala-2d" role="img" aria-label={T.escritorio.titulo}>
      {AGENTES.map((a) => (
        <div key={a} className="sala-mesa" style={para2D(MESAS[a])}>
          <span className="sala-monitor" data-erro={comportamento[a].estado === "erro" ? "sim" : "nao"}>{tarefas[a] || T.escritorio.livre}</span>
        </div>
      ))}
      <div className="sala-objeto" style={para2D(LUGARES.sofa)}>{T.escritorio.objetos.sofa}</div>
      <div className="sala-objeto" style={para2D(LUGARES.cafe)}>{T.escritorio.objetos.cafe}</div>
      <div className="sala-objeto" style={para2D(LUGARES.janela)}>{T.escritorio.objetos.janela}</div>
      {AGENTES.map((a) => (
        <div key={a} className={`sala-agente agente-cena acao-${comportamento[a].acao}`} style={para2D(comportamento[a].alvo)}>
          <Pensamento agente={a} c={comportamento[a]} tarefa={tarefas[a]} />
          <Personagem agente={a} tamanho={52} estado={comportamento[a].estado} />
          <button type="button" className="sala-rotulo" onClick={() => aoEscolher(a)}>{useConfig.getState().agentes.nomes[a]}</button>
        </div>
      ))}
    </div>
  );
}

function EscritorioNiko() {
  const modoLeve = useConfig((s) => s.modoLeveEscritorio);
  const definir = useConfig((s) => s.definir);
  const nomes = useConfig((s) => s.agentes.nomes);
  const cargos = useConfig((s) => s.agentes.cargos);
  const favorito = useConfig((s) => s.agentes.favorito);
  const tarefas = useAgentes((s) => s.tarefaAtual);
  const atividades = useAgentes((s) => s.atividades);
  const irPara = useInterface((s) => s.irPara);
  const comportamento = useComportamento();
  const [escolhido, setEscolhido] = useState<AgenteId>(favorito ?? AGENTES[0]);
  const escuro = document.documentElement.dataset.tema === "escuro";

  const legenda = (a: AgenteId) => {
    const c = comportamento[a];
    if (tarefas[a]) return tarefas[a];
    const i = NOME_ACAO[c.acao];
    return c.estado === "ocioso" && i !== undefined ? T.escritorio.acoesLivres[i] : T.agentes.estados[c.estado];
  };

  const reserva = <><AvisoFaixa tipo="alerta">{T.escritorio.falhou3d}</AvisoFaixa><Sala2D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} /></>;
  const ultimas = atividades.filter((x) => x.agenteId === escolhido).slice(0, 5);
  const estado = comportamento[escolhido].estado;
  const tomAgora = estado === "erro" ? "erro" : estado === "alerta" ? "alerta" : "sucesso";

  return (
    <>
      <CabecalhoAba
        titulo={T.escritorio.niko}
        subtitulo={T.escritorio.subtitulo}
        acoes={
          <Segmentado
            rotulo={T.escritorio.titulo}
            valor={modoLeve ? "2d" : "3d"}
            aoMudar={(v) => definir({ modoLeveEscritorio: v === "2d" })}
            opcoes={[{ valor: "3d", rotulo: T.escritorio.modo3d, icone: <Box size={13} /> }, { valor: "2d", rotulo: T.escritorio.modoLeve, icone: <LayoutGrid size={13} /> }]}
          />
        }
      />
      <section className="escritorio-palco">
        <div className="escritorio-quadro" data-modo={modoLeve ? "leve" : "3d"}>
          {modoLeve ? (
            <Sala2D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} />
          ) : (
            <>
              <LimiteErro reserva={reserva}>
                <Suspense fallback={<div className="vazio" aria-busy="true">{T.escritorio.carregando3d}</div>}>
                  <Cena3D comportamento={comportamento} tarefas={tarefas} aoEscolher={setEscolhido} escuro={escuro} />
                </Suspense>
              </LimiteErro>
              <span className="escritorio-quadro-rotulo">{T.escritorio.dicaCena3d}</span>
            </>
          )}
        </div>
        <aside className="escritorio-painel" data-agente={escolhido}>
          <div className="escritorio-time" role="group" aria-label={T.escritorio.escolherAgente}>
            {AGENTES.map((a) => (
              <button key={a} type="button" className="escritorio-time-botao" data-agente={a} aria-pressed={a === escolhido} title={`${nomes[a]}: ${legenda(a)}`} aria-label={nomes[a]} onClick={() => setEscolhido(a)}>
                <Personagem agente={a} tamanho={38} interativo={false} halo={false} olhar={false} estado={comportamento[a].estado} />
              </button>
            ))}
          </div>
          <div className="escritorio-agente">
            <span className="escritorio-agente-avatar">
              <Personagem agente={escolhido} tamanho={62} halo={false} estado={estado} />
            </span>
            <span className="escritorio-agente-texto">
              <b>{nomes[escolhido]}</b>
              <span className="escritorio-agente-cargo">{cargos[escolhido]}</span>
              <span className="escritorio-agente-area">{T.agentes.areas[escolhido]}</span>
            </span>
          </div>
          <div className="escritorio-agora" data-tom={tomAgora}>
            <span className="escritorio-agora-rotulo">{T.escritorio.tarefaAtual}</span>
            <span className="escritorio-agora-texto privado">{legenda(escolhido)}</span>
          </div>
          <div className="escritorio-acoes">
            <span className="escritorio-acoes-rotulo">{T.escritorio.ultimasAcoes}</span>
            {ultimas.map((x) => (
              <div key={x.id} className="escritorio-acao">
                <span className="escritorio-acao-hora">{horaDaAcao(x.data)}</span>
                <span className="escritorio-acao-texto privado">{x.texto}</span>
              </div>
            ))}
            {ultimas.length === 0 && <span className="escritorio-acoes-vazio">{T.agentes.semAtividade}</span>}
          </div>
          <button type="button" className="botao botao-primario escritorio-conversar" onClick={() => irPara("chat", { agente: escolhido })}>
            <MessageSquare size={14} />
            {T.escritorio.conversar}
          </button>
        </aside>
      </section>
    </>
  );
}

export default function Escritorio({ tipoInicial = "niko", demonstracaoInicial = false }: { tipoInicial?: "niko" | "ias"; demonstracaoInicial?: boolean } = {}) {
  const [tipo, setTipo] = useState<"niko" | "ias">(tipoInicial);
  return <>
    <div className="escritorio-seletor"><Segmentado rotulo={T.escritorio.tipo} valor={tipo} aoMudar={setTipo} opcoes={[{ valor: "niko", rotulo: T.escritorio.niko }, { valor: "ias", rotulo: T.escritorio.ias.titulo }]} /></div>
    {tipo === "niko" ? <EscritorioNiko /> : <div className="escritorio-ias-pagina">
      <CabecalhoAba titulo={T.escritorio.ias.titulo} subtitulo={T.escritorio.ias.subtitulo} />
      <EscritorioIas demonstracaoInicial={demonstracaoInicial} />
    </div>}
  </>;
}
