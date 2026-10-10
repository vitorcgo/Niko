import type { AgenteId } from "../tipos";
import { acessoriosValidos, corAcessorioValida, ENCAIXES_ACESSORIOS, POSICOES_ACESSORIOS, type AcessorioId, type AcessoriosAgente } from "./acessorios";

const CONTORNO = 'stroke="#252735" stroke-width=".022" stroke-linecap="round" stroke-linejoin="round"';
const DESENHOS: Record<AcessorioId, string> = {
  lacinho: '<path d="M-.055 0C-.22-.27-.48-.23-.46-.06L-.40 .16C-.29 .25-.17 .14-.055 .05M.055 0C.22-.27.48-.23.46-.06L.40 .16C.29 .25.17 .14.055 .05" fill="#e85d8c"/><path d="M-.37-.08L-.1 .02M.37-.08L.1 .02" fill="none" stroke="#f9b6d0" stroke-width=".03"/><rect x="-.07" y="-.075" width=".14" height=".17" rx=".05" fill="#b72d63"/>',
  fone: '<path d="M-.70 .05V-.15C-.7-1.01.7-1.01.7-.15V.05" fill="none" stroke="#eee7dc" stroke-width=".145"/><path d="M-.70 .05V-.15C-.7-1.01.7-1.01.7-.15V.05" fill="none" stroke="#33394c" stroke-width=".10"/><rect x="-.84" y="-.17" width=".24" height=".40" rx=".09" fill="#464e68"/><rect x=".60" y="-.17" width=".24" height=".40" rx=".09" fill="#464e68"/><path d="M-.78-.07V.12M.77-.07V.12" stroke="#92c8df" stroke-width=".048"/><path d="M.65 .19Q.60 .43.35 .41" fill="none" stroke="#eee7dc" stroke-width=".037"/><rect x=".27" y=".37" width=".12" height=".07" rx=".035" fill="#252735"/>',
  boina: '<path d="M-.47 .02C-.59-.23-.20-.38.18-.30C.41-.25.50-.15.44-.015Z" fill="#675889"/><path d="M-.45 .015Q0 .12.44-.015L.42 .06Q0 .18-.43 .09Z" fill="#3d3454"/><path d="M-.31-.19Q-.03-.33.22-.20" fill="none" stroke="#a99ac7" stroke-width=".03"/><path d="M.03-.29L.08-.36" stroke="#3d3454" stroke-width=".04"/>',
  pintor: '<path d="M-.47 .02C-.59-.23-.20-.38.18-.30C.41-.25.50-.15.44-.015Z" fill="#b78258"/><path d="M-.45 .02Q0 .12.44-.01L.42 .06Q0 .18-.43 .09Z" fill="#79523c"/><path d="M.05-.3L.09-.36" stroke="#79523c" stroke-width=".04"/><circle cx="-.25" cy="-.15" r=".04" fill="#61bbac"/><circle cx=".23" cy="-.09" r=".033" fill="#f6ce70"/><g transform="translate(-.53 1.01) rotate(-24)"><rect x="-.035" y="-.10" width=".07" height=".55" rx=".035" fill="#e5b078"/><rect x="-.049" y="-.23" width=".098" height=".16" rx=".02" fill="#cad4da"/><path d="M-.049-.23Q-.07-.44.055-.48Q.025-.36.049-.23Z" fill="#559da0"/><path d="M-.02-.26L.019-.37" stroke="#90d0bc" stroke-width=".022"/></g>',
  bone: '<path d="M-.4 .035C-.41-.39.39-.39.4 .035Z" fill="#6196c3"/><path d="M-.4 .035Q-.08-.04.46 .02L.70 .12Q.27 .24-.36 .13Z" fill="#345e85"/><path d="M.02-.28Q.12-.12.08 .02" fill="none" stroke="#aad3e7" stroke-width=".025"/><circle cx=".01" cy="-.29" r=".035" fill="#345e85"/>',
  coroa: '<path d="M-.42 .08L-.46-.30L-.22-.12L0-.44L.22-.12L.46-.30L.42 .08Z" fill="#efbc4c"/><path d="M-.42-.015H.42V.11H-.42Z" fill="#d89036"/><path d="M-.35-.20L-.29-.10M-.035-.28V-.12" stroke="#fff0a9" stroke-width=".035"/><path d="M0-.17L.07-.09L0-.01L-.07-.09Z" fill="#e66576"/><circle cx="-.30" cy=".05" r=".027" fill="#73c8b5"/><circle cx=".30" cy=".05" r=".027" fill="#73c8b5"/>',
  oculos: '<g fill="none" stroke="#f4e9d7" stroke-width="10"><rect x="-66" y="-37" width="62" height="74" rx="23"/><rect x="4" y="-37" width="62" height="74" rx="23"/><path d="M-4-7Q0-13 4-7M-66-12L-76-18M66-12L76-18"/></g><g fill="none" stroke="#303747" stroke-width="5.5"><rect x="-66" y="-37" width="62" height="74" rx="23"/><rect x="4" y="-37" width="62" height="74" rx="23"/><path d="M-4-7Q0-13 4-7M-66-12L-76-18M66-12L76-18"/></g><path d="M-55-22L-48-28M18-22L25-28" stroke="#d1e7ee" stroke-width="4"/>',
  "oculos-sol": '<g stroke="#f4e9d7" stroke-width="5" fill="#252d40"><rect x="-66" y="-30" width="62" height="62" rx="16"/><rect x="4" y="-30" width="62" height="62" rx="16"/><path d="M -4 -18 L 4 -18" fill="none"/></g><path d="M -56 -20 L -25 -20 L -49 14 Z M 14 -20 L 45 -20 L 21 14 Z" fill="#637c99"/><path d="M -66 -25 L -76 -30 M 66 -25 L 76 -30" stroke="#252d40" stroke-width="6"/>',
  colar: '<path d="M-.44 .52Q0 .95.44 .52" fill="none" stroke="#f9edc2" stroke-width=".047"/><path d="M-.44 .52Q0 .95.44 .52" fill="none" stroke="#c49349" stroke-width=".022"/><circle cx="0" cy=".80" r=".105" fill="#e4b64f"/><path d="M0 .735L.035 .79L0 .85L-.035 .79Z" fill="#3d8e97"/><circle cx="-.04" cy=".77" r=".015" fill="#fff2b6"/>',
  gravata: '<path d="M-.04 .55L-.25 .45Q-.31 .55-.24 .69L-.04 .62M.04 .55L.25 .45Q.31 .55.24 .69L.04 .62" fill="#537f7f"/><rect x="-.055" y=".525" width=".11" height=".11" rx=".035" fill="#315353"/><path d="M-.19 .52L-.08 .57M.19 .52L.08 .57" stroke="#99c4b4" stroke-width=".025"/>',
  capa: '<path d="M-.45-.31Q-.70-.2-.88 .85Q0 1.10.88 .85Q.70-.2.45-.31Z" fill="#6371b8"/><path d="M-.4-.2L-.68 .85M.4-.2L.68 .85" fill="none" stroke="#a8b4e0" stroke-width=".034"/><path d="M-.88 .85Q0 1.10.88 .85" fill="none" stroke="#404975" stroke-width=".055"/>',
  bruxa: '<path d="M-.34-.02L-.12-.54Q.02-.72.25-.51Q.06-.54.13-.31L.36-.02Z" fill="#534268"/><path d="M-.29-.12L.30-.12L.36 .015H-.35Z" fill="#ca9159"/><rect x="-.06" y="-.125" width=".14" height=".12" rx=".02" fill="#ebc977"/><rect x="-.022" y="-.09" width=".06" height=".05" fill="#76543d"/><path d="M-.60 .04Q-.2-.09.60 .04Q.42 .23-.38 .15Z" fill="#42344f"/><path d="M-.10-.46L-.02-.51" stroke="#9180ab" stroke-width=".028"/>',
  abobora: '<g transform="translate(.42 .57)"><path d="M-.005-.12Q-.035-.22.025-.23" fill="none" stroke="#638665" stroke-width=".04"/><ellipse cx="0" cy="0" rx=".145" ry=".13" fill="#e99a46"/><path d="M-.04-.12Q-.12 0-.04 .12M.04-.12Q.12 0 .04 .12" fill="none" stroke="#c77738" stroke-width=".022"/><path d="M-.09-.025L-.035-.05L-.045 .01ZM.09-.025L.035-.05L.045 .01ZM-.07 .045Q0 .10.07 .045" fill="#493146"/></g>',
  vampiro: '<path d="M-.44-.47L-.73-.68L-.63-.22Q-.78 .07-.91 .91Q0 1.11.91 .91Q.78 .07.63-.22L.73-.68L.44-.47Z" fill="#333242"/><path d="M-.63-.22L-.73-.68L-.44-.47M.63-.22L.73-.68L.44-.47" fill="#bf6675"/><path d="M-.73 .87Q0 1.02.73 .87" stroke="#a3516d" stroke-width=".05" fill="none"/>',
  natal: '<path d="M-.37 .04Q-.25-.57.17-.42Q.45-.37.49-.08L.34-.08Q.19-.34.08-.26L.23 .04Z" fill="#cc5560"/><path d="M-.22-.15Q-.17-.36.04-.38" fill="none" stroke="#ef9b99" stroke-width=".034"/><rect x="-.42" y="-.03" width=".77" height=".17" rx=".08" fill="#faf0df"/><circle cx=".49" cy="-.06" r=".105" fill="#faf0df"/><path d="M-.31 .06H.24" stroke="#dacbbd" stroke-width=".022"/>',
  rena: '<path d="M-.3 .03Q-.33-.14-.40-.44M.3 .03Q.33-.14.40-.44M-.37-.30L-.54-.36M.37-.30L.54-.36M-.42-.42L-.32-.53M.42-.42L.32-.53" fill="none" stroke="#f7e0bb" stroke-width=".095"/><path d="M-.3 .03Q-.33-.14-.40-.44M.3 .03Q.33-.14.40-.44M-.37-.30L-.54-.36M.37-.30L.54-.36M-.42-.42L-.32-.53M.42-.42L.32-.53" fill="none" stroke="#967354" stroke-width=".05"/><path d="M-.40 .07Q0-.12.40 .07" fill="none" stroke="#536f63" stroke-width=".075"/><circle cx="0" cy="-.005" r=".047" fill="#cc5560"/>',
  cachecol: '<path d="M-.47 .52Q0 .73.47 .52L.45 .67Q0 .89-.45 .67Z" fill="#bc5a63"/><path d="M.20 .71L.40 .68L.47 .94L.29 .98Z" fill="#b1535d"/><path d="M-.28 .59L-.30 .71M-.04 .64V.76M.21 .61L.23 .75M.30 .83L.43 .79M.32 .92L.45 .88" stroke="#f5ddbf" stroke-width=".055"/><path d="M.29 .97L.3 1.03M.36 .96L.37 1.02M.43 .94L.44 1" stroke="#f5ddbf" stroke-width=".023"/>',
};

