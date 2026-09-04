import React, { useRef, useEffect, useState } from 'react';
import { ClipState } from '../types/project';
import { getPlayheadSnapTime } from '../utils/timelineSnap';

interface TimelineRulerProps {
  totalDurationMs: number;
  currentTimeMs: number;
  zoom: number; // px per second
  bpm: number;
  canvasWidth: number;
  clips?: ClipState[];
  snapToGrid?: boolean;
  onSeek: (timeMs: number) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  totalDurationMs,
  currentTimeMs,
  zoom,
  bpm,
  canvasWidth,
  clips = [],
  snapToGrid = true,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const [isSnappedToClip, setIsSnappedToClip] = useState(false);
  const [snapLabel, setSnapLabel] = useState<string | null>(null);

  // Maximum timeline duration represented across the ruler
  const maxTimeSec = Math.max(30, canvasWidth / zoom);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI Canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const height = 32;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, height);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvasWidth, height);

    // Dynamic grid step based on zoom level (supports down to zoom = 5)
    let secStep = 1;
    if (zoom <= 10) secStep = 10;
    else if (zoom <= 25) secStep = 5;
    else if (zoom <= 50) secStep = 2;
    else if (zoom <= 90) secStep = 1;
    else secStep = 0.5;

    const numSteps = Math.ceil(maxTimeSec / secStep);
    const playheadX = (currentTimeMs / 1000) * zoom;

    ctx.strokeStyle = '#334155';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i <= numSteps; i++) {
      const timeSec = i * secStep;
      const x = timeSec * zoom;

      // Check if this step is near the playhead
      const isNearPlayhead = Math.abs(x - playheadX) < (secStep * zoom) / 2;

      // Major tick
      ctx.strokeStyle = isNearPlayhead ? '#059669' : '#334155';
      ctx.beginPath();
      ctx.moveTo(x, height - 10);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Time label
      const mins = Math.floor(timeSec / 60);
      const secs = Math.floor(timeSec % 60);
      const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Numbers synced with position indicator: highlight when near playhead
      ctx.fillStyle = isNearPlayhead ? '#34d399' : '#64748b';
      ctx.fillText(label, x + 3, 16);

      // Minor ticks
      if (zoom > 35) {
        const subSteps = zoom > 70 ? 4 : 2;
        ctx.strokeStyle = '#1e293b';
        for (let j = 1; j < subSteps; j++) {
          const subX = x + (j * (secStep * zoom)) / subSteps;
          ctx.beginPath();
          ctx.moveTo(subX, height - 5);
          ctx.lineTo(subX, height);
          ctx.stroke();
        }
      }
    }

    // Bottom border
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(canvasWidth, height - 0.5);
    ctx.stroke();

    // Check if currently exactly aligned with any clip start or end
    let currentlyAlignedWithClip = isSnappedToClip;
    if (!currentlyAlignedWithClip && clips.length > 0) {
      for (const clip of clips) {
        if (Math.abs(currentTimeMs - clip.start_time_ms) < 1 || Math.abs(currentTimeMs - (clip.start_time_ms + clip.duration_ms)) < 1) {
          currentlyAlignedWithClip = true;
          break;
        }
      }
    }

    const indicatorColor = currentlyAlignedWithClip ? '#f59e0b' : '#10b981';

    // Synced Real-Time Playhead Marker on Ruler
    ctx.strokeStyle = indicatorColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    // Playhead time badge
    const curTotalSec = currentTimeMs / 1000;
    const curMin = Math.floor(curTotalSec / 60);
    const curSec = Math.floor(curTotalSec % 60);
    const curTenth = Math.floor((curTotalSec % 1) * 10);
    const badgeText = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')}.${curTenth}`;

    const badgeW = currentlyAlignedWithClip ? 54 : 46;
    const badgeH = 13;
    const badgeX = Math.max(2, playheadX - badgeW / 2);

    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, 2, badgeW, badgeH, 2.5);
    ctx.fill();

    ctx.fillStyle = currentlyAlignedWithClip ? '#451a03' : '#022c22';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentlyAlignedWithClip ? `⇥ ${badgeText}` : badgeText, badgeX + badgeW / 2, 11);

    // Downward arrow pointer pointing directly to the timeline canvas playhead below
    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.moveTo(playheadX - 4, 15);
    ctx.lineTo(playheadX + 4, 15);
    ctx.lineTo(playheadX, 21);
    ctx.closePath();
    ctx.fill();
  }, [canvasWidth, maxTimeSec, zoom, currentTimeMs, isSnappedToClip, clips]);

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    updateSeekFromEvent(e);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      updateSeekFromEvent(e);
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    setIsSnappedToClip(false);
    setSnapLabel(null);
  };

  const updateSeekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const rawTimeMs = Math.max(0, (clickX / zoom) * 1000);
    const snapRes = getPlayheadSnapTime(rawTimeMs, clips, zoom, snapToGrid, bpm, 12);
    setIsSnappedToClip(snapRes.isSnapped && (snapRes.snapType === 'clip-start' || snapRes.snapType === 'clip-end' || snapRes.snapType === 'origin'));
    setSnapLabel(snapRes.snapLabel || null);
    onSeek(snapRes.snappedTimeMs);
  };

  return (
    <div
      id="timeline-ruler"
      className="h-8 bg-slate-900/95 select-none cursor-pointer border-b border-slate-800 relative select-none"
      style={{ width: `${canvasWidth}px` }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${canvasWidth}px`, height: '32px' }}
        className="block"
      />
    </div>
  );
};
