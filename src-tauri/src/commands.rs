use std::collections::HashMap;
use std::fs::File;
use std::path::Path;

use base64::Engine;
use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::tag::{Accessor, ItemKey, Tag};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::dsp::MasterDspChain;
use crate::models::{
    AudioFileInfo, ConcatRequest, DecodedAudio, ExportOptions, ExportResult, MetadataDto,
    ProjectState, WaveformPeaks,
};

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/// Decode any Symphonia-supported container to de-interleaved stereo f32.
/// Mono sources are duplicated to both channels; sources with more than two
/// channels keep only the first two.
fn decode_file(path: &str) -> Result<DecodedAudio, String> {
    let file = File::open(path).map_err(|e| format!("Cannot open '{}': {}", path, e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Giving Symphonia the file extension greatly improves probe reliability.
    let mut hint = Hint::new();
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &MetadataOptions::default())
        .map_err(|e| format!("Unsupported or corrupt audio '{}': {}", path, e))?;

    let mut format = probed.format;

    let track = format
        .default_track()
        .ok_or_else(|| format!("No decodable audio track in '{}'", path))?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Decoder init failed for '{}': {}", path, e))?;

    let mut left: Vec<f32> = Vec::new();
    let mut right: Vec<f32> = Vec::new();
    let mut sample_buf: Option<SampleBuffer<f32>> = None;
    let mut buf_capacity: u64 = 0;
    let mut channels: u16 = 2;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            // End of stream, or a truncated file: keep whatever decoded cleanly.
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::ResetRequired) => break,
            Err(e) => return Err(format!("Read error in '{}': {}", path, e)),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let ch = spec.channels.count().max(1);
                channels = ch as u16;

                // Packet sizes can grow mid-stream, so the scratch buffer is
                // re-allocated whenever a larger frame arrives.
                let needed = decoded.capacity() as u64;
                if sample_buf.is_none() || needed > buf_capacity {
                    sample_buf = Some(SampleBuffer::<f32>::new(needed, spec));
                    buf_capacity = needed;
                }

                if let Some(buf) = sample_buf.as_mut() {
                    buf.copy_interleaved_ref(decoded);
                    let samples = buf.samples();
                    let frames = samples.len() / ch;

                    left.reserve(frames);
                    right.reserve(frames);

                    for f in 0..frames {
                        let l = samples[f * ch];
                        let r = if ch > 1 { samples[f * ch + 1] } else { l };
                        left.push(l);
                        right.push(r);
                    }
                }
            }
            // A single bad frame should not abort a whole render.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::IoError(_)) => break,
            Err(e) => return Err(format!("Decode error in '{}': {}", path, e)),
        }
    }

    if left.is_empty() {
        return Err(format!("Decoded zero audio frames from '{}'", path));
    }

    Ok(DecodedAudio {
        left,
        right,
        sample_rate,
        channels,
    })
}

/// Linear-interpolating resampler. Adequate for matching stems to the project
/// rate; a windowed-sinc stage can replace this later without changing callers.
fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() {
        return input.to_vec();
    }

    let ratio = to_rate as f64 / from_rate as f64;
    let out_len = ((input.len() as f64) * ratio).round().max(1.0) as usize;
    let mut out = Vec::with_capacity(out_len);

    for i in 0..out_len {
        let src_pos = i as f64 / ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;

        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac);
    }

    out
}

