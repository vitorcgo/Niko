import { motion } from "motion/react";
import { Check, ExternalLink, Image, MonitorX, Paintbrush, PanelBottom, PanelTop, Settings2, SunMoon, type LucideIcon } from "lucide-react";
import { ICONES_DA_BARRA, useConfig, type RepousoIlha, type Tema } from "../../../estado/configuracoes";
import { useInterface } from "../../../estado/interface";
import { useIlha } from "../../../estado/ilha";
import { controle } from "../../../ponte/ponteLocal";
import { tocarSom } from "../../../ponte/sons";
import { DESTAQUE_PADRAO } from "../../area-de-trabalho/usarTema";
import { mudarTema } from "../../area-de-trabalho/mudarTema";
import { FUNDOS_PRONTOS } from "../../../modulos/configuracoes/SeletorDeFundo";
import { FUNDO_DESTAQUE, hexValido, misturar, textoSobre } from "../../../utilitarios/cores";
import { T } from "../../../textos/textos";
import { usarMonitores } from "../../../desktop/desktop";
import { TODOS_OS_MONITORES } from "../../dock/monitores";
import { BUSCADORES, type Buscador } from "../../../utilitarios/buscaApps";

const MONITOR_PRINCIPAL = "principal";

const P = T.ilha.barra.personalizacao;
const DESTAQUES_PRONTOS = ["#a78bfa", "#3b82f6", "#10b981", "#f59e0b", "#f4505e", "#ec4899"];