const PALETAS: Record<AcessorioId, [string[], string[], string[]]> = {
  lacinho: [["#e85d8c"], ["#b72d63"], ["#f9b6d0"]],
  fone: [["#464e68"], ["#33394c"], ["#92c8df"]],
  pintor: [["#b78258"], ["#79523c"], ["#e5b078"]],
  boina: [["#675889"], ["#3d3454"], ["#a99ac7"]],
  bone: [["#6196c3"], ["#345e85"], ["#aad3e7"]],
  coroa: [["#efbc4c"], ["#d89036"], ["#fff0a9"]],
  oculos: [["#303747"], [], ["#d1e7ee"]],
  "oculos-sol": [["#252d40"], [], ["#637c99"]],
  colar: [["#e4b64f"], ["#c49349"], ["#f9edc2"]],
  gravata: [["#537f7f"], ["#315353"], ["#99c4b4"]],
  capa: [["#6371b8"], ["#404975"], ["#a8b4e0"]],
  bruxa: [["#534268"], ["#42344f"], ["#9180ab"]],
  abobora: [["#e99a46"], ["#c77738"], []],
  vampiro: [["#333242"], ["#a3516d"], ["#bf6675"]],
  natal: [["#cc5560"], [], ["#ef9b99"]],
  rena: [["#967354"], ["#536f63"], []],
  cachecol: [["#bc5a63"], ["#b1535d"], []],
};

