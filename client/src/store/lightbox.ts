import { create } from "zustand";

// Global image viewer (lightbox) state. Any image in the app can open here
// instead of launching the external browser.
interface LightboxState {
  src: string | null;
  alt: string;
  open: (src: string, alt?: string) => void;
  close: () => void;
}

export const useLightbox = create<LightboxState>((set) => ({
  src: null,
  alt: "",
  open: (src, alt = "") => set({ src, alt }),
  close: () => set({ src: null, alt: "" }),
}));
