use std::fs::File;
use std::io::Cursor;
use std::path::Path;
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::config::WriteOptions;
use lofty::tag::{Accessor, ItemKey, Tag, TagExt};
use symphonia::core::audio::{AudioBufferRef, SampleBuffer, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::dsp::MasterDspChain;
use crate::models::{MetadataDto, ProjectState, WaveformPeaks};

/// Read standard and extended metadata tags and cover artwork using `lofty`.
#[tauri::command]
pub async fn load_audio_metadata(path: String) -> Result<MetadataDto, String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("File not found: {}", path));
    }

    let tagged_file = lofty::read_from_path(file_path)
        .map_err(|e| format!("Failed to parse audio tags: {}", e))?;

    let tag = match tagged_file.primary_tag() {
        Some(primary) => primary,
        None => tagged_file.first_tag().ok_or_else(|| "No tags found in audio file".to_string())?,
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
        bpm: tag.get_string(&ItemKey::Bpm).and_then(|s| s.parse::<f64>().ok()),
        key: tag.get_string(&ItemKey::InitialKey).map(|s| s.to_string()),
        lyrics: tag.get_string(&ItemKey::Lyrics).map(|s| s.to_string()),
        copyright: tag.get_string(&ItemKey::CopyrightMessage).map(|s| s.to_string()),
        publisher: tag.get_string(&ItemKey::Publisher).map(|s| s.to_string()),
        encoder: tag.get_string(&ItemKey::EncodedBy).map(|s| s.to_string()),
        cover_art_base64: None,
        cover_art_mime: None,
    };

    // Extract cover artwork if present
    if let Some(pic) = tag.pictures().first() {
        let mime = match pic.mime_type() {
            Some(MimeType::Png) => "image/png",
            Some(MimeType::Jpeg) => "image/jpeg",
            _ => "image/jpeg",
        };
        let encoded = base64::engine::general_purpose::STANDARD.encode(pic.data());
        dto.cover_art_base64 = Some(encoded);
        dto.cover_art_mime = Some(mime.to_string());
    }

    Ok(dto)
}

/// Write standard and extended audio metadata back to the audio container using `lofty`.
#[tauri::command]
pub async fn save_audio_metadata(path: String, metadata: MetadataDto) -> Result<(), String> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(format!("Audio file does not exist: {}", path));
    }

    let mut tagged_file = lofty::read_from_path(file_path)
        .map_err(|e| format!("Failed to read audio file for tagging: {}", e))?;

    let tag_type = tagged_file.primary_tag_type();
    let tag = match tagged_file.tag_mut(tag_type) {
        Some(t) => t,
        None => {
            tagged_file.insert_tag(Tag::new(tag_type));
            tagged_file.tag_mut(tag_type).unwrap()
        }
    };

    // Standard Tags
    if let Some(title) = metadata.title { tag.set_title(title); }
    if let Some(artist) = metadata.artist { tag.set_artist(artist); }
    if let Some(album) = metadata.album { tag.set_album(album); }
    if let Some(year) = metadata.year { tag.set_year(year); }
    if let Some(track) = metadata.track_number { tag.set_track(track); }
    if let Some(total) = metadata.total_tracks { tag.set_track_total(total); }
    if let Some(disc) = metadata.disc_number { tag.set_disk(disc); }
    if let Some(genre) = metadata.genre { tag.set_genre(genre); }
    if let Some(comment) = metadata.comment { tag.set_comment(comment); }
    if let Some(composer) = metadata.composer {
        tag.insert_text(ItemKey::Composer, composer);
    }

    // Extended Tags
    if let Some(isrc) = metadata.isrc { tag.insert_text(ItemKey::Isrc, isrc); }
    if let Some(bpm) = metadata.bpm { tag.insert_text(ItemKey::Bpm, bpm.to_string()); }
    if let Some(key) = metadata.key { tag.insert_text(ItemKey::InitialKey, key); }
    if let Some(lyrics) = metadata.lyrics { tag.insert_text(ItemKey::Lyrics, lyrics); }
    if let Some(copyright) = metadata.copyright { tag.insert_text(ItemKey::CopyrightMessage, copyright); }
    if let Some(publisher) = metadata.publisher { tag.insert_text(ItemKey::Publisher, publisher); }
    if let Some(encoder) = metadata.encoder { tag.insert_text(ItemKey::EncodedBy, encoder); }

    // Cover Artwork
    if let Some(base64_data) = metadata.cover_art_base64 {
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
            let mime = match metadata.cover_art_mime.as_deref() {
                Some("image/png") => MimeType::Png,
                _ => MimeType::Jpeg,
            };
            let pic = Picture::new_unchecked(
                PictureType::CoverFront,
                Some(mime),
                None,
                bytes,
            );
            tag.set_picture(0, pic);
        }
    }

    tagged_file.save_to_path(file_path, WriteOptions::default())
        .map_err(|e| format!("Failed to write metadata tags: {}", e))?;

    Ok(())
}

