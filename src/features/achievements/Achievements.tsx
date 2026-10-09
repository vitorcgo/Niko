import { Trophy, Lock } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, NoticeBanner } from "../../components/basics";
import { Heatmap } from "../../components/Heatmap";
import { Character } from "../../characters/Character";
import { useAchievements, ACHIEVEMENTS } from "../../state/achievements";
import { useConfig } from "../../state/settings";
import { T } from "../../i18n/ptBR";
import { formatDateString, dayMoment } from "../../utils/dates";
import { achievementEnabled } from "../../utils/features";

export default function Achievements() {
  const reached = useAchievements((s) => s.alcancadas);
  const active = useConfig((s) => s.conquistasAtivas);
  const names = useConfig((s) => s.agentes.nomes);
  const disabled = useConfig((s) => s.funcoesDesligadas);

  return (
    <>
      <TabHeader titulo={T.conquistas.titulo} subtitulo={T.conquistas.subtitulo} agente="organizador" />
      {!active && <NoticeBanner tipo="alerta">{T.conquistas.desligadas}</NoticeBanner>}
      <Card titulo={T.conquistas.mapa}>
        <Heatmap />
      </Card>
      <div className="grade-conquistas">
        {ACHIEVEMENTS.filter((c) => achievementEnabled(c.codigo, disabled)).map((c) => {
          const a = reached.find((x) => x.codigo === c.codigo);
          const item = T.conquistas.itens[c.codigo];
          const next = c.niveis.find((n) => !a || n > a.nivel);
          return (
            <div key={c.codigo} className="cartao conquista" data-alcancada={a ? "sim" : "nao"}>
              <div className="linha">
                <span className="conquista-icone">{a ? <Trophy size={18} /> : <Lock size={16} />}</span>
                <div className="coluna" style={{ gap: 0, flex: 1, minWidth: 0 }}>
                  <b className="cortar">{item.nome}</b>
                  <span className="texto-3" style={{ fontSize: 11 }}>{names[c.agente]}</span>
                </div>
                <Character agente={c.agente} tamanho={32} estado={a ? "sucesso" : "ocioso"} interativo={!!a} halo={false} />
              </div>
              <p className="texto-2" style={{ fontSize: 12 }}>{item.regra}</p>
              <div className="linha" style={{ flexWrap: "wrap" }}>
                {c.niveis.map((n, i) => (
                  <span key={n} className={`etiqueta ${a && a.nivel >= n ? "etiqueta-sucesso" : ""}`}>{c.niveis.length > 1 ? T.conquistas.nivel(i + 1) : T.conquistas.unico}</span>
                ))}
                {a && <span className="texto-3 empurrar" style={{ fontSize: 11 }}>{formatDateString(dayMoment(a.data), "d/MM/yyyy")}</span>}
              </div>
              {next && a && <span className="campo-dica">{T.conquistas.proximoNivel(next)}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
