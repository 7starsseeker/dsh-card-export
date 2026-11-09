#!/usr/bin/env node
/**
 * render-transcript — DSH 会话日志 → 对话长图。
 *
 *   node tools/render-transcript.mjs <session.v4.jsonl.zstd> --out <dir> [--last 3 | --turns 2-5 | --seq 120-260]
 *        [--with-thinking] [--with-tools] [--title T] [--png] [--width 960] [--dump]
 *
 * 不指定范围时导出全部轮次。范围三选一，同时给以 --seq 优先、--turns/--last 兜底（见 selectRange）。
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { readSession, selectRange, renderTranscript } from '../lib/modes/transcript.mjs'
import { render } from '../lib/render/rasterize.mjs'
import { readPng, findSeparatorRows } from '../lib/render/png.mjs'

/** 读图找分隔线位置（CSS px），只读，不改图。失败返回空数组。 */
function separatorLines(file) {
  try {
    const img = readPng(file)
    return findSeparatorRows(img).map((l, i) => ({ index: i + 1, cssY: Math.round(l.y / 2) }))
  } catch { return [] }
}

const argv = process.argv.slice(2)
const opt = {}
const files = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    const k = a.slice(2)
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    opt[k] = v
  } else files.push(a)
}

if (!files[0] || !opt.out) {
  console.error('用法: node tools/render-transcript.mjs <session.v4.jsonl.zstd> --out <dir> [--last N | --turns a-b | --seq a-b] [--with-thinking] [--with-tools] [--title T] [--png] [--width 960] [--dump]')
  process.exit(2)
}
const src = resolve(files[0])
if (!existsSync(src)) { console.error(`会话文件不存在：${src}`); process.exit(2) }

const session = readSession(src)
if (!session.items.length) {
  console.error('该会话没有任何可导出的事件（可能只有会话头，或全部为注入内容）。')
  process.exit(1)
}

const picked = selectRange(session, { last: opt.last, turns: opt.turns, seq: opt.seq, from: opt.from, to: opt.to })
if (picked.error) {
  console.error(`范围定位失败：${picked.error}`)
  console.error('提示：先用 --dump 看有哪些轮次；引用式定位可用消息里的一段原文（至少 4 个字）。')
  process.exit(2)
}
if (!picked.items.length) {
  console.error(`按当前范围没选到任何事件（可用轮次：${session.turns[0]}–${session.turns[session.turns.length - 1]}）。`)
  process.exit(1)
}

const out = renderTranscript(session, picked, {
  title: opt.title,
  level: opt.level,
  withImages: !!opt['with-images'],
  renderUi: opt['no-render-ui'] ? false : undefined,
  withThinking: opt['with-thinking'] === true ? true : undefined,
  withTools: opt['with-tools'] === true ? true : undefined,
  maxChars: opt['max-chars'] === undefined ? undefined : Number(opt['max-chars']),
})

if (opt.dump) {
  console.log(JSON.stringify({
    session: session.meta,
    availableTurns: { from: session.turns[0], to: session.turns[session.turns.length - 1], count: session.turns.length },
    range: picked.range,
    anchors: picked.anchors || null,
    counts: out.counts,
    notes: out.notes,
    images: out.images,
    kinds: session.items.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {}),
  }, null, 2))
  process.exit(0)
}

const outDir = resolve(opt.out)
mkdirSync(outDir, { recursive: true })
const stem = basename(files[0]).replace(/\.jsonl\.zstd$|\.jsonl$|\.zstd$/i, '')
const htmlPath = join(outDir, `${stem}.transcript.html`)
writeFileSync(htmlPath, out.html, 'utf8')

const result = { session: session.meta.title || session.meta.id, range: picked.range, counts: out.counts,
  notes: out.notes, images: out.images, html: htmlPath }

if (opt.png) {
  const width = opt.width ? Number(opt.width) : 960
  if (opt.split !== undefined) {
    result.notice = '--split 已取消：按页切开会把一轮对话拆到两张图里。整张输出，'
      + '轮与轮之间画有分隔线，需要分割时沿它裁。'
  }

  const png = join(outDir, `${stem}.transcript.png`)
  const r = await render(htmlPath, png, { width })
  result.png = r.ok
    ? { ok: true, path: r.path, mode: r.mode, bytes: r.bytes, height: r.height,
      ...(r.heightCorrected ? { heightCorrected: r.heightCorrected } : {}) }
    : { ok: false, error: r.error, fallback: r.fallback }

  if (r.ok && r.height > 12000) {
    const lines = separatorLines(r.path)
    result.warning = `对话长图高 ${r.height}px：转发时客户端会压缩。图中有 ${lines.length} 条分隔线（轮与轮之间）。`
    result.tooLong = {
      heightPx: r.height,
      cutLines: lines,
      ask: `这张对话长图 ${r.height}px，是否太长？要按分隔线切成多段的话，告诉我目标高度或切几段。`,
      how: 'node tools/crop-image.mjs <图> --at <线序号,逗号分隔> 或 --max <目标高度>',
    }
  }
}

console.log(JSON.stringify(result, null, 2))

// 交付说明：图里不放「什么没包含 / 用什么参数能包含」，由 agent 在对话里讲。
if (result.notes?.length) {
  console.error('\n— 需要在对话中告知用户（不在图里）—')
  for (const n of result.notes) console.error(`  · ${n}`)
}
if (result.images && (result.images.omitted || result.images.missing)) {
  console.error(`  · 图中共 ${result.images.omitted} 张图片只显示占位、未内嵌（--with-images 可包含）`)
}

process.exit(!opt.png || result.png.ok ? 0 : 1)
