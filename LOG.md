# Splice It — Change Log

## Turn 5 — UI polish, EQ answer, and Concat mode

Export confirmed working, so this turn covers the polish items, answers the EQ
question, and delivers **Step 2: Concat mode**.

---

### 1. Sliders and scrollbars

**`src/index.css`** — the whole file was one line (`@import "tailwindcss";`), so
every control was a Windows default.

- **Scrollbars**: slim 10px dark thumbs with rounded caps, transparent tracks,
  and a hover state. Applied through both `scrollbar-color` (Firefox) and
  `::-webkit-scrollbar` (Chromium/WebView2).
- **Sliders**: thin 4px dark track with a small accent thumb. The filled portion
  uses the box-shadow trick — the thumb casts a very wide shadow to its left,
  clipped by `overflow: hidden` on the input — so the track fills with no
  JavaScript and no per-slider state.
- Colour comes from a `--si-accent` custom property, set per instance with a
  Tailwind arbitrary property: `class="si-slider [--si-accent:#10b981]"`. All 16
  range inputs across TrackHeader, RightSidebar, MasteringRack, and ClipInspector
  were converted. The two `accent-*` checkboxes in ExportModal were left alone,
  since the native checkbox accent looks fine.
- **Number spinners hidden.** They were the control that walked the year field
  negative last turn, and they look out of place in a dark UI.

### 2. The white overscroll flash

`html`, `body`, and `#root` now have a `slate-950` background and
`overscroll-behavior: none`, with `overscroll-behavior: contain` on everything
else. The white was the unpainted document showing through when a scroll
container was pulled past its end, and the `contain` rule also stops an inner
panel from chaining its scroll to the page behind it. `color-scheme: dark` tells
the browser to render native widgets and the overscroll area dark too.

### 3. Are the EQ controls useless?

**No — but you were right that something was off, and it was worse than subtle.**
Two real reasons you saw no effect:

1. **Until last turn there were no EQ controls at all.** If you were on the build
   from the screenshot, the five `eq_*` settings had no inputs. Nothing you
   touched in that panel was EQ — the visible sliders are stereo width, limiter
   ceiling, LUFS target, and compressor.
2. **The defaults are almost inaudible by design.** A −2.5 dB shelf starting at
   12 kHz only touches the top octave, and a −3 dB bell at 300 Hz with Q 1.5 is a
   gentle cleanup, not an effect. Both are mastering-style corrections you'd
   struggle to hear without an A/B.

Changes this turn to make the effect obvious:

- **Wider, more useful ranges.** The shelf sweeps from 2 kHz to 20 kHz rather
  than sitting near the top of the spectrum, and both bands go from −12 dB to
  +6 dB. Pull the bell to −12 dB at 300 Hz and the difference is unmistakable.
- **Monitor A/B bypass** (`Chain Active` / `Chain BYPASSED` button at the top of
  the mastering rack). It reroutes track output around the EQ and compressor so
  you can hear the chain engage and disengage while playing. Monitoring only —
  the export always applies the chain. This is the fastest way to answer "is
  this doing anything".
- **The curve is now truthful** (from last turn): it is computed from the same
  RBJ biquad coefficients the Rust exporter uses, so what you see is what gets
  rendered.

One thing worth knowing: with **Match LUFS** ticked at export, a broad gain
change gets partly compensated by the loudness match, which can mask an EQ move.
The tonal shape still changes; the overall level does not.

### 4. Project name and logo

- **Saving now renames the project.** `handleSaveProject` picked a path and wrote
  the file but never fed the chosen filename back into state, so the header kept
  saying "Untitled Project" forever. It now sets the name from the saved
  filename, and opening a project does the same.
- **The name is editable.** Click it in the header to rename; Enter commits,
  Escape cancels.
- **Unsaved indicator.** A small amber dot shows next to the name until the
  project has been saved to a path. Hovering shows the full path.
