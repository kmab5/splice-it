import React, { useEffect, useRef } from 'react';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  CopyPlus,
  Split,
  Plus,
  Music2,
  Volume2,
} from 'lucide-react';
import { TrackState, ClipState } from '../types/project';

export interface ContextMenuTarget {
  type: 'clip' | 'track' | 'canvas';
  clipId?: string;
  trackIndex?: number;
  clickTimeMs: number;
}

interface ContextMenuProps {
  x: number;
  y: number;
  target: ContextMenuTarget;
  selectedClip: ClipState | null;
  selectedTrack: TrackState | null;
  hasCopiedClip: boolean;
  hasCopiedTrack: boolean;
  onClose: () => void;
  onCopyClip?: (clipId: string) => void;
  onCutClip?: (clipId: string) => void;
  onPasteClip?: (trackIndex?: number, timeMs?: number) => void;
  onDuplicateClip?: (clipId: string) => void;
  onSplitClip?: (clipId: string, timeMs: number) => void;
  onDeleteClip?: (clipId: string) => void;
  onCopyTrack?: (trackIndex: number) => void;
  onPasteTrack?: () => void;
  onDuplicateTrack?: (trackIndex: number) => void;
  onDeleteTrack?: (trackId: string) => void;
  onAddTrack?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  target,
  selectedClip,
  selectedTrack,
  hasCopiedClip,
  hasCopiedTrack,
  onClose,
  onCopyClip,
  onCutClip,
  onPasteClip,
  onDuplicateClip,
  onSplitClip,
  onDeleteClip,
  onCopyTrack,
  onPasteTrack,
  onDuplicateTrack,
  onDeleteTrack,
  onAddTrack,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  // Adjust positioning to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 280);

  return (
    <div
      ref={menuRef}
      id="custom-context-menu"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      className="fixed z-50 w-52 bg-[#0F172A]/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl p-1 text-slate-200 text-xs select-none animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-800"
    >
      {/* 1. Clip actions (if clicked on clip or clip is selected) */}
      {(target.type === 'clip' || target.clipId) && (
        <div className="py-1">
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Music2 className="w-3 h-3 text-cyan-400" />
            <span>Clip: {selectedClip?.name || 'Selected Clip'}</span>
          </div>

          <button
            onClick={() => {
              if (target.clipId) onCopyClip?.(target.clipId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-slate-400" /> Copy Clip
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+C</span>
          </button>

          <button
            onClick={() => {
              if (target.clipId) onCutClip?.(target.clipId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Scissors className="w-3.5 h-3.5 text-slate-400" /> Cut Clip
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+X</span>
          </button>

          <button
            onClick={() => {
              if (target.clipId) onDuplicateClip?.(target.clipId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <CopyPlus className="w-3.5 h-3.5 text-slate-400" /> Duplicate Clip
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+D</span>
          </button>

          <button
            onClick={() => {
              if (target.clipId) onSplitClip?.(target.clipId, target.clickTimeMs);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Split className="w-3.5 h-3.5 text-slate-400" /> Split at Cursor
            </span>
            <span className="text-[10px] text-slate-500 font-mono">S</span>
          </button>

          <button
            onClick={() => {
              if (target.clipId) onDeleteClip?.(target.clipId);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Delete Clip
            </span>
            <span className="text-[10px] text-rose-400/60 font-mono">Del</span>
          </button>
        </div>
      )}

      {/* 2. Track actions (if clicked on track or track header) */}
      {(target.type === 'track' || target.trackIndex !== undefined) && (
        <div className="py-1">
          <div className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-emerald-400" />
            <span>Track {target.trackIndex !== undefined ? target.trackIndex + 1 : ''}</span>
          </div>

          <button
            onClick={() => {
              if (target.trackIndex !== undefined) onCopyTrack?.(target.trackIndex);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5 text-emerald-400" /> Copy Track
            </span>
          </button>

          <button
            onClick={() => {
              if (target.trackIndex !== undefined) onDuplicateTrack?.(target.trackIndex);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <CopyPlus className="w-3.5 h-3.5 text-emerald-400" /> Duplicate Track
            </span>
          </button>

          {selectedTrack && (
            <button
              onClick={() => {
                onDeleteTrack?.(selectedTrack.id);
                onClose();
              }}
              className="w-full text-left px-2.5 py-1.5 rounded hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 flex items-center justify-between transition"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Delete Track
              </span>
            </button>
          )}
        </div>
      )}

      {/* 3. Global Timeline & Paste actions */}
      <div className="py-1">
        {hasCopiedClip && (
          <button
            onClick={() => {
              onPasteClip?.(target.trackIndex, target.clickTimeMs);
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-cyan-300 hover:text-cyan-200 transition font-medium"
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste Clip at Cursor
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Ctrl+V</span>
          </button>
        )}

        {hasCopiedTrack && (
          <button
            onClick={() => {
              onPasteTrack?.();
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-emerald-300 hover:text-emerald-200 transition font-medium"
          >
            <span className="flex items-center gap-2">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste Track
            </span>
          </button>
        )}

        <button
          onClick={() => {
            onAddTrack?.();
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 flex items-center justify-between text-slate-300 hover:text-white transition"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 text-emerald-400" /> Add Audio Track
          </span>
        </button>
      </div>
    </div>
  );
};
