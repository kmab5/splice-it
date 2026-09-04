export interface MetadataDto {
  // Standard Tags
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  track_number?: number;
  total_tracks?: number;
  disc_number?: number;
  genre?: string;
  comment?: string;
  composer?: string;

  // Extended Tags
  isrc?: string;
  bpm?: number;
  key?: string;
  lyrics?: string;
  copyright?: string;
  publisher?: string;
  encoder?: string;

  // Cover Artwork
  cover_art_base64?: string;
  cover_art_mime?: string;
}

export interface ClipState {
  id: string;
  name: string;
  /**
   * Absolute path to the source file on disk in the desktop build. In the
   * browser fallback this is a synthetic `browser://<name>` key. Either way it
   * is the lookup key for the decoded AudioBuffer in AudioEngine, and the path
   * the Rust exporter opens.
   */
  source_path: string;
  track_index: number;
  start_time_ms: number;
  offset_ms: number;
  duration_ms: number;
  gain: number;
  fade_in_ms: number;
  fade_out_ms: number;
}

export interface TrackState {
  id: string;
  name: string;
  muted: boolean;
  solo: boolean;
  volume: number; // 0.0 - 2.0 (1.0 = unity 0dB)
  pan: number;    // -1.0 (Left) to +1.0 (Right)
  color: string;
}

export interface MasterDspSettings {
  // Parametric EQ
  eq_high_cut_hz: number;       // e.g. 12000 Hz
  eq_high_cut_gain_db: number;  // e.g. -2.5 dB
  eq_mud_scoop_hz: number;      // e.g. 300 Hz (200 - 400 Hz range)
  eq_mud_scoop_q: number;       // e.g. 1.5
  eq_mud_scoop_gain_db: number; // e.g. -3.0 dB

  // Multiband / Dynamic Compressor
  comp_threshold_db: number;    // e.g. -16 dB
  comp_ratio: number;           // e.g. 2.5 : 1
  comp_attack_ms: number;       // e.g. 25 ms
  comp_release_ms: number;      // e.g. 120 ms

  // Stereo Imaging (Mid/Side)
  stereo_width: number;         // 0.0 (mono) to 2.0 (200% wide)

  // Mastering Limiter & Loudness
  limiter_threshold_db: number; // e.g. -1.0 dB
  limiter_ceiling_db: number;   // e.g. -0.3 dB True Peak
  target_lufs: number;          // e.g. -14.0 LUFS YouTube/Streaming standard
}

export interface SourceAudioFile {
  id: string;
  name: string;
  /** Absolute path on disk, or a `browser://` key in the web fallback. */
  path: string;
  format: string; // 'WAV' | 'MP3' | 'FLAC' | 'OGG' | 'AAC'
  duration_ms: number;
  sample_rate: number;
  channels: number;
  size_bytes: number;
  /** Normalized 0..1 absolute peak envelope used to draw clip waveforms. */
  waveform_peaks?: number[];
  date_added?: string;
}

/** Mirrors the Rust `AudioFileInfo` returned by `analyze_audio_file`. */
export interface AudioFileInfo {
  path: string;
  name: string;
  format: string;
  duration_ms: number;
  sample_rate: number;
  channels: number;
  size_bytes: number;
  peaks: number[];
  metadata: MetadataDto;
}

export interface ProjectState {
  version: string;
  name: string;
  sample_rate: number;
  bpm: number;
  tracks: TrackState[];
  clips: ClipState[];
  master_dsp: MasterDspSettings;
  metadata: MetadataDto;
  audio_pool?: SourceAudioFile[];
  /**
   * Concat workspace state, saved alongside the timeline so one .sic document
   * carries both modes. The Rust exporter ignores this field.
   */
  concat?: ConcatState;
  /** App version that last wrote this document, for future migrations. */
  app_version?: string;
}

export interface WaveformPeaks {
  min_peaks: number[];
  max_peaks: number[];
  duration_ms: number;
  sample_rate: number;
  channels: number;
}

export type ExportFormat = 'wav_16' | 'wav_24' | 'wav_32f' | 'flac' | 'mp3';

export interface ExportOptions {
  export_path: string;
  format: ExportFormat;
  normalize_to_target_lufs: boolean;
  dither: boolean;
  /** MP3 constant bitrate in kbps. */
  mp3_bitrate_kbps: number;
  /** FLAC output resolution: 16 or 24. */
  flac_bit_depth: number;
}

/** File extension for a format, used for the save dialog and default filename. */
export function formatExtension(format: ExportFormat): string {
  if (format === 'flac') return 'flac';
  if (format === 'mp3') return 'mp3';
  return 'wav';
}

/** True for formats that discard resolution, where dithering is meaningful. */
export function formatUsesDither(format: ExportFormat): boolean {
  return format === 'wav_16' || format === 'wav_24' || format === 'flac';
}

/** Mirrors the Rust `ExportResult`. */
export interface ExportResult {
  path: string;
  duration_ms: number;
  measured_lufs: number;
  peak_db: number;
  sample_rate: number;
  format: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Concat mode
// ---------------------------------------------------------------------------

/** One entry in the concat list. Mirrors the Rust `ConcatItemDto`. */
export interface ConcatItem {
  id: string;
  name: string;
  source_path: string;
  /** Linear gain for this item only (1.0 = unchanged). */
  gain: number;
  /** Silence after this item, in ms. Ignored when crossfade_ms > 0. */
  gap_after_ms: number;
  /** Overlap with the next item, in ms. Zero means a hard join. */
  crossfade_ms: number;
  /** Cached source length, for the UI running total. */
  duration_ms: number;
}

/** Concat workspace state. Kept separate from the timeline so neither disturbs the other. */
export interface ConcatState {
  name: string;
  sample_rate: number;
  items: ConcatItem[];
  metadata: MetadataDto;
  /** Off by default: joining files should not silently re-master them. */
  apply_master_chain: boolean;
  /** Level each file individually so a compilation does not jump in volume. */
  match_item_loudness?: boolean;
}

/** Mirrors the Rust `ConcatRequest`. */
export interface ConcatRequest {
  name: string;
  sample_rate: number;
  items: ConcatItem[];
  metadata: MetadataDto;
  apply_master_chain: boolean;
  match_item_loudness: boolean;
  master_dsp: MasterDspSettings;
}

// ---------------------------------------------------------------------------
// Application settings (app-level, not part of a project document)
// ---------------------------------------------------------------------------

export interface AppSettings {
  autoSaveEnabled: boolean;
  /** Minutes between auto-saves. */
  autoSaveMinutes: number;
  /** Warn before closing with unsaved changes. */
  confirmOnDiscard: boolean;
  /** Default sample rate offered for new concat lists. */
  defaultSampleRate: number;
  /** Reopen the most recent project when the app starts. */
  reopenLastProject: boolean;
  /** Most recently saved or opened project paths, newest first. */
  recentProjects: string[];
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSaveEnabled: true,
  autoSaveMinutes: 5,
  confirmOnDiscard: true,
  defaultSampleRate: 44100,
  reopenLastProject: true,
  recentProjects: [],
};

/** How many entries the recent-projects list keeps. */
export const MAX_RECENT_PROJECTS = 8;
