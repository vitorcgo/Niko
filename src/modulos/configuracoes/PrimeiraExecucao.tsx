import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BrainCircuit } from "lucide-react";
import { useInterface } from "../../estado/interface";
import { useConfig, type ModoBorda, type Tema } from "../../estado/configuracoes";
import { Personagem } from "../../personagens/Personagem";
import { AGENTES } from "../../estado/agentes";
import { Botao, Campo, Segmentado } from "../../componentes/basicos";
import { T } from "../../textos/textos";
import { tocarSom } from "../../ponte/sons";
import { EditorFoto } from "../../componentes/FotoPerfil";
import { Teclas } from "./LinhaAjuste";
import { mudarTema } from "../../janelas/area-de-trabalho/mudarTema";

function PreviaDoModo({ modo }: { modo: ModoBorda }) {
  return (
    <div className="previa-modo" data-modo={modo} role="img" aria-label={`${T.primeira.previaModo}: ${T.configuracoes.modos[modo]}`}>
      <span className="previa-modo-janela" />
      <span className="previa-modo-ilha" />
      <span className="previa-modo-cursor" />
    </div>
  );
}

const TITULOS = [T.primeira.boasVindas, T.primeira.perfil, T.primeira.ilha, T.primeira.ia, T.primeira.pronto];
const TEXTOS = [T.primeira.boasVindasTexto, "", T.primeira.ilhaTexto, T.primeira.iaTexto, T.primeira.prontoTexto];

export function PrimeiraExecucao() {
  const cfg = useConfig();
  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState(cfg.nome);
  const [erroNome, setErroNome] = useState("");
  const total = T.primeira.passos.length;
  const modos = (["fixo", "esconder", "inteligente"] as ModoBorda[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }));

  const concluir = () => {
    cfg.definir({ primeiraExecucaoFeita: true, nome: nome.trim().slice(0, 40) });
    void tocarSom("greet", "personagens");
  };

  const avancar = () => {
    if (passo === 1) {
      const limpo = nome.trim();
      if (limpo.length > 40) {
        setErroNome(T.validacao.tamanhoMaximo(40));
        return;
      }
      cfg.definir({ nome: limpo });
    }
    setPasso((p) => Math.min(total - 1, p + 1));
  };

  return (
    <div className="estilo-sistema boas-vindas-fundo">
      <motion.div className="boas-vindas" role="dialog" aria-modal="true" aria-label={T.primeira.passos[passo]} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <ol className="boas-vindas-passos" aria-label={T.primeira.progresso}>
          {T.primeira.passos.map((p, i) => (
            <li key={p} data-estado={i < passo ? "feito" : i === passo ? "atual" : "proximo"} aria-current={i === passo ? "step" : undefined}>
              <span className="boas-vindas-traco" />
              <span className="boas-vindas-passo-nome">{p}</span>
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait">
          <motion.div key={passo} className="boas-vindas-corpo" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            <div className="boas-vindas-conteudo">
              <h2 className="boas-vindas-titulo">{TITULOS[passo]}</h2>
              {TEXTOS[passo] && <p className="boas-vindas-texto">{TEXTOS[passo]}</p>}
              {passo === 1 && (
                <div className="formulario">
                  <EditorFoto tamanho={64} />
                  <Campo id="pe-nome" rotulo={T.configuracoes.nomePerfil} erro={erroNome}>
                    <input
                      id="pe-nome"
                      className="campo boas-vindas-campo"
                      value={nome}
                      maxLength={40}
                      autoFocus
                      aria-invalid={erroNome ? "true" : "false"}
                      onChange={(e) => {
                        setNome(e.target.value);
                        setErroNome("");
                      }}
                      onKeyDown={(e) => e.key === "Enter" && avancar()}
                    />
                  </Campo>
                  <div className="campo-grupo">
                    <span className="campo-rotulo">{T.configuracoes.tema}</span>
                    <Segmentado<Tema>
                      rotulo={T.configuracoes.tema}
                      valor={cfg.tema}
                      aoMudar={mudarTema}
                      opcoes={[
                        { valor: "claro", rotulo: T.barraLateral.temaClaro },
                        { valor: "escuro", rotulo: T.barraLateral.temaEscuro },
                        { valor: "sistema", rotulo: T.barraLateral.temaSistema },
                      ]}
                    />
                  </div>
                </div>
              )}
              {passo === 2 && (
                <div className="formulario">
                  <div className="campo-grupo">
                    <span className="campo-rotulo">{T.configuracoes.secoes.ilha}</span>
                    <Segmentado<ModoBorda> rotulo={T.configuracoes.secoes.ilha} valor={cfg.ilha.modo} aoMudar={(modo) => cfg.definirIlha({ modo })} opcoes={modos} />
                    <PreviaDoModo modo={cfg.ilha.modo} />
                    <span className="campo-dica">{T.configuracoes.modosDica[cfg.ilha.modo]}</span>
                  </div>
                  <div className="campo-grupo">
                    <span className="campo-rotulo">{T.configuracoes.secoes.dock}</span>
                    <Segmentado<ModoBorda> rotulo={T.configuracoes.secoes.dock} valor={cfg.dock.modo} aoMudar={(modo) => cfg.definir({ dock: { ...cfg.dock, modo } })} opcoes={modos} />
                  </div>
                </div>
              )}
              {passo === 3 && (
                <>
                  <div>
                    <Botao
                      icone={<BrainCircuit size={13} />}
                      onClick={() => {
                        concluir();
                        useInterface.getState().irPara("ia");
                      }}
                    >
                      {T.primeira.configurarIa}
                    </Botao>
                  </div>
                  <div className="boas-vindas-bloco">
                    <h3 className="boas-vindas-subtitulo">{T.primeira.dados}</h3>
                    <p className="boas-vindas-texto">{T.primeira.dadosTexto}</p>
                  </div>
                </>
              )}
              {passo === 4 && (
                <div className="boas-vindas-teclas">
                  <Teclas teclas="Ctrl + K" />
                  <Teclas teclas="Ctrl + Alt + Espaço" />
                </div>
              )}
            </div>
            <div className="boas-vindas-time">
              <div className="boas-vindas-personagens">
                {AGENTES.map((a) => (
                  <span key={a} className="boas-vindas-personagem">
                    <Personagem agente={a} tamanho={76} rotulo={T.agentes.nomes[a]} />
                  </span>
                ))}
              </div>
              {passo === 0 && (
                <ul className="boas-vindas-nomes">
                  {AGENTES.map((a) => (
                    <li key={a}>
                      <b>{T.agentes.nomes[a]}</b>
                      <span>{cfg.agentes.cargos[a]}: {T.agentes.areas[a]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="boas-vindas-rodape">
          <button type="button" className="boas-vindas-pular" onClick={() => concluir()}>{T.primeira.pular}</button>
          <span className="empurrar" />
          {passo > 0 && <Botao onClick={() => setPasso((p) => p - 1)}>{T.geral.voltar}</Botao>}
          {passo === total - 1 ? (
            <Botao variante="primario" className="boas-vindas-continuar" onClick={() => concluir()}>
              {T.primeira.comecar}
              <ArrowRight size={13} />
            </Botao>
          ) : (
            <Botao variante="primario" className="boas-vindas-continuar" onClick={avancar}>
              {T.primeira.continuar}
              <ArrowRight size={13} />
            </Botao>
          )}
        </div>
      </motion.div>
    </div>
  );
}
