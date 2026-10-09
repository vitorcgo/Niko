// Assets opcionais gerados por IA (quadros, pôsteres e a placa da recepção).
// GET /assets/manifest.json -> { wallArt: [{ id, kind, file, w, h, tiles, variant?, framed? }], brand: { signage?, mark? } }.
// Se o manifesto não existir (ou falhar), o mundo segue só com a arte procedural.

export interface WallArtAsset {
  id: string;
  kind: 'painting' | 'poster';
  img: HTMLImageElement;
  w: number;
  h: number;
  /** Largura em tiles do lugar na parede (quadros: 2 ou 4; pôsteres: 1). */
  tiles: number;
  /** Pôster: variante procedural equivalente ('code', 'coffee'...). */
  variant?: string;
  /** Versão com moldura pronta (desenhada no lugar do quadro procedural, em tamanho nativo). */
  framed?: BrandAsset;
}

export interface BrandAsset {
  img: HTMLImageElement;
  w: number;
  h: number;
}

export interface WorldAssets {
  wallArt: WallArtAsset[];
  signage?: BrandAsset;
  mark?: BrandAsset;
}

interface ManifestFile {
  file: string;
  w: number;
  h: number;
}

interface Manifest {
  wallArt?: (ManifestFile & { id: string; kind: string; tiles?: number; variant?: string; framed?: ManifestFile })[];
  brand?: { signage?: ManifestFile; mark?: ManifestFile };
}

function loadImage(file: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = `/assets/${file.replace(/^\/+/, '')}`;
  });
}

function validFile(f: unknown): f is ManifestFile {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  return typeof o.file === 'string' && o.file.length > 0 && !o.file.includes('..');
}

export async function loadWorldAssets(signal?: AbortSignal): Promise<WorldAssets | null> {
  try {
    const res = await fetch('/assets/manifest.json', { signal, cache: 'no-cache' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const m = (await res.json()) as Manifest;
    const wallArt: WallArtAsset[] = [];
    const list = Array.isArray(m.wallArt) ? m.wallArt : [];
    const imgs = await Promise.all(list.map((a) => (validFile(a) ? loadImage(a.file) : Promise.resolve(null))));
    const framed = await Promise.all(list.map((a) => (validFile(a.framed) ? loadImage(a.framed.file) : Promise.resolve(null))));
    list.forEach((a, i) => {
      const img = imgs[i];
      if (!img || (a.kind !== 'painting' && a.kind !== 'poster')) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // sem "tiles" no manifesto: deduz pela largura (pinturas largas não cabem num quadro de 2 tiles)
      const tiles = typeof a.tiles === 'number' && a.tiles > 0 ? a.tiles : a.kind === 'poster' ? 1 : w > 40 ? 4 : 2;
      const f = framed[i];
      wallArt.push({
        id: String(a.id),
        kind: a.kind,
        img,
        w,
        h,
        tiles,
        variant: typeof a.variant === 'string' ? a.variant : undefined,
        framed: f ? { img: f, w: f.naturalWidth, h: f.naturalHeight } : undefined,
      });
    });
    const brand = async (f: ManifestFile | undefined): Promise<BrandAsset | undefined> => {
      if (!validFile(f)) return undefined;
      const img = await loadImage(f.file);
      return img ? { img, w: img.naturalWidth, h: img.naturalHeight } : undefined;
    };
    const [signage, mark] = await Promise.all([brand(m.brand?.signage), brand(m.brand?.mark)]);
    if (!wallArt.length && !signage && !mark) return null;
    return { wallArt, signage, mark };
  } catch {
    return null;
  }
}
