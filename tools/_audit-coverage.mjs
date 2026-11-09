#!/usr/bin/env node
/**
 * 完整性审计：逐个二级小节核对「原文有哪些行、图里落到哪些行」。
 * 目的是抓"静默丢内容"——渲染成功但某段没出现，比排版错更严重。
 *
 * 用法: node tools/_audit-coverage.mjs <报告.md>
 */
import { readFileSync } from 'node:fs'
import { parseReport, renderDetail } from '../lib/modes/verdict.mjs'

const file = process.argv[2]
if (!file) { console.error('用法: node tools/_audit-coverage.mjs <报告.md>'); process.exit(2) }
const md = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

// 归一化：去掉 markdown 记号与所有空白，只比"字"
const norm = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ')
  .replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')   // 列表序号/项目符号不是内容
  .replace(/[\s*`|>#\-—–·\[\]]+/g, '')      // 行内标记与来源角标括号
  .replace(/[（）()：:，,、；;。.！!？?"'“”‘’…]+/g, '')  // 标点不计入比对（改写与原文标点无关）
  .toLowerCase()

const data = parseReport(md)
const html = renderDetail(data)
const rendered = norm(html)

// 按 ## 切原文段
const sections = []
let cur = null
for (const line of md.split('\n')) {
  const h2 = line.match(/^##\s+(.+)$/)
  if (h2) { cur = { title: h2[1].trim(), lines: [] }; sections.push(cur); continue }
  if (/^#\s/.test(line)) { cur = null; continue }
  if (cur) cur.lines.push(line)
}

// 这些段不在详情图里（一句话结论在首图），或图上有意不显示原文（来源只列名称不列 URL）
const SKIP = [/^一句话结论/]
const stripUrl = (s) => s.replace(/https?:\/\/\S+/g, '')

let total = 0, missedTotal = 0
console.log(`审计: ${file}`)
console.log(`渲染后正文长度: ${rendered.length} 字（去标记）\n`)
for (const sec of sections) {
  if (SKIP.some((re) => re.test(sec.title))) { console.log(`- ${sec.title}  （不在详情图，跳过）`); continue }
  const rows = sec.lines
    .map((l) => stripUrl(l.trim()))
    .filter((l) => l && !/^-{3,}$/.test(l) && !/^\|?\s*:?-{2,}/.test(l))
    // 「**甲轨（…）**：」这类纯标签行，图上改写成栏目名，不作为内容比对
    .filter((l) => !/^\*\*[^*]{2,30}[（(][^）)]*[）)][^*]*\*\*[：:]?$/.test(l))
  // 表格行拆成单元格，避免整行过长匹配不上
  const probes = []
  for (const r of rows) {
    const cells = r.includes('|') ? r.replace(/^\||\|$/g, '').split('|') : [r]
    for (const c of cells) {
      const n = norm(c)
      if (n.length >= 6) probes.push({ raw: c.trim(), n })
    }
  }
  const miss = probes.filter((p) => !rendered.includes(p.n))
  total += probes.length
  missedTotal += miss.length
  const pct = probes.length ? Math.round((1 - miss.length / probes.length) * 100) : 100
  const flag = miss.length === 0 ? '✓' : '✗'
  console.log(`${flag} ${sec.title}  覆盖 ${pct}%  (${probes.length - miss.length}/${probes.length})`)
  for (const m of miss.slice(0, 3)) console.log(`     缺: ${m.raw.slice(0, 70)}`)
}
console.log(`\n合计: ${total - missedTotal}/${total} 段文本落在图上（${Math.round((1 - missedTotal / total) * 100)}%）`)
process.exit(missedTotal === 0 ? 0 : 1)