- **Logo added** next to the title, loaded from `public/assets/logo.png`, with a
  fallback to the old "SI" lettermark if the file is ever missing.

---

## Step 2 — Concat mode

A second workspace dedicated to ordering and joining files. **The timeline
editor is untouched**: the two modes hold entirely separate state, and switching
between them stops playback but changes nothing else.

### `src/components/ConcatWorkspace.tsx` (NEW)

- **Ordered list** with drag-to-reorder, plus up/down buttons for precision.
- **Sort by name** is numerically aware, so `track2` sorts before `track10`
  rather than after it. **Reverse** flips the whole list.
- Per item: duplicate, remove, and a gain slider.
- **Junction control between every pair**: a gap (silence) or a crossfade
  (overlap). The two are mutually exclusive at a junction, and the UI enforces
  that. Bulk dropdowns apply one value to every junction at once.
- **Running timings**: each row shows its start offset in the output, and the
  header shows the total length, updating live as you reorder or change a
  junction. Crossfades correctly shorten the total.
- **Preview playback** of the whole joined sequence, with a scrub bar marked
  with item boundaries.
- **Tag editor drawer** reusing the existing `MetadataEditor`.
- Sample rate selector (44.1 / 48 / 96 kHz).

### `src-tauri/src/commands.rs` — `export_concat`

A dedicated command, not the timeline exporter. No tracks, no panning, and the
mastering chain is **opt-in**:

> With unity gain, no crossfade, and the chain off, the output is the input
> audio placed back to back. Joining files should not silently re-master them.

- Decodes each distinct source once, conformed to the output rate.
- Lays out the sequence exactly as the UI shows it, clamping any crossfade to
  the length of both neighbours so it can never overrun a short file.
- Equal-power (sine/cosine) crossfades, so the overlap holds a constant
  perceived level instead of dipping.
- With the chain off, it only intervenes if summing crossfades or gain actually
  pushed the result past full scale, and then it reports the reduction in the
  result message. An untouched join stays sample-accurate.
- Embeds the tags and returns duration, peak, and LUFS like the timeline export.

### Supporting changes

- **`ExportModal` is now shared.** It took a `ProjectState` and called
  `exportProject` directly; it now takes a count, a noun, metadata, and an
  `onExport` callback, so both modes use one modal with no duplication.
- **`audioEngine.playSequence`** schedules an ordered list back to back, routing
  through the master chain or straight to the output depending on the mode's
  own setting, so the preview matches the export.
- **Mode switcher** in the top navbar. The timeline transport hides in concat
  mode, since concat has its own.
- Files imported while concat mode is open are appended to the list
  automatically, and anything already in the audio pool can be added from a
  "From Pool" picker without re-importing.

---

### To apply this update

1. Copy these files over your working tree, preserving paths.
2. `npx tsc --noEmit` and `cd src-tauri && cargo check`.
3. Re-run the **Build Windows Installers** workflow.

Verified: `tsc --noEmit` passes and `vite build` succeeds. The Rust adds one
command and two structs and shares the WAV writer that the timeline exporter
already used, so please send me any `cargo check` output.

---

### Worth testing

- Join two files with **no gap, no crossfade, chain off**. The result should be
  the two files back to back with no level change at all.
- Then set a 1s crossfade and confirm the total length drops by 1s.
- In the timeline mastering rack, toggle the new **A/B** button while playing to
  hear the EQ and compressor engage.

### Still open

- Concat items cannot yet be previewed individually from the list (use the
  audio pool's audition, or the sequence preview).
- Concat state is held in memory and is not yet written into the `.sic` project
  file.
- Peak envelopes remain a fixed 1200 buckets per source.
- Linear-interpolation resampling.

---

## Planned next

### Step 3 — Additional export formats
FLAC and MP3 encoding, plus format selection in both modes.

### Step 4 — Concat polish
Persist the concat list into `.sic`, per-item preview, and optional
loudness-matching across items so a joined compilation sits at an even level.
