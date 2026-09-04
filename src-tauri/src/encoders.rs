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

/// Write a FLAC file. Lossless, so `bit_depth` decides the exact resolution.
pub fn write_flac(
    path: &str,
    interleaved: &[f32],
    sample_rate: u32,
    bit_depth: u32,
    dither: bool,
) -> Result<(), String> {
    // BitRepr provides Stream::write; Verify provides Encoder::into_verified.
    use flacenc::component::BitRepr;
    use flacenc::error::Verify;

    let bits = if bit_depth == 16 { 16u32 } else { 24u32 };
    // Dither only matters when discarding resolution.
    let pcm = quantize(interleaved, bits, dither && bits == 16);

    let config = flacenc::config::Encoder::default()
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

/// Write an MP3 via LAME at a constant bitrate.
pub fn write_mp3(
    path: &str,
    interleaved: &[f32],
    sample_rate: u32,
    bitrate_kbps: u32,
) -> Result<(), String> {
    use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, Quality};

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
    builder
        .set_brate(match bitrate_kbps {
            128 => Bitrate::Kbps128,
            160 => Bitrate::Kbps160,
            256 => Bitrate::Kbps256,
            320 => Bitrate::Kbps320,
            _ => Bitrate::Kbps192,
        })
        .map_err(|e| format!("MP3 bitrate setup failed: {:?}", e))?;
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
