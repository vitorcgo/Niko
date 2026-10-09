import { useId } from "react";

export function LogoNiko({ tamanho: size = 28, brilho: brightness }: { tamanho?: number; brilho?: boolean }) {
  const id = useId().replace(/:/g, "");
  const hasBrightness = brightness ?? size >= 48;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: "0 0 auto", overflow: "visible" }}>
      <defs>
        <linearGradient id={`f-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d1416" />
          <stop offset="0.45" stopColor="#0a0a0b" />
          <stop offset="1" stopColor="#141417" />
        </linearGradient>
        <radialGradient id={`r-${id}`} cx="0.08" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ff2a3a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff2a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3344" />
          <stop offset="0.6" stopColor="#ff2a3a" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ff8a95" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`p-${id}`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#ff5a64" />
          <stop offset="1" stopColor="#e5121f" />
        </radialGradient>
        {hasBrightness && (
          <filter id={`g-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        )}
      </defs>
      {hasBrightness && <rect x="4" y="4" width="92" height="92" rx="25" fill="none" stroke="#ff2a3a" strokeWidth="3" filter={`url(#g-${id})`} opacity="0.85" />}
      <rect x="4" y="4" width="92" height="92" rx="25" fill={`url(#f-${id})`} />
      <rect x="4" y="4" width="92" height="92" rx="25" fill={`url(#r-${id})`} />
      <rect x="4.75" y="4.75" width="90.5" height="90.5" rx="24.25" fill="none" stroke={`url(#b-${id})`} strokeWidth="1.5" />
      <path d="M34.5 64 V37.5 L65 64 V52" fill="none" stroke="#f4f4f5" strokeWidth="10.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="66" cy="38" r="6" fill={`url(#p-${id})`} />
    </svg>
  );
}