fn conform_to_rate(audio: DecodedAudio, target_rate: u32) -> DecodedAudio {
    if audio.sample_rate == target_rate {
        return audio;
    }
    let left = resample_linear(&audio.left, audio.sample_rate, target_rate);
    let right = resample_linear(&audio.right, audio.sample_rate, target_rate);
    DecodedAudio {
        left,
        right,
        sample_rate: target_rate,
        channels: audio.channels,
    }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

fn read_tags(path: &str) -> MetadataDto {
    let file_path = Path::new(path);
    let tagged_file = match lofty::read_from_path(file_path) {
        Ok(t) => t,
        Err(_) => return MetadataDto::default(),
    };

    let tag = match tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
        Some(t) => t,
        None => return MetadataDto::default(),
    };

    let mut dto = MetadataDto {
        title: tag.title().map(|s| s.to_string()),
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        year: tag.year(),
        track_number: tag.track(),
        total_tracks: tag.track_total(),
        disc_number: tag.disk(),
        genre: tag.genre().map(|s| s.to_string()),
        comment: tag.comment().map(|s| s.to_string()),
        composer: tag.get_string(&ItemKey::Composer).map(|s| s.to_string()),
        isrc: tag.get_string(&ItemKey::Isrc).map(|s| s.to_string()),
        bpm: tag
            .get_string(&ItemKey::Bpm)
            .and_then(|s| s.parse::<f64>().ok()),
        key: tag.get_string(&ItemKey::InitialKey).map(|s| s.to_string()),
        lyrics: tag.get_string(&ItemKey::Lyrics).map(|s| s.to_string()),
        copyright: tag
            .get_string(&ItemKey::CopyrightMessage)
            .map(|s| s.to_string()),
        publisher: tag.get_string(&ItemKey::Publisher).map(|s| s.to_string()),
        encoder: tag.get_string(&ItemKey::EncodedBy).map(|s| s.to_string()),
        cover_art_base64: None,
        cover_art_mime: None,
    };

    if let Some(pic) = tag.pictures().first() {
        let mime = match pic.mime_type() {
            Some(MimeType::Png) => "image/png",
            Some(MimeType::Jpeg) => "image/jpeg",
            _ => "image/jpeg",
        };
        dto.cover_art_base64 =
            Some(base64::engine::general_purpose::STANDARD.encode(pic.data()));
        dto.cover_art_mime = Some(mime.to_string());
    }

    dto
}

