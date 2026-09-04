use serde::{Deserialize, Deserializer, Serialize};

/// Lenient deserializer for optional unsigned tag fields.
///
/// Tag values like year and track number arrive from free-text UI inputs and
/// from whatever a third-party encoder wrote into a file. A nonsensical value
/// should drop the tag, not abort an entire export with a deserialization
/// error, so anything negative, fractional, non-finite, or out of range
/// becomes `None`.
fn lenient_opt_u32<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = Option::<f64>::deserialize(deserializer)?;
    Ok(raw.and_then(|n| {
        if n.is_finite() && n >= 0.0 && n <= u32::MAX as f64 {
            Some(n as u32)
        } else {
            None
        }
    }))
}

/// Audio metadata transfer object covering standard and extended ID3/FLAC/Vorbis tags.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MetadataDto {
    // Standard Tags
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    #[serde(default, deserialize_with = "lenient_opt_u32")]
    pub year: Option<u32>,
    #[serde(default, deserialize_with = "lenient_opt_u32")]
    pub track_number: Option<u32>,
    #[serde(default, deserialize_with = "lenient_opt_u32")]
    pub total_tracks: Option<u32>,
    #[serde(default, deserialize_with = "lenient_opt_u32")]
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
///
/// `source_path` is an absolute path on disk. The export engine decodes that file
/// and reads `duration_ms` worth of audio starting at `offset_ms` into the source.
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
    pub eq_high_cut_hz: f32,
    pub eq_high_cut_gain_db: f32,
    pub eq_mud_scoop_hz: f32,
    pub eq_mud_scoop_q: f32,
    pub eq_mud_scoop_gain_db: f32,
    pub comp_threshold_db: f32,
    pub comp_ratio: f32,
    pub comp_attack_ms: f32,
    pub comp_release_ms: f32,
    pub stereo_width: f32,
    pub limiter_threshold_db: f32,
    pub limiter_ceiling_db: f32,
    pub target_lufs: f32,
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

/// Everything the UI needs to register a source file in the audio pool,
/// gathered in a single decode pass.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioFileInfo {
    pub path: String,
    pub name: String,
    pub format: String,
    pub duration_ms: f64,
    pub sample_rate: u32,
    pub channels: u16,
    pub size_bytes: u64,
    /// Normalized 0.0 - 1.0 absolute peak envelope for waveform drawing.
    pub peaks: Vec<f32>,
    /// Tags already embedded in the source file, if any.
    pub metadata: MetadataDto,
}

/// Options for mixdown export. Only WAV targets are supported at this stage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub export_path: String,
    /// "wav_16" | "wav_24" | "wav_32f"
    pub format: String,
    pub normalize_to_target_lufs: bool,
    pub dither: bool,
}

/// Result of a completed mixdown render.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub path: String,
    pub duration_ms: f64,
    pub measured_lufs: f32,
    pub peak_db: f32,
    pub sample_rate: u32,
    pub format: String,
    pub message: String,
}

/// Fully decoded stereo audio held in memory during a render.
pub struct DecodedAudio {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

impl DecodedAudio {
    pub fn frames(&self) -> usize {
        self.left.len()
    }

    pub fn duration_ms(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        (self.frames() as f64 / self.sample_rate as f64) * 1000.0
    }
}

// ---------------------------------------------------------------------------
// Concat mode
// ---------------------------------------------------------------------------

/// One entry in a concatenation list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConcatItemDto {
    pub id: String,
    pub name: String,
    pub source_path: String,
    /// Linear gain applied to this item only (1.0 = unchanged).
    pub gain: f32,
    /// Silence inserted after this item. Ignored when `crossfade_ms` > 0.
    pub gap_after_ms: f64,
    /// Overlap with the following item. Zero means a hard butt join.
    pub crossfade_ms: f64,
}

/// A full concat job: the ordered list plus output settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConcatRequest {
    pub name: String,
    pub sample_rate: u32,
    pub items: Vec<ConcatItemDto>,
    pub metadata: MetadataDto,
    /// Off by default. Joining files should not silently re-master them.
    pub apply_master_chain: bool,
    #[serde(default)]
    pub master_dsp: MasterDspSettings,
}
