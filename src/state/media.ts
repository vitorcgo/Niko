import { create } from "zustand";

export interface Banner {
  titulo: string;
  artista: string;
  app: string;
  duracao: number;
  capa: string | null;
}

interface ResponseMedia {
  sessao: boolean;
  app?: string;
  titulo?: string;
  artista?: string;
  tocando?: boolean;
  posicao?: number;
  duracao?: number;
  capa?: string | null;
  podeAvancar?: boolean;
  podeVoltar?: boolean;
  podeBuscar?: boolean;
}

interface StateMedia {
  disponivel: boolean;
  faixa: Banner | null;
  tocando: boolean;
  tocouPorUltimoEm: number;
  posicao: number;
  lidoEm: number;
  podeAvancar: boolean;
  podeVoltar: boolean;
  podeBuscar: boolean;
  synchronize: () => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
}

const HEADERS = { "x-niko": "1", "content-type": "application/json" };

function sameBanner(a: Banner | null, b: Banner): boolean {
  return Boolean(a) && a!.titulo === b.titulo && a!.artista === b.artista && a!.app === b.app && a!.duracao === b.duracao && a!.capa === b.capa;
}

function apply(r: ResponseMedia, previous: Banner | null): Partial<StateMedia> {
  if (!r.sessao || !r.titulo) return { disponivel: true, faixa: null, tocando: false, posicao: 0, lidoEm: Date.now(), tocouPorUltimoEm: 0, podeAvancar: false, podeVoltar: false, podeBuscar: false };
  const newItem: Banner = { titulo: r.titulo, artista: r.artista ?? "", app: nameApp(r.app ?? ""), duracao: r.duracao ?? 0, capa: r.capa ?? null };
  return {
    disponivel: true,
    faixa: sameBanner(previous, newItem) ? previous : newItem,
    tocando: Boolean(r.tocando),
    ...(r.tocando ? { tocouPorUltimoEm: Date.now() } : {}),
    posicao: r.posicao ?? 0,
    lidoEm: Date.now(),
    podeAvancar: Boolean(r.podeAvancar),
    podeVoltar: Boolean(r.podeVoltar),
    podeBuscar: Boolean(r.podeBuscar),
  };
}

function nameApp(id: string): string {
  const base = id.split("!").pop()?.replace(/\.exe$/i, "") ?? id;
  if (/spotify/i.test(id)) return "Spotify";
  if (/chrome/i.test(id)) return "Chrome";
  if (/msedge|edge/i.test(id)) return "Edge";
  if (/firefox/i.test(id)) return "Firefox";
  if (/zen/i.test(id)) return "Zen";
  if (/^[0-9A-F]{16}$/i.test(base)) return "";
  return base;
}

async function request(path: string, body?: unknown): Promise<ResponseMedia | null> {
  try {
    const r = await fetch(`/ponte/midia${path}`, { method: body === undefined ? "GET" : "POST", headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!r.ok) return null;
    return (await r.json()) as ResponseMedia;
  } catch {
    return null;
  }
}

export const useMedia = create<StateMedia>()((set, get) => {
  let queryAtProgress = false;
  let actionsAtProgress = 0;
  let review = 0;
  const act = async (action: string, body: unknown = {}) => {
    const current = ++review;
    actionsAtProgress++;
    try {
      const r = await request(`/${action}`, body);
      if (current !== review) return;
      if (r) set(apply(r, get().faixa));
      else set({ disponivel: false, tocando: false });
    } finally { actionsAtProgress--; }
  };
  return {
    disponivel: false,
    faixa: null,
    tocando: false,
    tocouPorUltimoEm: 0,
    posicao: 0,
    lidoEm: 0,
    podeAvancar: false,
    podeVoltar: false,
    podeBuscar: false,
    synchronize: async () => {
      if (queryAtProgress || actionsAtProgress) return;
      queryAtProgress = true;
      const current = review;
      try {
        const r = await request("");
        if (current !== review) return;
        if (r) set(apply(r, get().faixa));
        else set({ disponivel: false, faixa: null, tocando: false });
      } finally { queryAtProgress = false; }
    },
    toggle: () => act("alternar"),
    next: () => act("proxima"),
    previous: () => act("anterior"),
    seek: (seconds) => act("posicao", { segundos: seconds }),
  };
});

export function mediaActiveIsland(s: Pick<StateMedia, "faixa" | "tocando">): boolean {
  return Boolean(s.faixa) && s.tocando;
}

export function positionCurrent(s: Pick<StateMedia, "tocando" | "posicao" | "lidoEm" | "faixa">, now: number): number {
  const duration = s.faixa?.duracao ?? 0;
  const rawValue = s.tocando ? s.posicao + (now - s.lidoEm) / 1000 : s.posicao;
  return duration > 0 ? Math.min(duration, Math.max(0, rawValue)) : Math.max(0, rawValue);
}

const COVERS: [string, string][] = [
  ["#f97316", "#7c2d12"],
  ["#38bdf8", "#1e3a8a"],
  ["#a78bfa", "#3b0764"],
  ["#34d399", "#064e3b"],
  ["#f472b6", "#831843"],
];

export function backgroundCover(banner: Banner | null): string {
  if (banner?.capa) return `center / cover no-repeat url("${banner.capa}")`;
  const [c1, c2] = coverBanner(banner);
  return `linear-gradient(135deg, ${c1}, ${c2})`;
}

export function coverBanner(banner: Banner | null): [string, string] {
  const text = banner ? banner.titulo + banner.artista : "";
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length];
}
