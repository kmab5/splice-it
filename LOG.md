# Splice It — Change Log

## Turn 10 — v0.2.10 — Step 7: Release readiness

Versions bumped to **0.2.10** across `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`.

---

### Seeking (your request)

**The playhead can now go anywhere.** The timeline ended exactly where the last
clip did, so there was nowhere to park the playhead past the content. A 30-second
runway is kept beyond the final clip, and the scroll extent follows it.

**Arrow keys scrub**, in both workspaces:

| Keys | Step |
|---|---|
| `←` / `→` | 5 seconds |
| `Ctrl` + `←` / `→` | 15 seconds |
| `Alt` + `←` / `→` | 30 seconds |

Rewind and fast-forward buttons sit either side of play in the transport. They
respect the same modifiers — Ctrl-click for 15s, Alt-click for 30s — and the
tooltips say so.

### App icons

The bundle was still shipping the default Tauri icon. Regenerated the full set
from `public/assets/logo.png` with `tauri icon`: Windows `.ico`, macOS `.icns`,
every PNG size, and the Store/Square assets the MSI uses. Installer branding and
the taskbar icon now match the app.

### Double-clicking a .sic opens it

`tauri.conf.json` has declared a `.sic` / `.audioproj` file association since the
start, but nothing ever read the path the shell passes in. `main.rs` now captures
it at startup into managed state, and a `take_launch_file` command hands it to
the frontend once.

Startup now resolves a project in priority order:

1. A file passed on the command line (double-clicking a project).
2. The most recent project, when "reopen last" is enabled.

### Quit warning for unsaved changes

The `confirmOnDiscard` setting existed but nothing consumed it. Tauri closes the
native window without consulting the page, so `beforeunload` is not enough — this
hooks `onCloseRequested`, offers to save, and only then destroys the window.
Cancelling the save dialog cancels the quit too, rather than losing the work.

This needed two extra capability permissions (`core:window:allow-close` and
`core:window:allow-destroy`) since the frontend now closes the window itself.

### First-run screen

A welcome screen on first launch explains the two workspaces side by side, with
one line on when each is the right choice, plus the shortcuts worth knowing.
Choosing a workspace switches straight to it. Dismissed permanently once seen.

### README

Added `README.md` covering what the app does, installing from the CI artifacts,
building locally and in CI, the full shortcut table, the project file format,
a map of the source layout, how audio flows through the system, and the known
limitations.

---

### Files changed

`README.md` (new), `package.json`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`,
`src-tauri/src/main.rs`, `src-tauri/src/commands.rs`,
`src-tauri/icons/*` (regenerated), `src/App.tsx`,
`src/components/TopNavbar.tsx`, `src/components/WelcomeModal.tsx` (new),
`src/services/ipc.ts`, `src/types/project.ts`.

`tsc --noEmit` passes and `vite build` succeeds.

One thing worth flagging: the quit guard reads `autoSaveRef`, and I had first
placed that effect above the ref's declaration. It would have worked, since the
effect body only runs after the component finishes rendering, but relying on that
is the kind of thing that breaks silently later. Moved it below.

---

### Worth testing

- Click well past the end of your audio in the timeline and confirm the playhead
  parks there.
- Hold Ctrl and Alt while pressing the arrow keys and check the step sizes.
- Save a project, close the app, and double-click the `.sic` in Explorer.
- Make an edit and close the window — you should be offered a save, and
  cancelling that dialog should cancel the quit.
- Check the installer and taskbar icons are the logo rather than the Tauri
  default.

---

## Remaining plan

### Step 8 — Optional extras
- Undo/redo for concat mode, which currently only covers the timeline.
- Batch export: render each concat item separately as well as joined.
- VBR MP3, and a FLAC compression knob if `flacenc` exposes a usable one.
- Per-clip gain automation in the timeline.

### Step 9 — Distribution
- Code signing, so Windows SmartScreen stops warning on first run.
- An auto-update feed via the Tauri updater.
- Tagged releases that attach the installers automatically, rather than leaving
  them as workflow artifacts.
