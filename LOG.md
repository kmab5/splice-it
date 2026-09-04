# Splice It — Change Log

## Turn 4 — Export crash fix + working EQ

Two problems this turn: the export failing on a metadata value, and the
mastering rack's EQ being non-functional. Both are fixed. No concat work yet.

---

### 1. Export crash: `invalid value: integer -6, expected u32`

**Cause.** The Release Year, Track Number, and Total Tracks fields in the tag
editor are `<input type="number">` with **no `min` attribute**. Pressing the
spinner's down arrow (or the down key) from an empty field walks straight into
negative numbers, and the change handler used
`Number(e.target.value) || undefined`, which happily passes `-6` through because
`-6` is truthy. Those fields are `Option<u32>` in Rust, so serde rejected the
whole `project` argument and the export died before any audio was touched.

Fixed at both ends:

**`src/components/MetadataEditor.tsx`** — added a `parseCount` helper that
floors the value, rejects anything zero or negative, and caps at 9999. Applied
to year, track number, and total tracks, with matching `min`/`max`/`step`
attributes so the spinner cannot produce an invalid value in the first place.
BPM (a float tag) is guarded the same way.

**`src-tauri/src/models.rs`** — added a lenient deserializer for the four
unsigned tag fields (`year`, `track_number`, `total_tracks`, `disc_number`).
A negative, fractional, non-finite, or out-of-range value now drops that single
tag instead of aborting the export. Tag values also come from whatever a
third-party encoder wrote into a source file, so the backend should not trust
them; one bad field in someone else's MP3 should never cost you a render.

---

### 2. The EQ

**It had no controls.** `MasterDspSettings` has five `eq_*` fields, and the
mastering rack had sliders for stereo width, limiter ceiling, LUFS target,
compressor threshold, and compressor ratio — but **not one** for any EQ
parameter. The curve was drawn from the settings and the two "interactive node
pins" were rendered, but the canvas had no mouse handlers at all. There was
genuinely no way to change the EQ from the UI.

Three separate things were wrong. All three are fixed.

#### a. No controls → real controls

`src/components/MasteringRack.tsx` now has a labelled slider for every EQ
parameter, under the curve: high-shelf frequency and gain, and bell frequency,
gain, and Q. Each shows its live value.

#### b. The curve did not describe the actual filters

`src/services/dspMath.ts` was approximating. The shelf hard-returned `0` below
500 Hz and used a `1/(1 + (fc/f)²)` weighting; the bell was a Gaussian. Neither
resembles the RBJ biquads that `src-tauri/src/dsp.rs` actually applies, so the
displayed curve was decorative.

Replaced with real biquad math: `peakingCoeffs` and `highShelfCoeffs` use the
same Audio EQ Cookbook formulas as the Rust, and `biquadMagnitudeDb` evaluates
`|H(e^jw)|` on the unit circle. The curve now shows exactly what the exporter
does.

Verified numerically against known behaviour (shelf −6 dB @ 12 kHz, bell −6 dB
@ 300 Hz, Q 1.5):

```
   100 Hz -> -0.38 dB
   300 Hz -> -6.00 dB   <- bell hits its exact centre gain
  1000 Hz -> -0.29 dB
 12000 Hz -> -3.00 dB   <- shelf is half-gain at its corner, as it should be
 20000 Hz -> -5.99 dB   <- asymptotes to full shelf gain
```

With all gains at zero the response is flat to 0.000000 dB.

#### c. The canvas was drawn at the wrong size

The backing store height was hardcoded to `140`, while the element is stretched
by `flex-1` and `h-full`. So the curve was drawn into a 140px buffer and scaled
to whatever height the dock happened to be, and it never redrew when you resized
the dock. Now measured with a `ResizeObserver` and redrawn on size change.

#### d. The node pins are now actually interactive

- **Drag** either node to change its frequency and gain together.
- **Scroll** over the bell node to change its Q.
- **Double-click** the canvas to flatten both gains to 0 dB.
- Nodes highlight on hover, and the cursor changes to grab/grabbing.

#### e. Live EQ changes now reach the audio graph

`src/services/audioEngine.ts` — `updateMasterDsp` began with
`if (!this.ctx) return;`, so any EQ change made before the first playback was
silently discarded. It now creates the context the same way `updateTracks` does.
Web Audio's `peaking` and `highshelf` node types use the same RBJ formulas, so
what you hear while playing matches both the curve and the exported file.

---

### To apply this update

1. Copy these files over your working tree, preserving paths.
2. `npx tsc --noEmit` and `cd src-tauri && cargo check`.
3. Re-run the **Build Windows Installers** workflow for a fresh installer.

Verified this turn: `tsc --noEmit` passes, `vite build` succeeds, and the EQ
response math was unit-tested against known filter behaviour (numbers above).
The Rust change is a serde attribute plus one helper function.

**Worth testing on your end:** export once with a negative value typed into
Release Year. It should now export cleanly and simply omit the year tag rather
than failing.

---

### Still open

- Peak envelopes are a fixed 1200 buckets per source, so zooming deep into a
  long file shows a coarse waveform.
- Resampling is linear interpolation.
- `package-lock.json` still not committed (would let CI use `npm ci`).
- The compressor, limiter, and stereo width have controls but no visual
  feedback (no gain-reduction meter). Not broken, just uninformative.

---

## Planned next

### Step 2 — Concat mode

Now unblocked. A dedicated mode for ordering and joining files, built on the
Step 1 engine and leaving the timeline editor untouched:

- A **Timeline / Concat** switcher in the top navbar, each mode holding its own
  state so switching never disturbs the other.
- Flat state: an ordered list of source files, not clips on tracks.
- Drag-to-reorder list with per-item duration, running start offset, total
  output length, and per-item audition.
- Optional gap or crossfade between adjacent items.
- A dedicated `concat_export` Rust command that decodes in order and writes one
  continuous file, with the mastering chain **off by default** — joining files
  should not silently re-master them.
- Shared metadata editor and the same WAV export options.

### Step 3 — Additional export formats

FLAC and MP3 encoding, plus format selection in both modes.