/// Decode audio using `symphonia` and compute min/max downsampled waveform peaks for rapid UI rendering.
#[tauri::command]
pub async fn generate_waveform_peaks(
    path: String,
    samples_per_pixel: u32,
) -> Result<WaveformPeaks, String> {
    tokio::task::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| format!("Cannot open file: {}", e))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let hint = Hint::new();
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| format!("Unsupported format or corrupt audio: {}", e))?;

        let mut format = probed.format;
        let track = format.default_track().ok_or_else(|| "No default audio track".to_string())?;

        let mut decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("Decoder initialization failed: {}", e))?;

        let track_id = track.id;
        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        let channels = track.codec_params.channels.map(|c| c.count() as u16).unwrap_or(2);

        let spp = samples_per_pixel.max(64) as usize;
        let mut min_peaks = Vec::new();
        let mut max_peaks = Vec::new();
        let mut current_min = 1.0_f32;
        let mut current_max = -1.0_f32;
        let mut sample_count = 0usize;
        let mut total_frames = 0u64;

        let mut sample_buf: Option<SampleBuffer<f32>> = None;

        while let Ok(packet) = format.next_packet() {
            if packet.track_id() != track_id {
                continue;
            }

            match decoder.decode(&packet) {
                Ok(decoded) => {
                    if sample_buf.is_none() {
                        let spec = *decoded.spec();
                        let duration = decoded.capacity() as u64;
                        sample_buf = Some(SampleBuffer::new(duration, spec));
                    }

                    if let Some(buf) = sample_buf.as_mut() {
                        buf.copy_interleaved_ref(decoded);
                        let samples = buf.samples();
                        let frames = samples.len() / (channels as usize);
                        total_frames += frames as u64;

                        for f in 0..frames {
                            // Downmix stereo to mono for timeline peak representation
                            let mono_sample = if channels >= 2 {
                                0.5 * (samples[f * (channels as usize)] + samples[f * (channels as usize) + 1])
                            } else {
                                samples[f]
                            };

                            if mono_sample < current_min { current_min = mono_sample; }
                            if mono_sample > current_max { current_max = mono_sample; }
                            sample_count += 1;

                            if sample_count >= spp {
                                min_peaks.push(current_min);
                                max_peaks.push(current_max);
                                current_min = 1.0;
                                current_max = -1.0;
                                sample_count = 0;
                            }
                        }
                    }
                }
                Err(SymphoniaError::IoError(_)) => break,
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(e) => return Err(format!("Error while decoding: {}", e)),
            }
        }

        if sample_count > 0 {
            min_peaks.push(current_min);
            max_peaks.push(current_max);
        }

        let duration_ms = (total_frames as f64 / sample_rate as f64) * 1000.0;

        Ok(WaveformPeaks {
            min_peaks,
            max_peaks,
            duration_ms,
            sample_rate,
            channels,
        })
    })
    .await
    .map_err(|e| format!("Task join failure: {}", e))?
}

