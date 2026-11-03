import { useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { Ilha } from "../janelas/ilha/Ilha";
import { Dock } from "../janelas/dock/Dock";
import { AssistiveTouch } from "../janelas/assistive/AssistiveTouch";
import { JanelaSistema } from "../janelas/sistema/JanelaSistema";
import { JanelaConexao } from "../modulos/conexoes/JanelaConexao";
import { BuscaGlobal } from "../modulos/busca/BuscaGlobal";
import { CapturaRapida } from "../modulos/busca/CapturaRapida";
import { PrimeiraExecucao } from "../modulos/configuracoes/PrimeiraExecucao";
import { useInterface } from "../estado/interface";
import { useConfig } from "../estado/configuracoes";
import { usarTema } from "../janelas/area-de-trabalho/usarTema";
import { usarAtalhos } from "../janelas/area-de-trabalho/usarAtalhos";
import { useServicos } from "../servicos/servicos";
import { usarPreferenciasDaJanela } from "../servicos/usarPreferenciasDaJanela";
import { definirMonitorDaIlha, iniciarSinalDeVida, janelaAtual, ouvirComandos, ouvirEvento, sincronizarInicioComWindows } from "./desktop";
import { usarSincronia } from "./sincronia";
import { usarAtalhosDaIlha, usarAtalhosGlobais } from "./usarAtalhosGlobais";
import { T } from "../textos/textos";

export function AppSistema() {
  useEffect(iniciarSinalDeVida, []);
  usarTema();
  usarPreferenciasDaJanela();
  usarAtalhos();
  usarAtalhosGlobais();
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
        if (c.tipo === "abrirEstilosDaMidia") ui.abrirEstilosDaMidia(true);
      }),
    [],
  );

  useEffect(() => {
    let desligar = () => undefined as void;
    void ouvirEvento("niko://captura", () => useInterface.getState().abrirCaptura(true)).then((f) => (desligar = f));
    return () => desligar();
  }, []);

  useEffect(() => {
    let vivo = true;
    let desligar = () => undefined as void;
    void ouvirEvento("niko://falha-inicial", () => useInterface.getState().avisar(T.app.sobrepostaFalhou)).then((f) => {
      if (vivo) desligar = f;
      else f();
    }).catch(() => undefined);
    return () => { vivo = false; desligar(); };
  }, []);

  return (
    <div className="area-trabalho area-nativa estilo-sistema">
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
    let vivo = true;
    let parar = () => undefined as void;
    const t = window.setTimeout(() => {
      void (async () => {
        const janela = await janelaAtual();
        if (!vivo) return;
        await janela.show();
        if (vivo) parar = iniciarSinalDeVida();
      })().catch((erro) => console.error("Falha ao mostrar a janela do Niko", erro));
    }, 120);
    return () => { vivo = false; window.clearTimeout(t); parar(); };
  }, []);
}

function usarMonitorDaIlha() {
  const monitor = useConfig((s) => s.ilha.monitor);
  useEffect(() => {
    void definirMonitorDaIlha(monitor);
  }, [monitor]);
}

export function AppIlha() {
  usarMostrarAoMontar();
  usarMonitorDaIlha();
  usarTema();
  usarSincronia();
  usarAtalhosDaIlha();
  useServicos();
  return (
    <div className="area-sobreposta">
      <Ilha />
    </div>
  );
}

export function AppDock() {
  usarMostrarAoMontar();
  usarTema();
  usarPreferenciasDaJanela();
  usarSincronia();
  return (
    <div className="area-sobreposta">
      <Dock />
    </div>
  );
}

export function AppAssistive() {
  useEffect(iniciarSinalDeVida, []);
  usarTema();
  usarSincronia();
  const ativo = useConfig((s) => s.assistive.ativo);
  useEffect(() => {
    let vivo = true;
    void janelaAtual().then((j) => { if (vivo) return ativo ? j.show() : j.hide(); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [ativo]);
  return <div className="area-sobreposta"><AssistiveTouch /></div>;
}
