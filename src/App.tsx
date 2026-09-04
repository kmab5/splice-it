import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ProjectState,
  ClipState,
  TrackState,
  MasterDspSettings,
  MetadataDto,
  SourceAudioFile,
} from './types/project';
import { audioEngine } from './services/audioEngine';
import { TopNavbar } from './components/TopNavbar';
import { TimelineRuler } from './components/TimelineRuler';
import { TrackHeader } from './components/TrackHeader';
import { TimelineCanvas } from './components/TimelineCanvas';
import { BottomDock } from './components/BottomDock';
import { ExportModal } from './components/ExportModal';
import { RightSidebar } from './components/RightSidebar';
import { ContextMenu, ContextMenuTarget } from './components/ContextMenu';
import { getNonOverlappingStartTime } from './utils/clipCollisions';
import { getRandomTrackColor } from './utils/trackColors';
import { Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const DEMO_AUDIO_POOL: SourceAudioFile[] = [
  {
    id: 'src-1',
    name: 'drums_120bpm.wav',
    format: 'WAV',
    duration_ms: 16000,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 2822400,
    date_added: '2026-09-04',
  },
  {
    id: 'src-2',
    name: 'sub_bass_loop.wav',
    format: 'WAV',
    duration_ms: 12000,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 2116800,
    date_added: '2026-09-04',
  },
  {
    id: 'src-3',
    name: 'synth_chords.wav',
    format: 'WAV',
    duration_ms: 10000,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 1764000,
    date_added: '2026-09-04',
  },
  {
    id: 'src-4',
    name: 'vocal_chant.wav',
    format: 'WAV',
    duration_ms: 8000,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 1411200,
    date_added: '2026-09-04',
  },
  {
    id: 'src-5',
    name: 'ambient_sweep.wav',
    format: 'WAV',
    duration_ms: 6000,
    sample_rate: 44100,
    channels: 2,
    size_bytes: 1058400,
    date_added: '2026-09-04',
  },
];

const INITIAL_PROJECT: ProjectState = {
  version: '2.0.0',
  name: 'Neon Skyline (Master)',
  sample_rate: 44100,
  bpm: 120,
  tracks: [
    {
      id: 'trk-1',
      name: 'Drums & Groove',
      muted: false,
      solo: false,
      volume: 1.0,
      pan: 0.0,
      color: '#10b981', // Emerald
    },
    {
      id: 'trk-2',
      name: 'Sub 808 Bass',
      muted: false,
      solo: false,
      volume: 0.95,
      pan: 0.0,
      color: '#06b6d4', // Cyan
    },
    {
      id: 'trk-3',
      name: 'Analog Chords',
      muted: false,
      solo: false,
      volume: 0.85,
      pan: -0.2,
      color: '#38bdf8', // Sky
    },
    {
      id: 'trk-4',
      name: 'Vocal Pad & FX',
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0.25,
      color: '#a855f7', // Purple
    },
  ],
  clips: [
    {
      id: 'clip-1',
      name: 'Drum Groove A',
      source_path: 'stems/drums_120bpm.wav',
      track_index: 0,
      start_time_ms: 0,
      offset_ms: 0,
      duration_ms: 8000,
      gain: 1.0,
      fade_in_ms: 50,
      fade_out_ms: 200,
    },
    {
      id: 'clip-2',
      name: 'Drum Fill & Break',
      source_path: 'stems/drums_fill.wav',
      track_index: 0,
      start_time_ms: 8000,
      offset_ms: 0,
      duration_ms: 8000,
      gain: 1.0,
      fade_in_ms: 0,
      fade_out_ms: 350,
    },
    {
      id: 'clip-3',
      name: '808 Bassline Loop',
      source_path: 'stems/sub_bass_loop.wav',
      track_index: 1,
      start_time_ms: 0,
      offset_ms: 0,
      duration_ms: 12000,
      gain: 1.0,
      fade_in_ms: 80,
      fade_out_ms: 400,
    },
    {
      id: 'clip-4',
      name: 'Neo Chords (Verse)',
      source_path: 'stems/synth_chords.wav',
      track_index: 2,
      start_time_ms: 2000,
      offset_ms: 0,
      duration_ms: 10000,
      gain: 0.9,
      fade_in_ms: 250,
      fade_out_ms: 500,
    },
    {
      id: 'clip-5',
      name: 'Vocal Lead Chant',
      source_path: 'stems/vocal_chant.wav',
      track_index: 3,
      start_time_ms: 4000,
      offset_ms: 0,
      duration_ms: 8000,
      gain: 0.85,
      fade_in_ms: 400,
      fade_out_ms: 600,
    },
    {
      id: 'clip-6',
      name: 'Ambient Filter Sweep',
      source_path: 'stems/ambient_sweep.wav',
      track_index: 3,
      start_time_ms: 12000,
      offset_ms: 0,
      duration_ms: 6000,
      gain: 0.75,
      fade_in_ms: 300,
      fade_out_ms: 800,
    },
  ],
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
    title: 'Neon Skyline (Master)',
    artist: 'Aether Wave',
    album: 'Parallel Horizons',
    year: 2026,
    track_number: 1,
    total_tracks: 8,
    disc_number: 1,
    genre: 'Synthwave / Cyberpunk',
    comment: 'Mastered with Splice It DSP Chain (-14 LUFS)',
    composer: 'Aether Wave',
    isrc: 'US-SP1-26-00101',
    bpm: 120,
    key: 'A minor',
    lyrics: 'Cruising through the electric night\nCircuits humming in the neon light...',
    copyright: '© 2026 Splice It Records',
    publisher: 'Splice It Music Group',
    encoder: 'Splice It Rust DSP Engine v2.0',
    cover_art_base64: undefined,
    cover_art_mime: 'image/jpeg',
  },
  audio_pool: DEMO_AUDIO_POOL,
};

