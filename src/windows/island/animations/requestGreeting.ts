import { NATIVE } from "../../../desktop/desktop";
import { useIsland } from "../../../state/island";

export const EVENT_GREETING = "niko://saudacao";
export const WIDTH_GREETING = 520;
export const HEIGHT_GREETING = 176;

export async function requestGreeting() {
  if (!NATIVE) {
    useIsland.getState().greet();
    return;
  }
  const { emit } = await import("@tauri-apps/api/event");
  await emit(EVENT_GREETING);
}
