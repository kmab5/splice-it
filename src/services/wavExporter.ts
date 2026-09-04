import { ExportOptions, ProjectState } from '../types/project';
import { dbToLinear } from './dspMath';

/**
 * Browser-only mixdown renderer used when the app runs outside the Tauri shell.
 * The desktop build renders in Rust instead (see services/ipc.ts).
 *
 * Sources are looked up by clip.source_path. A clip whose source has not been
 * decoded contributes silence; it is never replaced with a synthesized tone.
 */
export async function renderAndExportWav(
  project: ProjectState,
  sourceBuffers: Map<string, AudioBuffer>,
  options?: Pick<ExportOptions, 'normalize_to_target_lufs'>
): Promise<{ blob: Blob; url: string; lufs: number }> {
  const sampleRate = project.sample_rate || 44100;

  if (project.clips.length === 0) {
    throw new Error('Nothing to export: the timeline has no clips.');
  }

  // 1. Timeline length, plus a short tail.
  let maxDurationMs = 0;
  for (const clip of project.clips) {
    const endMs = clip.start_time_ms + clip.duration_ms;
    if (endMs > maxDurationMs) maxDurationMs = endMs;
  }
  if (maxDurationMs <= 0) {
    throw new Error('Project timeline duration is zero.');
  }
  maxDurationMs += 250;

  const totalFrames = Math.ceil((maxDurationMs / 1000) * sampleRate);
  const mixL = new Float32Array(totalFrames);
  const mixR = new Float32Array(totalFrames);

  const hasSolo = project.tracks.some((t) => t.solo);

  // 2. Sum every audible clip.
  for (const clip of project.clips) {
    const track = project.tracks[clip.track_index];
    if (track?.muted) continue;
    if (hasSolo && !track?.solo) continue;

    const buffer = sourceBuffers.get(clip.source_path);
    if (!buffer) continue;

    const trackVol = track ? track.volume : 1.0;
    const trackPan = Math.max(-1, Math.min(1, track ? track.pan : 0));
    // Equal-power pan, matching the Rust exporter.
    const angle = ((trackPan + 1) * Math.PI) / 4;
    const panL = Math.cos(angle);
    const panR = Math.sin(angle);

    const startFrame = Math.round((clip.start_time_ms / 1000) * sampleRate);
    const durationFrames = Math.round((clip.duration_ms / 1000) * sampleRate);
    const fadeInFrames = Math.round((clip.fade_in_ms / 1000) * sampleRate);
    const fadeOutFrames = Math.round((clip.fade_out_ms / 1000) * sampleRate);
    const offsetFrames = Math.round((clip.offset_ms / 1000) * sampleRate);

    const bufL = buffer.getChannelData(0);
    const bufR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : bufL;
    const bufLen = bufL.length;

    const gain = clip.gain * trackVol;

    for (let f = 0; f < durationFrames; f++) {
      const targetIdx = startFrame + f;
      if (targetIdx >= totalFrames) break;

      const srcIdx = offsetFrames + f;
      // Past the end of the source the clip is silent; it does not loop.
      if (srcIdx >= bufLen) break;

      let fade = 1.0;
      if (fadeInFrames > 0 && f < fadeInFrames) {
        fade *= Math.sin((f / fadeInFrames) * (Math.PI / 2));
      }
      if (fadeOutFrames > 0 && f >= durationFrames - fadeOutFrames) {
        const outP = Math.max(0, Math.min(1, (durationFrames - f) / fadeOutFrames));
        fade *= Math.sin(outP * (Math.PI / 2));
      }

      const amp = gain * fade;
      mixL[targetIdx] += bufL[srcIdx] * amp * panL;
      mixR[targetIdx] += bufR[srcIdx] * amp * panR;
    }
  }

  // 3. Master chain approximation (the desktop build runs the real one in Rust).
  const dsp = project.master_dsp;
  const hsCutGainLin = dbToLinear(dsp.eq_high_cut_gain_db);
  const mudGainLin = dbToLinear(dsp.eq_mud_scoop_gain_db);
  const width = dsp.stereo_width;
  const ceiling = dbToLinear(dsp.limiter_ceiling_db);

  let sumSquare = 0;

  for (let i = 0; i < totalFrames; i++) {
    let l = mixL[i];
    let r = mixR[i];

    l *= 0.85 + 0.15 * hsCutGainLin;
    r *= 0.85 + 0.15 * hsCutGainLin;
    l *= 0.9 + 0.1 * mudGainLin;
    r *= 0.9 + 0.1 * mudGainLin;

    const mid = 0.5 * (l + r);
    const side = 0.5 * (l - r) * width;
    l = mid + side;
    r = mid - side;

    const maxVal = Math.max(Math.abs(l), Math.abs(r));
    if (maxVal > ceiling) {
      const factor = ceiling / maxVal;
      l *= factor;
      r *= factor;
    }

    mixL[i] = Math.max(-1.0, Math.min(1.0, l));
    mixR[i] = Math.max(-1.0, Math.min(1.0, r));

    sumSquare += mixL[i] * mixL[i] + mixR[i] * mixR[i];
  }

  const meanSquare = sumSquare / Math.max(1, totalFrames * 2);
  let measuredLufs = meanSquare > 1e-7 ? -0.691 + 10 * Math.log10(meanSquare) : -70;

  // 4. Optional loudness match.
  if (options?.normalize_to_target_lufs && measuredLufs > -60) {
    const diff = Math.max(-12, Math.min(12, dsp.target_lufs - measuredLufs));
    const normGain = Math.pow(10, diff / 20);
    for (let i = 0; i < totalFrames; i++) {
      mixL[i] = Math.max(-ceiling, Math.min(ceiling, mixL[i] * normGain));
      mixR[i] = Math.max(-ceiling, Math.min(ceiling, mixR[i] * normGain));
    }
    measuredLufs += diff;
  }

  // 5. Encode to 24-bit PCM WAV.
  const wavBuffer = encode24BitWav(mixL, mixR, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  return { blob, url, lufs: measuredLufs };
}

function encode24BitWav(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 2;
  const bytesPerSample = 3; // 24-bit
  const numFrames = left.length;
  const dataByteLength = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataByteLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * blockAlign)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  // block align (channels * bytesPerSample)
  view.setUint16(32, numChannels * bytesPerSample, true);
  // bits per sample
  view.setUint16(34, 24, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataByteLength, true);

  // Write 24-bit samples
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    // Left channel
    const valL = Math.max(-1, Math.min(1, left[i]));
    const intL = Math.round(valL < 0 ? valL * 0x800000 : valL * 0x7fffff);
    view.setUint8(offset, intL & 0xff);
    view.setUint8(offset + 1, (intL >> 8) & 0xff);
    view.setUint8(offset + 2, (intL >> 16) & 0xff);
    offset += 3;

    // Right channel
    const valR = Math.max(-1, Math.min(1, right[i]));
    const intR = Math.round(valR < 0 ? valR * 0x800000 : valR * 0x7fffff);
    view.setUint8(offset, intR & 0xff);
    view.setUint8(offset + 1, (intR >> 8) & 0xff);
    view.setUint8(offset + 2, (intR >> 16) & 0xff);
    offset += 3;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
