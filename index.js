const fs = require('fs')
// const { promisify } = require('util')

const chardet = require('chardet')
const iconv = require('iconv-lite')
const chalk = require('chalk').default
const hs = require('human-size')

const stripBom = require('strip-bom')
const stripBomBuffer = require('strip-bom-buf')

const dir = process.argv[2]

console.log(`working dir: ${dir}\n`)

const GBK_color = chalk.red('GBK')
const UTF16_color = chalk.redBright('UTF-16')
const UTF_color = chalk.greenBright('UTF-8')

let totalFoundCount = 0
let nowScannedPosition = 0

function getMostPossibleEncoding(buffer) {
  const r = chardet.detect(buffer)
  return typeof r === 'string' ? r : r[0].name
}

function progress() {
  return chalk.cyanBright(`${++nowScannedPosition} / ${totalFoundCount}`)
}

async function main(targetDir, blk = 0) {
  const list = fs.readdirSync(targetDir)

  totalFoundCount += list.length

  for (const fn of list) {
  // list.forEach(async fn => {
    const fnColorBad = chalk.magentaBright(fn)

    if (fn[0] === '.') {
      nowScannedPosition++
      // console.log(`ignore hidden file: ${fnColorBad} ${progress()}`)
      continue
    }

    const fp = `${targetDir}/${fn}`
    const fstat = await fs.promises.stat(fp)
    const fsize = hs(fstat.size)

    const fnColor = chalk.blueBright(fn)
    const fnColorGood = chalk.greenBright(fn)
    const fsizeColor = chalk.rgb(221, 220, 178).italic(fsize)

    if (fstat.isDirectory()) {
      console.log(`cd->: ${fnColor}`)
      nowScannedPosition++

      await main(fp, blk + 2)
    }
    else if (!fn.toLowerCase().includes('.txt')) {
      console.log(`file: ${fnColorBad} not a file meet '*.txt' ${progress()}`)
    }
    else {
      const fbuf = await fs.promises.readFile(fp)
      const mpecd = getMostPossibleEncoding(fbuf)

      if (mpecd === 'UTF-8') {
        console.log(`${' '.repeat(blk)}jump: ${fnColorGood}, already been ${UTF_color} ${progress()}`)
        // console.log(fbuf.toString().substr(0, 4))
        if (fbuf[0] === 0xef && fbuf[1] === 0xbb && fbuf[2] === 0xbf) {
          await fs.promises.writeFile(fp, stripBomBuffer(fbuf))
        }
      }
      else if (mpecd === 'Big5' || mpecd === 'GB18030') {
        console.log(`${' '.repeat(blk)}proc: ${fnColor}, rewrite from ${GBK_color} -> ${UTF_color} ${fsizeColor} ${progress()}`)
        await fs.promises.writeFile(fp, stripBom(iconv.decode(fbuf, 'GBK')))
      }
      else if (mpecd.includes('UTF-16')) {
        console.log(`${' '.repeat(blk)}proc: ${fnColor}, rewrite from ${UTF16_color} -> ${UTF_color} ${fsizeColor} ${progress()}`)
        await fs.promises.writeFile(fp, stripBom(iconv.decode(fbuf, mpecd)))
      }
      else {
        console.log(`${' '.repeat(blk)}try proc: ${fnColor}, rewrite from ${chalk.yellowBright(mpecd)} -> ${UTF_color} ${fsizeColor} ${progress()}`)
        let decodedStr = ''
        try {
          decodedStr = iconv.decode(fbuf, mpecd)
        } catch (err) {
          console.log(chalk.redBright(`error while converting file: ${fnColorBad}`))
          console.error(err)
          continue
        }
        await fs.promises.writeFile(fp, stripBom(decodedStr))
      }
      // else {
      //   console.log(`${' '.repeat(blk)}file: ${fnColorBad} jumped, not a GBK file, may be ${chalk.yellowBright(mpecd)} ${progress()}`)
      // }
    }
  // })
  }
}

main(dir)

// function temp(d) {
//   let k = ''
//   const list = fs.readdirSync(d)
//   list.forEach(async (fn, i) => {
//     if (fn[0] === '.') return

//     const fp = `${d}/${fn}`
//     const fcnt = (await fs.promises.readFile(fp)).toString()
    
//     // const head = fcnt.substr(0, 394)
//     // const body = fcnt.substr(393)
//     const title = fcnt.substr(393).split(/[\r\n]/)[0].trim().replace(/[\.\*\?\$&/<>@#()|;'"“”]/g, ' ')
//     await Promise.all([fs.promises.unlink(fp), fs.promises.writeFile(`${d}/${title}.txt`, fcnt)])
//   })
// }

// temp(dir)
