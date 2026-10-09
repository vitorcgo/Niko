import { useEffect, useRef } from "react";
import { renderCharacter } from "./motor/client/src/art/character/render";
import { aparenciaDoEscritorio, type EstiloDoPersonagem } from "./aparenciaDoEscritorio";

export function RetratoPixel({ id, estilo, cor }: { id: string; estilo: EstiloDoPersonagem; cor: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sprite = renderCharacter({ appearance: aparenciaDoEscritorio(id, estilo, cor), pose: "stand", dir: "down", frame: 0 });
    const busto = sprite.buf.crop(2, 2, sprite.buf.w - 4, 20);
    const contexto = ref.current?.getContext("2d");
    contexto?.clearRect(0, 0, 20, 20);
    contexto?.putImageData(new ImageData(busto.data, busto.w, busto.h), 0, 0);
  }, [id, estilo, cor]);
  return <canvas ref={ref} width={20} height={20} className="ei-retrato" aria-hidden="true" />;
}
