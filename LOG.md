# Splice It — Change Log

## Turn 7 — v0.2.7 — Step 4: Timeline rendering at scale

Versions bumped to **0.2.7** in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`.

---

### The sad face is gone, properly

The timeline canvas used to be as wide as the entire project. At 400 px/s a
ten-minute file asked for a **600,000px** canvas, and on a HiDPI display the
backing store was that again. Browsers refuse anything much past ~16,384px per
side, and a refused canvas renders as the broken-content placeholder.

Both the canvas and the ruler are now **virtualized**: the elements are only as
wide as the visible window, pinned in place with `position: sticky`, and the
drawing is translated by the scroll offset. Every coordinate in the drawing code
is still in absolute timeline pixels, so the logic did not have to change — only
where the origin sits.

```
10 min project @400 px/s, dpr 2:
  before : 600,000 px   -> refused by the browser
  after  :   2,400 px   -> viewport only
```

**The zoom ceiling from last turn is removed**, along with the amber notice.
The maximum is now 400 px/s at any project length, limited by usefulness rather
than by the renderer.

Details that came with it:

- Grid lines, clips, and waveforms outside the window are skipped entirely, so
  drawing cost tracks the size of the window rather than the length of the
  project. Scrolling a three-hour timeline costs the same as a three-second one.
- Scroll events are coalesced to one state update per animation frame.
- Drawing moved to `useLayoutEffect` so the repaint lands in the same frame as
  the scroll position, instead of trailing it by one.
- Pointer coordinates add the scroll offset before hit-testing, so clip
  selection, trimming, and the context menu still work at any scroll position.
- The ruler gained finer tick steps (down to 0.1s) with sub-second labels, since
  it is now possible to zoom in far enough to need them.

### Waveform detail follows zoom

Envelopes were a fixed 1200 buckets per source, so a ten-minute file got the
same detail as a ten-second one and turned into mush when zoomed in.

`analyze_audio_file` now takes `samples_per_peak` instead of a bucket count, so
resolution is fixed **per unit of time**:

```
     10s ->    1,722 buckets, 172 per second
    600s ->  103,359 buckets, 172 per second
  10800s ->  400,235 buckets,  37 per second  (capped)
```

A hard cap of 400,000 buckets keeps a very long file from allocating without
limit; a three-hour file degrades gracefully to 37 per second.

The renderer draws one column every 1.5px across the visible part of each clip,
taking the loudest peak in the slice of source that column covers. Detail now
improves as you zoom instead of being frozen at import time. When one column
covers a large span, the scan is strided to a bounded number of samples so the
frame cost stays flat.

**Project files did not grow.** Envelopes are derived data and are now large, so
they are stripped when writing a `.sic` and rebuilt from the audio on load —
`hydrateSources` re-analyses any source that comes back without one.

### Gain reduction metering

The compressor and limiter had controls but no feedback, so there was no way to
tell whether they were doing anything. The mastering rack now has a live **GR**
meter reading actual gain reduction from the engine, full scale at 20 dB, with a
numeric readout. Combined with the A/B bypass button, the dynamics section is
finally legible.

---

### Files changed

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
`src-tauri/src/commands.rs`, `src/App.tsx`,
`src/components/TimelineCanvas.tsx`, `src/components/TimelineRuler.tsx`,
`src/components/MasteringRack.tsx`, `src/components/BottomDock.tsx`,
`src/components/RightSidebar.tsx`, `src/services/audioEngine.ts`,
`src/services/ipc.ts`.

`tsc --noEmit` passes, `vite build` succeeds, and the numbers above were
computed from the shipped formulas. The Rust change is contained to
`analyze_audio_file`, so please send me any `cargo check` output.

---

### Worth testing

- Import a long file (5 minutes or more), place it, and zoom all the way in.
  No sad face, and the waveform should sharpen rather than blur.
- Scroll a long project from end to end and check that clip selection, trimming,
  and the playhead all land where you click.
- Save a project with several long sources, then reopen it — the `.sic` should
  be small, and waveforms should reappear a moment after loading.
- Play something with the compressor threshold pulled down and watch the GR
  meter move.

---

## Remaining plan

### Step 5 — Export formats
- FLAC encoding, MP3 via `mp3lame-encoder`, and format selection in both modes.
- Per-format bitrate and compression-level options.
- Format-aware file extension in the save dialog.

### Step 6 — Audio quality and polish
- **Windowed-sinc resampling** (open item) to replace linear interpolation for
  large sample-rate conversions.
- Per-item preview from the concat list.
- Optional loudness matching across concat items, so a joined compilation sits
  at an even level.
- Recent-projects list and reopening the last project on launch.
- Waveform analysis moved off the import path so a large batch import does not
  block the UI.
