import {
  siStripe, siGithub, siVercel, siResend, siNotion, siCaldotcom, siN8n, siAnthropic, siOllama,
  siNvidia, siOpencode, siQwen, siGooglegemini, siOpenrouter, siMistralai, siHuggingface, siDeepseek, siLmstudio, siGmail, siGooglecalendar, siSupabase, siCloudflare, siClaudecode, siGithubcopilot, siKimi,
  siSpotify, siGooglechrome, siFirefoxbrowser, siZenbrowser, siYoutube, siYoutubemusic, siDeezer, siApplemusic, siTidal, siSoundcloud,
} from "simple-icons";
import type { ServiceId } from "../types";
import logoCodex from "./lobe/codex.svg";
import logoAntigravity from "./lobe/antigravity.svg";
import logoAmp from "./lobe/amp.svg";

interface BrandIcon {
  title: string;
  path: string;
  hex: string;
}

export type BrandId = ServiceId | "anthropic" | "ollama" | "nvidia" | "opencode" | "qwen" | "gemini" | "openrouter" | "mistral" | "huggingface" | "deepseek" | "lmstudio" | "claudecode" | "copilot" | "kimi" | BrandMedia | ColoredBrand;

export type ColoredBrand = "codex" | "antigravity" | "amp";

const BRANDS_COLORED: Record<ColoredBrand, { title: string; url: string }> = {
  codex: { title: "Codex", url: logoCodex },
  antigravity: { title: "Antigravity", url: logoAntigravity },
  amp: { title: "Amp", url: logoAmp },
};

function isColored(brand: BrandId): brand is ColoredBrand {
  return Object.hasOwn(BRANDS_COLORED, brand);
}

export type BrandMedia = "spotify" | "chrome" | "firefox" | "zen" | "youtube" | "youtubemusic" | "deezer" | "applemusic" | "tidal" | "soundcloud";

const DEFAULTS_MEDIA: [RegExp, BrandMedia][] = [
  [/youtube music/i, "youtubemusic"],
  [/youtube/i, "youtube"],
  [/spotify/i, "spotify"],
  [/deezer/i, "deezer"],
  [/apple ?music|itunes/i, "applemusic"],
  [/tidal/i, "tidal"],
  [/soundcloud/i, "soundcloud"],
  [/chrome/i, "chrome"],
  [/firefox/i, "firefox"],
  [/^zen$/i, "zen"],
];

export function brandApp(app: string): BrandMedia | null {
  return DEFAULTS_MEDIA.find(([defaultValue]) => defaultValue.test(app))?.[1] ?? null;
}

export const BRANDS: Record<Exclude<BrandId, ColoredBrand>, BrandIcon> = {
  stripe: siStripe,
  github: siGithub,
  vercel: siVercel,
  resend: siResend,
  notion: siNotion,
  calcom: siCaldotcom,
  n8n: siN8n,
  gmail: siGmail,
  agenda: siGooglecalendar,
  supabase: siSupabase,
  cloudflare: siCloudflare,
  anthropic: siAnthropic,
  ollama: siOllama,
  nvidia: siNvidia,
  opencode: siOpencode,
  qwen: siQwen,
  gemini: siGooglegemini,
  openrouter: siOpenrouter,
  mistral: siMistralai,
  huggingface: siHuggingface,
  deepseek: siDeepseek,
  lmstudio: siLmstudio,
  claudecode: siClaudecode,
  copilot: siGithubcopilot,
  kimi: siKimi,
  spotify: siSpotify,
  chrome: siGooglechrome,
  firefox: siFirefoxbrowser,
  zen: siZenbrowser,
  youtube: siYoutube,
  youtubemusic: siYoutubemusic,
  deezer: siDeezer,
  applemusic: siApplemusic,
  tidal: siTidal,
  soundcloud: siSoundcloud,
};

function dark(hex: string): boolean {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.22;
}

interface Props {
  marca: BrandId;
  tamanho?: number;
  monocromatica?: boolean;
}

export function Brand({ marca: brand, tamanho: size = 18, monocromatica: monochrome = false }: Props) {
  if (isColored(brand)) {
    const colored = BRANDS_COLORED[brand];
    return <img src={colored.url} alt={colored.title} width={size} height={size} draggable={false} style={{ flex: "0 0 auto", filter: monochrome ? "grayscale(1) brightness(1.4)" : undefined }} />;
  }
  const icon = BRANDS[brand];
  const color = monochrome || dark(icon.hex) ? "currentColor" : `#${icon.hex}`;
  return (
    <svg role="img" aria-label={icon.title} viewBox="0 0 24 24" width={size} height={size} fill={color} style={{ flex: "0 0 auto" }}>
      <path d={icon.path} />
    </svg>
  );
}
