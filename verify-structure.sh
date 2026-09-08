#!/usr/bin/env bash
# Checks that the repo has everything a Tauri build needs.
# Run from the repo root:  bash verify-structure.sh
missing=0
for f in \
  package.json index.html src/main.tsx src/App.tsx src/index.css \
  src/types/project.ts \
  src/services/ipc.ts src/services/audioEngine.ts src/services/dspMath.ts \
  src/services/wavExporter.ts src/services/settings.ts src/version.ts \
  src-tauri/Cargo.toml src-tauri/build.rs src-tauri/tauri.conf.json \
  src-tauri/capabilities/default.json src-tauri/icons/icon.ico \
  src-tauri/src/main.rs src-tauri/src/commands.rs src-tauri/src/dsp.rs \
  src-tauri/src/encoders.rs src-tauri/src/models.rs
do
  if [ ! -f "$f" ]; then echo "MISSING  $f"; missing=$((missing+1)); fi
done

for c in TopNavbar TimelineRuler TrackHeader TimelineCanvas BottomDock ExportModal \
         RightSidebar ContextMenu MasteringRack MetadataEditor ClipInspector \
         TrackColorPicker ConcatWorkspace SettingsModal WelcomeModal
do
  if [ ! -f "src/components/$c.tsx" ]; then echo "MISSING  src/components/$c.tsx"; missing=$((missing+1)); fi
done

if [ -f src-tauri/build.rs ] && ! grep -q "tauri_build::build" src-tauri/build.rs; then
  echo "BROKEN   src-tauri/build.rs does not call tauri_build::build()"
  missing=$((missing+1))
fi

if [ "$missing" -eq 0 ]; then
  echo "All required files present."
else
  echo ""
  echo "$missing file(s) missing. Restore them from git:  git checkout -- <path>"
  exit 1
fi
