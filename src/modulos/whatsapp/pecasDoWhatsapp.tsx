import { useEffect, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Contact, EyeOff, FileText, Image, MapPin, Mic, Paperclip, Play, Sticker, Users, Video, type LucideIcon } from "lucide-react";
import { T } from "../../textos/textos";
import { corDoNome, iniciaisDoNome, whatsappPonte, type MensagemWhatsapp } from "../../ponte/whatsapp";
import { formatarTamanho } from "../../utilitarios/anexos";
import { EsperaDoAudio, PlayerDeAudio } from "./PlayerDeAudio";
import { VisualizacaoUnica } from "./VisualizacaoUnica";

const W = T.whatsapp;

export function Avatar({ nome, foto, tamanho = 30, grupo }: { nome: string; foto?: string | null; tamanho?: number; grupo?: boolean }) {
  const imagem = foto ? (
    <img className="whatsapp-avatar whatsapp-avatar-foto" src={foto} alt="" width={tamanho} height={tamanho} />
  ) : (
    <span className="whatsapp-avatar" style={{ width: tamanho, height: tamanho, background: corDoNome(nome), fontSize: Math.round(tamanho * 0.36) }} aria-hidden="true">
      {iniciaisDoNome(nome)}
    </span>
  );
  if (!grupo) return imagem;
  return (
    <span className="whatsapp-avatar-caixa">
      {imagem}
      <span className="whatsapp-avatar-grupo" title={W.grupo}><Users size={9} strokeWidth={2.5} /></span>
    </span>
  );
}

export const ICONE_DA_MIDIA: Record<string, LucideIcon> = { imagem: Image, video: Video, audio: Mic, documento: FileText, figurinha: Sticker, localizacao: MapPin, contato: Contact, outra: Paperclip };

export const horaDaMensagem = (iso: string) => format(new Date(iso), "HH:mm");

export function diaDaMensagem(iso: string): string {
  const data = new Date(iso);
  if (isToday(data)) return W.hoje;
  if (isYesterday(data)) return W.ontem;
  return format(data, "d 'de' MMMM", { locale: ptBR });
}

export function rotuloDaMidia(m: Pick<MensagemWhatsapp, "midia" | "nomeDoArquivo">): string {
  const tipo = W.midias[m.midia] ?? W.midias.outra;
  return m.midia === "documento" && m.nomeDoArquivo ? `${tipo}: ${m.nomeDoArquivo}` : tipo;
}

const MIDIAS_NA_HORA = new Set(["imagem", "figurinha"]);
const MIDIAS_COM_CLIQUE = new Set(["video", "audio"]);

const AUDIO_AUTOMATICO = 2 * 1024 * 1024;
const MIDIAS_UNICAS = new Set(["imagem", "video", "audio"]);

export function MidiaDaMensagem({ jid, m, aoAmpliar }: { jid: string; m: MensagemWhatsapp; aoAmpliar?: (url: string) => void }) {
  const tipo = W.midias[m.midia] ?? W.midias.outra;
  const naHora = MIDIAS_NA_HORA.has(m.midia);
  const audioAutomatico = m.midia === "audio" && !m.visualizacaoUnica && (m.tamanho ?? 0) <= AUDIO_AUTOMATICO;
  const [pedida, setPedida] = useState(naHora);
  const [clicou, setClicou] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [falhou, setFalhou] = useState(false);
  const espera = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = espera.current;
    if (!audioAutomatico || pedida || !el) return;
    const observador = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setPedida(true);
      observador.disconnect();
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [audioAutomatico, pedida]);

  useEffect(() => {
    if (!pedida || m.visualizacaoUnica) return;
    let vivo = true;
    let criada: string | null = null;
    whatsappPonte
      .midia(jid, m.id)
      .then((u) => {
        criada = u;
        if (vivo) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => vivo && setFalhou(true));
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [pedida, jid, m.id, m.visualizacaoUnica]);

  if (m.visualizacaoUnica) return MIDIAS_UNICAS.has(m.midia) ? <VisualizacaoUnica jid={jid} m={m} /> : <span className="whatsapp-midia"><EyeOff size={11} /> {W.visualizacaoUnica(tipo)}</span>;
  if (!naHora && !MIDIAS_COM_CLIQUE.has(m.midia)) {
    const tamanho = m.tamanho ? ` (${formatarTamanho(m.tamanho)})` : "";
    return <span className="whatsapp-midia">{rotuloDaMidia(m)}{tamanho}</span>;
  }
  if (falhou) return <span className="whatsapp-midia">{W.midiaFalhou(tipo)}</span>;
  if (m.midia === "audio" && (audioAutomatico || pedida) && !url) return <span ref={espera}><EsperaDoAudio carregando={pedida} /></span>;
  if (!pedida) {
    return (
      <button type="button" className="whatsapp-carregar-midia" onClick={() => { setClicou(true); setPedida(true); }}>
        <Play size={11} /> {W.carregarMidia(tipo, m.tamanho ? formatarTamanho(m.tamanho) : "")}
      </button>
    );
  }
  if (!url) return <span className="whatsapp-midia-carregando" data-tipo={m.midia}>{W.carregandoMidia}</span>;
  if (m.midia === "video") return <video className="whatsapp-video" src={url} controls autoPlay />;
  if (m.midia === "audio") return <PlayerDeAudio url={url} autoTocar={clicou} />;
  const imagem = <img className="whatsapp-imagem" data-tipo={m.midia} src={url} alt={tipo} />;
  if (!aoAmpliar || m.midia !== "imagem") return imagem;
  return <button type="button" className="whatsapp-ampliar" aria-label={W.pagina.ampliar} onClick={() => aoAmpliar(url)}>{imagem}</button>;
}

const IMAGEM_COM_PREVIA = /^image\/(png|jpeg|gif|webp)$/;

export function PreviaDoArquivo({ arquivo, tamanho }: { arquivo: File; tamanho: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!IMAGEM_COM_PREVIA.test(arquivo.type)) {
      setUrl(null);
      return;
    }
    const criada = URL.createObjectURL(arquivo);
    setUrl(criada);
    return () => URL.revokeObjectURL(criada);
  }, [arquivo]);
  const Icone = arquivo.type.startsWith("video/") ? Video : arquivo.type.startsWith("audio/") ? Mic : FileText;
  return (
    <span className="whatsapp-previa-arquivo" style={{ width: tamanho, height: tamanho }}>
      {url ? <img src={url} alt={arquivo.name} /> : <Icone size={Math.round(tamanho * 0.4)} />}
    </span>
  );
}

export function Previa({ m }: { m: MensagemWhatsapp | undefined }) {
  if (!m) return null;
  const Icone = m.midia !== "nenhuma" ? ICONE_DA_MIDIA[m.midia] ?? Paperclip : null;
  const corpo = m.texto || (m.midia !== "nenhuma" ? rotuloDaMidia(m) : "");
  return (
    <span className="whatsapp-item-previa privado">
      {m.minha && <Check size={12} className="whatsapp-previa-check" aria-label={W.voce} />}
      {Icone && <Icone size={12} className="whatsapp-previa-icone" aria-hidden="true" />}
      <span className="cortar">{corpo}</span>
    </span>
  );
}
