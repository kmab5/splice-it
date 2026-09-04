import { TrackState } from '../types/project';

export const VIBRANT_TRACK_COLORS: string[] = [
  '#10b981', // Emerald Green
  '#06b6d4', // Cyan
  '#38bdf8', // Sky Blue
  '#8b5cf6', // Purple / Violet
  '#ec4899', // Hot Pink
  '#f59e0b', // Amber / Gold
  '#ef4444', // Coral Red
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Electric Lime
  '#f97316', // Bright Orange
  '#d946ef', // Fuchsia / Magenta
  '#0284c7', // Ocean Blue
  '#22c55e', // Neon Green
  '#a855f7', // Vivid Purple
  '#fb7185', // Rose
  '#eab308', // Cyber Yellow
  '#2dd4bf', // Turquoise
];

/**
 * Assigns a random vibrant color to a new track, strictly prioritizing
 * colors not already present among existing tracks.
 */
export function getRandomTrackColor(existingTracks: TrackState[]): string {
  const used = new Set(
    existingTracks.map((t) => (t.color ? t.color.toLowerCase() : ''))
  );

  // Filter for unused colors from the curated vibrant palette
  const unused = VIBRANT_TRACK_COLORS.filter((c) => !used.has(c.toLowerCase()));

  if (unused.length > 0) {
    const randomIndex = Math.floor(Math.random() * unused.length);
    return unused[randomIndex];
  }

  // If all palette colors are in use, pick a random color from the palette
  // that differs from the most recently added track
  const lastTrackColor = existingTracks[existingTracks.length - 1]?.color?.toLowerCase();
  const candidates = VIBRANT_TRACK_COLORS.filter((c) => c.toLowerCase() !== lastTrackColor);
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Fallback: generate a random bright HSL color
  const randomHue = Math.floor(Math.random() * 360);
  return `hsl(${randomHue}, 85%, 55%)`;
}

/**
 * Converts hex color (e.g. #10b981) to rgba string with specified opacity
 */
export function hexToRgba(hex: string, alpha: number): string {
  if (hex.startsWith('hsl')) {
    return hex.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
  }
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(16, 185, 129, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
