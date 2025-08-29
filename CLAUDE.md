# QWEN: Project Guide and Interaction Context

This document provides an at-a-glance overview of the repository to streamline future interactions with Qwen Code.

## Project Overview

- Name: gbk-to-utf8 (encoding-converter)
- Type: Node.js CLI utility
- Purpose: Recursively scan a target directory for text files, detect their encodings, and normalize them to UTF-8 without BOM. Files already in ASCII/UTF-8 (without BOM) are skipped; UTF-8 with BOM has the BOM removed; GBK/GB18030 and UTF-16 variants are converted to UTF-8.
- Entry point: `index.js`
- License: MIT

### Key Technologies and Libraries
- Node.js (CommonJS)
- Dependencies:
  - `meow` for CLI argument parsing
  - `chardet` for encoding detection
  - `iconv-lite` for decoding and conversion
  - `strip-bom` and `strip-bom-buf` for BOM removal
  - `chalk` for colored terminal output
  - `human-size` for formatted sizes in logs

### High-level Architecture
- Single-file CLI (`index.js`) that:
  1. Parses flags via `meow`.
  2. Builds allowlist of file extensions and ignore patterns.
  3. Recursively traverses the working directory.
  4. For each file whose basename matches allowed extensions and not ignored patterns:
     - Detects encoding using `chardet`.
     - Decides whether to skip, strip BOM, or transcode to UTF-8.
     - Writes the result back to disk (unless `--dry-run`).

## Requirements
- Node.js >= 8.0 (per README). Modern LTS Node versions are fine.
- macOS, Linux, and Windows supported (path examples provided for both POSIX and Windows).

## Installation

Using npm:

```bash
git clone https://github.com/RoyShen12/encoding-converter.git
cd encoding-converter
npm install
```

Using pnpm (a pnpm-lock.yaml is present):

```bash
git clone https://github.com/RoyShen12/encoding-converter.git
cd encoding-converter
pnpm install
```

## Building and Running

There is no build step. Run the CLI with Node directly.

Basic usage:

```bash
node index -d <directory> [options]
```

Options (from `index.js`):
- `-d, --dir <str>`: Working directory (required).
- `-e, --extension <str>`: Comma-separated list of additional extensions to process. The default allowlist is `txt` plus any values provided here. Matching is case-insensitive. Example: `-e js,md`.
- `-i, --ignore <str | reg>`: Comma-separated list of ignore patterns (joined into a single RegExp). Defaults: `^\.,^node_modules$`. Example: `-i no-change,^important`.
- `--dry-run`: Do not write files; only log actions.

Behavior details:
- Default processed extensions: `.txt`; add more via `-e`.
- Ignoring uses a single combined (case-sensitive) RegExp tested against the basename (not full path) of files/directories.
- Encoding handling:
  - `ISO-8859-1` (treated as ASCII): skip.
  - `UTF-8` without BOM: skip.
  - `UTF-8` with BOM: strip BOM and rewrite as UTF-8 without BOM.
  - `GB18030`: decode as `GBK` and rewrite as UTF-8.
  - `UTF-16` variants: decode using detected label and rewrite as UTF-8.
  - Other encodings: best-effort decode using the detected name; on failure, log error and continue.

Examples:

```bash
# POSIX
node index -d ~/text-books/example-dir
node index -d ~/text-books/example-dir -i no-change,^important
node index -d ~/text-books/example-dir -e js,md --dry-run

# Windows
aut scripts
node index -d "C:\\Users\\Admin\\Downloads\\Books"
```

Return codes:
- Always runs to completion unless an unhandled error occurs. No explicit non-zero exit codes defined for conversion failures (they are logged and processing continues).

## Development Conventions
- Code style: Plain CommonJS in a single file (`index.js`); no linter or formatter is configured.
- Testing: No tests are defined. `npm test` currently errors by design (placeholder script).
- Git: Standard repository layout; `.gitignore` excludes editor folders, `node_modules`, and `.DS_Store`.
- Logging: Colorized status (skip/proc/try proc), relative paths from the working directory, file sizes via `human-size`, and a simple progress counter `current/total`.

Suggested practices for contributors:
- Run with `--dry-run` during development to preview actions.
- Commit in small, reviewable chunks; consider adding basic unit tests and/or a small fixture directory for integration testing.
- If adding features, follow the existing CLI flag patterns and meow usage.

## Known Caveats and Notes
- Encoding detection is heuristic; some files may be misclassified.
- Ignore patterns are combined into a single case-sensitive RegExp and applied to basenames only.
- The function name `isInvalidExt` is a slight misnomer: it returns `true` when a filename matches the allowed extension list; the code uses `!isInvalidExt` to skip non-allowed files.
- When decoding with `iconv-lite`, outputs are written as UTF-8 by Node’s default when passing strings to `fs.writeFileSync`.
- Large directories are processed synchronously; there is no concurrency control.

## Repository Layout
- `index.js`: Main CLI logic.
- `package.json`: Package metadata, dependencies, and placeholder test script.
- `README.md`: Requirements, installation steps, and usage notes (does not mention `--dry-run`; see above for the full option set).
- `LICENSE`: MIT License.
- `.gitignore`: Common ignores.
- `pnpm-lock.yaml`: Lockfile for pnpm users.

## Testing and Quality
- Current status: No tests. Consider adding:
  - Unit tests for pattern building and encoding decision branches.
  - Integration tests over a small sample directory containing files with different encodings and BOM states.
- Linting/formatting: Not configured; follow existing code style.

## Quick Commands Cheat Sheet

Install dependencies:
```bash
npm install
# or
pnpm install
```

Run conversion:
```bash
node index -d <target-dir> [-e ext1,ext2] [-i pattern1,pattern2] [--dry-run]
```

Check package metadata:
```bash
cat package.json
```

## TODOs / Potential Enhancements
- Add proper tests and CI.
- Expose an npm binary (`bin` entry) for `npx gbk-to-utf8` style usage.
- Improve ignore pattern semantics (e.g., path-based matching, case-insensitive option).
- Add concurrency options for performance on large trees.
- Expand README to include `--dry-run` and examples for multiple extensions.
