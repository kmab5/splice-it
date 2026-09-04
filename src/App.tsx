import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ProjectState,
  ClipState,
  TrackState,
  MasterDspSettings,
  MetadataDto,
  SourceAudioFile,
  ConcatItem,
  ConcatState,
  ExportOptions,
} from './types/project';
import { audioEngine } from './services/audioEngine';
import {
  analyzeAudioFile,
  BROWSER_PATH_PREFIX,
  exportConcat,
  exportProject,
  isAudioPath,
  isProjectPath,
  isTauri,
  pickAudioFiles,
  pickProjectFile,
  pickSavePath,
  readAudioFileBytes,
  readTextFile,
  writeTextFile,
} from './services/ipc';
import { TopNavbar } from './components/TopNavbar';
import { TimelineRuler } from './components/TimelineRuler';
import { TrackHeader } from './components/TrackHeader';
import { TimelineCanvas } from './components/TimelineCanvas';
import { BottomDock } from './components/BottomDock';
import { ExportModal } from './components/ExportModal';
import { RightSidebar } from './components/RightSidebar';
import { ContextMenu, ContextMenuTarget } from './components/ContextMenu';
import { TrackColorPicker } from './components/TrackColorPicker';
import { ConcatWorkspace, computeLayout } from './components/ConcatWorkspace';
import type { WorkspaceMode } from './components/TopNavbar';
import { getNonOverlappingStartTime } from './utils/clipCollisions';
import { getRandomTrackColor } from './utils/trackColors';
import { Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/**
 * A new workspace starts empty. The previous build shipped a fake audio pool
 * and six clips pointing at files that never existed, which made the app look
 * like it was playing imported audio when it was really playing synthesized
 * tones. Tracks are provided as empty lanes to drop imported audio onto.
 */
const INITIAL_PROJECT: ProjectState = {
  version: '2.0.0',
  name: 'Untitled Project',
  sample_rate: 44100,
  bpm: 120,
  tracks: [
    { id: 'trk-1', name: 'Track 1', muted: false, solo: false, volume: 1.0, pan: 0.0, color: '#10b981' },
    { id: 'trk-2', name: 'Track 2', muted: false, solo: false, volume: 1.0, pan: 0.0, color: '#06b6d4' },
    { id: 'trk-3', name: 'Track 3', muted: false, solo: false, volume: 1.0, pan: 0.0, color: '#38bdf8' },
    { id: 'trk-4', name: 'Track 4', muted: false, solo: false, volume: 1.0, pan: 0.0, color: '#a855f7' },
  ],
  clips: [],
  master_dsp: {
    eq_high_cut_hz: 12000,
    eq_high_cut_gain_db: -2.5,
    eq_mud_scoop_hz: 300,
    eq_mud_scoop_q: 1.5,
    eq_mud_scoop_gain_db: -3.0,
    comp_threshold_db: -16,
    comp_ratio: 2.5,
    comp_attack_ms: 25,
    comp_release_ms: 120,
    stereo_width: 1.15,
    limiter_threshold_db: -1.0,
    limiter_ceiling_db: -0.3,
    target_lufs: -14.0,
  },
  metadata: {
    encoder: 'Splice It',
  },
  audio_pool: [],
};

export default function App() {
  const [project, setProject] = useState<ProjectState>(INITIAL_PROJECT);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(65); // px per second
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState<number | null>(0);
  const [isTrackAreaCollapsed, setIsTrackAreaCollapsed] = useState<boolean>(false);
  const [scrollLeft, setScrollLeft] = useState<number>(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Scroll sync refs for tracks list and timeline canvas
  const trackListRef = useRef<HTMLDivElement>(null);
  const isSyncingScrollRef = useRef(false);

  // Metering values
  const [liveLufs, setLiveLufs] = useState<number>(-14.0);
  const [livePeak, setLivePeak] = useState<number>(0);

  // Tab & Panel Sizing State (User Request: "allow resizing all tabs")
  const [trackHeaderWidth, setTrackHeaderWidth] = useState<number>(240);
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(320);
  const [bottomDockHeight, setBottomDockHeight] = useState<number>(260);

  const isResizingLeftRef = useRef(false);
  const startLeftXRef = useRef(0);
  const startLeftWidthRef = useRef(240);

  const handleMouseDownLeftResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingLeftRef.current = true;
    startLeftXRef.current = e.clientX;
    startLeftWidthRef.current = trackHeaderWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingLeftRef.current) return;
      const deltaX = moveEvent.clientX - startLeftXRef.current;
      const newWidth = Math.max(160, Math.min(420, startLeftWidthRef.current + deltaX));
      setTrackHeaderWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingLeftRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [trackHeaderWidth]);

  // Right Sidebar State
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(true);
  const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState<boolean>(false);
  const [rightSidebarTab, setRightSidebarTab] = useState<'project' | 'audio_pool'>('project');

  // History state for Undo / Redo
  const [history, setHistory] = useState<{ past: ProjectState[]; future: ProjectState[] }>({
    past: [],
    future: [],
  });

  // Clipboard state for Copy / Paste
  const [clipboardTrack, setClipboardTrack] = useState<{ track: TrackState; clips: ClipState[] } | null>(
    null
  );
  const [clipboardClip, setClipboardClip] = useState<ClipState | null>(null);

  // Which workspace is showing. Each mode keeps its own state, so switching
  // back and forth never disturbs the other one.
  const [mode, setMode] = useState<WorkspaceMode>('timeline');
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [concat, setConcat] = useState<ConcatState>({
    name: 'Joined Audio',
    sample_rate: 44100,
    items: [],
    metadata: {},
    apply_master_chain: false,
  });

  const [isConcatPlaying, setIsConcatPlaying] = useState<boolean>(false);
  const [concatTimeMs, setConcatTimeMs] = useState<number>(0);
  const [isConcatExportOpen, setIsConcatExportOpen] = useState<boolean>(false);
  const [monitorBypass, setMonitorBypass] = useState<boolean>(false);

  // Track colour picker state
  const [colorPicker, setColorPicker] = useState<{
    trackIndex: number;
    anchor: DOMRect | null;
  } | null>(null);

  // Native OS file drag-and-drop state
  const [isFileDragOver, setIsFileDragOver] = useState<boolean>(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextMenuTarget;
  } | null>(null);

  // Audio Pool Auditioning
  const [auditioningId, setAuditioningId] = useState<string | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Helper to record history before mutating project
  const pushHistory = useCallback(
    (currentState: ProjectState) => {
      setHistory((prev) => ({
        past: [...prev.past.slice(-25), JSON.parse(JSON.stringify(currentState))],
        future: [],
      }));
    },
    []
  );

  // Undo / Redo Actions
  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previousState = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);
      const newFuture = [JSON.parse(JSON.stringify(project)), ...prev.future];

      setProject(previousState);
      return { past: newPast, future: newFuture };
    });
  }, [project]);

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const nextState = prev.future[0];
      const newFuture = prev.future.slice(1);
      const newPast = [...prev.past, JSON.parse(JSON.stringify(project))];

      setProject(nextState);
      return { past: newPast, future: newFuture };
    });
  }, [project]);

  // Sync master DSP settings with AudioEngine live
  useEffect(() => {
    audioEngine.updateMasterDsp(project.master_dsp);
  }, [project.master_dsp]);

  // Sync tracks (volume, pan, mute, solo) live
  useEffect(() => {
    audioEngine.updateTracks(project.tracks);
  }, [project.tracks]);

  // Metering polling loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying) {
        const data = audioEngine.getAnalyserData();
        setLiveLufs(data.lufs);
        setLivePeak(data.peak);
      } else {
        setLivePeak(0);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Calculate total duration from clips
  const calculateTotalDurationMs = useCallback((): number => {
    let maxMs = 0;
    project.clips.forEach((c) => {
      const end = c.start_time_ms + c.duration_ms;
      if (end > maxMs) maxMs = end;
    });
    return Math.max(16000, maxMs);
  }, [project.clips]);

  // Play / Pause Toggle
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      const totalDuration = calculateTotalDurationMs();
      audioEngine.play(
        currentTimeMs,
        project.clips,
        project.tracks,
        totalDuration,
        (updatedMs) => {
          setCurrentTimeMs(updatedMs);
        }
      );
      setIsPlaying(true);
    }
  }, [isPlaying, currentTimeMs, project.clips, project.tracks, calculateTotalDurationMs]);

  // Stop Playback
  const handleStop = useCallback(() => {
    audioEngine.stop();
    setIsPlaying(false);
    setCurrentTimeMs(0);
  }, []);

  // Seek to specific timecode
  const handleSeek = useCallback(
    (timeMs: number) => {
      setCurrentTimeMs(timeMs);
      if (isPlaying) {
        const totalDuration = calculateTotalDurationMs();
        audioEngine.play(
          timeMs,
          project.clips,
          project.tracks,
          totalDuration,
          (updatedMs) => {
            setCurrentTimeMs(updatedMs);
          }
        );
      }
    },
    [isPlaying, project.clips, project.tracks, calculateTotalDurationMs]
  );

  // Go to Start / Go to End (User Request)
  const handleGoToStart = useCallback(() => {
    handleSeek(0);
  }, [handleSeek]);

  const handleGoToEnd = useCallback(() => {
    const totalMs = calculateTotalDurationMs();
    handleSeek(totalMs);
  }, [calculateTotalDurationMs, handleSeek]);

  // Zoom to Fit (User Request)
  const handleZoomFit = useCallback(() => {
    if (!timelineContainerRef.current) return;
    const containerW = timelineContainerRef.current.clientWidth - 40;
    const durationSec = calculateTotalDurationMs() / 1000;
    if (durationSec <= 0 || containerW <= 0) return;
    const fitZoom = Math.max(5, Math.min(180, Math.floor(containerW / (durationSec * 1.15))));
    setZoom(fitZoom);
  }, [calculateTotalDurationMs]);

  // Track operations
  const handleUpdateTrack = (index: number, updates: Partial<TrackState>) => {
    setProject((prev) => {
      const newTracks = [...prev.tracks];
      newTracks[index] = { ...newTracks[index], ...updates };
      return { ...prev, tracks: newTracks };
    });
  };

  /** History is recorded once when the picker opens, not on every colour tweak. */
  const handleOpenColorPicker = useCallback(
    (index: number, anchor?: DOMRect) => {
      pushHistory(project);
      setColorPicker({ trackIndex: index, anchor: anchor ?? null });
      setSelectedTrackIndex(index);
    },
    [project, pushHistory]
  );

  const handleAddTrack = () => {
    pushHistory(project);
    const newIdx = project.tracks.length;
    const randomColor = getRandomTrackColor(project.tracks);
    const newTrack: TrackState = {
      id: `trk-${Date.now()}`,
      name: `Track ${newIdx + 1}`,
      muted: false,
      solo: false,
      volume: 1.0,
      pan: 0.0,
      color: randomColor,
    };
    setProject((prev) => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
    setSelectedTrackIndex(newIdx);
  };

  const handleDeleteTrack = (trackId: string) => {
    if (project.tracks.length <= 1) return;
    pushHistory(project);
    const index = project.tracks.findIndex((t) => t.id === trackId);
    if (index === -1) return;

    setProject((prev) => {
      const newTracks = prev.tracks.filter((_, i) => i !== index);
      // Re-assign or remove clips belonging to deleted track
      const newClips = prev.clips
        .filter((c) => c.track_index !== index)
        .map((c) => (c.track_index > index ? { ...c, track_index: c.track_index - 1 } : c));
      return { ...prev, tracks: newTracks, clips: newClips };
    });
  };

  // Track Copy & Paste (User Request: "allow copying and pasting tracks on the main edit area")
  const handleCopyTrack = (trackIndex: number) => {
    const track = project.tracks[trackIndex];
    if (!track) return;
    const trackClips = project.clips.filter((c) => c.track_index === trackIndex);
    setClipboardTrack({
      track: JSON.parse(JSON.stringify(track)),
      clips: JSON.parse(JSON.stringify(trackClips)),
    });
  };

  const handlePasteTrack = () => {
    if (!clipboardTrack) return;
    pushHistory(project);
    const newIndex = project.tracks.length;
    const randomColor = getRandomTrackColor(project.tracks);
    const newTrack: TrackState = {
      ...clipboardTrack.track,
      id: `trk-${Date.now()}`,
      name: `${clipboardTrack.track.name} (Copy)`,
      color: randomColor,
    };

    const newClips: ClipState[] = clipboardTrack.clips.map((c, i) => ({
      ...c,
      id: `clip-${Date.now()}-${i}`,
      track_index: newIndex,
    }));

    setProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      clips: [...prev.clips, ...newClips],
    }));

  };

  const handleDuplicateTrack = (trackIndex: number) => {
    const track = project.tracks[trackIndex];
    if (!track) return;
    pushHistory(project);
    const newIndex = project.tracks.length;
    const randomColor = getRandomTrackColor(project.tracks);
    const newTrack: TrackState = {
      ...track,
      id: `trk-${Date.now()}`,
      name: `${track.name} (Duplicate)`,
      color: randomColor,
    };
    const trackClips = project.clips.filter((c) => c.track_index === trackIndex);
    const duplicatedClips: ClipState[] = trackClips.map((c, i) => ({
      ...c,
      id: `clip-${Date.now()}-${i}`,
      track_index: newIndex,
    }));

    setProject((prev) => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
      clips: [...prev.clips, ...duplicatedClips],
    }));

  };

  // Clip operations
  const handleUpdateClip = (clipId: string, updates: Partial<ClipState>) => {
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === clipId ? { ...c, ...updates } : c)),
    }));
  };

  const handleSplitClip = (clipId: string, splitAtMs: number) => {
    pushHistory(project);
    setProject((prev) => {
      const clipIndex = prev.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1) return prev;
      const target = prev.clips[clipIndex];

      const splitOffset = splitAtMs - target.start_time_ms;
      if (splitOffset <= 200 || splitOffset >= target.duration_ms - 200) {
        return prev;
      }

      // Left part
      const leftClip: ClipState = {
        ...target,
        id: `clip-${Date.now()}-a`,
        duration_ms: splitOffset,
        fade_out_ms: Math.min(target.fade_out_ms, splitOffset / 2),
      };

      // Right part
      const rightDuration = target.duration_ms - splitOffset;
      const rightClip: ClipState = {
        ...target,
        id: `clip-${Date.now()}-b`,
        name: `${target.name} (Split)`,
        start_time_ms: splitAtMs,
        offset_ms: target.offset_ms + splitOffset,
        duration_ms: rightDuration,
        fade_in_ms: Math.min(target.fade_in_ms, rightDuration / 2),
      };

      const newClips = [...prev.clips];
      newClips.splice(clipIndex, 1, leftClip, rightClip);
      setSelectedClipId(rightClip.id);


      return { ...prev, clips: newClips };
    });
  };

  const handleDeleteClip = (clipId: string) => {
    pushHistory(project);
    setProject((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== clipId),
    }));
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  };

  const handleDuplicateClip = (clipId: string) => {
    const original = project.clips.find((c) => c.id === clipId);
    if (!original) return;
    pushHistory(project);

    // Enforce zero overlap: find nearest non-overlapping slot on that track
    const idealStart = original.start_time_ms + original.duration_ms;
    const validStartMs = getNonOverlappingStartTime(
      idealStart,
      original.duration_ms,
      original.track_index,
      project.clips
    );

    const newClip: ClipState = {
      ...original,
      id: `clip-${Date.now()}`,
      name: `${original.name} (Copy)`,
      start_time_ms: validStartMs,
    };

    setProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipId(newClip.id);
  };

  // Clip Copy & Paste
  const handleCopyClip = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (clip) {
      setClipboardClip(JSON.parse(JSON.stringify(clip)));
    }
  };

  const handleCutClip = (clipId: string) => {
    const clip = project.clips.find((c) => c.id === clipId);
    if (clip) {
      setClipboardClip(JSON.parse(JSON.stringify(clip)));
      handleDeleteClip(clipId);
    }
  };

  const handlePasteClip = (targetTrackIndex?: number, targetTimeMs?: number) => {
    if (!clipboardClip) return;
    pushHistory(project);

    const destTrack =
      targetTrackIndex !== undefined && targetTrackIndex >= 0
        ? targetTrackIndex
        : selectedClip
        ? selectedClip.track_index
        : 0;

    const destTime = targetTimeMs !== undefined ? targetTimeMs : currentTimeMs;

    // Enforce zero overlap: find nearest non-overlapping slot on target track
    const validStartMs = getNonOverlappingStartTime(
      destTime,
      clipboardClip.duration_ms,
      destTrack,
      project.clips
    );

    const newClip: ClipState = {
      ...clipboardClip,
      id: `clip-${Date.now()}`,
      name: `${clipboardClip.name} (Pasted)`,
      track_index: Math.min(project.tracks.length - 1, destTrack),
      start_time_ms: validStartMs,
    };

    setProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipId(newClip.id);
  };

  // DSP & Metadata updates
  const handleUpdateDspSettings = (updates: Partial<MasterDspSettings>) => {
    setProject((prev) => ({
      ...prev,
      master_dsp: { ...prev.master_dsp, ...updates },
    }));
  };

  const handleUpdateMetadata = (updates: Partial<MetadataDto>) => {
    setProject((prev) => ({
      ...prev,
      metadata: { ...prev.metadata, ...updates },
    }));
  };

  // File Operations (.sic project serialization)
  const handleNewProject = () => {
    if (window.confirm('Create a new project? Any unsaved changes will be cleared.')) {
      handleStop();
      pushHistory(project);
      setProject({
        ...INITIAL_PROJECT,
        name: 'Untitled Project',
        clips: [],
      });
      setSelectedClipId(null);
    }
  };

  const handleSaveProject = useCallback(async () => {
    const json = JSON.stringify(project, null, 2);
    const defaultName = `${project.name.replace(/\s+/g, '_')}.sic`;

    if (isTauri()) {
      const path = await pickSavePath(defaultName, ['sic'], 'Save Splice It project');
      if (!path) return;
      try {
        await writeTextFile(path, json);
        // The title bar used to keep saying "Untitled Project" after a save,
        // because nothing ever fed the chosen filename back into state.
        const baseName = (path.split(/[\\/]/).pop() || defaultName).replace(/\.sic$/i, '');
        setProject((prev) => ({ ...prev, name: baseName }));
        setSavedPath(path);
      } catch (err) {
        window.alert(`Could not save project: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // Browser fallback: download the .sic document.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [project]);

  /**
   * Re-decode every source referenced by a loaded project so playback and
   * waveforms work immediately. Missing files are reported, not silently faked.
   */
  const hydrateSources = useCallback(async (pool: SourceAudioFile[]) => {
    if (!isTauri()) return;
    const missing: string[] = [];

    for (const source of pool) {
      if (!source.path || source.path.startsWith(BROWSER_PATH_PREFIX)) continue;
      if (audioEngine.hasSource(source.path)) continue;
      try {
        const bytes = await readAudioFileBytes(source.path);
        await audioEngine.registerSource(source.path, bytes);
      } catch {
        missing.push(source.name);
      }
    }

    if (missing.length > 0) {
      window.alert(
        `These source files could not be found and will be silent:\n\n${missing.join('\n')}`
      );
    }
  }, []);

  const applyLoadedProject = useCallback(
    (parsed: ProjectState) => {
      if (!parsed.tracks || !parsed.clips) {
        window.alert('Failed to parse project file: missing tracks or clips.');
        return;
      }
      handleStop();
      pushHistory(project);
      setProject(parsed);
      setSelectedClipId(null);
      void hydrateSources(parsed.audio_pool || []);
    },
    [project, pushHistory, handleStop, hydrateSources]
  );

  const handleOpenProjectPath = useCallback(
    async (path: string) => {
      try {
        const loaded = JSON.parse(await readTextFile(path)) as ProjectState;
        const baseName = (path.split(/[\\/]/).pop() || 'Untitled').replace(/\.sic$/i, '');
        applyLoadedProject({ ...loaded, name: loaded.name || baseName });
        setSavedPath(path);
      } catch {
        window.alert('Failed to open project: invalid or unreadable .sic file.');
      }
    },
    [applyLoadedProject]
  );

  const handleOpenProject = useCallback(
    async (file?: File) => {
      try {
        if (file) {
          applyLoadedProject(JSON.parse(await file.text()) as ProjectState);
          return;
        }
        const path = await pickProjectFile();
        if (!path) return;
        await handleOpenProjectPath(path);
      } catch {
        window.alert('Failed to parse project file: invalid JSON structure.');
      }
    },
    [applyLoadedProject, handleOpenProjectPath]
  );

  // ---------------------------------------------------------------------------
  // Audio Pool: real source files on disk
  // ---------------------------------------------------------------------------

  const [isImporting, setIsImporting] = useState<boolean>(false);
  const modeRef = useRef<WorkspaceMode>('timeline');
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  /**
   * Analyze each picked file in Rust (duration, peaks, embedded tags), then
   * decode its bytes for Web Audio preview playback. The absolute path becomes
   * the identity of the source everywhere else in the app.
   */
  const addSourcesByPath = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setIsImporting(true);

      const added: SourceAudioFile[] = [];
      const failed: string[] = [];
      const existing = new Set((project.audio_pool || []).map((s) => s.path));
      let firstTags: MetadataDto | null = null;

      for (const path of paths) {
        if (existing.has(path)) continue;
        try {
          const info = await analyzeAudioFile(path);
          const bytes = await readAudioFileBytes(path);
          await audioEngine.registerSource(path, bytes);

          if (!firstTags && info.metadata && info.metadata.title) {
            firstTags = info.metadata;
          }

          added.push({
            id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: info.name,
            path: info.path,
            format: info.format,
            duration_ms: info.duration_ms,
            sample_rate: info.sample_rate,
            channels: info.channels,
            size_bytes: info.size_bytes,
            waveform_peaks: info.peaks,
            date_added: new Date().toISOString().split('T')[0],
          });
          existing.add(path);
        } catch (err) {
          failed.push(`${path.split(/[\\/]/).pop()}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (added.length > 0 && modeRef.current === 'concat') {
        setConcat((prev) => ({
          ...prev,
          items: [
            ...prev.items,
            ...added.map<ConcatItem>((source) => ({
              id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: source.name,
              source_path: source.path,
              gain: 1.0,
              gap_after_ms: 0,
              crossfade_ms: 0,
              duration_ms: source.duration_ms,
            })),
          ],
        }));
      }

      if (added.length > 0) {
        setProject((prev) => {
          const isFirstImport = (prev.audio_pool || []).length === 0;
          const next: ProjectState = {
            ...prev,
            audio_pool: [...added, ...(prev.audio_pool || [])],
          };
          // Seed the tag editor from the first tagged file imported into an
          // otherwise untouched project, so exports start from real metadata.
          if (isFirstImport && firstTags && !prev.metadata.title) {
            next.metadata = { ...firstTags, ...prev.metadata };
          }
          return next;
        });
      }

      setIsImporting(false);
      if (failed.length > 0) {
        window.alert(`Could not import:\n\n${failed.join('\n')}`);
      }
    },
    [project.audio_pool]
  );

  /** Opens the native picker. Returns false in the browser so the caller can
   *  fall back to an <input type="file">. */
  const handleImportRequest = useCallback(async (): Promise<boolean> => {
    const paths = await pickAudioFiles();
    if (paths === null) return false;
    await addSourcesByPath(paths);
    return true;
  }, [addSourcesByPath]);

  /** Browser fallback path: decode a File and register it under a synthetic key. */
  const handleImportToPool = useCallback(async (file: File) => {
    const key = `${BROWSER_PATH_PREFIX}${file.name}`;
    try {
      const buffer = await audioEngine.registerSourceFromFile(key, file);
      const newSource: SourceAudioFile = {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        path: key,
        format: (file.name.split('.').pop() || 'WAV').toUpperCase(),
        duration_ms: Math.round(buffer.duration * 1000),
        sample_rate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        size_bytes: file.size,
        date_added: new Date().toISOString().split('T')[0],
      };
      setProject((prev) => ({
        ...prev,
        audio_pool: [newSource, ...(prev.audio_pool || []).filter((s) => s.path !== key)],
      }));
    } catch (err) {
      window.alert(`Failed to import ${file.name}: ${err}`);
    }
  }, []);

  const handleInsertFromPool = (source: SourceAudioFile, trackIndex?: number) => {
    pushHistory(project);
    const targetTrack =
      trackIndex !== undefined ? trackIndex : selectedTrackIndex !== null ? selectedTrackIndex : 0;

    const validStartMs = getNonOverlappingStartTime(
      currentTimeMs,
      source.duration_ms,
      targetTrack,
      project.clips
    );

    const newClip: ClipState = {
      id: `clip-${Date.now()}`,
      name: source.name.replace(/\.[^/.]+$/, ''),
      // The real path, so the Rust exporter can open it.
      source_path: source.path,
      track_index: Math.min(project.tracks.length - 1, Math.max(0, targetTrack)),
      start_time_ms: validStartMs,
      offset_ms: 0,
      duration_ms: source.duration_ms,
      gain: 1.0,
      fade_in_ms: 0,
      fade_out_ms: 0,
    };

    setProject((prev) => ({ ...prev, clips: [...prev.clips, newClip] }));
    setSelectedClipId(newClip.id);
  };

  const handleDeleteFromPool = (sourceId: string) => {
    const source = (project.audio_pool || []).find((s) => s.id === sourceId);
    setProject((prev) => ({
      ...prev,
      audio_pool: (prev.audio_pool || []).filter((s) => s.id !== sourceId),
    }));
    if (source) {
      const stillUsed = project.clips.some((c) => c.source_path === source.path);
      if (!stillUsed) audioEngine.removeSource(source.path);
    }
    if (auditioningId === sourceId) {
      audioEngine.stopAudition();
      setAuditioningId(null);
    }
  };

  const handleToggleAudition = (source: SourceAudioFile) => {
    if (auditioningId === source.id) {
      audioEngine.stopAudition();
      setAuditioningId(null);
      return;
    }

    const started = audioEngine.startAudition(source.path, () => {
      setAuditioningId((cur) => (cur === source.id ? null : cur));
    });

    if (started) {
      setAuditioningId(source.id);
    } else {
      window.alert(`${source.name} is not loaded. Re-import it to audition.`);
    }
  };

  // ---------------------------------------------------------------------------
  // Concat mode
  // ---------------------------------------------------------------------------

  const concatLayout = useMemo(() => computeLayout(concat.items), [concat.items]);

  const stopConcatPlayback = useCallback(() => {
    audioEngine.stop();
    setIsConcatPlaying(false);
  }, []);

  const handleConcatPlayPause = useCallback(() => {
    if (isConcatPlaying) {
      audioEngine.pause();
      setIsConcatPlaying(false);
      return;
    }
    if (concat.items.length === 0) return;

    const { starts, totalMs } = computeLayout(concat.items);
    const scheduled = concat.items.map((item, i) => ({
      source_path: item.source_path,
      startMs: starts[i],
      gain: item.gain,
      // Mirror the exporter: a crossfade fades this item out and the next in.
      fadeInMs: i > 0 ? Math.min(concat.items[i - 1].crossfade_ms, item.duration_ms) : 0,
      fadeOutMs: Math.min(item.crossfade_ms, item.duration_ms),
    }));

    const startFrom = concatTimeMs >= totalMs ? 0 : concatTimeMs;
    audioEngine.playSequence(
      scheduled,
      startFrom,
      totalMs,
      concat.apply_master_chain,
      (ms) => setConcatTimeMs(ms)
    );
    setIsConcatPlaying(true);
  }, [isConcatPlaying, concat, concatTimeMs]);

  const handleConcatSeek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(concatLayout.totalMs, ms));
      setConcatTimeMs(clamped);
      if (isConcatPlaying) {
        audioEngine.stop();
        setIsConcatPlaying(false);
      }
    },
    [concatLayout.totalMs, isConcatPlaying]
  );

  /** Files imported while in concat mode are appended to the list automatically
   *  (see the modeRef check inside addSourcesByPath). */
  const handleConcatImport = useCallback(
    () => handleImportRequest(),
    [handleImportRequest]
  );

  const concatPoolItems = useMemo(
    () =>
      (project.audio_pool || []).map((s) => ({
        name: s.name,
        path: s.path,
        duration_ms: s.duration_ms,
      })),
    [project.audio_pool]
  );

  const handleExportConcat = useCallback(
    (options: ExportOptions) =>
      exportConcat(
        {
          name: concat.name,
          sample_rate: concat.sample_rate,
          items: concat.items,
          metadata: concat.metadata,
          apply_master_chain: concat.apply_master_chain,
          master_dsp: project.master_dsp,
        },
        options
      ),
    [concat, project.master_dsp]
  );

  const handleModeChange = useCallback(
    (next: WorkspaceMode) => {
      // Stop whichever transport is running before switching.
      audioEngine.stop();
      setIsPlaying(false);
      setIsConcatPlaying(false);
      setMode(next);
    },
    []
  );

  /**
   * Native OS drag-and-drop. Tauri intercepts file drops before the webview
   * sees them, so the HTML drag events in the sidebar never fire in the desktop
   * build. This listens to Tauri's own event instead.
   */
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const un = await getCurrentWebview().onDragDropEvent((event) => {
          const payload = event.payload as { type: string; paths?: string[] };
          // Tauri 2.0 used dragEnter/dragOver/dragLeave; 2.1+ uses enter/over/leave.
          const kind = payload.type.replace('drag', '').toLowerCase();

          if (kind === 'enter' || kind === 'over') {
            setIsFileDragOver(true);
            return;
          }
          if (kind === 'leave') {
            setIsFileDragOver(false);
            return;
          }
          if (kind !== 'drop') return;

          setIsFileDragOver(false);
          const paths = payload.paths || [];
          if (paths.length === 0) return;

          // A dropped project file opens the project instead of importing audio.
          const projectFile = paths.find(isProjectPath);
          if (projectFile && paths.length === 1) {
            void handleOpenProjectPath(projectFile);
            return;
          }

          const audioPaths = paths.filter(isAudioPath);
          if (audioPaths.length > 0) {
            void addSourcesByPath(audioPaths);
          } else {
            window.alert('Only audio files can be imported into the pool.');
          }
        });

        if (cancelled) un();
        else unlisten = un;
      } catch (err) {
        console.warn('Native drag-and-drop unavailable:', err);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addSourcesByPath, handleOpenProjectPath]);

  // Keyboard Shortcuts (Undo, Redo, Space, Copy, Paste, Delete, Home, End)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Copy: Ctrl+C
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedClipId) {
        e.preventDefault();
        handleCopyClip(selectedClipId);
        return;
      }

      // Paste: Ctrl+V
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteClip();
        return;
      }

      // Duplicate: Ctrl+D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedClipId) {
        e.preventDefault();
        handleDuplicateClip(selectedClipId);
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'KeyS' && selectedClipId) {
        e.preventDefault();
        handleSplitClip(selectedClipId, currentTimeMs);
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
        e.preventDefault();
        handleDeleteClip(selectedClipId);
      } else if (e.code === 'Home') {
        e.preventDefault();
        handleGoToStart();
      } else if (e.code === 'End') {
        e.preventDefault();
        handleGoToEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handlePlayPause,
    handleUndo,
    handleRedo,
    selectedClipId,
    currentTimeMs,
    handleGoToStart,
    handleGoToEnd,
  ]);

  // Synchronize scroll: horizontal scroll for Ruler/Canvas + vertical scroll with track headers
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollLeft(target.scrollLeft);
    if (!isSyncingScrollRef.current && trackListRef.current) {
      isSyncingScrollRef.current = true;
      trackListRef.current.scrollTop = target.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  const handleTrackListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (!isSyncingScrollRef.current && timelineContainerRef.current) {
      isSyncingScrollRef.current = true;
      timelineContainerRef.current.scrollTop = target.scrollTop;
      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }
  };

  /** Peak envelope + full source length per source path, for clip waveforms. */
  const sourceWaveforms = useMemo(() => {
    const map: Record<string, { peaks: number[]; durationMs: number }> = {};
    for (const source of project.audio_pool || []) {
      if (source.waveform_peaks && source.waveform_peaks.length > 0) {
        map[source.path] = {
          peaks: source.waveform_peaks,
          durationMs: source.duration_ms,
        };
      }
    }
    return map;
  }, [project.audio_pool]);

  const totalDurationMs = calculateTotalDurationMs();
  const timelineWidth = Math.max(1800, (totalDurationMs / 1000) * zoom * 1.25);
  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;

  return (
    <div
      id="app-root"
      className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none"
    >
      {/* 1. Top Navigation Bar: Clean dedicated playbar + tools toggle */}
      <TopNavbar
        project={project}
        mode={mode}
        onModeChange={handleModeChange}
        onRenameProject={(name) => setProject((prev) => ({ ...prev, name }))}
        savedPath={savedPath}
        isPlaying={isPlaying}
        currentTimeMs={currentTimeMs}
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onGoToStart={handleGoToStart}
        onGoToEnd={handleGoToEnd}
        onBpmChange={(bpm) => setProject((prev) => ({ ...prev, bpm }))}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isRightSidebarOpen={isRightSidebarOpen}
        onToggleRightSidebar={() => setIsRightSidebarOpen((prev) => !prev)}
      />

      {mode === 'concat' ? (
        <ConcatWorkspace
          state={concat}
          onChange={(updater) => setConcat(updater)}
          onImportRequest={handleConcatImport}
          isImporting={isImporting}
          poolItems={concatPoolItems}
          isPlaying={isConcatPlaying}
          currentTimeMs={concatTimeMs}
          onPlayPause={handleConcatPlayPause}
          onStop={() => {
            stopConcatPlayback();
            setConcatTimeMs(0);
          }}
          onSeek={handleConcatSeek}
          onOpenExport={() => setIsConcatExportOpen(true)}
        />
      ) : (
      <>
      {/* 2. Center Workspace: Flexible Layout (Track Headers + Timeline Canvas + Right Sidebar) */}
      <div id="center-workspace" className="flex-1 flex flex-row min-w-0 overflow-hidden relative">
        {/* Left Column: Track Headers (Collapsible & Resizable) */}
        <div
          id="track-headers-column"
          style={{ width: isTrackAreaCollapsed ? '52px' : `${trackHeaderWidth}px` }}
          className="bg-[#0F172A] border-r border-slate-800 flex flex-col shrink-0 z-10 select-none transition-[width] duration-150"
          onContextMenu={(e) => {
            // Individual TrackHeaders stop propagation and report their own
            // index; reaching here means the empty space below the list.
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              target: { type: 'canvas', clickTimeMs: currentTimeMs },
            });
          }}
        >
          {/* Header Title Corner */}
          <div className="h-8 bg-[#0F172A] border-b border-slate-800 px-2 flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-slate-500">
            {isTrackAreaCollapsed ? (
              <div className="w-full flex items-center justify-between">
                <button
                  onClick={() => setIsTrackAreaCollapsed(false)}
                  title="Expand Track Headers"
                  className="text-slate-400 hover:text-emerald-400 p-1 rounded transition cursor-pointer"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                </button>
                <button
                  id="btn-add-track-collapsed"
                  onClick={handleAddTrack}
                  title="Add New Track"
                  className="text-slate-400 hover:text-emerald-400 p-1 rounded transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => setIsTrackAreaCollapsed(true)}
                    title="Collapse Track Headers"
                    className="text-slate-400 hover:text-amber-400 p-0.5 rounded transition cursor-pointer"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                  <span className="truncate">Tracks ({project.tracks.length})</span>
                </div>
                <button
                  id="btn-add-track"
                  onClick={handleAddTrack}
                  title="Add New Track"
                  className="text-slate-400 hover:text-emerald-400 p-0.5 rounded transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Track Headers Stack (Vertical scroll synced with Timeline Canvas) */}
          <div
            ref={trackListRef}
            onScroll={handleTrackListScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden"
          >
            {project.tracks.map((track, idx) => (
              <TrackHeader
                key={track.id}
                track={track}
                index={idx}
                isSelected={selectedTrackIndex === idx}
                isCollapsed={isTrackAreaCollapsed}
                onSelectTrack={(tIdx) => setSelectedTrackIndex(tIdx)}
                onUpdateTrack={handleUpdateTrack}
                onDeleteTrack={() => handleDeleteTrack(track.id)}
                onOpenColorPicker={handleOpenColorPicker}
                onContextMenu={(trackIdx, clientX, clientY) =>
                  setContextMenu({
                    x: clientX,
                    y: clientY,
                    target: { type: 'track', trackIndex: trackIdx, clickTimeMs: currentTimeMs },
                  })
                }
              />
            ))}

            {/* Empty Add Track area */}
            {!isTrackAreaCollapsed && (
              <button
                onClick={handleAddTrack}
                className="w-full h-12 border-b border-dashed border-slate-800/80 hover:bg-slate-800/30 text-slate-500 hover:text-slate-300 flex items-center justify-center space-x-1.5 text-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Audio Track</span>
              </button>
            )}
          </div>

          {/* Master Bus Stereo Meter */}
          <div className="mt-auto p-2.5 border-t border-slate-800 bg-slate-900/30">
            {isTrackAreaCollapsed ? (
              <div className="flex flex-col items-center gap-1" title="Master Bus Meter">
                <span className="text-[8px] font-bold font-mono text-slate-500">MST</span>
                <div className="flex gap-1 h-12 bg-black/40 rounded p-1">
                  <div className="w-1.5 h-full bg-slate-800/80 rounded-full overflow-hidden flex flex-col justify-end">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-500 via-emerald-400 to-yellow-400 rounded-full transition-all duration-75"
                      style={{ height: `${isPlaying ? Math.min(100, Math.max(8, livePeak * 90)) : 0}%` }}
                    />
                  </div>
                  <div className="w-1.5 h-full bg-slate-800/80 rounded-full overflow-hidden flex flex-col justify-end">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-500 via-emerald-400 to-yellow-400 rounded-full transition-all duration-75"
                      style={{ height: `${isPlaying ? Math.min(100, Math.max(8, livePeak * 85)) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">
                  <span>Master Bus</span>
                  <span className="font-mono text-slate-400 text-[9px]">
                    {isPlaying && livePeak > 0 ? `${(livePeak * -1).toFixed(1)} dB` : '-∞'}
                  </span>
                </div>
                <div className="flex items-center gap-2 h-3.5 w-full bg-black/40 rounded px-1">
                  <span className="text-[8px] font-mono text-slate-600">L</span>
                  <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-yellow-400 rounded-full transition-all duration-75"
                      style={{ width: `${isPlaying ? Math.min(100, Math.max(8, livePeak * 90)) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 h-3.5 w-full bg-black/40 rounded px-1 mt-1">
                  <span className="text-[8px] font-mono text-slate-600">R</span>
                  <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-yellow-400 rounded-full transition-all duration-75"
                      style={{ width: `${isPlaying ? Math.min(100, Math.max(8, livePeak * 85)) : 0}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Draggable Vertical Divider between Track Headers and Timeline */}
        <div
          onMouseDown={(e) => {
            if (isTrackAreaCollapsed) setIsTrackAreaCollapsed(false);
            handleMouseDownLeftResize(e);
          }}
          className="w-1.5 hover:w-2 hover:bg-emerald-500/50 bg-slate-800/60 cursor-col-resize z-20 flex items-center justify-center transition-all group shrink-0 select-none"
          title="Drag to resize track headers width (Click to expand if collapsed)"
        >
          <div className="w-0.5 h-8 rounded bg-slate-600 group-hover:bg-emerald-300 transition-colors" />
        </div>

        {/* Center Area: Timeline Ruler + Timeline Canvas in single unified scroll container */}
        <div
          ref={timelineContainerRef}
          onScroll={handleTimelineScroll}
          id="timeline-main-area"
          className="flex-1 min-w-0 flex flex-col overflow-x-auto overflow-y-auto bg-slate-950"
        >
          <div style={{ width: `${timelineWidth}px` }} className="relative flex flex-col min-w-full">
            {/* Timeline Ruler pinned sticky at top */}
            <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
              <TimelineRuler
                totalDurationMs={totalDurationMs}
                currentTimeMs={currentTimeMs}
                zoom={zoom}
                bpm={project.bpm}
                canvasWidth={timelineWidth}
                clips={project.clips}
                snapToGrid={snapToGrid}
                onSeek={handleSeek}
              />
            </div>

            {/* Timeline Canvas: Non-destructive clips, playhead body dragging, cross-track movement */}
            <TimelineCanvas
              tracks={project.tracks}
              clips={project.clips}
              selectedClipId={selectedClipId}
              selectedTrackIndex={selectedTrackIndex}
              currentTimeMs={currentTimeMs}
              zoom={zoom}
              snapToGrid={snapToGrid}
              bpm={project.bpm}
              canvasWidth={timelineWidth}
              sourceWaveforms={sourceWaveforms}
              onSelectClip={setSelectedClipId}
              onSelectTrack={setSelectedTrackIndex}
              onUpdateClip={handleUpdateClip}
              onSplitClip={handleSplitClip}
              onSeek={handleSeek}
              onZoomChange={setZoom}
              onContextMenu={(clientX, clientY, target) => {
                setContextMenu({ x: clientX, y: clientY, target });
              }}
            />
          </div>
        </div>

        {/* Right Tab / Drawer: File Actions, Snap, Zoom, Undo/Redo & Audio Pool */}
        <RightSidebar
          isOpen={isRightSidebarOpen}
          isCollapsed={isRightSidebarCollapsed}
          activeTab={rightSidebarTab}
          onTabChange={setRightSidebarTab}
          onToggleOpen={() => setIsRightSidebarOpen((prev) => !prev)}
          onToggleCollapse={() => setIsRightSidebarCollapsed((prev) => !prev)}
          project={project}
          onNewProject={handleNewProject}
          onSaveProject={handleSaveProject}
          onOpenProject={handleOpenProject}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          snapToGrid={snapToGrid}
          onToggleSnap={() => setSnapToGrid(!snapToGrid)}
          zoom={zoom}
          onZoomChange={setZoom}
          onZoomFit={handleZoomFit}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          width={rightSidebarWidth}
          onWidthChange={setRightSidebarWidth}
          audioPool={project.audio_pool || []}
          onImportToPool={handleImportToPool}
          onImportRequest={handleImportRequest}
          isImporting={isImporting}
          onInsertFromPool={handleInsertFromPool}
          onDeleteFromPool={handleDeleteFromPool}
          auditioningId={auditioningId}
          onToggleAudition={handleToggleAudition}
        />
      </div>

      {/* 3. Bottom Dock: Mastering DSP Rack / Tag Editor / Clip Inspector (Resizable) */}
      <BottomDock
        settings={project.master_dsp}
        metadata={project.metadata}
        selectedClip={selectedClip}
        tracks={project.tracks}
        currentTimeMs={currentTimeMs}
        liveLufs={liveLufs}
        livePeak={livePeak}
        height={bottomDockHeight}
        onHeightChange={setBottomDockHeight}
        onUpdateDspSettings={handleUpdateDspSettings}
        onUpdateMetadata={handleUpdateMetadata}
        onUpdateClip={handleUpdateClip}
        onSplitClip={handleSplitClip}
        onDeleteClip={handleDeleteClip}
        onDuplicateClip={handleDuplicateClip}
        monitorBypass={monitorBypass}
        onToggleMonitorBypass={() =>
          setMonitorBypass((prev) => {
            const next = !prev;
            audioEngine.setMonitorBypass(next);
            return next;
          })
        }
      />
      </>
      )}

      {/* 4. Export Modals — the same component serves both modes */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        defaultFileName={`${project.name}_Master`}
        itemCount={project.clips.length}
        itemNoun="clip"
        metadata={project.metadata}
        targetLufs={project.master_dsp.target_lufs}
        onExport={(options) => exportProject(project, options)}
      />

      <ExportModal
        isOpen={isConcatExportOpen}
        onClose={() => setIsConcatExportOpen(false)}
        defaultFileName={concat.name}
        itemCount={concat.items.length}
        itemNoun="file"
        metadata={concat.metadata}
        targetLufs={project.master_dsp.target_lufs}
        onExport={handleExportConcat}
      />

      {/* 5. Track Colour Picker */}
      {colorPicker && project.tracks[colorPicker.trackIndex] && (
        <TrackColorPicker
          isOpen
          currentColor={project.tracks[colorPicker.trackIndex].color}
          trackName={project.tracks[colorPicker.trackIndex].name}
          trackIndex={colorPicker.trackIndex}
          allTracks={project.tracks}
          anchorRect={colorPicker.anchor}
          onClose={() => setColorPicker(null)}
          onSelectColor={(color) =>
            handleUpdateTrack(colorPicker.trackIndex, { color })
          }
        />
      )}

      {/* 6. Native OS file drop overlay */}
      {isFileDragOver && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-cyan-400 rounded-2xl px-10 py-8 text-center bg-slate-900/80 shadow-2xl">
            <div className="text-sm font-semibold text-cyan-300">Drop audio files to import</div>
            <div className="text-[11px] text-slate-400 mt-1">
              WAV, MP3, FLAC, OGG, AAC &middot; or a .sic project to open it
            </div>
          </div>
        </div>
      )}

      {/* 7. Custom Context Menu for Track & Clip operations */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          selectedClip={selectedClip}
          selectedTrack={
            contextMenu.target.trackIndex !== undefined
              ? project.tracks[contextMenu.target.trackIndex] || null
              : null
          }
          hasCopiedClip={clipboardClip !== null}
          hasCopiedTrack={clipboardTrack !== null}
          onClose={() => setContextMenu(null)}
          onCopyClip={handleCopyClip}
          onCutClip={handleCutClip}
          onPasteClip={handlePasteClip}
          onDuplicateClip={handleDuplicateClip}
          onSplitClip={handleSplitClip}
          onDeleteClip={handleDeleteClip}
          onCopyTrack={handleCopyTrack}
          onPasteTrack={handlePasteTrack}
          onDuplicateTrack={handleDuplicateTrack}
          onDeleteTrack={handleDeleteTrack}
          onChangeTrackColor={(trackIdx) => handleOpenColorPicker(trackIdx)}
          onAddTrack={handleAddTrack}
        />
      )}
    </div>
  );
}
