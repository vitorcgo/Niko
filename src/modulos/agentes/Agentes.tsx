import { ArrowLeft } from "lucide-react";
import { CabecalhoAba } from "../../componentes/CabecalhoAba";
import { Botao } from "../../componentes/basicos";
import { useInterface } from "../../estado/interface";
import { T } from "../../textos/textos";
import { PersonalizacaoDoTime } from "./PersonalizacaoDoTime";

export default function Agentes() {
  const irPara = useInterface((s) => s.irPara);
  return (
    <>
      <CabecalhoAba titulo={T.rotas.agentes} acoes={<Botao icone={<ArrowLeft size={14} />} onClick={() => irPara("inicio")}>{T.rotas.inicio}</Botao>} />
      <PersonalizacaoDoTime />
    </>
  );
}
