# Splice It — Change Log

## Turn 9 — v0.2.9 — Step 6: Audio quality and polish

Versions bumped to **0.2.9** across `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`.

---

### 1. Windowed-sinc resampling

The oldest item on the list. Sample rate conversion was linear interpolation,
which folds audible aliasing into the output whenever a source rate does not
match the project — a 22.05 kHz sample dropped into a 48 kHz project, or any
48 kHz stem in a 44.1 kHz session.

Replaced with a polyphase windowed-sinc resampler: 32 taps (16 either side),
Blackman window, with the cutoff tied to the rate ratio so the same kernel does
the anti-alias filtering when downsampling. Each kernel is normalized so DC
passes at exactly unity, and source indices are clamped rather than skipped at
the edges so the first and last samples do not dip in level.

Validated numerically before shipping:

```
DC gain across all 4096 phases : min 1.0000000000  max 1.0000000000
48k -> 44.1k, 1 kHz sine       : peak error 3.6e-05  (-89.0 dBFS)
20 kHz tone downsampled to 22.05k: residual -82.1 dBFS
```

That last line is the one that matters: a 20 kHz tone is above Nyquist at
22.05 kHz, and linear interpolation folds it back into the audible band at close
to full level. It is now 82 dB down.

The phase count was tuned rather than guessed. Reconstruction error is dominated
by fractional-position quantization, not by the filter itself:

```
512 phases  -> -72.1 dBFS   (64 KB table)
2048 phases -> -83.5 dBFS  (256 KB table)
4096 phases -> -89.0 dBFS  (512 KB table)   <- chosen
```

The table is built once per resample, so the larger size costs nothing
meaningful.

### 2. Import no longer blocks

Importing decoded every file twice up front — once in Rust for duration and
peaks, once in the browser for playback — before anything appeared on screen. A
batch of long files looked like a freeze.

Import is now two phases. A new `probe_audio_file` command reads duration,
sample rate and channel count straight from the container, which is near
instant, and the file appears in the pool immediately. Decoding for playback and
building the waveform happen afterwards in the background, one file at a time.

Files with an unusual container that does not declare a frame count (a raw MP3
with no Xing header, say) fall back to a full decode, so the duration is always
correct rather than guessed.

The sidebar shows "Building waveforms for N files — you can keep working", and
concat rows show a spinner in place of the preview button until their audio is
ready.

### 3. Per-item preview in concat

Every row in the concat list now has a play button that auditions that file on
its own, separate from the whole-sequence preview. Disabled with a spinner while
the file is still loading.

### 4. Loudness matching across concat items

A new "Match loudness across files" option in the concat output panel. Each file
is measured with the existing ITU-R BS.1770 K-weighted estimator and nudged
toward the **median** of the set — not the loudest, so one hot track cannot drag
everything else up. Correction is capped at 12 dB either way so a deliberately
quiet piece is not blown up beyond recognition, and silent items are skipped
rather than boosted into noise.

It is independent of the mastering chain, so a compilation can be levelled
without being re-EQ'd or compressed. The result message reports what happened,
e.g. "levelled 4 of 6 to -16.2 LUFS".

### 5. Recent projects and reopen on launch

- The last 8 saved or opened projects are remembered, listed in the sidebar
  under the project actions.
- The most recent one reopens on launch, controlled by a new toggle in Settings
  (on by default). A file that has been moved or deleted is quietly dropped from
  the list rather than throwing an error at startup.
- Settings shows the recent count with a Clear button.

---

### Files changed

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
`src-tauri/src/commands.rs`, `src-tauri/src/models.rs`, `src-tauri/src/main.rs`,
`src/App.tsx`, `src/components/ConcatWorkspace.tsx`,
`src/components/RightSidebar.tsx`, `src/components/SettingsModal.tsx`,
`src/services/ipc.ts`, `src/types/project.ts`.

`tsc --noEmit` passes, `vite build` succeeds, and the resampler figures above
were measured from a reference implementation of the shipped algorithm. Both
Rust format strings were checked for argument arity by hand after the loudness
note was threaded through.

---

### Worth testing

- Import a 48 kHz file into a 44.1 kHz project (or vice versa) and export.
  High frequencies should sound clean rather than gritty.
- Import six or seven long files at once. The list should populate right away,
  with waveforms filling in behind it while the app stays responsive.
- Build a concat list from tracks of obviously different volumes, tick
  "Match loudness", and export. Check the result message reports the levelling.
- Save a project, close the app, reopen it — the project should come back.

---

## Remaining plan

### Step 7 — Release readiness
- Replace the placeholder Tauri icon set with real app icons, and add installer
  branding.
- A short first-run screen explaining the two modes.
- Handle the `.sic` file association that `tauri.conf.json` already declares, so
  double-clicking a project opens it.
- Warn on quit with unsaved changes (the setting exists but nothing consumes it
  yet).

### Step 8 — Optional extras
- VBR MP3, and a FLAC compression knob if `flacenc` exposes a usable one.
- Undo/redo coverage for concat mode, which currently only tracks the timeline.
- Batch export: render each concat item separately as well as joined.
