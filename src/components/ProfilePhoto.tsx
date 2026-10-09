import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useConfig } from "../state/settings";
import { T } from "../i18n/ptBR";

const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const LIMIT = 8 * 1024 * 1024;

export async function preparePhoto(file: File): Promise<string> {
  if (!TYPES.includes(file.type) || file.size > LIMIT) throw new Error("invalida");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalida");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Avatar({ tamanho: size = 28, className = "" }: { tamanho?: number; className?: string }) {
  const photo = useConfig((s) => s.foto);
  const nameValue = useConfig((s) => s.nome);
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {photo ? <img src={photo} alt="" draggable={false} /> : (nameValue || "N").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function EditorPhoto({ tamanho: size = 88 }: { tamanho?: number }) {
  const photo = useConfig((s) => s.foto);
  const set = useConfig((s) => s.set);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const use = async (file?: File) => {
    if (!file) return;
    try {
      set({ foto: await preparePhoto(file) });
      setError("");
    } catch {
      setError(T.perfil.fotoInvalida);
    }
  };

  return (
    <div className="editor-foto">
      <button
        type="button"
        className="editor-foto-alvo"
        data-arrastando={dragging ? "sim" : "nao"}
        style={{ width: size, height: size }}
        aria-label={T.perfil.trocarFoto}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void use(e.dataTransfer.files[0]);
        }}
      >
        <Avatar tamanho={size} />
        <span className="editor-foto-camera"><Camera size={15} /></span>
      </button>
      <div className="coluna" style={{ gap: 6 }}>
        <span className="linha" style={{ gap: 6 }}>
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => input.current?.click()}>
            <Camera size={13} />
            {photo ? T.perfil.trocarFoto : T.perfil.escolherFoto}
          </button>
          {photo && (
            <button type="button" className="botao botao-fantasma botao-pequeno botao-icone" aria-label={T.perfil.removerFoto} title={T.perfil.removerFoto} onClick={() => set({ foto: null })}>
              <Trash2 size={13} />
            </button>
          )}
        </span>
        <span className={error ? "campo-erro" : "campo-dica"}>{error || T.perfil.fotoDica}</span>
      </div>
      <input ref={input} type="file" accept={TYPES.join(",")} hidden onChange={(e) => { void use(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
