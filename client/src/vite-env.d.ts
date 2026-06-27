/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time default server URL (optional; overridable in-app). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build-time app version, injected by Vite's `define`. */
declare const __APP_VERSION__: string;

type UpdateState = "idle" | "none" | "available" | "downloading" | "downloaded" | "error";
interface UpdateStatus {
  state: UpdateState;
  version?: string;
  percent?: number;
}

interface DesktopSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string;
  appIcon: string | null;
}

interface ConcordBridge {
  isDesktop: boolean;
  platform: string;
  version?: string;
  versions: { electron: string; chrome: string; node: string };
  getDesktopSources?: () => Promise<DesktopSource[]>;
  setDesktopSource?: (id: string) => void;
  getUpdateStatus?: () => UpdateStatus;
  onUpdate?: (cb: (status: UpdateStatus) => void) => () => void;
  send: (channel: string, payload?: unknown) => void;
}

interface Window {
  concord?: ConcordBridge;
}
