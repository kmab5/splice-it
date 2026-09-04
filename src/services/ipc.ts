import {
  AudioFileInfo,
  ConcatRequest,
  ExportOptions,
  ExportResult,
  MetadataDto,
  ProjectState,
  WaveformPeaks,
} from '../types/project';
import { renderAndExportWav } from './wavExporter';
import { audioEngine } from './audioEngine';

/** Prefix used for pool entries in the browser fallback, where there is no real path. */
export const BROWSER_PATH_PREFIX = 'browser://';

export function isBrowserPath(path: string): boolean {
  return path.startsWith(BROWSER_PATH_PREFIX);
}

/** True when running inside the Tauri v2 desktop shell. */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ---------------------------------------------------------------------------
// Native dialogs
// ---------------------------------------------------------------------------

export const AUDIO_EXTENSIONS = ['wav', 'mp3', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'aiff', 'aif'];

export const PROJECT_EXTENSIONS = ['sic', 'audioproj'];

function extensionOf(path: string): string {
  return (path.split('.').pop() || '').toLowerCase();
}

export function isAudioPath(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(extensionOf(path));
}

export function isProjectPath(path: string): boolean {
  return PROJECT_EXTENSIONS.includes(extensionOf(path));
}

/**
 * Native multi-select audio picker. Returns absolute paths, or null when the
 * shell is unavailable so callers can fall back to an <input type="file">.
 */
export async function pickAudioFiles(): Promise<string[] | null> {
  if (!isTauri()) return null;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: true,
    directory: false,
    title: 'Import source audio',
    filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
  });

  if (selected === null) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickProjectFile(): Promise<string | null> {
  if (!isTauri()) return null;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    multiple: false,
    directory: false,
    title: 'Open Splice It project',
    filters: [{ name: 'Splice It Project', extensions: ['sic', 'audioproj', 'json'] }],
  });

  return typeof selected === 'string' ? selected : null;
}

export async function pickSavePath(
  defaultName: string,
  extensions: string[],
  title: string
): Promise<string | null> {
  if (!isTauri()) return null;

  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({
    title,
    defaultPath: defaultName,
    filters: [{ name: extensions[0].toUpperCase(), extensions }],
  });

  return path ?? null;
}

// ---------------------------------------------------------------------------
// Source audio
// ---------------------------------------------------------------------------

/**
 * Decode a source file once in Rust and return duration, stream properties,
 * a peak envelope, and any embedded tags.
 */
export async function analyzeAudioFile(
  path: string,
  peakBuckets = 1200
): Promise<AudioFileInfo> {
  return invokeCmd<AudioFileInfo>('analyze_audio_file', { path, peakBuckets });
}

/** Raw bytes of a source file, for decoding with Web Audio for preview playback. */
export async function readAudioFileBytes(path: string): Promise<ArrayBuffer> {
  const result = await invokeCmd<ArrayBuffer | number[]>('read_audio_file_bytes', { path });
  // Tauri returns raw responses as an ArrayBuffer; older shells may hand back an array.
  if (result instanceof ArrayBuffer) return result;
  return new Uint8Array(result).buffer;
}

export async function generateWaveformPeaks(
  path: string,
  samplesPerPixel = 256
): Promise<WaveformPeaks> {
  return invokeCmd<WaveformPeaks>('generate_waveform_peaks', { path, samplesPerPixel });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function loadAudioMetadata(path: string): Promise<MetadataDto> {
  if (!isTauri() || isBrowserPath(path)) return {};
  try {
    return await invokeCmd<MetadataDto>('load_audio_metadata', { path });
  } catch (e) {
    // Untagged files are normal, not an error worth surfacing.
    console.warn('No readable tags on', path, e);
    return {};
  }
}

export async function saveAudioMetadata(path: string, metadata: MetadataDto): Promise<void> {
  if (!isTauri() || isBrowserPath(path)) {
    throw new Error('Writing tags to disk requires the desktop app.');
  }
  await invokeCmd<void>('save_audio_metadata', { path, metadata });
}

// ---------------------------------------------------------------------------
// Project files
// ---------------------------------------------------------------------------

export async function readTextFile(path: string): Promise<string> {
  return invokeCmd<string>('read_text_file', { path });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  return invokeCmd<void>('write_text_file', { path, contents });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Join an ordered list of files into one output. Desktop only. */
export async function exportConcat(
  request: ConcatRequest,
  options: ExportOptions
): Promise<{ success: boolean; message: string; result?: ExportResult }> {
  if (!isTauri()) {
    return {
      success: false,
      message: 'Concat export needs the desktop app, since it reads files from disk.',
    };
  }
  try {
    const result = await invokeCmd<ExportResult>('export_concat', { request, options });
    return { success: true, message: result.message, result };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Render the timeline mixdown. In the desktop shell this hands off to the Rust
 * engine, which decodes every source and writes the file to `options.export_path`.
 * In the browser it renders with Web Audio and triggers a download instead.
 */
export async function exportProject(
  project: ProjectState,
  options: ExportOptions
): Promise<{ success: boolean; message: string; result?: ExportResult }> {
  if (isTauri()) {
    try {
      const result = await invokeCmd<ExportResult>('export_project', { project, options });
      return { success: true, message: result.message, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A backend failure is a real failure. Silently falling back to the
      // browser renderer is what previously made a broken export look fine.
      return { success: false, message: msg };
    }
  }

  try {
    const rendered = await renderAndExportWav(project, audioEngine.sourceBuffers, options);
    const a = document.createElement('a');
    a.href = rendered.url;
    a.download = `${project.name.replace(/\s+/g, '_')}_Master.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(rendered.url), 30000);

    return {
      success: true,
      message: `Downloaded mixdown (${rendered.lufs.toFixed(1)} LUFS). Tags are not embedded in browser mode.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
