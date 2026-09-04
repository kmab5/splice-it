import { MasterDspSettings, TrackState, ClipState } from '../types/project';
import { dbToLinear } from './dspMath';

/**
 * Web Audio playback engine.
 *
 * Decoded audio is cached by SOURCE PATH, not by clip id, so any number of
 * clips referencing the same file share one AudioBuffer. Nothing in here
 * synthesizes audio: if a source has not been registered, the clip is silent
 * and the caller is expected to load it.
 */
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
  private analyserNode: AnalyserNode | null = null;

  // Per-track nodes, keyed by track index
  private trackNodes: Map<number, { gain: GainNode; panner: StereoPannerNode }> = new Map();
  private activeSources: AudioBufferSourceNode[] = [];

  /** Decoded source audio, keyed by absolute path (or `browser://` key). */
  public sourceBuffers: Map<string, AudioBuffer> = new Map();

  // Audition preview
  private auditionSource: AudioBufferSourceNode | null = null;

  /** When true, track output skips the EQ and compressor (monitoring only). */
  private monitorBypass: boolean = false;

  private onTimeUpdateCallback: ((timeMs: number) => void) | null = null;
  private animFrameId: number | null = null;

  public getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.setupMasterChain();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
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

    this.highShelfNode.connect(this.mudScoopNode);
    this.mudScoopNode.connect(this.compressorNode);
    this.compressorNode.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);
  }

  // -------------------------------------------------------------------------
  // Source registration
  // -------------------------------------------------------------------------

  public hasSource(path: string): boolean {
    return this.sourceBuffers.has(path);
  }

  public getSource(path: string): AudioBuffer | undefined {
    return this.sourceBuffers.get(path);
  }

  /** Decode raw file bytes and cache them under the given path key. */
  public async registerSource(path: string, bytes: ArrayBuffer): Promise<AudioBuffer> {
    const existing = this.sourceBuffers.get(path);
    if (existing) return existing;

    const ctx = this.getAudioContext();
    // decodeAudioData detaches the buffer it is given, so hand it a copy.
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    this.sourceBuffers.set(path, buffer);
    return buffer;
  }

  /** Browser fallback: decode a File object picked through an <input>. */
  public async registerSourceFromFile(path: string, file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return this.registerSource(path, arrayBuffer);
  }

  public removeSource(path: string) {
    this.sourceBuffers.delete(path);
  }

  // -------------------------------------------------------------------------
  // Master + track parameters
  // -------------------------------------------------------------------------

  public updateMasterDsp(dsp: MasterDspSettings) {
    // Previously this bailed out when the context did not exist yet, so EQ
    // changes made before the first playback were dropped on the floor.
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

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
      this.masterGain.gain.setValueAtTime(dbToLinear(dsp.limiter_ceiling_db), now);
    }
  }

  /** Node that track output feeds into, honouring the monitor bypass. */
  private busInput(): AudioNode | null {
    if (this.monitorBypass) return this.analyserNode;
    return this.highShelfNode;
  }

  /**
   * Route playback around the master EQ and compressor so the chain can be
   * A/B'd by ear. This affects monitoring only, never the exported file.
   */
  public setMonitorBypass(bypass: boolean) {
    this.monitorBypass = bypass;
    const target = this.busInput();
    if (!target) return;

    this.trackNodes.forEach(({ panner }) => {
      try {
        panner.disconnect();
      } catch {
        // Not connected yet.
      }
      panner.connect(target);
    });
  }

  public isMonitorBypassed(): boolean {
    return this.monitorBypass;
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
        const busTarget = this.busInput();
        if (busTarget) {
          panner.connect(busTarget);
        }
        nodeGroup = { gain, panner };
        this.trackNodes.set(index, nodeGroup);
      }

      let effectiveVol = track.volume;
      if (track.muted || (hasAnySolo && !track.solo)) {
        effectiveVol = 0;
      }

      const now = ctx.currentTime;
      nodeGroup.gain.gain.setValueAtTime(effectiveVol, now);
      nodeGroup.panner.pan.setValueAtTime(Math.max(-1, Math.min(1, track.pan)), now);
    });
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

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

    clips.forEach((clip) => {
      const clipEndMs = clip.start_time_ms + clip.duration_ms;
      if (clipEndMs <= startMs) return;

      const trackNode = this.trackNodes.get(clip.track_index);
      if (!trackNode) return;

      const buffer = this.sourceBuffers.get(clip.source_path);
      // No decoded audio for this source yet: stay silent rather than fake it.
      if (!buffer) return;

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const clipGain = ctx.createGain();
      clipGain.gain.value = clip.gain;

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

      let when = ctx.currentTime;
      let offset = clip.offset_ms / 1000;
      let duration = clip.duration_ms / 1000;

      if (clip.start_time_ms >= startMs) {
        when = this.startTime + clip.start_time_ms / 1000;
      } else {
        const elapsedSinceClipStartSec = (startMs - clip.start_time_ms) / 1000;
        offset += elapsedSinceClipStartSec;
        duration -= elapsedSinceClipStartSec;
      }

      // Never ask the source for audio past the end of the decoded buffer.
      const available = Math.max(0, buffer.duration - offset);
      duration = Math.min(duration, available);

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
        // Source may already have ended.
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

  // -------------------------------------------------------------------------
  // Audition preview (audio pool)
  // -------------------------------------------------------------------------

  /** Play a pool source straight to the destination. Returns false if not loaded. */
  public startAudition(path: string, onEnded: () => void): boolean {
    const buffer = this.sourceBuffers.get(path);
    if (!buffer) return false;

    const ctx = this.getAudioContext();
    this.stopAudition();

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (this.auditionSource === src) this.auditionSource = null;
      onEnded();
    };
    src.start();
    this.auditionSource = src;
    return true;
  }

  public stopAudition() {
    if (this.auditionSource) {
      try {
        this.auditionSource.onended = null;
        this.auditionSource.stop();
        this.auditionSource.disconnect();
      } catch {
        // Already stopped.
      }
      this.auditionSource = null;
    }
  }

  // -------------------------------------------------------------------------
  // Concat sequence preview
  // -------------------------------------------------------------------------

  /**
   * Play an ordered sequence of already-decoded sources back to back.
   *
   * `throughMasterChain` mirrors the export setting: with it off the audio goes
   * straight to the output so the preview matches a plain join.
   */
  public playSequence(
    items: {
      source_path: string;
      startMs: number;
      gain: number;
      fadeInMs: number;
      fadeOutMs: number;
    }[],
    startMs: number,
    totalMs: number,
    throughMasterChain: boolean,
    onTimeUpdate: (ms: number) => void
  ) {
    const ctx = this.getAudioContext();
    this.stop();

    const destination: AudioNode =
      throughMasterChain && this.highShelfNode
        ? this.highShelfNode
        : this.analyserNode ?? ctx.destination;

    this.isPlaying = true;
    this.pausedAtMs = startMs;
    this.totalDurationMs = totalMs;
    this.startTime = ctx.currentTime - startMs / 1000;
    this.onTimeUpdateCallback = onTimeUpdate;

    for (const item of items) {
      const buffer = this.sourceBuffers.get(item.source_path);
      if (!buffer) continue;

      const itemDurationSec = buffer.duration;
      const itemEndMs = item.startMs + itemDurationSec * 1000;
      if (itemEndMs <= startMs) continue;

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = item.gain;

      const itemStartSec = this.startTime + item.startMs / 1000;
      if (item.fadeInMs > 0) {
        gainNode.gain.setValueAtTime(0, itemStartSec);
        gainNode.gain.linearRampToValueAtTime(item.gain, itemStartSec + item.fadeInMs / 1000);
      }
      if (item.fadeOutMs > 0) {
        const fadeStart = itemStartSec + itemDurationSec - item.fadeOutMs / 1000;
        gainNode.gain.setValueAtTime(item.gain, fadeStart);
        gainNode.gain.linearRampToValueAtTime(0, itemStartSec + itemDurationSec);
      }

      src.connect(gainNode);
      gainNode.connect(destination);

      let when = itemStartSec;
      let offset = 0;
      if (item.startMs < startMs) {
        offset = (startMs - item.startMs) / 1000;
        when = ctx.currentTime;
      }

      if (offset < itemDurationSec) {
        src.start(Math.max(ctx.currentTime, when), offset);
        this.activeSources.push(src);
      }
    }

    this.startAnimationLoop();
  }

  // -------------------------------------------------------------------------
  // Metering
  // -------------------------------------------------------------------------

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

    const meanSquare = sumSquare / Math.max(1, wave.length);
    const lufs = meanSquare > 1e-7 ? -0.691 + 10 * Math.log10(meanSquare) : -70;

    return { wave, freq, lufs, peak };
  }
}

export const audioEngine = new AudioEngine();
