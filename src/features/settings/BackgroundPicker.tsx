import { BACKGROUND_DEFAULT_BORDERS, useConfig } from "../../state/settings";
import { ACCENT_DEFAULT } from "../../windows/desktop/useTheme";
import { BACKGROUND_ACCENT, hexValid, mix } from "../../utils/colors";
import { T } from "../../i18n/ptBR";

export const BACKGROUNDS_READY = [
  { valor: BACKGROUND_DEFAULT_BORDERS, rotulo: T.configuracoes.fundosProntos.grafite },
  { valor: "#000000", rotulo: T.configuracoes.fundosProntos.preto },
  { valor: "#1d2738", rotulo: T.configuracoes.fundosProntos.noite },
  { valor: "#f4f5f7", rotulo: T.configuracoes.fundosProntos.branco },
];

interface PropsSelectorBackground {
  id: string;
  fundo: string;
  opacidade: number;
  aoMudar: (change: { fundo?: string; opacidade?: number }) => void;
}

export function BackgroundPicker({ id, fundo: background, opacidade: opacity, aoMudar: onChange }: PropsSelectorBackground) {
  const accent = useConfig((s) => s.destaque);
  const colorAccent = accent && hexValid(accent) ? accent : ACCENT_DEFAULT.escuro;
  const sample = (value: string) => (value === BACKGROUND_ACCENT ? mix(colorAccent, "#000000", 0.82) : value);
  const ready = BACKGROUNDS_READY.some((f) => f.valor === background);
  const percentage = Math.round(opacity * 100);

  return (
    <>
      <div className="campo-grupo">
        <span className="campo-rotulo">{T.configuracoes.corDeFundo}</span>
        <div className="pilulas">
          {BACKGROUNDS_READY.map((f) => (
            <button key={f.valor} type="button" className="pilula" aria-pressed={background === f.valor} onClick={() => onChange({ fundo: f.valor })}>
              <span className="ponto-cor" style={{ background: sample(f.valor), border: "1px solid var(--borda-forte)" }} />
              {f.rotulo}
            </button>
          ))}
          <label className="pilula" aria-pressed={!ready} htmlFor={`${id}-cor`}>
            <input
              id={`${id}-cor`}
              type="color"
              className="seletor-cor"
              style={{ width: 18, height: 18 }}
              value={hexValid(background) ? background : sample(background)}
              aria-label={T.configuracoes.outraCor}
              onChange={(e) => onChange({ fundo: e.target.value })}
            />
            {T.configuracoes.outraCor}
          </label>
        </div>
        <span className="campo-dica">{T.configuracoes.textoAutomatico}</span>
      </div>
      <div className="campo-grupo">
        <label className="campo-rotulo" htmlFor={`${id}-opacidade`}>{T.configuracoes.opacidade}</label>
        <div className="linha">
          <input
            id={`${id}-opacidade`}
            type="range"
            min={30}
            max={100}
            step={5}
            value={percentage}
            style={{ flex: 1 }}
            onChange={(e) => onChange({ opacidade: Number(e.target.value) / 100 })}
          />
          <span className="numero" style={{ width: 44, textAlign: "right" }}>{T.configuracoes.opacidadeValor(percentage)}</span>
        </div>
      </div>
    </>
  );
}
