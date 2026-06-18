/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Runtime config injected by public/config.js (loaded before the app bundle).
interface Window {
  APP_CONFIG?: { BACKEND_URL?: string };
}
