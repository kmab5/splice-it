# Splice It — Change Log

## Turn 6 — v0.2.6 — Step 3: Workspace correctness, persistence and concat depth

### Versioning

From now on every edit bumps the version in all three places at once, keyed to
the turn number as you set it:

| File | Field |
|---|---|
| `package.json` | `version` |
| `src-tauri/Cargo.toml` | `[package] version` |
| `src-tauri/tauri.conf.json` | `version` |

All three are now **0.2.6**. To stop them drifting apart, `vite.config.ts` reads
`package.json` at build time and injects `__APP_VERSION__`, which
`src/version.ts` re-exports as `APP_VERSION`. The navbar shows the real version
instead of the hardcoded "v2.0", and saved `.sic` files record the app version
that wrote them for future migrations.

---

### Why the sad face appears when zooming into long files

That is Chromium's broken-content placeholder for a `<canvas>` it **refused to
allocate**. The timeline canvas is currently as wide as the entire project:

```
timelineWidth = (durationMs / 1000) * zoom * 1.25
```

A 10-minute file at 250 px/s asks for a 187,500px canvas — and on a HiDPI
display the backing store is that again multiplied by the device pixel ratio.
Chromium caps a canvas at roughly 16,384px per side on many GPUs and refuses
anything larger, so the element renders as the sad face with the page grid
showing through.

**Yes, it is fixable, and properly.** The real fix is to stop drawing the whole
project and draw only the visible window, translating by the scroll offset. That
removes the ceiling entirely and also makes scrolling cheaper on long projects.
It touches the canvas, the ruler, and the scroll container together, so it is
**Step 4** rather than being rushed in alongside this batch.

For now the app no longer breaks: zoom is clamped to whatever keeps the canvas
inside a safe budget, and when you hit that ceiling a small amber notice
explains why rather than leaving you with a broken graphic. On a long project
the ceiling is genuinely restrictive, which is exactly why Step 4 is next.

---

### Step 3 — what shipped

**Space is scoped to the visible workspace.** It always called the timeline
transport, so pressing it in concat mode started timeline playback. It now
drives whichever view is on screen, and the timeline-only keys (S to split,
Delete, Home, End) no longer fire at all in concat mode.

**Ctrl+S saves as a project.** Ctrl+Shift+S is Save As, Ctrl+O opens.

**Saving no longer re-prompts for a location.** Once a project has a path — from
a save or an open — Ctrl+S writes straight to that file. The dialog now only
appears for a project that has never been saved, or for an explicit Save As.

**Auto-save**, configurable in the new Settings dialog (gear icon in the navbar):
on/off and an interval from 1 to 30 minutes, default 5. It only ever overwrites
a file you already chose — it will not invent a filename or pop a dialog while
you are working, so it stays dormant until the first manual save. Settings
persist locally, and the dialog shows the target path and last auto-save time.

Unsaved changes are tracked by comparing against a snapshot of what was last
written, rather than a "something changed" flag. That matters because saving
updates the project name, which with a naive flag would immediately re-dirty the
document it had just saved. An amber dot next to the project name marks unsaved
work.

**Concat mode is saved into the `.sic` file** (was on the open list). One
document now carries both workspaces; the Rust exporter ignores the extra field.

**Concat: detailed sequence strip.** The plain progress bar is now a to-scale
map of the output — one block per file, name shown when there is room, hatched
cyan at the tail of any block that crossfades, hatched amber spans where there
are gaps, and a playhead. Clicking a block selects it; clicking the strip scrubs.

**Concat: randomize order.** Fisher-Yates shuffle, in the toolbar and the
context menu.

**Concat: metadata editor as a bottom tab.** The tag drawer is now a proper
resizable, collapsible bottom dock with two tabs — Output Tags (the full editor)
and Selected Item (name, gain, gap, crossfade). The duplicated item controls
were removed from the right sidebar, which now covers output settings only.

**Concat: context menu.** Right-click a row for Move to Top/Bottom, Duplicate,
Add 0.5s Gap, Crossfade 0.5s Into Next, and Remove. Right-click empty space for
Add Files, Randomize, Reverse, and Clear List.

**Metadata is editable in the export dialog.** Title, artist, album, genre, year
and ISRC can be set without leaving the dialog, in both modes. Edits write back
to the project or concat state, so they are not lost when the dialog closes.

---

### Files changed

`package.json`, `vite.config.ts`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json`, `src/version.ts` (new),
`src/services/settings.ts` (new), `src/components/SettingsModal.tsx` (new),
`src/App.tsx`, `src/components/TopNavbar.tsx`,
`src/components/ConcatWorkspace.tsx`, `src/components/ExportModal.tsx`,
`src/types/project.ts`.

No Rust source changed this turn beyond the version bump, so `cargo check`
should still be clean. `tsc --noEmit` passes and `vite build` succeeds.

---

### Worth testing

- Save with Ctrl+S, edit something, Ctrl+S again — the second save should write
  silently with no dialog, and the amber dot should clear.
- Open Settings, set auto-save to 1 minute, make an edit, and wait.
- Press Space in concat mode and confirm the timeline stays silent.
- Add a crossfade and watch the hatched region appear on the sequence strip.

---

## Remaining plan

### Step 4 — Timeline rendering at scale
- **Virtualize the timeline canvas**: draw only the visible window and translate
  by the scroll offset, in the canvas and the ruler together. Removes the zoom
  ceiling and the sad face for good.
- **Zoom-aware peak resolution** (open item): peaks are a fixed 1200 buckets per
  source, so a long file looks coarse when zoomed. Re-analyze at higher
  resolution for the visible range.
- Gain-reduction metering for the compressor and limiter, which currently have
  controls but no feedback.

### Step 5 — Export formats
- FLAC encoding, MP3 via `mp3lame-encoder`, and format selection in both modes.
- Per-format bitrate and compression options.

### Step 6 — Audio quality and polish
- **Windowed-sinc resampling** (open item) to replace linear interpolation for
  large sample-rate conversions.
- Per-item preview from the concat list.
- Optional loudness matching across concat items, so a joined compilation sits
  at an even level.
- Recent-projects list and reopening the last project on launch.
