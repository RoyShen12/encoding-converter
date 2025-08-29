const fs = require('fs')
const path = require('path')
// const { promisify } = require('util')

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

function ensureDirProvided() {
  if (!cli.flags || !cli.flags.dir) {
    console.error(chalk.redBright('Error: --dir is required.'))
    cli.showHelp(1)
  }
}

const writeFile = (fp, buf) => {
  if (cli.flags.dryRun) {
    return
  }

  fs.writeFileSync(fp, buf)
}

ensureDirProvided()
const dir = cli.flags.dir

function assertDirAccessible(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK | fs.constants.R_OK)
  } catch (e) {
    console.error(chalk.redBright(e.toString().split('\n')[0]))
    process.exit(1)
  }
}

assertDirAccessible(dir)

const customExt = (cli.flags.extension || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)
const validateExt = ['txt', ...customExt]
const innerExtReg = new RegExp(validateExt.map(e => `\\.${e}$`).join('|'), 'i')

function hasAllowedExt(fname) {
  return innerExtReg.test(fname)
}

const customIgnore = (cli.flags.ignore || '')
  .split(',')
  .map(e => e.trim())
  .filter(Boolean)
const ignore = ['^\\.', '^node_modules$', ...customIgnore]
const innerIgnoreReg = new RegExp(ignore.join('|'))

function canIgnore(fname) {
  return innerIgnoreReg.test(fname)
}

console.log(`working dir: ${dir}
work on extensions: ${validateExt.map(e => `.${e}`).join(', ')}
ignore file: ${ignore.join(', ')}
`)

const ASCII_color = chalk.magentaBright('ascii')
const GBK_color = chalk.red('GBK')
const UTF16_color = chalk.redBright('UTF-16')
const UTF_color = chalk.greenBright('UTF-8')

const skip = 'skip:'
const proc = chalk.redBright('proc:')
const try_proc = chalk.yellowBright('try proc:')

let totalFoundCount = 0
let nowScannedPosition = 0

function getMostPossibleEncoding(buffer) {
  try {
    const r = chardet.detect(buffer)
    if (!r) return 'UTF-8'
    return typeof r === 'string' ? r : (Array.isArray(r) && r[0] && r[0].name) ? r[0].name : 'UTF-8'
  } catch (e) {
    return 'UTF-8'
  }
}

function normalizeEncodingName(name) {
  if (!name) return 'UTF-8'
  return String(name).trim().toUpperCase()
}

function progress() {
  return chalk.cyanBright(`${++nowScannedPosition} / ${totalFoundCount}`)
}

function main(targetDir, blk = 0) {
  if (blk > 0) {
    try {
      fs.accessSync(targetDir, fs.constants.F_OK | fs.constants.R_OK | fs.constants.X_OK)
    } catch (e) {
      console.error(chalk.redBright(e.toString().split('\n')[0]))
    }
  }

  let list = []
  try {
    list = fs.readdirSync(targetDir)
  } catch (e) {
    console.error(chalk.redBright(e.toString().split('\n')[0]))
    return
  }

  totalFoundCount += list.length

  for (const fn of list) {
    const fnColorBad = chalk.magentaBright(fn)

    if (canIgnore(fn)) {
      nowScannedPosition++
      continue
    }

    const fp = path.join(targetDir, fn)
    let fstat
    try {
      fstat = fs.statSync(fp)
    } catch (e) {
      console.log(chalk.redBright(e.toString().split('\n')[0]))
      nowScannedPosition++
      continue
    }

    const fsize = hs(fstat.size, 1)

    const fnColor = chalk.blueBright(path.relative(dir, fp))
    const fnColorGood = chalk.greenBright(path.relative(dir, fp))
    const fsizeColor = chalk.rgb(221, 220, 178).italic(fsize)

    if (fstat.isDirectory()) {
      nowScannedPosition++
      main(fp, blk + 2)
    } else if (!fstat.isFile()) {
      nowScannedPosition++
    } else if (!hasAllowedExt(fn)) {
      nowScannedPosition++
    } else {
      try {
        fs.accessSync(fp, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK)
      } catch (e) {
        console.log(chalk.redBright(e.toString().split('\n')[0]))
      }
      const fbuf = fs.readFileSync(fp)
      const encRaw = getMostPossibleEncoding(fbuf)
      const enc = normalizeEncodingName(encRaw)

      if (enc === 'ISO-8859-1' || enc === 'ASCII') {
        console.log(`${' '.repeat(blk)}${skip} ${fnColorGood}, is ${ASCII_color} already ${fsizeColor} ${progress()}`)
      } else if (enc === 'UTF-8') {
        if (fbuf[0] === 0xef && fbuf[1] === 0xbb && fbuf[2] === 0xbf) {
          console.log(
            `${' '.repeat(blk)}${proc} ${fnColorGood}, rewrite from ${UTF_color}${chalk.yellowBright(
              '(BOM)'
            )} -> ${UTF_color} ${fsizeColor} ${progress()}`
          )
          writeFile(fp, stripBomBuffer(fbuf))
        } else {
          console.log(`${' '.repeat(blk)}${skip} ${fnColorGood}, is ${UTF_color} already ${fsizeColor} ${progress()}`)
        }
      } else if (enc === 'GB18030' || enc === 'GBK' || enc === 'GB2312') {
        console.log(
          `${' '.repeat(blk)}${proc} ${fnColor}, rewrite from ${GBK_color} -> ${UTF_color} ${fsizeColor} ${progress()}`
        )
        writeFile(fp, stripBom(iconv.decode(fbuf, 'GB18030')))
      } else if (enc.indexOf('UTF-16') >= 0) {
        console.log(
          `${' '.repeat(
            blk
          )}${proc} ${fnColor}, rewrite from ${UTF16_color} -> ${UTF_color} ${fsizeColor} ${progress()}`
        )
        writeFile(fp, stripBom(iconv.decode(fbuf, encRaw)))
      } else {
        console.log(
          `${' '.repeat(blk)}${try_proc} ${fnColor}, rewrite from ${chalk.yellowBright(
            enc
          )} -> ${UTF_color} ${fsizeColor} ${progress()}`
        )
        let decodedStr = ''
        try {
          decodedStr = iconv.decode(fbuf, encRaw)
        } catch (err) {
          console.log(chalk.redBright(`error while converting file: ${fnColorBad}`))
          console.error(err)
          continue
        }
        writeFile(fp, stripBom(decodedStr))
      }
    }
  }
}

main(dir)
