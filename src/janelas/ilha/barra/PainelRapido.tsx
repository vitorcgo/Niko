import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  BellOff, Bluetooth, BluetoothOff, ChevronDown, ExternalLink, Keyboard, Lock, Mic, MicOff, Moon, Pause, Play, Power, PowerOff, RefreshCw, RotateCcw, ScanLine, Settings, SkipBack, SkipForward, Sun,
  Volume2, VolumeX, X,
  type LucideIcon,
} from "lucide-react";
import { useConfig } from "../../../estado/configuracoes";
import { useInterface } from "../../../estado/interface";
import { useIlha } from "../../../estado/ilha";
import { useMidia, fundoDaCapa } from "../../../estado/midia";
import { useControleRapido, agruparSessoes } from "../../../estado/controleRapido";
import { controle, sistema, type AcaoDeEnergia, type AlvoDeAudio, type EstadoSistema, type FerramentaWindows, type RedeWifi, type SessaoDeAudio } from "../../../ponte/ponteLocal";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";
import { IconeDeSinal, IconeDeVolume, IconeDeWifi, wifiLigado as estaComWifiLigado } from "./IconesDeStatus";
import { ListaDeBluetooth } from "./ListaDeBluetooth";

const B = T.ilha.barra;
const S = T.ilha.sistema;
const ESPERA_DO_BRILHO_MS = 250;
const SEM_SESSOES: SessaoDeAudio[] = [];

function Alternador({ icone: Icone, rotulo, dica, ligado, desativado, aoClicar }: { icone: LucideIcon; rotulo: string; dica: string; ligado?: boolean; desativado?: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="ilha-rapido-alternador" data-ligado={ligado || undefined} aria-pressed={ligado} disabled={desativado} title={dica} onClick={aoClicar}>
      <Icone size={15} />
      <span>{rotulo}</span>
    </button>
  );
}

function Deslizante({ rotulo, valor, aoMudar }: { rotulo: string; valor: number; aoMudar: (v: number) => void }) {
  return (
    <input
      type="range"
      className="ilha-rapido-deslizante"
      min={0}
      max={100}
      step={1}
      value={valor}
      aria-label={rotulo}
      style={{ ["--preenchido" as string]: `${valor}%` }}
      onChange={(e) => aoMudar(Number(e.target.value))}
    />
  );
}

function LinhaDeAudio({ alvo, rotulo, aberto, aoAlternarMixer }: { alvo: AlvoDeAudio; rotulo: string; aberto?: boolean; aoAlternarMixer?: () => void }) {
  const nivel = useControleRapido((s) => s.audio?.[alvo] ?? null);
  const definirVolume = useControleRapido((s) => s.definirVolume);
  const alternarMudo = useControleRapido((s) => s.alternarMudo);
  const mudo = nivel?.mudo ?? false;

  return (
    <div className="ilha-rapido-linha" data-desativada={!nivel || undefined}>
      <button type="button" className="ilha-rapido-icone" disabled={!nivel} aria-pressed={mudo} aria-label={rotulo} title={nivel ? rotulo : B.semDispositivo} onClick={() => alternarMudo(alvo)}>
        {alvo === "entrada" ? mudo ? <MicOff size={15} /> : <Mic size={15} /> : <IconeDeVolume volume={nivel?.volume ?? 0} mudo={mudo} tamanho={15} />}
      </button>
      <Deslizante rotulo={rotulo} valor={nivel ? (mudo ? 0 : nivel.volume) : 0} aoMudar={(v) => definirVolume(alvo, v)} />
      <span className="ilha-rapido-valor numero">{nivel ? `${mudo ? 0 : nivel.volume}%` : ""}</span>
      {aoAlternarMixer ? (
        <button type="button" className="ilha-rapido-icone" aria-expanded={aberto} aria-label={aberto ? B.esconderPorApp : B.verPorApp} title={aberto ? B.esconderPorApp : B.verPorApp} onClick={aoAlternarMixer}>
          <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={aberto || undefined} />
        </button>
      ) : (
        <span className="ilha-rapido-icone" aria-hidden="true" />
      )}
    </div>
  );
}

