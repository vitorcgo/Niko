import { useMemo } from "react";
import { CalendarCheck, CircleCheck, Flame, Layers, MessagesSquare, Timer, Trophy, type LucideIcon } from "lucide-react";
import { useRotina } from "../../estado/rotina";
import { usePomodoro } from "../../estado/pomodoro";
import { useEstudos } from "../../estado/estudos";
import { useComunicacao } from "../../estado/comunicacao";
import { useConquistas } from "../../estado/conquistas";
import { resumoDeUso, temUso, type ResumoDeUso } from "../../utilitarios/resumoDeUso";
import { formatar } from "../../utilitarios/datas";
import { T } from "../../textos/textos";

const R = T.atualizacao.resumoDeUso;

const NUMEROS: { id: keyof Omit<ResumoDeUso, "desde">; icone: LucideIcon }[] = [
  { id: "tarefasConcluidas", icone: CircleCheck },
  { id: "minutosDeFoco", icone: Timer },
  { id: "habitosCumpridos", icone: Flame },
  { id: "cartoesRevisados", icone: Layers },
  { id: "mensagensAoTime", icone: MessagesSquare },
  { id: "conquistas", icone: Trophy },
  { id: "diasAtivos", icone: CalendarCheck },
];

function valorDe(id: keyof Omit<ResumoDeUso, "desde">, resumo: ResumoDeUso): string {
  if (id !== "minutosDeFoco") return resumo[id].toLocaleString("pt-BR");
  const horas = Math.floor(resumo.minutosDeFoco / 60);
  return horas ? R.horas(horas, resumo.minutosDeFoco % 60) : R.minutos(resumo.minutosDeFoco);
}

export function SeuNikoAteAgora() {
  const tarefas = useRotina((s) => s.tarefas);
  const habitos = useRotina((s) => s.habitos);
  const registros = useRotina((s) => s.registros);
  const sessoes = usePomodoro((s) => s.sessoes);
  const registroRevisoes = useEstudos((s) => s.registroRevisoes);
  const conversas = useComunicacao((s) => s.conversas);
  const conquistas = useConquistas((s) => s.alcancadas.length);
  const resumo = useMemo(
    () => resumoDeUso({ tarefas, habitos, registros, sessoes, registroRevisoes, conversas, conquistas }),
    [tarefas, habitos, registros, sessoes, registroRevisoes, conversas, conquistas],
  );

  if (!temUso(resumo)) return null;

  return (
    <section className="atualizacao-uso" aria-labelledby="atualizacao-uso-titulo">
      <div className="atualizacao-uso-topo">
        <h3 id="atualizacao-uso-titulo">{R.titulo}</h3>
        <span>{resumo.desde ? R.desde(formatar(resumo.desde, "dd/MM/yyyy")) : R.dica}</span>
      </div>
      <div className="atualizacao-uso-grade">
        {NUMEROS.filter(({ id }) => resumo[id] > 0).map(({ id, icone: Icone }, i) => (
          <div key={id} className="atualizacao-uso-numero" style={{ ["--ordem" as string]: i }}>
            <Icone size={15} />
            <b className="numero">{valorDe(id, resumo)}</b>
            <span>{R.rotulos[id]}</span>
          </div>
        ))}
      </div>
      <span className="atualizacao-uso-privado">{R.dica}</span>
    </section>
  );
}
