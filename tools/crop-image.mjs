#!/usr/bin/env node
/**
 * crop-image — 沿图上的分隔线裁切长图。
 *
 * 设计原则（来自用户要求）：
 *   · 不自动决定要不要裁——只提供能力；是否裁、裁几段由人确认。
 *   · 裁切位置取自**渲染时画的分隔线**，所以一定落在内容单元边界。
 *   · 不靠猜：先 `--lines` 列出线位置，确认后再 `--at` 指定切点。
 *
 * 用法：
 *   node tools/crop-image.mjs shot.png --lines
 *   node tools/crop-image.mjs shot.png --at 3,7,11 --confirmed   # 用户确认后才允许裁
 *   node tools/crop-image.mjs shot.png --max 6000 --confirmed
 *   node tools/crop-image.mjs shot.png --every 2 --confirmed
 *
 * 硬约束：**默认只出整张长图**。本工具不带 --confirmed 不会裁任何东西——
 * 因为"要不要切"是用户的决定，不是工具的判断。先问，再裁。
 */
import { readPng, findSeparatorRows, cutAt } from '../lib/render/png.mjs'
import { existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename, extname, resolve } from 'node:path'

const args = process.argv.slice(2)
const flags = new Set()
const opt = {}
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a.startsWith('--')) {
    if (a === '--lines' || a === '--json' || a === '--confirmed') flags.add(a)
    else if (i + 1 < args.length) opt[a.slice(2)] = args[++i]
  }
}
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--lines', '--json'].includes(args[i - 1])))

if (!files.length) {
  console.error('用法: node tools/crop-image.mjs <长图.png> [--lines | --at 3,7 | --max 6000 | --every 2] [--out <目录>]')
  process.exit(2)
}

const src = resolve(files[0])
if (!existsSync(src)) { console.error(`找不到文件: ${src}`); process.exit(2) }

const img = readPng(src)
const lines = findSeparatorRows(img)
const scale = 2   // 渲染默认 2 倍；坐标对外按 CSS px 报，便于和页面数值对照

if (flags.has('--lines')) {
  const out = lines.map((l, i) => ({
    index: i + 1,
    cssY: Math.round(l.y / scale),
    pxY: l.y,
    heightAbove: Math.round(l.y / scale),
  }))
  console.log(JSON.stringify({ file: src, width: img.width, height: img.height,
    cssHeight: Math.round(img.height / scale), lines: out }, null, 2))
  process.exit(0)
}

// 计算切点
let cuts = []
if (opt.at) {
  const idx = opt.at.split(',').map((s) => Number(s.trim())).filter(Boolean)
  for (const i of idx) {
    const l = lines[i - 1]
    if (!l) { console.error(`没有第 ${i} 条分隔线（共 ${lines.length} 条）`); process.exit(2) }
    cuts.push(l.y)
  }
} else if (opt.every) {
  const n = Math.max(1, Number(opt.every))
  for (let i = n; i <= lines.length; i += n) cuts.push(lines[i - 1].y)
} else if (opt.max) {
  // 贪心：每段尽量吃满但不超目标——取「起点之后、仍在目标内」的最后一条线。
  // 某节本身比目标还高时无法再分（节内没有线），如实标记为 oversized，不硬切内容。
  const maxPx = Number(opt.max) * scale
  let start = 0
  let lastFit = null
  for (const l of lines) {
    if (l.y - start <= maxPx) lastFit = l
    else {
      const cut = lastFit || l          // 一节就超目标：只能在这一节末尾切
      cuts.push(cut.y)
      start = cut.y
      lastFit = null
    }
  }
} else {
  console.error('要指定裁法：--at 3,7 | --every 2 | --max 6000（先用 --lines 看有哪些线）')
  process.exit(2)
}

if (!cuts.length) { console.error('没有可用的裁切点（图里可能没有分隔线，或切点不合法）'); process.exit(1) }
cuts = [...new Set(cuts)].sort((a, b) => a - b)

// 硬闸门：没有用户确认就不裁。默认产物永远只有整张长图。
if (!flags.has('--confirmed')) {
  console.error([
    '拒绝执行：裁切需要用户确认。',
    `这张图高 ${Math.round(img.height / scale)}px，共 ${lines.length} 条分隔线，计划切 ${cuts.length} 刀。`,
    '请先把上面这句（高度 / 条数 / 计划）发在对话里问用户，得到"切"的答复后再加 --confirmed 重跑。',
    '默认产物只有整张长图——不要自行改成多张。',
  ].join('\n'))
  process.exit(3)
}

const base = basename(src, extname(src))
const outDir = opt.out ? resolve(opt.out) : dirname(src)
mkdirSync(outDir, { recursive: true })
const parts = cutAt(src, cuts, (i) => join(outDir, `${base}-part${i}.png`))
const targetCss = opt.max ? Number(opt.max) : null
const oversized = targetCss
  ? parts.map((p, i) => ({ part: i + 1, cssHeight: Math.round(p.height / scale) }))
    .filter((p) => p.cssHeight > targetCss)
  : []

console.log(JSON.stringify({
  file: src,
  sourceHeight: img.height,
  cutsPx: cuts,
  targetCss: targetCss || undefined,
  parts: parts.map((p) => ({ part: p.part, path: p.path, height: p.height, cssHeight: Math.round(p.height / scale) })),
  ...(oversized.length
    ? { note: `${oversized.length} 段仍超过目标（${oversized.map((o) => `第 ${o.part} 段 ${o.cssHeight}px`).join('、')}）：该节内部没有分隔线，只能在节末切，不硬切内容。` }
    : {}),
}, null, 2))
process.exit(0)
