import { useState } from "react";

interface Bar {
  rotulo: string;
  valor: number;
  cor?: string;
  detalhe?: string;
}

export function BarsHorizontal({ barras: bars, formatar: formatValue }: { barras: Bar[]; formatar: (v: number) => string }) {
  const maximum = Math.max(1, ...bars.map((b) => b.valor));
  return (
    <div className="barras-h">
      {bars.map((b) => (
        <div key={b.rotulo} className="barras-h-linha">
          <span className="barras-h-rotulo cortar">{b.rotulo}</span>
          <div className="barras-h-trilho">
            <span style={{ width: `${(b.valor / maximum) * 100}%`, background: b.cor ?? "var(--destaque)" }} />
          </div>
          <span className="barras-h-valor numero privado">{formatValue(b.valor)}</span>
        </div>
      ))}
    </div>
  );
}

export function BarsVertical({ barras: bars, formatar: formatValue, altura: height = 140, aoEscolher: onSelect, selecionada: selected }: { barras: Bar[]; formatar: (v: number) => string; altura?: number | string; aoEscolher?: (i: number) => void; selecionada?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const maximum = Math.max(1, ...bars.map((b) => b.valor));
  return (
    <div className="barras-v" style={{ height: height }}>
      {bars.map((b, i) => (
        <div
          key={`${b.rotulo}-${i}`}
          className="barras-v-coluna"
          data-selecionada={selected === i ? "sim" : "nao"}
          data-clicavel={onSelect ? "sim" : "nao"}
          role={onSelect ? "button" : undefined}
          onClick={() => onSelect?.(i)}
          onKeyDown={(e) => onSelect && (e.key === "Enter" || e.key === " ") && onSelect(i)}
          onPointerEnter={() => setActive(i)}
          onPointerLeave={() => setActive(null)}
          tabIndex={0}
          onFocus={() => setActive(i)}
          onBlur={() => setActive(null)}
          aria-label={`${b.rotulo}: ${formatValue(b.valor)}`}
        >
          {active === i && <span className="barras-v-dica numero">{b.detalhe ?? formatValue(b.valor)}</span>}
          <div className="barras-v-trilho">
            <span style={{ height: `${Math.max(b.valor > 0 ? 3 : 0, (b.valor / maximum) * 100)}%`, background: b.cor ?? "var(--destaque)" }} />
          </div>
          <span className="barras-v-rotulo">{b.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export function Ring({ progresso: progress, tamanho: size = 40, espessura: thickness = 4, cor: color = "currentColor", fundo: background = "rgba(127,127,127,0.25)" }: { progresso: number; tamanho?: number; espessura?: number; cor?: string; fundo?: string }) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: "rotate(-90deg)", flex: "0 0 auto" }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={background} strokeWidth={thickness} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - p)}
        style={{ transition: "stroke-dashoffset 0.5s linear" }}
      />
    </svg>
  );
}
