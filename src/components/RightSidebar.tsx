import React, { useRef, useState } from 'react';
import {
  FolderPlus,
  FolderOpen,
  Save,
  Download,
  Magnet,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Folder,
  Music2,
  UploadCloud,
  Play,
  Square,
  Plus,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
  Sliders,
  Clock,
  HardDrive,
  AudioWaveform,
  Layers,
  Sparkles,
} from 'lucide-react';
import { ProjectState, SourceAudioFile } from '../types/project';

interface RightSidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  activeTab: 'project' | 'audio_pool';
  onTabChange: (tab: 'project' | 'audio_pool') => void;
  onToggleOpen: () => void;
  onToggleCollapse: () => void;
  // Project Actions
  project: ProjectState;
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  onOpenExportModal: () => void;
  // Timeline Snap & Zoom
  snapToGrid: boolean;
  onToggleSnap: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onZoomFit: () => void;
  // History
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  // Sizing & Resizing
  width?: number;
  onWidthChange?: (newWidth: number) => void;
  // Audio Pool Management
  audioPool: SourceAudioFile[];
  onImportToPool: (file: File) => void;
  onInsertFromPool: (source: SourceAudioFile, trackIndex?: number) => void;
  onDeleteFromPool: (sourceId: string) => void;
  auditioningId: string | null;
  onToggleAudition: (source: SourceAudioFile) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  isOpen,
  isCollapsed,
  activeTab,
  onTabChange,
  onToggleOpen,
  onToggleCollapse,
  project,
  onNewProject,
  onSaveProject,
  onOpenProject,
  onOpenExportModal,
  snapToGrid,
  onToggleSnap,
  zoom,
  onZoomChange,
  onZoomFit,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  width = 320,
  onWidthChange,
  audioPool,
  onImportToPool,
  onInsertFromPool,
  onDeleteFromPool,
  auditioningId,
  onToggleAudition,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const poolFileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(320);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!onWidthChange) return;
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaX = startXRef.current - moveEvent.clientX;
      const newWidth = Math.max(220, Math.min(550, startWidthRef.current + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onOpenProject(file);
    }
  };

  const handlePoolFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        onImportToPool(files[i]);
      }
    }
  };

  const handleDropPool = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        onImportToPool(e.dataTransfer.files[i]);
      }
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        title="Open Tool Panel & Audio Pool"
        className="fixed right-3 top-12 z-30 bg-[#0F172A]/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white p-2 rounded-lg shadow-xl backdrop-blur transition flex items-center gap-1.5 text-xs"
      >
        <PanelRightOpen className="w-4 h-4 text-emerald-400" />
        <span className="hidden sm:inline font-mono">Tools</span>
      </button>
    );
  }

  // Collapsed icon-only rail mode
  if (isCollapsed) {
    return (
      <div
        id="right-sidebar-collapsed"
        className="w-12 bg-[#0F172A] border-l border-slate-800 flex flex-col items-center py-2.5 z-20 shrink-0 select-none justify-between"
      >
        <div className="flex flex-col items-center space-y-3 w-full">
          <button
            onClick={onToggleCollapse}
            title="Expand Sidebar"
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-md transition"
          >
            <PanelRightOpen className="w-4 h-4 text-emerald-400" />
          </button>

          <div className="w-6 h-px bg-slate-800 my-1" />

          {/* Tab 1: Project Actions */}
          <button
            onClick={() => {
              onTabChange('project');
              onToggleCollapse();
            }}
            title="Project & File Actions"
            className={`p-2 rounded-md transition ${
              activeTab === 'project'
                ? 'bg-slate-800 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Folder className="w-4 h-4" />
          </button>

          {/* Tab 2: Audio Pool */}
          <button
            onClick={() => {
              onTabChange('audio_pool');
              onToggleCollapse();
            }}
            title="Audio Pool (Source Assets)"
            className={`p-2 rounded-md relative transition ${
              activeTab === 'audio_pool'
                ? 'bg-slate-800 text-cyan-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Music2 className="w-4 h-4" />
            {audioPool.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-cyan-500 text-black text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {audioPool.length}
              </span>
            )}
          </button>

          <div className="w-6 h-px bg-slate-800 my-1" />

          {/* Quick Snap icon */}
          <button
            onClick={onToggleSnap}
            title={snapToGrid ? 'Snap Enabled' : 'Snap Disabled'}
            className={`p-2 rounded-md transition ${
              snapToGrid ? 'text-cyan-400 bg-cyan-950/40' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Magnet className="w-4 h-4" />
          </button>

          {/* Quick Undo / Redo */}
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onToggleOpen}
          title="Close Sidebar"
          className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-md transition mb-1"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      id="right-sidebar-expanded"
      style={{ width: `${width}px` }}
      className="bg-[#0F172A] border-l border-slate-800 flex flex-col z-20 shrink-0 select-none overflow-hidden relative"
    >
      {/* Draggable Width Resize Handle on Left Border */}
      <div
        onMouseDown={handleMouseDownResize}
        className="w-1.5 hover:w-2 hover:bg-emerald-500/50 bg-transparent absolute left-0 top-0 bottom-0 cursor-col-resize z-30 flex items-center justify-center transition-all group"
        title="Drag to resize tools tab / sidebar width"
      >
        <div className="w-0.5 h-8 rounded bg-slate-700 group-hover:bg-emerald-300 transition-colors" />
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sic,.audioproj,.json"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={poolFileInputRef}
        type="file"
        multiple
        accept="audio/*,.wav,.mp3,.flac,.ogg,.aac"
        className="hidden"
        onChange={handlePoolFileChange}
      />

      {/* Header bar: Tabs & Minimize/Close Controls */}
      <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-3 flex items-center justify-between">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => onTabChange('project')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'project'
                ? 'bg-slate-800 text-emerald-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Project</span>
          </button>
          <button
            onClick={() => onTabChange('audio_pool')}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
              activeTab === 'audio_pool'
                ? 'bg-slate-800 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>Audio Pool</span>
            {audioPool.length > 0 && (
              <span className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1 rounded-full font-mono">
                {audioPool.length}
              </span>
            )}
          </button>
        </div>

        {/* Panel controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onToggleCollapse}
            title="Minimize to icon strip"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleOpen}
            title="Hide Right Panel"
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
          >
            <span className="text-xs font-bold leading-none px-1">✕</span>
          </button>
        </div>
      </div>

      {/* Tab Contents Area */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {activeTab === 'project' ? (
          <>
            {/* 1. Project File Management */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Folder className="w-3 h-3 text-emerald-400" />
                Project File (.sic)
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  id="btn-sidebar-new"
                  onClick={onNewProject}
                  className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs text-slate-200 hover:text-white font-medium transition group"
                >
                  <FolderPlus className="w-4 h-4 text-emerald-400 group-hover:scale-105 transition" />
                  <span>New</span>
                </button>

                <button
                  id="btn-sidebar-open"
                  onClick={handleOpenClick}
                  className="px-3 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs text-slate-200 hover:text-white font-medium transition group"
                >
                  <FolderOpen className="w-4 h-4 text-cyan-400 group-hover:scale-105 transition" />
                  <span>Open</span>
                </button>
              </div>

              <button
                id="btn-sidebar-save"
                onClick={onSaveProject}
                className="w-full px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 font-semibold rounded-lg flex items-center justify-center gap-2 text-xs shadow-lg shadow-emerald-950/40 transition"
              >
                <Save className="w-4 h-4" />
                <span>Save Project (.sic)</span>
              </button>

              <button
                id="btn-sidebar-export"
                onClick={onOpenExportModal}
                className="w-full px-3 py-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-lg flex items-center justify-center gap-2 text-xs text-slate-200 hover:text-emerald-300 font-medium transition"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export Mixdown / Stems</span>
              </button>
            </div>

            {/* 2. Timeline Grid & Snap Tools */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Magnet className="w-3 h-3 text-cyan-400" />
                Timeline Grid & Snapping
              </span>

              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">Snap to Beats</span>
                  <button
                    onClick={onToggleSnap}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      snapToGrid ? 'bg-cyan-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        snapToGrid ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <div className="text-[11px] text-slate-400">
                  Grid is automatically quantized to 1/8 note intervals at{' '}
                  <span className="text-cyan-400 font-mono">{project.bpm} BPM</span>.
                </div>
              </div>
            </div>

            {/* 3. Horizontal Zoom Controls */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ZoomIn className="w-3 h-3 text-sky-400" />
                  Horizontal Zoom
                </span>
                <span className="font-mono text-[11px] text-slate-400">{zoom} px/s</span>
              </div>

              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onZoomChange(Math.max(5, Math.round(zoom * 0.8)))}
                    title="Zoom Out (Mouse Wheel Down)"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min={5}
                    max={200}
                    step={1}
                    value={zoom}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />

                  <button
                    onClick={() => onZoomChange(Math.min(250, Math.round(zoom * 1.25)))}
                    title="Zoom In (Mouse Wheel Up)"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onZoomFit}
                    className="flex-1 py-1 px-2 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded text-[11px] flex items-center justify-center gap-1.5 transition"
                  >
                    <Maximize2 className="w-3 h-3 text-cyan-400" />
                    <span>Fit to Timeline</span>
                  </button>
                  <button
                    onClick={() => onZoomChange(50)}
                    className="py-1 px-2.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-mono transition"
                  >
                    1:1
                  </button>
                </div>
                <div className="text-[10px] text-slate-500">
                  Tip: Hold <kbd className="px-1 bg-slate-800 rounded font-mono">Ctrl</kbd> or <kbd className="px-1 bg-slate-800 rounded font-mono">Alt</kbd> and scroll mouse wheel anywhere on the timeline to zoom smoothly.
                </div>
              </div>
            </div>

            {/* 4. Global Undo / Redo */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-amber-400" />
                History
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed border border-slate-700/80 rounded-lg flex items-center justify-center gap-1.5 text-xs text-slate-200 hover:text-white font-medium transition"
                >
                  <Undo2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Undo</span>
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed border border-slate-700/80 rounded-lg flex items-center justify-center gap-1.5 text-xs text-slate-200 hover:text-white font-medium transition"
                >
                  <Redo2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Redo</span>
                </button>
              </div>
            </div>

            {/* 5. Audio Engine Workspace Specs */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span>Sample Rate</span>
                <span className="font-mono text-slate-300">{project.sample_rate / 1000} kHz</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span>Bit Depth</span>
                <span className="font-mono text-slate-300">32-bit Float</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span>Active Tracks</span>
                <span className="font-mono text-slate-300">{project.tracks.length}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Total Clips</span>
                <span className="font-mono text-slate-300">{project.clips.length}</span>
              </div>
            </div>
          </>
        ) : (
          /* ================= Tab 2: Audio Pool (Source Audio Management) ================= */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <AudioWaveform className="w-3 h-3 text-cyan-400" />
                  Audio Pool (Source Assets)
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Source media files repository without placing onto the edit canvas.
                </p>
              </div>
            </div>

            {/* Import Button & Drag Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDropPool}
              onClick={() => poolFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                isDraggingOver
                  ? 'border-cyan-400 bg-cyan-950/30 text-cyan-300'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 text-slate-400 hover:text-slate-300'
              }`}
            >
              <UploadCloud className="w-6 h-6 mx-auto mb-1 text-cyan-400 opacity-80" />
              <div className="text-xs font-semibold text-slate-200">Import Source Audio</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Drop WAV, MP3, FLAC, OGG, AAC or click to browse
              </div>
            </div>

            {/* Source Audio List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
                <span>Sources ({audioPool.length})</span>
                <span className="text-[10px]">Audition & Insert</span>
              </div>

              {audioPool.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 text-center text-slate-400">
                  <Music2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-cyan-400" />
                  <p className="text-xs font-medium text-slate-400">No source files in pool</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Import audio files here to manage and audition them before placing onto tracks.
                  </p>
                </div>
              ) : (
                audioPool.map((source) => {
                  const isAuditioning = auditioningId === source.id;
                  const durSec = source.duration_ms / 1000;
                  const durMin = Math.floor(durSec / 60);
                  const durRemainderSec = Math.floor(durSec % 60);
                  const durStr = `${durMin}:${String(durRemainderSec).padStart(2, '0')}`;
                  const sizeMb = (source.size_bytes / (1024 * 1024)).toFixed(1);

                  return (
                    <div
                      key={source.id}
                      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-lg p-2.5 space-y-2 transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-slate-200 truncate flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            <span title={source.name}>{source.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span className="px-1 bg-slate-800 rounded text-slate-300 font-bold">
                              {source.format}
                            </span>
                            <span>{durStr}</span>
                            <span>{source.sample_rate / 1000}kHz</span>
                            <span>{sizeMb}MB</span>
                          </div>
                        </div>

                        {/* Delete from pool */}
                        <button
                          onClick={() => onDeleteFromPool(source.id)}
                          title="Remove from pool"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Controls: Audition Preview & Insert onto track */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                        <button
                          onClick={() => onToggleAudition(source)}
                          className={`flex-1 py-1 px-2 rounded text-[11px] font-medium flex items-center justify-center gap-1.5 transition ${
                            isAuditioning
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950/40'
                              : 'bg-slate-800 hover:bg-slate-700/80 text-slate-200 hover:text-white'
                          }`}
                        >
                          {isAuditioning ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span>Stop Preview</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current text-cyan-400" />
                              <span>Audition</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onInsertFromPool(source)}
                          title="Insert clip at current playhead"
                          className="py-1 px-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded text-[11px] font-medium flex items-center gap-1 transition"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Insert</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
