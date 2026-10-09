import { BookOpen, CalendarDays, GraduationCap, Target, Wallet, type LucideIcon } from "lucide-react";
import { Toggle, Modal } from "../../components/basics";
import { useConfig } from "../../state/settings";
import { FUNCTIONS, type Feature } from "../../utils/features";
import { playSound } from "../../bridge/sounds";
import { T } from "../../i18n/ptBR";

const ICON_FUNCTION: Record<Feature, LucideIcon> = {
  journal: BookOpen,
  estudos: GraduationCap,
  financas: Wallet,
  metas: Target,
  calendario: CalendarDays,
};

export function FeaturePanel({ aberto: isOpen, aoFechar: onClose }: { aberto: boolean; aoFechar: () => void }) {
  const disabled = useConfig((s) => s.funcoesDesligadas);
  const set = useConfig((s) => s.set);

  const toggle = (feature: Feature, enable: boolean) => {
    set({ funcoesDesligadas: enable ? disabled.filter((f) => f !== feature) : [...disabled, feature] });
    void playSound(enable ? "approve" : "close", "interface");
  };

  return (
    <Modal aberto={isOpen} titulo={T.funcoes.titulo} aoFechar={onClose}>
      <p className="campo-dica" style={{ marginBottom: 12 }}>{T.funcoes.dica}</p>
      <div className="lista">
        {FUNCTIONS.map((f) => {
          const Icon = ICON_FUNCTION[f];
          const enabled = !disabled.includes(f);
          return (
            <div key={f} className="lista-item" data-desligada={!enabled || undefined}>
              <Icon size={16} />
              <span className="coluna lista-item-principal" style={{ gap: 2, minWidth: 0 }}>
                <span>{T.funcoes.nomes[f]}</span>
                <span className="campo-dica">{T.funcoes.descricoes[f]}</span>
              </span>
              <Toggle ligado={enabled} rotulo={T.funcoes.nomes[f]} aoMudar={(v) => toggle(f, v)} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