function VolumePorApp() {
  const sessoes = useControleRapido((s) => s.audio?.sessoes ?? SEM_SESSOES);
  const ajustarApp = useControleRapido((s) => s.ajustarApp);
  const grupos = agruparSessoes(sessoes).sort((a, b) => Number(a.sistema) - Number(b.sistema) || Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome));

  if (grupos.length === 0) return <p className="ilha-rapido-vazio">{B.semAppsComSom}</p>;
  return (
    <div className="ilha-rapido-apps">
      {grupos.map((g) => {
        const nome = g.sistema ? B.sonsDoSistema : g.nome || B.appSemNome;
        return (
          <div key={g.chave} className="ilha-rapido-linha ilha-rapido-app" data-ativa={g.ativa || undefined}>
            <button
              type="button"
              className="ilha-rapido-icone"
              aria-pressed={g.mudo}
              aria-label={g.mudo ? B.ativarSomApp(nome) : B.silenciarApp(nome)}
              title={g.mudo ? B.ativarSomApp(nome) : B.silenciarApp(nome)}
              onClick={() => ajustarApp(g.pids, { mudo: !g.mudo })}
            >
              {g.icone ? <img src={g.icone} alt="" width={16} height={16} draggable={false} data-mudo={g.mudo || undefined} /> : g.mudo ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <div className="ilha-rapido-app-meio">
              <span className="ilha-rapido-app-nome cortar">{nome}</span>
              <Deslizante rotulo={B.volumeDoApp(nome)} valor={g.mudo ? 0 : g.volume} aoMudar={(v) => ajustarApp(g.pids, { volume: v, ...(g.mudo && v > 0 ? { mudo: false } : {}) })} />
            </div>
            <span className="ilha-rapido-valor numero">{g.mudo ? 0 : g.volume}%</span>
          </div>
        );
      })}
    </div>
  );
}

function LinhaDeBrilho() {
  const brilhoLido = useControleRapido((s) => s.rede?.brilho ?? null);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const espera = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(espera.current), []);

  const brilho = escolhido ?? brilhoLido;
  if (brilho === null) return null;
  const mudar = (v: number) => {
    setEscolhido(v);
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => void sistema.brilho(v).catch(() => undefined), ESPERA_DO_BRILHO_MS);
  };
  return (
    <div className="ilha-rapido-linha">
      <span className="ilha-rapido-icone" aria-hidden="true">
        <Sun size={15} />
      </span>
      <Deslizante rotulo={B.brilho} valor={brilho} aoMudar={mudar} />
      <span className="ilha-rapido-valor numero">{brilho}%</span>
      <span className="ilha-rapido-icone" aria-hidden="true" />
    </div>
  );
}

