import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { T } from "../../textos/textos";
import { formatarDuracao, ondasDoAudio } from "../../utilitarios/ondasDoAudio";

const A = T.whatsapp.audio;
const BARRAS = 34;
const VELOCIDADES = [1, 1.5, 2];
const ONDAS_PARADAS = Array.from({ length: BARRAS }, () => 0.18);
let tocandoAgora: HTMLAudioElement | null = null;

export function EsperaDoAudio({ carregando }: { carregando: boolean }) {
  return (
    <span className="whatsapp-player" data-esperando>
      <span className="whatsapp-player-tocar"><Mic size={14} /></span>
      <span className="whatsapp-player-ondas" aria-hidden="true">
        {ONDAS_PARADAS.map((a, i) => <span key={i} style={{ height: `${a * 100}%` }} />)}
      </span>
      <span className="whatsapp-player-tempo">{carregando ? A.carregando : "--:--"}</span>
    </span>
  );
}

export function PlayerDeAudio({ url, autoTocar }: { url: string; autoTocar?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [ondas, setOndas] = useState<number[] | null>(null);
  const [duracao, setDuracao] = useState(0);
  const [atual, setAtual] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        const decodificado = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes);
        if (!vivo) return;
        setDuracao(decodificado.duration);
        setOndas(ondasDoAudio(decodificado.getChannelData(0), BARRAS));
      } catch {
        if (vivo) setOndas(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [url]);

  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    const passo = () => {
      setAtual(audio.current?.currentTime ?? 0);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade;
  }, [velocidade]);

  useEffect(() => () => {
    if (tocandoAgora === audio.current) tocandoAgora = null;
  }, []);

  const alternar = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  };

  const irPara = (segundos: number) => {
    const a = audio.current;
    if (!a || !duracao) return;
    a.currentTime = Math.max(0, Math.min(duracao, segundos));
    setAtual(a.currentTime);
  };

  const pularPeloClique = (e: PointerEvent<HTMLSpanElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    irPara(((e.clientX - caixa.left) / caixa.width) * duracao);
  };

  const pularPeloTeclado = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "ArrowRight") irPara(atual + 5);
    else if (e.key === "ArrowLeft") irPara(atual - 5);
    else if (e.key === " " || e.key === "Enter") alternar();
    else return;
    e.preventDefault();
  };

  const progresso = duracao ? atual / duracao : 0;
  const mostrado = tocando || atual > 0 ? atual : duracao;

  return (
    <span className="whatsapp-player" data-tocando={tocando || undefined}>
      <audio
        ref={audio}
        src={url}
        preload="auto"
        autoPlay={autoTocar}
        onPlay={(e) => {
          if (tocandoAgora && tocandoAgora !== e.currentTarget) tocandoAgora.pause();
          tocandoAgora = e.currentTarget;
          e.currentTarget.playbackRate = velocidade;
          setTocando(true);
        }}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuracao((atualDuracao) => atualDuracao || d);
        }}
      />
      <button type="button" className="whatsapp-player-tocar" aria-label={tocando ? A.pausar : A.tocar} title={tocando ? A.pausar : A.tocar} onClick={alternar}>
        {tocando ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      </button>
      <span
        className="whatsapp-player-ondas"
        role="slider"
        tabIndex={0}
        aria-label={A.posicao}
        aria-valuemin={0}
        aria-valuemax={Math.round(duracao)}
        aria-valuenow={Math.round(atual)}
        aria-valuetext={`${formatarDuracao(atual)} / ${formatarDuracao(duracao)}`}
        onPointerDown={pularPeloClique}
        onKeyDown={pularPeloTeclado}
      >
        {(ondas ?? ONDAS_PARADAS).map((a, i) => (
          <span key={i} data-tocada={(i + 0.5) / BARRAS <= progresso || undefined} style={{ height: `${Math.max(14, a * 100)}%` }} />
        ))}
      </span>
      <span className="whatsapp-player-tempo numero">{formatarDuracao(mostrado)}</span>
      <button
        type="button"
        className="whatsapp-player-velocidade numero"
        aria-label={A.velocidade(velocidade)}
        title={A.velocidade(velocidade)}
        onClick={() => setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length])}
      >
        {A.vezes(velocidade)}
      </button>
    </span>
  );
}
