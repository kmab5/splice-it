import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Pipette, Shuffle } from 'lucide-react';
import { VIBRANT_TRACK_COLORS, getRandomTrackColor } from '../utils/trackColors';
import { TrackState } from '../types/project';

interface TrackColorPickerProps {
  isOpen: boolean;
  currentColor: string;
  trackName: string;
  trackIndex: number;
  allTracks?: TrackState[];
  onClose: () => void;
  onSelectColor: (color: string) => void;
  anchorRect?: DOMRect | null;
}

export const TrackColorPicker: React.FC<TrackColorPickerProps> = ({
  isOpen,
  currentColor,
  trackName,
  trackIndex,
  allTracks = [],
  onClose,
  onSelectColor,
  anchorRect,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [hexInput, setHexInput] = useState(currentColor);

  useEffect(() => {
    setHexInput(currentColor);
  }, [currentColor]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /** Accepts hex with or without a leading '#'; commits only when valid. */
  const handleHexChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
    const withHash = `#${cleaned}`;
    setHexInput(withHash);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(withHash)) {
      onSelectColor(withHash);
    }
  };

  const handlePickRandom = () => {
    const randomColor = getRandomTrackColor(allTracks);
    setHexInput(randomColor);
    onSelectColor(randomColor);
  };

  // Calculate popover positioning if anchorRect is provided
  let stylePosition: React.CSSProperties = {
    position: 'fixed',
    zIndex: 60,
  };

  if (anchorRect) {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const top = spaceBelow > 280 ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - 280);
    const left = Math.min(anchorRect.left, window.innerWidth - 270);
    stylePosition = {
      ...stylePosition,
      top: `${top}px`,
      left: `${Math.max(10, left)}px`,
    };
  } else {
    stylePosition = {
      ...stylePosition,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div
      ref={popoverRef}
      id={`track-color-picker-${trackIndex}`}
      style={stylePosition}
      className="w-64 bg-slate-900/98 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl p-3 text-slate-200 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="w-3 h-3 rounded-full shrink-0 shadow"
            style={{ backgroundColor: currentColor }}
          />
          <span className="font-semibold text-slate-100 truncate text-[11px]">
            Track {trackIndex + 1}: {trackName}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-0.5 rounded hover:bg-slate-800 transition"
          title="Close Color Picker"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Preset Swatches Palette */}
      <div className="mb-3">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
          <span>Palette Swatches</span>
          <button
            onClick={handlePickRandom}
            title="Pick a random vibrant color"
            className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 text-[10px] lowercase transition hover:underline cursor-pointer"
          >
            <Shuffle className="w-2.5 h-2.5" />
            <span>random</span>
          </button>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {VIBRANT_TRACK_COLORS.map((c) => {
            const isCurrent = currentColor.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setHexInput(c);
                  onSelectColor(c);
                }}
                className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center cursor-pointer shadow-sm relative group ${
                  isCurrent
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105'
                    : 'hover:scale-110 hover:ring-1 hover:ring-white/40'
                }`}
                style={{ backgroundColor: c }}
                title={`Select ${c}`}
              >
                {isCurrent && <Check className="w-3.5 h-3.5 text-white drop-shadow stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Color Selector & Hex Input */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
          Custom Color
        </div>

        <div className="flex items-center gap-2">
          {/* Native Color Picker Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => colorInputRef.current?.click()}
              className="w-8 h-8 rounded-lg border border-slate-700 hover:border-slate-500 shadow-inner flex items-center justify-center cursor-pointer transition overflow-hidden group"
              style={{ backgroundColor: currentColor }}
              title="Open system color picker"
            >
              <Pipette className="w-3.5 h-3.5 text-white drop-shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <input
              ref={colorInputRef}
              type="color"
              value={currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#10b981'}
              onChange={(e) => {
                setHexInput(e.target.value);
                onSelectColor(e.target.value);
              }}
              className="absolute bottom-0 left-0 w-px h-px opacity-0"
              tabIndex={-1}
            />
          </div>

          {/* Hex Input Field */}
          <div className="flex-1 flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 focus-within:border-emerald-500 transition-colors">
            <span className="text-slate-500 font-mono text-xs">#</span>
            <input
              type="text"
              value={hexInput.replace('#', '')}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="10b981"
              maxLength={7}
              className="w-full bg-transparent text-slate-200 font-mono text-xs px-1 focus:outline-none uppercase"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