fn write_tags(path: &str, metadata: &MetadataDto) -> Result<(), String> {
    let file_path = Path::new(path);

    let mut tagged_file = lofty::read_from_path(file_path)
        .map_err(|e| format!("Failed to read '{}' for tagging: {}", path, e))?;

    let tag_type = tagged_file.primary_tag_type();
    if tagged_file.tag_mut(tag_type).is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged_file
        .tag_mut(tag_type)
        .ok_or_else(|| "Could not create a tag container".to_string())?;

    // Standard Tags
    if let Some(ref v) = metadata.title {
        tag.set_title(v.clone());
    }
    if let Some(ref v) = metadata.artist {
        tag.set_artist(v.clone());
    }
    if let Some(ref v) = metadata.album {
        tag.set_album(v.clone());
    }
    if let Some(v) = metadata.year {
        tag.set_year(v);
    }
    if let Some(v) = metadata.track_number {
        tag.set_track(v);
    }
    if let Some(v) = metadata.total_tracks {
        tag.set_track_total(v);
    }
    if let Some(v) = metadata.disc_number {
        tag.set_disk(v);
    }
    if let Some(ref v) = metadata.genre {
        tag.set_genre(v.clone());
    }
    if let Some(ref v) = metadata.comment {
        tag.set_comment(v.clone());
    }
    if let Some(ref v) = metadata.composer {
        tag.insert_text(ItemKey::Composer, v.clone());
    }

    // Extended Tags
    if let Some(ref v) = metadata.isrc {
        tag.insert_text(ItemKey::Isrc, v.clone());
    }
    if let Some(v) = metadata.bpm {
        tag.insert_text(ItemKey::Bpm, v.to_string());
    }
    if let Some(ref v) = metadata.key {
        tag.insert_text(ItemKey::InitialKey, v.clone());
    }
    if let Some(ref v) = metadata.lyrics {
        tag.insert_text(ItemKey::Lyrics, v.clone());
    }
    if let Some(ref v) = metadata.copyright {
        tag.insert_text(ItemKey::CopyrightMessage, v.clone());
    }
    if let Some(ref v) = metadata.publisher {
        tag.insert_text(ItemKey::Publisher, v.clone());
    }
    if let Some(ref v) = metadata.encoder {
        tag.insert_text(ItemKey::EncodedBy, v.clone());
    }

    // Cover Artwork
    if let Some(ref b64) = metadata.cover_art_base64 {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
            let mime = match metadata.cover_art_mime.as_deref() {
                Some("image/png") => MimeType::Png,
                _ => MimeType::Jpeg,
            };
            let pic = Picture::new_unchecked(PictureType::CoverFront, Some(mime), None, bytes);
            tag.set_picture(0, pic);
        }
    }

    tagged_file
        .save_to_path(file_path, WriteOptions::default())
        .map_err(|e| format!("Failed to write tags to '{}': {}", path, e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Dither
// ---------------------------------------------------------------------------

/// Fast xorshift PRNG returning a uniform value in [-0.5, 0.5].
fn xorshift_unit(state: &mut u32) -> f32 {
    *state ^= *state << 13;
    *state ^= *state >> 17;
    *state ^= *state << 5;
    (*state as f32 / u32::MAX as f32) - 0.5
}

/// Triangular PDF dither: the sum of two uniform values, scaled to one LSB.
fn tpdf_noise(state: &mut u32, lsb: f32) -> f32 {
    (xorshift_unit(state) + xorshift_unit(state)) * lsb
}

// ---------------------------------------------------------------------------
// WAV output
// ---------------------------------------------------------------------------

/// Write interleaved stereo f32 to disk in one of the supported WAV formats.
fn write_wav_file(
    path: &str,
    interleaved: &[f32],
    sample_rate: u32,
    format: &str,
    dither: bool,
) -> Result<(), String> {
    let spec = match format {
        "wav_16" => hound::WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
        "wav_32f" => hound::WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
        "wav_24" => hound::WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 24,
            sample_format: hound::SampleFormat::Int,
        },
        other => {
            return Err(format!(
                "Export format '{}' is not supported yet. Choose a WAV format.",
                other
            ))
        }
    };

    if let Some(parent) = Path::new(path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create export folder: {}", e))?;
    }

    let mut writer = hound::WavWriter::create(path, spec)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;

    let mut rng_state: u32 = 0x2545_F491;

    match format {
        "wav_32f" => {
            for s in interleaved {
                writer
                    .write_sample(*s)
                    .map_err(|e| format!("WAV write error: {}", e))?;
            }
        }
        "wav_16" => {
            let lsb = 1.0 / 32767.0;
            for s in interleaved {
                let v = if dither { *s + tpdf_noise(&mut rng_state, lsb) } else { *s };
                writer
                    .write_sample((v.clamp(-1.0, 1.0) * 32767.0).round() as i16)
                    .map_err(|e| format!("WAV write error: {}", e))?;
            }
        }
        _ => {
            let lsb = 1.0 / 8_388_607.0;
            for s in interleaved {
                let v = if dither { *s + tpdf_noise(&mut rng_state, lsb) } else { *s };
                writer
                    .write_sample((v.clamp(-1.0, 1.0) * 8_388_607.0).round() as i32)
                    .map_err(|e| format!("WAV write error: {}", e))?;
            }
        }
    }

    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {}", e))
}

fn peak_of(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0_f32, |acc, s| acc.max(s.abs()))
}

fn peak_to_db(peak: f32) -> f32 {
    if peak > 1e-6 {
        20.0 * peak.log10()
    } else {
        -100.0
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn load_audio_metadata(path: String) -> Result<MetadataDto, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }
    tokio::task::spawn_blocking(move || Ok(read_tags(&path)))
        .await
        .map_err(|e| format!("Task join failure: {}", e))?
}

#[tauri::command]
pub async fn save_audio_metadata(path: String, metadata: MetadataDto) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Err(format!("Audio file does not exist: {}", path));
    }
    tokio::task::spawn_blocking(move || write_tags(&path, &metadata))
        .await
        .map_err(|e| format!("Task join failure: {}", e))?
}

