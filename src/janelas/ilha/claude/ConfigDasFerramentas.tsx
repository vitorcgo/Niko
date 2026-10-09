import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, LoaderCircle, ShieldCheck, Eye, TriangleAlert, Check } from "lucide-react";
import { agentesDeCodigo, FERRAMENTAS_DE_CODIGO, FERRAMENTAS_QUE_APROVAM, type EstadoDaFerramenta, type FerramentaDeCodigo } from "../../../ponte/claudeCode";
import { useConfig } from "../../../estado/configuracoes";
import { Marca } from "../../../marcas/Marca";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";
import { COR_DA_FERRAMENTA, MARCA_DA_FERRAMENTA, nomeDaFerramenta } from "./ferramentas";

const C = T.ilha.claude.config;

type Situacao = keyof typeof C.estados;

function situacaoDe(e: EstadoDaFerramenta | undefined): Situacao {
  if (!e) return "desligado";
  if (e.invalido) return "invalido";
  if (e.desatualizado) return "atualizar";
  return e.instalado ? "ligado" : "desligado";
}

function Ladrilho({ id, estado, indice, aoEscolher }: { id: FerramentaDeCodigo; estado?: EstadoDaFerramenta; indice: number; aoEscolher: () => void }) {
  const situacao = situacaoDe(estado);
  return (
    <motion.button
      type="button"
      disabled={!estado}
      className="cfg-ladrilho"
      data-situacao={situacao}
      data-ausente={estado && !estado.detectado ? "" : undefined}
      style={{ ["--marca" as string]: COR_DA_FERRAMENTA[id] }}
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: indice * 0.045, type: "spring", visualDuration: 0.35, bounce: 0.3 } }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={aoEscolher}
    >
      <span className="cfg-ladrilho-logo">
        <Marca marca={MARCA_DA_FERRAMENTA[id]} tamanho={22} />
      </span>
      <span className="cfg-ladrilho-nome">{nomeDaFerramenta(id)}</span>
      <span className="cfg-situacao" data-situacao={situacao}>
        <span className="cfg-situacao-ponto" />
        {estado ? C.estados[situacao] : T.geral.carregando}
      </span>
    </motion.button>
  );
}

