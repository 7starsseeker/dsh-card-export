#!/usr/bin/env node
/** 列出会话里「含图片」的轮次，供图片导出测试选范围。 */
import { readSession } from '../lib/modes/transcript.mjs'

const s = readSession(process.argv[2])
const byTurn = new Map()
for (const it of s.items) {
  if (it.kind !== 'image') continue
  const t = it.turn ?? '(无轮次)'
  if (!byTurn.has(t)) byTurn.set(t, [])
  byTurn.get(t).push({ name: it.name, w: it.width, h: it.height, bytes: it.bytes })
}
const turns = [...byTurn.keys()].sort((a, b) => (a === '(无轮次)' ? 1 : b === '(无轮次)' ? -1 : a - b))
console.log('总图片数:', s.items.filter((i) => i.kind === 'image').length, '分布轮次:', turns.length)
for (const t of turns) {
  const list = byTurn.get(t)
  console.log(`  第 ${t} 轮: ${list.length} 张 —`, list.slice(0, 3).map((x) => `${x.name || '(无名)'} ${x.w}×${x.h}`).join(', '))
}
