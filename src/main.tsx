import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/system.css";
import "./styles/features.css";
import { startStorage } from "./bridge/storage";
import { WINDOW, NATIVE, prepareBridge, redirectLinksExternal } from "./desktop/desktop";
import { T } from "./i18n/ptBR";

document.documentElement.dataset.tema = "claro";

const SELECTOR_OVERLAYS = ".ilha-raiz, .ilha-gatilho, .ilha-barra, .ilha-pop, .dock, .dock-gatilho, .dock-previa";

async function start() {
  const overlay = WINDOW === "ilha" || WINDOW === "dock" || WINDOW === "assistive";
  if (overlay) document.documentElement.classList.add("janela-sobreposta");
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable='true']")) return;
    if (overlay || target?.closest(SELECTOR_OVERLAYS)) e.preventDefault();
  });
  await prepareBridge();
  redirectLinksExternal();
  let mode = "local";
  for (let attempt = 0; attempt < (NATIVE ? 120 : 1); attempt++) {
    mode = await startStorage();
    if (mode === "banco") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const root = document.getElementById("raiz");
  if (!root) return;
  if (NATIVE && mode !== "banco") {
    if (WINDOW !== "sistema") return;
    root.innerHTML = `<div class="falha-ponte"><h1>${T.app.ponteFalhou}</h1><p>${T.app.ponteFalhouDica}</p></div>`;
    return;
  }
  if (overlay) document.documentElement.classList.add("janela-sobreposta");
  let Root: () => React.ReactElement;
  if (!NATIVE) Root = (await import("./windows/desktop/Desktop")).Desktop;
  else {
    const apps = await import("./desktop/Applications");
    Root = WINDOW === "ilha" ? apps.AppIsland : WINDOW === "dock" ? apps.AppDock : WINDOW === "assistive" ? apps.AppAssistive : apps.AppSystem;
  }
  createRoot(root).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}

void start();
