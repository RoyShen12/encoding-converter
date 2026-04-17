const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const meow = require('meow')
const chardet = require('chardet')
const iconv = require('iconv-lite')
const chalk = require('chalk').default
const hs = require('human-size')

const stripBom = require('strip-bom')
const stripBomBuffer = require('strip-bom-buf')

const cli = meow(
  `
    Usage
      $ node index -d <> [options]

    Options
      -d, --dir <str>               Working directory
      -e, --extension <str>         Working extension, default is txt
      -i, --ignore <str | reg>      Ignore pattern, default is ^\\.,^node_modules$
      --dry-run                     Dry run, do not write file
`,
  {
    flags: {
      dir: { alias: 'd' },
      extension: { alias: 'e' },
      ignore: { alias: 'i' },
      dryRun: {
        type: 'boolean',
      },
    },
  }
)

// ---------- argv validation ----------

if (!cli.flags || !cli.flags.dir) {
  console.error(chalk.redBright('Error: --dir is required.'))
  cli.showHelp(1)
}

const dir = path.resolve(cli.flags.dir)

try {
  fs.accessSync(dir, fs.constants.F_OK | fs.constants.R_OK)
} catch (e) {
  console.error(chalk.redBright(e.toString().split('\n')[0]))
  process.exit(1)
}

// ---------- regex build ----------

const customExt = (cli.flags.extension || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)
const validateExt = ['txt', ...customExt]

let innerExtReg
try {
  innerExtReg = new RegExp(validateExt.map(e => `\\.${e}$`).join('|'), 'i')
} catch (e) {
  console.error(chalk.redBright(`Invalid --extension pattern: ${e.message}`))
  process.exit(1)
}

const customIgnore = (cli.flags.ignore || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)
const ignore = ['^\\.', '^node_modules$', ...customIgnore]

let innerIgnoreReg
try {
  innerIgnoreReg = new RegExp(ignore.map(p => `(?:${p})`).join('|'))
} catch (e) {
  console.error(chalk.redBright(`Invalid --ignore pattern: ${e.message}`))
  process.exit(1)
}

const hasAllowedExt = fname => innerExtReg.test(fname)
const canIgnore = fname => innerIgnoreReg.test(fname)

console.log(`working dir: ${dir}
work on extensions: ${validateExt.map(e => `.${e}`).join(', ')}
ignore file: ${ignore.join(', ')}
${cli.flags.dryRun ? chalk.yellowBright('DRY RUN — no files will be written') : ''}
`)

// ---------- color / label constants ----------

const ASCII_color = chalk.magentaBright('ascii')
const GBK_color = chalk.red('GBK')
const UTF16_color = chalk.redBright('UTF-16')
const UTF_color = chalk.greenBright('UTF-8')
const BIN_color = chalk.gray('binary')

const skip = 'skip:'
const proc = chalk.redBright('proc:')
const try_proc = chalk.yellowBright('try proc:')

// ---------- helpers ----------

const SAMPLE_BYTES = 128 * 1024 // enough for chardet to get confident on most texts

function readSample(fp, size) {
  // Read at most `size` bytes without loading the whole file.
  let fd
  try {
    fd = fs.openSync(fp, 'r')
    const buf = Buffer.allocUnsafe(size)
    const n = fs.readSync(fd, buf, 0, size, 0)
    return buf.subarray(0, n)
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd) } catch (_) { /* noop */ }
    }
  }
}

