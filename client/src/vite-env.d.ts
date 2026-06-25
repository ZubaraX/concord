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

interface ConcordBridge {
  isDesktop: boolean;
  platform: string;
  version?: string;
  versions: { electron: string; chrome: string; node: string };
  send: (channel: string, payload?: unknown) => void;
}

interface Window {
  concord?: ConcordBridge;
}
