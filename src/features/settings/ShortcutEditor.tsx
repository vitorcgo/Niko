import { useEffect, useState } from "react";
import { Button, Key } from "../../components/basics";
import { useConfig } from "../../state/settings";
import { pausarShortcutsGlobal, useStatusShortcuts } from "../../desktop/useGlobalShortcuts";
import { ACTIONS_GLOBAL, SHORTCUTS_DEFAULT, formatKeys, keysEvent, type ActionGlobal } from "../../utils/shortcuts";
import { T } from "../../i18n/ptBR";

const A = T.configuracoes.atalhosGlobais;
const ONLY_MODIFIERS = new Set(["ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"]);

export function ShortcutEditor() {
  const shortcuts = useConfig((s) => s.atalhosGlobais);
  const set = useConfig((s) => s.set);
  const situacoes = useStatusShortcuts((s) => s.situacoes);
  const [gravando, setGravando] = useState<ActionGlobal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const change = (action: ActionGlobal, keys: string) => set({ atalhosGlobais: { ...useConfig.getState().atalhosGlobais, [action]: keys } });

  useEffect(() => {
    if (!gravando) return;
    void pausarShortcutsGlobal(true);
    return () => void pausarShortcutsGlobal(false);
  }, [gravando]);

  useEffect(() => {
    if (!gravando) return;
    const onPress = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setGravando(null);
        setNotice(null);
        return;
      }
      if (ONLY_MODIFIERS.has(e.code)) return;
      const keys = keysEvent(e);
      if (!keys) {
        setNotice(A.precisaModificador);
        return;
      }
      setNotice(null);
      setGravando(null);
      change(gravando, keys);
    };
    window.addEventListener("keydown", onPress, true);
    return () => window.removeEventListener("keydown", onPress, true);
  }, [gravando]);

  return (
    <div className="lista" role="list" aria-label={A.titulo}>
      {ACTIONS_GLOBAL.map((action) => {
        const keys = shortcuts[action];
        const statusValue = situacoes[action];
        const problema = statusValue ? A.situacoes[statusValue] : "";
        return (
          <div key={action} className="lista-item" role="listitem">
            <span className="lista-item-principal">
              <span className="lista-item-titulo">{A.acoes[action]}</span>
              {gravando === action && notice && <span className="lista-item-sub" style={{ whiteSpace: "normal" }}>{notice}</span>}
              {gravando !== action && problema && (
                <span className="lista-item-sub" role="alert" style={{ whiteSpace: "normal", color: "var(--erro)" }}>
                  {problema}
                </span>
              )}
            </span>
            <Key>{gravando === action ? A.gravando : keys ? formatKeys(keys) : A.desligado}</Key>
            {gravando === action ? (
              <Button pequeno variante="fantasma" onClick={() => setGravando(null)}>
                {A.cancelar}
              </Button>
            ) : (
              <>
                <Button pequeno variante="fantasma" onClick={() => setGravando(action)}>
                  {A.mudar}
                </Button>
                {keys && (
                  <Button pequeno variante="fantasma" onClick={() => change(action, "")}>
                    {A.desligar}
                  </Button>
                )}
              </>
            )}
          </div>
        );
      })}
      <div className="lista-item">
        <span className="lista-item-principal" />
        <Button pequeno onClick={() => set({ atalhosGlobais: SHORTCUTS_DEFAULT })}>
          {A.restaurar}
        </Button>
      </div>
    </div>
  );
}
