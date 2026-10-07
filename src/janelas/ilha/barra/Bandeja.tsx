import { motion } from "motion/react";
import { useIlha } from "../../../estado/ilha";
import { useControleRapido, usarBandeja } from "../../../estado/controleRapido";
import { controle } from "../../../ponte/ponteLocal";
import { tocarSom } from "../../../ponte/sons";
import { T } from "../../../textos/textos";

const B = T.ilha.barra;
const INTERVALO_DA_BANDEJA_MS = 5000;

export function Bandeja({ topo, direita, aoFechar, embutido = false }: { topo: number; direita: number; aoFechar: () => void; embutido?: boolean }) {
  const itens = useControleRapido((s) => s.bandeja);
  const lida = useControleRapido((s) => s.bandejaLida);
  usarBandeja(true, INTERVALO_DA_BANDEJA_MS);

  return (
    <motion.div
      className="ilha-pop ilha-bandeja"
      data-embutido={embutido || undefined}
      style={embutido ? undefined : { top: topo, right: direita }}
      role={embutido ? "group" : "dialog"}
      aria-label={B.bandeja}
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.1 } }}
      transition={{ type: "spring", visualDuration: 0.24, bounce: 0.15 }}
    >
      {itens.length > 0 ? (
        <div className="ilha-bandeja-grade">
          {itens.map((item) => (
            <button
              key={item.caminho}
              type="button"
              className="ilha-bandeja-item"
              aria-label={B.abrirDaBandeja(item.nome)}
              title={item.dica && item.dica !== item.nome ? `${item.nome}\n${item.dica}` : item.nome}
              onClick={() => {
                void tocarSom("blip");
                aoFechar();
                void controle.abrirDaBandeja(item.caminho).catch((e: Error) => useIlha.getState().avisarFalha(e.message === "sem_janela" ? B.bandejaSemJanela(item.nome) : B.bandejaIndisponivel));
              }}
            >
              {item.icone ? <img src={item.icone} alt="" width={16} height={16} draggable={false} /> : <span className="ilha-bandeja-letra">{item.nome.trim()[0]?.toUpperCase() ?? "?"}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="ilha-rapido-vazio">{lida ? B.bandejaVazia : B.lendoBandeja}</p>
      )}
    </motion.div>
  );
}
