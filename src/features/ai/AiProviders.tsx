import { TabHeader } from "../../components/TabHeader";
import { AiSection } from "../settings/AiSection";
import { T } from "../../i18n/ptBR";

export default function AiProviders() {
  return (
    <>
      <TabHeader titulo={T.rotas.ia} subtitulo={T.provedoresIa.subtitulo} agente="operador" />
      <AiSection />
    </>
  );
}
