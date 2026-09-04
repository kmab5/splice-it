# Splice It — Change Log

## Turn 8 — v0.2.8 — Step 5: FLAC and MP3 export

Versions bumped to **0.2.8** in `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`.

---

### New formats

Export now offers five targets in both timeline and concat mode:

| Format | Notes |
|---|---|
| WAV 24-bit | Unchanged default |
| WAV 16-bit | CD standard |
| WAV 32-bit float | Full headroom |
| **FLAC** | Lossless, 16 or 24-bit |
| **MP3** | 128 / 160 / 192 / 256 / 320 kbps CBR |

Both new encoders live in a new `src-tauri/src/encoders.rs`, taking the same
interleaved f32 buffer the mixdown already produces. `write_output_file` in
`commands.rs` dispatches on format, so the timeline and concat exporters both
picked up all five with no duplication.

Tags are embedded in every format — `lofty` writes Vorbis comments into FLAC and
ID3v2 into MP3, so the metadata editor works across the board.

**Crate choices.** FLAC uses `flacenc`, which is pure Rust and needs no C
toolchain. MP3 uses `mp3lame-encoder`, whose `mp3lame-sys` compiles LAME from
vendored C source with the `cc` crate — that builds fine under MSVC on the
Windows runner, but it is the one new dependency with a native build step, so
watch for it if CI fails.

### Verifying the encoder APIs without a compiler

There is still no Rust toolchain here, so rather than writing these two
integrations from memory I downloaded both crates from crates.io and read the
actual sources. That caught three real bugs before they reached you:

1. **Missing trait import.** `Encoder::into_verified()` comes from the
   `flacenc::error::Verify` trait. I had only imported `BitRepr`, so the FLAC
   path would not have compiled.
2. **Unnecessary unsafe in the MP3 path.** I had written the documented
   `spare_capacity_mut()` + `set_len()` dance by hand. The crate provides
   `encode_to_vec` and `flush_to_vec` which do exactly that internally, so the
   whole thing is now safe code.
3. **Missing reservation before flush.** `flush_to_vec` also writes into spare
   capacity, and a final MP3 frame needs up to 7200 bytes. Without reserving
   again after encoding, the flush could have silently written nothing and
   truncated the last frame of every export.

Also confirmed against the sources: `ByteSink` is `MemSink<u8>`,
`Verified<T>` derefs to `T` so `config.block_size` resolves,
`encode_with_fixed_block_size` is re-exported at the crate root,
`set_num_channels` takes a `u8`, `max_required_buffer_size` counts per-channel
samples (not total), and every error type involved implements `Debug`.

### Format-aware UI

- The save dialog filter and default filename follow the chosen format, so
  picking MP3 offers `.mp3` rather than `.wav`.
- MP3 shows a bitrate selector; FLAC shows a bit-depth selector. Neither appears
  for formats where it means nothing.
- Dither is disabled where it does not apply, now including MP3 and 24-bit FLAC,
  with the reason shown inline.
- MP3 is labelled "lossy" in the picker.
- **MP3 rejects unsupported sample rates.** LAME only handles the MPEG rates up
  to 48 kHz, so a 96 kHz project gets a clear message pointing at WAV or FLAC
  instead of a confusing encoder failure.
- The browser fallback returns a plain explanation for FLAC and MP3 rather than
  handing back a `.mp3` file containing WAV bytes, since encoding lives in Rust.
- Export result messages now name the format, e.g. "Exported 184.2s mixdown as
  MP3 192 kbps at 44.1 kHz".

---

### Files changed

`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`,
`src-tauri/src/encoders.rs` (new), `src-tauri/src/main.rs`,
`src-tauri/src/commands.rs`, `src-tauri/src/models.rs`,
`src/components/ExportModal.tsx`, `src/services/ipc.ts`,
`src/types/project.ts`.

`tsc --noEmit` passes and `vite build` succeeds. The two new crates pull in a
fair amount, so the next CI run will be slower than usual and
`mp3lame-sys` is the piece most likely to complain.

---

### Worth testing

- Export the same material as WAV 24-bit and as FLAC, then compare file sizes.
  FLAC should land around half, and both should be bit-identical on decode.
- Export as MP3 at 320 and at 128 and confirm the size difference tracks.
- Check the tags survive: open an exported FLAC and MP3 in a player and confirm
  title, artist and cover art are present.
- Set the concat sample rate to 96 kHz and try MP3 — it should refuse with a
  clear message rather than producing a broken file.

---

## Remaining plan

### Step 6 — Audio quality and polish
- **Windowed-sinc resampling** (long-standing open item) to replace linear
  interpolation, which matters most when conforming 22.05 kHz or 48 kHz sources
  into a project at a different rate.
- Per-item preview from the concat list.
- Optional loudness matching across concat items, so a joined compilation sits
  at an even level rather than jumping between tracks.
- Recent-projects list and reopening the last project on launch.
- Move waveform analysis off the import path so a large batch import does not
  block the UI.

### Step 7 — Release readiness
- App icon and installer branding.
- A first-run screen explaining the two modes.
- Optional: VBR MP3, and FLAC compression level if a suitable knob is exposed.
