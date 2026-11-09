#!/usr/bin/env node
/** 裁切能力自测：找线 → 按线切 → 校验段数与总高、接缝处不带线。 */
import { mkdtempSync, rmSync, appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPng, findSeparatorRows, cutAt, writePngRows } from '../lib/render/png.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const LINE = [226, 229, 233]
const tmp = mkdtempSync(join(tmpdir(), 'card-crop-'))

/** 造一张 200x(rows) 的图：每 400 行埋一条分隔线 */
function makePng(file, H, width = 200, bpp = 3) {
  const img = { width, height: H, bpp, pixels: Buffer.alloc(width * bpp * H) }
  for (let y = 0; y < H; y++) {
    const isLine = y % 400 === 200
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * bpp
      if (isLine) { img.pixels[i] = LINE[0]; img.pixels[i + 1] = LINE[1]; img.pixels[i + 2] = LINE[2] }
      else { img.pixels[i] = 250; img.pixels[i + 1] = 250; img.pixels[i + 2] = 248 }
      if (bpp === 4) img.pixels[i + 3] = 255
    }
  }
  // 用 writePngRows 落盘（整图区间）
  writePngRows(file, img, 0, H)
  return img
}

console.log('找分隔线：')
const src = join(tmp, 'strip.png')
makePng(src, 2000)
const img = readPng(src)
const lines = findSeparatorRows(img)
check('识别出 5 条线（y=200,600,1000,1400,1800）', lines.length === 5, JSON.stringify(lines.map((l) => l.y)))
check('线位置准确', lines.map((l) => l.y).join(',') === '200,600,1000,1400,1800', lines.map((l) => l.y).join(','))
check('每条线只占 1 行', lines.every((l) => l.rows === 1), JSON.stringify(lines))

console.log('\n按线裁切：')
const out = []
const parts = cutAt(src, [lines[1].y, lines[3].y], (i) => {
  const p = join(tmp, `part${i}.png`); out.push(p); return p
})
check('切成 3 段', parts.length === 3, String(parts.length))
check('段高之和 = 原高 − 被丢弃的线行', parts.reduce((s, p) => s + p.height, 0) === 2000 - 2 * 2,
  parts.map((p) => p.height).join('+'))
check('第一段止于切线之前', parts[0].toY === lines[1].y - 1, `${parts[0].toY} vs ${lines[1].y - 1}`)
check('第二段从线的下一行开始', parts[1].fromY === lines[1].y + 1, `${parts[1].fromY} vs ${lines[1].y + 1}`)

const p2 = readPng(parts[1].path)
const row0 = p2.pixels.subarray(0, p2.width * p2.bpp)
let isLineAtTop = true
for (let x = 0; x < p2.width; x++) {
  const i = x * p2.bpp
  if (Math.abs(row0[i] - LINE[0]) > 3) { isLineAtTop = false; break }
}
check('第二段首行不是分隔线（接缝已去掉）', !isLineAtTop)
check('每段仍是合法 PNG', out.every((p) => { try { readPng(p); return true } catch { return false } }))

console.log('\n边界：')
check('空切点 → 1 段（不擅自切）', cutAt(src, [], (i) => join(tmp, `x${i}.png`)).length === 1)
check('越界切点被忽略', cutAt(src, [0, 99999], (i) => join(tmp, `y${i}.png`)).length === 1)
const noLine = join(tmp, 'plain.png')
writeFileSync(noLine, 'x')
let threw = false
try { readPng(noLine) } catch { threw = true }
check('非 PNG 明确报错', threw)

console.log('\n确认闸门（默认只出整张）：')
{
  const { execFileSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('./crop-image.mjs', import.meta.url))
  const outDir = join(tmp, 'blocked')
  let code = 0, msg = ''
  try {
    execFileSync(process.execPath, [cli, src, '--at', '2', '--out', outDir], { encoding: 'utf8', stdio: 'pipe' })
  } catch (e) {
    code = e.status
    msg = String(e.stderr || '')
  }
  check('不带 --confirmed 时退出码非 0', code !== 0, String(code))
  check('提示要先去问用户', /用户确认|先.*问用户/.test(msg), msg.slice(0, 60))
  const { existsSync } = await import('node:fs')
  check('拒绝时不产出任何文件', !existsSync(outDir))

  let okCode = 0
  try {
    execFileSync(process.execPath, [cli, src, '--at', '2', '--out', outDir, '--confirmed'], { encoding: 'utf8', stdio: 'pipe' })
  } catch (e) { okCode = e.status }
  check('带 --confirmed 才真的裁', okCode === 0 && existsSync(outDir), String(okCode))
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
