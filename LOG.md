# Splice It — Change Log

## Turn 2 — Step 1: Make the audio pipeline real

### Summary

The previous build never touched your audio. The Rust exporter synthesized a
constant tone instead of decoding source files, imported files were discarded
after reading their duration, clips played procedurally generated drums and
basslines, and waveforms were drawn from a sine formula. This turn replaces all
of that with a real decode → mix → render → tag pipeline, and makes the Tauri
desktop build actually buildable.

**Nothing in this turn adds the concat mode.** This is the foundation both the
timeline editor and the upcoming concat mode will share.

---

### Rust backend

#### `src-tauri/src/commands.rs` (rewritten)

- **`export_project` now decodes real audio.** It was previously computing
  `sample_val = 0.4 * fade_factor * clip_gain` — a constant DC value — so every
  export was a click and a hum, never your music. It now:
  - decodes each distinct `source_path` exactly once via Symphonia and caches it,
  - resamples sources whose rate differs from the project rate,
  - reads from `offset_ms` for `duration_ms` frames, stopping at the end of the
    source instead of looping,
  - honours mute **and solo** (solo was ignored before),
  - uses equal-power panning so a centred track keeps unity loudness,
  - returns a clear error when a clip's source file is missing.
- **Fade curve fixed.** The fade-in used `(f / fade_in_frames).sin()`, which is
  the sine of a 0–1 ratio and only ever reaches 0.84. Now scaled by `π/2`.
- **Export formats.** Supports `wav_16`, `wav_24`, and `wav_32f`, chosen by the
  UI. Previously the format buttons were decorative and output was always 24-bit.
- **TPDF dithering** actually implemented (`xorshift_unit` / `tpdf_noise`) and
  applied only when truncating to fixed point.
- **LUFS normalization** is now gated on the checkbox instead of always running.
- **Returns `ExportResult`** with path, duration, measured LUFS, and peak dBFS,
  so the UI can report what it actually produced.
- **New `analyze_audio_file`** — one decode pass returning duration, sample rate,
  channels, size, a normalized peak envelope, and embedded tags. This is what
  import uses.
- **New `read_audio_file_bytes`** — streams raw bytes to the webview as a binary
  response for Web Audio preview playback. Async, so large files don't block
  the UI thread.
- **New `read_text_file` / `write_text_file`** — project (.sic) save/open,
  replacing a browser blob download that doesn't work in a packaged app.
- `load_audio_metadata` and `save_audio_metadata` were already implemented but
  had never been called by any UI code. Both are now reachable, and tag
  read/write logic is shared through `read_tags` / `write_tags`.
- Removed unused imports (`Cursor`, `AudioBufferRef`, `Signal`, `CODEC_TYPE_NULL`).
- Added the `AudioFile` trait import that `save_to_path` requires.
- Symphonia hint now includes the file extension, which greatly improves format
  probing reliability. Scratch buffers are re-allocated if packet size grows
  mid-stream (this could previously panic).

#### `src-tauri/src/dsp.rs`

- `DynamicCompressor::envelope` initialized to `1.0` instead of `0.0`. At `0.0`
  the gain started at silence and ramped up over the release time, so **every
  export faded in from nothing.**

#### `src-tauri/src/models.rs`

- Added `AudioFileInfo`, `ExportResult`, and `DecodedAudio`.
- `ExportOptions` is now actually used by `export_project`.
- Documented that `ClipState.source_path` is an absolute path.

#### `src-tauri/src/main.rs`

- Registered the four new commands.
- Removed `tauri_plugin_shell` and `tauri_plugin_fs` initialization — neither was
  used, and file access now goes through the app's own commands.

#### `src-tauri/capabilities/default.json` (NEW)

- **This file did not exist.** Without it, Tauri v2 denies every plugin command,
  which is why no native dialog could ever have worked. Grants `core:default`
  and `dialog:default` to the `main` window.

#### `src-tauri/Cargo.toml`

- Removed `cpal`, `biquad`, `uuid`, `thiserror`, `tauri-plugin-shell`, and
  `tauri-plugin-fs` — all unused. Cuts compile time noticeably.

---

### Frontend

#### `package.json`

- **Added `@tauri-apps/cli`** and `tauri` / `tauri:dev` / `tauri:build` /
  `tauri:build:windows` scripts. There was previously no way to build the
  desktop app from npm at all.
- Added `@tauri-apps/plugin-dialog` (the Rust plugin was present, the JS half
  was not) and React type packages.
- Removed leftover AI Studio scaffolding that was never imported:
  `@google/genai`, `express`, `dotenv`, `motion`, `@types/express`, `tsx`,
  `esbuild`.
- Renamed the package from `react-example` to `splice-it`.

#### `src/services/ipc.ts` (rewritten)

- Real `invoke` calls for every backend command.
- Native dialogs: `pickAudioFiles`, `pickProjectFile`, `pickSavePath`.
- **Removed the fake fallbacks.** `loadAudioMetadata` used to return a
  hardcoded "Neon Skyline / Aether Wave" tag set, and `generateWaveformPeaks`
  returned a sine curve, whether or not anything had loaded.
- **A failed desktop export now reports failure.** It previously caught the
  error, silently fell through to the browser renderer, and reported success.

#### `src/services/audioEngine.ts` (rewritten)

- Buffers are cached **by source path, not clip id**, so N clips on one file
  share one decode instead of N copies.
- **Deleted `createDemoBuffers`** — ~120 lines that synthesized a drum groove,
  an 808 line, chords, and a pad based on track index. This is what you were
  hearing on playback.
