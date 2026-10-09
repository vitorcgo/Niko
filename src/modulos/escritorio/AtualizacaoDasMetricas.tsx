import { T } from "../../textos/textos";
import { metricasDesatualizadas, type MetricasDaSessao } from "./metricasDaSessao";

export function AtualizacaoDasMetricas({ metricas, agora }: { metricas: MetricasDaSessao; agora: number }) {
  const antiga = metricasDesatualizadas(metricas, agora);
  const data = new Date(metricas.em);
  return <p className="ei-nota" data-antiga={antiga}>
    {T.escritorio.ias.metricasAtualizadas}{" "}<time dateTime={metricas.em}>{Number.isFinite(data.getTime()) ? data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : T.escritorio.ias.naoInformado}</time>
    {antiga && <span> · {T.escritorio.ias.metricasAntigas}</span>}
  </p>;
}
