import { useState } from "react";
import { motion } from "motion/react";
import { AppWindow, FolderOpen, Power } from "lucide-react";
import { useIsland } from "../../../state/island";
import { useControlQuick, useTray } from "../../../state/quickControls";
import { control, type ItemTray } from "../../../bridge/localBridge";
import { playSound } from "../../../bridge/sounds";
import { T } from "../../../i18n/ptBR";

const B = T.ilha.barra;
const INTERVAL_TRAY_MS = 5000;

type Menu = { item: ItemTray; confirmando: boolean } | null;

export function Tray({ topo: topValue, direita: right, aoFechar: onClose }: { topo: number; direita: number; aoFechar: () => void }) {
  const items = useControlQuick((s) => s.bandeja);
  const read = useControlQuick((s) => s.bandejaLida);
  const synchronize = useControlQuick((s) => s.readTray);
  const [menu, setMenu] = useState<Menu>(null);
  useTray(true, INTERVAL_TRAY_MS);

  const fail = (item: ItemTray) => (e: Error) => useIsland.getState().notifyFailure(e.message === "sem_janela" ? B.bandejaSemJanela(item.nome) : e.message === "app_do_windows" ? B.bandejaDoWindows : B.bandejaIndisponivel);

  const openValue = (item: ItemTray) => {
    void playSound("blip");
    onClose();
    void control.abrirDaBandeja(item.caminho).catch(fail(item));
  };

  const showDirectory = (item: ItemTray) => {
    void playSound("blip");
    onClose();
    void control.pastaDaBandeja(item.caminho).catch(fail(item));
  };

  const stopValue = (item: ItemTray) => {
    void playSound("close");
    setMenu(null);
    void control.encerrarDaBandeja(item.caminho).then(() => window.setTimeout(() => void synchronize(), 600), fail(item));
  };

  return (
    <motion.div
      className="ilha-pop ilha-bandeja"
      style={{ top: topValue, right: right }}
      role="dialog"
      aria-label={B.bandeja}
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.1 } }}
      transition={{ type: "spring", visualDuration: 0.24, bounce: 0.15 }}
    >
      {items.length > 0 ? (
        <div className="ilha-bandeja-grade">
          {items.map((item) => (
            <button
              key={item.caminho}
              type="button"
              className="ilha-bandeja-item"
              data-ativo={menu?.item.caminho === item.caminho || undefined}
              aria-label={B.abrirDaBandeja(item.nome)}
              aria-haspopup="menu"
              title={item.dica && item.dica !== item.nome ? `${item.nome}\n${item.dica}` : item.nome}
              onClick={() => openValue(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                void playSound("open");
                setMenu({ item, confirmando: false });
              }}
              onKeyDown={(e) => {
                if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                  e.preventDefault();
                  setMenu({ item, confirmando: false });
                }
              }}
            >
              {item.icone ? <img src={item.icone} alt="" width={16} height={16} draggable={false} /> : <span className="ilha-bandeja-letra">{item.nome.trim()[0]?.toUpperCase() ?? "?"}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="ilha-rapido-vazio">{read ? B.bandejaVazia : B.lendoBandeja}</p>
      )}
      {menu && (
        <div className="ilha-bandeja-menu" role="menu" aria-label={menu.item.nome} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setMenu(null))}>
          <span className="ilha-bandeja-menu-nome cortar">{menu.item.nome}</span>
          {menu.confirmando ? (
            <>
              <p className="ilha-bandeja-menu-aviso">{B.bandejaConfirmarEncerrar(menu.item.nome)}</p>
              <div className="ilha-bandeja-menu-botoes">
                <button type="button" className="ilha-rapido-texto" autoFocus onClick={() => setMenu({ ...menu, confirmando: false })}>{T.geral.cancelar}</button>
                <button type="button" className="ilha-rapido-texto ilha-bandeja-perigo" onClick={() => stopValue(menu.item)}>{B.bandejaEncerrar}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="ilha-rapido-texto" autoFocus onClick={() => openValue(menu.item)}><AppWindow size={14} />{B.bandejaAbrir}</button>
              <button type="button" role="menuitem" className="ilha-rapido-texto" onClick={() => showDirectory(menu.item)}><FolderOpen size={14} />{B.bandejaPasta}</button>
              <button type="button" role="menuitem" className="ilha-rapido-texto ilha-bandeja-perigo" onClick={() => setMenu({ ...menu, confirmando: true })}><Power size={14} />{B.bandejaEncerrar}</button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
