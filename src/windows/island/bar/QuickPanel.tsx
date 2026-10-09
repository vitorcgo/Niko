import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BellOff, Bluetooth, BluetoothOff, ChevronDown, ExternalLink, Keyboard, Lock, Mic, MicOff, Moon, Pause, Play, Power, PowerOff, RefreshCw, RotateCcw, ScanLine, Settings, SkipBack, SkipForward, Sun,
  Volume2, VolumeX, X,
  type LucideIcon,
} from "lucide-react";
import { useConfig } from "../../../state/settings";
import { useInterface } from "../../../state/interface";
import { useIsland } from "../../../state/island";
import { useMedia, backgroundCover } from "../../../state/media";
import { useControlQuick, groupSessions } from "../../../state/quickControls";
import { control, system, type ActionPower, type TargetAudio, type StateSystem, type ToolWindows, type NetworkWifi, type SessionAudio } from "../../../bridge/localBridge";
import { playSound } from "../../../bridge/sounds";
import { T } from "../../../i18n/ptBR";
import { IconNetwork, IconSignal, IconVolume, IconWifi, statusNetwork, wifiEnabled as isWithWifiEnabled } from "./StatusIcons";
import { BluetoothList } from "./BluetoothList";

const B = T.ilha.barra;
const S = T.ilha.sistema;
const WAIT_BRIGHTNESS_MS = 250;
const WITHOUT_SESSIONS: SessionAudio[] = [];

