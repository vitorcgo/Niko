import { useEffect, useState, type RefObject } from "react";
import { motion } from "motion/react";
import { FileText } from "lucide-react";
import { calculatePathFile } from "./rules";
import { useMotionPreferences } from "./useMotionPreferences";
import { useConfig } from "../../../state/settings";
import { T } from "../../../i18n/ptBR";
import "./animations.css";

type Path = NonNullable<ReturnType<typeof calculatePathFile>> & { id: number; nome: string };

export function FilePathAnimation({ zona: zone }: { zona: RefObject<HTMLDivElement | null> }) {
  const reduce = useMotionPreferences();
  const privacy = useConfig((s) => s.privacidade);
  const [path, setPath] = useState<Path | null>(null);
  useEffect(() => {
    if (reduce) {
      setPath(null);
      return;
    }
    const el = zone.current;
    const parentValue = el?.parentElement;
    if (!el || !parentValue) return;
    let clock: number | undefined;
    const release = (eventValue: DragEvent) => {
      if (document.hidden) return;
      const files = Array.from(eventValue.dataTransfer?.files ?? []);
      const character = el.querySelector<HTMLElement>(".zona-soltar-boneco");
      if (!files.length || !character || !parentValue.contains(eventValue.target as Node)) return;
      const rectangle = el.getBoundingClientRect();
      const scale = rectangle.width / el.offsetWidth;
      const destination = calculatePathFile(rectangle, character.getBoundingClientRect(), { x: eventValue.clientX, y: eventValue.clientY }, scale);
      if (!destination) return;
      window.clearTimeout(clock);
      setPath({ ...destination, id: performance.now(), nome: files[0].name });
      clock = window.setTimeout(() => setPath(null), 470);
    };
    const hide = () => {
      if (document.hidden) {
        window.clearTimeout(clock);
        setPath(null);
      }
    };
    parentValue.addEventListener("drop", release, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.clearTimeout(clock);
      parentValue.removeEventListener("drop", release, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [zone, reduce]);

  if (!path || reduce) return null;
  return (
    <motion.span key={path.id} className="ilha-arquivo-em-voo" aria-hidden="true"
      initial={{ x: path.origem.x, y: path.origem.y, scale: 1, opacity: 1, rotate: -8 }}
      animate={{ x: [path.origem.x, (path.origem.x + path.destino.x) / 2, path.destino.x], y: [path.origem.y, Math.min(path.origem.y, path.destino.y) - 16, path.destino.y], scale: [1, 0.85, 0.08], opacity: [1, 1, 0], rotate: [-8, 5, 0] }}
      transition={{ duration: 0.38, ease: [0.4, 0, 0.8, 1], times: [0, 0.45, 1] }}>
      <span><FileText size={15} /><span className="cortar">{privacy ? T.chat.anexos.arquivo : path.nome}</span></span>
    </motion.span>
  );
}
