import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ClipState, TrackState } from '../types/project';
import { getNonOverlappingStartTime, getNonOverlappingTrimBounds } from '../utils/clipCollisions';
import { hexToRgba } from '../utils/trackColors';
import { getPlayheadSnapTime, SnapResult } from '../utils/timelineSnap';

interface TimelineCanvasProps {
  tracks: TrackState[];
  clips: ClipState[];
  selectedClipId: string | null;
  selectedTrackIndex: number | null;
  currentTimeMs: number;
  zoom: number; // px per second
  snapToGrid: boolean;
  bpm: number;
  canvasWidth: number;
  /** Real peak envelopes keyed by clip.source_path, produced by the Rust analyzer. */
  sourceWaveforms?: Record<string, { peaks: number[]; durationMs: number }>;
  onSelectClip: (clipId: string | null) => void;
  onSelectTrack: (trackIndex: number | null) => void;
  onUpdateClip: (clipId: string, updates: Partial<ClipState>) => void;
  onSplitClip: (clipId: string, splitAtMs: number) => void;
  onSeek: (timeMs: number) => void;
  onZoomChange?: (newZoom: number) => void;
  onContextMenu?: (
    clientX: number,
    clientY: number,
    target: { type: 'clip' | 'track' | 'canvas'; clipId?: string; trackIndex?: number; clickTimeMs: number }
  ) => void;
}

type DragMode = 'move' | 'trim-start' | 'trim-end' | 'scrub' | null;

interface DragState {
  mode: DragMode;
  clipId: string;
  initialMouseX: number;
  initialClipStartMs: number;
  initialClipDurationMs: number;
  initialClipOffsetMs: number;
  initialFadeInMs: number;
  initialFadeOutMs: number;
}

