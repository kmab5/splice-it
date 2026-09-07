# Splice It — Change Log

## Turn 11 — v0.2.11 — Concat seeking, concat undo, VBR/FLAC options, releases

Versions bumped to **0.2.11** across `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`.

---

### 1. The concat timeline is now seekable

The sequence strip did have a click-to-seek handler, but every file block drawn
on top of it called `stopPropagation` to handle selection — and the blocks cover
almost the whole strip. So clicks only reached the seek handler in the gaps
between files, which is why it felt dead.

Fixed properly:

- **Click or drag anywhere** on the strip to scrub, blocks included.
- **Double-click** a block to select that file, which is what the block click
  used to do.
- **Seeking during playback keeps playing.** It used to stop the transport and
  clear the play state, so you could not scrub while listening. It now restarts
  the sequence from the new position.
- Arrow-key seeking already worked in concat mode from last turn, and now lines
  up with the strip: `←`/`→` 5s, `Ctrl` 15s, `Alt` 30s.

### 2. Undo and redo for concat

History held only `ProjectState`, so nothing done in concat mode was visible to
undo. An entry is now a snapshot of **both** workspaces, so undo works across a
mode switch and cannot leave the two out of step with each other.

Two details worth noting:

- Concat edits stream in continuously while a slider is dragged. Pushing on each
  one would bury the stack in near-identical entries, so rapid successive
  changes fold into the first one (600 ms window).
- Undo stops both transports before restoring, since the restored state may not
  contain whatever was playing.

The depth also went from 25 entries to 50.

### 3. VBR MP3 and FLAC compression

Both are real knobs, checked against the crate sources rather than assumed.

**MP3** now offers CBR or VBR. VBR uses LAME's MTRH mode with a V0-V9 quality
slider, and writes the Xing/LAME header — without which players report the wrong
duration and cannot seek accurately in a VBR file. The UI notes that V2 is the
usual near-transparent choice.

**FLAC** gets Fast / Balanced / Maximum. `flacenc` does not expose libFLAC's 0-8
preset scale, so rather than fake a slider these map onto settings it does have:

- **Fast** — fixed LPC only (`use_lpc = false`), which is where most of the
  encoding time goes. Larger files.
- **Balanced** — the crate defaults.
- **Maximum** — LPC order 24 and coefficient precision 15, both the maximum the
  encoder verifies.

Lossless either way; this only trades encoding time against size. The export
result message reports what was used, e.g. "FLAC 24-bit (maximum)" or
"MP3 VBR V2".

### 4. Tagged releases (moved up from step 9)

The workflow now publishes a GitHub Release when you push a `v*` tag, with all
three files attached and named by version:

- `SpliceIt_<version>_x64-setup.exe` — NSIS installer
- `SpliceIt_<version>_x64.msi` — MSI, for Group Policy or Intune
- `SpliceIt_<version>_portable.exe` — standalone, no installer

A manual **Run workflow** still just produces artifacts without creating a
release. Release notes are generated automatically and include a download table
and the SmartScreen note.

```bash
git tag v0.2.11
git push --tags
```

---

### On "per-clip gain automation"

Fair question — it was jargon. Right now a clip has one fixed gain plus a fade
in and a fade out. Automation would let you draw a **volume curve across the
clip**: click to add points on a line over the waveform and drag them, so the
level can dip under a voiceover halfway through, swell for a chorus, and so on,
rather than being one value for the whole clip.

It is a timeline feature and a fairly large one — it needs an editable envelope
in the canvas, in the playback engine, and in the Rust exporter. **It is not
something concat mode needs**, and if your main use is joining files you can
happily skip it. I have parked it as optional rather than planned; say the word
if you want it.

---

### Code signing, in short

The full write-up with copy-pasteable config is now in the README. The summary:

- You need an **OV code signing certificate** from a CA (Sectigo, DigiCert,
  SSL.com), roughly $200-400/year. There is no free route — the point is that
  someone verified your identity.
- **EV certificates** clear SmartScreen immediately. With OV, reputation builds
  over downloads and time, so early users may still see the warning.
- Since June 2023 all new certificates must live on **hardware** — a USB token,
  or a cloud HSM. Cloud HSM is the only workable option for CI, since a GitHub
  runner cannot plug in a USB token.
- Tauri signs during bundling once `certificateThumbprint` is set in
  `tauri.conf.json`, with the certificate imported from repository secrets.
- **Always set `timestampUrl`.** Without a timestamp, every signature stops
  validating the day the certificate expires. With one, they stay valid forever.

### Auto-updates, in short

Also written up fully in the README:

- Tauri's updater is separate from code signing and uses **its own key pair**,
  which you generate yourself for free with `tauri signer generate`.
- Add `tauri-plugin-updater`, put the public key in `tauri.conf.json`, and point
  the endpoint at
  `https://github.com/<user>/splice-it/releases/latest/download/latest.json`.
  That URL always resolves to the newest release, so **no server is needed** —
  which fits the release workflow that now exists.
- Building with the signing key in the environment produces `.sig` files and
  `latest.json` next to the installers; attach them to the release.
- Two gotchas: updates are **full downloads**, not patches. And once code
  signing is in place, updates must use the **same certificate** as the original
  install or Windows treats them as a different application.

---

### Files changed

`README.md`, `.github/workflows/build-windows.yml`, `package.json`,
`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
`src-tauri/src/encoders.rs`, `src-tauri/src/commands.rs`,
`src-tauri/src/models.rs`, `src/App.tsx`,
`src/components/ConcatWorkspace.tsx`, `src/components/ExportModal.tsx`,
`src/types/project.ts`.

`tsc --noEmit` passes and `vite build` succeeds.

**One thing I should own.** While refactoring the undo history I sliced out a
block of state declarations by accident — the edit removed everything between
two markers, and the concat state happened to sit between them. It was caught
immediately by the type-checker, and I restored `App.tsx` from the v0.2.10
package and redid the change with targeted replacements instead. Nothing else
from this turn was affected, since the other work was in different files. Worth
mentioning so you know the file was rebuilt rather than patched in place.

---

### Worth testing

- Drag across the concat strip while it is playing — the playhead should follow
  and audio should continue from the new spot.
- Reorder concat items, change a gap, then Ctrl+Z a few times.
- Export the same material as MP3 CBR 320 and VBR V2 and compare size and
  quality.
- Export FLAC at Fast and at Maximum and compare file size and encode time.
- Push a tag and confirm the release appears with all three files.

---

## Remaining plan

### Optional
- Per-clip gain automation (see above) — only if you want it.
- Code signing, once a certificate is in hand.
- Auto-update feed, which the release workflow now makes straightforward.
