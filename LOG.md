# Splice It — Change Log

## Turn 3 — Warnings, Windows CI, and Step 1b

`cargo check` passed on the Step 1 backend, so the export engine, decoder, and
new commands all compile. This turn clears the two warnings, sets up Windows
builds that run without any local toolchain, and closes the gaps carried over
from last turn.

---

### 1. Compiler warnings (both fixed)

- **`src-tauri/src/commands.rs`** — dropped the unused `TagExt` import.
  `save_to_path` on a `TaggedFile` comes from `AudioFile`, which is already
  imported; `TagExt` only matters when saving a bare `Tag`.
- **`src-tauri/src/dsp.rs`** — removed `BiquadFilter::reset()`. Nothing calls it,
  and nothing should: `MasterDspChain::new` builds fresh filters for every
  render, and resetting filter state mid-stream would produce a click.

`cargo check` should now be silent.

---

### 2. Windows builds from Codespaces

#### `.github/workflows/build-windows.yml` (NEW)

Cross-compiling Tauri from Linux to Windows is not practical — the MSI and NSIS
bundlers need Windows tooling — so the build runs on a `windows-latest` GitHub
Actions runner instead. You stay in the container; GitHub does the Windows work.

**How to use it**

1. Commit and push this workflow.
2. GitHub → **Actions** → **Build Windows Installers** → **Run workflow**.
   (It also runs automatically on any `v*` tag push.)
3. When it finishes, download the artifacts from the run summary:
   - `splice-it-msi` — the `.msi` installer
   - `splice-it-setup-exe` — the NSIS `.exe` installer
   - `splice-it-portable-exe` — the bare `.exe`, no installer
4. Copy to your Windows machine and run. No Rust, Node, or build tools needed
   there — only the WebView2 runtime, which ships with Windows 11 and current
   Windows 10.

The first run compiles roughly 500 crates and takes about 10–15 minutes. The
`swatinem/rust-cache` step makes later runs typically 2–4 minutes.

The workflow runs `npm run lint` (type-check) before building, so a TypeScript
error fails the run before spending time on Rust.

**Note:** the workflow uses `npm install`. Once you commit a `package-lock.json`,
switching that step to `npm ci` will be faster and more reproducible.

**What you can still do in the container:** `npm run dev` gives you the full UI
in a browser, where the browser-fallback paths exercise import, playback, and
WAV export end to end. `cd src-tauri && cargo check` verifies the backend. Only
`tauri dev` needs a display server, which Codespaces lacks.

---

### 3. Step 1b

#### Track colour picker — now reachable

`TrackColorPicker.tsx` was 208 lines of finished component that nothing
imported. It is now wired up three ways:

- **`TrackHeader.tsx`** — the colour swatch is a button that opens the picker,
  anchored to itself. It was previously a non-interactive `div`.
- **Collapsed track headers** — double-click the colour pillar.
- **Context menu** — a new **Change Colour** item, showing the current colour.

`App.tsx` records undo history once when the picker opens, rather than on every
colour tweak, so dragging through the native colour wheel doesn't flood the
undo stack.

Two bugs fixed inside the picker itself while wiring it:

- The hex input handler spread a React synthetic event to fake a modified value
  (`handleHexChange({ ...e, target: { ...e.target, value: ... } })`). Replaced
  with a plain string handler that strips non-hex characters and commits only on
  a valid 3- or 6-digit value.
- The hidden `<input type="color">` had `pointer-events-none`, which can stop
  `.click()` from opening the OS colour dialog. Now off-screen but clickable.

#### Track header context menu — fixed

Right-clicking the track headers column set `target: { type: 'track' }` with **no
`trackIndex`**, so `selectedTrack` resolved to null and Delete Track silently did
nothing. Each `TrackHeader` now handles its own `contextMenu` event, calls
`stopPropagation`, and reports its index. The column-level handler now only fires
for the empty space below the list, and reports `type: 'canvas'` so it offers
just Add Track / Paste Track.

#### Native drag-and-drop — implemented

Tauri intercepts OS file drops before the webview sees them, so the sidebar's
HTML drag events never fired in the desktop build. `App.tsx` now listens to
Tauri's own `onDragDropEvent`:

- Dropping audio files anywhere in the window imports them into the pool.
- Dropping a single `.sic` file opens it as a project.
- Dropping non-audio files gives an explanation instead of failing silently.
- A full-window overlay appears while dragging.
- The event name is normalized so it works on both Tauri 2.0 (`dragEnter`,
  `dragOver`, `dragLeave`) and 2.1+ (`enter`, `over`, `leave`).

The browser HTML drag-drop path in the sidebar is untouched and still works in
`npm run dev`.

#### Duplicate type module — collapsed

`src/types/project.ts` was a one-line re-export of the root `types/project.ts`.
The real definitions now live in `src/types/project.ts`, and the root file is
**deleted**. The `@/*` alias in `tsconfig.json` and `vite.config.ts` now points at
`./src` rather than the repo root, which is what it was there for.

> **Action required when applying this zip:** delete `types/project.ts` and the
> now-empty `types/` folder from your working tree. A zip can add and replace
> files but cannot delete them.

#### Playhead snap HUD — activated

`TimelineCanvas` drew a snap badge from `playheadSnapInfo`, but nothing ever set
that state, so it was dead code. Dragging the playhead body now runs the same
`getPlayheadSnapTime` the ruler uses, so it snaps to clip starts, clip ends, and
the timeline origin, and the badge shows what it snapped to. Cleared on mouse up.

---

### Still open

- **Resampling is linear interpolation.** Fine for matching stems at nearby
  rates; a windowed-sinc stage would be better for large conversions such as
  22.05 kHz to 48 kHz. Worth revisiting only if you hit it in practice.
- **No waveform for very long files at high zoom.** The peak envelope is a fixed
  1200 buckets per source, so zooming far into a 10-minute file shows a coarse
  shape. A zoom-aware re-analysis would fix it; not urgent.
- **`package-lock.json` is not committed.** Doing so lets CI use `npm ci`.

---

### To apply this update

1. Copy these files over your working tree, preserving paths.
2. **Delete `types/project.ts`** and the empty `types/` folder.
3. `npm install` (no dependency changes this turn, but the tree moved).
4. `npx tsc --noEmit` and `cd src-tauri && cargo check` to confirm both sides.
5. Commit and push, then run the **Build Windows Installers** workflow.

Verified this turn: `tsc --noEmit` passes and `vite build` succeeds. The Rust
changes are deletions only (one import, one unused method), so they carry no
compile risk beyond what you already verified.

---

## Planned next

### Step 2 — Concat mode (the main goal)

A dedicated mode for ordering and joining files, built on the engine fixed in
Step 1 and leaving the timeline editor completely untouched:

- A mode switcher (**Timeline** / **Concat**) in the top navbar, with each mode
  holding its own state so switching never disturbs the other.
- Flat state: an ordered list of source files, not clips on tracks.
- Drag-to-reorder list showing per-item duration, running start offset, and
  total output length, with audition per item.
- Optional gap or crossfade between adjacent items.
- A dedicated `concat_export` Rust command that decodes in order and writes one
  continuous file, with the mastering chain off by default (joining files should
  not silently re-master them).
- Shared metadata editor and the same WAV export options.

### Step 3 — Additional export formats

FLAC via the `flac-bound` or `claxon` crate, MP3 via `mp3lame-encoder`, plus
format selection in both modes.
