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
  source_path: string;
  track_index: number;
  start_time_ms: number;
  offset_ms: number;
  duration_ms: number;
  gain: number;
  fade_in_ms: number;
  fade_out_ms: number;
  peaks?: number[]; // Normalized peaks for fast rendering
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
  format: string; // 'WAV' | 'MP3' | 'FLAC' | 'OGG' | 'AAC'
  duration_ms: number;
  sample_rate: number;
  channels: number;
  size_bytes: number;
  data_url?: string;
  waveform_peaks?: number[];
  date_added?: string;
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
}

export interface WaveformPeaks {
  min_peaks: number[];
  max_peaks: number[];
  duration_ms: number;
  sample_rate: number;
  channels: number;
}

export interface ExportOptions {
  export_path: string;
  format: 'wav_24' | 'wav_32f' | 'flac' | 'mp3';
  normalize_to_target_lufs: boolean;
  dither: boolean;
}
