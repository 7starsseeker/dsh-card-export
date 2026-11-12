#!/usr/bin/env node
/**
 * fact-check 2.0.0 契约回归（离线，不联网、不花钱）。
 *
 * 2.0.0 把 fact-check 从「一个核查流程」改成「定型 → 取证 → 分型输出」：一份文档现在
 * 可以同时带裁决骨架与其它五个骨架（Step 4c 多产物编排），报告开头还可能带定型卡 /
 * 改型声明。这里锁住三件事：
 *
 *   1. 三个出图锚点逐字未变——改写它们会让本插件静默退化成普通文档；
 *   2. 裁决报告不再被「为什么会这样」冤枉成缺段（该段在模板里写明可选）；
 *   3. 非裁决段与报告开头的前置块，都按原文进了图，没有被静默丢弃。
 *
 * 来源：fact-check v2.0.0 的 SKILL.md（§4-V 模板逐字固定）与 reference/i18n.md。
 */
import { readFileSync } from 'node:fs'
import { looksLikeFactCheck, buildReport } from '../lib/modes/report.mjs'
import { parseReport, renderDetail, renderCover } from '../lib/modes/verdict.mjs'
import { HEADINGS } from '../lib/modes/i18n.mjs'
import { loadTable, normalizeTable, stripTailParen, detectSkeleton, BUILTIN_TABLE } from '../lib/modes/skeletons.mjs'

let pass = 0
let fail = 0
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`✓ ${name}`) }
  else { fail++; console.log(`✗ ${name}${detail ? ' — ' + detail : ''}`) }
}
const read = (f) => readFileSync(new URL('../cases/' + f, import.meta.url), 'utf8')

