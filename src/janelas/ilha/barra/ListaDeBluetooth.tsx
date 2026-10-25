import { useEffect, useRef, useState } from "react";
import { Bluetooth, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { sistema, type AparelhoBluetooth } from "../../../ponte/ponteLocal";
import { T } from "../../../textos/textos";

const S = T.ilha.sistema;
const TENTATIVAS_DE_CONFERIR = 12;
const INTERVALO_DE_CONFERIR_MS = 1500;

export function ListaDeBluetooth() {
  const [aparelhos, setAparelhos] = useState<AparelhoBluetooth[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pendentes, setPendentes] = useState<Record<string, boolean>>({});
  const atualizar = useRef<() => void>(() => undefined);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    let lendo = false;
    const ler = async () => {
      if (lendo || !vivo) return;
      lendo = true;
      setOcupado(true);
      try {
        const lista = await sistema.bluetooth();
        if (vivo) {
          setAparelhos(lista);
          setErro(null);
        }
      } catch {
        if (vivo) setErro(S.semPonte);
      } finally {
        lendo = false;
        if (vivo) setOcupado(false);
      }
    };
    atualizar.current = () => void ler();
    void ler();
    const relogio = window.setInterval(() => {
      if (!document.hidden) void ler();
    }, 5000);
    return () => {
      vivo = false;
      window.clearInterval(relogio);
      atualizar.current = () => undefined;
    };
  }, []);

  const abrirWindows = async () => {
    setErro(null);
    try {
      await sistema.configuracoes("bluetooth");
    } catch {
      setErro(S.semConfiguracoesBluetooth);
    }
  };

  const alternar = async (aparelho: AparelhoBluetooth) => {
    if (aparelho.conectado === null) return void abrirWindows();
    if (pendentes[aparelho.id]) return;
    const alvo = !aparelho.conectado;
    setErro(null);
    setPendentes((p) => ({ ...p, [aparelho.id]: alvo }));
    try {
      await sistema.bluetoothConexao(aparelho.id, alvo);
      for (let tentativa = 0; tentativa < TENTATIVAS_DE_CONFERIR; tentativa++) {
        await new Promise((r) => window.setTimeout(r, INTERVALO_DE_CONFERIR_MS));
        const lista = await sistema.bluetooth().catch(() => null);
        if (!vivo.current) return;
        if (lista) setAparelhos(lista);
        if (lista?.find((a) => a.id === aparelho.id)?.conectado === alvo) return;
      }
      setErro(alvo ? S.bluetoothNaoConectou(aparelho.nome) : S.bluetoothNaoDesconectou(aparelho.nome));
    } catch (e) {
      if ((e as Error).message === "bluetooth_sem_audio") {
        setErro(S.bluetoothSoNoSistema);
        void abrirWindows();
      } else setErro(alvo ? S.bluetoothNaoConectou(aparelho.nome) : S.bluetoothNaoDesconectou(aparelho.nome));
    } finally {
      if (vivo.current) setPendentes(({ [aparelho.id]: _, ...resto }) => resto);
    }
  };

  const conectados = aparelhos?.filter((a) => a.conectado === true) ?? [];
  const outros = aparelhos?.filter((a) => a.conectado !== true) ?? [];

  const linha = (aparelho: AparelhoBluetooth) => {
    const ligado = aparelho.conectado === true;
    const pendente = pendentes[aparelho.id];
    const acao = aparelho.conectado === null ? S.gerenciarBluetoothWindows : ligado ? S.desconectar : S.conectar;
    return (
      <button key={aparelho.id} type="button" className="bt-aparelho" data-ligado={ligado || undefined} data-pendente={pendente !== undefined || undefined} aria-busy={pendente !== undefined} onClick={() => void alternar(aparelho)} title={`${acao}: ${aparelho.nome}`}>
        <span className="bt-icone" aria-hidden="true">{pendente !== undefined ? <LoaderCircle size={15} className="girando" /> : <Bluetooth size={15} />}</span>
        <span className="bt-texto">
          <span className="bt-nome" title={aparelho.nome}>{aparelho.nome}</span>
          <span className="bt-estado">
            <i className="bt-ponto" />
            {pendente === true ? S.conectandoBluetooth : pendente === false ? S.desconectandoBluetooth : ligado ? S.bluetoothConectado : aparelho.conectado === false ? S.bluetoothDesconectado : S.bluetoothEstadoDesconhecido}
          </span>
        </span>
        <span className="bt-acao">
          {acao}
          {aparelho.conectado === null && <ExternalLink size={11} />}
        </span>
      </button>
    );
  };

  return (
    <section className="ilha-rapido-redes ilha-rapido-bluetooth" aria-label={S.aparelhos} aria-busy={ocupado}>
      <div className="bt-topo">
        <span className="bt-titulo">{S.aparelhos}</span>
        <button type="button" className="bt-botao-icone" disabled={ocupado} aria-label={S.atualizar} title={S.atualizar} onClick={() => atualizar.current()}>
          <RefreshCw size={13} className={ocupado ? "girando" : undefined} />
        </button>
        <button type="button" className="bt-botao-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void abrirWindows()}>
          <ExternalLink size={13} />
        </button>
      </div>
      {aparelhos === null && !erro && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {aparelhos?.length === 0 && <p className="ilha-rapido-vazio">{S.semAparelhos}</p>}
      <div className="ilha-rapido-bluetooth-lista">
        {conectados.length > 0 && <span className="bt-grupo">{S.bluetoothConectados}</span>}
        {conectados.map(linha)}
        {outros.length > 0 && <span className="bt-grupo">{S.bluetoothPareados}</span>}
        {outros.map(linha)}
      </div>
      {erro && <p className="ilha-rapido-vazio ilha-rapido-erro" role="alert">{erro}</p>}
      <p className="bt-dica" title={S.bluetoothDicaWindows}>{S.bluetoothDicaCurta}</p>
    </section>
  );
}