const DETALHES: Partial<Record<AcessorioId, string>> = {
  lacinho: '<path d="M-.08 .06L-.26 .39L-.12 .35L-.05 .43L.035 .09M.04 .07L.23 .37L.11 .33L.06 .42L-.02 .10" fill="#b72d63"/><path d="M-.33-.14Q-.22-.14-.12-.035M.33-.14Q.22-.14.12-.035" fill="none" stroke="#f9b6d0" stroke-width=".018"/>',
  fone: '<path d="M-.57-.51Q0-.94.57-.51" fill="none" stroke="#92c8df" stroke-width=".025"/><rect x="-.80" y="-.12" width=".055" height=".28" rx=".027" fill="#92c8df"/><rect x=".745" y="-.12" width=".055" height=".28" rx=".027" fill="#92c8df"/>',
  boina: '<path d="M-.30 .07Q0 .14.30 .06" fill="none" stroke="#a99ac7" stroke-width=".015" stroke-dasharray=".025 .032"/>',
  bone: '<path d="M-.26-.18Q-.34-.12-.33-.015M.2-.19Q.29-.12.3-.015" fill="none" stroke="#aad3e7" stroke-width=".012" stroke-dasharray=".02 .025"/><path d="M-.12 .115Q.29 .16.55 .125" fill="none" stroke="#aad3e7" stroke-width=".017"/>',
  coroa: '<circle cx="-.46" cy="-.30" r=".032" fill="#fff0a9"/><circle cx="0" cy="-.44" r=".038" fill="#fff0a9"/><circle cx=".46" cy="-.30" r=".032" fill="#fff0a9"/>',
  capa: '<path d="M-.64 .1Q-.75 .44-.79 .82M.64 .1Q.75 .44.79 .82" fill="none" stroke="#404975" stroke-width=".07"/><path d="M-.45 .32L-.51 .82M.45 .32L.51 .82" stroke="#a8b4e0" stroke-width=".017"/>',
  natal: '<path d="M-.33 .01V.095M-.23 .0V.11M-.13 .0V.11M-.03 .0V.11M.07 .0V.11M.17 .0V.11M.27 .0V.095" stroke="#dacbbd" stroke-width=".013" fill="none"/>',
  cachecol: '<path d="M-.38 .58L-.39 .68M-.14 .63L-.15 .75M.10 .64L.12 .76M.34 .59L.36 .7" stroke="#f5ddbf" stroke-width=".012" fill="none"/>',
};