export default function App() {
  const [project, setProject] = useState<ProjectState>(INITIAL_PROJECT);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(65); // px per second
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [selectedClipId, setSelectedClipId] = useState<string | null>('clip-1');
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

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: ContextMenuTarget;
  } | null>(null);

  // Audio Pool Auditioning
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const auditionSourceRef = useRef<AudioBufferSourceNode | null>(null);

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

  // Initialize demo buffers for Web Audio
  useEffect(() => {
    audioEngine.createDemoBuffers(project.clips).catch(console.error);
  }, []);

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

    audioEngine.createDemoBuffers(newClips).catch(console.error);
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

    audioEngine.createDemoBuffers(duplicatedClips).catch(console.error);
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

      audioEngine.createDemoBuffers([leftClip, rightClip]).catch(console.error);

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
    audioEngine.createDemoBuffers([newClip]).catch(console.error);
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
    audioEngine.createDemoBuffers([newClip]).catch(console.error);
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

  const handleSaveProject = () => {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.sic`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenProject = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ProjectState;
      if (parsed.tracks && parsed.clips) {
        handleStop();
        pushHistory(project);
        setProject(parsed);
        audioEngine.createDemoBuffers(parsed.clips).catch(console.error);
      }
    } catch {
      alert('Failed to parse project file: Invalid JSON structure.');
    }
  };

  // Audio Pool Handlers (User Request: "a separate place for audio management (source audio, not clips/tracks on the edit area)")
  const handleImportToPool = async (file: File) => {
    try {
      const buffer = await audioEngine.loadAudioFile(file);
      const ext = file.name.split('.').pop()?.toUpperCase() || 'WAV';
      const newSource: SourceAudioFile = {
        id: `src-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: file.name,
        format: ext,
        duration_ms: Math.round(buffer.duration * 1000),
        sample_rate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        size_bytes: file.size,
        date_added: new Date().toISOString().split('T')[0],
      };

      setProject((prev) => ({
        ...prev,
        audio_pool: [newSource, ...(prev.audio_pool || [])],
      }));
    } catch (err) {
      alert(`Failed to import source audio: ${err}`);
    }
  };

  const handleInsertFromPool = (source: SourceAudioFile, trackIndex?: number) => {
    pushHistory(project);
    const targetTrack =
      trackIndex !== undefined
        ? trackIndex
        : selectedClip
        ? selectedClip.track_index
        : 0;

    // Enforce zero overlap: find nearest non-overlapping slot on target track
    const validStartMs = getNonOverlappingStartTime(
      currentTimeMs,
      source.duration_ms,
      targetTrack,
      project.clips
    );

    const newClip: ClipState = {
      id: `clip-${Date.now()}`,
      name: source.name.replace(/\.[^/.]+$/, ''),
      source_path: source.name,
      track_index: Math.min(project.tracks.length - 1, targetTrack),
      start_time_ms: validStartMs,
      offset_ms: 0,
      duration_ms: source.duration_ms,
      gain: 1.0,
      fade_in_ms: 20,
      fade_out_ms: 100,
    };

    setProject((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
    }));
    setSelectedClipId(newClip.id);
    audioEngine.createDemoBuffers([newClip]).catch(console.error);
  };

  const handleDeleteFromPool = (sourceId: string) => {
    setProject((prev) => ({
      ...prev,
      audio_pool: (prev.audio_pool || []).filter((s) => s.id !== sourceId),
    }));
    if (auditioningId === sourceId) {
      if (auditionSourceRef.current) {
        try {
          auditionSourceRef.current.stop();
        } catch {
          // ignore
        }
      }
      setAuditioningId(null);
    }
  };

  const handleToggleAudition = (source: SourceAudioFile) => {
    if (auditioningId === source.id) {
      // Stop audition
      if (auditionSourceRef.current) {
        try {
          auditionSourceRef.current.stop();
        } catch {
          // ignore
        }
      }
      setAuditioningId(null);
      return;
    }

    // Play audition preview
    try {
      const ctx = audioEngine.getAudioContext();
      if (auditionSourceRef.current) {
        try {
          auditionSourceRef.current.stop();
        } catch {
          // ignore
        }
      }
      const durSec = Math.max(1, source.duration_ms / 1000);
      const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * Math.min(8, durSec)), ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        const freq = 180 + (source.name.length % 5) * 60;
        for (let i = 0; i < data.length; i++) {
          const t = i / ctx.sampleRate;
          data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 0.4) * 0.25;
        }
      }
      const srcNode = ctx.createBufferSource();
      srcNode.buffer = buffer;
      srcNode.connect(ctx.destination);
      srcNode.onended = () => {
        setAuditioningId((cur) => (cur === source.id ? null : cur));
      };
      srcNode.start();
      auditionSourceRef.current = srcNode;
      setAuditioningId(source.id);
    } catch {
      setAuditioningId(null);
    }
  };

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

      {/* 2. Center Workspace: Flexible Layout (Track Headers + Timeline Canvas + Right Sidebar) */}
      <div id="center-workspace" className="flex-1 flex flex-row min-w-0 overflow-hidden relative">
        {/* Left Column: Track Headers (Collapsible & Resizable) */}
        <div
          id="track-headers-column"
          style={{ width: isTrackAreaCollapsed ? '52px' : `${trackHeaderWidth}px` }}
          className="bg-[#0F172A] border-r border-slate-800 flex flex-col shrink-0 z-10 select-none transition-[width] duration-150"
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              target: { type: 'track', clickTimeMs: currentTimeMs },
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
      />

      {/* 4. Export Master Mixdown Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        project={project}
        onClose={() => setIsExportModalOpen(false)}
      />

      {/* 5. Custom Context Menu for Track & Clip operations */}
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
          onAddTrack={handleAddTrack}
        />
      )}
    </div>
  );
}
