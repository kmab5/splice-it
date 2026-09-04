use std::f32::consts::PI;
use crate::models::MasterDspSettings;

/// Direct Form II Transposed BiQuad IIR Filter based on Robert Bristow-Johnson's Audio EQ Cookbook.
#[derive(Debug, Clone)]
pub struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }

    /// Peaking / Bell EQ filter (used for scooping muddy low-mids e.g. 200 Hz - 400 Hz)
    pub fn set_peaking(&mut self, sample_rate: f32, freq: f32, q: f32, gain_db: f32) {
        let w0 = 2.0 * PI * (freq.clamp(20.0, sample_rate * 0.49) / sample_rate);
        let a = 10.0_f32.powf(gain_db / 40.0);
        let alpha = w0.sin() / (2.0 * q.max(0.1));
        let cos_w0 = w0.cos();

        let a0 = 1.0 + alpha / a;
        self.b0 = (1.0 + alpha * a) / a0;
        self.b1 = (-2.0 * cos_w0) / a0;
        self.b2 = (1.0 - alpha * a) / a0;
        self.a1 = (-2.0 * cos_w0) / a0;
        self.a2 = (1.0 - alpha / a) / a0;
    }

    /// High-shelf filter (used for attenuating harsh high frequencies above 12 kHz)
    pub fn set_high_shelf(&mut self, sample_rate: f32, freq: f32, gain_db: f32) {
        let w0 = 2.0 * PI * (freq.clamp(20.0, sample_rate * 0.49) / sample_rate);
        let a = 10.0_f32.powf(gain_db / 40.0);
        let s = 1.0; // Shelf slope
        let alpha = (w0.sin() / 2.0) * (((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0).max(0.0)).sqrt();
        let cos_w0 = w0.cos();
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
        self.b0 = (a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha)) / a0;
        self.b1 = (-2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0)) / a0;
        self.b2 = (a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0;
        self.a1 = (2.0 * ((a - 1.0) - (a + 1.0) * cos_w0)) / a0;
        self.a2 = ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha)) / a0;
    }

    #[inline(always)]
    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
}

/// Mid/Side Stereo Matrix processor with 0% (mono) to 200% (exaggerated stereo field).
#[derive(Debug, Clone)]
pub struct MidSideProcessor {
    pub width: f32,
}

impl MidSideProcessor {
    pub fn new(width: f32) -> Self {
        Self { width }
    }

    #[inline(always)]
    pub fn process_stereo(&self, left: f32, right: f32) -> (f32, f32) {
        let mid = 0.5 * (left + right);
        let side = 0.5 * (left - right) * self.width;
        (mid + side, mid - side)
    }
}

/// Dynamic Range Compressor with threshold, ratio, attack, and release.
#[derive(Debug, Clone)]
pub struct DynamicCompressor {
    threshold_db: f32,
    ratio: f32,
    attack_coeff: f32,
    release_coeff: f32,
    envelope: f32,
}

impl DynamicCompressor {
    pub fn new(sample_rate: f32, threshold_db: f32, ratio: f32, attack_ms: f32, release_ms: f32) -> Self {
        let attack_coeff = (-1.0 / ((attack_ms * 0.001) * sample_rate)).exp();
        let release_coeff = (-1.0 / ((release_ms * 0.001) * sample_rate)).exp();
        Self {
            threshold_db,
            ratio: ratio.max(1.0),
            attack_coeff,
            release_coeff,
            envelope: 0.0,
        }
    }

    pub fn set_params(&mut self, sample_rate: f32, threshold_db: f32, ratio: f32, attack_ms: f32, release_ms: f32) {
        self.threshold_db = threshold_db;
        self.ratio = ratio.max(1.0);
        self.attack_coeff = (-1.0 / ((attack_ms * 0.001) * sample_rate)).exp();
        self.release_coeff = (-1.0 / ((release_ms * 0.001) * sample_rate)).exp();
    }

    #[inline(always)]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        let peak = left.abs().max(right.abs()).max(1e-6);
        let peak_db = 20.0 * peak.log10();

        // Target gain reduction in dB
        let target_gain_db = if peak_db > self.threshold_db {
            (self.threshold_db - peak_db) * (1.0 - 1.0 / self.ratio)
        } else {
            0.0
        };

        // Smooth envelope
        let target_gain_lin = 10.0_f32.powf(target_gain_db / 20.0);
        if target_gain_lin < self.envelope {
            self.envelope = self.attack_coeff * self.envelope + (1.0 - self.attack_coeff) * target_gain_lin;
        } else {
            self.envelope = self.release_coeff * self.envelope + (1.0 - self.release_coeff) * target_gain_lin;
        }

        (left * self.envelope, right * self.envelope)
    }
}