/** 与 tools/_audit-coverage.mjs 同一套归一化：只比「字」，不比标记与标点。 */
const norm = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')
  .replace(/[\s*`|>#\-—–·\[\]]+/g, '')
  .replace(/[（）()：:，,、；;。.！!？?"'“”‘’…]+/g, '')
  .toLowerCase()

/** 按 ## 切原文，返回 [{title, lines}]。 */
function sections(md) {
  const out = []
  let cur = null
  for (const line of String(md).split('\n')) {
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) { cur = { title: h2[1].trim(), lines: [] }; out.push(cur); continue }
    if (/^#\s/.test(line)) { cur = null; continue }
    if (cur) cur.lines.push(line)
  }
  return out
}

const normLines = (lines) => lines
  .map((l) => l.replace(/https?:\/\/\S+/g, '').trim())
  .filter((l) => l && !/^-{3,}$/.test(l) && !/^\|?\s*:?-{2,}/.test(l))

/* ---------------- 1. 锚点契约：三个标题必须逐字还是那三个 ---------------- */

const ANCHORS = [
  ['一句话结论', 'summary'],
  ['哪些是真的、哪些是假的', 'facts'],
  ['来源（编号附录）', 'sources'],
]
for (const [title, key] of ANCHORS) {
  check(`锚点 ${key} 认「${title}」`, HEADINGS[key].zh.test(title))
}
const anchorMd = ANCHORS.map(([t]) => `## ${t}\n正文`).join('\n\n')
check('三段锚点齐全 → 判为裁决报告', looksLikeFactCheck(anchorMd))
check('只剩一段锚点 → 不判为裁决', !looksLikeFactCheck('## 来源（编号附录）\n- [1] a'))
check('两段锚点就够（两段起算，不需要三段）',
  looksLikeFactCheck('## 一句话结论\n**已证实 / 高**\n\n## 来源（编号附录）\n- [1] a https://example.com'))
// 这条锁的是「改写标题会静默退化」这个真实风险：三个锚点里改掉两个，卡片就没了。
check('把两个锚点改写成近义词 → 静默退化成普通文档', !looksLikeFactCheck(
  '## 一句话看法\n正文\n\n## 真真假假\n正文\n\n## 来源（编号附录）\n- [1] a'))

/* ---------------- 2. 纯 4-V：不缺段、不外加附录 ---------------- */

const vMd = read('fc-2.0.0-verdict.md')
check('纯 4-V 判为裁决报告', looksLikeFactCheck(vMd))
const v = parseReport(vMd)
check('「为什么会这样」缺省不算缺段', v.missing.length === 0, JSON.stringify(v.missing))
check('纯 4-V 不产生附录', v.extra.length === 0, JSON.stringify(v.extra.map((e) => e.title)))
const vHtml = renderDetail(v)
check('纯 4-V 图上不出现附录标记', !/附 1/.test(vHtml))
check('纯 4-V 图上不出现缺段提示', !/缺以下段落/.test(vHtml))
for (const [title] of ANCHORS.slice(1)) {
  check(`纯 4-V 保留了「${title}」`, norm(vHtml).includes(norm(title)))
}

/* ---------------- 2b. 03 允许普通段落：不能被 parseViews 静默丢掉 ---------------- */

const proseViewsMd = [
  '# X',
  '',
  '## 一句话结论',
  '**证伪** · 置信度 中',
  '',
  '## 哪些是真的、哪些是假的',
  '- 甲',
  '',
  '## 国内外视角',
  '**国内渠道**：这是普通段落，不是项目符号。',
  '',
  '**差异说明**：第二段也必须保留。',
  '',
  '## 来源（编号附录）',
  '- [1] a',
].join('\n')
const pv = parseReport(proseViewsMd)
const pvHtml = renderDetail(pv)
check('03 普通段落不被静默丢掉', pvHtml.includes('这是普通段落'))
check('03 普通段落的后续段落也保留', pvHtml.includes('第二段也必须保留'))

/* ---------------- 2c. 长图也要有「一句话结论」：不能只留一个档位徽标 ---------------- */

const judgeMd = [
  '# X',
  '',
  '## 一句话结论',
  '**证伪** · 置信度 中',
  '',
  '**问一 · 有没有关系**：不成立。',
  '',
  '**问二 · 为什么是现在**：三个爆点叠加。',
  '',
  '## 始末 / 事实概要',
  '甲。',
  '',
  '## 哪些是真的、哪些是假的',
  '- 甲',
  '',
  '## 来源（编号附录）',
  '- [1] a',
].join('\n')
const jd = parseReport(judgeMd)
const jdHtml = renderDetail(jd)
check('长图也渲染一句话结论', /class="djudge"/.test(jdHtml) && jdHtml.includes('问一') && jdHtml.includes('问二'))

/* ---------------- 3. 前置块：定型卡 / 改型声明按原文进图 ---------------- */

const pMd = read('fc-2.0.0-preamble.md')
const p = parseReport(pMd)
check('识别出报告开头的前置块', !!p.preamble)
check('前置块里有改型声明', /指标卡 → 裁决/.test(p.preamble))
const pHtml = renderDetail(p)
check('定型卡进了图（没有被静默丢掉）', pHtml.includes('拆出 9 个作业单元'))
check('改型声明进了图', pHtml.includes('指标卡 → 裁决'))
check('前置块加了标签', /定型与前置声明/.test(pHtml))
check('没有定型标记的随意前言不画上图', (() => {
  const q = parseReport('随便一句开场白\n\n## 一句话结论\n**已证实 / 高**\n\n## 哪些是真的、哪些是假的\n- 甲\n\n## 来源（编号附录）\n- [1] a https://example.com\n')
  return q.preamble === '' && !renderDetail(q).includes('随便一句开场白')
})())

/* ---------------- 3b. 原始提问：报告与两张图都要出现 ---------------- */

const qMd = [
  '# X',
  '',
  '> **原始提问**：黄仁勋这件事和中期选举有没有关系？',
  '',
  '**核查口径**：公开信息判定。',
  '',
  '## 一句话结论',
  '**证伪** · 置信度 中',
  '',
  '## 哪些是真的、哪些是假的',
  '- 甲',
  '',
  '## 来源（编号附录）',
  '- [1] a https://example.com',
].join('\n')
const q = parseReport(qMd)
check('解析出原始提问', q.question === '黄仁勋这件事和中期选举有没有关系？', q.question)
check('原始提问不重复留在前置块', !q.preamble.includes('原始提问'), q.preamble)
const qCover = renderCover(q)
const qDetail = renderDetail(q)
check('短图渲染原始提问', /class="q"/.test(qCover) && qCover.includes('黄仁勋这件事和中期选举有没有关系'))
check('长图渲染原始提问', /class="q"/.test(qDetail) && qDetail.includes('黄仁勋这件事和中期选举有没有关系'))

const qEnMd = [
  '# X',
  '',
  '> **Original question**: Is the Huang scandal connected to the midterms?',
  '',
  '**Checked on**: 2026-11-12.',
  '',
  '## 一句话结论',
  '**证伪** · 置信度 中',
  '',
  '## 哪些是真的、哪些是假的',
  '- 甲',
  '',
  '## 来源（编号附录）',
  '- [1] a https://example.com',
].join('\n')
const qEn = parseReport(qEnMd, { lang: 'en' })
check('英文原始提问也能解析', qEn.question === 'Is the Huang scandal connected to the midterms?', qEn.question)
check('英文原始提问也渲染到短图', renderCover(qEn).includes('Is the Huang scandal connected to the midterms?'))
check('英文原始提问也渲染到长图', renderDetail(qEn).includes('Is the Huang scandal connected to the midterms?'))

/* ---------------- 4. 多产物编排：非裁决段按原文附在末尾 ---------------- */

const mMd = read('fc-2.0.0-merged.md')
check('「总览 + 裁决 + 地图」判为裁决报告', looksLikeFactCheck(mMd))
const m = parseReport(mMd)
const extraTitles = m.extra.map((e) => e.title)
check('非裁决段全部收进 extra（7 段）', m.extra.length === 7, JSON.stringify(extraTitles))
const mHtml = renderDetail(m)
check('长图末尾有附录标记', /附 1/.test(mHtml) && /附 7/.test(mHtml))
check('首图提示另有非裁决内容', /另有 7 段/.test(buildReport(mMd, { preset: 'auto' }).pages[0].html))

// 逐行核对：非裁决段的每一行都必须出现在长图上（这就是「静默丢内容」的判据）
const rendered = norm(mHtml)
let total = 0
let missed = 0
const missedSample = []
for (const sec of sections(mMd)) {
  if (!extraTitles.includes(sec.title)) continue   // 只查附录段；裁决段有自己的排版（分档徽标）会改写粗体标签
  for (const line of normLines(sec.lines)) {
    total++
    if (!rendered.includes(norm(line))) { missed++; if (missedSample.length < 3) missedSample.push(`${sec.title}: ${line.slice(0, 30)}`) }
  }
}
check(`附录段逐行落图 ${total - missed}/${total}`, missed === 0, missedSample.join(' / '))
check('附录段的标题也进了图', extraTitles.every((t) => rendered.includes(norm(t))))

/* ---------------- 5. 其它骨架不误判 ---------------- */

// 释义骨架：只有「来源」一个锚点，必须走普通文档，不能被误判成裁决（fact-check 2.0.0
// SKILL.md 明确要求「不要给其它骨架自创锚点」，否则释义报告会被渲染成带档位徽标的判决书）。
const eMd = [
  '# 「量子纠缠」是什么',
  '## 一句话定义', '量子纠缠是两个或多个量子系统之间不存在独立个体状态的关系。',
  '## 规范定义（权威原文）', 'GB/T 与 ISO/IEC 都给出「不可分离性」的定义。',
  '## 常见误解', '误解一：纠缠＝心灵感应。',
  '## 来源', '- [1] 国家标准全文公开系统 https://example.com/gb',
].join('\n')
check('释义骨架（只有 来源 一个锚点）不判为裁决', !looksLikeFactCheck(eMd))
check('释义骨架按普通文档出两张图，内容不丢', (() => {
  const r = buildReport(eMd, { preset: 'auto' })
  const html = r.pages.map((p) => p.html).join('\n')
  return r.pages.length === 2 && norm(html).includes(norm('量子纠缠是两个或多个量子系统之间不存在独立个体状态的关系'))
})())

/* ---------------- 6. 非裁决骨架：首图导语 + 详图强化要素 ---------------- */

/** 逐行核对普通文档长图：每一行的每个片段都必须落在图上。
 *  强化块会调换「标签 / 内容」的顺序（数字卡把值放上面、标签放下面），所以整行对不上时
 *  再按第一个冒号拆两半分别核对——文字都在，只是换了摆法。 */
function coverageOf(md) {
  const full = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'full').html
  // 两边都去掉 URL：普通文档会把来源里的 URL 原样印出来，而这里比的是「字」。
  const rendered = norm(full.replace(/https?:\/\/\S+/g, ''))
  let total = 0
  let missed = 0
  const sample = []
  for (const sec of sections(md)) {
    for (const line of normLines(sec.lines)) {
      total++
      const whole = norm(line)
      if (rendered.includes(whole)) continue
      const m = line.match(/^(.*?)[：:]\s*(.+)$/)
      if (m && rendered.includes(norm(m[1])) && rendered.includes(norm(m[2]))) continue
      missed++
      if (sample.length < 3) sample.push(`${sec.title}: ${line.slice(0, 26)}`)
    }
  }
  return { total, missed, sample }
}

const SK = [
  { file: 'fc-2.0.0-definition.md', name: '释义', lead: '一句话定义', sentence: '量子纠缠是两个或多个量子系统',
    detail: [/class="fact ban"/], detailName: '常见误解（灰底块）' },
  { file: 'fc-2.0.0-map.md', name: '地图', lead: '核心发现', sentence: '前三家合计占据约八成份额',
    detail: [/class="rail"/, /class="rail"/, /class="rail"/], detailName: '确定性分层（3 条分层条）' },
  { file: 'fc-2.0.0-metric.md', name: '指标卡', lead: '数值', sentence: '120 万套',
    detail: [/class="num"/, /class="num"/], detailName: '数值（2 张数字卡）' },
]

for (const s of SK) {
  const md = read(s.file)
  check(`${s.name}：不判为裁决报告`, !looksLikeFactCheck(md))
  const r = buildReport(md, { preset: 'auto' })
  const sum = r.pages.find((p) => p.kind === 'summary').html
  const fullH = r.pages.find((p) => p.kind === 'full').html
  check(`${s.name}：首图标签写「${s.name} · ${s.lead}」`, sum.includes(`${s.name} · ${s.lead}`))
  check(`${s.name}：首图抬的是该骨架的结论段`, norm(sum).includes(norm(s.sentence)))
  const hits = s.detail.every((re) => re.test(fullH))
  check(`${s.name}：详图有${s.detailName}`, hits)
  const cov = coverageOf(md)
  check(`${s.name}：详图逐行不丢（${cov.total - cov.missed}/${cov.total}）`, cov.missed === 0, cov.sample.join(' / '))
}

// 只命中一段特征标题时不许认骨架——共享标题（`边界`、`缺口`）单段出现很常见
check('只命中一段特征标题 → 不认骨架（不冒充结论卡）', (() => {
  const md = '# X\n\n## 常见误解\n- 甲\n\n## 其它\n内容\n'
  const sum = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'summary').html
  return !sum.includes('释义 ·')
})())

