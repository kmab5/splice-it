import { AppSettings, DEFAULT_APP_SETTINGS } from '../types/project';

const STORAGE_KEY = 'splice-it.settings.v1';

/**
 * App settings persist locally rather than in the project document, since they
 * describe how the app behaves rather than what a project contains.
 */
export function loadSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings simply do not persist this session.
  }
}