function Detalhe({ id, estado, aoVoltar, aoMudar, ocultarCaminhos = false }: { id: FerramentaDeCodigo; estado?: EstadoDaFerramenta; aoVoltar: () => void; aoMudar: () => void; ocultarCaminhos?: boolean }) {
  const situacao = situacaoDe(estado);
  const nome = nomeDaFerramenta(id);
  const [confirmando, setConfirmando] = useState<"instalar" | "remover" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const aprova = FERRAMENTAS_QUE_APROVAM.includes(id);

  const executar = (acao: "instalar" | "remover") => {
    setOcupado(true);
    setRetorno(null);
    (acao === "instalar" ? agentesDeCodigo.instalar(id) : agentesDeCodigo.remover(id))
      .then(() => {
        setRetorno({ ok: true, texto: acao === "instalar" ? C.feito(nome) : C.removido(nome) });
        void tocarSom(acao === "instalar" ? "approve" : "close");
        if (acao === "instalar" && id === "claude") useConfig.getState().definir({ claudeInstalado: true });
        aoMudar();
      })
      .catch((e: Error) => {
        setRetorno({ ok: false, texto: C.falhou[e.message] ?? (e.message === "Failed to fetch" ? C.semPonte : C.falhou.outro) });
        void tocarSom("error", "avisos");
      })
      .finally(() => {
        setOcupado(false);
        setConfirmando(null);
      });
  };

  return (
    <motion.div
      className="cfg-detalhe"
      style={{ ["--marca" as string]: COR_DA_FERRAMENTA[id] }}
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1, transition: { type: "spring", visualDuration: 0.38, bounce: 0.12 } }}
      exit={{ x: "100%", opacity: 0.6, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
    >
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={C.voltar} title={C.voltar} onClick={aoVoltar}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{nome}</span>
      </div>
      <div className="cfg-detalhe-corpo">
        <motion.span className="cfg-detalhe-logo" initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", visualDuration: 0.45, bounce: 0.45 }}>
          <Marca marca={MARCA_DA_FERRAMENTA[id]} tamanho={30} />
        </motion.span>
        <div className="cfg-detalhe-info">
          <span className="cfg-situacao" data-situacao={situacao}>
            <span className="cfg-situacao-ponto" />
            {C.estados[situacao]}
          </span>
          <span className="cfg-capacidade">
            {aprova ? <ShieldCheck size={13} /> : <Eye size={13} />}
            {aprova ? C.aprova : C.acompanha}
          </span>
          <span className="vsc-dim cfg-rotulo">{C.arquivo}</span>
          <code className="cfg-caminho" title={ocultarCaminhos ? undefined : estado?.caminho}>{ocultarCaminhos ? T.escritorio.ias.oculto : estado?.caminho ?? "..."}</code>
          {estado && !estado.detectado && (
            <span className="cfg-alerta">
              <TriangleAlert size={13} />
              {C.naoEncontrada}
            </span>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {confirmando ? (
          <motion.div key="confirmar" className="cfg-acoes cfg-confirmar" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <span className="cfg-aviso">{confirmando === "instalar" ? C.avisoLigar : C.avisoDesligar}</span>
            <button type="button" className="vsc-botao" disabled={ocupado} onClick={() => setConfirmando(null)}>
              {C.cancelar}
            </button>
            <button type="button" className="vsc-botao vsc-botao-primario" disabled={ocupado} onClick={() => executar(confirmando)}>
              {ocupado ? <LoaderCircle size={13} className="girando" /> : <Check size={13} />}
              {C.confirmar}
            </button>
          </motion.div>
        ) : (
          <motion.div key="acoes" className="cfg-acoes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            {retorno && (
              <span className={retorno.ok ? "cfg-retorno" : "cfg-retorno cfg-retorno-erro"} role="status">
                {retorno.texto}
              </span>
            )}
            {(situacao === "ligado" || situacao === "atualizar") && (
              <button type="button" className="vsc-botao" disabled={ocupado || !estado} onClick={() => setConfirmando("remover")}>
                {C.desligar}
              </button>
            )}
            {situacao !== "ligado" && (
              <button type="button" className="vsc-botao vsc-botao-primario" disabled={ocupado || !estado || estado.invalido} onClick={() => setConfirmando("instalar")}>
                {situacao === "atualizar" ? C.atualizar : C.ligar}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ConfigDasFerramentas({ aoFechar, ocultarCaminhos = false }: { aoFechar: () => void; ocultarCaminhos?: boolean }) {
  const [estados, setEstados] = useState<EstadoDaFerramenta[] | null>(null);
  const [erro, setErro] = useState(false);
  const [escolhida, setEscolhida] = useState<FerramentaDeCodigo | null>(null);

  const atualizar = () => {
    agentesDeCodigo
      .estado()
      .then((r) => {
        setEstados(r.ferramentas);
        setErro(false);
      })
      .catch(() => setErro(true));
  };

  useEffect(atualizar, []);

  const estadoDe = (id: FerramentaDeCodigo) => estados?.find((e) => e.id === id);

  return (
    <motion.div
      className="cfg"
      initial={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.22 } }}
      exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.15 } }}
    >
      <div className="cfg-topo">
        <button type="button" className="vsc-icone-botao" aria-label={C.voltar} title={C.voltar} onClick={aoFechar}>
          <ChevronLeft size={15} />
        </button>
        <span className="cfg-titulo">{C.titulo}</span>
        <span className="vsc-dim cfg-dica">{C.dica}</span>
      </div>
      {erro ? (
        <div className="vsc-vazio">
          <span className="vsc-dim">{C.semPonte}</span>
        </div>
      ) : (
        <div className="cfg-grade">
          {FERRAMENTAS_DE_CODIGO.map((id, i) => (
            <Ladrilho
              key={id}
              id={id}
              indice={i}
              estado={estadoDe(id)}
              aoEscolher={() => {
                void tocarSom("blip");
                setEscolhida(id);
              }}
            />
          ))}
          {!estados && <LoaderCircle size={16} className="girando cfg-carregando" />}
        </div>
      )}
      <AnimatePresence>
        {escolhida && <Detalhe key={escolhida} id={escolhida} estado={estadoDe(escolhida)} aoVoltar={() => setEscolhida(null)} aoMudar={atualizar} ocultarCaminhos={ocultarCaminhos} />}
      </AnimatePresence>
    </motion.div>
  );
}