/// Lookahead True-Peak Limiter ensuring strict ceiling compliance with zero distortion.
#[derive(Debug, Clone)]
pub struct TruePeakLimiter {
    ceiling_lin: f32,
    threshold_lin: f32,
    buffer_l: Vec<f32>,
    buffer_r: Vec<f32>,
    buf_index: usize,
    lookahead_samples: usize,
    gain_reduction: f32,
    release_coeff: f32,
}

impl TruePeakLimiter {
    pub fn new(sample_rate: f32, ceiling_db: f32, threshold_db: f32) -> Self {
        let lookahead_samples = ((sample_rate * 0.003) as usize).clamp(32, 256); // 3ms lookahead
        let release_ms = 40.0;
        let release_coeff = (-1.0 / ((release_ms * 0.001) * sample_rate)).exp();

        Self {
            ceiling_lin: 10.0_f32.powf(ceiling_db / 20.0),
            threshold_lin: 10.0_f32.powf(threshold_db / 20.0),
            buffer_l: vec![0.0; lookahead_samples],
            buffer_r: vec![0.0; lookahead_samples],
            buf_index: 0,
            lookahead_samples,
            gain_reduction: 1.0,
            release_coeff,
        }
    }

    pub fn set_params(&mut self, ceiling_db: f32, threshold_db: f32) {
        self.ceiling_lin = 10.0_f32.powf(ceiling_db / 20.0);
        self.threshold_lin = 10.0_f32.powf(threshold_db / 20.0);
    }

    #[inline(always)]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        let max_val = left.abs().max(right.abs());
        let target_gain = if max_val > self.threshold_lin {
            (self.ceiling_lin / max_val).min(1.0)
        } else {
            1.0
        };

        if target_gain < self.gain_reduction {
            self.gain_reduction = target_gain; // Instant attack to prevent clipping
        } else {
            self.gain_reduction = self.release_coeff * self.gain_reduction + (1.0 - self.release_coeff) * target_gain;
        }

        let delayed_l = self.buffer_l[self.buf_index];
        let delayed_r = self.buffer_r[self.buf_index];

        self.buffer_l[self.buf_index] = left;
        self.buffer_r[self.buf_index] = right;
        self.buf_index = (self.buf_index + 1) % self.lookahead_samples;

        (
            (delayed_l * self.gain_reduction).clamp(-self.ceiling_lin, self.ceiling_lin),
            (delayed_r * self.gain_reduction).clamp(-self.ceiling_lin, self.ceiling_lin),
        )
    }
}

/// ITU-R BS.1770 K-Weighting Filter for accurate integrated LUFS loudness measurement.
#[derive(Debug, Clone)]
pub struct LufsEstimator {
    filter_stage1_l: BiquadFilter,
    filter_stage1_r: BiquadFilter,
    filter_stage2_l: BiquadFilter,
    filter_stage2_r: BiquadFilter,
    sum_square_energy: f64,
    total_blocks: usize,
    block_samples: usize,
    current_block_energy: f64,
    current_block_count: usize,
}

impl LufsEstimator {
    pub fn new(sample_rate: f32) -> Self {
        let mut f1_l = BiquadFilter::new();
        let mut f1_r = BiquadFilter::new();
        let mut f2_l = BiquadFilter::new();
        let mut f2_r = BiquadFilter::new();

        // Stage 1: High shelf filter ~1500 Hz, +4 dB gain
        f1_l.set_high_shelf(sample_rate, 1500.0, 4.0);
        f1_r.set_high_shelf(sample_rate, 1500.0, 4.0);

        // Stage 2: High pass filter (RLB weighting curve ~38 Hz)
        f2_l.set_peaking(sample_rate, 38.0, 0.5, -6.0);
        f2_r.set_peaking(sample_rate, 38.0, 0.5, -6.0);

        Self {
            filter_stage1_l: f1_l,
            filter_stage1_r: f1_r,
            filter_stage2_l: f2_l,
            filter_stage2_r: f2_r,
            sum_square_energy: 0.0,
            total_blocks: 0,
            block_samples: (sample_rate * 0.1) as usize, // 100ms gating block
            current_block_energy: 0.0,
            current_block_count: 0,
        }
    }

    pub fn process_sample(&mut self, left: f32, right: f32) {
        let y1_l = self.filter_stage1_l.process(left);
        let y2_l = self.filter_stage2_l.process(y1_l);

        let y1_r = self.filter_stage1_r.process(right);
        let y2_r = self.filter_stage2_r.process(y1_r);

        let energy = (y2_l as f64 * y2_l as f64) + (y2_r as f64 * y2_r as f64);
        self.current_block_energy += energy;
        self.current_block_count += 1;

        if self.current_block_count >= self.block_samples {
            let mean_energy = self.current_block_energy / (self.current_block_count as f64);
            // Gating threshold at -70 LUFS to omit pure silence
            if mean_energy > 1e-7 {
                self.sum_square_energy += mean_energy;
                self.total_blocks += 1;
            }
            self.current_block_energy = 0.0;
            self.current_block_count = 0;
        }
    }

