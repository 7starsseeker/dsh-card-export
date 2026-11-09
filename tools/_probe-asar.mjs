#!/usr/bin/env node
/** 在 app.asar 里搜折叠相关字符串，取上下文，用来还原客户端的收纳层级。 */
import { openSync, readSync, fstatSync, closeSync } from 'node:fs'

const file = 'T:\\DeepSeek Harness\\resources\\app.asar'
const fd = openSync(file, 'r')
const size = fstatSync(fd).size
const buf = Buffer.allocUnsafe(size)
readSync(fd, buf, 0, size, 0)
closeSync(fd)

const terms = process.argv.slice(2)
for (const term of terms) {
  const needle = Buffer.from(term, 'utf8')
  let hits = 0
  let i = 0
  console.log(`\n===== 「${term}」 =====`)
  while ((i = buf.indexOf(needle, i)) !== -1 && hits < 6) {
    hits++
    const from = Math.max(0, i - 160)
    const to = Math.min(buf.length, i + term.length + 160)
    const ctx = buf.subarray(from, to).toString('utf8').replace(/\s+/g, ' ')
    console.log(`  @${i}: …${ctx}…`)
    i += needle.length
  }
  if (!hits) console.log('  （无命中）')
}
