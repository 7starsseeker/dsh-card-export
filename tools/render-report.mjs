#!/usr/bin/env node
/**
 * render-report — 任意 Markdown 报告 → 图片。
 *
 *   node tools/render-report.mjs <report.md> --out <dir> [--preset auto|factcheck|generic]
 *                                  [--title <标题>] [--lang zh|en] [--png] [--width 960] [--dump]
 *
 * 预设 auto 的判定规则见 lib/modes/report.mjs：三段特征标题全中才算事实核查报告。
 * 语言默认由报告自己的二级标题判定（lib/modes/i18n.mjs）；--lang 只用来强制覆盖。
 * 不带 --png 时只输出 HTML（无浏览器环境也成立）。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { buildReport, PRESETS } from '../lib/modes/report.mjs'
import { setHtmlPassthrough, detectHtml } from '../lib/modes/markdown.mjs'
import { render } from '../lib/render/rasterize.mjs'
import { readPng, findSeparatorRows } from '../lib/render/png.mjs'

/** 读图找分隔线位置（CSS px），只读，不改图。失败返回空数组。 */
function separatorLines(file) {
  try {
    const img = readPng(file)
    return findSeparatorRows(img).map((l, i) => ({ index: i + 1, cssY: Math.round(l.y / 2) }))
  } catch { return [] }
}

/** 超过这个高度就提示「可以分页」。默认分页是关的，只在提示里给出命令。 */
const SUGGEST_SPLIT_PX = 12000

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

if (!files[0] || (!opt.out && opt.preflight !== true)) {
  console.error('用法: node tools/render-report.mjs <report.md> --out <dir> [--preset auto|report|generic] [--title T] [--lang zh|en] [--brief brief.json] [--png] [--width 960] [--html on|off] [--preflight] [--dump]')
  process.exit(2)
}
if (opt.preset && !PRESETS.includes(opt.preset)) {
  console.error(`--preset 只接受：${PRESETS.join(' | ')}`)
  process.exit(2)
}
if (opt.lang && opt.lang !== 'zh' && opt.lang !== 'en') {
  console.error('--lang 只接受：zh | en（默认按报告标题自动判定）')
  process.exit(2)
}

// 摘要由模型读完报告后撰写；渲染器只负责排版。没有 brief 时退化为「原文提取」。
let brief = null
if (opt.brief) {
  const bf = resolve(String(opt.brief))
  if (!existsSync(bf)) { console.error(`brief 文件不存在：${bf}`); process.exit(2) }
  try { brief = JSON.parse(readFileSync(bf, 'utf8')) } catch (e) {
    console.error(`brief 不是合法 JSON：${e.message}`)
    process.exit(2)
  }
}

const md = readFileSync(resolve(files[0]), 'utf8')

// ── HTML 直通：出图前先问，不擅自决定 ────────────────────────────────
// 文档里的原始 HTML 会在本机 headless 浏览器里真的执行，所以默认不猜：
//   --html on   → 允许生效（用户已确认这是可信文档）
//   --html off  → 全部字面（等价旧 --no-html）
//   都没给      → 若检测到 HTML，**不出图**，返回问句让调用方去问用户
const htmlInfo = detectHtml(md)
const htmlChoice = opt.html === 'on' ? 'on' : (opt.html === 'off' || opt['no-html'] === true ? 'off' : null)
if (opt.html && opt.html !== 'on' && opt.html !== 'off') {
  console.error('--html 只接受 on | off'); process.exit(2)
}

if (opt.preflight === true) {
  console.log(JSON.stringify({ preflight: true, html: htmlInfo }, null, 2))
  process.exit(0)
}

if (htmlChoice === null && htmlInfo.found) {
  // 关键：这里**不产出任何文件**。把问句交回去，由技能在对话里问用户。
  const parts = []
  if (htmlInfo.summary.math.count) parts.push(`MathML 公式 ${htmlInfo.summary.math.count} 个标签`)
  if (htmlInfo.summary.style.count) parts.push(`排版标签 ${htmlInfo.summary.style.count} 个（${Object.keys(htmlInfo.summary.style.tags).map((t) => `<${t}>`).join(' ')}）`)
  if (htmlInfo.summary.other.count) parts.push(`其他标签 ${htmlInfo.summary.other.count} 个`)
  if (htmlInfo.summary.active.count) parts.push(`⚠ 可执行/外链标签 ${htmlInfo.summary.active.count} 个（${Object.keys(htmlInfo.summary.active.tags).map((t) => `<${t}>`).join(' ')}）`)
  console.log(JSON.stringify({
    htmlAsk: {
      detected: htmlInfo.count,
      breakdown: parts,
      samples: htmlInfo.samples,
      hasActive: htmlInfo.hasActive,
      question: `这份文档里有原始 HTML（${parts.join('；')}）。要让它们真的生效吗？`
        + '生效意味着这些标签会在本机浏览器里渲染并执行；'
        + (htmlInfo.hasActive ? '检测到可执行/外链标签，除非你完全确信来源，否则建议选「字面」。' : '只要文档是你自己写的或模型生成的，选「生效」即可。'),
      options: [
        { flag: '--html on', meaning: '生效（彩色文字、<br>、<mark>、MathML 公式会渲染）' },
        { flag: '--html off', meaning: '全部按字面显示（来源不明的文档选这个）' },
      ],
    },
  }, null, 2))
  process.exit(4)
}

