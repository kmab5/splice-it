//! Output encoders for formats other than WAV.
//!
//! Each function takes the same interleaved stereo f32 buffer the mixdown
//! produces and writes a finished file. Tagging happens afterwards in
//! `commands.rs`, since `lofty` handles FLAC and MP3 containers directly.

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

/// Quantize float samples to signed integers of the given bit depth.
fn quantize(interleaved: &[f32], bits: u32, dither: bool) -> Vec<i32> {
    let max_value = ((1i64 << (bits - 1)) - 1) as f32;
    let lsb = 1.0 / max_value;
    let mut rng_state: u32 = 0x2545_F491;

    interleaved
        .iter()
        .map(|s| {
            let v = if dither { *s + tpdf_noise(&mut rng_state, lsb) } else { *s };
            (v.clamp(-1.0, 1.0) * max_value).round() as i32
        })
        .collect()
}

/// Write a FLAC file. Lossless, so `bit_depth` decides the exact resolution and
/// `compression` only trades encoding time against file size.
///
/// `flacenc` does not expose libFLAC's 0-8 preset scale, so these three levels
/// map onto the settings it does have rather than inventing a fake slider:
///
/// * 0 — fixed LPC only. Fastest, noticeably larger files.
/// * 1 — the crate defaults.
/// * 2 — maximum LPC order and coefficient precision. Slowest, smallest.
pub fn write_flac(
    path: &str,
    interleaved: &[f32],
    sample_rate: u32,
    bit_depth: u32,
    compression: u32,
    dither: bool,
) -> Result<(), String> {
    // BitRepr provides Stream::write; Verify provides Encoder::into_verified.
    use flacenc::component::BitRepr;
    use flacenc::error::Verify;

    let bits = if bit_depth == 16 { 16u32 } else { 24u32 };
    // Dither only matters when discarding resolution.
    let pcm = quantize(interleaved, bits, dither && bits == 16);

    let mut settings = flacenc::config::Encoder::default();
    match compression {
        0 => {
            // Skipping the LPC search is where most of the encoding time goes.
            settings.subframe_coding.use_lpc = false;
        }
        2 => {
            settings.subframe_coding.qlpc.lpc_order = 24;
            settings.subframe_coding.qlpc.quant_precision = 15;
        }
        _ => {}
    }

    let config = settings
        .into_verified()
        .map_err(|_| "FLAC encoder configuration was rejected".to_string())?;

    let source = flacenc::source::MemSource::from_samples(
        &pcm,
        2,
        bits as usize,
        sample_rate as usize,
    );

    let stream = flacenc::encode_with_fixed_block_size(&config, source, config.block_size)
        .map_err(|e| format!("FLAC encoding failed: {:?}", e))?;

    let mut sink = flacenc::bitsink::ByteSink::new();
    stream
        .write(&mut sink)
        .map_err(|e| format!("FLAC serialization failed: {:?}", e))?;

    std::fs::write(path, sink.as_slice()).map_err(|e| format!("Cannot write FLAC file: {}", e))
}

/// Map a 0-9 setting onto LAME's quality enum. 0 is best.
fn lame_quality(level: u32) -> mp3lame_encoder::Quality {
    use mp3lame_encoder::Quality;
    match level {
        0 => Quality::Best,
        1 => Quality::SecondBest,
        2 => Quality::NearBest,
        3 => Quality::VeryNice,
        4 => Quality::Nice,
        5 => Quality::Good,
        6 => Quality::Decent,
        7 => Quality::Ok,
        8 => Quality::SecondWorst,
        _ => Quality::Worst,
    }
}

/// Write an MP3 via LAME, either at a constant bitrate or in VBR mode.
///
/// VBR spends bits where the material needs them, so for a given average size
/// it generally sounds better than CBR. `vbr_quality` follows LAME's -V scale:
/// 0 is best quality and largest, 9 is smallest.
pub fn write_mp3(
    path: &str,
    interleaved: &[f32],
    sample_rate: u32,
    bitrate_kbps: u32,
    vbr: bool,
    vbr_quality: u32,
) -> Result<(), String> {
    use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, Quality, VbrMode};

    // LAME only handles the MPEG sample rates, topping out at 48 kHz.
    if !matches!(sample_rate, 8000 | 11025 | 12000 | 16000 | 22050 | 24000 | 32000 | 44100 | 48000) {
        return Err(format!(
            "MP3 does not support {} Hz. Use 44.1 kHz or 48 kHz, or export WAV/FLAC instead.",
            sample_rate
        ));
    }

    let pcm: Vec<i16> = interleaved
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * 32767.0).round() as i16)
        .collect();

    let mut builder = Builder::new().ok_or_else(|| "Could not create the MP3 encoder".to_string())?;
    builder
        .set_num_channels(2)
        .map_err(|e| format!("MP3 channel setup failed: {:?}", e))?;
    builder
        .set_sample_rate(sample_rate)
        .map_err(|e| format!("MP3 sample rate setup failed: {:?}", e))?;
    if vbr {
        builder
            .set_vbr_mode(VbrMode::Mtrh)
            .map_err(|e| format!("MP3 VBR mode setup failed: {:?}", e))?;
        builder
            .set_vbr_quality(lame_quality(vbr_quality))
            .map_err(|e| format!("MP3 VBR quality setup failed: {:?}", e))?;
        // The Xing/LAME header carries the VBR seek table, without which
        // players report the wrong duration and cannot seek accurately.
        builder
            .set_to_write_vbr_tag(true)
            .map_err(|e| format!("MP3 VBR tag setup failed: {:?}", e))?;
    } else {
        builder
            .set_brate(match bitrate_kbps {
                128 => Bitrate::Kbps128,
                160 => Bitrate::Kbps160,
                256 => Bitrate::Kbps256,
                320 => Bitrate::Kbps320,
                _ => Bitrate::Kbps192,
            })
            .map_err(|e| format!("MP3 bitrate setup failed: {:?}", e))?;
    }

    // Algorithm effort, independent of the VBR quality target.
    builder
        .set_quality(Quality::Best)
        .map_err(|e| format!("MP3 quality setup failed: {:?}", e))?;

    let mut encoder = builder
        .build()
        .map_err(|e| format!("MP3 encoder initialization failed: {:?}", e))?;

    // max_required_buffer_size is documented in terms of per-channel samples.
    let frames = pcm.len() / 2;
    let mut out: Vec<u8> = Vec::new();
    out.reserve(mp3lame_encoder::max_required_buffer_size(frames));

    // encode_to_vec / flush_to_vec write into the vector's spare capacity and
    // fix up the length themselves, so no unsafe is needed here. Both need the
    // capacity reserved up front.
    encoder
        .encode_to_vec(InterleavedPcm(&pcm), &mut out)
        .map_err(|e| format!("MP3 encoding failed: {:?}", e))?;

    // A final MP3 frame needs up to 7200 bytes.
    out.reserve(7200);
    encoder
        .flush_to_vec::<FlushNoGap>(&mut out)
        .map_err(|e| format!("MP3 flush failed: {:?}", e))?;

    std::fs::write(path, &out).map_err(|e| format!("Cannot write MP3 file: {}", e))
}
