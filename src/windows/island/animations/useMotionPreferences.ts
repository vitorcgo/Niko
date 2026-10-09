import { useReducedMotion } from "motion/react";
import { useConfig } from "../../../state/settings";

export function useMotionPreferences() {
  const system = useReducedMotion();
  const configuration = useConfig((s) => s.reduzirAnimacoes);
  return Boolean(system || configuration);
}
