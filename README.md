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

Download from the **Releases** page:

| File | Use it if |
|---|---|
| `SpliceIt_<version>_x64-setup.exe` | You want the usual installer (recommended) |
| `SpliceIt_<version>_x64.msi` | You are deploying via Group Policy or Intune |
| `SpliceIt_<version>_portable.exe` | You would rather not install anything |

Nothing else is needed on the target machine. Windows 11 and current Windows 10
already include the WebView2 runtime.

Builds from a manual workflow run (rather than a tag) appear as artifacts under
the **Actions** tab instead.

### The SmartScreen warning

These builds are not code-signed, so Windows shows "Windows protected your PC"
on first run. Choose **More info** then **Run anyway**. See
[Code signing](#code-signing) for what it would take to remove that.

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

## Releasing

Tag a commit and push it. The Windows workflow builds, then publishes a GitHub
Release with all three files attached:

```bash
npm version patch          # or edit the version by hand
# keep src-tauri/Cargo.toml and src-tauri/tauri.conf.json in step
git commit -am "Release v0.2.11"
git tag v0.2.11
git push && git push --tags
```

A manual **Run workflow** produces the same files as artifacts without creating
a release.

> All three version fields must match: `package.json`, `src-tauri/Cargo.toml`
> and `src-tauri/tauri.conf.json`. The frontend reads its version from
> `package.json` at build time, and the installer reads `tauri.conf.json`.

---

## Code signing

Unsigned executables trigger Windows SmartScreen. Removing that warning needs a
certificate from a certificate authority; there is no free or self-service
route, because the whole point is that someone verified who you are.

**What to buy.** An *OV* (Organisation Validation) code signing certificate runs
roughly $200-400/year from Sectigo, DigiCert or SSL.com, and requires a
registered business. An *EV* (Extended Validation) certificate costs more but
clears SmartScreen immediately; with OV, reputation builds over time and
downloads, so early users may still see the warning. Individual developers can
get OV certificates from some CAs with identity documents instead of a business
registration.

Since June 2023 all new code signing certificates must be stored on hardware —
a USB token, or a cloud HSM such as Azure Key Vault or SSL.com's eSigner. Cloud
HSM is the only practical option for CI, since a GitHub runner cannot use a
physical token.

**Wiring it into the build.** Tauri signs during bundling when the certificate
details are present. Add to `src-tauri/tauri.conf.json`:

```json
"bundle": {
  "windows": {
    "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

Then in the workflow, import the certificate from repository secrets before the
build step:

```yaml
- name: Import code signing certificate
  shell: pwsh
  env:
    CERT_BASE64: ${{ secrets.WINDOWS_CERT_BASE64 }}
    CERT_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
  run: |
    $bytes = [Convert]::FromBase64String($env:CERT_BASE64)
    Set-Content -Path cert.pfx -Value $bytes -AsByteStream
    $pw = ConvertTo-SecureString -String $env:CERT_PASSWORD -AsPlainText -Force
    Import-PfxCertificate -FilePath cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password $pw
    Remove-Item cert.pfx
```

Always set `timestampUrl`. Without a timestamp, signatures stop validating the
day the certificate expires; with one, they stay valid indefinitely.

For a cloud HSM the flow differs — you point Tauri at a signing command instead
of a local thumbprint, using the provider's CLI tool.

---

## Auto-updates

Tauri's updater checks a JSON manifest you host, compares versions, and
downloads a signed update. It is separate from code signing and uses its own
key pair, which you generate yourself at no cost.

**1. Generate the update signing key.**

```bash
npm run tauri signer generate -- -w ~/.tauri/splice-it.key
```

Keep the private key out of the repository. Put it in repository secrets as
`TAURI_SIGNING_PRIVATE_KEY` (plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if you
set one). The public key goes in the config.

**2. Add the updater to the project.**

```bash
npm install @tauri-apps/plugin-updater
cd src-tauri && cargo add tauri-plugin-updater
```

Register it in `main.rs`, add `updater:default` to
`src-tauri/capabilities/default.json`, and configure the endpoint:

```json
"plugins": {
  "updater": {
    "active": true,
    "pubkey": "YOUR_PUBLIC_KEY",
    "endpoints": [
      "https://github.com/<user>/splice-it/releases/latest/download/latest.json"
    ]
  }
}
```

**3. Publish the manifest.** With the signing key present as an environment
variable, `tauri build` produces `.sig` files and a `latest.json` alongside the
installers. Attach `latest.json` to the release — the endpoint above resolves to
whatever the newest release contains, so no server is needed.

**4. Check for updates from the app**, ideally on a Settings button rather than
silently at launch:

```ts
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

const update = await check();
if (update) {
  await update.downloadAndInstall();
  await relaunch();
}
```

Two things worth knowing. The updater installs a full replacement, not a patch,
so each update is a fresh download of the whole app. And updates should be
signed with the same certificate as the original install once code signing is in
place, otherwise Windows treats the update as a different application.

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