function Escolha<V extends string>({ rotulo, valor, opcoes, aoMudar, grade = false, desativada = false }: { rotulo: string; valor: V; opcoes: { valor: V; rotulo: string }[]; aoMudar: (v: V, origem: HTMLButtonElement) => void; grade?: boolean; desativada?: boolean }) {
  return (
    <div className="ilha-escolha" data-grade={grade || undefined} data-desativada={desativada || undefined} role="radiogroup" aria-label={rotulo} aria-disabled={desativada || undefined}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} className="ilha-escolha-opcao" disabled={desativada} onClick={(evento) => aoMudar(o.valor, evento.currentTarget)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Amostra({ cor, rotulo, ativa, aoClicar }: { cor: string; rotulo: string; ativa: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="ilha-amostra" style={{ background: cor }} aria-label={rotulo} title={rotulo} aria-pressed={ativa} onClick={aoClicar}>
      {ativa && <Check size={12} color={textoSobre(cor)} />}
    </button>
  );
}

function CorLivre({ rotulo, valor, aoMudar }: { rotulo: string; valor: string; aoMudar: (cor: string) => void }) {
  return (
    <label className="ilha-amostra ilha-amostra-livre" title={rotulo}>
      <input type="color" value={valor} aria-label={rotulo} onChange={(e) => aoMudar(e.target.value)} />
    </label>
  );
}

function Grupo({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: React.ReactNode }) {
  return (
    <section className="ilha-personalizar-grupo" aria-label={titulo}>
      <span className="ilha-personalizar-titulo">
        <Icone size={13} />
        {titulo}
      </span>
      {children}
    </section>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="ilha-personalizar-secao">
      <span className="ilha-personalizar-rotulo">{rotulo}</span>
      {children}
    </div>
  );
}

export function Personalizacao({ topo, aoFechar }: { topo: number; aoFechar: () => void }) {
  const cfg = useConfig();
  const irPara = useInterface((s) => s.irPara);
  const corDoDestaque = cfg.destaque && hexValido(cfg.destaque) ? cfg.destaque : DESTAQUE_PADRAO.escuro;
  const amostraDeFundo = (valor: string) => (valor === FUNDO_DESTAQUE ? misturar(corDoDestaque, "#000000", 0.82) : valor);
  const fonte = cfg.ilha;
  const percentual = Math.round(fonte.opacidade * 100);
  const monitores = usarMonitores();
  const variosMonitores = monitores.length >= 2;
  const escolhaSalva = cfg.dock.monitores ?? TODOS_OS_MONITORES;
  const escolhaDoDock = !variosMonitores ? MONITOR_PRINCIPAL : escolhaSalva === TODOS_OS_MONITORES || monitores.some((m) => m.nome === escolhaSalva) ? escolhaSalva : monitores.find((m) => m.principal)?.nome ?? TODOS_OS_MONITORES;
  const opcoesDeMonitor = variosMonitores
    ? [
        { valor: TODOS_OS_MONITORES, rotulo: monitores.length === 2 ? P.monitores.osDois : P.monitores.todos },
        ...monitores.map((m) => ({ valor: m.nome, rotulo: monitores.length === 2 ? (m.principal ? P.monitores.principal : P.monitores.secundario) : P.monitores.numero(m.numero, m.principal) })),
      ]
    : [
        { valor: TODOS_OS_MONITORES, rotulo: P.monitores.osDois },
        { valor: MONITOR_PRINCIPAL, rotulo: P.monitores.principal },
        { valor: "secundario", rotulo: P.monitores.secundario },
      ];

  const monitorPrincipal = monitores.find((m) => m.principal);
  const monitorDaIlha = variosMonitores && monitores.some((m) => m.nome === cfg.ilha.monitor && !m.principal) ? cfg.ilha.monitor : MONITOR_PRINCIPAL;
  const opcoesDaIlha = variosMonitores
    ? [
        { valor: MONITOR_PRINCIPAL, rotulo: monitores.length === 2 ? P.monitores.principal : P.monitores.numero(monitorPrincipal?.numero ?? 1, true) },
        ...monitores.filter((m) => !m.principal).map((m) => ({ valor: m.nome, rotulo: monitores.length === 2 ? P.monitores.secundario : P.monitores.numero(m.numero, false) })),
      ]
    : [
        { valor: MONITOR_PRINCIPAL, rotulo: P.monitores.principal },
        { valor: "secundario", rotulo: P.monitores.secundario },
      ];

  const aplicarCor = (mudanca: { fundo?: string; opacidade?: number }) => {
    cfg.definirIlha(mudanca);
    cfg.definir({ dock: { ...useConfig.getState().dock, ...mudanca } });
  };

  return (
    <motion.div
      className="ilha-pop ilha-personalizar"
      style={{ top: topo, maxHeight: `calc(100vh - ${topo + 12}px)` }}
      role="dialog"
      aria-label={T.ilha.barra.personalizar}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", visualDuration: 0.28, bounce: 0.15 }}
    >
      <Grupo icone={SunMoon} titulo={P.grupos.aparencia}>
        <Linha rotulo={P.temaDoNiko}>
          <Escolha<Tema> rotulo={P.temaDoNiko} valor={cfg.tema} aoMudar={mudarTema} opcoes={(["claro", "escuro", "sistema"] as Tema[]).map((t) => ({ valor: t, rotulo: P.temas[t] }))} />
        </Linha>
        <Linha rotulo={P.destaque}>
          <div className="ilha-amostras">
            {DESTAQUES_PRONTOS.map((cor) => (
              <Amostra key={cor} cor={cor} rotulo={cor} ativa={corDoDestaque.toLowerCase() === cor} aoClicar={() => cfg.definir({ destaque: cor })} />
            ))}
            <CorLivre rotulo={T.configuracoes.outraCor} valor={corDoDestaque} aoMudar={(destaque) => cfg.definir({ destaque })} />
          </div>
        </Linha>
      </Grupo>

      <Grupo icone={Paintbrush} titulo={P.cores}>
        <div className="ilha-amostras">
          {FUNDOS_PRONTOS.map((f) => (
            <Amostra key={f.valor} cor={amostraDeFundo(f.valor)} rotulo={f.rotulo} ativa={fonte.fundo === f.valor} aoClicar={() => aplicarCor({ fundo: f.valor })} />
          ))}
          <CorLivre rotulo={T.configuracoes.outraCor} valor={hexValido(fonte.fundo) ? fonte.fundo : amostraDeFundo(fonte.fundo)} aoMudar={(fundo) => aplicarCor({ fundo })} />
        </div>
        <div className="ilha-rapido-linha">
          <span className="ilha-personalizar-rotulo">{T.configuracoes.opacidade}</span>
          <input
            type="range"
            className="ilha-rapido-deslizante"
            min={30}
            max={100}
            step={5}
            value={percentual}
            aria-label={T.configuracoes.opacidade}
            style={{ ["--preenchido" as string]: `${((percentual - 30) / 70) * 100}%` }}
            onChange={(e) => aplicarCor({ opacidade: Number(e.target.value) / 100 })}
          />
          <span className="ilha-rapido-valor numero">{percentual}%</span>
        </div>
        <p className="ilha-personalizar-dica">{T.configuracoes.textoAutomatico}</p>
      </Grupo>

      <Grupo icone={PanelTop} titulo={P.grupos.ilha}>
        <Linha rotulo={P.tamanhoDaIlha}>
          <Escolha rotulo={P.tamanhoDaIlha} valor={cfg.ilha.tamanho} aoMudar={(tamanho) => cfg.definirIlha({ tamanho })} opcoes={(["pequena", "media", "grande"] as const).map((t) => ({ valor: t, rotulo: T.configuracoes.tamanhos[t] }))} />
        </Linha>
        <Linha rotulo={P.monitorDaIlha}>
          <Escolha desativada={!variosMonitores} rotulo={P.monitorDaIlha} valor={monitorDaIlha} aoMudar={(monitor) => cfg.definirIlha({ monitor: monitor === MONITOR_PRINCIPAL ? "" : monitor })} opcoes={opcoesDaIlha} />
        </Linha>
        <Linha rotulo={P.repouso}>
          <Escolha<RepousoIlha> grade rotulo={P.repouso} valor={cfg.ilha.repouso} aoMudar={(repouso) => cfg.definirIlha({ repouso })} opcoes={(Object.keys(T.configuracoes.repousos) as RepousoIlha[]).map((r) => ({ valor: r, rotulo: T.configuracoes.repousos[r] }))} />
        </Linha>
        <Linha rotulo={P.iconesDaBarra}>
          <div className="ilha-escolha" role="group" aria-label={P.iconesDaBarra}>
            {ICONES_DA_BARRA.map((icone) => (
              <button
                key={icone}
                type="button"
                role="checkbox"
                aria-checked={cfg.ilha.iconesDaBarra[icone]}
                className="ilha-escolha-opcao"
                onClick={() => cfg.definirIlha({ iconesDaBarra: { ...cfg.ilha.iconesDaBarra, [icone]: !cfg.ilha.iconesDaBarra[icone] } })}
              >
                {P.icones[icone]}
              </button>
            ))}
          </div>
        </Linha>
      </Grupo>

      <Grupo icone={PanelBottom} titulo={P.grupos.dock}>
        <Linha rotulo={P.monitores.titulo}>
          <Escolha desativada={!variosMonitores} rotulo={P.monitores.titulo} valor={escolhaDoDock} aoMudar={(escolha) => cfg.definir({ dock: { ...useConfig.getState().dock, monitores: escolha } })} opcoes={opcoesDeMonitor} />
          {!variosMonitores && (
            <span className="ilha-personalizar-aviso">
              <MonitorX size={13} />
              {P.monitores.naoReconhecido}
            </span>
          )}
        </Linha>
        <Linha rotulo={P.buscador}>
          <Escolha<Buscador> rotulo={P.buscador} valor={cfg.dock.buscador} aoMudar={(buscador) => cfg.definir({ dock: { ...useConfig.getState().dock, buscador } })} opcoes={BUSCADORES.map((b) => ({ valor: b, rotulo: P.buscadores[b] }))} />
        </Linha>
      </Grupo>
      <div className="ilha-personalizar-rodape">
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void tocarSom("open");
            aoFechar();
            void controle.ferramenta("papelDeParede").catch(() => useIlha.getState().avisarFalha(T.ilha.barra.indisponivel));
          }}
        >
          <Image size={14} />
          {P.papelDeParede}
          <ExternalLink size={12} />
        </button>
        <button
          type="button"
          className="ilha-rapido-texto"
          onClick={() => {
            void tocarSom("open");
            aoFechar();
            irPara("configuracoes", { secao: "aparencia" });
          }}
        >
          <Settings2 size={14} />
          {P.maisOpcoes}
        </button>
      </div>
    </motion.div>
  );
}
