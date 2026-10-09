import { useLayoutEffect, type RefObject } from "react";

const LINE = 2;
const SPACE = 14;

function fill(card: HTMLElement) {
  const sections = Array.from(card.querySelectorAll<HTMLElement>(".secao-extra"));
  const extras = Array.from(card.querySelectorAll<HTMLElement>(".item-extra"));
  for (const el of [...sections, ...extras]) el.style.display = "";
  for (let i = extras.length - 1; i >= 0 && card.scrollHeight > card.clientHeight + 1; i--) extras[i].style.display = "none";
  for (const s of sections) {
    const items = Array.from(s.querySelectorAll<HTMLElement>(".item-extra"));
    if (items.length === 0 || items.every((x) => x.style.display === "none")) s.style.display = "none";
  }
}

function organize(grid: HTMLElement) {
  const items = Array.from(grid.children) as HTMLElement[];
  grid.dataset.medindo = "sim";
  for (const el of items) {
    el.style.height = "";
    for (const x of el.querySelectorAll<HTMLElement>(".item-extra, .secao-extra")) x.style.display = "";
  }
  const heights = items.map((el) => el.getBoundingClientRect().height);
  items.forEach((el, i) => {
    el.style.gridRowEnd = `span ${Math.max(1, Math.ceil((heights[i] + SPACE) / LINE))}`;
  });

  const width = grid.clientWidth;
  const boxes = items.map((el, i) => ({
    el,
    topo: el.offsetTop,
    base: el.offsetTop + heights[i],
    esquerda: el.offsetLeft,
    direita: el.offsetLeft + el.offsetWidth,
    inteiro: el.offsetWidth >= width - 1,
    alvo: heights[i],
  }));

  const sorted = [...boxes].sort((a, b) => a.topo - b.topo);
  const banners: (typeof boxes)[] = [];
  let current: typeof boxes = [];
  for (const c of sorted) {
    if (c.inteiro) {
      if (current.length) banners.push(current);
      current = [];
      continue;
    }
    current.push(c);
  }
  if (current.length) banners.push(current);

  for (const banner of banners) {
    if (banner.length < 2) continue;
    const background = Math.max(...banner.map((c) => c.base));
    for (const c of banner) {
      const hasBelow = banner.some((o) => o !== c && o.topo >= c.base && o.esquerda < c.direita - 1 && c.esquerda < o.direita - 1);
      if (hasBelow || background - c.base < 1) continue;
      c.alvo = background - c.topo;
      c.el.style.gridRowEnd = `span ${Math.ceil((c.alvo + SPACE) / LINE)}`;
    }
  }

  delete grid.dataset.medindo;
  for (const c of boxes) {
    c.el.style.height = `${c.alvo}px`;
    fill(c.el);
  }
}

export function useMasonry(ref: RefObject<HTMLElement | null>, key: string) {
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    let board = 0;
    let width = grid.clientWidth;
    const schedule = () => {
      if (board) return;
      board = requestAnimationFrame(() => {
        board = 0;
        organize(grid);
      });
    };
    organize(grid);
    const size = new ResizeObserver(() => {
      if (grid.clientWidth === width) return;
      width = grid.clientWidth;
      schedule();
    });
    size.observe(grid);
    const changes = new MutationObserver(schedule);
    changes.observe(grid, { childList: true, subtree: true, characterData: true });
    const onLoadSource = () => schedule();
    document.fonts?.addEventListener?.("loadingdone", onLoadSource);
    return () => {
      size.disconnect();
      changes.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", onLoadSource);
      cancelAnimationFrame(board);
    };
  }, [ref, key]);
}
