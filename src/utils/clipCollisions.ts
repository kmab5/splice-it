import { ClipState } from '../types/project';

/**
 * Calculates a valid start time for a clip such that it does not overlap
 * any other clip on the specified track.
 *
 * @param proposedStartMs Desired start time in milliseconds
 * @param durationMs Clip duration in milliseconds
 * @param trackIndex Audio track lane index
 * @param clips All existing clips in the project
 * @param excludeClipId Clip ID to ignore (when moving or updating an existing clip)
 * @returns Non-overlapping start time in milliseconds
 */
export function getNonOverlappingStartTime(
  proposedStartMs: number,
  durationMs: number,
  trackIndex: number,
  clips: ClipState[],
  excludeClipId?: string
): number {
  const trackClips = clips
    .filter((c) => c.track_index === trackIndex && c.id !== excludeClipId)
    .sort((a, b) => a.start_time_ms - b.start_time_ms);

  if (trackClips.length === 0) {
    return Math.max(0, proposedStartMs);
  }

  let start = Math.max(0, proposedStartMs);
  let end = start + durationMs;

  // Check if proposed range overlaps with any clip
  const hasCollision = trackClips.some(
    (c) => Math.max(start, c.start_time_ms) < Math.min(end, c.start_time_ms + c.duration_ms)
  );

  if (!hasCollision) {
    return start;
  }

  // If collision exists, find all valid non-overlapping gaps on this track that can fit durationMs
  interface Gap {
    start: number;
    end: number;
  }

  const validGaps: Gap[] = [];

  // Gap 1: from 0 to first clip start
  if (trackClips[0].start_time_ms >= durationMs) {
    validGaps.push({ start: 0, end: trackClips[0].start_time_ms });
  }

  // Internal gaps between consecutive clips
  for (let i = 0; i < trackClips.length - 1; i++) {
    const gapStart = trackClips[i].start_time_ms + trackClips[i].duration_ms;
    const gapEnd = trackClips[i + 1].start_time_ms;
    if (gapEnd - gapStart >= durationMs) {
      validGaps.push({ start: gapStart, end: gapEnd });
    }
  }

  // Gap at the end of the track (infinite length)
  const lastClip = trackClips[trackClips.length - 1];
  const lastEnd = lastClip.start_time_ms + lastClip.duration_ms;
  validGaps.push({ start: lastEnd, end: Infinity });

  // Find the gap whose valid placement range is closest to proposedStartMs
  let bestCandidateStart = lastEnd;
  let minDistance = Infinity;

  for (const gap of validGaps) {
    // Within this gap, the clip can start anywhere in [gap.start, gap.end - durationMs]
    const maxStartInGap = gap.end === Infinity ? Infinity : gap.end - durationMs;
    const clampedInGap = Math.min(maxStartInGap, Math.max(gap.start, proposedStartMs));
    const dist = Math.abs(proposedStartMs - clampedInGap);

    if (dist < minDistance) {
      minDistance = dist;
      bestCandidateStart = clampedInGap;
    }
  }

  return Math.max(0, bestCandidateStart);
}

/**
 * Bounds start time and duration for trimming without overlapping adjacent clips.
 */
export function getNonOverlappingTrimBounds(
  clipId: string,
  trackIndex: number,
  clips: ClipState[]
): { minStartMs: number; maxEndMs: number } {
  const currentClip = clips.find((c) => c.id === clipId);
  if (!currentClip) return { minStartMs: 0, maxEndMs: Infinity };

  const trackClips = clips
    .filter((c) => c.track_index === trackIndex && c.id !== clipId)
    .sort((a, b) => a.start_time_ms - b.start_time_ms);

  let minStartMs = 0;
  let maxEndMs = Infinity;

  for (const c of trackClips) {
    const cEnd = c.start_time_ms + c.duration_ms;
    if (cEnd <= currentClip.start_time_ms) {
      minStartMs = Math.max(minStartMs, cEnd);
    } else if (c.start_time_ms >= currentClip.start_time_ms + currentClip.duration_ms) {
      maxEndMs = Math.min(maxEndMs, c.start_time_ms);
    }
  }

  return { minStartMs, maxEndMs };
}
