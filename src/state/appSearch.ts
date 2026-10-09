import { create } from "zustand";
import { persist } from "zustand/middleware";
import { storage, key } from "../bridge/storage";
import { registerUsage, type Usage } from "../utils/appSearch";

const LIMIT_USAGE = 300;

interface StateSearchApps {
  usos: Record<string, Usage>;
  use: (id: string) => void;
  forget: () => void;
}

export const useAppSearch = create<StateSearchApps>()(
  persist(
    (set, get) => ({
      usos: {},
      use: (id) => set({ usos: registerUsage(get().usos, id, LIMIT_USAGE) }),
      forget: () => set({ usos: {} }),
    }),
    { name: key("busca-apps"), storage: storage, partialize: (s) => ({ usos: s.usos }) },
  ),
);