export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  tracks,
  clips,
  selectedClipId,
  selectedTrackIndex,
  currentTimeMs,
  zoom,
  snapToGrid,
  bpm,
  canvasWidth,
  sourceWaveforms = {},
  onSelectClip,
  onSelectTrack,
  onUpdateClip,
  onSplitClip,
  onSeek,
  onZoomChange,
  onContextMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [playheadSnapInfo, setPlayheadSnapInfo] = useState<SnapResult | null>(null);

  const trackHeight = 96; // h-24 px aligned with TrackHeader
  const totalHeight = Math.max(360, tracks.length * trackHeight);

  // Maximum timeline duration in seconds represented by canvasWidth
  const maxTimeSec = Math.max(30, canvasWidth / zoom);

  // Grid snap helper: snap to quarter note or 1/8 note
  const getSnapTimeMs = useCallback(
    (timeMs: number): number => {
      if (!snapToGrid) return timeMs;
      const beatSec = 60 / bpm;
      const snapIntervalMs = (beatSec / 2) * 1000; // 8th note
      return Math.round(timeMs / snapIntervalMs) * snapIntervalMs;
    },
    [snapToGrid, bpm]
  );

  // High-performance canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = totalHeight * dpr;
    ctx.scale(dpr, dpr);

    // 1. Clear background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, canvasWidth, totalHeight);

    // 2. Draw Track Lanes & Horizontal Dividers
    tracks.forEach((track, idx) => {
      const y = idx * trackHeight;
      const isTrackSelected = idx === selectedTrackIndex;
      const trackColor = track.color || '#10b981';

      // Lane background: subtle colored tint if track is currently selected
      if (isTrackSelected) {
        ctx.fillStyle = hexToRgba(trackColor, 0.08);
      } else {
        ctx.fillStyle = idx % 2 === 0 ? '#0f172a' : '#0a0f1d';
      }
      ctx.fillRect(0, y, canvasWidth, trackHeight);

      // Track separator
      ctx.strokeStyle = isTrackSelected ? hexToRgba(trackColor, 0.45) : '#1e293b';
      ctx.lineWidth = isTrackSelected ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, y + trackHeight - 0.5);
      ctx.lineTo(canvasWidth, y + trackHeight - 0.5);
      ctx.stroke();

      // Left lane color accent strip
      ctx.fillStyle = trackColor;
      ctx.fillRect(0, y, 3, trackHeight);
    });

    // 3. Draw Vertical Time Grid Lines
    const beatSec = 60 / bpm;
    const barSec = beatSec * 4;
    const totalBars = Math.ceil(maxTimeSec / barSec);

    for (let b = 0; b <= totalBars; b++) {
      const barX = b * barSec * zoom;
      // Bar line
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX, 0);
      ctx.lineTo(barX, totalHeight);
      ctx.stroke();

      // Beat lines
      if (zoom > 40) {
        ctx.strokeStyle = '#131b2e';
        for (let beat = 1; beat < 4; beat++) {
          const beatX = barX + beat * beatSec * zoom;
          ctx.beginPath();
          ctx.moveTo(beatX, 0);
          ctx.lineTo(beatX, totalHeight);
          ctx.stroke();
        }
      }
    }

    // 4. Render Clips and Waveforms (inherit track's assigned distinct color!)
    clips.forEach((clip) => {
      const trackIndex = clip.track_index;
      if (trackIndex >= tracks.length) return;

      const track = tracks[trackIndex];
      const trackColor = track?.color || '#10b981';

      const clipX = (clip.start_time_ms / 1000) * zoom;
      const clipW = Math.max(12, (clip.duration_ms / 1000) * zoom);
      const clipY = trackIndex * trackHeight + 4;
      const clipH = trackHeight - 8;

      const isSelected = clip.id === selectedClipId;

      // Clip Card Container
      ctx.save();
      ctx.beginPath();
      // Round rect with 4px radius
      const r = 4;
      ctx.moveTo(clipX + r, clipY);
      ctx.lineTo(clipX + clipW - r, clipY);
      ctx.quadraticCurveTo(clipX + clipW, clipY, clipX + clipW, clipY + r);
      ctx.lineTo(clipX + clipW, clipY + clipH - r);
      ctx.quadraticCurveTo(clipX + clipW, clipY + clipH, clipX + clipW - r, clipY + clipH);
      ctx.lineTo(clipX + r, clipY + clipH);
      ctx.quadraticCurveTo(clipX, clipY + clipH, clipX, clipY + clipH - r);
      ctx.lineTo(clipX, clipY + r);
      ctx.quadraticCurveTo(clipX, clipY, clipX + r, clipY);
      ctx.closePath();
      ctx.clip();

      // Background gradient based on track's color
      const clipGrad = ctx.createLinearGradient(clipX, clipY, clipX, clipY + clipH);
      clipGrad.addColorStop(0, hexToRgba(trackColor, 0.18));
      clipGrad.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
      ctx.fillStyle = clipGrad;
      ctx.fillRect(clipX, clipY, clipW, clipH);

      // Badge Header Tag
      const badgeW = Math.min(clipW - 8, 120);
      if (badgeW > 24) {
        ctx.fillStyle = hexToRgba(trackColor, 0.25);
        ctx.beginPath();
        ctx.roundRect(clipX + 4, clipY + 4, badgeW, 14, 3);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(trackColor, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = trackColor;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(clip.name.substring(0, 16), clipX + 8, clipY + 14);
      }

      // Waveform Peaks rendering (Accented with track color)
      const waveY = clipY + 20;
      const waveH = clipH - 22;
      const midY = waveY + waveH / 2;

      // Center baseline
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(clipX, midY);
      ctx.lineTo(clipX + clipW, midY);
      ctx.stroke();

      // Draw peaks from the decoded source. The slice of the envelope shown
      // follows the clip's trim offset and duration, so trimming and splitting
      // reveal the correct part of the waveform.
      const numPoints = Math.max(16, Math.floor(clipW / 2));
      const peakGrad = ctx.createLinearGradient(clipX, waveY, clipX, waveY + waveH);
      peakGrad.addColorStop(0, hexToRgba(trackColor, 0.95));
      peakGrad.addColorStop(0.5, trackColor);
      peakGrad.addColorStop(1, hexToRgba(trackColor, 0.7));

      const wave = sourceWaveforms[clip.source_path];

      if (wave && wave.peaks.length > 0 && wave.durationMs > 0) {
        ctx.fillStyle = peakGrad;
        const peaks = wave.peaks;
        const startFrac = clip.offset_ms / wave.durationMs;
        const spanFrac = clip.duration_ms / wave.durationMs;

        for (let p = 0; p < numPoints; p++) {
          const frac = startFrac + (p / numPoints) * spanFrac;
          if (frac < 0 || frac >= 1) continue; // past the end of the source
          const idx = Math.min(peaks.length - 1, Math.floor(frac * peaks.length));
          const amp = Math.min(1, Math.max(0, peaks[idx] * clip.gain));
          const ph = Math.max(0.5, amp * (waveH / 2) * 0.92);
          ctx.fillRect(clipX + (p / numPoints) * clipW, midY - ph, 1.5, ph * 2);
        }
      } else {
        // Source not analyzed (or missing): show a flat placeholder rather than
        // inventing a waveform that implies audio is present.
        ctx.strokeStyle = hexToRgba(trackColor, 0.35);
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(clipX + 2, midY);
        ctx.lineTo(clipX + clipW - 2, midY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Clipping Warning Banner if gain is high
      if (clip.gain >= 1.25 && clipW > 100) {
        const bannerW = Math.min(96, clipW * 0.35);
        const bannerX = clipX + clipW - bannerW;
        const bannerGrad = ctx.createLinearGradient(bannerX, clipY, clipX + clipW, clipY);
        bannerGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
        bannerGrad.addColorStop(1, 'rgba(239, 68, 68, 0.25)');
        ctx.fillStyle = bannerGrad;
        ctx.fillRect(bannerX, clipY, bannerW, clipH);

        ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
        ctx.beginPath();
        ctx.moveTo(bannerX, clipY);
        ctx.lineTo(bannerX, clipY + clipH);
        ctx.stroke();

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('CLIPPING DETECTED', clipX + clipW - 6, clipY + 14);
      }

      // Fade-in Curve Overlay
      if (clip.fade_in_ms > 0) {
        const fadeInW = (clip.fade_in_ms / 1000) * zoom;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.beginPath();
        ctx.moveTo(clipX, clipY);
        ctx.lineTo(clipX + fadeInW, clipY);
        ctx.lineTo(clipX, clipY + clipH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = trackColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(clipX, clipY + clipH);
        ctx.quadraticCurveTo(clipX, clipY, clipX + fadeInW, clipY);
        ctx.stroke();
      }

      // Fade-out Curve Overlay
      if (clip.fade_out_ms > 0) {
        const fadeOutW = (clip.fade_out_ms / 1000) * zoom;
        const fadeOutX = clipX + clipW - fadeOutW;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.beginPath();
        ctx.moveTo(fadeOutX, clipY);
        ctx.lineTo(clipX + clipW, clipY);
        ctx.lineTo(clipX + clipW, clipY + clipH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = trackColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fadeOutX, clipY);
        ctx.quadraticCurveTo(clipX + clipW, clipY, clipX + clipW, clipY + clipH);
        ctx.stroke();
      }

      ctx.restore();

      // Border Outline
      ctx.strokeStyle = isSelected
        ? '#38bdf8'
        : hexToRgba(trackColor, 0.5);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(clipX, clipY, clipW, clipH);

      // Trim Handles on selection
      if (isSelected) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(clipX - 2, clipY + clipH / 2 - 8, 4, 16);
        ctx.fillRect(clipX + clipW - 2, clipY + clipH / 2 - 8, 4, 16);
      }
    });

    // 5. Draw Playhead Vertical Scrubber Line & Glowing Diamond Marker
    const playheadX = (currentTimeMs / 1000) * zoom;

    // Check if playhead is snapped or currently aligned with any clip boundary
    let isSnappedToClip = Boolean(
      playheadSnapInfo &&
      playheadSnapInfo.isSnapped &&
      (playheadSnapInfo.snapType === 'clip-start' || playheadSnapInfo.snapType === 'clip-end' || playheadSnapInfo.snapType === 'origin')
    );
    if (!isSnappedToClip && clips.length > 0) {
      for (const clip of clips) {
        if (
          Math.abs(currentTimeMs - clip.start_time_ms) < 1 ||
          Math.abs(currentTimeMs - (clip.start_time_ms + clip.duration_ms)) < 1
        ) {
          isSnappedToClip = true;
          break;
        }
      }
    }

    const playheadColor = isSnappedToClip ? '#f59e0b' : '#10b981';
    const glowColor = isSnappedToClip ? 'rgba(245, 158, 11, 0.5)' : 'rgba(16, 185, 129, 0.4)';

    // Playhead Glow
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = isSnappedToClip ? 6 : 4;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, totalHeight);
    ctx.stroke();

    // Playhead Line
    ctx.strokeStyle = playheadColor;
    ctx.lineWidth = isSnappedToClip ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, totalHeight);
    ctx.stroke();

    // Diamond head cap at top of canvas (seamlessly connects to Ruler arrow)
    ctx.fillStyle = playheadColor;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX - 4, 4);
    ctx.lineTo(playheadX, 8);
    ctx.lineTo(playheadX + 4, 4);
    ctx.closePath();
    ctx.fill();

    // Snap HUD Tag floating near top of playhead
    if (playheadSnapInfo && playheadSnapInfo.isSnapped && playheadSnapInfo.snapLabel) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      const text = `⇥ ${playheadSnapInfo.snapLabel.toUpperCase()}`;
      const textMetrics = ctx.measureText(text);
      const badgeW = textMetrics.width + 16;
      const badgeH = 18;
      const badgeX = Math.max(6, Math.min(canvasWidth - badgeW - 6, playheadX - badgeW / 2));
      const badgeY = 12;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2);
      ctx.restore();
    }
  }, [
    canvasWidth,
    totalHeight,
    tracks,
    clips,
    selectedClipId,
    selectedTrackIndex,
    currentTimeMs,
    zoom,
    bpm,
    maxTimeSec,
    playheadSnapInfo,
    sourceWaveforms,
  ]);

  // Pointer Interaction Handling:
  // - Clicking clip selects clip (and track) without moving position indicator
  // - Clicking empty lane selects track without moving position indicator
  // - Dragging playhead body or clicking top ruler scrubs position indicator
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Left click only
    if (e.button !== 0) return;
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const playheadX = (currentTimeMs / 1000) * zoom;
    const clickedTrackIndex = Math.floor(mouseY / trackHeight);

    // 1. Hit-test clips anywhere on the clicked track (test latest first)
    let hitClip: ClipState | null = null;
    let hitMode: DragMode = 'move';

    if (clickedTrackIndex >= 0 && clickedTrackIndex < tracks.length) {
      for (let i = clips.length - 1; i >= 0; i--) {
        const clip = clips[i];
        if (clip.track_index !== clickedTrackIndex) continue;
        const clipX = (clip.start_time_ms / 1000) * zoom;
        const clipW = Math.max(12, (clip.duration_ms / 1000) * zoom);
        const clipY = clip.track_index * trackHeight + 4;
        const clipH = trackHeight - 8;

        if (
          mouseX >= clipX - 6 &&
          mouseX <= clipX + clipW + 6 &&
          mouseY >= clipY &&
          mouseY <= clipY + clipH
        ) {
          hitClip = clip;
          // Check if edge trim
          if (Math.abs(mouseX - clipX) <= 8) {
            hitMode = 'trim-start';
          } else if (Math.abs(mouseX - (clipX + clipW)) <= 8) {
            hitMode = 'trim-end';
          } else {
            hitMode = 'move';
          }
          break;
        }
      }
    }

    if (hitClip) {
      onSelectClip(hitClip.id);
      onSelectTrack(hitClip.track_index);
      setDragState({
        mode: hitMode,
        clipId: hitClip.id,
        initialMouseX: mouseX,
        initialClipStartMs: hitClip.start_time_ms,
        initialClipDurationMs: hitClip.duration_ms,
        initialClipOffsetMs: hitClip.offset_ms,
        initialFadeInMs: hitClip.fade_in_ms,
        initialFadeOutMs: hitClip.fade_out_ms,
      });
      // NOTE: Clicking a clip selects and moves it, but does NOT move the position indicator!
      return;
    }

    // 2. Check if user clicked directly on the body of the position indicator (within 6px)
    if (Math.abs(mouseX - playheadX) <= 6) {
      setDragState({
        mode: 'scrub',
        clipId: '',
        initialMouseX: mouseX,
        initialClipStartMs: 0,
        initialClipDurationMs: 0,
        initialClipOffsetMs: 0,
        initialFadeInMs: 0,
        initialFadeOutMs: 0,
      });
      return;
    }

    // 3. User clicked on empty space on the edit area
    // Strictly respect user requirement:
    // "clicking on the edit area shouldnt move the position indicator there,
    // to move the position, the user can only click on the nav track on the top
    // or drag the body of the position indicator. because clicking on the edit area
    // moves the position indicator automatically, i cant select the track on the edit area"
    if (clickedTrackIndex >= 0 && clickedTrackIndex < tracks.length) {
      onSelectTrack(clickedTrackIndex);
      onSelectClip(null);
      // DO NOT call onSeek! Position indicator remains untouched.
    } else {
      onSelectClip(null);
      onSelectTrack(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentMouseX = e.clientX - rect.left;
    const currentMouseY = e.clientY - rect.top;

    if (!dragState) {
      // Hover cursor management
      const playheadX = (currentTimeMs / 1000) * zoom;
      if (Math.abs(currentMouseX - playheadX) <= 6) {
        setCursorStyle('ew-resize');
        return;
      }

      const trackIdx = Math.floor(currentMouseY / trackHeight);
      let foundHover = false;
      for (let i = clips.length - 1; i >= 0; i--) {
        const clip = clips[i];
        if (clip.track_index !== trackIdx) continue;
        const clipX = (clip.start_time_ms / 1000) * zoom;
        const clipW = Math.max(12, (clip.duration_ms / 1000) * zoom);
        if (currentMouseX >= clipX - 6 && currentMouseX <= clipX + clipW + 6) {
          if (Math.abs(currentMouseX - clipX) <= 8 || Math.abs(currentMouseX - (clipX + clipW)) <= 8) {
            setCursorStyle('ew-resize');
          } else {
            setCursorStyle('grab');
          }
          foundHover = true;
          break;
        }
      }
      if (!foundHover) {
        setCursorStyle('default');
      }
      return;
    }

    // Active dragging
    const deltaX = currentMouseX - dragState.initialMouseX;
    const deltaMs = (deltaX / zoom) * 1000;

    if (dragState.mode === 'scrub') {
      const rawTimeMs = Math.max(0, (currentMouseX / zoom) * 1000);
      const snap = getPlayheadSnapTime(rawTimeMs, clips, zoom, snapToGrid, bpm, 12);
      setPlayheadSnapInfo(snap.isSnapped ? snap : null);
      onSeek(snap.snappedTimeMs);
    } else if (dragState.mode === 'move') {
      let proposedStartMs = Math.max(0, dragState.initialClipStartMs + deltaMs);
      proposedStartMs = getSnapTimeMs(proposedStartMs);
      const targetTrackIndex = Math.max(0, Math.min(tracks.length - 1, Math.floor(currentMouseY / trackHeight)));

      // Enforce zero overlap on the same audio track
      const validStartMs = getNonOverlappingStartTime(
        proposedStartMs,
        dragState.initialClipDurationMs,
        targetTrackIndex,
        clips,
        dragState.clipId
      );

      onUpdateClip(dragState.clipId, {
        start_time_ms: validStartMs,
        track_index: targetTrackIndex,
      });
    } else if (dragState.mode === 'trim-start') {
      const targetClip = clips.find((c) => c.id === dragState.clipId);
      const trackIdx = targetClip ? targetClip.track_index : 0;
      const { minStartMs } = getNonOverlappingTrimBounds(dragState.clipId, trackIdx, clips);

      const maxDelta = dragState.initialClipDurationMs - 200; // minimum 200ms clip
      const clampedDelta = Math.min(maxDelta, deltaMs);
      const requestedStartMs = Math.max(0, dragState.initialClipStartMs + clampedDelta);
      const newStartMs = Math.max(minStartMs, requestedStartMs);
      const actualDelta = newStartMs - dragState.initialClipStartMs;
      const newDurationMs = Math.max(200, dragState.initialClipDurationMs - actualDelta);
      const newOffsetMs = Math.max(0, dragState.initialClipOffsetMs + actualDelta);

      onUpdateClip(dragState.clipId, {
        start_time_ms: newStartMs,
        duration_ms: newDurationMs,
        offset_ms: newOffsetMs,
      });
    } else if (dragState.mode === 'trim-end') {
      const targetClip = clips.find((c) => c.id === dragState.clipId);
      const trackIdx = targetClip ? targetClip.track_index : 0;
      const { maxEndMs } = getNonOverlappingTrimBounds(dragState.clipId, trackIdx, clips);

      const requestedDuration = Math.max(200, dragState.initialClipDurationMs + deltaMs);
      const startMs = targetClip ? targetClip.start_time_ms : dragState.initialClipStartMs;
      const maxAllowedDuration = maxEndMs === Infinity ? Infinity : Math.max(200, maxEndMs - startMs);
      const newDurationMs = Math.min(maxAllowedDuration, requestedDuration);

      onUpdateClip(dragState.clipId, { duration_ms: newDurationMs });
    }
  };

  const handleMouseUp = () => {
    setDragState(null);
    setPlayheadSnapInfo(null);
  };

  // Mouse Wheel zooming with Ctrl/Cmd key
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(5, Math.min(250, Math.round(zoom * zoomFactor)));
      onZoomChange?.(newZoom);
    }
  };

  // Custom Context Menu on right click
  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const trackIndex = Math.floor(mouseY / trackHeight);

    let hitClipId: string | undefined;
    for (let i = clips.length - 1; i >= 0; i--) {
      const clip = clips[i];
      if (clip.track_index !== trackIndex) continue;
      const clipX = (clip.start_time_ms / 1000) * zoom;
      const clipW = Math.max(12, (clip.duration_ms / 1000) * zoom);
      if (mouseX >= clipX && mouseX <= clipX + clipW) {
        hitClipId = clip.id;
        break;
      }
    }

    onContextMenu?.(e.clientX, e.clientY, {
      type: hitClipId ? 'clip' : trackIndex >= 0 && trackIndex < tracks.length ? 'track' : 'canvas',
      clipId: hitClipId,
      trackIndex: trackIndex >= 0 && trackIndex < tracks.length ? trackIndex : undefined,
      clickTimeMs: (mouseX / zoom) * 1000,
    });
  };

  return (
    <div
      id="timeline-canvas-container"
      className="bg-[#0a0f1d] relative select-none"
      style={{
        width: `${canvasWidth}px`,
        height: `${totalHeight}px`,
        cursor: dragState ? (dragState.mode === 'scrub' ? 'ew-resize' : 'grabbing') : cursorStyle,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      {/* Immersive subtle grid background */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: `${canvasWidth}px`, height: `${totalHeight}px` }}
        className="block"
      />
    </div>
  );
};
