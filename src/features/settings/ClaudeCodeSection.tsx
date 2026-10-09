import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleDashed, Link2, Link2Off, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Modal, NoticeBanner, LineToggle } from "../../components/basics";
import { Brand } from "../../brands/Brand";
import { useConfig } from "../../state/settings";
import { useInterface } from "../../state/interface";
import { claudeCode, type StateInstallation, type PreviewInstallation } from "../../bridge/claudeCode";
import { playSound } from "../../bridge/sounds";
import { allowNotifications } from "../../desktop/desktop";
import { T } from "../../i18n/ptBR";

const C = T.configuracoes.claudeCode;

function statusValue(e: StateInstallation | null): { rotulo: string; tipo: "ok" | "alerta" | "neutro" } {
  if (!e) return { rotulo: C.estados.desconectado, tipo: "neutro" };
  if (e.invalido) return { rotulo: C.estados.invalido, tipo: "alerta" };
  if (e.desatualizado) return { rotulo: C.estados.desatualizado, tipo: "alerta" };
  if (e.instalado && e.conectado) return { rotulo: C.estados.conectado, tipo: "ok" };
  if (e.instalado) return { rotulo: C.estados.instalado, tipo: "ok" };
  if (e.parcial) return { rotulo: C.estados.parcial, tipo: "alerta" };
  if (!e.claudeInstalado) return { rotulo: C.estados.semClaude, tipo: "alerta" };
  return { rotulo: C.estados.desconectado, tipo: "neutro" };
}

export function ClaudeCodeSection() {
  const notify = useInterface((s) => s.notify);
  const island = useConfig((s) => s.ilha);
  const setIsland = useConfig((s) => s.setIsland);
  const set = useConfig((s) => s.set);
  const notificationsEnabled = useConfig((s) => s.notificarClaude);
  const [state, setState] = useState<StateInstallation | null>(null);
  const [preview, setPreview] = useState<{ acao: "instalar" | "remover"; dados: PreviewInstallation } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const update = useCallback(() => {
    claudeCode.instalacao().then(setState).catch(() => setState(null));
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [update]);

  const openPreview = (action: "instalar" | "remover") => {
    setError("");
    claudeCode
      .previa(action)
      .then((payload) => setPreview({ acao: action, dados: payload }))
      .catch((e: Error) => setError(e.message === "settings_invalido" ? C.invalidoDica : C.falhou));
  };

  const confirmValue = () => {
    if (!preview || working) return;
    setWorking(true);
    const action = preview.acao;
    (action === "instalar" ? claudeCode.instalar() : claudeCode.remover())
      .then((r) => {
        if (action === "instalar") setIsland({ blocos: { ...useConfig.getState().ilha.blocos, claude: true } });
        set({ claudeInstalado: action === "instalar" });
        notify(action === "instalar" ? C.conectadoAviso(r.copia) : C.removidoAviso(r.copia));
        void playSound(action === "instalar" ? "approve" : "close", "interface");
        setPreview(null);
        update();
      })
      .catch((e: Error) => setError(e.message === "settings_invalido" ? C.invalidoDica : C.falhou))
      .finally(() => setWorking(false));
  };

  const s = statusValue(state);
  const installed = Boolean(state?.instalado || state?.parcial || state?.desatualizado);

  return (
    <div className="coluna" style={{ gap: 16 }}>
      <div className="claude-config-topo">
        <span className="claude-config-marca">
          <Brand marca="claudecode" tamanho={26} />
        </span>
        <div className="coluna" style={{ gap: 2, minWidth: 0 }}>
          <b>{C.titulo}</b>
          <span className="campo-dica">{C.texto}</span>
        </div>
        <span className="claude-config-estado" data-tipo={s.tipo}>
          {s.tipo === "ok" ? <CircleCheck size={13} /> : s.tipo === "alerta" ? <TriangleAlert size={13} /> : <CircleDashed size={13} />}
          {s.rotulo}
        </span>
      </div>

      <ul className="claude-config-lista">
        {C.recursos.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      {error && <NoticeBanner tipo="erro">{error}</NoticeBanner>}
      {state?.invalido && <NoticeBanner tipo="alerta">{C.invalidoDica}</NoticeBanner>}

      <div className="linha" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button variante="primario" icone={installed ? <RefreshCw size={14} /> : <Link2 size={14} />} disabled={state?.invalido} onClick={() => openPreview("instalar")}>
          {installed ? C.reconectar : C.conectar}
        </Button>
        {installed && (
          <Button variante="perigo" icone={<Link2Off size={14} />} disabled={state?.invalido} onClick={() => openPreview("remover")}>
            {C.remover}
          </Button>
        )}
      </div>

      <LineToggle rotulo={C.mostrarAba} dica={C.mostrarAbaDica} ligado={island.blocos.claude} aoMudar={(v) => setIsland({ blocos: { ...island.blocos, claude: v } })} />
      <div className="coluna" style={{ gap: 4 }}>
        <LineToggle
          rotulo={C.notificar}
          ligado={notificationsEnabled}
          aoMudar={(v) => {
            if (!v) return set({ notificarClaude: false });
            void allowNotifications().then((ok) => {
              set({ notificarClaude: ok });
              if (!ok) setError(C.notificarNegado);
            });
          }}
        />
        <span className="campo-dica">{C.notificarDica}</span>
      </div>

      <Modal aberto={!!preview} titulo={preview?.acao === "remover" ? C.previaRemover : C.previaConectar} aoFechar={() => setPreview(null)} largo>
        {preview && (
          <div className="coluna" style={{ gap: 12 }}>
            <div className="campo-grupo">
              <span className="campo-rotulo">{C.arquivo}</span>
              <code className="claude-config-caminho">{preview.dados.caminho}</code>
            </div>
            <NoticeBanner>{C.copiaAviso}</NoticeBanner>
            <div className="claude-config-diff">
              <div className="coluna" style={{ gap: 4, minWidth: 0 }}>
                <span className="campo-rotulo">{C.antes}</span>
                <pre className="claude-config-codigo">{preview.dados.atual ?? C.arquivoNovo}</pre>
              </div>
              <div className="coluna" style={{ gap: 4, minWidth: 0 }}>
                <span className="campo-rotulo">{C.depois}</span>
                <pre className="claude-config-codigo">{preview.dados.proposto}</pre>
              </div>
            </div>
            <span className="campo-dica">{C.segredoAviso}</span>
            <span className="campo-dica">{C.reiniciarAviso}</span>
            <div className="formulario-acoes">
              <Button onClick={() => setPreview(null)}>{T.geral.cancelar}</Button>
              <Button variante={preview.acao === "remover" ? "perigo" : "primario"} disabled={working} onClick={confirmValue}>
                {preview.acao === "remover" ? C.confirmarRemover : C.confirmarConectar}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
