# Splice It — Change Log

## Turn 12 — v0.2.12 — Landing page

Versions bumped to **0.2.12** across `package.json`, `src-tauri/Cargo.toml` and
`src-tauri/tauri.conf.json`. No app source changed this turn, so `cargo check`
and `tsc` are unaffected.

---

### One thing you should know up front

GitHub Pages' **branch-based** publishing only offers two source folders: the
repository root, or `/docs`. There is no way to point it at `page/` from the
Settings UI.

So the page publishes through the **Pages Actions pipeline** instead, which
accepts any directory as its artifact. `page/` stays where you asked for it.

One-time setup: **Settings → Pages → Build and deployment → Source →
GitHub Actions**. After that, any push touching `page/` deploys, and you can
also run **Deploy Landing Page** by hand from the Actions tab.

---

### What's in `page/`

Plain HTML, one stylesheet, one small script. No build step and no dependencies,
so it cannot rot while you are busy with the app.

| File | What it is |
| --- | --- |
| `index.html` | The page. |
| `styles.css` | Brand tokens copied verbatim from `kmab-brand/design-tokens.css`, then layout. |
| `script.js` | Fills in the version and download links from the releases API. |
| `assets/og.png` | 1200×630 social card. |
| `assets/favicon.svg` | Three joined blocks in the tier colours. |
| `assets/og.png`, `app-icon.png`, `lambda.svg` | Card, app icon, author mark. |
| `README.md` | How to enable Pages and run it locally. |

### Reading the brand across

The two repos use different palettes — the app is slate and emerald, the brand
is ink and purple. Rather than picking one, the tier semantics resolved it. The
brand assigns meaning to colour (purple is signature work, green is solid, amber
is the side quest), and that maps onto the app almost exactly:

- **purple → concat.** The reason the app exists, so it gets the signature
  colour and the primary buttons.
- **green → timeline.** The solid workhorse, and near-identical to the emerald
  the app already uses for it.
- **amber → gaps and the SmartScreen warning.** The app already draws silence
  in amber, so this was free.

Typography follows the brand: Space Grotesk for display, Space Mono for
eyebrows, chips, timings and filenames — anything meant to read like telemetry.
Everything sits on `#0E0E11` with the surface and line tokens, plus a faint
timeline grid behind the hero that fades out downward.

### The hero visual

Rather than a mocked-up screenshot, the hero draws the **actual concat sequence
strip** in CSS: blocks per file, hatched purple where a crossfade overlaps,
hatched amber where there is silence, and a playhead sweeping across. Same
shapes and colours the app renders, so it is a real depiction rather than
marketing art. It respects `prefers-reduced-motion` (playhead parks instead of
sweeping).

### The social card

Generated with PIL using the real Space Grotesk and Space Mono files pulled from
the `google/fonts` repository, so the card matches the page rather than falling
back to whatever the container had installed. Two passes: the first had the
crossfade hatching spilling past its block and a visibly circular edge on the
purple bloom, so the hatch is now masked to the overlap region and the bloom is
Gaussian-blurred.

### The version number cannot go stale

`script.js` fetches the latest release and rewrites the header chip, the hero
button, and all three download cards to point at the actual asset URLs with
their file sizes. A hardcoded `v0.2.12` sits in the HTML purely as the fallback
for a failed request or a repo with no releases yet. This pairs with the release
workflow from last turn: tag, push, and the page updates itself.

### Copy

Written to the brand's writing rules rather than generic product-page prose:
lowercase headings throughout, punctuation actually used, deliberately uneven
list items, and no closing call to action — the footer ends on
"it started because i had forty voice memos and no patience" instead.

Checked mechanically before shipping:

```
vocabulary tells:      none
dead openers / CTA:    none
words: 915, em dashes: 1  (brand budget allows 4)
semicolons: 9, parentheticals: 4
headings with capitals: 0
HTML: balanced   CSS braces: 161/161   all asset paths resolve
```

The SmartScreen section states the real reason plainly (a certificate costs a
few hundred a year and has to live on a hardware token) rather than glossing
over it, which is also what the brand's note about inflated certainty asks for.

---

### Worth checking

- Enable Pages with the **GitHub Actions** source, then push. The first deploy
  usually takes under a minute.
- Serve it locally with `python3 -m http.server 8080 --directory page`. The
  release lookup needs an `http://` origin, so opening the file directly leaves
  the fallback version showing.
- Paste the deployed URL into a Discord or Slack message to check the social
  card renders.
- If you host it anywhere other than `kmab5/splice-it`, change `REPO` at the
  top of `script.js`.

---

### Still open

- No screenshots. The hero strip is honest but a real capture of both
  workspaces would sell it better than any illustration; I cannot take one
  without running the app.
- The page assumes x64 Windows only, which matches what the workflow builds.
- Code signing and the auto-update feed remain undone; both are documented in
  the README when you want them.
