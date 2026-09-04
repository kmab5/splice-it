import React from 'react';
import { Trash2 } from 'lucide-react';
import { TrackState } from '../types/project';
import { linearToDb } from '../services/dspMath';
import { hexToRgba } from '../utils/trackColors';

interface TrackHeaderProps {
  track: TrackState;
  index: number;
  isSelected?: boolean;
  isCollapsed?: boolean;
  onSelectTrack?: (index: number) => void;
  onUpdateTrack: (index: number, updates: Partial<TrackState>) => void;
  onDeleteTrack: (index: number) => void;
  /** Opens the colour picker, anchored to the swatch that was clicked. */
  onOpenColorPicker?: (index: number, anchor: DOMRect) => void;
  /** Right-click on this specific header, so the menu knows which track it is. */
  onContextMenu?: (index: number, clientX: number, clientY: number) => void;
}

export const TrackHeader: React.FC<TrackHeaderProps> = ({
  track,
  index,
  isSelected = false,
  isCollapsed = false,
  onSelectTrack,
  onUpdateTrack,
  onDeleteTrack,
  onOpenColorPicker,
  onContextMenu,
}) => {
  const dbValue = linearToDb(track.volume);
  const formattedDb = dbValue <= -90 ? '-∞' : `${dbValue >= 0 ? '+' : ''}${dbValue.toFixed(1)}dB`;
  const trackColor = track.color || '#10b981';

  const handleContextMenu = (e: React.MouseEvent) => {
    // Stop the parent column handler from firing: it has no idea which track
    // was clicked, which is why Delete Track used to do nothing from here.
    e.preventDefault();
    e.stopPropagation();
    onSelectTrack?.(index);
    onContextMenu?.(index, e.clientX, e.clientY);
  };

  const openColorPicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenColorPicker?.(index, e.currentTarget.getBoundingClientRect());
  };

  // Collapsed Mode: Strictly display only the track color block (User request: "when collapsed only show the color of the track")
  if (isCollapsed) {
    return (
      <div
        id={`track-header-collapsed-${index}`}
        onClick={() => onSelectTrack?.(index)}
        onDoubleClick={openColorPicker}
        onContextMenu={handleContextMenu}
        title={`Track ${index + 1}: ${track.name} (double-click to change colour)`}
        className={`h-24 w-full border-b border-slate-800/80 p-1.5 flex flex-col items-center justify-center cursor-pointer transition-all select-none ${
          isSelected
            ? 'bg-slate-800/90 ring-1 ring-inset ring-white/60'
            : 'bg-slate-900/40 hover:bg-slate-800/50'
        }`}
      >
        {/* Full-height track color pillar */}
        <div
          className="w-full h-full rounded-md flex flex-col items-center justify-between py-2 shadow-inner transition-transform group-hover:scale-95"
          style={{
            backgroundColor: trackColor,
            boxShadow: isSelected
              ? `0 0 12px ${hexToRgba(trackColor, 0.7)}, inset 0 0 4px rgba(255,255,255,0.4)`
              : `0 0 6px ${hexToRgba(trackColor, 0.3)}`,
          }}
        >
          {/* Track Number Badge */}
          <span className="text-[10px] font-black font-mono text-black/80 drop-shadow-sm px-1 rounded">
            {String(index + 1).padStart(2, '0')}
          </span>

          {/* Mute/Solo active dots */}
          <div className="flex flex-col gap-1 items-center">
            {track.solo && (
              <span className="w-2 h-2 rounded-full bg-emerald-300 ring-1 ring-black/40 shadow" title="Soloed" />
            )}
            {track.muted && (
              <span className="w-2 h-2 rounded-full bg-amber-400 ring-1 ring-black/40 shadow" title="Muted" />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Expanded Mode: Full track controls
  return (
    <div
      id={`track-header-${index}`}
      onClick={() => onSelectTrack?.(index)}
      onContextMenu={handleContextMenu}
      style={{
        borderLeft: `4px solid ${trackColor}`,
        backgroundColor: isSelected
          ? hexToRgba(trackColor, 0.12)
          : track.solo
          ? 'rgba(16, 185, 129, 0.08)'
          : track.muted
          ? 'rgba(15, 23, 42, 0.85)'
          : 'rgba(30, 41, 59, 0.25)',
      }}
      className={`h-24 border-b border-slate-800 p-2.5 flex flex-col justify-between select-none relative group transition-colors cursor-pointer ${
        isSelected ? 'ring-1 ring-inset ring-slate-400/40' : 'hover:bg-slate-800/35'
      }`}
    >
      {/* Top Row: Color Pip + Track Number & Name + Delete + Mute & Solo */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Track Colour Swatch — opens the colour picker */}
          <button
            type="button"
            onClick={openColorPicker}
            className="w-3 h-3 rounded-full shrink-0 shadow-sm ring-1 ring-black/30 hover:ring-2 hover:ring-white/70 hover:scale-110 transition-all cursor-pointer"
            style={{ backgroundColor: trackColor }}
            title={`Colour: ${trackColor} (click to change)`}
          />
          <span className="text-[10px] font-mono text-slate-400 font-bold">
            {String(index + 1).padStart(2, '0')}:
          </span>
          <input
            type="text"
            value={track.name}
            onChange={(e) => onUpdateTrack(index, { name: e.target.value })}
            className="text-xs font-semibold text-slate-200 bg-transparent hover:bg-slate-800/70 focus:bg-slate-800 px-1 py-0.5 rounded truncate focus:outline-none w-24 md:w-28 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Delete Track */}
          <button
            onClick={() => onDeleteTrack(index)}
            title="Delete Track"
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          {/* Mute Button */}
          <button
            id={`track-mute-${index}`}
            onClick={() => onUpdateTrack(index, { muted: !track.muted })}
            className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition cursor-pointer ${
              track.muted
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 shadow-sm'
                : 'bg-slate-700/80 text-slate-400 hover:text-slate-200'
            }`}
            title={track.muted ? 'Unmute Track' : 'Mute Track'}
          >
            M
          </button>

          {/* Solo Button */}
          <button
            id={`track-solo-${index}`}
            onClick={() => onUpdateTrack(index, { solo: !track.solo })}
            className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition cursor-pointer ${
              track.solo
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-sm'
                : 'bg-slate-700/80 text-slate-400 hover:text-slate-200'
            }`}
            title={track.solo ? 'Clear Solo' : 'Solo Track'}
          >
            S
          </button>
        </div>
      </div>

      {/* Level Indicator Bar */}
      <div className="w-full h-1 bg-slate-900/90 rounded-full overflow-hidden my-0.5">
        <div
          className="h-full transition-all duration-75"
          style={{
            backgroundColor: trackColor,
            boxShadow: `0 0 6px ${trackColor}`,
            width: track.muted
              ? '0%'
              : `${Math.min(100, Math.max(8, (track.volume / 1.5) * 80))}%`,
          }}
        />
      </div>

      {/* Sliders & Readout Labels */}
      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.02"
            value={track.volume}
            onChange={(e) => onUpdateTrack(index, { volume: Number(e.target.value) })}
            className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
            title={`Volume: ${(track.volume * 100).toFixed(0)}%`}
          />
        </div>

        <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono">
          <span className="font-semibold">{formattedDb}</span>
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-slate-500">PAN</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={track.pan}
              onChange={(e) => onUpdateTrack(index, { pan: Number(e.target.value) })}
              className="w-12 accent-cyan-500 h-1 bg-slate-800 rounded cursor-pointer"
              title={`Pan: ${track.pan === 0 ? 'CTR' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 50)}` : `R${Math.round(track.pan * 50)}`}`}
            />
            <span className="text-[8px]">
              {track.pan === 0
                ? 'CTR'
                : track.pan < 0
                ? `L${Math.round(Math.abs(track.pan) * 50)}`
                : `R${Math.round(track.pan * 50)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
