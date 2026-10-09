import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useConfig } from "../estado/configuracoes";
import { T } from "../textos/textos";

const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const LIMITE = 8 * 1024 * 1024;

export async function prepararFoto(arquivo: File): Promise<string> {
  if (!TIPOS.includes(arquivo.type) || arquivo.size > LIMITE) throw new Error("invalida");
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolver, rejeitar) => {
      const i = new Image();
      i.onload = () => resolver(i);
      i.onerror = rejeitar;
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalida");
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Avatar({ tamanho = 28, className = "" }: { tamanho?: number; className?: string }) {
  const foto = useConfig((s) => s.foto);
  const nome = useConfig((s) => s.nome);
  return (
    <span className={`avatar ${className}`} style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.42) }} aria-hidden="true">
      {foto ? <img src={foto} alt="" draggable={false} /> : (nome || "N").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function EditorFoto({ tamanho = 88, children }: { tamanho?: number; children?: React.ReactNode }) {
  const foto = useConfig((s) => s.foto);
  const definir = useConfig((s) => s.definir);
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);

  const usar = async (arquivo?: File) => {
    if (!arquivo) return;
    try {
      definir({ foto: await prepararFoto(arquivo) });
      setErro("");
    } catch {
      setErro(T.perfil.fotoInvalida);
    }
  };

  return (
    <div className="editor-foto">
      <button
        type="button"
        className="editor-foto-alvo"
        data-arrastando={arrastando ? "sim" : "nao"}
        style={{ width: tamanho, height: tamanho }}
        aria-label={T.perfil.trocarFoto}
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void usar(e.dataTransfer.files[0]);
        }}
      >
        <Avatar tamanho={tamanho} />
        <span className="editor-foto-camera"><Camera size={15} /></span>
      </button>
      <div className="coluna editor-foto-lado" style={{ gap: 6 }}>
        {children}
        <span className="linha" style={{ gap: 6 }}>
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => entrada.current?.click()}>
            <Camera size={13} />
            {foto ? T.perfil.trocarFoto : T.perfil.escolherFoto}
          </button>
          {foto && (
            <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.perfil.removerFoto} title={T.perfil.removerFoto} onClick={() => definir({ foto: null })}>
              <Trash2 size={13} />
            </button>
          )}
        </span>
        <span className={erro ? "campo-erro" : "campo-dica"}>{erro || T.perfil.fotoDica}</span>
      </div>
      <input ref={entrada} type="file" accept={TIPOS.join(",")} hidden onChange={(e) => { void usar(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