const allowHtml = htmlChoice !== 'off'
setHtmlPassthrough(allowHtml)
const built = buildReport(md, { preset: opt.preset, title: opt.title, brief, lang: opt.lang })

if (opt.dump) {
  const info = {
    preset: built.preset,
    kind: built.kind,
    summarySource: built.pages[0]?.authored ? 'brief（模型撰写）' : '原文提取',
    pages: built.pages.map((p) => ({ kind: p.kind, title: p.title, htmlBytes: p.html.length })),
  }
  if (built.preset === 'report' && built.data) {
    info.parsed = {
      lang: built.data.lang,
      title: built.data.title,
      verdict: built.data.verdict.tier,
      confidence: built.data.verdict.conf,
      tiers: built.data.verdict.tiers,
      facts: built.data.facts.length,
      views: built.data.views.length,
      sources: built.data.sources.length,
      unverified: built.data.unverified.length,
      missing: built.data.missing,
    }
  }
  console.log(JSON.stringify(info, null, 2))
  process.exit(0)
}

const outDir = resolve(opt.out)
mkdirSync(outDir, { recursive: true })
const stem = basename(files[0]).replace(/\.md$/i, '')

const result = { preset: built.preset, html: {}, png: {} }
// 出图后要把这条告知用户：HTML 直通是默认行为，它决定了"这份文档里的 HTML 会不会真的生效"
result.htmlPassthrough = allowHtml
  ? {
    on: true,
    note: '本次允许文档里的原始 HTML 生效（彩色文字、<br>、<mark>、MathML 公式等会真的渲染）。'
      + '该能力只用于模型自己产出的或你自己编写的文档——HTML 会在本机浏览器里执行。'
      + '来源不明的文档请加 --no-html 重新导出。',
  }
  : {
    on: false,
    note: '已关闭 HTML 直通（--no-html）：文档里的 HTML 一律按字面显示，不执行。',
  }
for (const p of built.pages) {
  const html = join(outDir, `${stem}.${p.kind}.html`)
  writeFileSync(html, p.html, 'utf8')
  result.html[p.kind] = html
}

if (opt.png) {
  const width = opt.width ? Number(opt.width) : 960
  if (opt.split !== undefined) {
    result.notice = '--split 已取消：多页切分会打断阅读连续性。整张长图按原结构输出，'
      + '转发确有困难时请用 --preset generic 或缩小输入范围。'
  }

  for (const p of built.pages) {
    const out = join(outDir, `${stem}.${p.kind}.png`)
    const r = await render(result.html[p.kind], out, { width })
    result.png[p.kind] = r.ok
      ? { ok: true, path: r.path, mode: r.mode, bytes: r.bytes, height: r.height || null,
        ...(r.heightCorrected ? { heightCorrected: r.heightCorrected } : {}),
        ...(r.degraded ? { degraded: r.degraded } : {}) }
      : { ok: false, error: r.error, fallback: r.fallback, ...(r.path ? { path: r.path } : {}) }

    // 太长时：只报事实 + 给出线位置，由人决定裁不裁（不自动裁）
    const px = r.ok && r.height ? r.height : 0   // r.height 已是 CSS px
    if (px > SUGGEST_SPLIT_PX && r.ok) {
      const lines = separatorLines(r.path)
      result.warning = `长图高 ${px}px（≈${Math.round(px * 1.4 / 100)} 屏）：转发时多数客户端会压缩。`
        + `图中有 ${lines.length} 条分隔线，可以沿它们裁开。`
      result.tooLong = {
        heightPx: px,
        cutLines: lines,
        ask: `这张长图 ${px}px，是否太长？要按分隔线切成多段的话，告诉我目标高度（例如"每段 5000px 左右"）或直接说切几段。`,
        how: 'node tools/crop-image.mjs <图> --at <线序号,逗号分隔> 或 --max <目标高度>',
      }
    }
  }
}

console.log(JSON.stringify(result, null, 2))
const pngOk = (v) => Array.isArray(v) ? v.every((x) => x.ok) : (!v || v.ok)
const ok = !opt.png || Object.values(result.png).every(pngOk)
process.exit(ok ? 0 : 1)