function Toggle({ icone: Icon, rotulo: label, dica: hint, ligado: enabled, desativado: disabled, aoClicar: onClick }: { icone: LucideIcon; rotulo: string; dica: string; ligado?: boolean; desativado?: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="ilha-rapido-alternador" data-ligado={enabled || undefined} aria-pressed={enabled} disabled={disabled} title={hint} onClick={onClick}>
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

function Slider({ rotulo: label, valor: value, aoMudar: onChange }: { rotulo: string; valor: number; aoMudar: (v: number) => void }) {
  return (
    <input
      type="range"
      className="ilha-rapido-deslizante"
      min={0}
      max={100}
      step={1}
      value={value}
      aria-label={label}
      style={{ ["--preenchido" as string]: `${value}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function LineAudio({ alvo: target, rotulo: label, aberto: isOpen, aoAlternarMixer: onToggleMixer }: { alvo: TargetAudio; rotulo: string; aberto?: boolean; aoAlternarMixer?: () => void }) {
  const level = useControlQuick((s) => s.audio?.[target] ?? null);
  const setVolume = useControlQuick((s) => s.setVolume);
  const toggleMute = useControlQuick((s) => s.toggleMute);
  const mute = level?.mudo ?? false;

  return (
    <div className="ilha-rapido-linha" data-desativada={!level || undefined}>
      <button type="button" className="ilha-rapido-icone" disabled={!level} aria-pressed={mute} aria-label={label} title={level ? label : B.semDispositivo} onClick={() => toggleMute(target)}>
        {target === "entrada" ? mute ? <MicOff size={15} /> : <Mic size={15} /> : <IconVolume volume={level?.volume ?? 0} mudo={mute} tamanho={15} />}
      </button>
      <Slider rotulo={label} valor={level ? (mute ? 0 : level.volume) : 0} aoMudar={(v) => setVolume(target, v)} />
      <span className="ilha-rapido-valor numero">{level ? `${mute ? 0 : level.volume}%` : ""}</span>
      {onToggleMixer ? (
        <button type="button" className="ilha-rapido-icone" aria-expanded={isOpen} aria-label={isOpen ? B.esconderPorApp : B.verPorApp} title={isOpen ? B.esconderPorApp : B.verPorApp} onClick={onToggleMixer}>
          <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={isOpen || undefined} />
        </button>
      ) : (
        <span className="ilha-rapido-icone" aria-hidden="true" />
      )}
    </div>
  );
}

function VolumeByApp() {
  const sessions = useControlQuick((s) => s.audio?.sessoes ?? WITHOUT_SESSIONS);
  const adjustApp = useControlQuick((s) => s.adjustApp);
  const groups = groupSessions(sessions).sort((a, b) => Number(a.sistema) - Number(b.sistema) || Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome));

  if (groups.length === 0) return <p className="ilha-rapido-vazio">{B.semAppsComSom}</p>;
  return (
    <div className="ilha-rapido-apps">
      {groups.map((g) => {
        const nameValue = g.sistema ? B.sonsDoSistema : g.nome || B.appSemNome;
        return (
          <div key={g.chave} className="ilha-rapido-linha ilha-rapido-app" data-ativa={g.ativa || undefined}>
            <button
              type="button"
              className="ilha-rapido-icone"
              aria-pressed={g.mudo}
              aria-label={g.mudo ? B.ativarSomApp(nameValue) : B.silenciarApp(nameValue)}
              title={g.mudo ? B.ativarSomApp(nameValue) : B.silenciarApp(nameValue)}
              onClick={() => adjustApp(g.pids, { mudo: !g.mudo })}
            >
              {g.icone ? <img src={g.icone} alt="" width={16} height={16} draggable={false} data-mudo={g.mudo || undefined} /> : g.mudo ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <div className="ilha-rapido-app-meio">
              <span className="ilha-rapido-app-nome cortar">{nameValue}</span>
              <Slider rotulo={B.volumeDoApp(nameValue)} valor={g.mudo ? 0 : g.volume} aoMudar={(v) => adjustApp(g.pids, { volume: v, ...(g.mudo && v > 0 ? { mudo: false } : {}) })} />
            </div>
            <span className="ilha-rapido-valor numero">{g.mudo ? 0 : g.volume}%</span>
          </div>
        );
      })}
    </div>
  );
}

function LineBrightness() {
  const brightnessRead = useControlQuick((s) => s.rede?.brilho ?? null);
  const [selected, setSelected] = useState<number | null>(null);
  const wait = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(wait.current), []);

  const brightness = selected ?? brightnessRead;
  if (brightness === null) return null;
  const change = (v: number) => {
    setSelected(v);
    window.clearTimeout(wait.current);
    wait.current = window.setTimeout(() => void system.brilho(v).catch(() => undefined), WAIT_BRIGHTNESS_MS);
  };
  return (
    <div className="ilha-rapido-linha">
      <span className="ilha-rapido-icone" aria-hidden="true">
        <Sun size={15} />
      </span>
      <Slider rotulo={B.brilho} valor={brightness} aoMudar={change} />
      <span className="ilha-rapido-valor numero">{brightness}%</span>
      <span className="ilha-rapido-icone" aria-hidden="true" />
    </div>
  );
}

function Media() {
  const media = useMedia();
  if (!media.faixa) return null;
  return (
    <div className="ilha-rapido-midia">
      <span className="ilha-rapido-capa" style={{ background: backgroundCover(media.faixa) }} />
      <div className="ilha-rapido-midia-texto privado">
        <span className="cortar">{media.faixa.titulo}</span>
        <span className="cortar ilha-rapido-sutil">{media.faixa.artista || media.faixa.app}</span>
      </div>
      <div className="ilha-rapido-midia-botoes">
        <button type="button" className="ilha-rapido-icone" disabled={!media.podeVoltar} aria-label={T.ilha.anterior} title={T.ilha.anterior} onClick={media.previous}>
          <SkipBack size={14} />
        </button>
        <button type="button" className="ilha-rapido-icone ilha-rapido-tocar" aria-label={media.tocando ? T.ilha.pausar : T.ilha.tocar} title={media.tocando ? T.ilha.pausar : T.ilha.tocar} onClick={media.toggle}>
          {media.tocando ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="ilha-rapido-icone" disabled={!media.podeAvancar} aria-label={T.ilha.proxima} title={T.ilha.proxima} onClick={media.next}>
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
}

function ListNetworks({ rede: network, aoMudar: onChange }: { rede: StateSystem; aoMudar: () => void }) {
  const [networks, setNetworks] = useState<NetworkWifi[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [passwordTo, setPasswordTo] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const readNetworks = () => system.redes().then(setNetworks).catch(() => setNetworks([]));
  useEffect(() => {
    void readNetworks();
  }, []);

  const execute = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await action();
      void playSound("blip");
    } catch (e) {
      setError(S.falhou((e as Error).message));
    } finally {
      setBusy(null);
      onChange();
    }
  };

  const connect = (r: NetworkWifi, hasPassword?: string) =>
    execute(`rede-${r.ssid}`, async () => {
      await system.conectar(r.ssid, hasPassword);
      setPasswordTo(null);
      setPassword("");
      await readNetworks();
    });

  return (
    <div className="ilha-rapido-redes">
      {networks === null && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {networks?.length === 0 && <p className="ilha-rapido-vazio">{S.semRedes}</p>}
      {networks?.map((r) => {
        const current = network.wifi.conectado && network.wifi.ssid === r.ssid;
        const requesting = passwordTo === r.ssid;
        return (
          <div key={r.ssid} className="ilha-rapido-rede" data-atual={current || undefined}>
            <div className="ilha-rapido-linha">
              <span className="ilha-rapido-icone" aria-hidden="true"><IconSignal sinal={r.sinal} tamanho={14} /></span>
              <span className="cortar ilha-rapido-rede-nome">{r.ssid}</span>
              {r.segura && <Lock size={11} className="ilha-rapido-sutil" />}
              {current ? (
                <button type="button" className="ilha-rapido-texto ilha-rapido-texto-pequeno" disabled={!!busy} onClick={() => void execute("desc", () => system.desconectar())}>{S.desconectar}</button>
              ) : (
                <button
                  type="button"
                  className="ilha-rapido-texto ilha-rapido-texto-pequeno"
                  disabled={busy === `rede-${r.ssid}`}
                  onClick={() => (r.segura && !r.salva ? setPasswordTo(requesting ? null : r.ssid) : void connect(r))}
                >
                  {busy === `rede-${r.ssid}` ? S.conectando : S.conectar}
                </button>
              )}
            </div>
            {requesting && (
              <form
                className="ilha-rapido-senha"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length < 8) return setError(S.senhaCurta);
                  void connect(r, password);
                }}
              >
                <input type="password" autoFocus autoComplete="off" value={password} maxLength={63} placeholder={S.senha} aria-label={S.senha} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="ilha-rapido-texto ilha-rapido-texto-pequeno" disabled={!!busy}>{S.conectar}</button>
                <button type="button" className="ilha-rapido-icone" aria-label={T.geral.cancelar} title={T.geral.cancelar} onClick={() => setPasswordTo(null)}><X size={12} /></button>
              </form>
            )}
          </div>
        );
      })}
      {error && <p className="ilha-rapido-vazio ilha-rapido-erro">{error}</p>}
      <div className="ilha-rapido-redes-rodape">
        <button type="button" className="ilha-rapido-icone" aria-label={S.atualizar} title={S.atualizar} onClick={() => { setNetworks(null); void readNetworks(); }}><RefreshCw size={13} /></button>
        <button type="button" className="ilha-rapido-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void system.configuracoes("wifi")}><ExternalLink size={13} /></button>
      </div>
    </div>
  );
}

function Connections() {
  const network = useControlQuick((s) => s.rede);
  const synchronizeNetwork = useControlQuick((s) => s.synchronizeNetwork);
  const [busy, setBusy] = useState<"WiFi" | "Bluetooth" | null>(null);
  const [listOpen, setListOpen] = useState<"WiFi" | "Bluetooth" | null>(null);
  const networksOpen = listOpen === "WiFi";
  const bluetoothOpen = listOpen === "Bluetooth";

  useEffect(() => {
    if (listOpen === "Bluetooth" && !network?.radios.Bluetooth || listOpen === "WiFi" && (!network || !isWithWifiEnabled(network))) setListOpen(null);
  }, [network, listOpen]);

  if (!network) return null;
  const wifiEnabled = isWithWifiEnabled(network);
  const btEnabled = network.radios.Bluetooth ?? false;
  const hasBluetooth = network.radios.Bluetooth !== undefined;
  const statusValue = statusNetwork(network);

  const toggleRadio = async (type: "WiFi" | "Bluetooth", enabled: boolean) => {
    setBusy(type);
    try {
      await system.radio(type, enabled);
      void playSound("blip");
    } catch {
      useIsland.getState().notifyFailure(B.indisponivel);
    } finally {
      setBusy(null);
      void synchronizeNetwork();
    }
  };

  return (
    <>
      <div className="ilha-rapido-conexoes">
        {!network.wifi.existe && (
          <div className="ilha-rapido-conexao" data-ligado={statusValue === "cabo" || undefined}>
            <button type="button" className="ilha-rapido-conexao-principal" title={S.abrirWindows} onClick={() => void system.configuracoes("rede")}>
              <IconNetwork rede={network} tamanho={15} />
              <span className="ilha-rapido-conexao-texto">
                <b>{S.rede}</b>
                <span className="cortar">{statusValue === "cabo" ? S.cabo : statusValue === "semInternet" ? S.semInternet : S.semConexao}</span>
              </span>
            </button>
          </div>
        )}
        {network.wifi.existe && (
          <div className="ilha-rapido-conexao" data-ligado={wifiEnabled || undefined}>
            <button type="button" className="ilha-rapido-conexao-principal" aria-pressed={wifiEnabled} disabled={busy === "WiFi"} onClick={() => void toggleRadio("WiFi", !wifiEnabled)}>
              {statusValue === "semInternet" ? <IconNetwork rede={network} tamanho={15} /> : <IconWifi rede={network} tamanho={15} />}
              <span className="ilha-rapido-conexao-texto">
                <b>{S.wifi}</b>
                <span className="cortar">{!wifiEnabled ? S.desligado : statusValue === "cabo" ? S.cabo : statusValue === "semInternet" ? S.semInternet : network.wifi.conectado ? network.wifi.ssid : S.semRede}</span>
              </span>
            </button>
            <button
              type="button"
              className="ilha-rapido-conexao-seta"
              disabled={!wifiEnabled}
              aria-expanded={networksOpen}
              aria-label={networksOpen ? B.esconderRedes : B.verRedes}
              title={networksOpen ? B.esconderRedes : B.verRedes}
              onClick={() => setListOpen((v) => v === "WiFi" ? null : "WiFi")}
            >
              <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={networksOpen || undefined} />
            </button>
          </div>
        )}
        {hasBluetooth && (
          <div className="ilha-rapido-conexao" data-ligado={btEnabled || undefined}>
            <button type="button" className="ilha-rapido-conexao-principal" aria-pressed={btEnabled} disabled={busy === "Bluetooth"} onClick={() => void toggleRadio("Bluetooth", !btEnabled)}>
              {btEnabled ? <Bluetooth size={15} /> : <BluetoothOff size={15} />}
              <span className="ilha-rapido-conexao-texto">
                <b>{S.bluetooth}</b>
                <span className="cortar">{btEnabled ? S.ligado : S.desligado}</span>
              </span>
            </button>
            <button type="button" className="ilha-rapido-conexao-seta" disabled={!btEnabled || busy === "Bluetooth"} aria-expanded={bluetoothOpen} aria-label={bluetoothOpen ? S.esconderBluetooth : S.verBluetooth} title={bluetoothOpen ? S.esconderBluetooth : S.verBluetooth} onClick={() => setListOpen((v) => v === "Bluetooth" ? null : "Bluetooth")}>
              <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={bluetoothOpen || undefined} />
            </button>
          </div>
        )}
      </div>
      {networksOpen && wifiEnabled && <ListNetworks rede={network} aoMudar={() => void synchronizeNetwork()} />}
      {bluetoothOpen && btEnabled && <BluetoothList />}
    </>
  );
}

const ICON_POWER: Record<ActionPower, LucideIcon> = { bloquear: Lock, suspender: Moon, reiniciar: RotateCcw, desligar: PowerOff };

function MenuPower({ aoFechar: onClose }: { aoFechar: () => void }) {
  const [confirming, setConfirming] = useState<"reiniciar" | "desligar" | null>(null);
  const execute = (action: ActionPower) => {
    void playSound("blip");
    onClose();
    void control.energia(action).catch(() => useIsland.getState().notifyFailure(B.indisponivel));
  };

  if (confirming) {
    return (
      <div className="ilha-rapido-confirmar" role="alertdialog" aria-label={B.energiaOpcoes[confirming]}>
        <p>{B.confirmarEnergia[confirming]}</p>
        <div className="ilha-rapido-confirmar-botoes">
          <button type="button" className="ilha-rapido-texto" onClick={() => setConfirming(null)}>{B.cancelar}</button>
          <button type="button" className="ilha-rapido-texto ilha-rapido-perigo" onClick={() => execute(confirming)}>{B.energiaOpcoes[confirming]}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ilha-rapido-energia">
      {(Object.keys(ICON_POWER) as ActionPower[]).map((action) => {
        const Icon = ICON_POWER[action];
        return (
          <button
            key={action}
            type="button"
            className="ilha-rapido-texto"
            onClick={() => (action === "reiniciar" || action === "desligar" ? setConfirming(action) : execute(action))}
          >
            <Icon size={14} />
            {B.energiaOpcoes[action]}
          </button>
        );
      })}
    </div>
  );
}

export function QuickPanel({ topo: topValue, aoFechar: onClose }: { topo: number; aoFechar: () => void }) {
  const nameValue = useConfig((s) => s.nome);
  const photo = useConfig((s) => s.foto);
  const notDisturb = useConfig((s) => s.naoPerturbe);
  const privacy = useConfig((s) => s.privacidade);
  const set = useConfig((s) => s.set);
  const navigateTo = useInterface((s) => s.navigateTo);
  const audio = useControlQuick((s) => s.audio);
  const unavailable = useControlQuick((s) => s.audioIndisponivel);
  const themeDark = useControlQuick((s) => s.temaEscuro);
  const toggleMute = useControlQuick((s) => s.toggleMute);
  const readTheme = useControlQuick((s) => s.readTheme);
  const toggleTheme = useControlQuick((s) => s.toggleTheme);
  const [byApp, setByApp] = useState(false);
  const [power, setPower] = useState(false);

  useEffect(() => {
    void readTheme();
  }, [readTheme]);

  const openTool = (nameTool: ToolWindows) => {
    void playSound("blip");
    onClose();
    void control.ferramenta(nameTool).catch(() => useIsland.getState().notifyFailure(B.indisponivel));
  };

  return (
    <motion.div
      className="ilha-pop ilha-rapido"
      style={{ top: topValue, maxHeight: `calc(100vh - ${topValue + 12}px)` }}
      role="dialog"
      aria-label={B.painel}
      data-privacidade={privacy ? "sim" : "nao"}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", visualDuration: 0.28, bounce: 0.15 }}
    >
      <div className="ilha-rapido-topo">
        <span className="ilha-rapido-avatar" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : (nameValue.trim()[0] ?? "N").toUpperCase()}
        </span>
        <span className="ilha-rapido-nome cortar">{nameValue}</span>
        <button
          type="button"
          className="ilha-rapido-redondo"
          aria-label={B.configuracoesNiko}
          title={B.configuracoesNiko}
          onClick={() => {
            void playSound("open");
            onClose();
            navigateTo("configuracoes");
          }}
        >
          <Settings size={14} />
        </button>
        <button type="button" className="ilha-rapido-redondo" data-ativo={power || undefined} aria-expanded={power} aria-label={B.energia} title={B.energia} onClick={() => setPower((v) => !v)}>
          <Power size={14} />
        </button>
      </div>

      {power && <MenuPower aoFechar={onClose} />}

      {unavailable && !audio && <p className="ilha-rapido-vazio">{B.indisponivel}</p>}

      <Connections />

      <div className="ilha-rapido-grade">
        <Toggle icone={BellOff} rotulo={B.alternadores.naoPerturbe} dica={B.dicas.naoPerturbe} ligado={notDisturb} aoClicar={() => set({ naoPerturbe: !notDisturb })} />
        <Toggle icone={VolumeX} rotulo={B.alternadores.mudo} dica={B.dicas.mudo} ligado={audio?.saida?.mudo} desativado={!audio?.saida} aoClicar={() => toggleMute("saida")} />
        <Toggle icone={MicOff} rotulo={B.alternadores.microfone} dica={B.dicas.microfone} ligado={audio?.entrada?.mudo} desativado={!audio?.entrada} aoClicar={() => toggleMute("entrada")} />
        <Toggle icone={ScanLine} rotulo={B.alternadores.captura} dica={B.dicas.captura} aoClicar={() => openTool("captura")} />
        <Toggle icone={Keyboard} rotulo={B.alternadores.teclado} dica={B.dicas.teclado} aoClicar={() => openTool("teclado")} />
        <Toggle icone={Moon} rotulo={B.alternadores.escuro} dica={B.dicas.escuro} ligado={themeDark ?? false} desativado={themeDark === null} aoClicar={() => void toggleTheme()} />
      </div>

      <div className="ilha-rapido-bloco">
        <LineAudio alvo="saida" rotulo={B.volumeSaida} aberto={byApp} aoAlternarMixer={() => setByApp((v) => !v)} />
        {byApp && <VolumeByApp />}
        <LineAudio alvo="entrada" rotulo={B.volumeEntrada} />
        <LineBrightness />
      </div>

      <Media />
    </motion.div>
  );
}
