# page/

The landing page, served by GitHub Pages.

Plain HTML, CSS and one small script. No build step, no framework, no
dependencies to keep current.

## Enabling it

GitHub Pages' branch-based publishing only lets you pick the repository root or
`/docs` as the source folder, so this directory is published through the Pages
Actions pipeline instead.

One-time setup:

1. **Settings → Pages → Build and deployment → Source:** choose
   **GitHub Actions**.
2. Push anything under `page/` to `main`, or run **Deploy Landing Page** from
   the Actions tab by hand.

The site lands at `https://<user>.github.io/splice-it/`.

## Working on it locally

```bash
python3 -m http.server 8080 --directory page
# then open http://localhost:8080
```

Opening `index.html` straight off the filesystem mostly works, but the release
lookup in `script.js` needs an `http://` origin.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole page. |
| `styles.css` | Design tokens copied from `kmab-brand/design-tokens.css`, then the layout. |
| `script.js` | Fills in the version and download links from the GitHub releases API. |
| `assets/og.png` | 1200×630 social card, generated with the brand fonts. |
| `assets/favicon.svg` | Three joined blocks in the brand's tier colours. |
| `assets/app-icon.png` | The app icon, also used as the apple-touch-icon. |
| `assets/lambda.svg` | The λ author mark, from the brand repo. |

## Version number

The header chip and the download buttons are filled in at runtime from the
latest GitHub release, so they cannot drift out of date. The hardcoded
`v0.2.12` in `index.html` is only the fallback for when the API call fails or
no release exists yet — worth updating when you cut a release, but nothing
breaks if you forget.
