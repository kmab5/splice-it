import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MasterDspSettings, MetadataDto } from '../types/project';
import { calculateEqResponse } from '../services/dspMath';

// Display bounds for the EQ curve.
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 18;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
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

interface EqParamProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  accent: string;
  onChange: (value: number) => void;
}

const EqParam: React.FC<EqParamProps> = ({
  label,
  value,
  min,
  max,
  step,
  display,
  accent,
  onChange,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[9px] text-slate-500 w-7 shrink-0 font-mono uppercase">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`flex-1 min-w-0 ${accent} h-1 bg-slate-800 rounded cursor-pointer`}
    />
    <span className="text-[9px] font-mono text-slate-300 w-11 text-right shrink-0">{display}</span>
  </div>
);

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

  const eqWrapRef = useRef<HTMLDivElement>(null);
  const [eqSize, setEqSize] = useState<{ w: number; h: number }>({ w: 440, h: 140 });
  const [dragNode, setDragNode] = useState<'shelf' | 'bell' | null>(null);
  const [hoverNode, setHoverNode] = useState<'shelf' | 'bell' | null>(null);

  // The canvas backing store was hardcoded to 140px tall while the element is
  // stretched by flex, so the curve was drawn at the wrong scale and never
  // redrew when the dock was resized.
  useEffect(() => {
    const wrap = eqWrapRef.current;
    if (!wrap) return;

    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      setEqSize({ w: Math.max(120, rect.width), h: Math.max(80, rect.height) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const freqToX = useCallback(
    (freq: number) => ((Math.log10(freq) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * eqSize.w,
    [eqSize.w]
  );
  const xToFreq = useCallback(
    (x: number) => Math.pow(10, LOG_MIN + (clamp(x, 0, eqSize.w) / eqSize.w) * (LOG_MAX - LOG_MIN)),
    [eqSize.w]
  );
  const dbToY = useCallback(
    (db: number) => eqSize.h / 2 - (db / DB_RANGE) * (eqSize.h / 2 - 10),
    [eqSize.h]
  );
  const yToDb = useCallback(
    (y: number) => ((eqSize.h / 2 - y) / (eqSize.h / 2 - 10)) * DB_RANGE,
    [eqSize.h]
  );

  // Draw the frequency response curve
  useEffect(() => {
    const canvas = eqCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w: width, h: height } = eqSize;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // dB grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.font = '9px monospace';
    [12, 6, 0, -6, -12].forEach((db) => {
      const y = dbToY(db);
      ctx.strokeStyle = db === 0 ? '#334155' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, width - 4, y - 2);
    });

    // Frequency grid
    ctx.strokeStyle = '#1e293b';
    [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((freq) => {
      const x = freqToX(freq);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x, height - 4);
    });

    // Response curve, sampled per pixel
    const numPoints = Math.max(60, Math.floor(width));
    const freqs: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      freqs.push(Math.pow(10, LOG_MIN + (i / (numPoints - 1)) * (LOG_MAX - LOG_MIN)));
    }

    const responses = calculateEqResponse(freqs, 44100, {
      highCutHz: settings.eq_high_cut_hz,
      highCutGainDb: settings.eq_high_cut_gain_db,
      mudScoopHz: settings.eq_mud_scoop_hz,
      mudScoopQ: settings.eq_mud_scoop_q,
      mudScoopGainDb: settings.eq_mud_scoop_gain_db,
    });

    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * width;
      const y = dbToY(responses[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fill under the curve, down to the 0 dB line
    ctx.lineTo(width, dbToY(0));
    ctx.lineTo(0, dbToY(0));
    ctx.closePath();
    const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
    fillGrad.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
    fillGrad.addColorStop(1, 'rgba(6, 182, 212, 0.03)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Draggable control nodes
    const drawNode = (x: number, y: number, color: string, active: boolean) => {
      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, active ? 7 : 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    drawNode(
      freqToX(settings.eq_mud_scoop_hz),
      dbToY(settings.eq_mud_scoop_gain_db),
      '#06b6d4',
      dragNode === 'bell' || hoverNode === 'bell'
    );
    drawNode(
      freqToX(settings.eq_high_cut_hz),
      dbToY(settings.eq_high_cut_gain_db),
      '#10b981',
      dragNode === 'shelf' || hoverNode === 'shelf'
    );
  }, [settings, eqSize, dragNode, hoverNode, freqToX, dbToY]);

  // ---- Pointer interaction on the EQ curve --------------------------------

  const nodeAt = useCallback(
    (x: number, y: number): 'shelf' | 'bell' | null => {
      const near = (nx: number, ny: number) => Math.hypot(x - nx, y - ny) <= 14;
      if (near(freqToX(settings.eq_mud_scoop_hz), dbToY(settings.eq_mud_scoop_gain_db))) {
        return 'bell';
      }
      if (near(freqToX(settings.eq_high_cut_hz), dbToY(settings.eq_high_cut_gain_db))) {
        return 'shelf';
      }
      return null;
    },
    [settings, freqToX, dbToY]
  );

  const localPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const applyDrag = useCallback(
    (node: 'shelf' | 'bell', x: number, y: number) => {
      const freq = xToFreq(x);
      const gainDb = clamp(yToDb(y), -12, 6);

      if (node === 'bell') {
        onUpdateSettings({
          eq_mud_scoop_hz: Math.round(clamp(freq, 60, 2000)),
          eq_mud_scoop_gain_db: Number(gainDb.toFixed(1)),
        });
      } else {
        onUpdateSettings({
          eq_high_cut_hz: Math.round(clamp(freq, 2000, 20000)),
          eq_high_cut_gain_db: Number(gainDb.toFixed(1)),
        });
      }
    },
    [onUpdateSettings, xToFreq, yToDb]
  );

  const handleEqMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(e);
    const hit = nodeAt(x, y);
    if (!hit) return;
    e.preventDefault();
    setDragNode(hit);
    applyDrag(hit, x, y);
  };

  const handleEqMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(e);
    if (dragNode) {
      applyDrag(dragNode, x, y);
      return;
    }
    setHoverNode(nodeAt(x, y));
  };

  const endEqDrag = () => {
    setDragNode(null);
    setHoverNode(null);
  };

  /** Scrolling over the bell node changes its Q. */
  const handleEqWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(e);
    if (nodeAt(x, y) !== 'bell') return;
    e.preventDefault();
    const next = settings.eq_mud_scoop_q * (e.deltaY < 0 ? 1.12 : 0.89);
    onUpdateSettings({ eq_mud_scoop_q: Number(clamp(next, 0.3, 8).toFixed(2)) });
  };

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

      {/* Middle Column: Parametric EQ Curve + Controls */}
      <div className="flex-1 p-4 flex flex-col bg-[#0F172A] overflow-hidden min-w-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Parametric EQ
          </span>
          <div className="flex items-center gap-2.5 text-[9px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              High Shelf
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              Bell
            </span>
            <span className="text-slate-600">drag nodes &middot; scroll bell for Q</span>
          </div>
        </div>

        {/* Interactive Canvas */}
        <div
          ref={eqWrapRef}
          className="flex-1 border border-slate-800 rounded relative bg-black/40 overflow-hidden min-h-[90px]"
        >
          <canvas
            ref={eqCanvasRef}
            style={{
              width: '100%',
              height: '100%',
              cursor: dragNode ? 'grabbing' : hoverNode ? 'grab' : 'default',
            }}
            className="block"
            onMouseDown={handleEqMouseDown}
            onMouseMove={handleEqMouseMove}
            onMouseUp={endEqDrag}
            onMouseLeave={endEqDrag}
            onWheel={handleEqWheel}
            onDoubleClick={() =>
              onUpdateSettings({ eq_high_cut_gain_db: 0, eq_mud_scoop_gain_db: 0 })
            }
            title="Drag a node to move it. Scroll over the bell to change Q. Double-click to flatten."
          />
        </div>

        {/* EQ Controls — these did not exist before, so the five eq_* settings
            were unreachable from the UI entirely. */}
        <div className="shrink-0 mt-2.5 grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-1.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              High Shelf
            </div>
            <EqParam
              label="Freq"
              value={settings.eq_high_cut_hz}
              min={2000}
              max={20000}
              step={100}
              accent="accent-emerald-500"
              display={
                settings.eq_high_cut_hz >= 1000
                  ? `${(settings.eq_high_cut_hz / 1000).toFixed(1)}k`
                  : `${settings.eq_high_cut_hz}`
              }
              onChange={(v) => onUpdateSettings({ eq_high_cut_hz: v })}
            />
            <EqParam
              label="Gain"
              value={settings.eq_high_cut_gain_db}
              min={-12}
              max={6}
              step={0.1}
              accent="accent-emerald-500"
              display={`${settings.eq_high_cut_gain_db > 0 ? '+' : ''}${settings.eq_high_cut_gain_db.toFixed(1)}dB`}
              onChange={(v) => onUpdateSettings({ eq_high_cut_gain_db: v })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-cyan-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              Bell / Mud Scoop
            </div>
            <EqParam
              label="Freq"
              value={settings.eq_mud_scoop_hz}
              min={60}
              max={2000}
              step={5}
              accent="accent-cyan-400"
              display={`${settings.eq_mud_scoop_hz}Hz`}
              onChange={(v) => onUpdateSettings({ eq_mud_scoop_hz: v })}
            />
            <EqParam
              label="Gain"
              value={settings.eq_mud_scoop_gain_db}
              min={-12}
              max={6}
              step={0.1}
              accent="accent-cyan-400"
              display={`${settings.eq_mud_scoop_gain_db > 0 ? '+' : ''}${settings.eq_mud_scoop_gain_db.toFixed(1)}dB`}
              onChange={(v) => onUpdateSettings({ eq_mud_scoop_gain_db: v })}
            />
            <EqParam
              label="Q"
              value={settings.eq_mud_scoop_q}
              min={0.3}
              max={8}
              step={0.1}
              accent="accent-cyan-400"
              display={settings.eq_mud_scoop_q.toFixed(2)}
              onChange={(v) => onUpdateSettings({ eq_mud_scoop_q: v })}
            />
          </div>
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
