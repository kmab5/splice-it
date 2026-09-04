import { ClipState } from '../types/project';

export interface SnapResult {
  snappedTimeMs: number;
  isSnapped: boolean;
  snapType: 'clip-start' | 'clip-end' | 'origin' | 'grid' | null;
  snapLabel?: string;
  snapClipId?: string;
}

/**
 * Calculates the magnetically snapped playhead time in milliseconds.
 * Snaps to the exact start or end of any clip if within the snap threshold (e.g. 10-12px).
 * If snapToGrid is enabled and no clip boundary is within threshold, optionally snaps to the beat grid.
 */
export function getPlayheadSnapTime(
  rawTimeMs: number,
  clips: ClipState[],
  zoom: number, // px per second
  snapToGrid: boolean = true,
  bpm: number = 120,
  snapThresholdPx: number = 10
): SnapResult {
  const snapThresholdMs = (snapThresholdPx / zoom) * 1000;
  let closestDiff = Infinity;
  let bestTime = Math.max(0, rawTimeMs);
  let snapType: SnapResult['snapType'] = null;
  let snapLabel: string | undefined = undefined;
  let snapClipId: string | undefined = undefined;

  // 1. Check Origin snap (0 ms)
  const originDiff = Math.abs(rawTimeMs - 0);
  if (originDiff <= snapThresholdMs && originDiff < closestDiff) {
    closestDiff = originDiff;
    bestTime = 0;
    snapType = 'origin';
    snapLabel = 'Timeline Start (0:00)';
  }

  // 2. Check Clip boundaries snap (Start and End of all clips)
  for (const clip of clips) {
    // Check clip start
    const diffStart = Math.abs(rawTimeMs - clip.start_time_ms);
    if (diffStart <= snapThresholdMs && diffStart < closestDiff) {
      closestDiff = diffStart;
      bestTime = clip.start_time_ms;
      snapType = 'clip-start';
      snapLabel = `Snap: ${clip.name} (Start)`;
      snapClipId = clip.id;
    }

    // Check clip end
    const clipEndMs = clip.start_time_ms + clip.duration_ms;
    const diffEnd = Math.abs(rawTimeMs - clipEndMs);
    if (diffEnd <= snapThresholdMs && diffEnd < closestDiff) {
      closestDiff = diffEnd;
      bestTime = clipEndMs;
      snapType = 'clip-end';
      snapLabel = `Snap: ${clip.name} (End)`;
      snapClipId = clip.id;
    }
  }

  // 3. Beat grid snap (fallback if snapToGrid is enabled and no clip boundary was hit)
  if (snapType === null && snapToGrid) {
    const beatSec = 60 / bpm;
    const snapIntervalMs = (beatSec / 2) * 1000; // 8th note
    const gridTimeMs = Math.round(rawTimeMs / snapIntervalMs) * snapIntervalMs;
    const gridDiff = Math.abs(rawTimeMs - gridTimeMs);
    if (gridDiff <= snapThresholdMs) {
      bestTime = Math.max(0, gridTimeMs);
      snapType = 'grid';
      snapLabel = 'Snap: Grid Beat';
    }
  }

  return {
    snappedTimeMs: Math.max(0, bestTime),
    isSnapped: snapType !== null,
    snapType,
    snapLabel,
    snapClipId,
  };
}