/// Decode a file once and return everything the audio pool needs: duration,
/// stream properties, an absolute-value peak envelope, and embedded tags.
/// Decode a file and return everything the audio pool needs.
///
/// `samples_per_peak` fixes the envelope resolution per unit of *time* rather
/// than per file, so a ten-minute file gets proportionally more detail than a
/// ten-second one and stays sharp when zoomed in. 256 samples per peak is about
/// 172 buckets per second at 44.1 kHz.
#[tauri::command]
pub async fn analyze_audio_file(
    path: String,
    samples_per_peak: u32,
) -> Result<AudioFileInfo, String> {
    tokio::task::spawn_blocking(move || {
        let file_path = Path::new(&path);
        if !file_path.exists() {
            return Err(format!("File not found: {}", path));
        }

        let size_bytes = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
        let name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("untitled")
            .to_string();
        let format = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("WAV")
            .to_uppercase();

        let audio = decode_file(&path)?;
        let frames = audio.frames();

        // Bounded so a very long file cannot allocate without limit.
        const MAX_BUCKETS: usize = 400_000;
        let per_bucket = {
            let requested = samples_per_peak.clamp(32, 65_536) as usize;
            let minimum = (frames / MAX_BUCKETS).max(1);
            requested.max(minimum)
        };

        let mut peaks: Vec<f32> = Vec::with_capacity(frames / per_bucket + 1);
        let mut idx = 0usize;
        while idx < frames {
            let end = (idx + per_bucket).min(frames);
            let mut peak = 0.0_f32;
            for f in idx..end {
                let mono = 0.5 * (audio.left[f] + audio.right[f]);
                let a = mono.abs();
                if a > peak {
                    peak = a;
                }
            }
            peaks.push(peak.min(1.0));
            idx = end;
        }

        Ok(AudioFileInfo {
            path: path.clone(),
            name,
            format,
            duration_ms: audio.duration_ms(),
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            size_bytes,
            peaks,
            metadata: read_tags(&path),
        })
    })
    .await
    .map_err(|e| format!("Task join failure: {}", e))?
}

/// Min/max peak pairs, kept for callers that need a symmetric envelope.
#[tauri::command]
pub async fn generate_waveform_peaks(
    path: String,
    samples_per_pixel: u32,
) -> Result<WaveformPeaks, String> {
    tokio::task::spawn_blocking(move || {
        let audio = decode_file(&path)?;
        let spp = samples_per_pixel.max(64) as usize;
        let frames = audio.frames();

        let mut min_peaks = Vec::with_capacity(frames / spp + 1);
        let mut max_peaks = Vec::with_capacity(frames / spp + 1);

        let mut idx = 0usize;
        while idx < frames {
            let end = (idx + spp).min(frames);
            let mut lo = 1.0_f32;
            let mut hi = -1.0_f32;
            for f in idx..end {
                let mono = 0.5 * (audio.left[f] + audio.right[f]);
                if mono < lo {
                    lo = mono;
                }
                if mono > hi {
                    hi = mono;
                }
            }
            min_peaks.push(lo);
            max_peaks.push(hi);
            idx = end;
        }

        Ok(WaveformPeaks {
            duration_ms: audio.duration_ms(),
            sample_rate: audio.sample_rate,
            channels: audio.channels,
            min_peaks,
            max_peaks,
        })
    })
    .await
    .map_err(|e| format!("Task join failure: {}", e))?
}

/// Stream raw file bytes to the webview as binary so the frontend can decode
/// them with Web Audio for preview playback.
#[tauri::command]
pub async fn read_audio_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = tokio::task::spawn_blocking(move || {
        std::fs::read(&path).map_err(|e| format!("Cannot read '{}': {}", path, e))
    })
    .await
    .map_err(|e| format!("Task join failure: {}", e))??;

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read '{}': {}", path, e))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create folder for '{}': {}", path, e))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("Cannot write '{}': {}", path, e))
}