function looksBinary(buf) {
  // Presence of NUL byte in the sample is a reliable "not a text file" signal.
  // UTF-16 text contains NULs, so we must exempt it — detect BOM first.
  if (buf.length >= 2) {
    const b0 = buf[0], b1 = buf[1]
    if ((b0 === 0xff && b1 === 0xfe) || (b0 === 0xfe && b1 === 0xff)) return false
  }
  const scanLen = Math.min(buf.length, 8192)
  for (let i = 0; i < scanLen; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

function getMostPossibleEncoding(buffer) {
  try {
    const r = chardet.detect(buffer)
    if (!r) return 'UTF-8'
    if (typeof r === 'string') return r
    if (Array.isArray(r) && r[0] && r[0].name) return r[0].name
    return 'UTF-8'
  } catch (e) {
    return 'UTF-8'
  }
}

function normalizeEncodingName(name) {
  if (!name) return 'UTF-8'
  return String(name).trim().toUpperCase()
}

function writeFileAtomic(fp, data) {
  if (cli.flags.dryRun) return
  // Write to a temp sibling, then rename. Keeps the original file intact if
  // the process dies mid-write, and avoids partial reads by other tools.
  const dirOfFile = path.dirname(fp)
  const tmp = path.join(dirOfFile, `.${path.basename(fp)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  try {
    fs.writeFileSync(tmp, data)
    fs.renameSync(tmp, fp)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch (_) { /* noop */ }
    throw e
  }
}

// ---------- pass 1: walk & collect targets ----------

/**
 * Iteratively walks the tree. Returns an array of file entries to process.
 * - Uses `withFileTypes` to avoid separate stat calls for type checks.
 * - Uses `lstatSync` semantics (readdir + dirent.isSymbolicLink) to break symlink cycles.
 */
function collectTargets(rootDir) {
  /** @type {{fp: string, depth: number}[]} */
  const files = []
  /** @type {{dir: string, depth: number}[]} */
  const stack = [{ dir: rootDir, depth: 0 }]

  while (stack.length) {
    const { dir: curDir, depth } = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(curDir, { withFileTypes: true })
    } catch (e) {
      console.error(chalk.redBright(e.toString().split('\n')[0]))
      continue
    }

    for (const ent of entries) {
      const name = ent.name
      if (canIgnore(name)) continue

      // Skip symlinks entirely — prevents loops and surprise writes through links.
      if (ent.isSymbolicLink()) continue

      const fp = path.join(curDir, name)

      if (ent.isDirectory()) {
        stack.push({ dir: fp, depth: depth + 2 })
      } else if (ent.isFile() && hasAllowedExt(name)) {
        files.push({ fp, depth })
      }
      // anything else (socket/fifo/block/char) is silently skipped
    }
  }

  return files
}

// ---------- pass 2: process each file ----------

let errorCount = 0
let rewriteCount = 0
let skippedCount = 0

function processFile(fp, depth, index, total) {
  const rel = path.relative(dir, fp)
  const fnColor = chalk.blueBright(rel)
  const fnColorGood = chalk.greenBright(rel)
  const fnColorBad = chalk.magentaBright(rel)
  const pad = ' '.repeat(depth)
  const progress = chalk.cyanBright(`${index} / ${total}`)

  let stat
  try {
    stat = fs.statSync(fp)
  } catch (e) {
    errorCount++
    console.error(chalk.redBright(e.toString().split('\n')[0]))
    return
  }
  const fsizeColor = chalk.rgb(221, 220, 178).italic(hs(stat.size, 1))

  // Read a sample for detection; decode path will read full buffer only when needed.
  let sample
  try {
    sample = readSample(fp, Math.min(SAMPLE_BYTES, Math.max(stat.size, 1)))
  } catch (e) {
    errorCount++
    console.error(chalk.redBright(`read failed: ${fnColorBad} — ${e.message}`))
    return
  }

  if (looksBinary(sample)) {
    skippedCount++
    console.log(`${pad}${skip} ${fnColorGood}, looks like ${BIN_color} ${fsizeColor} ${progress}`)
    return
  }

  const encRaw = getMostPossibleEncoding(sample)
  const enc = normalizeEncodingName(encRaw)

  // Fast paths that don't need the full buffer.
  if (enc === 'ISO-8859-1' || enc === 'ASCII') {
    skippedCount++
    console.log(`${pad}${skip} ${fnColorGood}, is ${ASCII_color} already ${fsizeColor} ${progress}`)
    return
  }

  if (enc === 'UTF-8') {
    // Only need to check BOM — first 3 bytes of the sample are enough.
    if (sample.length >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) {
      let full
      try {
        full = fs.readFileSync(fp)
      } catch (e) {
        errorCount++
        console.error(chalk.redBright(`read failed: ${fnColorBad} — ${e.message}`))
        return
      }
      try {
        writeFileAtomic(fp, stripBomBuffer(full))
        rewriteCount++
        console.log(
          `${pad}${proc} ${fnColorGood}, rewrite from ${UTF_color}${chalk.yellowBright('(BOM)')} -> ${UTF_color} ${fsizeColor} ${progress}`
        )
      } catch (e) {
        errorCount++
        console.error(chalk.redBright(`write failed: ${fnColorBad} — ${e.message}`))
      }
    } else {
      skippedCount++
      console.log(`${pad}${skip} ${fnColorGood}, is ${UTF_color} already ${fsizeColor} ${progress}`)
    }
    return
  }

  // All remaining paths must decode the whole buffer.
  let full
  try {
    full = fs.readFileSync(fp)
  } catch (e) {
    errorCount++
    console.error(chalk.redBright(`read failed: ${fnColorBad} — ${e.message}`))
    return
  }

  try {
    if (enc === 'GB18030' || enc === 'GBK' || enc === 'GB2312') {
      writeFileAtomic(fp, stripBom(iconv.decode(full, 'GB18030')))
      rewriteCount++
      console.log(
        `${pad}${proc} ${fnColor}, rewrite from ${GBK_color} -> ${UTF_color} ${fsizeColor} ${progress}`
      )
    } else if (enc.indexOf('UTF-16') >= 0) {
      writeFileAtomic(fp, stripBom(iconv.decode(full, encRaw)))
      rewriteCount++
      console.log(
        `${pad}${proc} ${fnColor}, rewrite from ${UTF16_color} -> ${UTF_color} ${fsizeColor} ${progress}`
      )
    } else {
      if (!iconv.encodingExists(encRaw)) {
        errorCount++
        console.error(
          chalk.redBright(`unsupported encoding ${enc} for file: ${fnColorBad}`)
        )
        return
      }
      const decodedStr = iconv.decode(full, encRaw)
      writeFileAtomic(fp, stripBom(decodedStr))
      rewriteCount++
      console.log(
        `${pad}${try_proc} ${fnColor}, rewrite from ${chalk.yellowBright(enc)} -> ${UTF_color} ${fsizeColor} ${progress}`
      )
    }
  } catch (e) {
    errorCount++
    console.error(chalk.redBright(`convert failed: ${fnColorBad} — ${e.message}`))
  }
}

// ---------- entry ----------

const t0 = Date.now()
const targets = collectTargets(dir)
const total = targets.length

if (total === 0) {
  console.log(chalk.yellowBright('No matching files found.'))
  process.exit(0)
}

for (let i = 0; i < targets.length; i++) {
  const { fp, depth } = targets[i]
  processFile(fp, depth, i + 1, total)
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(2)
console.log('')
console.log(
  `${chalk.greenBright('done')} — rewritten: ${chalk.greenBright(rewriteCount)}, skipped: ${chalk.cyanBright(skippedCount)}, errors: ${errorCount > 0 ? chalk.redBright(errorCount) : 0}, elapsed: ${elapsed}s`
)

if (errorCount > 0) process.exit(1)
