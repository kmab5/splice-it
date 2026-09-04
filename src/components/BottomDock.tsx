import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MasterDspSettings, MetadataDto, ClipState, TrackState } from '../types/project';
import { MasteringRack } from './MasteringRack';
import { MetadataEditor } from './MetadataEditor';
import { ClipInspector } from './ClipInspector';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

interface BottomDockProps {
  settings: MasterDspSettings;
  metadata: MetadataDto;
  selectedClip: ClipState | null;
  tracks: TrackState[];
  currentTimeMs: number;
  liveLufs: number;
  livePeak: number;
  height: number;
  onHeightChange: (newHeight: number) => void;
  onUpdateDspSettings: (updates: Partial<MasterDspSettings>) => void;
  onUpdateMetadata: (updates: Partial<MetadataDto>) => void;
  onUpdateClip: (clipId: string, updates: Partial<ClipState>) => void;
  onSplitClip: (clipId: string, splitAtMs: number) => void;
  onDeleteClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  monitorBypass?: boolean;
  onToggleMonitorBypass?: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  settings,
  metadata,
  selectedClip,
  tracks,
  currentTimeMs,
  liveLufs,
  livePeak,
  height,
  onHeightChange,
  onUpdateDspSettings,
  onUpdateMetadata,
  onUpdateClip,
  onSplitClip,
  onDeleteClip,
  onDuplicateClip,
  monitorBypass,
  onToggleMonitorBypass,
}) => {
  const [activeTab, setActiveTab] = useState<'dsp' | 'metadata' | 'clip'>('dsp');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Resize handler for bottom dock
  const handleMouseDownResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const deltaY = startYRef.current - moveEvent.clientY;
      const newHeight = Math.max(140, Math.min(560, startHeightRef.current + deltaY));
      onHeightChange(newHeight);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [height, onHeightChange]);

  return (
    <div
      id="bottom-dock"
      className="border-t border-slate-800 bg-[#0F172A] flex flex-col shrink-0 z-20 relative select-none"
      style={{ height: isCollapsed ? '32px' : `${height}px` }}
    >
      {/* Draggable Height Resize Handle Bar */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDownResize}
          className="h-2 w-full bg-slate-800/60 hover:bg-emerald-500/40 cursor-row-resize flex items-center justify-center transition-colors group shrink-0"
          title="Drag to resize bottom tab / dock height"
        >
          <div className="w-12 h-1 rounded-full bg-slate-600 group-hover:bg-emerald-300 transition-colors" />
        </div>
      )}

      {/* Minimized / Collapsed Bar */}
      {isCollapsed && (
        <div className="h-8 px-3 bg-[#0F172A] flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mastering Dock (Minimized)</span>
          </div>
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1 text-slate-500 hover:text-slate-300 transition cursor-pointer"
            title="Expand Bottom Rack"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Expanded Dock Content Panel */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
          {/* Top Collapse Button Overlay */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="absolute top-1.5 right-2 p-1 text-slate-600 hover:text-slate-300 z-30 transition cursor-pointer"
            title="Collapse Bottom Rack"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>

          {activeTab === 'dsp' && (
            <MasteringRack
              settings={settings}
              liveLufs={liveLufs}
              livePeak={livePeak}
              onUpdateSettings={onUpdateDspSettings}
              metadata={metadata}
              onUpdateMetadata={onUpdateMetadata}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              monitorBypass={monitorBypass}
              onToggleMonitorBypass={onToggleMonitorBypass}
            />
          )}

          {activeTab === 'metadata' && (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex border-b border-slate-800 bg-[#0F172A] shrink-0 select-none">
                <button
                  onClick={() => setActiveTab('dsp')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-medium text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Mastering Rack
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/20 transition-colors cursor-pointer"
                >
                  Tags
                </button>
                <button
                  onClick={() => setActiveTab('clip')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-medium text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Inspector
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MetadataEditor metadata={metadata} onUpdateMetadata={onUpdateMetadata} />
              </div>
            </div>
          )}

          {activeTab === 'clip' && (
            <div className="h-full flex flex-col min-h-0">
              <div className="flex border-b border-slate-800 bg-[#0F172A] shrink-0 select-none">
                <button
                  onClick={() => setActiveTab('dsp')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-medium text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Mastering Rack
                </button>
                <button
                  onClick={() => setActiveTab('metadata')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-medium text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Tags
                </button>
                <button
                  onClick={() => setActiveTab('clip')}
                  className="px-4 py-2 text-[10px] uppercase tracking-widest font-bold border-b-2 border-emerald-500 text-emerald-400 bg-slate-800/20 transition-colors cursor-pointer"
                >
                  Inspector
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ClipInspector
                  clip={selectedClip}
                  tracks={tracks}
                  currentTimeMs={currentTimeMs}
                  onUpdateClip={onUpdateClip}
                  onSplitClip={onSplitClip}
                  onDeleteClip={onDeleteClip}
                  onDuplicateClip={onDuplicateClip}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