/// Composite every clip from its real source audio, run the master DSP chain,
/// and write a WAV mixdown with the project's metadata embedded.
#[tauri::command]
pub async fn export_project(
    project: ProjectState,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    tokio::task::spawn_blocking(move || {
        let sample_rate = if project.sample_rate >= 8000 {
            project.sample_rate
        } else {
            44100
        };

        if project.clips.is_empty() {
            return Err("Nothing to export: the timeline has no clips.".to_string());
        }

        // 1. Decode each distinct source exactly once, conformed to the project rate.
        let mut cache: HashMap<String, DecodedAudio> = HashMap::new();
        for clip in &project.clips {
            if cache.contains_key(&clip.source_path) {
                continue;
            }
            if !Path::new(&clip.source_path).exists() {
                return Err(format!(
                    "Missing source file for clip '{}': {}",
                    clip.name, clip.source_path
                ));
            }
            let decoded = conform_to_rate(decode_file(&clip.source_path)?, sample_rate);
            cache.insert(clip.source_path.clone(), decoded);
        }

        // 2. Size the mix buffer from the last clip end, plus a short tail.
        let mut total_duration_ms: f64 = 0.0;
        for clip in &project.clips {
            let end_ms = clip.start_time_ms + clip.duration_ms;
            if end_ms > total_duration_ms {
                total_duration_ms = end_ms;
            }
        }
        if total_duration_ms <= 0.0 {
            return Err("Project timeline duration is zero.".to_string());
        }
        total_duration_ms += 250.0;

        let total_frames = ((total_duration_ms * 0.001) * sample_rate as f64).ceil() as usize;
        let mut mix_l = vec![0.0_f32; total_frames];
        let mut mix_r = vec![0.0_f32; total_frames];

        let has_solo = project.tracks.iter().any(|t| t.solo);

        // 3. Sum every clip into the mix bus.
        for clip in &project.clips {
            let track = project.tracks.get(clip.track_index);
            let (muted, solo, track_vol, track_pan) = match track {
                Some(t) => (t.muted, t.solo, t.volume, t.pan),
                None => (false, false, 1.0, 0.0),
            };

            if muted || (has_solo && !solo) {
                continue;
            }

            let source = match cache.get(&clip.source_path) {
                Some(s) => s,
                None => continue,
            };
            let src_frames = source.frames();

            let start_frame = ((clip.start_time_ms * 0.001) * sample_rate as f64).round() as usize;
            let offset_frame = ((clip.offset_ms * 0.001) * sample_rate as f64).round() as usize;
            let duration_frames =
                ((clip.duration_ms * 0.001) * sample_rate as f64).round() as usize;
            let fade_in_frames = ((clip.fade_in_ms * 0.001) * sample_rate as f64).round() as usize;
            let fade_out_frames =
                ((clip.fade_out_ms * 0.001) * sample_rate as f64).round() as usize;

            // Equal-power pan keeps a centred track at unity perceived loudness.
            let pan = track_pan.clamp(-1.0, 1.0);
            let angle = (pan + 1.0) * (std::f32::consts::FRAC_PI_4);
            let pan_l = angle.cos();
            let pan_r = angle.sin();

            let gain = clip.gain * track_vol;

            for f in 0..duration_frames {
                let target_idx = start_frame + f;
                if target_idx >= total_frames {
                    break;
                }
                let src_idx = offset_frame + f;
                // Past the end of the source the clip is silent; it does not loop.
                if src_idx >= src_frames {
                    break;
                }

                let mut fade = 1.0_f32;
                if fade_in_frames > 0 && f < fade_in_frames {
                    let p = f as f32 / fade_in_frames as f32;
                    fade *= (p * std::f32::consts::FRAC_PI_2).sin();
                }
                if fade_out_frames > 0 && duration_frames > f && f >= duration_frames.saturating_sub(fade_out_frames) {
                    let p = (duration_frames - f) as f32 / fade_out_frames as f32;
                    fade *= (p.clamp(0.0, 1.0) * std::f32::consts::FRAC_PI_2).sin();
                }

                let amp = gain * fade;
                mix_l[target_idx] += source.left[src_idx] * amp * pan_l;
                mix_r[target_idx] += source.right[src_idx] * amp * pan_r;
            }
        }

        // 4. Interleave and run the master chain.
        let mut interleaved = Vec::with_capacity(total_frames * 2);
        for i in 0..total_frames {
            interleaved.push(mix_l[i]);
            interleaved.push(mix_r[i]);
        }

        let mut dsp_chain = MasterDspChain::new(sample_rate as f32, &project.master_dsp);
        dsp_chain.process_interleaved(&mut interleaved);

        // 5. Optional loudness match to the project target.
        let measured_lufs = dsp_chain.get_lufs();
        if options.normalize_to_target_lufs && measured_lufs > -60.0 {
            let diff = project.master_dsp.target_lufs - measured_lufs;
            let norm_gain = 10.0_f32.powf(diff.clamp(-12.0, 12.0) / 20.0);
            let ceiling = 10.0_f32.powf(project.master_dsp.limiter_ceiling_db / 20.0);
            for s in interleaved.iter_mut() {
                *s = (*s * norm_gain).clamp(-ceiling, ceiling);
            }
        }

        let peak = peak_of(&interleaved);
        let peak_db = peak_to_db(peak);

        // 6. Write the WAV.
        write_wav_file(
            &options.export_path,
            &interleaved,
            sample_rate,
            &options.format,
            options.dither,
        )?;

        // 7. Embed the project's metadata into the finished file.
        // A tagging failure should not discard a good render, so it is reported
        // in the message rather than returned as an error.
        let tag_note = match write_tags(&options.export_path, &project.metadata) {
            Ok(()) => String::new(),
            Err(e) => format!(" (metadata could not be embedded: {})", e),
        };

        Ok(ExportResult {
            path: options.export_path.clone(),
            duration_ms: total_duration_ms,
            measured_lufs,
            peak_db,
            sample_rate,
            format: options.format.clone(),
            message: format!(
                "Exported {:.1}s mixdown at {} kHz{}",
                total_duration_ms / 1000.0,
                sample_rate as f64 / 1000.0,
                tag_note
            ),
        })
    })
    .await
    .map_err(|e| format!("Export task failure: {}", e))?
}

