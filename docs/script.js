/* ---------------------------------------------------------------------------
   The version number and download links come from the GitHub releases API, so
   the page can't drift out of date the way a hardcoded version always does.
   Everything degrades to the /releases/latest page if the request fails, which
   it will for a brand new repo with no releases yet.
--------------------------------------------------------------------------- */

const REPO = 'kmab5/splice-it';

/** Match a release asset to one of the three download cards. */
function classifyAsset(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.msi')) return 'msi';
  if (lower.includes('setup') && lower.endsWith('.exe')) return 'setup';
  if (lower.includes('portable') && lower.endsWith('.exe')) return 'portable';
  return null;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

async function hydrateRelease() {
  let release;

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    // 404 just means nothing has been tagged yet. Leave the fallbacks alone.
    if (!response.ok) return;
    release = await response.json();
  } catch {
    return;
  }

  if (!release || !release.tag_name) return;

  const chip = document.getElementById('version-chip');
  if (chip) chip.textContent = release.tag_name;

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const byKind = {};
  for (const asset of assets) {
    const kind = classifyAsset(asset.name || '');
    if (kind && !byKind[kind]) byKind[kind] = asset;
  }

  // Point each card straight at its file rather than the release page.
  document.querySelectorAll('.dl[data-asset]').forEach((card) => {
    const asset = byKind[card.dataset.asset];
    if (!asset) return;

    card.href = asset.browser_download_url;
    const label = card.querySelector('.dl-file');
    if (label) {
      const size = formatSize(asset.size);
      label.textContent = size ? `${asset.name} · ${size}` : asset.name;
    }
  });

  // The hero button gets the installer, since that is what most people want.
  const heroButton = document.getElementById('download-btn');
  if (heroButton && byKind.setup) {
    heroButton.href = byKind.setup.browser_download_url;
    heroButton.textContent = `download ${release.tag_name} for windows`;
  }
}

hydrateRelease();