// 裁决报告不该被别的骨架抢走标签
check('裁决报告的首图仍是档位卡，不是骨架导语', (() => {
  const md = read('fc-2.0.0-verdict.md')
  const sum = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'summary').html
  return /vbadge/.test(sum) && !/释义 ·|地图 ·|指标卡 ·/.test(sum)
})())

/* ---------------- 7. 锚点表：上游优先、内置兜底、共享标题排除 ---------------- */

const T = loadTable({ force: true })
check('表来源是 upstream 或 builtin（不会崩）', T.source === 'upstream' || T.source === 'builtin', T.reason)
check('表里有六个骨架', T.skeletons.length === 6, T.skeletons.map((s) => s.id).join(','))
check('只有裁决带 exportCard', T.skeletons.filter((s) => s.exportCard).map((s) => s.id).join(',') === 'verdict')

// 内置表必须与上游表同内容：否则「读不到表」的机器会得到另一种行为
const normOf = (t) => JSON.stringify(normalizeTable(t)?.skeletons)
if (T.source === 'upstream') {
  check('内置表与上游表逐字段一致（降级后行为相同）', normOf(BUILTIN_TABLE) === JSON.stringify(T.skeletons))
} else {
  check('未装上游表时用内置表（跳过一致性比对）', true)
}

