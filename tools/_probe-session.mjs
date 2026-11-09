#!/usr/bin/env node
/** 探查会话日志：先试整体解压，不行再按 zstd 帧切分解压。 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
const buf = readFileSync(file)

/** 按 zstd 帧魔数切分并逐帧解压（DSH 会话文件是多帧布局）。 */
function splitFrames(b) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const idx = []
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === MAGIC[0] && b[i + 1] === MAGIC[1] && b[i + 2] === MAGIC[2] && b[i + 3] === MAGIC[3]) idx.push(i)
  }
  const out = []
  for (let k = 0; k < idx.length; k++) {
    const start = idx[k]
    const end = k + 1 < idx.length ? idx[k + 1] : b.length
    try { out.push(zstdDecompressSync(b.subarray(start, end))) } catch (e) { out.push(Buffer.from('')) }
  }
  return out
}

let text = ''
try {
  text = zstdDecompressSync(buf).toString('utf8')
} catch (e) {
  console.log('整体解压失败:', e.message)
}
let lines = text.split('\n').filter(Boolean)
console.log('整体解压 → 行数:', lines.length)

if (lines.length <= 1) {
  const frames = splitFrames(buf)
  const parts = frames.map((f) => f.toString('utf8')).join('')
  lines = parts.split('\n').filter(Boolean)
  console.log('逐帧解压 → 帧数:', frames.length, '行数:', lines.length)
}

const types = new Map()
const shapes = new Map()
for (const l of lines) {
  let o
  try { o = JSON.parse(l) } catch { continue }
  const t = o.type || '(无)'
  types.set(t, (types.get(t) || 0) + 1)
  if (!shapes.has(t)) shapes.set(t, Object.keys(o).sort())
}
console.log('\n事件类型:')
for (const [k, v] of [...types].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(v).padStart(5)}  ${k}`)
console.log('\n字段:')
for (const [k, v] of [...shapes].slice(0, 20)) console.log(`  ${k}: ${v.join(', ')}`)

const clip = (o, n = 220) => JSON.stringify(o, (k, v) => typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v)
const objs = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
console.log('\n含 role/text 的样例（前 4 条）:')
objs.filter((o) => o.role || o.message || o.text || o.content).slice(0, 4)
  .forEach((o, i) => console.log(`  [${i}] ${clip(o)}`))
