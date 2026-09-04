import { MasterDspSettings, TrackState, ClipState } from '../types/project';
import { dbToLinear } from './dspMath';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pausedAtMs: number = 0;
  private totalDurationMs: number = 0;

  // Master DSP Nodes
  private masterGain: GainNode | null = null;
  private highShelfNode: BiquadFilterNode | null = null;
  private mudScoopNode: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private midGainNode: GainNode | null = null;
  private sideGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Per-track Nodes
  private trackNodes: Map<number, { gain: GainNode; panner: StereoPannerNode }> = new Map();
  // Active audio buffer sources currently playing
  private activeSources: AudioBufferSourceNode[] = [];
  // Decoded or synthesized audio buffers keyed by clip ID
  public clipBuffers: Map<string, AudioBuffer> = new Map();

  // Playhead listener
  private onTimeUpdateCallback: ((timeMs: number) => void) | null = null;
  private animFrameId: number | null = null;

  constructor() {
    // Lazy initialized on first user gesture to comply with browser autoplay policy
  }

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass({ sampleRate: 44100 });
      this.setupMasterChain();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private setupMasterChain() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    this.highShelfNode = ctx.createBiquadFilter();
    this.highShelfNode.type = 'highshelf';
    this.highShelfNode.frequency.value = 12000;
    this.highShelfNode.gain.value = -2.5;

    this.mudScoopNode = ctx.createBiquadFilter();
    this.mudScoopNode.type = 'peaking';
    this.mudScoopNode.frequency.value = 300;
    this.mudScoopNode.Q.value = 1.5;
    this.mudScoopNode.gain.value = -3.0;

    this.compressorNode = ctx.createDynamicsCompressor();
    this.compressorNode.threshold.value = -16;
    this.compressorNode.ratio.value = 2.5;
    this.compressorNode.attack.value = 0.025;
    this.compressorNode.release.value = 0.12;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.analyserNode.smoothingTimeConstant = 0.8;

    // Connect DSP chain:
    // Track Nodes -> highShelfNode -> mudScoopNode -> compressorNode -> masterGain -> analyserNode -> destination
    this.highShelfNode.connect(this.mudScoopNode);
    this.mudScoopNode.connect(this.compressorNode);
    this.compressorNode.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);
  }

  public updateMasterDsp(dsp: MasterDspSettings) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    if (this.highShelfNode) {
      this.highShelfNode.frequency.setValueAtTime(dsp.eq_high_cut_hz, now);
      this.highShelfNode.gain.setValueAtTime(dsp.eq_high_cut_gain_db, now);
    }
    if (this.mudScoopNode) {
      this.mudScoopNode.frequency.setValueAtTime(dsp.eq_mud_scoop_hz, now);
      this.mudScoopNode.Q.setValueAtTime(dsp.eq_mud_scoop_q, now);
      this.mudScoopNode.gain.setValueAtTime(dsp.eq_mud_scoop_gain_db, now);
    }
    if (this.compressorNode) {
      this.compressorNode.threshold.setValueAtTime(dsp.comp_threshold_db, now);
      this.compressorNode.ratio.setValueAtTime(dsp.comp_ratio, now);
      this.compressorNode.attack.setValueAtTime(dsp.comp_attack_ms * 0.001, now);
      this.compressorNode.release.setValueAtTime(dsp.comp_release_ms * 0.001, now);
    }
    if (this.masterGain) {
      // Apply limiter threshold / ceiling
      const ceilingGain = dbToLinear(dsp.limiter_ceiling_db);
      this.masterGain.gain.setValueAtTime(ceilingGain, now);
    }
  }

  public updateTracks(tracks: TrackState[]) {
    const ctx = this.getAudioContext();
    const hasAnySolo = tracks.some((t) => t.solo);

    tracks.forEach((track, index) => {
      let nodeGroup = this.trackNodes.get(index);
      if (!nodeGroup) {
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        gain.connect(panner);
        if (this.highShelfNode) {
          panner.connect(this.highShelfNode);
        }
        nodeGroup = { gain, panner };
        this.trackNodes.set(index, nodeGroup);
      }

      // Calculate effective volume considering mute and solo
      let effectiveVol = track.volume;
      if (track.muted || (hasAnySolo && !track.solo)) {
        effectiveVol = 0;
      }

      const now = ctx.currentTime;
      nodeGroup.gain.gain.setValueAtTime(effectiveVol, now);
      nodeGroup.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan)), now);
    });
  }

  public play(
    startMs: number,
    clips: ClipState[],
    tracks: TrackState[],
    durationMs: number,
    onTimeUpdate: (ms: number) => void
  ) {
    const ctx = this.getAudioContext();
    this.stop();

    this.isPlaying = true;
    this.pausedAtMs = startMs;
    this.totalDurationMs = durationMs;
    this.startTime = ctx.currentTime - startMs / 1000;
    this.onTimeUpdateCallback = onTimeUpdate;

    this.updateTracks(tracks);

    // Schedule all clips that end after startMs
    clips.forEach((clip) => {
      const clipEndMs = clip.start_time_ms + clip.duration_ms;
      if (clipEndMs <= startMs) return;

      const trackNode = this.trackNodes.get(clip.track_index);
      if (!trackNode) return;

      const buffer = this.clipBuffers.get(clip.id);
      if (!buffer) return;

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      // Clip gain node for fade in/out and clip level
      const clipGain = ctx.createGain();
      clipGain.gain.value = clip.gain;

      // Apply fades if applicable
      const clipStartTimeSec = this.startTime + clip.start_time_ms / 1000;
      const fadeInSec = clip.fade_in_ms / 1000;
      const fadeOutSec = clip.fade_out_ms / 1000;
      const clipDurationSec = clip.duration_ms / 1000;

      if (fadeInSec > 0) {
        clipGain.gain.setValueAtTime(0, clipStartTimeSec);
        clipGain.gain.linearRampToValueAtTime(clip.gain, clipStartTimeSec + fadeInSec);
      }
      if (fadeOutSec > 0) {
        clipGain.gain.setValueAtTime(clip.gain, clipStartTimeSec + clipDurationSec - fadeOutSec);
        clipGain.gain.linearRampToValueAtTime(0, clipStartTimeSec + clipDurationSec);
      }

      src.connect(clipGain);
      clipGain.connect(trackNode.gain);

      // Compute scheduling offsets
      let when = ctx.currentTime;
      let offset = clip.offset_ms / 1000;
      let duration = clip.duration_ms / 1000;

      if (clip.start_time_ms >= startMs) {
        when = this.startTime + clip.start_time_ms / 1000;
      } else {
        // Clip already started, offset playback
        const elapsedSinceClipStartSec = (startMs - clip.start_time_ms) / 1000;
        offset += elapsedSinceClipStartSec;
        duration -= elapsedSinceClipStartSec;
      }

      if (duration > 0) {
        src.start(Math.max(ctx.currentTime, when), offset, duration);
        this.activeSources.push(src);
      }
    });

    this.startAnimationLoop();
  }

  public pause(): number {
    this.stopSources();
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    return this.pausedAtMs;
  }

  public stop() {
    this.stopSources();
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private stopSources() {
    this.activeSources.forEach((s) => {
      try {
        s.stop();
        s.disconnect();
      } catch {
        // Source might already have ended
      }
    });
    this.activeSources = [];
  }

  private startAnimationLoop() {
    const loop = () => {
      if (!this.isPlaying || !this.ctx) return;
      const currentMs = (this.ctx.currentTime - this.startTime) * 1000;
      this.pausedAtMs = currentMs;

      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(currentMs);
      }

      if (this.totalDurationMs > 0 && currentMs >= this.totalDurationMs) {
        this.stop();
        if (this.onTimeUpdateCallback) {
          this.onTimeUpdateCallback(0);
        }
        return;
      }

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public getAnalyserData(): { wave: Float32Array; freq: Uint8Array; lufs: number; peak: number } {
    if (!this.analyserNode) {
      return { wave: new Float32Array(0), freq: new Uint8Array(0), lufs: -70, peak: 0 };
    }
    const wave = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(wave);

    const freq = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(freq);

    let peak = 0;
    let sumSquare = 0;
    for (let i = 0; i < wave.length; i++) {
      const abs = Math.abs(wave[i]);
      if (abs > peak) peak = abs;
      sumSquare += abs * abs;
    }

    const meanSquare = sumSquare / wave.length;
    const lufs = meanSquare > 1e-7 ? -0.691 + 10 * Math.log10(meanSquare) : -70;

    return { wave, freq, lufs, peak };
  }

  /**
   * Synthesize high-fidelity audio buffers for default demo tracks.
   */
  public async createDemoBuffers(clips: ClipState[]): Promise<void> {
    const ctx = this.getAudioContext();
    const sampleRate = ctx.sampleRate;

    for (const clip of clips) {
      const length = Math.floor((clip.duration_ms / 1000) * sampleRate);
      const buffer = ctx.createBuffer(2, length, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      // Track-specific sound synthesis
      if (clip.track_index === 0) {
        // Track 0: Drum groove (Kick, snare, hi-hat rhythm at 120 BPM)
        const bpm = 120;
        const beatSec = 60 / bpm;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const beatPos = (t % beatSec) / beatSec;
          const barPos = Math.floor(t / beatSec) % 4;

          let kick = 0;
          let snare = 0;
          let hihat = 0;

          // Kick on 1 and 3
          if (barPos === 0 || barPos === 2) {
            if (beatPos < 0.25) {
              const env = Math.exp(-beatPos * 25);
              const freq = 130 * Math.exp(-beatPos * 30) + 45;
              kick = Math.sin(2 * Math.PI * freq * beatPos * beatSec) * env * 0.7;
            }
          }

          // Snare on 2 and 4
          if (barPos === 1 || barPos === 3) {
            if (beatPos < 0.2) {
              const env = Math.exp(-beatPos * 20);
              const noise = (Math.random() * 2 - 1) * 0.4;
              const tone = Math.sin(2 * Math.PI * 190 * beatPos * beatSec) * 0.5;
              snare = (noise + tone) * env * 0.6;
            }
          }

          // Hi-hat every 8th note
          const subBeatPos = (t % (beatSec / 2)) / (beatSec / 2);
          if (subBeatPos < 0.08) {
            const env = Math.exp(-subBeatPos * 50);
            hihat = (Math.random() * 2 - 1) * env * 0.25;
          }

          left[i] = kick + snare * 0.9 + hihat * 0.8;
          right[i] = kick + snare * 0.9 + hihat * 1.1;
        }
      } else if (clip.track_index === 1) {
        // Track 1: Sub Bass 808
        const notes = [55, 55, 65.4, 49.0]; // A1, A1, C2, G1
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const noteIdx = Math.floor(t / 2) % notes.length;
          const freq = notes[noteIdx];
          const sub = Math.sin(2 * Math.PI * freq * t);
          const harm = Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
          const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t);
          const val = (sub + harm) * 0.45 * env;
          left[i] = val;
          right[i] = val;
        }
      } else if (clip.track_index === 2) {
        // Track 2: Warm Analog Chords
        const chords = [
          [220, 261.63, 329.63], // Am
          [174.61, 220, 261.63], // F
          [261.63, 329.63, 392], // C
          [196, 246.94, 293.66], // G
        ];
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const chordIdx = Math.floor(t / 2) % chords.length;
          const chord = chords[chordIdx];
          let valL = 0;
          let valR = 0;
          chord.forEach((freq, idx) => {
            const detune = 1 + (idx - 1) * 0.003;
            valL += Math.sin(2 * Math.PI * freq * t) * 0.12;
            valR += Math.sin(2 * Math.PI * (freq * detune) * t) * 0.12;
          });
          left[i] = valL;
          right[i] = valR;
        }
      } else {
        // Track 3: Atmospheric Texture / Vocal Pad
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const shimmer = Math.sin(2 * Math.PI * 440 * t) * Math.sin(2 * Math.PI * 3 * t) * 0.1;
          const air = (Math.random() * 2 - 1) * 0.03;
          left[i] = shimmer * 0.8 + air;
          right[i] = shimmer * 1.2 + air;
        }
      }

      this.clipBuffers.set(clip.id, buffer);
    }
  }

  /**
   * Loads an uploaded audio file into an AudioBuffer.
   */
  public async loadAudioFile(file: File): Promise<AudioBuffer> {
    const ctx = this.getAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  }
}

export const audioEngine = new AudioEngine();
