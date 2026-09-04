import React, { useRef, useEffect } from 'react';
import { MasterDspSettings, MetadataDto } from '../types/project';
import { calculateEqResponse } from '../services/dspMath';
import { Gauge, Sliders, Activity, Disc3, ShieldCheck, Check, Upload } from 'lucide-react';

interface MasteringRackProps {
  settings: MasterDspSettings;
  liveLufs: number;
  livePeak: number;
  onUpdateSettings: (updates: Partial<MasterDspSettings>) => void;
  metadata?: MetadataDto;
  onUpdateMetadata?: (updates: Partial<MetadataDto>) => void;
  activeTab?: 'dsp' | 'metadata' | 'clip';
  onSelectTab?: (tab: 'dsp' | 'metadata' | 'clip') => void;
}

export const MasteringRack: React.FC<MasteringRackProps> = ({
  settings,
  liveLufs,
  livePeak,
  onUpdateSettings,
  metadata,
  onUpdateMetadata,
  activeTab = 'dsp',
  onSelectTab,
}) => {
  const eqCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpdateMetadata) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        onUpdateMetadata({
          cover_art_base64: base64,
          cover_art_mime: file.type || 'image/jpeg',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Draw Interactive Frequency Response Curve
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 440;
    const height = 140;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Grid: dB levels (+12dB, +6dB, 0dB, -6dB, -12dB)
    const dbLevels = [12, 6, 0, -6, -12];
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#475569';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';

    dbLevels.forEach((db) => {
      // Map [-18dB, +18dB] to [height, 0]
      const y = height / 2 - (db / 18) * (height / 2 - 10);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, width - 6, y - 2);
    });

    // Frequency Grid: 100Hz, 1kHz, 10kHz
    const freqMarkers = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);

    freqMarkers.forEach((freq) => {
      const x = ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, height - 4);
    });

    // Sample points along the frequency scale
    const numPoints = 120;
    const freqs: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      const p = i / (numPoints - 1);
      const f = Math.pow(10, logMin + p * (logMax - logMin));
      freqs.push(f);
    }

    const responses = calculateEqResponse(freqs, 44100, {
      highCutHz: settings.eq_high_cut_hz,
      highCutGainDb: settings.eq_high_cut_gain_db,
      mudScoopHz: settings.eq_mud_scoop_hz,
      mudScoopQ: settings.eq_mud_scoop_q,
      mudScoopGainDb: settings.eq_mud_scoop_gain_db,
    });

    // Draw Response Curve with Gradient Fill
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * width;
      const db = responses[i];
      const y = height / 2 - (db / 18) * (height / 2 - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Glow stroke
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(width, height / 2);
    ctx.lineTo(0, height / 2);
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
    fillGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    fillGrad.addColorStop(1, 'rgba(6, 182, 212, 0.02)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Draw interactive node pins:
    // 1. Mud Scoop node pin (200-400Hz)
    const mudX = ((Math.log10(settings.eq_mud_scoop_hz) - logMin) / (logMax - logMin)) * width;
    const mudY = height / 2 - (settings.eq_mud_scoop_gain_db / 18) * (height / 2 - 10);
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(mudX, mudY, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. High Shelf node pin (12kHz)
    const hsX = ((Math.log10(settings.eq_high_cut_hz) - logMin) / (logMax - logMin)) * width;
    const hsY = height / 2 - (settings.eq_high_cut_gain_db / 18) * (height / 2 - 10);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(hsX, hsY, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [settings]);

  return (
    <div
      id="mastering-dsp-rack"
      className="h-full bg-[#0F172A] flex shrink-0 divide-x divide-slate-800 text-slate-200 select-none overflow-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Left Column: Tabs & Mastering Quick Controls */}
      <div className="w-80 flex flex-col shrink-0">
        <div className="flex border-b border-slate-800 shrink-0">
          <button
            id="tab-btn-mastering"
            onClick={() => onSelectTab?.('dsp')}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-bold transition-colors ${
              activeTab === 'dsp'
                ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Mastering Rack
          </button>
          <button
            id="tab-btn-tags"
            onClick={() => onSelectTab?.('metadata')}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-medium transition-colors ${
              activeTab === 'metadata'
                ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Tags
          </button>
          <button
            id="tab-btn-inspector"
            onClick={() => onSelectTab?.('clip')}
            className={`px-4 py-2 text-[10px] uppercase tracking-widest font-medium transition-colors ${
              activeTab === 'clip'
                ? 'border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Inspector
          </button>
        </div>

        <div className="p-4 space-y-3.5 flex-1 overflow-y-auto">
          {/* Stereo Width */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Stereo Width</span>
            <div className="flex items-center gap-2">
              <input
                id="input-stereo-width"
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={settings.stereo_width}
                onChange={(e) => onUpdateSettings({ stereo_width: Number(e.target.value) })}
                className="w-28 accent-emerald-500 h-1.5 bg-slate-800 rounded-full cursor-pointer"
              />
              <span className="text-[10px] font-mono text-emerald-400 w-9 text-right font-medium">
                {Math.round(settings.stereo_width * 100)}%
              </span>
            </div>
          </div>

          {/* Limiter Ceiling */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Limiter Ceiling</span>
            <div className="flex items-center gap-2">
              <input
                id="input-limiter-ceiling"
                type="range"
                min="-2.0"
                max="0.0"
                step="0.1"
                value={settings.limiter_ceiling_db}
                onChange={(e) => onUpdateSettings({ limiter_ceiling_db: Number(e.target.value) })}
                className="w-28 accent-rose-500 h-1.5 bg-slate-800 rounded-full cursor-pointer"
              />
              <span className="text-[10px] font-mono text-rose-400 w-12 text-right font-medium">
                {settings.limiter_ceiling_db.toFixed(1)} dB
              </span>
            </div>
          </div>

          {/* LUFS Target */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">LUFS Target</span>
            <div className="flex items-center gap-2">
              <input
                id="input-lufs-target"
                type="range"
                min="-24"
                max="-8"
                step="0.5"
                value={settings.target_lufs}
                onChange={(e) => onUpdateSettings({ target_lufs: Number(e.target.value) })}
                className="w-28 accent-slate-400 h-1.5 bg-slate-800 rounded-full cursor-pointer"
              />
              <span className="text-[10px] font-mono text-slate-400 w-9 text-right font-medium">
                {settings.target_lufs.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Dynamics Quick Controls */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Compressor</span>
              <span className="font-mono text-[10px] text-cyan-400">
                {settings.comp_threshold_db.toFixed(0)}dB | {settings.comp_ratio.toFixed(1)}:1
              </span>
            </div>
            <div className="flex gap-2">
              <input
                id="input-comp-threshold"
                type="range"
                min="-36"
                max="0"
                step="1"
                value={settings.comp_threshold_db}
                onChange={(e) => onUpdateSettings({ comp_threshold_db: Number(e.target.value) })}
                title="Threshold"
                className="flex-1 accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
              />
              <input
                id="input-comp-ratio"
                type="range"
                min="1.2"
                max="8"
                step="0.2"
                value={settings.comp_ratio}
                onChange={(e) => onUpdateSettings({ comp_ratio: Number(e.target.value) })}
                title="Ratio"
                className="flex-1 accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Middle Column: Parametric EQ Curve */}
      <div className="flex-1 p-4 flex flex-col bg-[#0F172A] overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Parametric EQ Curve
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              <span>12k Cut</span>
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block ml-1"></span>
              <span>Mud Scoop</span>
              <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block ml-1"></span>
              <span>IIR BiQuad</span>
            </div>
          </div>
        </div>

        {/* Responsive Interactive Canvas */}
        <div className="flex-1 border border-slate-800 rounded relative bg-black/40 overflow-hidden min-h-[90px]">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(#475569 1px, transparent 1px), linear-gradient(90deg, #475569 1px, transparent 1px)',
              backgroundSize: '25% 25%',
            }}
          />
          <canvas ref={eqCanvasRef} className="w-full h-full block" />
        </div>

        {/* Frequency Axis Footer */}
        <div className="flex justify-between items-center mt-2 text-[10px] font-mono text-slate-500">
          <span>20 Hz</span>
          <span>100 Hz</span>
          <span>1 kHz</span>
          <span className="text-emerald-400 font-semibold">10 kHz</span>
          <span>20 kHz</span>
        </div>
      </div>

      {/* Right Column: Metadata Inspector */}
      <div className="w-72 md:w-80 p-4 flex flex-col bg-[#0F172A] shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Metadata Inspector
          </span>
          {onSelectTab && (
            <button
              onClick={() => onSelectTab('metadata')}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 transition"
            >
              All Tags →
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[9px] uppercase tracking-wider text-slate-500 block mb-1">
              Track Title
            </label>
            <input
              id="metadata-quick-title"
              type="text"
              value={metadata?.title || ''}
              onChange={(e) => onUpdateMetadata?.({ title: e.target.value })}
              placeholder="Track Title"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500/50 font-medium"
            />
          </div>

          <div>
            <label className="text-[9px] uppercase tracking-wider text-slate-500 block mb-1">
              Artist / Performer
            </label>
            <input
              id="metadata-quick-artist"
              type="text"
              value={metadata?.artist || ''}
              onChange={(e) => onUpdateMetadata?.({ artist: e.target.value })}
              placeholder="Artist / Performer"
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-emerald-500/50 font-medium"
            />
          </div>

          <div className="flex gap-2.5 pt-1">
            <div
              id="metadata-art-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 bg-slate-800 rounded border border-slate-700 flex items-center justify-center text-[10px] text-slate-500 font-bold text-center p-1 uppercase tracking-tighter italic cursor-pointer overflow-hidden group hover:border-emerald-500/60 transition shrink-0"
              title="Click to drop cover artwork"
            >
              {metadata?.cover_art_base64 ? (
                <img
                  src={`data:${metadata.cover_art_mime || 'image/jpeg'};base64,${metadata.cover_art_base64}`}
                  alt="Cover"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[9px] text-slate-500 group-hover:text-emerald-400 transition">
                  Square Art Drop
                </span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center min-w-0">
              <span className="text-xs font-medium text-slate-300 truncate">
                {metadata?.title ? `${metadata.title}.wav` : 'Master_Audio.wav'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {metadata?.cover_art_base64 ? 'Embedded JPG - 1.2MB' : 'No Cover Embedded'}
              </span>
              <span className="text-[9px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                <Check className="w-3 h-3 text-emerald-400 inline" /> Attached to ID3v2
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