/// Decode an ordered list of files and write them end to end as one file.
///
/// This is deliberately not the timeline exporter: there are no tracks, no
/// panning, and the mastering chain is opt-in. With unity gain, no crossfade
/// and the chain off, the output is the input audio placed back to back.
#[tauri::command]
pub async fn export_concat(
    request: ConcatRequest,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    tokio::task::spawn_blocking(move || {
        let sample_rate = if request.sample_rate >= 8000 {
            request.sample_rate
        } else {
            44100
        };

        if request.items.is_empty() {
            return Err("Nothing to export: the concat list is empty.".to_string());
        }

        // 1. Decode every distinct source once, conformed to the output rate.
        let mut cache: HashMap<String, DecodedAudio> = HashMap::new();
        for item in &request.items {
            if cache.contains_key(&item.source_path) {
                continue;
            }
            if !Path::new(&item.source_path).exists() {
                return Err(format!(
                    "Missing file for '{}': {}",
                    item.name, item.source_path
                ));
            }
            let decoded = conform_to_rate(decode_file(&item.source_path)?, sample_rate);
            cache.insert(item.source_path.clone(), decoded);
        }

        let ms_to_frames = |ms: f64| ((ms.max(0.0) * 0.001) * sample_rate as f64).round() as usize;

        // 2. Lay out the sequence: start frame and crossfade length per item.
        //    A crossfade overlaps this item with the next, so it also pulls the
        //    next start earlier. A gap only applies where there is no crossfade.
        let count = request.items.len();
        let mut starts: Vec<usize> = Vec::with_capacity(count);
        let mut fade_out: Vec<usize> = vec![0; count];
        let mut cursor = 0usize;

        for (i, item) in request.items.iter().enumerate() {
            let len = cache
                .get(&item.source_path)
                .map(|a| a.frames())
                .unwrap_or(0);
            starts.push(cursor);

            let is_last = i + 1 == count;
            let mut xfade = if is_last { 0 } else { ms_to_frames(item.crossfade_ms) };

            // A crossfade cannot be longer than either neighbour.
            if xfade > 0 {
                let next_len = request
                    .items
                    .get(i + 1)
                    .and_then(|n| cache.get(&n.source_path))
                    .map(|a| a.frames())
                    .unwrap_or(0);
                xfade = xfade.min(len).min(next_len);
            }
            fade_out[i] = xfade;

            let gap = if xfade > 0 { 0 } else { ms_to_frames(item.gap_after_ms) };
            cursor = cursor + len.saturating_sub(xfade) + gap;
        }

        let total_frames = starts
            .iter()
            .enumerate()
            .map(|(i, start)| {
                start
                    + cache
                        .get(&request.items[i].source_path)
                        .map(|a| a.frames())
                        .unwrap_or(0)
            })
            .max()
            .unwrap_or(0);

        if total_frames == 0 {
            return Err("Concat output would be empty.".to_string());
        }

        let mut mix_l = vec![0.0_f32; total_frames];
        let mut mix_r = vec![0.0_f32; total_frames];

        // 3. Write each item into place, with equal-power crossfades so the
        //    overlap holds a constant perceived level.
        for (i, item) in request.items.iter().enumerate() {
            let source = match cache.get(&item.source_path) {
                Some(s) => s,
                None => continue,
            };
            let len = source.frames();
            let start = starts[i];
            let fade_in_len = if i == 0 { 0 } else { fade_out[i - 1] };
            let fade_out_len = fade_out[i];

            for f in 0..len {
                let idx = start + f;
                if idx >= total_frames {
                    break;
                }

                let mut env = 1.0_f32;
                if fade_in_len > 0 && f < fade_in_len {
                    let p = f as f32 / fade_in_len as f32;
                    env *= (p * std::f32::consts::FRAC_PI_2).sin();
                }
                if fade_out_len > 0 && f >= len.saturating_sub(fade_out_len) {
                    let p = (len - f) as f32 / fade_out_len as f32;
                    env *= (p.clamp(0.0, 1.0) * std::f32::consts::FRAC_PI_2).sin();
                }

                let amp = item.gain * env;
                mix_l[idx] += source.left[f] * amp;
                mix_r[idx] += source.right[f] * amp;
            }
        }

        // 4. Interleave.
        let mut interleaved = Vec::with_capacity(total_frames * 2);
        for i in 0..total_frames {
            interleaved.push(mix_l[i]);
            interleaved.push(mix_r[i]);
        }

        let mut note = String::new();
        let mut measured_lufs = -70.0_f32;

        if request.apply_master_chain {
            let mut chain = MasterDspChain::new(sample_rate as f32, &request.master_dsp);
            chain.process_interleaved(&mut interleaved);
            measured_lufs = chain.get_lufs();

            if options.normalize_to_target_lufs && measured_lufs > -60.0 {
                let diff = request.master_dsp.target_lufs - measured_lufs;
                let gain = 10.0_f32.powf(diff.clamp(-12.0, 12.0) / 20.0);
                let ceiling = 10.0_f32.powf(request.master_dsp.limiter_ceiling_db / 20.0);
                for s in interleaved.iter_mut() {
                    *s = (*s * gain).clamp(-ceiling, ceiling);
                }
                measured_lufs += diff.clamp(-12.0, 12.0);
            }
        } else {
            // Chain off: leave the audio alone. Only step in if summing the
            // crossfades or per-item gain actually pushed it past full scale,
            // so an untouched join stays sample-accurate.
            let peak = peak_of(&interleaved);
            if peak > 1.0 {
                let correction = 0.999 / peak;
                for s in interleaved.iter_mut() {
                    *s *= correction;
                }
                note = format!(
                    " (reduced {:.1} dB to prevent clipping)",
                    -20.0 * correction.log10()
                );
            }
        }

        let peak_db = peak_to_db(peak_of(&interleaved));

        // 5. Write and tag.
        write_wav_file(
            &options.export_path,
            &interleaved,
            sample_rate,
            &options.format,
            options.dither,
        )?;

        let tag_note = match write_tags(&options.export_path, &request.metadata) {
            Ok(()) => String::new(),
            Err(e) => format!(" (metadata could not be embedded: {})", e),
        };

        let duration_ms = (total_frames as f64 / sample_rate as f64) * 1000.0;

        Ok(ExportResult {
            path: options.export_path.clone(),
            duration_ms,
            measured_lufs,
            peak_db,
            sample_rate,
            format: options.format.clone(),
            message: format!(
                "Joined {} file{} into {:.1}s at {} kHz{}{}",
                request.items.len(),
                if request.items.len() == 1 { "" } else { "s" },
                duration_ms / 1000.0,
                sample_rate as f64 / 1000.0,
                note,
                tag_note
            ),
        })
    })
    .await
    .map_err(|e| format!("Concat export task failure: {}", e))?
}
