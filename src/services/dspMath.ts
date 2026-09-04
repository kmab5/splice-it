// DSP Math utilities for frequency response calculation and audio analysis

export interface DspEqParams {
  highCutHz: number;
  highCutGainDb: number;
  mudScoopHz: number;
  mudScoopQ: number;
  mudScoopGainDb: number;
}

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * RBJ Audio EQ Cookbook peaking (bell) filter. These formulas are deliberately
 * identical to `BiquadFilter::set_peaking` in src-tauri/src/dsp.rs, so the curve
 * drawn in the UI is the curve the exporter actually applies.
 */
export function peakingCoeffs(
  sampleRate: number,
  freq: number,
  q: number,
  gainDb: number
): BiquadCoeffs {
  const f = Math.min(Math.max(freq, 20), sampleRate * 0.49);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const A = Math.pow(10, gainDb / 40);
  const alpha = Math.sin(w0) / (2 * Math.max(q, 0.1));
  const cosW0 = Math.cos(w0);

  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cosW0) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha / A) / a0,
  };
}

/** RBJ high-shelf, matching `BiquadFilter::set_high_shelf` in dsp.rs. */
export function highShelfCoeffs(
  sampleRate: number,
  freq: number,
  gainDb: number
): BiquadCoeffs {
  const f = Math.min(Math.max(freq, 20), sampleRate * 0.49);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const A = Math.pow(10, gainDb / 40);
  const S = 1.0; // shelf slope
  const alpha =
    (Math.sin(w0) / 2) * Math.sqrt(Math.max(0, (A + 1 / A) * (1 / S - 1) + 2));
  const cosW0 = Math.cos(w0);
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  const a0 = A + 1 - (A - 1) * cosW0 + twoSqrtAAlpha;
  return {
    b0: (A * (A + 1 + (A - 1) * cosW0 + twoSqrtAAlpha)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cosW0)) / a0,
    b2: (A * (A + 1 + (A - 1) * cosW0 - twoSqrtAAlpha)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cosW0)) / a0,
    a2: (A + 1 - (A - 1) * cosW0 - twoSqrtAAlpha) / a0,
  };
}

/**
 * Magnitude response in dB of a normalized biquad at one frequency, evaluated
 * as |H(e^jw)| on the unit circle.
 */
export function biquadMagnitudeDb(
  c: BiquadCoeffs,
  freq: number,
  sampleRate: number
): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  const numRe = c.b0 + c.b1 * cosW + c.b2 * cos2W;
  const numIm = -(c.b1 * sinW + c.b2 * sin2W);
  const denRe = 1 + c.a1 * cosW + c.a2 * cos2W;
  const denIm = -(c.a1 * sinW + c.a2 * sin2W);

  const magnitude =
    Math.hypot(numRe, numIm) / Math.max(1e-12, Math.hypot(denRe, denIm));

  return 20 * Math.log10(Math.max(magnitude, 1e-9));
}

/**
 * Combined dB response of the high-shelf cut and the mud-scoop bell across the
 * given frequencies.
 *
 * The previous implementation was an approximation: the shelf hard-returned 0
 * below 500 Hz and used a 1/(1+(fc/f)^2) weighting, and the bell was a Gaussian.
 * Neither matched the actual IIR filters, so the displayed curve did not
 * describe what the render was doing.
 */
export function calculateEqResponse(
  frequencies: number[],
  sampleRate: number,
  params: DspEqParams
): number[] {
  const shelf = highShelfCoeffs(sampleRate, params.highCutHz, params.highCutGainDb);
  const bell = peakingCoeffs(
    sampleRate,
    params.mudScoopHz,
    params.mudScoopQ,
    params.mudScoopGainDb
  );

  return frequencies.map(
    (f) =>
      biquadMagnitudeDb(shelf, f, sampleRate) + biquadMagnitudeDb(bell, f, sampleRate)
  );
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
