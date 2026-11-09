#!/usr/bin/env node
/** 查看关键事件的 data 结构（用户/助手消息、思考块、工具调用）。 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const buf = readFileSync(process.argv[2])
const lines = zstdDecompressSync(buf).toString('utf8').split('\n').filter(Boolean)
const objs = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const clip = (v, n = 300) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > n ? s.slice(0, n) + '…' : s
}

for (const t of ['user/message', 'assistant/message', 'system/message', 'tool/call', 'tool/result', 'session/title']) {
  const sample = objs.filter((o) => o.type === t).slice(0, 2)
  console.log(`\n===== ${t}（${objs.filter((o) => o.type === t).length} 条）=====`)
  for (const s of sample) {
    console.log('  seq=' + s.seq, 'time=' + s.time)
    console.log('  data keys:', Object.keys(s.data || {}).join(', '))
    console.log('  data:', clip(s.data))
    // 若是 parts 数组，列出每部分的类型
    const parts = s.data?.parts || s.data?.message?.parts || s.data?.content
    if (Array.isArray(parts)) {
      console.log('  parts:', parts.map((p, i) => `${i}:${p.type || p.kind || '?'}`).join(' '))
      for (const p of parts.slice(0, 3)) console.log('    -', p.type, clip(p.text ?? p.content ?? p, 160))
    }
  }
}
