import { PersonalizacaoDoTime } from "../../modulos/agentes/PersonalizacaoDoTime";
import "./timeNaIlha.css";

export function VisaoTime() {
  return <div className="ilha-rolagem time-na-ilha"><PersonalizacaoDoTime compacto /></div>;
}
