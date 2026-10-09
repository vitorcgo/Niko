import { EthernetPort, GlobeOff, Unplug, Volume1, Volume2, VolumeX, Wifi, WifiHigh, WifiLow, WifiOff, Zap } from "lucide-react";
import type { StateSystem } from "../../../bridge/localBridge";

export function IconVolume({ volume, mudo: mute, tamanho: size }: { volume: number; mudo: boolean; tamanho: number }) {
  if (mute || volume === 0) return <VolumeX size={size} />;
  return volume < 50 ? <Volume1 size={size} /> : <Volume2 size={size} />;
}

export function IconSignal({ sinal: signal, tamanho: size }: { sinal: number; tamanho: number }) {
  if (signal >= 70) return <Wifi size={size} />;
  return signal >= 40 ? <WifiHigh size={size} /> : <WifiLow size={size} />;
}

export function wifiEnabled(network: StateSystem) {
  return network.radios.WiFi ?? network.wifi.existe;
}

export function IconWifi({ rede: network, tamanho: size }: { rede: StateSystem; tamanho: number }) {
  if (!wifiEnabled(network) || !network.wifi.conectado) return <WifiOff size={size} />;
  return <IconSignal sinal={network.wifi.sinal ?? 100} tamanho={size} />;
}

export type StatusNetwork = "cabo" | "wifi" | "semInternet" | "wifiDesconectado" | "desconectado";

export function statusNetwork(network: StateSystem): StatusNetwork {
  const cable = network.conexao?.cabo ?? false;
  const wifi = wifiEnabled(network) && network.wifi.conectado;
  if ((cable || wifi) && network.conexao?.internet === false) return "semInternet";
  if (cable) return "cabo";
  if (wifi) return "wifi";
  return network.wifi.existe ? "wifiDesconectado" : "desconectado";
}

export function IconNetwork({ rede: network, tamanho: size }: { rede: StateSystem; tamanho: number }) {
  const statusValue = statusNetwork(network);
  if (statusValue === "cabo") return <EthernetPort size={size} />;
  if (statusValue === "semInternet") return <GlobeOff size={size} />;
  if (statusValue === "desconectado") return <Unplug size={size} />;
  return <IconWifi rede={network} tamanho={size} />;
}

export function BatteryDrawn({ nivel: level, carregando: loading }: { nivel: number; carregando: boolean }) {
  const limited = Math.max(0, Math.min(100, level));
  return (
    <span className="ilha-bateria" data-carregando={loading || undefined} data-baixa={(limited <= 15 && !loading) || undefined} aria-hidden="true">
      <span className="ilha-bateria-nivel" style={{ width: `calc((100% - 3px) * ${limited / 100})` }} />
      {loading && <Zap size={8} strokeWidth={3} className="ilha-bateria-raio" />}
    </span>
  );
}
