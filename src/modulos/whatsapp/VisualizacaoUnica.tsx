import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { T } from "../../textos/textos";
import { whatsappPonte, type MensagemWhatsapp } from "../../ponte/whatsapp";
import { PlayerDeAudio } from "./PlayerDeAudio";

const W = T.whatsapp;
const U = W.unica;

function mensagemDoErro(e: unknown): string {
  const codigo = (e as Error)?.message ?? "";
  if (codigo === "unica_ja_aberta") return U.jaAberta;
  return W.erros[codigo] ?? U.indisponivel;
}

export function VisualizacaoUnica({ jid, m }: { jid: string; m: MensagemWhatsapp }) {
  const tipo = W.midias[m.midia] ?? W.midias.outra;
  const [aberta, setAberta] = useState(Boolean(m.unicaAberta));
  const [carregando, setCarregando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (m.unicaAberta) setAberta(true);
  }, [m.unicaAberta]);

  useEffect(() => {
    if (!url) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  const abrir = async () => {
    if (carregando || aberta) return;
    setCarregando(true);
    setErro("");
    try {
      const criada = await whatsappPonte.midiaUnica(jid, m.id);
      setAberta(true);
      setUrl(criada);
    } catch (e) {
      const texto = mensagemDoErro(e);
      if (texto === U.jaAberta) setAberta(true);
      setErro(texto);
    } finally {
      setCarregando(false);
    }
  };

  function fechar() {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
  }

  const tela = url
    ? createPortal(
        <div className="whatsapp-unica-tela" role="dialog" aria-modal="true" aria-label={U.titulo(tipo)} onContextMenu={(e) => e.preventDefault()}>
          <div className="whatsapp-unica-topo">
            <span><Eye size={14} /> {U.titulo(tipo)}</span>
            <button type="button" onClick={fechar}><X size={14} /> {U.fechar}</button>
          </div>
          <div className="whatsapp-unica-conteudo">
            {m.midia === "video" ? (
              <video src={url} controls autoPlay controlsList="nodownload noplaybackrate" disablePictureInPicture />
            ) : m.midia === "audio" ? (
              <PlayerDeAudio url={url} autoTocar />
            ) : (
              <img src={url} alt={tipo} draggable={false} />
            )}
          </div>
          <span className="whatsapp-unica-dica">{U.dica}</span>
        </div>,
        document.body,
      )
    : null;

  if (aberta && !url) {
    return (
      <span className="whatsapp-midia whatsapp-unica" data-aberta>
        <EyeOff size={12} /> {erro && erro !== U.jaAberta ? erro : U.aberta(tipo)}
      </span>
    );
  }

  return (
    <>
      <button type="button" className="whatsapp-carregar-midia whatsapp-unica" disabled={carregando} onClick={() => void abrir()} title={U.dica}>
        {carregando ? <LoaderCircle size={12} className="girando" /> : <Eye size={12} />} {U.verUmaVez(tipo)}
      </button>
      {erro && <span className="whatsapp-midia whatsapp-unica-erro">{erro}</span>}
      {tela}
    </>
  );
}