function misturarCor(cor: string, alvo: number, proporcao: number): string {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(cor.slice(i, i + 2), 16) * (1 - proporcao) + alvo * proporcao).toString(16).padStart(2, "0")).join("")}`;
}

export function corOriginalDoAcessorio(id: AcessorioId): string {
  return PALETAS[id][0][0];
}

const AJUSTES_CABECA: Partial<Record<AcessorioId, { escala: number; altura: number; lateral?: number }>> = {
  lacinho: { escala: 1.18, altura: -.04, lateral: -.10 },
  pintor: { escala: 1.18, altura: -.03 },
  boina: { escala: 1.22, altura: -.025 },
  bone: { escala: 1.20, altura: -.025 },
  coroa: { escala: 1.20, altura: -.035 },
  bruxa: { escala: 1.12, altura: -.025 },
  natal: { escala: 1.22, altura: -.02 },
  rena: { escala: 1.14, altura: -.015 },
};

export function encaixeDoAcessorio(id: AcessorioId, modelo: AgenteId): string {
  const encaixe = ENCAIXES_ACESSORIOS[modelo];
  if (id === "fone") return `translate(0 ${encaixe.olhos}) scale(${modelo === "tutor" ? 1.16 : .90} 1)`;
  const cabeca = AJUSTES_CABECA[id];
  if (cabeca) return `translate(${cabeca.lateral ?? 0} ${(encaixe.topo + cabeca.altura).toFixed(3)}) scale(${(encaixe.largura * cabeca.escala).toFixed(3)})`;
  if (id === "capa" || id === "vampiro") return `translate(0 -.025) scale(${modelo === "operador" ? 1.12 : modelo === "tutor" ? 1.36 : 1.28} 1.03)`;
  if (id === "colar") return "translate(0 -.06) scale(1.13)";
  if (id === "gravata") return "translate(0 -.08) scale(1.28)";
  if (id === "abobora") return "translate(0 -.13) scale(1.30)";
  if (id === "cachecol") return `translate(0 -.025) scale(${modelo === "tutor" ? 1.20 : 1.08} 1.05)`;
  return "";
}

export function desenhoDoAcessorio(id: AcessorioId, cor: string | null = null): string {
  const [bases, sombras, luzes] = PALETAS[id];
  const pigmento = corAcessorioValida(cor) ?? bases[0];
  const escuro = misturarCor(pigmento, 15, .35);
  const claro = misturarCor(pigmento, 255, .42);
  const gradiente = `niko-ac-pigmento-${id}`;
  const desenho = `${DESENHOS[id]}${DETALHES[id] ?? ""}`.replace(/(fill|stroke)="(#[\da-f]{6})"/gi, (atributo, tipo: string, valor: string) => {
    if (bases.includes(valor)) return `${tipo}="${tipo === "fill" ? `url(#${gradiente})` : pigmento}"`;
    if (sombras.includes(valor)) return `${tipo}="${escuro}"`;
    if (luzes.includes(valor)) return `${tipo}="${claro}"`;
    return atributo;
  });
  return `<defs><linearGradient id="${gradiente}" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${claro}"/><stop offset=".45" stop-color="${pigmento}"/><stop offset="1" stop-color="${escuro}"/></linearGradient></defs><g ${CONTORNO}>${desenho}</g>`;
}