function Midia() {
  const midia = useMidia();
  if (!midia.faixa) return null;
  return (
    <div className="ilha-rapido-midia">
      <span className="ilha-rapido-capa" style={{ background: fundoDaCapa(midia.faixa) }} />
      <div className="ilha-rapido-midia-texto privado">
        <span className="cortar">{midia.faixa.titulo}</span>
        <span className="cortar ilha-rapido-sutil">{midia.faixa.artista || midia.faixa.app}</span>
      </div>
      <div className="ilha-rapido-midia-botoes">
        <button type="button" className="ilha-rapido-icone" disabled={!midia.podeVoltar} aria-label={T.ilha.anterior} title={T.ilha.anterior} onClick={midia.anterior}>
          <SkipBack size={14} />
        </button>
        <button type="button" className="ilha-rapido-icone ilha-rapido-tocar" aria-label={midia.tocando ? T.ilha.pausar : T.ilha.tocar} title={midia.tocando ? T.ilha.pausar : T.ilha.tocar} disabled={!midia.podeAlternar} onClick={midia.alternar}>
          {midia.tocando ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="ilha-rapido-icone" disabled={!midia.podeAvancar} aria-label={T.ilha.proxima} title={T.ilha.proxima} onClick={midia.proxima}>
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
}

function ListaDeRedes({ rede, aoMudar }: { rede: EstadoSistema; aoMudar: () => void }) {
  const [redes, setRedes] = useState<RedeWifi[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [senhaPara, setSenhaPara] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  const lerRedes = () => sistema.redes().then(setRedes).catch(() => setRedes([]));
  useEffect(() => {
    void lerRedes();
  }, []);

  const executar = async (chave: string, acao: () => Promise<unknown>) => {
    setOcupado(chave);
    setErro("");
    try {
      await acao();
      void tocarSom("blip");
    } catch (e) {
      setErro(S.falhou((e as Error).message));
    } finally {
      setOcupado(null);
      aoMudar();
    }
  };

  const conectar = (r: RedeWifi, comSenha?: string) =>
    executar(`rede-${r.ssid}`, async () => {
      await sistema.conectar(r.ssid, comSenha);
      setSenhaPara(null);
      setSenha("");
      await lerRedes();
    });

  return (
    <div className="ilha-rapido-redes">
      {redes === null && <p className="ilha-rapido-vazio">{T.geral.carregando}</p>}
      {redes?.length === 0 && <p className="ilha-rapido-vazio">{S.semRedes}</p>}
      {redes?.map((r) => {
        const atual = rede.wifi.conectado && rede.wifi.ssid === r.ssid;
        const pedindo = senhaPara === r.ssid;
        return (
          <div key={r.ssid} className="ilha-rapido-rede" data-atual={atual || undefined}>
            <div className="ilha-rapido-linha">
              <span className="ilha-rapido-icone" aria-hidden="true"><IconeDeSinal sinal={r.sinal} tamanho={14} /></span>
              <span className="cortar ilha-rapido-rede-nome">{r.ssid}</span>
              {r.segura && <Lock size={11} className="ilha-rapido-sutil" />}
              {atual ? (
                <button type="button" className="ilha-rapido-texto ilha-rapido-texto-pequeno" disabled={!!ocupado} onClick={() => void executar("desc", () => sistema.desconectar())}>{S.desconectar}</button>
              ) : (
                <button
                  type="button"
                  className="ilha-rapido-texto ilha-rapido-texto-pequeno"
                  disabled={ocupado === `rede-${r.ssid}`}
                  onClick={() => (r.segura && !r.salva ? setSenhaPara(pedindo ? null : r.ssid) : void conectar(r))}
                >
                  {ocupado === `rede-${r.ssid}` ? S.conectando : S.conectar}
                </button>
              )}
            </div>
            {pedindo && (
              <form
                className="ilha-rapido-senha"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (senha.length < 8) return setErro(S.senhaCurta);
                  void conectar(r, senha);
                }}
              >
                <input type="password" autoFocus autoComplete="off" value={senha} maxLength={63} placeholder={S.senha} aria-label={S.senha} onChange={(e) => setSenha(e.target.value)} />
                <button type="submit" className="ilha-rapido-texto ilha-rapido-texto-pequeno" disabled={!!ocupado}>{S.conectar}</button>
                <button type="button" className="ilha-rapido-icone" aria-label={T.geral.cancelar} title={T.geral.cancelar} onClick={() => setSenhaPara(null)}><X size={12} /></button>
              </form>
            )}
          </div>
        );
      })}
      {erro && <p className="ilha-rapido-vazio ilha-rapido-erro">{erro}</p>}
      <div className="ilha-rapido-redes-rodape">
        <button type="button" className="ilha-rapido-icone" aria-label={S.atualizar} title={S.atualizar} onClick={() => { setRedes(null); void lerRedes(); }}><RefreshCw size={13} /></button>
        <button type="button" className="ilha-rapido-icone" aria-label={S.abrirWindows} title={S.abrirWindows} onClick={() => void sistema.configuracoes("wifi")}><ExternalLink size={13} /></button>
      </div>
    </div>
  );
}

function Conexoes() {
  const rede = useControleRapido((s) => s.rede);
  const sincronizarRede = useControleRapido((s) => s.sincronizarRede);
  const [ocupado, setOcupado] = useState<"WiFi" | "Bluetooth" | null>(null);
  const [listaAberta, setListaAberta] = useState<"WiFi" | "Bluetooth" | null>(null);
  const redesAbertas = listaAberta === "WiFi";
  const bluetoothAberto = listaAberta === "Bluetooth";

  useEffect(() => {
    if (listaAberta === "Bluetooth" && !rede?.radios.Bluetooth || listaAberta === "WiFi" && (!rede || !estaComWifiLigado(rede))) setListaAberta(null);
  }, [rede, listaAberta]);

  if (!rede) return null;
  const wifiLigado = estaComWifiLigado(rede);
  const btLigado = rede.radios.Bluetooth ?? false;
  const temBluetooth = rede.radios.Bluetooth !== undefined;
  if (!rede.wifi.existe && !temBluetooth) return null;

  const alternarRadio = async (tipo: "WiFi" | "Bluetooth", ligado: boolean) => {
    setOcupado(tipo);
    try {
      await sistema.radio(tipo, ligado);
      void tocarSom("blip");
    } catch {
      useIlha.getState().avisarFalha(B.indisponivel);
    } finally {
      setOcupado(null);
      void sincronizarRede();
    }
  };

  return (
    <>
      <div className="ilha-rapido-conexoes">
        {rede.wifi.existe && (
          <div className="ilha-rapido-conexao" data-ligado={wifiLigado || undefined}>
            <button type="button" className="ilha-rapido-conexao-principal" aria-pressed={wifiLigado} disabled={ocupado === "WiFi"} onClick={() => void alternarRadio("WiFi", !wifiLigado)}>
              <IconeDeWifi rede={rede} tamanho={15} />
              <span className="ilha-rapido-conexao-texto">
                <b>{S.wifi}</b>
                <span className="cortar">{!wifiLigado ? S.desligado : rede.wifi.conectado ? rede.wifi.ssid : S.semRede}</span>
              </span>
            </button>
            <button
              type="button"
              className="ilha-rapido-conexao-seta"
              disabled={!wifiLigado}
              aria-expanded={redesAbertas}
              aria-label={redesAbertas ? B.esconderRedes : B.verRedes}
              title={redesAbertas ? B.esconderRedes : B.verRedes}
              onClick={() => setListaAberta((v) => v === "WiFi" ? null : "WiFi")}
            >
              <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={redesAbertas || undefined} />
            </button>
          </div>
        )}
        {temBluetooth && (
          <div className="ilha-rapido-conexao" data-ligado={btLigado || undefined}>
            <button type="button" className="ilha-rapido-conexao-principal" aria-pressed={btLigado} disabled={ocupado === "Bluetooth"} onClick={() => void alternarRadio("Bluetooth", !btLigado)}>
              {btLigado ? <Bluetooth size={15} /> : <BluetoothOff size={15} />}
              <span className="ilha-rapido-conexao-texto">
                <b>{S.bluetooth}</b>
                <span className="cortar">{btLigado ? S.ligado : S.desligado}</span>
              </span>
            </button>
            <button type="button" className="ilha-rapido-conexao-seta" disabled={!btLigado || ocupado === "Bluetooth"} aria-expanded={bluetoothAberto} aria-label={bluetoothAberto ? S.esconderBluetooth : S.verBluetooth} title={bluetoothAberto ? S.esconderBluetooth : S.verBluetooth} onClick={() => setListaAberta((v) => v === "Bluetooth" ? null : "Bluetooth")}>
              <ChevronDown size={14} className="ilha-rapido-seta" data-aberta={bluetoothAberto || undefined} />
            </button>
          </div>
        )}
      </div>
      {redesAbertas && wifiLigado && <ListaDeRedes rede={rede} aoMudar={() => void sincronizarRede()} />}
      {bluetoothAberto && btLigado && <ListaDeBluetooth />}
    </>
  );
}

const ICONE_ENERGIA: Record<AcaoDeEnergia, LucideIcon> = { bloquear: Lock, suspender: Moon, reiniciar: RotateCcw, desligar: PowerOff };

function MenuDeEnergia({ aoFechar }: { aoFechar: () => void }) {
  const [confirmando, setConfirmando] = useState<"reiniciar" | "desligar" | null>(null);
  const executar = (acao: AcaoDeEnergia) => {
    void tocarSom("blip");
    aoFechar();
    void controle.energia(acao).catch(() => useIlha.getState().avisarFalha(B.indisponivel));
  };

  if (confirmando) {
    return (
      <div className="ilha-rapido-confirmar" role="alertdialog" aria-label={B.energiaOpcoes[confirmando]}>
        <p>{B.confirmarEnergia[confirmando]}</p>
        <div className="ilha-rapido-confirmar-botoes">
          <button type="button" className="ilha-rapido-texto" onClick={() => setConfirmando(null)}>{B.cancelar}</button>
          <button type="button" className="ilha-rapido-texto ilha-rapido-perigo" onClick={() => executar(confirmando)}>{B.energiaOpcoes[confirmando]}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ilha-rapido-energia">
      {(Object.keys(ICONE_ENERGIA) as AcaoDeEnergia[]).map((acao) => {
        const Icone = ICONE_ENERGIA[acao];
        return (
          <button
            key={acao}
            type="button"
            className="ilha-rapido-texto"
            onClick={() => (acao === "reiniciar" || acao === "desligar" ? setConfirmando(acao) : executar(acao))}
          >
            <Icone size={14} />
            {B.energiaOpcoes[acao]}
          </button>
        );
      })}
    </div>
  );
}

export function PainelRapido({ topo, aoFechar, embutido = false }: { topo: number; aoFechar: () => void; embutido?: boolean }) {
  const nome = useConfig((s) => s.nome);
  const foto = useConfig((s) => s.foto);
  const naoPerturbe = useConfig((s) => s.naoPerturbe);
  const privacidade = useConfig((s) => s.privacidade);
  const definir = useConfig((s) => s.definir);
  const irPara = useInterface((s) => s.irPara);
  const audio = useControleRapido((s) => s.audio);
  const indisponivel = useControleRapido((s) => s.audioIndisponivel);
  const temaEscuro = useControleRapido((s) => s.temaEscuro);
  const alternarMudo = useControleRapido((s) => s.alternarMudo);
  const lerTema = useControleRapido((s) => s.lerTema);
  const alternarTema = useControleRapido((s) => s.alternarTema);
  const [porApp, setPorApp] = useState(false);
  const [energia, setEnergia] = useState(false);

  useEffect(() => {
    void lerTema();
  }, [lerTema]);

  const abrirFerramenta = (nomeFerramenta: FerramentaWindows) => {
    void tocarSom("blip");
    aoFechar();
    void controle.ferramenta(nomeFerramenta).catch(() => useIlha.getState().avisarFalha(B.indisponivel));
  };

  return (
    <motion.div
      className="ilha-pop ilha-rapido"
      data-embutido={embutido || undefined}
      style={embutido ? undefined : { top: topo, maxHeight: `calc(100vh - ${topo + 12}px)` }}
      role={embutido ? "group" : "dialog"}
      aria-label={B.painel}
      data-privacidade={privacidade ? "sim" : "nao"}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: "spring", visualDuration: 0.28, bounce: 0.15 }}
    >
      <div className="ilha-rapido-topo">
        <span className="ilha-rapido-avatar" aria-hidden="true">
          {foto ? <img src={foto} alt="" /> : (nome.trim()[0] ?? "N").toUpperCase()}
        </span>
        <span className="ilha-rapido-nome cortar">{nome}</span>
        <button
          type="button"
          className="ilha-rapido-redondo"
          aria-label={B.configuracoesNiko}
          title={B.configuracoesNiko}
          onClick={() => {
            void tocarSom("open");
            aoFechar();
            irPara("configuracoes");
          }}
        >
          <Settings size={14} />
        </button>
        <button type="button" className="ilha-rapido-redondo" data-ativo={energia || undefined} aria-expanded={energia} aria-label={B.energia} title={B.energia} onClick={() => setEnergia((v) => !v)}>
          <Power size={14} />
        </button>
      </div>

      {energia && <MenuDeEnergia aoFechar={aoFechar} />}

      {indisponivel && !audio && <p className="ilha-rapido-vazio">{B.indisponivel}</p>}

      <Conexoes />

      <div className="ilha-rapido-grade">
        <Alternador icone={BellOff} rotulo={B.alternadores.naoPerturbe} dica={B.dicas.naoPerturbe} ligado={naoPerturbe} aoClicar={() => definir({ naoPerturbe: !naoPerturbe })} />
        <Alternador icone={VolumeX} rotulo={B.alternadores.mudo} dica={B.dicas.mudo} ligado={audio?.saida?.mudo} desativado={!audio?.saida} aoClicar={() => alternarMudo("saida")} />
        <Alternador icone={MicOff} rotulo={B.alternadores.microfone} dica={B.dicas.microfone} ligado={audio?.entrada?.mudo} desativado={!audio?.entrada} aoClicar={() => alternarMudo("entrada")} />
        <Alternador icone={ScanLine} rotulo={B.alternadores.captura} dica={B.dicas.captura} aoClicar={() => abrirFerramenta("captura")} />
        <Alternador icone={Keyboard} rotulo={B.alternadores.teclado} dica={B.dicas.teclado} aoClicar={() => abrirFerramenta("teclado")} />
        <Alternador icone={Moon} rotulo={B.alternadores.escuro} dica={B.dicas.escuro} ligado={temaEscuro ?? false} desativado={temaEscuro === null} aoClicar={() => void alternarTema()} />
      </div>

      <div className="ilha-rapido-bloco">
        <LinhaDeAudio alvo="saida" rotulo={B.volumeSaida} aberto={porApp} aoAlternarMixer={() => setPorApp((v) => !v)} />
        {porApp && <VolumePorApp />}
        <LinhaDeAudio alvo="entrada" rotulo={B.volumeEntrada} />
        <LinhaDeBrilho />
      </div>

      <Midia />
    </motion.div>
  );
}
