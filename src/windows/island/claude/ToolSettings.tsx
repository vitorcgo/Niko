import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, LoaderCircle, ShieldCheck, Eye, TriangleAlert, Check } from "lucide-react";
import { agentsCode, TOOLS_CODE, TOOLS_THAT_APPROVE, type StateTool, type CodingTool } from "../../../bridge/claudeCode";
import { useConfig } from "../../../state/settings";
import { Brand } from "../../../brands/Brand";
import { playSound } from "../../../bridge/sounds";
import { T } from "../../../i18n/ptBR";
import { COLOR_TOOL, BRAND_TOOL, nameTool } from "./tools";

const C = T.ilha.claude.config;

type Status = keyof typeof C.estados;

function getStatus(e: StateTool | undefined): Status {
  if (!e) return "desligado";
  if (e.invalido) return "invalido";
  if (e.desatualizado) return "atualizar";
  return e.instalado ? "ligado" : "desligado";
}

function Tile({ id, estado: state, indice: index, aoEscolher: onSelect }: { id: CodingTool; estado?: StateTool; indice: number; aoEscolher: () => void }) {
  const statusValue = getStatus(state);
  return (
    <motion.button
      type="button"
      className="cfg-ladrilho"
      data-situacao={statusValue}
      data-ausente={state && !state.detectado ? "" : undefined}
      style={{ ["--marca" as string]: COLOR_TOOL[id] }}
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: index * 0.045, type: "spring", visualDuration: 0.35, bounce: 0.3 } }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={onSelect}
    >
      <span className="cfg-ladrilho-logo">
        <Brand marca={BRAND_TOOL[id]} tamanho={22} />
      </span>
      <span className="cfg-ladrilho-nome">{nameTool(id)}</span>
      <span className="cfg-situacao" data-situacao={statusValue}>
        <span className="cfg-situacao-ponto" />
        {C.estados[statusValue]}
      </span>
    </motion.button>
  );
}

function Detail({ id, estado: state, aoVoltar: onBack, aoMudar: onChange }: { id: CodingTool; estado?: StateTool; aoVoltar: () => void; aoMudar: () => void }) {
  const statusValue = getStatus(state);
  const nameValue = nameTool(id);
  const [confirming, setConfirming] = useState<"instalar" | "remover" | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnValue, setReturn] = useState<{ ok: boolean; texto: string } | null>(null);
  const approve = TOOLS_THAT_APPROVE.includes(id);

  const execute = (action: "instalar" | "remover") => {
    setBusy(true);
    setReturn(null);
    (action === "instalar" ? agentsCode.instalar(id) : agentsCode.remover(id))
      .then(() => {
        setReturn({ ok: true, texto: action === "instalar" ? C.feito(nameValue) : C.removido(nameValue) });
        void playSound(action === "instalar" ? "approve" : "close");
        if (action === "instalar" && id === "claude") useConfig.getState().set({ claudeInstalado: true });
        onChange();
      })
      .catch((e: Error) => {
        setReturn({ ok: false, texto: C.falhou[e.message] ?? (e.message === "Failed to fetch" ? C.semPonte : C.falhou.outro) });
        void playSound("error", "avisos");
      })
      .finally(() => {
        setBusy(false);
        setConfirming(null);
      });
  };

  return (
    <motion.div
      className="cfg-detalhe"
      style={{ ["--marca" as string]: COLOR_TOOL[id] }}
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1, transition: { type: "spring", visualDuration: 0.38, bounce: 0.12 } }}
      exit={{ x: "100%", opacity: 0.6, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
    >
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={C.voltar} title={C.voltar} onClick={onBack}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{nameValue}</span>
      </div>
      <div className="cfg-detalhe-corpo">
        <motion.span className="cfg-detalhe-logo" initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", visualDuration: 0.45, bounce: 0.45 }}>
          <Brand marca={BRAND_TOOL[id]} tamanho={30} />
        </motion.span>
        <div className="cfg-detalhe-info">
          <span className="cfg-situacao" data-situacao={statusValue}>
            <span className="cfg-situacao-ponto" />
            {C.estados[statusValue]}
          </span>
          <span className="cfg-capacidade">
            {approve ? <ShieldCheck size={13} /> : <Eye size={13} />}
            {approve ? C.aprova : C.acompanha}
          </span>
          <span className="vsc-dim cfg-rotulo">{C.arquivo}</span>
          <code className="cfg-caminho" title={state?.caminho}>{state?.caminho ?? "..."}</code>
          {state && !state.detectado && (
            <span className="cfg-alerta">
              <TriangleAlert size={13} />
              {C.naoEncontrada}
            </span>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div key="confirmar" className="cfg-acoes cfg-confirmar" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <span className="cfg-aviso">{confirming === "instalar" ? C.avisoLigar : C.avisoDesligar}</span>
            <button type="button" className="vsc-botao" disabled={busy} onClick={() => setConfirming(null)}>
              {C.cancelar}
            </button>
            <button type="button" className="vsc-botao vsc-botao-primario" disabled={busy} onClick={() => execute(confirming)}>
              {busy ? <LoaderCircle size={13} className="girando" /> : <Check size={13} />}
              {C.confirmar}
            </button>
          </motion.div>
        ) : (
          <motion.div key="acoes" className="cfg-acoes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {returnValue && (
              <span className={returnValue.ok ? "cfg-retorno" : "cfg-retorno cfg-retorno-erro"} role="status">
                {returnValue.texto}
              </span>
            )}
            {(statusValue === "ligado" || statusValue === "atualizar") && (
              <button type="button" className="vsc-botao" disabled={busy || !state} onClick={() => setConfirming("remover")}>
                {C.desligar}
              </button>
            )}
            {statusValue !== "ligado" && (
              <button type="button" className="vsc-botao vsc-botao-primario" disabled={busy || !state || state.invalido} onClick={() => setConfirming("instalar")}>
                {statusValue === "atualizar" ? C.atualizar : C.ligar}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ToolSettings({ aoFechar: onClose }: { aoFechar: () => void }) {
  const [states, setStates] = useState<StateTool[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<CodingTool | null>(null);

  const update = () => {
    agentsCode
      .estado()
      .then((r) => {
        setStates(r.ferramentas);
        setError(false);
      })
      .catch(() => setError(true));
  };

  useEffect(update, []);

  const state = (id: CodingTool) => states?.find((e) => e.id === id);

  return (
    <motion.div
      className="cfg"
      initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.22 } }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.15 } }}
    >
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={C.voltar} title={C.voltar} onClick={onClose}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{C.titulo}</span>
        <span className="vsc-dim cfg-dica">{C.dica}</span>
      </div>
      {error ? (
        <div className="vsc-vazio">
          <span className="vsc-dim">{C.semPonte}</span>
        </div>
      ) : (
        <div className="cfg-grade">
          {TOOLS_CODE.map((id, i) => (
            <Tile
              key={id}
              id={id}
              indice={i}
              estado={state(id)}
              aoEscolher={() => {
                void playSound("blip");
                setSelected(id);
              }}
            />
          ))}
          {!states && <LoaderCircle size={16} className="girando cfg-carregando" />}
        </div>
      )}
      <AnimatePresence>
        {selected && <Detail key={selected} id={selected} estado={state(selected)} aoVoltar={() => setSelected(null)} aoMudar={update} />}
      </AnimatePresence>
    </motion.div>
  );
}