export function definicoesDosAcessorios(acessorios: AcessoriosAgente, modelo: AgenteId, cor: string | null = null): string {
  const selecao = acessoriosValidos(acessorios);
  return POSICOES_ACESSORIOS.flatMap((p) => {
    const id = selecao[p];
    if (!id) return [];
    const transformacao = encaixeDoAcessorio(id, modelo);
    return [`<g id="niko-ac-${id}" transform="${transformacao}">${desenhoDoAcessorio(id, cor)}</g>`];
  }).join("");
}

function numerosDaMatriz(transformacao: string): number[] | null {
  const valores = transformacao.match(/^matrix\(([-\d. eE+]+)\)$/)?.[1].trim().split(/\s+/).map(Number);
  return valores?.length === 6 && valores.every(Number.isFinite) ? valores : null;
}

export function matrizDosOculos(quadro: string, corpo: string, modelo: AgenteId): string {
  const olhos = [...quadro.matchAll(/<ellipse\b[^>]*\btransform="([^"]+)"[^>]*\bfill="#FFFFFF"[^>]*>/g)].slice(0, 2).map((m) => numerosDaMatriz(m[1]));
  if (olhos.length === 2 && olhos[0] && olhos[1]) {
    const [esquerdo, direito] = olhos as [number[], number[]];
    const x = (direito[4] - esquerdo[4]) / 70;
    const y = (direito[5] - esquerdo[5]) / 70;
    return `matrix(${x} ${y} ${-y} ${x} ${(esquerdo[4] + direito[4]) / 2} ${(esquerdo[5] + direito[5]) / 2})`;
  }
  const matriz = numerosDaMatriz(corpo);
  if (!matriz) return corpo;
  const { olhos: altura, separacao } = ENCAIXES_ACESSORIOS[modelo];
  const [a, b, c, d, e, f] = matriz;
  const escala = separacao / 70;
  return `matrix(${a * escala} ${b * escala} ${c * escala} ${d * escala} ${e + c * altura} ${f + d * altura})`;
}

export function usosDosAcessorios(acessorios: AcessoriosAgente, modelo: AgenteId, corpo: string, quadro = "", atras = false): string {
  const selecao = acessoriosValidos(acessorios);
  return POSICOES_ACESSORIOS.flatMap((posicao) => {
    const id = selecao[posicao];
    if (!id || (posicao === "costas") !== atras) return [];
    const transformacao = posicao === "rosto" ? matrizDosOculos(quadro, corpo, modelo) : corpo;
    return [`<use href="#niko-ac-${id}" transform="${transformacao}"/>`];
  }).join("");
}

export function adicionarAcessorios(svg: string, acessorios: AcessoriosAgente, modelo: AgenteId, cor: string | null = null): string {
  const definicoes = definicoesDosAcessorios(acessorios, modelo, cor);
  if (!definicoes) return svg;
  return svg.replace("</defs>", `${definicoes}</defs>`).replace(/<g(?: opacity="0")?><animate attributeName="opacity"[\s\S]*?(?=<g(?: opacity="0")?><animate attributeName="opacity"|<\/svg>)/g, (quadro) => {
    const uso = quadro.match(/<use\b[^>]*\bhref="#s0"[^>]*>/)?.[0];
    const corpo = uso?.match(/\btransform="([^"]+)"/)?.[1];
    if (!uso || !corpo) return quadro;
    const atras = usosDosAcessorios(acessorios, modelo, corpo, quadro, true);
    const frente = usosDosAcessorios(acessorios, modelo, corpo, quadro);
    return quadro.replace(uso, `${atras}${uso}`).replace(/<\/g>$/, `${frente}</g>`);
  });
}

export function primeiroQuadroSvg(svg: string): string {
  const inicio = svg.indexOf("<g><animate attributeName=\"opacity\"");
  if (inicio < 0) return svg;
  const fim = svg.indexOf('<g opacity="0">', inicio);
  return `${svg.slice(0, inicio)}${svg.slice(inicio, fim < 0 ? svg.lastIndexOf("</svg>") : fim).replace(/<animate\b[^>]*\/>/g, "")}</svg>`;
}
