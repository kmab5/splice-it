// DSP Math utilities for frequency response calculation and audio analysis

export interface DspEqParams {
  highCutHz: number;
  highCutGainDb: number;
  mudScoopHz: number;
  mudScoopQ: number;
  mudScoopGainDb: number;
}

/**
 * Calculates the combined dB magnitude response of the High-Shelf cut and Mud-Scoop peaking filter
 * across a log frequency scale from 20 Hz to 20,000 Hz.
 */
export function calculateEqResponse(
  frequencies: number[],
  sampleRate: number,
  params: DspEqParams
): number[] {
  return frequencies.map((f) => {
    // 1. High Shelf filter response
    const hsGain = calculateHighShelfDb(f, sampleRate, params.highCutHz, params.highCutGainDb);
    // 2. Mud Scoop peaking filter response
    const scoopGain = calculatePeakingDb(f, sampleRate, params.mudScoopHz, params.mudScoopQ, params.mudScoopGainDb);
    return hsGain + scoopGain;
  });
}

function calculateHighShelfDb(freq: number, sampleRate: number, cutoffHz: number, gainDb: number): number {
  if (freq < 500) return 0;
  const ratio = freq / cutoffHz;
  if (ratio < 0.2) return 0;
  // Smooth transition shelf curve
  const weight = 1 / (1 + Math.pow(cutoffHz / Math.max(freq, 20), 2));
  return gainDb * weight;
}

function calculatePeakingDb(freq: number, sampleRate: number, centerHz: number, q: number, gainDb: number): number {
  const bandwidthHz = centerHz / Math.max(q, 0.1);
  const diff = Math.abs(freq - centerHz);
  const factor = Math.exp(-0.5 * Math.pow(diff / (bandwidthHz * 0.5), 2));
  return gainDb * factor;
}

/**
 * Estimates short-term and integrated LUFS from raw sample window.
 */
export function calculateSampleLufs(samples: Float32Array): number {
  if (samples.length === 0) return -70;
  let sumSquare = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSquare += s * s;
  }
  const meanSquare = sumSquare / samples.length;
  if (meanSquare <= 1e-7) return -70;
  return -0.691 + 10 * Math.log10(meanSquare);
}

/**
 * Converts linear gain to decibels (dB)
 */
export function linearToDb(gain: number): number {
  if (gain <= 1e-5) return -100;
  return 20 * Math.log10(gain);
}

/**
 * Converts decibels (dB) to linear gain
 */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
