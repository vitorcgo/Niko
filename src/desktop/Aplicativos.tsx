import { useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { Ilha } from "../janelas/ilha/Ilha";
import { Dock } from "../janelas/dock/Dock";
import { JanelaSistema } from "../janelas/sistema/JanelaSistema";
import { JanelaConexao } from "../modulos/conexoes/JanelaConexao";
import { BuscaGlobal } from "../modulos/busca/BuscaGlobal";
import { CapturaRapida } from "../modulos/busca/CapturaRapida";
import { PrimeiraExecucao } from "../modulos/configuracoes/PrimeiraExecucao";
import { useIlha } from "../estado/ilha";
import { useInterface } from "../estado/interface";
import { useConfig } from "../estado/configuracoes";
import { usarTema } from "../janelas/area-de-trabalho/usarTema";
import { usarAtalhos } from "../janelas/area-de-trabalho/usarAtalhos";
import { useServicos } from "../servicos/servicos";
import { LINUX, janelaAtual, ouvirComandos, ouvirEvento, sincronizarInicioComWindows } from "./desktop";
import { usarSincronia } from "./sincronia";

export function AppSistema() {
  usarTema();
  usarAtalhos();
  usarSincronia();
  const janelas = useInterface((s) => s.janelasConexao);
  const primeira = useConfig((s) => s.primeiraExecucaoFeita);
  const iniciarComWindows = useConfig((s) => s.iniciarComWindows);

  useEffect(() => {
    void sincronizarInicioComWindows(iniciarComWindows);
  }, [iniciarComWindows]);

  useEffect(
    () =>
      ouvirComandos((c) => {
        const ui = useInterface.getState();
        if (c.tipo === "irPara") ui.irParaLocal(c.rota, c.parametros);
        if (c.tipo === "abrirConexao") ui.abrirJanelaConexaoLocal(c.id);
        if (c.tipo === "abrirBusca") ui.abrirBusca(true);
        if (c.tipo === "abrirCaptura") ui.abrirCaptura(true);
      }),
    [],
  );

  useEffect(() => {
    let desligar = () => undefined as void;
    void ouvirEvento("niko://captura", () => useInterface.getState().abrirCaptura(true)).then((f) => (desligar = f));
    return () => desligar();
  }, []);

  return (
    <div className="area-trabalho area-nativa">
      <JanelaSistema />
      <AnimatePresence>
        {janelas.filter((j) => !j.minimizada).map((j) => (
          <JanelaConexao key={j.id} janela={j} />
        ))}
      </AnimatePresence>
      <BuscaGlobal />
      <CapturaRapida />
      {!primeira && <PrimeiraExecucao />}
    </div>
  );
}

function usarMostrarAoMontar() {
  useEffect(() => {
    if (LINUX) return;
    const t = window.setTimeout(() => void janelaAtual().then((j) => j.show()), 120);
    return () => window.clearTimeout(t);
  }, []);
}

export function AppIlha() {
  usarMostrarAoMontar();
  usarTema();
  usarSincronia();
  useServicos();
  const ativa = useConfig((s) => s.ilha.ativa);
  const estado = useIlha((s) => s.estado);
  const fila = useRef(Promise.resolve());
  const pedido = useRef(0);
  const enfileirar = (acao: () => Promise<void>) => {
    fila.current = fila.current.then(acao).catch((erro) => console.error("Falha na visibilidade da ilha", erro));
  };
  useEffect(() => {
    if (LINUX && (!ativa || estado !== "expandida")) {
      pedido.current++;
      enfileirar(async () => {
        const j = await janelaAtual();
        if (!useConfig.getState().ilha.ativa || useIlha.getState().estado !== "expandida") await j.hide();
      });
    }
  }, [ativa, estado]);
  useEffect(() => {
    if (!LINUX) return;
    let vivo = true;
    const desligar: (() => void)[] = [];
    const mostrar = (foco: boolean) => {
      if (!vivo || !ativa) return;
      useIlha.getState().abrir();
      const atual = ++pedido.current;
      const valido = () => vivo && atual === pedido.current && useConfig.getState().ilha.ativa && useIlha.getState().estado === "expandida";
      enfileirar(async () => {
        const j = await janelaAtual();
        if (!valido()) return;
        await j.unminimize();
        if (!valido()) return;
        await j.show();
        if (!valido()) { await j.hide(); return; }
        if (foco) await j.setFocus();
      });
    };
    for (const [evento, foco] of [["niko://mostrar-ilha", true], ["niko://revelar-ilha", false]] as const) {
      void ouvirEvento(evento, () => mostrar(foco)).then((f) => {
        if (vivo) desligar.push(f); else f();
      });
    }
    void ouvirEvento("niko://ocultar-ilha", () => {
      if (vivo) useIlha.getState().recolher();
    }).then((f) => {
      if (vivo) desligar.push(f); else f();
    });
    return () => { vivo = false; pedido.current++; desligar.forEach((f) => f()); };
  }, [ativa]);
  return (
    <div className={`area-sobreposta${LINUX ? " area-ilha-linux" : ""}`}>
      {!LINUX || estado === "expandida" ? <Ilha /> : null}
    </div>
  );
}

export function AppDock() {
  usarMostrarAoMontar();
  usarTema();
  usarSincronia();
  return (
    <div className="area-sobreposta">
      <Dock />
    </div>
  );
}
