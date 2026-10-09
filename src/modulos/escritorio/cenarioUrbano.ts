import { PixelBuf } from "./motor/client/src/art/core/pixbuf";
import { BUILDING_H, COL_W, CORRIDOR_Y, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, TILE } from "./motor/client/src/world/constants";
import { slotShell as patioOriginal, type ExteriorLayout, type SlotShell } from "./motor/client/src/world/layout/exterior";

/** Entorno decorativo. A circulação das sessões continua na grade interna do prédio. */
export function exteriorUrbano(cols: number): ExteriorLayout {
  const largura = cols * COL_W;
  const bounds = { x: -EXT_WEST, y: -EXT_NORTH, w: largura + EXT_WEST + EXT_EAST, h: BUILDING_H + EXT_NORTH + EXT_SOUTH };
  const streetY = (BUILDING_H + 4) * TILE;
  const streetH = 5 * TILE;
  const floors: ExteriorLayout["floors"] = [
    { kind: "sidewalk", x: bounds.x * TILE, y: bounds.y * TILE, w: bounds.w * TILE, h: bounds.h * TILE, seed: 11 },
    { kind: "street", x: bounds.x * TILE, y: streetY, w: bounds.w * TILE, h: streetH, seed: 13 },
    { kind: "street", x: -12 * TILE, y: bounds.y * TILE, w: 5 * TILE, h: bounds.h * TILE, seed: 17 },
    { kind: "street", x: (largura + 7) * TILE, y: bounds.y * TILE, w: 5 * TILE, h: bounds.h * TILE, seed: 18 },
  ];
  const props: ExteriorLayout["props"] = [];
  const quantidade = Math.min(4, Math.max(2, Math.ceil(cols / 2)));
  for (let i = 0; i < quantidade; i++) props.push({ kind: "loja", x: ((i + .5) * largura / quantidade) * TILE, y: -2 * TILE, seed: i });
  props.push({ kind: "loja", x: (largura - 5) * TILE, y: (BUILDING_H + 18) * TILE, seed: 4 });
  for (let x = -4; x < largura + 5; x += 10) {
    props.push({ kind: "lamp", x: x * TILE, y: (BUILDING_H + 3) * TILE + 6, seed: x });
    props.push({ kind: "lamp", x: x * TILE, y: -TILE, seed: x + 1 });
  }
  for (const x of [-4, largura + 4]) for (let y = 2; y < BUILDING_H; y += 8) {
    props.push({ kind: "bench", x: x * TILE, y: y * TILE, seed: y });
    props.push({ kind: "flowers", x: x * TILE, y: (y + 3) * TILE, seed: y });
  }
  props.push({ kind: "totem", x: -3 * TILE + 6, y: (CORRIDOR_Y + 1) * TILE, seed: 2 });
  return { bounds, floors, props, streetY, streetH, lanes: [{ y: streetY + Math.round(streetH * .36), dir: 1 }, { y: streetY + Math.round(streetH * .86), dir: -1 }] };
}

export function patioUrbano(slot: number, ultimaColuna: boolean): SlotShell {
  const patio = patioOriginal(slot, ultimaColuna);
  return { ...patio, props: patio.props.filter((p) => p.kind !== "tree" && p.kind !== "pine" && p.kind !== "rock") };
}

/** Fachadas originais do Niko, desenhadas pixel a pixel, com cinco lojas distintas. */
export function pixelsDaLoja(variante: number) {
  const indice = ((Math.floor(variante) % 5) + 5) % 5;
  const paredes = ["#d8c3a0", "#c3cad4", "#c4b8a7", "#b5c4c2", "#cfb5af"];
  const acentos = ["#638e81", "#537ca3", "#a96753", "#6c6894", "#b79559"];
  const b = new PixelBuf(112, 100);
  const r = (x: number, y: number, w: number, h: number, cor: string) => b.rect(x, y, w, h, cor);
  b.shadow(57, 95, 52, 3, "#2d3443", .3);
  r(6, 6, 98, 88, "#384353"); r(7, 7, 96, 84, paredes[indice]);
  // Cobertura em degraus, platibanda e calha.
  r(3, 5, 104, 5, "#394655"); r(4, 5, 102, 1, "#a8b1b6");
  r(8, 11, 94, 1, "#f0e8d8"); r(98, 10, 4, 80, "#00000019");
  // Pavimento superior com janelas e molduras de pedra.
  for (const x of [15, 45, 75]) {
    r(x - 2, 17, 23, 26, "#eee4d4"); r(x, 19, 19, 21, "#384f66");
    r(x + 1, 20, 8, 9, "#82b4c4"); r(x + 10, 20, 8, 9, "#719aa9");
    r(x + 1, 31, 8, 8, "#d7caa0"); r(x + 10, 31, 8, 8, "#bba975");
    r(x - 3, 41, 25, 2, "#899097");
  }
  // Letreiro, vitrine e porta com reflexos discretos.
  r(10, 47, 88, 12, "#34404d"); r(11, 48, 86, 9, acentos[indice]);
  r(12, 63, 56, 25, "#334759"); r(14, 65, 52, 20, "#608494");
  r(15, 66, 12, 1, "#b0d4db"); r(15, 67, 1, 12, "#b0d4db");
  r(39, 64, 2, 22, "#d9d4c8");
  r(73, 62, 22, 29, "#34404d"); r(75, 64, 18, 23, "#63818c");
  r(76, 65, 16, 1, "#adcbd1"); r(88, 75, 2, 2, "#f2d69a");
  r(6, 91, 98, 3, "#91979c"); r(72, 92, 25, 3, "#c3c6c2");
  // Toldo listrado, com borda sombreada.
  r(8, 59, 92, 5, "#303a48");
  for (let i = 0; i < 10; i++) r(9 + i * 9, 59, 9, 3, i % 2 ? "#eee4ce" : acentos[indice]);
  // Produtos diferentes em cada vitrine: livros, café, plantas, equipamentos e pães.
  for (let i = 0; i < 6; i++) {
    const x = 17 + i * 8;
    if (indice === 1) { r(x, 77, 6, 5, "#ded9c6"); r(x + 1, 75, 4, 1, "#d7ab73"); }
    else if (indice === 2) { r(x, 76 - i % 3, 5, 9 + i % 3, ["#ca835c", "#cfbd75", "#708f9c"][i % 3]); r(x + 1, 77 - i % 3, 1, 6, "#f3e4c3"); }
    else if (indice === 3) { r(x, 75, 6, 6, "#304456"); r(x + 1, 76, 4, 3, "#9bc6bf"); r(x + 2, 82, 2, 2, "#455569"); }
    else if (indice === 4) { b.ellipse(x + 3, 81, 3, 2, "#d6a464"); r(x + 2, 79, 1, 2, "#f2d395"); }
    else { r(x + 1, 81, 4, 4, "#b78359"); b.ellipse(x + 3, 78, 3, 3, "#597f67"); }
  }
  return b;
}
