# Splice It — Change Log

## Turn 13 — v0.2.13 — Build fix: missing build.rs

---

### What the error actually means

```
error: OUT_DIR env var is not set, do you have a build script?
  --> src\main.rs:47:14
   |  .run(tauri::generate_context!())
```

`tauri::generate_context!()` reads `OUT_DIR` at compile time to find the config
and ACL manifest that `tauri-build` generates. Cargo only sets `OUT_DIR` for a
crate **that has a build script**. So the message is literal: on the runner,
Cargo saw no build script for `splice-it`.

Nothing in `main.rs` is wrong, and the failure has nothing to do with the FLAC
or MP3 crates added in 0.2.8.

### Why it happened, and it is my fault

`src-tauri/build.rs` is two lines and I never edited it, so it was never
included in any zip I sent you. I checked all eleven:

```
build.rs      : in 0 of 11 zips
Cargo.lock    : in 0 of 11 zips
```

Every zip did contain `src-tauri/Cargo.toml` and `src-tauri/src/*.rs`, and the
v0.2.10 zip contained a whole `src-tauri/icons/` directory. If any of those were
applied by **replacing folders** rather than merging file by file, `build.rs`
and `Cargo.lock` disappeared without a trace — and a missing `build.rs` stays
silent until a full `cargo build` reaches the macro, roughly 500 crates in.

That is a packaging failure on my side. Shipping only changed files is fine, but
it puts the burden of a correct merge on you, and it gave you no way to notice a
casualty.

### The fix

**1. `src-tauri/build.rs` is in this zip.** Drop it in and the build should go
through. Confirm it exists and contains exactly:

```rust
fn main() {
    tauri_build::build()
}
```

**2. `src-tauri/Cargo.toml` now declares the script explicitly:**

```toml
[package]
edition = "2021"
build = "build.rs"
```

Cargo does auto-detect a `build.rs` next to `Cargo.toml`, so this is not
strictly required. It is worth having anyway: with the key present, a missing
file is a manifest-level complaint about a named path rather than a macro error
500 crates later.

**3. The workflow now runs a preflight check** before installing anything. It
verifies every required file exists, that `build.rs` really calls
`tauri_build::build()`, and that the three version fields agree. A missing file
now fails in about twenty seconds with:

```
::error file=src-tauri/build.rs::missing: src-tauri/build.rs
```

plus a listing of what `src-tauri` does contain. The version check is there
because a mismatch between `package.json`, `tauri.conf.json` and `Cargo.toml`
produces an installer and a UI that disagree about which build you are running,
which is annoying rather than fatal and therefore easy to miss.

**4. `verify-structure.sh`** at the repo root does the same check locally,
including all fifteen React components:

```bash
bash verify-structure.sh
```

I would run this now, before pushing. `build.rs` may not be the only casualty
and it is the only one that fails loudly.

If it reports anything else missing, most of it is recoverable from git:

```bash
git status              # anything deleted will show up here
git checkout -- src-tauri/build.rs src-tauri/Cargo.lock
```

### Applying zips from here on

Merge, do not replace:

```bash
# from the repo root, with the unzipped folder alongside
cp -r splice-it-v0.2.13/. .
```

The trailing `/.` copies the *contents* over your tree, adding and overwriting
individual files while leaving everything else alone. Replacing a folder in
Explorer deletes whatever was in it first, which is how this happened.

---

### Files changed

`src-tauri/build.rs` (unchanged content, shipped so it is definitely present),
`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `package.json`,
`.github/workflows/build-windows.yml`, `verify-structure.sh` (new).

No application source changed, so the code you already had compiling is
untouched. Version is **0.2.13** across all three files.

---

### Worth doing in this order

1. Apply the zip with the merge command above.
2. `bash verify-structure.sh` and fix anything it reports.
3. Commit and push. The preflight step runs first, so a bad checkout costs you
   twenty seconds instead of fifteen minutes.
4. `cd src-tauri && cargo check` locally if you want the fastest confirmation
   before pushing.

### Also worth checking

`Cargo.lock` was never shipped either. Its absence is harmless — Cargo just
regenerates it — but if it went missing from the repo, committing a fresh one
gives you reproducible builds and lets the workflow's cache work properly:

```bash
cd src-tauri && cargo generate-lockfile && git add Cargo.lock
```
