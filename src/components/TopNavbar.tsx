import React from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Undo2,
  Redo2,
  PanelRight,
} from 'lucide-react';
import { ProjectState } from '../types/project';

interface TopNavbarProps {
  project: ProjectState;
  isPlaying: boolean;
  currentTimeMs: number;
  onPlayPause: () => void;
  onStop: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onBpmChange: (bpm: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isRightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  project,
  isPlaying,
  currentTimeMs,
  onPlayPause,
  onStop,
  onGoToStart,
  onGoToEnd,
  onBpmChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isRightSidebarOpen,
  onToggleRightSidebar,
}) => {
  // Format timecode: 00:00:00.000 (HH:MM:SS.mmm)
  const formatTimecode = (ms: number): string => {
    const totalSeconds = Math.max(0, ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const millis = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 1000);

    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(mins)}:${pad(secs)}.${pad(millis, 3)}`;
  };

  return (
    <header
      id="top-navbar"
      className="h-14 border-b border-slate-800 bg-[#0F172A]/95 backdrop-blur-md flex items-center justify-between px-3 sm:px-4 shrink-0 z-30 select-none gap-2 overflow-x-auto"
    >
      {/* 1. Left: Brand and Project Title */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-slate-950 font-black italic shadow-md shadow-emerald-500/20 shrink-0">
          SI
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-100 tracking-tight text-xs sm:text-sm">
              Splice It
            </span>
            <span className="text-slate-400 font-mono text-[10px] hidden md:inline">v2.0</span>
          </div>
          <span className="text-[10px] text-emerald-400/90 font-medium truncate max-w-[110px] sm:max-w-[160px]">
            {project.name.endsWith('.sic') ? project.name : `${project.name}.sic`}
          </span>
        </div>
      </div>

      {/* 2. Center: Dedicated Transport Bar (Go to Start, Stop, Play, Go to End, Timecode, BPM) */}
      <div
        id="transport-playbar"
        className="flex items-center gap-2 sm:gap-3.5 bg-slate-900/80 px-3 sm:px-4 py-1 rounded-full border border-slate-700/60 shadow-inner shrink-0"
      >
        {/* Go to Start Button */}
        <button
          id="btn-go-to-start"
          onClick={onGoToStart}
          title="Go to Start / Return to Zero (Home)"
          className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {/* Stop Button */}
        <button
          id="btn-stop"
          onClick={onStop}
          title="Stop Playback"
          className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>

        {/* Play / Pause Primary Button */}
        <button
          id="btn-play-pause"
          onClick={onPlayPause}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 rounded-full transition cursor-pointer border border-emerald-500/30"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current text-amber-400 hover:text-amber-300" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Go to End Button */}
        <button
          id="btn-go-to-end"
          onClick={onGoToEnd}
          title="Go to End (End)"
          className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        {/* Active Engine LED */}
        <div
          title={isPlaying ? 'Engine Processing Live' : 'Engine Standby'}
          className={`w-2 h-2 rounded-full transition-all ${
            isPlaying
              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
              : 'bg-slate-600'
          }`}
        />

        {/* Divider */}
        <div className="h-4 w-[1px] bg-slate-700 mx-0.5" />

        {/* Real-time Timecode Display */}
        <span
          id="timecode-display"
          className="font-mono text-emerald-400 text-xs sm:text-sm tracking-wider font-semibold select-text"
        >
          {formatTimecode(currentTimeMs)}
        </span>

        {/* Divider */}
        <div className="h-4 w-[1px] bg-slate-700 mx-0.5 hidden sm:block" />

        {/* BPM Selector */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-950/70 px-2 py-0.5 rounded border border-slate-800 text-xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">BPM</span>
          <input
            type="number"
            min="40"
            max="260"
            value={project.bpm}
            onChange={(e) => onBpmChange(Number(e.target.value) || 120)}
            className="w-9 bg-transparent text-slate-200 font-mono text-xs focus:outline-none text-right font-medium"
          />
        </div>
      </div>

      {/* 3. Right: Undo / Redo & Right Panel Sidebar Toggle */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Undo Quick Action */}
        <button
          id="btn-undo-top"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 rounded transition"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo Quick Action */}
        <button
          id="btn-redo-top"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-800 rounded transition"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Divider */}
        <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />

        {/* Toggle Right Tools / Audio Management Sidebar */}
        <button
          id="btn-toggle-sidebar"
          onClick={onToggleRightSidebar}
          title={isRightSidebarOpen ? 'Close Tools Sidebar' : 'Open Tools & Audio Pool'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
            isRightSidebarOpen
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm'
              : 'bg-slate-800/80 border-slate-700/70 text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          <PanelRight className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline">Tools & Media</span>
        </button>
      </div>
    </header>
  );
};
