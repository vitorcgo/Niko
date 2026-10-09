import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrainCircuit, Check } from "lucide-react";
import { useInterface } from "../../state/interface";
import { useConfig, type ModeBorder, type Theme } from "../../state/settings";
import { Character } from "../../characters/Character";
import { AGENTS } from "../../state/agents";
import { Button, Field, Segmented, Key } from "../../components/basics";
import { T } from "../../i18n/ptBR";
import { playSound } from "../../bridge/sounds";
import { EditorPhoto } from "../../components/ProfilePhoto";

function PreviewMode({ modo: mode }: { modo: ModeBorder }) {
  return (
    <div className="previa-modo" data-modo={mode} role="img" aria-label={`${T.primeira.previaModo}: ${T.configuracoes.modos[mode]}`}>
      <span className="previa-modo-janela" />
      <span className="previa-modo-ilha" />
      <span className="previa-modo-cursor" />
    </div>
  );
}

export function FirstRun() {
  const cfg = useConfig();
  const [step, setStep] = useState(0);
  const [nameValue, setName] = useState(cfg.nome);
  const [errorName, setErrorName] = useState("");
  const total = T.primeira.passos.length;

  const complete = () => {
    cfg.set({ primeiraExecucaoFeita: true, nome: nameValue.trim().slice(0, 40) });
    void playSound("greet", "personagens");
  };

  const advance = () => {
    if (step === 1) {
      const clean = nameValue.trim();
      if (clean.length > 40) {
        setErrorName(T.validacao.tamanhoMaximo(40));
        return;
      }
      cfg.set({ nome: clean });
    }
    setStep((p) => Math.min(total - 1, p + 1));
  };

  return (
    <div className="sobreposicao sobreposicao-centro" style={{ zIndex: 1200 }}>
      <motion.div className="assistente" role="dialog" aria-modal="true" aria-label={T.primeira.passos[step]} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <ol className="assistente-passos" aria-label={T.primeira.progresso}>
          {T.primeira.passos.map((p, i) => (
            <li key={p} data-estado={i < step ? "feito" : i === step ? "atual" : "proximo"}>
              <span className="assistente-bolinha">{i < step ? <Check size={11} /> : i + 1}</span>
              <span className="assistente-rotulo">{p}</span>
            </li>
          ))}
        </ol>
        <AnimatePresence mode="wait">
          <motion.div key={step} className="assistente-corpo" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {step === 0 && (
              <>
                <div className="linha" style={{ gap: 24, justifyContent: "center", padding: "8px 0 16px" }}>
                  {AGENTS.map((a) => (
                    <div key={a} className="coluna" style={{ alignItems: "center", gap: 8 }}>
                      <Character agente={a} tamanho={72} rotulo={T.agentes.nomes[a]} />
                      <b>{T.agentes.nomes[a]}</b>
                      <span className="texto-3" style={{ fontSize: 11, textAlign: "center", maxWidth: 140 }}>{cfg.agentes.cargos[a]}: {T.agentes.areas[a]}</span>
                    </div>
                  ))}
                </div>
                <h2 className="titulo-secao">{T.primeira.boasVindas}</h2>
                <p className="texto-2">{T.primeira.boasVindasTexto}</p>
              </>
            )}
            {step === 1 && (
              <div className="formulario">
                <h2 className="titulo-secao">{T.primeira.perfil}</h2>
                <EditorPhoto tamanho={84} />
                <Field id="pe-nome" rotulo={T.configuracoes.nomePerfil} erro={errorName}>
                  <input
                    id="pe-nome"
                    className="campo"
                    value={nameValue}
                    maxLength={40}
                    autoFocus
                    aria-invalid={errorName ? "true" : "false"}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErrorName("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && advance()}
                  />
                </Field>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.tema}</span>
                  <Segmented<Theme>
                    rotulo={T.configuracoes.tema}
                    valor={cfg.tema}
                    aoMudar={(theme) => cfg.set({ tema: theme })}
                    opcoes={[
                      { valor: "claro", rotulo: T.barraLateral.temaClaro },
                      { valor: "escuro", rotulo: T.barraLateral.temaEscuro },
                      { valor: "sistema", rotulo: T.barraLateral.temaSistema },
                    ]}
                  />
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="formulario">
                <h2 className="titulo-secao">{T.primeira.ilha}</h2>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.secoes.ilha}</span>
                  <Segmented<ModeBorder>
                    rotulo={T.configuracoes.secoes.ilha}
                    valor={cfg.ilha.modo}
                    aoMudar={(mode) => cfg.setIsland({ modo: mode })}
                    opcoes={(["fixo", "esconder", "inteligente"] as ModeBorder[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))}
                  />
                  <PreviewMode modo={cfg.ilha.modo} />
                  <span className="campo-dica">{T.configuracoes.modosDica[cfg.ilha.modo]}</span>
                </div>
                <div className="campo-grupo">
                  <span className="campo-rotulo">{T.configuracoes.secoes.dock}</span>
                  <Segmented<ModeBorder>
                    rotulo={T.configuracoes.secoes.dock}
                    valor={cfg.dock.modo}
                    aoMudar={(mode) => cfg.set({ dock: { ...cfg.dock, modo: mode } })}
                    opcoes={(["fixo", "esconder", "inteligente"] as ModeBorder[]).map((m) => ({ valor: m, rotulo: T.configuracoes.modos[m] }))}
                  />
                </div>
              </div>
            )}
            {step === 3 && (
              <>
                <h2 className="titulo-secao">{T.primeira.ia}</h2>
                <p className="texto-2">{T.primeira.iaTexto}</p>
                <div>
                  <Button
                    icone={<BrainCircuit size={14} />}
                    onClick={() => {
                      complete();
                      useInterface.getState().navigateTo("ia");
                    }}
                  >
                    {T.primeira.configurarIa}
                  </Button>
                </div>
                <h2 className="titulo-secao" style={{ marginTop: 8 }}>{T.primeira.dados}</h2>
                <p className="texto-2">{T.primeira.dadosTexto}</p>
              </>
            )}
            {step === 4 && (
              <>
                <h2 className="titulo-secao">{T.primeira.pronto}</h2>
                <p className="texto-2">{T.primeira.prontoTexto}</p>
                <div className="linha" style={{ marginTop: 8 }}>
                  <Key>Ctrl K</Key>
                  <Key>Ctrl Alt Espaço</Key>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="assistente-rodape">
          <Button variante="fantasma" onClick={() => complete()}>{T.primeira.pular}</Button>
          <div className="linha">
            {step > 0 && <Button onClick={() => setStep((p) => p - 1)}>{T.geral.voltar}</Button>}
            {step === total - 1 ? (
              <Button variante="primario" onClick={() => complete()}>{T.primeira.comecar}</Button>
            ) : (
              <Button variante="primario" onClick={advance}>{T.primeira.continuar}</Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
