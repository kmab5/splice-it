# Splice It

A Windows audio editor for joining files together and getting the tags right.

Two workspaces share one project file:

- **Concat** — drop in files, drag them into order, export one joined file. Gaps
  or crossfades between tracks, optional loudness matching, full tag editing.
  With the mastering chain off, files are joined exactly as they are.
- **Timeline** — multitrack editing when you need overlap or per-clip control:
  clips on tracks, trimming, splitting, fades, volume and pan, plus a mastering
  chain with EQ, compression and a true-peak limiter.

Built with Tauri 2, React 19 and TypeScript on the front, Rust on the back.
All decoding, mixing and encoding happens in Rust.

---

## Features

**Import** — WAV, MP3, FLAC, OGG, AAC, AIFF. Native file picker, or drag and drop
anywhere in the window. Files appear immediately while waveforms are built in the
background.

**Export** — WAV (16-bit, 24-bit, 32-bit float), FLAC (16 or 24-bit), and MP3
(128–320 kbps). TPDF dithering where it applies, optional loudness matching to a
LUFS target.

**Metadata** — title, artist, album, year, track and disc numbers, genre,
comment, composer, ISRC, BPM, key, lyrics, copyright, publisher, encoder, and
embedded cover art. Written into every export format: Vorbis comments for FLAC,
ID3v2 for MP3 and WAV. Tags are also read from imported files.

**Audio quality** — band-limited windowed-sinc resampling, equal-power panning
and crossfades, ITU-R BS.1770 K-weighted loudness measurement.

---

## Installing

Grab an installer from the **Actions** tab: open the latest **Build Windows
Installers** run and download `splice-it-msi` or `splice-it-setup-exe`. A
portable `.exe` is also published if you would rather not install.

Nothing else is needed on the target machine. Windows 11 and current Windows 10
already include the WebView2 runtime.

---

## Building

### Windows installers (no local toolchain)

Builds run on a GitHub Actions Windows runner, so you do not need Rust or Visual
Studio locally:

1. Push to the repository.
2. **Actions** → **Build Windows Installers** → **Run workflow**.
   It also runs automatically on any `v*` tag.
3. Download the artifacts from the run summary.

The first run compiles roughly 500 crates and takes 10–15 minutes. Later runs
are usually 2–4 minutes thanks to the Rust cache.

### Locally

```bash
npm install

npm run dev          # frontend only, in a browser
npm run lint         # type-check
npm run tauri:dev    # full desktop app (needs a display)
npm run tauri:build  # installer for the current platform
```

Running the full desktop app needs the Tauri platform dependencies. On Windows
that is Rust with the MSVC toolchain plus the Visual Studio C++ Build Tools. On
Debian or Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev \
  build-essential curl wget file pkg-config
```

In a headless container such as Codespaces, `npm run dev` and
`cd src-tauri && cargo check` both work; only `tauri dev` needs a display.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Space` | Play / pause the workspace you are looking at |
| `←` / `→` | Scrub 5 seconds |
| `Ctrl` + `←` / `→` | Scrub 15 seconds |
| `Alt` + `←` / `→` | Scrub 30 seconds |
| `Home` / `End` | Jump to start / end |
| `Ctrl+S` | Save (writes straight to the current file) |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+O` | Open a project |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `S` | Split the selected clip at the playhead |
| `Delete` | Delete the selected clip |

Right-click for a context menu in either workspace.

---

## Projects

Projects save as `.sic`, a JSON document holding both workspaces, the audio pool,
mastering settings and metadata. Waveform envelopes are left out and rebuilt from
the audio on load, which keeps project files small.

`.sic` files are associated with the app by the installer, so double-clicking one
opens it.

Auto-save is on by default at five minutes, configurable in Settings. It only
ever overwrites a file you have already chosen — it will not invent a filename or
interrupt you with a dialog, so it stays dormant until the first manual save.

---

## Project layout

```
src/
  App.tsx                 Application state and workspace switching
  components/             UI: timeline, concat list, mastering rack, modals
  services/
    ipc.ts                Typed bridge to the Rust commands
    audioEngine.ts        Web Audio playback and preview
    dspMath.ts            Filter maths shared with the Rust chain
    wavExporter.ts        Browser-only fallback renderer
  types/project.ts        Shared types, mirroring the Rust structs

src-tauri/src/
  main.rs                 Entry point, command registration
  commands.rs             Decode, mix, resample, export, tag
  dsp.rs                  Mastering chain: EQ, compressor, limiter, LUFS
  encoders.rs             FLAC and MP3 output
  models.rs               Serde structs shared with the frontend
```

### How audio flows

Sources are decoded once with Symphonia and cached by absolute path, so several
clips on one file share a single decode. The mixdown sums clips into a stereo
bus, runs the master chain if enabled, then hands the buffer to the encoder for
the chosen format. Metadata is embedded afterwards with `lofty`.

The timeline canvas is virtualized: only the visible window is rasterized and the
drawing is translated by the scroll offset, so zoom and project length do not
affect rendering cost.

Concat export is deliberately a separate path with no tracks, no panning and the
mastering chain off by default. Joining files should not silently re-master them.

---

## Known limitations

- Encoding runs in Rust, so FLAC and MP3 export need the desktop app. The
  browser build (`npm run dev`) can only produce WAV.
- MP3 supports sample rates up to 48 kHz. A 96 kHz project is refused with an
  explanation rather than a broken file.
- Undo and redo currently cover the timeline only, not the concat list.
