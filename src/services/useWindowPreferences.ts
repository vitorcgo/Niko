import { useEffect } from "react";
import { useConfig } from "../state/settings";
import { setPreferencesSound } from "../bridge/sounds";
import { setRolloverDay } from "../utils/dates";

export function useWindowPreferences() {
  const sounds = useConfig((s) => s.sons);
  const notDisturb = useConfig((s) => s.naoPerturbe);
  const rollover = useConfig((s) => s.viradaAs4h);
  useEffect(() => {
    setPreferencesSound({ ...sounds, silencioFoco: notDisturb });
  }, [sounds, notDisturb]);
  useEffect(() => {
    setRolloverDay(rollover);
  }, [rollover]);
}
