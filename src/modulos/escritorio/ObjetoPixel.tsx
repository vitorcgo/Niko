import { useEffect, useMemo, useRef } from "react";
import { bookshelf, plantTall } from "./motor/client/src/art/furniture/office";
import { coffeeMachine, sofa } from "./motor/client/src/art/furniture/common";
import { windowItem } from "./motor/client/src/art/furniture/wall";

export function ObjetoPixel({ tipo }: { tipo: "planta" | "estante" | "sofa" | "cafe" | "janela" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = useMemo(() => {
    if (tipo === "planta") return plantTall("green", 1).base;
    if (tipo === "estante") return bookshelf(2).base;
    if (tipo === "sofa") return sofa("blue").base;
    if (tipo === "cafe") return coffeeMachine(0).base;
    return windowItem().base;
  }, [tipo]);
  useEffect(() => { ref.current?.getContext("2d")?.putImageData(new ImageData(sprite.buf.data, sprite.buf.w, sprite.buf.h), 0, 0); }, [sprite]);
  return <canvas ref={ref} width={sprite.buf.w} height={sprite.buf.h} className={`ei-objeto ei-objeto-${tipo}`} aria-hidden="true" />;
}