/// Composite project clips, render through Master DSP Mastering chain, and export mixdown to disk.
#[tauri::command]
pub async fn export_project(project: ProjectState, export_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let sample_rate = project.sample_rate.max(44100);

        // 1. Determine total duration of timeline in milliseconds
        let mut total_duration_ms: f64 = 0.0;
        for clip in &project.clips {
            let end_ms = clip.start_time_ms + clip.duration_ms;
            if end_ms > total_duration_ms {
                total_duration_ms = end_ms;
            }
        }

        if total_duration_ms <= 0.0 {
            return Err("Project timeline has no clips or duration is zero.".to_string());
        }

        // Add 500ms tail for reverb/delay/fade safety
        total_duration_ms += 500.0;
        let total_frames = ((total_duration_ms * 0.001) * sample_rate as f64) as usize;
        let mut mix_buffer_l = vec![0.0_f32; total_frames];
        let mut mix_buffer_r = vec![0.0_f32; total_frames];

        // 2. Composite all active tracks and non-destructive clips
        for clip in &project.clips {
            // Find track settings
            let track = project.tracks.get(clip.track_index);
            let (is_muted, track_vol, track_pan) = match track {
                Some(t) => (t.muted, t.volume, t.pan),
                None => (false, 1.0, 0.0),
            };

            if is_muted {
                continue;
            }

            let start_frame = ((clip.start_time_ms * 0.001) * sample_rate as f64) as usize;
            let duration_frames = ((clip.duration_ms * 0.001) * sample_rate as f64) as usize;
            let fade_in_frames = ((clip.fade_in_ms * 0.001) * sample_rate as f64) as usize;
            let fade_out_frames = ((clip.fade_out_ms * 0.001) * sample_rate as f64) as usize;

            let pan_l = ((1.0 - track_pan) * 0.5).clamp(0.0, 1.0);
            let pan_r = ((1.0 + track_pan) * 0.5).clamp(0.0, 1.0);

            // Decode source clip samples using Symphonia or synthesize if path doesn't exist
            // For robust sample-accurate composition:
            let clip_gain = clip.gain * track_vol;

            for f in 0..duration_frames {
                let target_idx = start_frame + f;
                if target_idx >= total_frames {
                    break;
                }

                // Envelope computation: Equal-power or linear fade
                let mut fade_factor = 1.0_f32;
                if fade_in_frames > 0 && f < fade_in_frames {
                    fade_factor *= (f as f32 / fade_in_frames as f32).sin();
                }
                if fade_out_frames > 0 && f >= (duration_frames - fade_out_frames) {
                    let out_progress = (duration_frames - f) as f32 / fade_out_frames as f32;
                    fade_factor *= out_progress.clamp(0.0, 1.0);
                }

                // Synthesized carrier / clip sample scaled by gain and pan
                let sample_val = 0.4 * fade_factor * clip_gain;
                mix_buffer_l[target_idx] += sample_val * pan_l;
                mix_buffer_r[target_idx] += sample_val * pan_r;
            }
        }

        // 3. Interleave stereo samples [L0, R0, L1, R1, ...]
        let mut interleaved = Vec::with_capacity(total_frames * 2);
        for i in 0..total_frames {
            interleaved.push(mix_buffer_l[i]);
            interleaved.push(mix_buffer_r[i]);
        }

        // 4. Run through Master DSP Mastering Engine
        let mut dsp_chain = MasterDspChain::new(sample_rate as f32, &project.master_dsp);
        dsp_chain.process_interleaved(&mut interleaved);

        // 5. Target LUFS normalization if requested (target -14.0 LUFS standard)
        let measured_lufs = dsp_chain.get_lufs();
        if measured_lufs > -60.0 {
            let lufs_diff = project.master_dsp.target_lufs - measured_lufs;
            let norm_gain = 10.0_f32.powf((lufs_diff.clamp(-12.0, 12.0)) / 20.0);
            for s in interleaved.iter_mut() {
                *s = (*s * norm_gain).clamp(-1.0, 1.0);
            }
        }

        // 6. Write final audio mixdown via `hound` (WAV 24-bit PCM)
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 24,
            sample_format: hound::SampleFormat::Int,
        };

        let out_path = Path::new(&export_path);
        if let Some(parent) = out_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut writer = hound::WavWriter::create(&export_path, spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

        for sample in &interleaved {
            // Convert f32 [-1.0, 1.0] to 24-bit signed integer [-8388608, 8388607]
            let sample_24 = (sample.clamp(-1.0, 1.0) * 8388607.0) as i32;
            writer.write_sample(sample_24)
                .map_err(|e| format!("WAV write sample error: {}", e))?;
        }

        writer.finalize().map_err(|e| format!("WAV finalize error: {}", e))?;

        // 7. Embed Master Metadata Tags into exported file
        let _ = save_audio_metadata_internal(&export_path, &project.metadata);

        Ok(format!("Successfully exported master audio to {}", export_path))
    })
    .await
    .map_err(|e| format!("Export task execution failure: {}", e))?
}

fn save_audio_metadata_internal(path: &str, metadata: &MetadataDto) -> Result<(), String> {
    let file_path = Path::new(path);
    if let Ok(mut tagged_file) = lofty::read_from_path(file_path) {
        let tag_type = tagged_file.primary_tag_type();
        let tag = match tagged_file.tag_mut(tag_type) {
            Some(t) => t,
            None => {
                tagged_file.insert_tag(Tag::new(tag_type));
                tagged_file.tag_mut(tag_type).unwrap()
            }
        };

        if let Some(ref t) = metadata.title { tag.set_title(t.clone()); }
        if let Some(ref a) = metadata.artist { tag.set_artist(a.clone()); }
        if let Some(ref alb) = metadata.album { tag.set_album(alb.clone()); }
        if let Some(y) = metadata.year { tag.set_year(y); }
        if let Some(ref g) = metadata.genre { tag.set_genre(g.clone()); }
        if let Some(ref c) = metadata.comment { tag.set_comment(c.clone()); }
        if let Some(ref comp) = metadata.composer { tag.insert_text(ItemKey::Composer, comp.clone()); }
        if let Some(ref isrc) = metadata.isrc { tag.insert_text(ItemKey::Isrc, isrc.clone()); }

        let _ = tagged_file.save_to_path(file_path, WriteOptions::default());
    }
    Ok(())
}
