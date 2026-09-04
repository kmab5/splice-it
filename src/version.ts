// Injected by Vite from package.json (see vite.config.ts).
declare const __APP_VERSION__: string;

/**
 * The single source of truth is package.json. Keep it in step with
 * src-tauri/Cargo.toml and src-tauri/tauri.conf.json on every release.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Version stamped into saved .sic project documents. */
export const PROJECT_FORMAT_VERSION = '2.1';
