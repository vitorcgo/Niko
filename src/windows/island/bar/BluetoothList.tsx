import { useEffect, useRef, useState } from "react";
import { Bluetooth, ExternalLink, RefreshCw } from "lucide-react";
import { system, type DeviceBluetooth } from "../../../bridge/localBridge";
import { T } from "../../../i18n/ptBR";

const S = T.ilha.sistema;

export function BluetoothList() {
  const [devices, setDevices] = useState<DeviceBluetooth[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = useRef<() => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    let reading = false;
    const read = async () => {
      if (reading || !alive) return;
      reading = true;
      setBusy(true);
      try {
        const list = await system.bluetooth();
        if (alive) {
          setDevices(list);
          setError(null);
        }
      } catch {
        if (alive) setError(S.semPonte);
      } finally {
        reading = false;
        if (alive) setBusy(false);
      }
    };
    update.current = () => void read();
    void read();
    const clock = window.setInterval(() => {
      if (!document.hidden) void read();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(clock);
      update.current = () => undefined;
    };
  }, []);

  const openWindows = async () => {
    setError(null);
    try {
      await system.configuracoes("bluetooth");
    } catch {
      setError(S.semPonte);
    }
  };

  const connected = devices?.filter((a) => a.conectado === true) ?? [];
  const others = devices?.filter((a) => a.conectado !== true) ?? [];

  const line = (device: DeviceBluetooth) => {
    const enabled = device.conectado === true;
    const action = enabled ? S.desconectarBluetoothWindows : device.conectado === false ? S.conectarBluetoothWindows : S.gerenciarBluetoothWindows;
    return (
      <button key={device.id} type="button" className="bt-aparelho" data-ligado={enabled || undefined} onClick={() => void openWindows()} title={action}>
        <span className="bt-icone" aria-hidden="true"><Bluetooth size={15} /></span>
        <span className="bt-texto">
          <span className="bt-nome" title={device.nome}>{device.nome}</span>
          <span className="bt-estado">
            <i className="bt-ponto" />
            {enabled ? S.bluetoothConectado : device.conectado === false ? S.bluetoothDesconectado : S.bluetoothEstadoDesconhecido}
          </span>
        </span>
        <span className="bt-acao">
          {S.abrirBluetoothWindows}
          <ExternalLink size={11} />
        </span>
      </button>
    );
  };

  return (
    <section className="ilha-rapido-redes ilha-rapido-bluetooth" aria-label={S.aparelhos} aria-busy={busy}>
      <div className="bt-topo">
        <span className="bt-titulo">{S.aparelhos}</span>
        <button type="button" className="bt-botao-icone" disabled={busy} aria-label={S.atualizar} title={S.atualizar} onClick={() => update.current()}>
          <RefreshCw size={13} className={busy ? "girando" : undefined} />
        </button>
        <button type="button" className="bt-botao-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void openWindows()}>
          <ExternalLink size={13} />
        </button>
      </div>
      {devices === null && !error && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {devices?.length === 0 && <p className="ilha-rapido-vazio">{S.semAparelhos}</p>}
      <div className="ilha-rapido-bluetooth-lista">
        {connected.length > 0 && <span className="bt-grupo">{S.bluetoothConectados}</span>}
        {connected.map(line)}
        {others.length > 0 && <span className="bt-grupo">{S.bluetoothPareados}</span>}
        {others.map(line)}
      </div>
      {error && <p className="ilha-rapido-vazio ilha-rapido-erro" role="alert">{error}</p>}
      <p className="bt-dica" title={S.bluetoothDicaWindows}>{S.bluetoothDicaCurta}</p>
    </section>
  );
}
