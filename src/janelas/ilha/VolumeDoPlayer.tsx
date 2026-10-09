import type { CSSProperties } from "react";
import { useControleRapido } from "../../estado/controleRapido";
import { T } from "../../textos/textos";
import { IconeDeVolume } from "./barra/IconesDeStatus";

export function VolumeDoPlayer() {
  // A barra da ilha já sincroniza o áudio. Reutilizar o estado evita outro polling.
  const saida = useControleRapido((s) => s.audio?.saida);
  const indisponivel = useControleRapido((s) => s.audioIndisponivel);
  const definirVolume = useControleRapido((s) => s.definirVolume);
  const alternarMudo = useControleRapido((s) => s.alternarMudo);
  const desativado = !saida || indisponivel;
  const volume = saida?.mudo ? 0 : (saida?.volume ?? 0);
  const dica = desativado ? T.ilha.barra.semDispositivo : T.ilha.volumeSistema;

  return (
    <div className="ilha-player-volume" title={dica}>
      <button type="button" className="ilha-player-mudo" disabled={desativado}
        aria-label={saida?.mudo ? T.ilha.ativarSomWindows : T.ilha.silenciarSom}
        aria-pressed={saida?.mudo ?? false} onClick={() => alternarMudo("saida")}>
        <IconeDeVolume volume={volume} mudo={saida?.mudo ?? false} tamanho={15} />
      </button>
      <input type="range" min={0} max={100} step={1} value={volume}
        disabled={desativado} aria-label={T.ilha.volumeSistema}
        aria-valuetext={T.ilha.barra.volume(volume)}
        style={{ "--preenchido": `${volume}%` } as CSSProperties}
        onChange={(e) => definirVolume("saida", Number(e.target.value))} />
      <span className="ilha-mini numero">{desativado ? "" : `${volume}%`}</span>
    </div>
  );
}
