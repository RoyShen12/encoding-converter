# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`gbk-to-utf8` (package name) / `encoding-converter` (repo name): a single-file Node.js CLI that recursively normalizes text files in a directory tree to UTF-8 without BOM. CommonJS, no build step, no tests, no linter.

## Commands

Install (pnpm is preferred — `pnpm-lock.yaml` is checked in):

```bash
pnpm install        # or: npm install
```

Run the CLI (there is no `bin` entry; invoke with `node` directly):

```bash
node index -d <target-dir> [-e ext1,ext2] [-i pattern1,pattern2] [--dry-run]
```

`npm test` is a placeholder that exits 1 — there are no tests.

## Architecture

Everything lives in `index.js`. The flow is split into two passes:

1. **CLI parsing** via `meow`. Required flag: `-d/--dir`. Optional: `-e/--extension` (comma list, added to the default `txt`), `-i/--ignore` (comma list, merged with defaults `^\.` and `^node_modules$`), `--dry-run`.
2. **Pattern construction**:
   - Allowed extensions become one case-insensitive regex: `/\.txt$|\.js$|.../i`.
   - Ignore patterns are each wrapped in `(?:...)` and joined with `|` into one **case-sensitive** regex tested against **basenames only** (not full paths). The `(?:...)` wrapping avoids `|` priority bleed between user patterns, but `/i` flags and `\d`/`\w` escapes are still effectively unsupported since patterns are concatenated as source strings.
3. **Pass 1 — `collectTargets(rootDir)`**: iterative (explicit stack) walk using `fs.readdirSync(..., { withFileTypes: true })`. Directory types come from `Dirent`, so there's no separate `statSync` per entry. **Symlinks are skipped unconditionally** (breaks cycles and prevents accidental writes through links). Returns `{fp, depth}[]`; `depth` is the indent level for log output (2 per directory level). No concurrency — intentional, since the tool rewrites files in place.
4. **Pass 2 — `processFile(...)`** iterates the collected list. For each file:
   - `readSample(fp, 128KB)` reads the head without loading the whole file.
   - `looksBinary(sample)` returns true if any NUL appears in the first 8KB (UTF-16 BOM is exempt). Binary files are skipped.
   - `chardet.detect` runs on the sample only; normalized to uppercase.
   - Decision tree, keyed on the normalized encoding:
     - `ISO-8859-1` / `ASCII` → skip.
     - `UTF-8` → skip unless BOM (`EF BB BF`), in which case read the full buffer, strip BOM, rewrite.
     - `GB18030` / `GBK` / `GB2312` → full-read, decode as `GB18030` via `iconv-lite`, strip BOM, rewrite.
     - Contains `UTF-16` → full-read, decode with the raw detected label, strip BOM, rewrite.
     - Anything else → `iconv.encodingExists` guard, then best-effort decode with the raw detected label; failures are logged and counted.
5. **Atomic writes** go through `writeFileAtomic(fp, data)`: writes to a `.<name>.<pid>.<rand>.tmp` sibling then `rename()`s over the original. No-op under `--dry-run`. Decoded strings passed to `fs.writeFileSync` are written as UTF-8 by Node's default string encoding.
6. **Exit code**: process exits `1` if any file errored (read/decode/write/unsupported encoding). End-of-run summary prints `rewritten / skipped / errors / elapsed`.

### Progress counter

`i / total` in log lines is accurate — `total` is the final length of pass-1's target list, frozen before pass 2 starts. The old "denominator grows during walk" behavior is gone.

### Naming gotcha

`hasAllowedExt(fname)` (previously called `isInvalidExt`) returns `true` when a filename **matches** the allowlist. Earlier comments/history may reference the old misleading name.

## Behavior notes that matter when changing code

- Encoding detection is **heuristic** and runs on the first 128KB only — short files or mixed content can still be misclassified. The `try proc:` branch exists precisely for detections the code doesn't explicitly handle.
- Ignore matching is basename-only and case-sensitive; changing this is a user-visible semantics change.
- Symlinks are skipped, not followed — changing this can reintroduce directory cycles.
- Binary detection uses a NUL-byte sniff on the first 8KB; it's a heuristic, not a guarantee, but it prevents the most common misfires on mislabeled `.txt` files.
- The tool **overwrites files in place** via atomic rename. Still verify changes with `--dry-run` first when developing.
- Exit code is non-zero on any file error — don't remove the error counter silently; downstream scripts may depend on it.
- Node >= 8 per README, but the code uses no features that would break on modern LTS.

## Repo layout

`index.js` (all logic) · `package.json` · `README.md` · `LICENSE` · `pnpm-lock.yaml`. No `src/`, no tests, no CI.