check('matchRule 不认识时拒绝整张表', normalizeTable({ matchRule: 'fuzzy', skeletons: [{ id: 'x', match: ['a'] }] }) === null)
check('空骨架表被拒绝', normalizeTable({ matchRule: 'stripTrailingParenThenExact', skeletons: [] }) === null)

// 剥末尾括号说明（可叠加，全角半角都认）
const stripCases = [
  ['规范定义（权威原文）', '规范定义'],
  ['建议（须标明是建议）', '建议'],
  ['机制解释（本骨架必写，不是可选项）', '机制解释'],
  ['边界与反例', '边界与反例'],
  ['Sources (numbered appendix)', 'Sources'],
]
for (const [i, o] of stripCases) check(`剥括号「${i}」→「${o}」`, stripTailParen(i) === o)

// 共享标题：只留裁决，其余骨架一个都不许拿来认领
const byId = (id) => T.skeletons.find((s) => s.id === id)
check('裁决保留「来源」锚点', byId('verdict').match.includes('来源'))
for (const id of ['definition', 'compare', 'map']) {
  check(`${id} 不得用「来源」认领`, !byId(id).match.includes('来源') && !byId(id).matchEn.includes('Sources'))
}
for (const id of ['causal', 'metric']) {
  check(`${id} 不得用「定界」认领`, !byId(id).match.includes('定界') && !byId(id).matchEn.includes('Scope'))
}
check('map / metric 不得用「缺口」认领',
  !byId('map').match.includes('缺口') && !byId('metric').match.includes('缺口'))
check('compare / causal 不得用「可比性检验」认领',
  !byId('compare').match.includes('可比性检验') && !byId('causal').match.includes('可比性检验'))

// 交接工单点名的坑：4-E / 4-M / 4-S 正文里确实有 `## 来源`
const TRAPS = {
  '只有「边界与反例」+ 一个释义特征': '# X\n\n## 边界与反例\n- 甲\n\n## 常见误解\n- 乙\n',
  '全是共享标题（来源/定界/缺口/可比性检验）': '# X\n\n## 来源\n- a\n\n## 定界\n- b\n\n## 缺口\n- c\n\n## 可比性检验\n- d\n',
  '指标卡只有一个特征（数值 + 来源）': '# X\n\n## 数值\n- a\n\n## 来源\n- b\n',
}
for (const [name, md] of Object.entries(TRAPS)) {
  check(`陷阱：${name} → 不认骨架`, detectSkeleton(md) === null, JSON.stringify(detectSkeleton(md)?.id))
}

/* ---------------- 汇总 ---------------- */

console.log(`\n${pass} 通过，${fail} 失败（共 ${pass + fail} 项）`)
process.exit(fail === 0 ? 0 : 1)
