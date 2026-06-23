/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time default server URL (optional; overridable in-app). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
