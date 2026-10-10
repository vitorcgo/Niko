import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./estilos/tokens.css";
import "./estilos/base.css";
import "./estilos/componentes.css";
import "./estilos/sistema.css";
import "./estilos/modulos.css";
import "./estilos/estilo-sistema.css";
import "./estilos/telas/inicio.css";
import "./estilos/telas/chat.css";
import "./estilos/telas/escritorio.css";
import "./estilos/telas/conexoes.css";
import "./estilos/telas/journal.css";
import "./estilos/telas/estudos.css";
import "./estilos/telas/financas.css";
import "./estilos/telas/metas.css";
import "./estilos/telas/calendario.css";
import "./estilos/telas/atualizacao.css";
import "./estilos/telas/ia.css";
import "./estilos/telas/consumo.css";
import "./estilos/telas/conquistas.css";
import "./estilos/telas/configuracoes.css";
import "./estilos/telas/busca.css";
import { iniciarArmazenamento } from "./ponte/armazenamento";
import { JANELA, NATIVO, prepararPonte, desviarLinksExternos } from "./desktop/desktop";
import { T } from "./textos/textos";
import { LimiteDeErro } from "./componentes/LimiteDeErro";

document.documentElement.dataset.tema = "claro";

const SELETOR_DAS_SOBREPOSTAS = ".ilha-raiz, .ilha-gatilho, .ilha-barra, .ilha-pop, .dock, .dock-gatilho, .dock-previa";

async function iniciar() {
  const sobreposta = JANELA === "ilha" || JANELA === "dock" || JANELA === "assistive";
  if (sobreposta) document.documentElement.classList.add("janela-sobreposta");
  document.addEventListener("contextmenu", (e) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest("input, textarea, [contenteditable='true']")) return;
    if (sobreposta || alvo?.closest(SELETOR_DAS_SOBREPOSTAS)) e.preventDefault();
  });
  await prepararPonte();
  desviarLinksExternos();
  let modo = "local";
  for (let tentativa = 0; tentativa < (NATIVO ? 5 : 1); tentativa++) {
    modo = await iniciarArmazenamento();
    if (modo === "banco") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const raiz = document.getElementById("raiz");
  if (!raiz) return;
  if (NATIVO && modo !== "banco") {
    throw new Error("ponte_indisponivel");
  }
  if (sobreposta) document.documentElement.classList.add("janela-sobreposta");
  let Raiz: () => React.ReactElement;
  if (!NATIVO) Raiz = (await import("./janelas/area-de-trabalho/AreaDeTrabalho")).AreaDeTrabalho;
  else {
    const apps = await import("./desktop/Aplicativos");
    Raiz = JANELA === "ilha" ? apps.AppIlha : JANELA === "dock" ? apps.AppDock : JANELA === "assistive" ? apps.AppAssistive : apps.AppSistema;
  }
  createRoot(raiz).render(
    <StrictMode>
      <LimiteDeErro>
        <Raiz />
      </LimiteDeErro>
    </StrictMode>,
  );
}

function mostrarFalhaInicial() {
  const raiz = document.getElementById("raiz");
  if (!raiz) return;
  const painel = document.createElement("div");
  painel.className = "falha-ponte";
  const titulo = document.createElement("h1");
  titulo.textContent = T.app.ponteFalhou;
  const dica = document.createElement("p");
  dica.textContent = T.app.ponteFalhouDica;
  const repetir = document.createElement("button");
  repetir.className = "botao botao-primario";
  repetir.textContent = T.app.tentarNovamente;
  repetir.onclick = () => window.location.reload();
  painel.append(titulo, dica, repetir);
  raiz.replaceChildren(painel);
  if (NATIVO) void import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().show()).catch(() => undefined);
}

void iniciar().catch(mostrarFalhaInicial);
