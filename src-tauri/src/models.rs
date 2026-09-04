use serde::{Deserialize, Serialize};

/// Audio metadata transfer object covering standard and extended ID3/FLAC/Vorbis tags.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetadataDto {
    // Standard Tags
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<u32>,
    pub total_tracks: Option<u32>,
    pub disc_number: Option<u32>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub composer: Option<String>,

    // Extended Tags
    pub isrc: Option<String>,
    pub bpm: Option<f64>,
    pub key: Option<String>,
    pub lyrics: Option<String>,
    pub copyright: Option<String>,
    pub publisher: Option<String>,
    pub encoder: Option<String>,

    // Attached Artwork
    pub cover_art_base64: Option<String>,
    pub cover_art_mime: Option<String>,
}

/// A non-destructive audio clip placed on a timeline track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipState {
    pub id: String,
    pub name: String,
    pub source_path: String,
    pub track_index: usize,
    pub start_time_ms: f64,
    pub offset_ms: f64,
    pub duration_ms: f64,
    pub gain: f32,
    pub fade_in_ms: f64,
    pub fade_out_ms: f64,
}

/// Track configuration state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackState {
    pub id: String,
    pub name: String,
    pub muted: bool,
    pub solo: bool,
    pub volume: f32, // Linear gain 0.0 - 2.0 (1.0 = 0dB)
    pub pan: f32,    // -1.0 (Left) to +1.0 (Right)
    pub color: String,
}

/// Master DSP settings for EQ, Dynamics, Stereo Imaging, and True-Peak Limiter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MasterDspSettings {
    pub eq_high_cut_hz: f32,       // Target harsh high frequencies (default 12000.0)
    pub eq_high_cut_gain_db: f32,  // Attenuation e.g. -3.0 dB
    pub eq_mud_scoop_hz: f32,      // Mud scoop center frequency (200 - 400 Hz)
    pub eq_mud_scoop_q: f32,       // Q factor e.g. 1.414
    pub eq_mud_scoop_gain_db: f32, // Scoop gain e.g. -2.5 dB
    pub comp_threshold_db: f32,    // -18.0 dB
    pub comp_ratio: f32,           // 3.0:1
    pub comp_attack_ms: f32,       // 20.0 ms
    pub comp_release_ms: f32,      // 100.0 ms
    pub stereo_width: f32,         // 0.0 (Mono) to 2.0 (200% exaggerated stereo)
    pub limiter_threshold_db: f32, // -1.0 dB
    pub limiter_ceiling_db: f32,   // -0.3 dB True Peak
    pub target_lufs: f32,          // -14.0 LUFS streaming standard
}

impl Default for MasterDspSettings {
    fn default() -> Self {
        Self {
            eq_high_cut_hz: 12000.0,
            eq_high_cut_gain_db: -2.5,
            eq_mud_scoop_hz: 300.0,
            eq_mud_scoop_q: 1.5,
            eq_mud_scoop_gain_db: -3.0,
            comp_threshold_db: -16.0,
            comp_ratio: 2.5,
            comp_attack_ms: 25.0,
            comp_release_ms: 120.0,
            stereo_width: 1.15,
            limiter_threshold_db: -1.0,
            limiter_ceiling_db: -0.3,
            target_lufs: -14.0,
        }
    }
}

/// Project document (.sic / .audioproj) representing the full workspace state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub version: String,
    pub name: String,
    pub sample_rate: u32,
    pub bpm: f64,
    pub tracks: Vec<TrackState>,
    pub clips: Vec<ClipState>,
    pub master_dsp: MasterDspSettings,
    pub metadata: MetadataDto,
}

/// Downsampled audio waveform peaks for instant timeline rendering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformPeaks {
    pub min_peaks: Vec<f32>,
    pub max_peaks: Vec<f32>,
    pub duration_ms: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Options for mixdown export.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub export_path: String,
    pub format: String, // "wav_24", "wav_32f", "flac", "mp3"
    pub normalize_to_target_lufs: bool,
    pub dither: bool,
}
