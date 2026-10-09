import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/styles/tokens.css";
import "../src/styles/base.css";
import "../src/styles/components.css";
import "../src/styles/features.css";

const memory = new Map<string, string>();
Object.defineProperty(window, "localStorage", { value: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } });
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.pathname.startsWith("/ponte/") || url.origin !== location.origin) return new Response("{}", { status: 503 });
  return fetchOriginal(input, options);
};
const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(e.message));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
const [{ Island: Island }, { useIsland: useIsland }, { useConfig }, { AnimatedStages: AnimatedStages }, { FilePathAnimation: FilePathAnimation }, { ZoneRelease: ZoneRelease, useAttachments: useAttachments }] = await Promise.all([
  import("../src/windows/island/Island"), import("../src/state/island"), import("../src/state/settings"),
  import("../src/windows/island/animations/AnimatedStages"), import("../src/windows/island/animations/FilePathAnimation"),
  import("../src/components/ChatAttachments"),
]);
useConfig.setState((s) => ({ sons: { ...s.sons, ligado: false }, ilha: { ...s.ilha, modo: "fixo", laterais: false, fechamentoSeg: 0 } }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function ScreenValue() {
  const zone = useRef<HTMLDivElement>(null);
  const [stages, setStages] = useState([{ id: "0", texto: "Etapa inicial" }]);
  const [context, setContext] = useState("sessao-a");
  const [result, setResult] = useState("Pronto para testar");
  const [running, setRunning] = useState(false);
  const [errorAttachment, setErrorAttachment] = useState("");
  const attachments = useAttachments(setErrorAttachment);
  const receipt = useRef<HTMLDivElement>(null);
  const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
  const aligned = () => {
    const target = document.querySelector<HTMLElement>(`[data-personagem-posicao="${useIsland.getState().estado}"]`);
    const character = document.querySelector<HTMLElement>(".ilha-personagem-continuo");
    if (!target || !character) return false;
    const a = target.getBoundingClientRect(), b = character.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 2 && Math.abs(a.top - b.top) < 2 && Math.abs(a.width - b.width) < 2;
  };
  const release = (hasFile: boolean) => {
    const el = zone.current!;
    const r = el.getBoundingClientRect();
    const payload = new DataTransfer();
    if (hasFile) payload.items.add(new File(["Teste local"], "teste.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: payload, clientX: r.left + 30, clientY: r.top + 30 }));
  };
  const execute = async () => {
    setRunning(true);
    let total = 0;
    const ok = (condition: boolean, message: string) => { check(condition, message); total++; setResult(`${total} verificacoes passaram`); };
    try {
      useIsland.getState().collapse(); await wait(1100);
      const original = document.querySelector(".ilha-personagem-continuo > .personagem");
      ok(Boolean(original) && aligned(), "Personagem compacto desalinhado");
      useIsland.getState().open("calendario"); await wait(1250);
      ok(document.querySelector(".ilha-personagem-continuo > .personagem") === original, "Personagem remontado ao expandir");
      ok(aligned(), "Personagem expandido desalinhado");
      for (const size of ["pequena", "grande", "media"] as const) {
        useConfig.getState().setIsland({ tamanho: size }); await wait(1000);
        ok(aligned(), `Desalinhamento na escala ${size}`);
      }
      for (let i = 0; i < 6; i++) { useIsland.getState().setState(i % 2 ? "expandida" : "compacta"); await wait(70); }
      await wait(1300); ok(aligned(), "Trocas rapidas desalinhadas");
      useIsland.getState().open("chat"); await wait(750);
      ok(document.querySelector<HTMLElement>(".ilha-personagem-continuo")?.style.visibility === "hidden", "Personagem flutuando sobre chat");
      useIsland.getState().open("calendario"); await wait(1100); ok(aligned(), "Retorno da aba chat desalinhado");
      setStages(Array.from({ length: 30 }, (_, i) => ({ id: String(i), texto: `Etapa ${i}` }))); await wait(2000);
      ok(document.querySelector("#etapas .ilha-etapas")?.textContent?.includes("Etapa 29") === true, "Fila nao terminou na etapa mais recente");
      setContext("sessao-b"); setStages([{ id: "outro", texto: "Novo projeto" }]); await wait(50);
      ok(!document.querySelector("#etapas")?.textContent?.includes("Etapa 29"), "Mistura de sessoes");
      release(false); await wait(30); ok(!document.querySelector(".ilha-arquivo-em-voo"), "Efeito sem arquivo");
      release(true); await wait(30); ok(Boolean(document.querySelector(".ilha-arquivo-em-voo")), "Arquivo nao iniciou trajeto");
      await wait(550); ok(!document.querySelector(".ilha-arquivo-em-voo"), "Arquivo fantasma nao foi removido");
      useConfig.setState({ reduzirAnimacoes: true }); await wait(50); release(true); await wait(40);
      ok(!document.querySelector(".ilha-arquivo-em-voo"), "Movimento reduzido ignorado");
      useIsland.getState().collapse(); await wait(1000); ok(aligned(), "Movimento reduzido desalinhado");
      useConfig.setState({ reduzirAnimacoes: false });
      ok(errors.length === 0, errors.join("; "));
      setResult(`${total} verificacoes passaram. Nenhum erro de execucao.`);
    } catch (e) { setResult(`FALHA: ${String(e)}`); }
    finally { setRunning(false); }
  };
  const checkFixes = async () => {
    setRunning(true);
    const failures: string[] = [];
    let total = 0;
    const ok = (condition: boolean, message: string) => { total++; if (!condition) failures.push(message); };
    const agentsOriginal = useConfig.getState().agentes;
    try {
      useConfig.setState({ reduzirAnimacoes: false, privacidade: false });
      await wait(30); release(true); await wait(30);
      ok(Boolean(document.querySelector(".ilha-arquivo-em-voo")), "Arquivo nao iniciou trajeto");
      useConfig.setState({ privacidade: true }); await wait(30);
      ok(!document.querySelector(".ilha-arquivo-em-voo")?.textContent?.includes("teste.txt"), "Nome do arquivo exposto na privacidade");
      ok(!document.querySelector("#etapas [title]") && !document.querySelector("#etapas .ilha-etapas")?.hasAttribute("aria-label"), "Etapa privada exposta por tooltip ou rotulo");
      useConfig.setState({ reduzirAnimacoes: true }); await wait(30);
      useConfig.setState({ reduzirAnimacoes: false }); await wait(30);
      ok(!document.querySelector(".ilha-arquivo-em-voo"), "Arquivo antigo reapareceu ao reativar movimentos");
      useConfig.setState({ privacidade: false }); await wait(30);
      ok(Boolean(document.querySelector("#etapas [title]")), "Tooltip nao retornou sem privacidade");
      useIsland.getState().open("calendario"); await wait(1200);
      useConfig.setState({ agentes: { ...agentsOriginal, cargos: { ...agentsOriginal.cargos, organizador: "Guia" } } }); await wait(900);
      ok(aligned(), "Cargo curto desalinhou personagem");
      useConfig.setState({ agentes: { ...agentsOriginal, cargos: { ...agentsOriginal.cargos, organizador: "Gerente de projetos e planejamento pessoal" } } }); await wait(900);
      ok(aligned(), "Cargo com duas linhas desalinhou personagem");
      const el = receipt.current!;
      const r = el.getBoundingClientRect();
      const payload = new DataTransfer();
      const invalid = new File(["Arquivo invalido"], "teste.exe", { type: "application/octet-stream" });
      payload.items.add(invalid);
      attachments.adicionar([invalid]);
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: payload, clientX: r.left + 40, clientY: r.top + 40 }));
      await wait(150);
      ok(!el.querySelector(".personagem-imagem")?.getAttribute("src")?.includes("/sucesso.svg"), "Arquivo invalido recebeu estado de sucesso");
      ok(Boolean(document.querySelector("#erro-anexo")?.textContent), "Leitura invalida nao informou erro");
      ok(errors.length === 0, errors.join("; "));
      setResult(failures.length ? `FALHA: ${failures.join("; ")}` : `${total} correcoes verificadas. Nenhum erro de execucao.`);
    } catch (e) { setResult(`FALHA: ${String(e)}`); }
    finally { useConfig.setState({ agentes: agentsOriginal, privacidade: false, reduzirAnimacoes: false }); setRunning(false); }
  };
  return <><Island /><main style={{ margin: "370px auto 0", width: 650, color: "#eee" }}>
    <h1>Verificacao isolada das animacoes</h1><p>Sem banco, provedores ou dados pessoais.</p>
    <button onClick={execute} disabled={running}>Executar verificacoes</button>
    <button onClick={checkFixes} disabled={running}>Verificar correcoes</button>
    <button onClick={() => useIsland.getState().open("calendario")}>Expandir</button>
    <button onClick={() => useIsland.getState().collapse()}>Recolher</button>
    <p role="status">{result}</p><div id="etapas"><AnimatedStages contexto={context} etapas={stages} /></div>
    <div style={{ position: "relative", marginTop: 20 }}><div ref={zone} style={{ height: 140, position: "relative", border: "1px solid #666", borderRadius: 20 }}>
      <div className="zona-soltar-boneco" style={{ position: "absolute", width: 54, height: 54, left: 280, top: 30, borderRadius: 27, background: "#f55" }} />
      <FilePathAnimation zona={zone} /></div></div>
    <button onClick={() => release(true)}>Testar arquivo local</button>
    <div ref={receipt} style={{ position: "relative", height: 120, marginTop: 20 }}><ZoneRelease ativo agente="organizador" compacta /></div>
    <p id="erro-anexo">{errorAttachment}</p>
  </main></>;
}
document.body.style.background = "#16171b";
createRoot(document.getElementById("root")!).render(<ScreenValue />);
