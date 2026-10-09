import { ArrowDown, ArrowUp, RotateCcw, X } from "lucide-react";
import { Button, Field, LineToggle } from "../../components/basics";
import { useConfig } from "../../state/settings";
import { ASSISTIVE_DEFAULT, moveShortcut } from "../../windows/assistive/rules";
import { T } from "../../i18n/ptBR";

export function AssistiveSection() {
  const cfg = useConfig((s) => s.assistive);
  const set = useConfig((s) => s.setAssistive);
  const C = T.assistive;
  return <div className="coluna" style={{ gap: 16 }}>
    <p className="campo-dica">{C.dicaConfiguracao}</p>
    <LineToggle rotulo={C.ativar} ligado={cfg.ativo} aoMudar={(active) => set({ ativo: active })} />
    <LineToggle rotulo={C.fixar} ligado={cfg.fixado} aoMudar={(fixado) => set({ fixado })} />
    <Field id="assistive-cor" rotulo={C.origemCor}><select id="assistive-cor" className="seletor" value={cfg.origemCor} onChange={(e) => set({ origemCor: e.target.value as "ilha" | "dock" })}><option value="ilha">{C.ilha}</option><option value="dock">{C.dock}</option></select></Field>
    <Field id="assistive-opacidade" rotulo={C.opacidade}><div className="linha" style={{ gap: 12 }}><input id="assistive-opacidade" type="range" min={0.3} max={1} step={0.05} value={cfg.opacidade} onChange={(e) => set({ opacidade: Number(e.target.value) })} /><output>{Math.round(cfg.opacidade * 100)}%</output></div></Field>
    <Button variante="secundario" icone={<RotateCcw size={15} />} onClick={() => set({ posicao: { ...ASSISTIVE_DEFAULT.posicao } })}>{C.restaurarPosicao}</Button>
    {cfg.apps.length > 0 && <div className="coluna" style={{ gap: 8 }}><b className="campo-rotulo">{C.editar}</b>{cfg.apps.map((app, i) => <div key={app.id} className="linha" style={{ gap: 8 }}><span style={{ flex: 1 }}>{app.nome}</span><Button pequeno variante="fantasma" soIcone icone={<ArrowUp size={14} />} aria-label={C.anterior(app.nome)} disabled={i === 0} onClick={() => set({ apps: moveShortcut(useConfig.getState().assistive.apps, app.id, -1) })} /><Button pequeno variante="fantasma" soIcone icone={<ArrowDown size={14} />} aria-label={C.proximo(app.nome)} disabled={i === cfg.apps.length - 1} onClick={() => set({ apps: moveShortcut(useConfig.getState().assistive.apps, app.id, 1) })} /><Button pequeno variante="fantasma" soIcone icone={<X size={14} />} aria-label={C.remover(app.nome)} onClick={() => set({ apps: useConfig.getState().assistive.apps.filter((a) => a.id !== app.id) })} /></div>)}</div>}
  </div>;
}
