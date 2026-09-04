import React, { useRef, useLayoutEffect, useState } from 'react';
import { ClipState } from '../types/project';
import { getPlayheadSnapTime } from '../utils/timelineSnap';

interface TimelineRulerProps {
  totalDurationMs: number;
  currentTimeMs: number;
  zoom: number; // px per second
  bpm: number;
  /** Full logical width of the timeline (the scrollable extent). */
  canvasWidth: number;
  /** Width of the visible window. The canvas element is only ever this wide. */
  viewportWidth: number;
  /** Horizontal scroll offset of the timeline container. */
  scrollLeft: number;
  clips?: ClipState[];
  snapToGrid?: boolean;
  onSeek: (timeMs: number) => void;
}

const RULER_HEIGHT = 32;

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  currentTimeMs,
  zoom,
  bpm,
  viewportWidth,
  scrollLeft,
  clips = [],
  snapToGrid = true,
  onSeek,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const [isSnappedToClip, setIsSnappedToClip] = useState(false);

  // Like the timeline canvas, this only rasterizes the visible window and
  // translates by the scroll offset, so the element never exceeds the size a
  // browser will allocate no matter how long the project or how deep the zoom.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const viewW = Math.max(1, viewportWidth);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(RULER_HEIGHT * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(-scrollLeft, 0);

    const viewStart = scrollLeft;
    const viewEnd = scrollLeft + viewW;
    const height = RULER_HEIGHT;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(viewStart, 0, viewW, height);

    // Tick spacing adapts to zoom so labels never collide.
    let secStep = 1;
    if (zoom <= 10) secStep = 10;
    else if (zoom <= 25) secStep = 5;
    else if (zoom <= 50) secStep = 2;
    else if (zoom <= 90) secStep = 1;
    else if (zoom <= 200) secStep = 0.5;
    else if (zoom <= 600) secStep = 0.25;
    else secStep = 0.1;

    const stepPx = secStep * zoom;
    const firstStep = Math.max(0, Math.floor(viewStart / stepPx) - 1);
    const lastStep = Math.ceil(viewEnd / stepPx) + 1;

    const playheadX = (currentTimeMs / 1000) * zoom;

    ctx.font = '9px monospace';
    ctx.textAlign = 'left';

    for (let i = firstStep; i <= lastStep; i++) {
      const timeSec = i * secStep;
      if (timeSec < 0) continue;
      const x = timeSec * zoom;

      const isNearPlayhead = Math.abs(x - playheadX) < stepPx / 2;

      ctx.strokeStyle = isNearPlayhead ? '#059669' : '#334155';
      ctx.beginPath();
      ctx.moveTo(x, height - 10);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Sub-second precision appears once the zoom warrants it.
      const mins = Math.floor(timeSec / 60);
      const secs = timeSec % 60;
      const label =
        secStep < 1
          ? `${String(mins).padStart(2, '0')}:${secs.toFixed(secStep < 0.25 ? 2 : 1).padStart(secStep < 0.25 ? 5 : 4, '0')}`
          : `${String(mins).padStart(2, '0')}:${String(Math.floor(secs)).padStart(2, '0')}`;

      ctx.fillStyle = isNearPlayhead ? '#34d399' : '#64748b';
      ctx.fillText(label, x + 3, 16);

      if (zoom > 35) {
        const subSteps = zoom > 70 ? 4 : 2;
        ctx.strokeStyle = '#1e293b';
        for (let j = 1; j < subSteps; j++) {
          const subX = x + (j * stepPx) / subSteps;
          ctx.beginPath();
          ctx.moveTo(subX, height - 5);
          ctx.lineTo(subX, height);
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(viewStart, height - 0.5);
    ctx.lineTo(viewEnd, height - 0.5);
    ctx.stroke();

    // Highlight when the playhead sits exactly on a clip boundary.
    let alignedWithClip = isSnappedToClip;
    if (!alignedWithClip) {
      for (const clip of clips) {
        if (
          Math.abs(currentTimeMs - clip.start_time_ms) < 1 ||
          Math.abs(currentTimeMs - (clip.start_time_ms + clip.duration_ms)) < 1
        ) {
          alignedWithClip = true;
          break;
        }
      }
    }

    const indicatorColor = alignedWithClip ? '#f59e0b' : '#10b981';

    ctx.strokeStyle = indicatorColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

    const curTotalSec = currentTimeMs / 1000;
    const curMin = Math.floor(curTotalSec / 60);
    const curSec = Math.floor(curTotalSec % 60);
    const curTenth = Math.floor((curTotalSec % 1) * 10);
    const badgeText = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')}.${curTenth}`;

    const badgeW = alignedWithClip ? 54 : 46;
    const badgeH = 13;
    const badgeX = Math.max(
      viewStart + 2,
      Math.min(viewEnd - badgeW - 2, playheadX - badgeW / 2)
    );

    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, 2, badgeW, badgeH, 2.5);
    ctx.fill();

    ctx.fillStyle = alignedWithClip ? '#451a03' : '#022c22';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(alignedWithClip ? `⇥ ${badgeText}` : badgeText, badgeX + badgeW / 2, 11);

    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.moveTo(playheadX - 4, 15);
    ctx.lineTo(playheadX + 4, 15);
    ctx.lineTo(playheadX, 21);
    ctx.closePath();
    ctx.fill();
  }, [viewportWidth, scrollLeft, zoom, currentTimeMs, isSnappedToClip, clips]);

  const updateSeekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollLeft;
    const rawTimeMs = Math.max(0, (clickX / zoom) * 1000);
    const snapRes = getPlayheadSnapTime(rawTimeMs, clips, zoom, snapToGrid, bpm, 12);
    setIsSnappedToClip(
      snapRes.isSnapped &&
        (snapRes.snapType === 'clip-start' ||
          snapRes.snapType === 'clip-end' ||
          snapRes.snapType === 'origin')
    );
    onSeek(snapRes.snappedTimeMs);
  };

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    updateSeekFromEvent(e);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) updateSeekFromEvent(e);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    setIsSnappedToClip(false);
  };

  return (
    <div
      id="timeline-ruler"
      className="h-8 bg-slate-900/95 select-none cursor-pointer border-b border-slate-800 relative"
      style={{ width: `${Math.max(1, viewportWidth)}px` }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        style={{ width: `${Math.max(1, viewportWidth)}px`, height: `${RULER_HEIGHT}px` }}
        className="block"
      />
    </div>
  );
};
