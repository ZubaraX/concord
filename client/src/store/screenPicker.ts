import { create } from "zustand";

// Bridge between the imperative screen-share flow (lib/voice) and the React
// picker UI. `open` shows the picker and resolves with the chosen source id (or
// null if cancelled).
interface ScreenPickerState {
  sources: DesktopSource[] | null; // null = picker closed
  resolve: ((id: string | null) => void) | null;
  open: (sources: DesktopSource[]) => Promise<string | null>;
  pick: (id: string | null) => void;
}

export const useScreenPicker = create<ScreenPickerState>((set, get) => ({
  sources: null,
  resolve: null,
  open: (sources) => new Promise((res) => set({ sources, resolve: res })),
  pick: (id) => {
    const r = get().resolve;
    set({ sources: null, resolve: null });
    r?.(id);
  },
}));

/** Show the desktop screen/window picker; returns the chosen id, "default" on
 *  web (browser's own picker handles it), or null if cancelled. */
export async function pickScreenSource(): Promise<string | null> {
  const c = window.concord;
  if (!c?.getDesktopSources) return "default";
  try {
    const sources = await c.getDesktopSources();
    if (!sources?.length) return "default";
    return await useScreenPicker.getState().open(sources);
  } catch {
    return "default";
  }
}