- `registerSource` / `registerSourceFromFile` decode real bytes.
- A clip with no decoded source is now silent rather than replaced with a tone.
- Playback clamps duration to the real buffer length.
- Audition preview plays the actual file (it previously played a decaying sine
  whose frequency was derived from the filename length).

#### `src/services/wavExporter.ts` (browser fallback)

- Looks up buffers by `source_path`; **removed the synthesized-tone fallback**.
- **Removed the `% bufLen` wrap** that made a clip longer than its source loop
  instead of ending.
- Equal-power panning, matching the Rust path.
- Honours solo and the LUFS-normalize option.
- 24-bit samples are now rounded rather than truncated by bitwise coercion.

#### `src/App.tsx`

- **Removed the demo project**: 5 fake pool entries and 6 clips pointing at
  `stems/*.wav` files that never existed. A new project is now genuinely empty
  with four blank track lanes.
- Import now goes through the native picker → `analyze_audio_file` →
  `read_audio_file_bytes` → Web Audio decode. Duplicate paths are skipped, and
  failures are reported per file.
- Tags from the first imported file seed the metadata editor on an untouched
  project.
- `handleInsertFromPool` writes the **real absolute path** into
  `clip.source_path`. It previously wrote just the filename, so even a correct
  exporter would have had nothing to open.
- Save/Open project use native dialogs and the new text-file commands, with the
  browser blob download kept as a fallback.
- `hydrateSources` re-decodes every source when a project is opened, and lists
  any files that have gone missing.
- Deleting a pool item frees its buffer only if no clip still references it.
- **Fixed:** `TimelineRuler` was never given `clips` or `snapToGrid`, so
  snap-to-clip-boundary silently never worked. Both are now passed.
- Added `sourceWaveforms` (memoized peak envelopes keyed by path).

#### `src/components/TimelineCanvas.tsx`

- **Waveforms are now drawn from real peak data.** The previous renderer used
  `Math.sin(seed * 2) * 0.4 + Math.cos(seed * 5) * 0.3` per pixel — the same
  shape for every clip on a given track.
- The envelope is sliced by the clip's trim offset and duration, so trimming and
  splitting reveal the correct region.
- A clip whose source isn't analyzed draws a dashed placeholder line instead of
  a convincing-looking fake waveform.
- Removed the unused `getPlayheadSnapTime` import.

#### `src/components/ExportModal.tsx` (rewritten)

- **Opens a native save dialog.** The old code wrote to `./exports/...`, a
  relative path that on a packaged Windows app resolves inside Program Files and
  fails outright.
- Format, LUFS-normalize, and dither selections are **actually sent** to the
  backend. They were previously collected and thrown away.
- Format list is now the three WAV variants. FLAC and MP3 buttons were removed
  rather than left as no-ops.
- Dither is disabled for 32-bit float, where it has no meaning.
- On success, reports the output path, measured LUFS, and peak dBFS.
- Export is blocked with an explanation when the timeline is empty.

#### `src/components/RightSidebar.tsx`

- Import and Open buttons use the native dialogs when running in the desktop
  shell, falling back to `<input type="file">` in the browser.
- Added an "Analyzing audio..." spinner state during import.

#### `types/project.ts`

- `SourceAudioFile` gains a required `path`; dropped the unused `data_url`.
- Added `AudioFileInfo` and `ExportResult` to mirror the Rust structs.
- `ExportFormat` narrowed to the three supported WAV variants.
- Removed the unused `peaks` field from `ClipState`.

---

### To apply this update

1. Copy these files over your working tree, preserving paths.
2. Delete `bun.lock` and `package-lock.json`, then run `npm install`
   (dependencies changed substantially).
3. `npm run tauri:dev` to run, `npm run tauri:build` to produce the Windows
   installer.

Verified this turn: `tsc --noEmit` passes and `vite build` succeeds. The Rust
was reviewed by hand — there is no Rust toolchain in this environment, so
**please run `npm run tauri:dev` and send me any compiler output.** That is the
one thing I could not verify mechanically.

---

### Known gaps carried into the next turn

- Drag-and-drop of OS files onto the pool still uses the browser file API. Tauri
  intercepts native drag-drop, so it needs the Tauri drag-drop event to work in
  the desktop build. Click-to-import works today.
- `TrackColorPicker.tsx` is still fully written and imported by nothing; tracks
  get a random colour with no way to change it.
- Right-clicking the track-header column produces a menu with no `trackIndex`,
  so Delete Track from that specific menu does nothing.
- `src/types/project.ts` is still a one-line re-export of the root
  `types/project.ts`. Harmless, but two paths to one definition.
- Resampling is linear interpolation. Fine for matching stems; a windowed-sinc
  stage would be better for large rate conversions.

---

## Planned next

### Step 1b — small cleanups (quick, low risk)
- Wire up `TrackColorPicker` from the track header colour swatch.
- Fix the track-header context menu target.
- Native drag-and-drop support for the audio pool.

### Step 2 — Concat mode (the main goal)
A separate page/mode dedicated to ordering and joining files, built on the
engine fixed in this turn and leaving the timeline editor untouched:
- A mode switcher (Timeline / Concat) at the app level.
- Its own flat state: an ordered list of source files, not clips on tracks.
- Drag-to-reorder list with per-item duration, running total, and audition.
- Optional gap or crossfade between adjacent items.
- A dedicated `concat_export` Rust command that decodes in order and writes one
  continuous file — no timeline, no mastering chain unless asked for.
- Shared metadata editor and the same WAV export options.

### Step 3 — Additional export formats
FLAC and MP3 encoding, plus format selection in both modes.