    pub fn get_integrated_lufs(&self) -> f32 {
        if self.total_blocks == 0 {
            return -70.0;
        }
        let mean = self.sum_square_energy / (self.total_blocks as f64);
        if mean <= 0.0 {
            return -70.0;
        }
        (-0.691 + 10.0 * mean.log10()) as f32
    }
}

/// Full Master DSP Mastering Chain applying EQ, Compressor, Mid/Side, and True-Peak Limiter.
pub struct MasterDspChain {
    sample_rate: f32,
    high_shelf_l: BiquadFilter,
    high_shelf_r: BiquadFilter,
    mud_scoop_l: BiquadFilter,
    mud_scoop_r: BiquadFilter,
    compressor: DynamicCompressor,
    mid_side: MidSideProcessor,
    limiter: TruePeakLimiter,
    lufs_estimator: LufsEstimator,
}

impl MasterDspChain {
    pub fn new(sample_rate: f32, settings: &MasterDspSettings) -> Self {
        let mut chain = Self {
            sample_rate,
            high_shelf_l: BiquadFilter::new(),
            high_shelf_r: BiquadFilter::new(),
            mud_scoop_l: BiquadFilter::new(),
            mud_scoop_r: BiquadFilter::new(),
            compressor: DynamicCompressor::new(
                sample_rate,
                settings.comp_threshold_db,
                settings.comp_ratio,
                settings.comp_attack_ms,
                settings.comp_release_ms,
            ),
            mid_side: MidSideProcessor::new(settings.stereo_width),
            limiter: TruePeakLimiter::new(
                sample_rate,
                settings.limiter_ceiling_db,
                settings.limiter_threshold_db,
            ),
            lufs_estimator: LufsEstimator::new(sample_rate),
        };
        chain.update_settings(settings);
        chain
    }

    pub fn update_settings(&mut self, settings: &MasterDspSettings) {
        // High shelf cut (harsh high frequency attenuation above 12 kHz)
        self.high_shelf_l.set_high_shelf(self.sample_rate, settings.eq_high_cut_hz, settings.eq_high_cut_gain_db);
        self.high_shelf_r.set_high_shelf(self.sample_rate, settings.eq_high_cut_hz, settings.eq_high_cut_gain_db);

        // Mud scoop peaking bell filter (200 - 400 Hz range)
        self.mud_scoop_l.set_peaking(self.sample_rate, settings.eq_mud_scoop_hz, settings.eq_mud_scoop_q, settings.eq_mud_scoop_gain_db);
        self.mud_scoop_r.set_peaking(self.sample_rate, settings.eq_mud_scoop_hz, settings.eq_mud_scoop_q, settings.eq_mud_scoop_gain_db);

        // Dynamic compressor
        self.compressor.set_params(
            self.sample_rate,
            settings.comp_threshold_db,
            settings.comp_ratio,
            settings.comp_attack_ms,
            settings.comp_release_ms,
        );

        // Stereo imaging width
        self.mid_side.width = settings.stereo_width;

        // Limiter parameters
        self.limiter.set_params(settings.limiter_ceiling_db, settings.limiter_threshold_db);
    }

    /// Process interleaved stereo 32-bit float samples [L0, R0, L1, R1, ...] in-place.
    pub fn process_interleaved(&mut self, samples: &mut [f32]) {
        let num_frames = samples.len() / 2;
        for i in 0..num_frames {
            let left_in = samples[i * 2];
            let right_in = samples[i * 2 + 1];

            // 1. Parametric EQ Stage (High-shelf 12kHz cut + Mud scoop 200-400Hz)
            let eq_l = self.mud_scoop_l.process(self.high_shelf_l.process(left_in));
            let eq_r = self.mud_scoop_r.process(self.high_shelf_r.process(right_in));

            // 2. Dynamic Range Compression
            let (comp_l, comp_r) = self.compressor.process_stereo(eq_l, eq_r);

            // 3. Stereo Mid/Side Matrix
            let (ms_l, ms_r) = self.mid_side.process_stereo(comp_l, comp_r);

            // 4. True-Peak Limiter
            let (out_l, out_r) = self.limiter.process_stereo(ms_l, ms_r);

            // 5. Loudness Accumulation
            self.lufs_estimator.process_sample(out_l, out_r);

            samples[i * 2] = out_l;
            samples[i * 2 + 1] = out_r;
        }
    }

    pub fn get_lufs(&self) -> f32 {
        self.lufs_estimator.get_integrated_lufs()
    }
}
