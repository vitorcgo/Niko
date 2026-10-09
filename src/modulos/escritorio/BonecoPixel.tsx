import { useEffect, useRef } from "react";
import { POSE_DURATION, POSE_FRAMES, renderCharacter } from "./motor/client/src/art/character/render";
import { hash32 } from "./motor/shared/hash";
import type { Pose } from "./motor/client/src/art/api";
import { desk, officeChair } from "./motor/client/src/art/furniture/office";
import type { BufSprite } from "./motor/client/src/art/core/sprite";
import { aparenciaDoEscritorio, type EstiloDoPersonagem } from "./aparenciaDoEscritorio";

export function BonecoPixel({ id, pose, estilo = "niko", cor, semMesa = false }: { id: string; pose: Pose; estilo?: EstiloDoPersonagem; cor?: string; semMesa?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const contexto = canvas.current?.getContext("2d");
    if (!contexto) return;
    const mesa = desk("dark", hash32(id) % 6);
    const cadeira = officeChair("blue");
    const aparencia = aparenciaDoEscritorio(id, estilo, cor);
    const quadros = Array.from({ length: POSE_FRAMES[pose] }, (_, frame) => {
      return renderCharacter({ appearance: aparencia, dir: pose === "type" ? "up" : "down", pose, frame });
    });
    let quadro = 0;
    let intervalo: number | undefined;
    const movimento = window.matchMedia("(prefers-reduced-motion: reduce)");
    const colocar = (sprite: BufSprite, x: number, y: number) => {
      const camada = document.createElement("canvas");
      camada.width = sprite.buf.w;
      camada.height = sprite.buf.h;
      camada.getContext("2d")?.putImageData(new ImageData(sprite.buf.data, sprite.buf.w, sprite.buf.h), 0, 0);
      return { camada, x: Math.round(x - sprite.ax), y: Math.round(y - sprite.ay) };
    };
    const mesaPronta = colocar(mesa.base, 40, 32);
    const cadeiraPronta = colocar(cadeira.base, 40, 49);
    const quadrosProntos = quadros.map((sprite) => colocar(sprite, 40, semMesa ? 46 : 54));
    const desenhar = () => {
      contexto.clearRect(0, 0, 80, 64);
      const camadas = semMesa ? [] : [mesaPronta, cadeiraPronta];
      for (const { camada, x, y } of [...camadas, quadrosProntos[quadro++ % quadrosProntos.length]]) contexto.drawImage(camada, x, y);
    };
    let visivel = true;
    const sincronizar = () => {
      window.clearInterval(intervalo);
      intervalo = undefined;
      if (document.hidden || !visivel) return;
      desenhar();
      if (!movimento.matches && quadros.length > 1) intervalo = window.setInterval(desenhar, POSE_DURATION[pose]);
    };
    sincronizar();
    document.addEventListener("visibilitychange", sincronizar);
    movimento.addEventListener("change", sincronizar);
    const observador = new IntersectionObserver(([entrada]) => {
      visivel = entrada.isIntersecting;
      sincronizar();
    });
    if (canvas.current) observador.observe(canvas.current);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", sincronizar);
      movimento.removeEventListener("change", sincronizar);
      observador.disconnect();
    };
  }, [id, pose, estilo, cor, semMesa]);
  return <canvas ref={canvas} width={80} height={64} className="escritorio-pixel-boneco" aria-hidden="true" />;
}
