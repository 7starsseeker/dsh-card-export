#!/usr/bin/env node
/** 查会话日志里图片/附件/表情的表示方式。 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const lines = zstdDecompressSync(readFileSync(process.argv[2])).toString('utf8').split('\n').filter(Boolean)
const objs = lines.map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

const partTypes = new Map()
for (const o of objs) {
  const parts = o.data?.message?.content || o.data?.content || []
  for (const p of parts) if (p && p.type) partTypes.set(p.type, (partTypes.get(p.type) || 0) + 1)
}
console.log('content part 类型分布:', [...partTypes].sort((a, b) => b[1] - a[1]))

// 含 image / file / attachment 字样的 part
const samples = []
for (const o of objs) {
  const parts = o.data?.message?.content || o.data?.content || []
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue
    if (['image', 'file', 'attachment', 'image_url'].includes(p.type) || p.attachmentId || p.mimeType) {
      samples.push({ event: o.type, seq: o.seq, part: p })
    }
  }
}
console.log('\n图片/附件类 part 数量:', samples.length)
for (const s of samples.slice(0, 5)) {
  const p = { ...s.part }
  for (const k of Object.keys(p)) if (typeof p[k] === 'string' && p[k].length > 120) p[k] = p[k].slice(0, 120) + '…'
  console.log(`  [${s.event} #${s.seq}]`, JSON.stringify(p))
}

// 文本里的表情标记 / data URI / attachments 路径
const raw = lines.join('\n')
const counts = {
  emojiMarkers: (raw.match(/\[表情[:：]/g) || []).length,
  dataUri: (raw.match(/data:image\//g) || []).length,
  attachmentPaths: (raw.match(/attachments[\\/]v1[\\/]objects/g) || []).length,
  attachmentIds: (raw.match(/"attachmentId"\s*:/g) || []).length,
}
console.log('\n原始文本里的出现次数:', counts)
const em = [...raw.matchAll(/\[表情[:：]\s*([^\]\n]{0,40})\]/g)].slice(0, 5).map((m) => m[1])
console.log('表情标记样例:', em)
