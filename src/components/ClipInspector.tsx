import React from 'react';
import { ClipState, TrackState } from '../types/project';
import { Scissors, Copy, Trash2, Sliders, PlayCircle } from 'lucide-react';
import { linearToDb, dbToLinear } from '../services/dspMath';

interface ClipInspectorProps {
  clip: ClipState | null;
  tracks: TrackState[];
  currentTimeMs: number;
  onUpdateClip: (clipId: string, updates: Partial<ClipState>) => void;
  onSplitClip: (clipId: string, splitAtMs: number) => void;
  onDeleteClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
}

export const ClipInspector: React.FC<ClipInspectorProps> = ({
  clip,
  tracks,
  currentTimeMs,
  onUpdateClip,
  onSplitClip,
  onDeleteClip,
  onDuplicateClip,
}) => {
  if (!clip) {
    return (
      <div
        id="clip-inspector-empty"
        className="h-full bg-slate-900/95 flex flex-col items-center justify-center text-slate-500 select-none p-4"
      >
        <Sliders className="w-8 h-8 mb-2 text-slate-700" />
        <span className="text-xs font-medium">No Clip Selected</span>
        <span className="text-[11px] text-slate-600 mt-1">
          Click on any audio clip in the timeline to view non-destructive trim, fades, and gain.
        </span>
      </div>
    );
  }

  const gainDb = linearToDb(clip.gain);
  const canSplit =
    currentTimeMs > clip.start_time_ms && currentTimeMs < clip.start_time_ms + clip.duration_ms;

  return (
    <div
      id="clip-inspector"
      className="h-full bg-slate-900/95 p-4 overflow-y-auto text-slate-200 select-none"
    >
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Top Header: Clip Name & Action Bar */}
        <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-lg border border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 rounded-full bg-cyan-400" />
            <div>
              <input
                type="text"
                value={clip.name}
                onChange={(e) => onUpdateClip(clip.id, { name: e.target.value })}
                className="text-sm font-bold text-slate-100 bg-transparent hover:bg-slate-900 focus:bg-slate-900 px-1.5 py-0.5 rounded focus:outline-none"
              />
              <div className="text-[10px] text-slate-500 font-mono pl-1.5">
                ID: {clip.id.slice(0, 8)} • Source: {clip.source_path.split('/').pop() || 'stem.wav'}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onSplitClip(clip.id, currentTimeMs)}
              disabled={!canSplit}
              title={
                canSplit
                  ? 'Split Clip at Current Playhead (S)'
                  : 'Move playhead over this clip to split'
              }
              className={`flex items-center space-x-1 px-2.5 py-1 text-xs rounded border transition ${
                canSplit
                  ? 'bg-slate-800 text-amber-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Split (S)</span>
            </button>

            <button
              onClick={() => onDuplicateClip(clip.id)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 rounded transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>

            <button
              onClick={() => onDeleteClip(clip.id)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-rose-950/40 text-rose-400 border border-rose-900/60 hover:bg-rose-900/60 rounded transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {/* Form Grid: Non-Destructive Assembly Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Start Time */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Start Time (ms)
            </label>
            <input
              type="number"
              value={Math.round(clip.start_time_ms)}
              onChange={(e) =>
                onUpdateClip(clip.id, { start_time_ms: Math.max(0, Number(e.target.value)) })
              }
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[9px] text-slate-500 font-mono mt-1 block">
              {(clip.start_time_ms / 1000).toFixed(3)}s
            </span>
          </div>

          {/* Duration */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Duration (ms)
            </label>
            <input
              type="number"
              value={Math.round(clip.duration_ms)}
              onChange={(e) =>
                onUpdateClip(clip.id, { duration_ms: Math.max(100, Number(e.target.value)) })
              }
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[9px] text-slate-500 font-mono mt-1 block">
              {(clip.duration_ms / 1000).toFixed(3)}s
            </span>
          </div>

          {/* Source Offset / Trim In */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Trim Offset (ms)
            </label>
            <input
              type="number"
              value={Math.round(clip.offset_ms)}
              onChange={(e) =>
                onUpdateClip(clip.id, { offset_ms: Math.max(0, Number(e.target.value)) })
              }
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
            <span className="text-[9px] text-slate-500 font-mono mt-1 block">
              {(clip.offset_ms / 1000).toFixed(3)}s
            </span>
          </div>

          {/* Assigned Track */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              Assigned Track
            </label>
            <select
              value={clip.track_index}
              onChange={(e) => onUpdateClip(clip.id, { track_index: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {tracks.map((t, idx) => (
                <option key={t.id} value={idx}>
                  Track {idx + 1}: {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Envelopes: Gain & Fades */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Clip Gain */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Clip Gain (dB)
              </label>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">
                {gainDb >= 0 ? '+' : ''}
                {gainDb.toFixed(1)} dB
              </span>
            </div>
            <input
              type="range"
              min="-24"
              max="6"
              step="0.5"
              value={gainDb}
              onChange={(e) => onUpdateClip(clip.id, { gain: dbToLinear(Number(e.target.value)) })}
              className="w-full accent-emerald-400 h-1 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          {/* Fade In (ms) */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Fade In (ms)
              </label>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">
                {Math.round(clip.fade_in_ms)} ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2000"
              step="20"
              value={clip.fade_in_ms}
              onChange={(e) => onUpdateClip(clip.id, { fade_in_ms: Number(e.target.value) })}
              className="w-full accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
            />
          </div>

          {/* Fade Out (ms) */}
          <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Fade Out (ms)
              </label>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">
                {Math.round(clip.fade_out_ms)} ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2000"
              step="20"
              value={clip.fade_out_ms}
              onChange={(e) => onUpdateClip(clip.id, { fade_out_ms: Number(e.target.value) })}
              className="w-full accent-cyan-400 h-1 bg-slate-800 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
