#!/usr/bin/env node
/**
 * 渲染模式单测：预设识别、generic 结构、缺段处理。不启动浏览器。
 */
import { readFileSync } from 'node:fs'
import { buildReport, looksLikeFactCheck, PRESETS } from '../lib/modes/report.mjs'
import { parseBlocks, outline } from '../lib/modes/markdown.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }
const fc = readFileSync(new URL('../cases/sample-report.md', import.meta.url), 'utf8')
const gen = readFileSync(new URL('../cases/sample-generic.md', import.meta.url), 'utf8')

console.log('两套预设的分发：')
check('事实核查样张被识别', looksLikeFactCheck(fc) === true)
check('普通报告不被识别', looksLikeFactCheck(gen) === false)
check('PRESETS 只有 auto/report/generic', JSON.stringify(PRESETS) === JSON.stringify(['auto', 'report', 'generic']))

const fcAuto = buildReport(fc)
check('事实核查 + auto → preset=report（不是独立预设）', fcAuto.preset === 'report', fcAuto.preset)
check('事实核查 + auto → kind=verdict', fcAuto.kind === 'verdict', fcAuto.kind)
check('事实核查 + auto → 短图+长图',
  fcAuto.pages.map((p) => p.kind).join('+') === 'summary+full', fcAuto.pages.map((p) => p.kind).join('+'))

const genAuto = buildReport(gen)
check('普通报告 + auto → preset=report', genAuto.preset === 'report', genAuto.preset)
check('普通报告 + auto → kind=doc', genAuto.kind === 'doc', genAuto.kind)
check('普通报告 + auto → 也是短图+长图',
  genAuto.pages.map((p) => p.kind).join('+') === 'summary+full', genAuto.pages.map((p) => p.kind).join('+'))

check('强制 generic → kind=flow', buildReport(fc, { preset: 'generic' }).kind === 'flow')
check('强制 report 套在普通文档上 → kind=doc', buildReport(gen, { preset: 'report' }).kind === 'doc')

console.log('\n事实核查产物：')
const r = buildReport(fc)
check('产出 2 页（cover + detail）', r.pages.length === 2, `页数=${r.pages.length}`)
check('第 1 页是短图 summary', r.pages[0].kind === 'summary')
check('第 2 页是长图 full', r.pages[1].kind === 'full')
check('解析出档位', r.data.verdict.tier === '证伪', r.data.verdict.tier)
check('解析出置信度', r.data.verdict.conf === '高', r.data.verdict.conf)
check('甲轨不是空', !!r.data.verdict.railA, r.data.verdict.railA)
check('乙轨已去掉重复标签', !/^乙轨/.test(r.data.verdict.railB), r.data.verdict.railB)
check('断言 5 条', r.data.facts.length === 5, String(r.data.facts.length))
check('来源 6 条', r.data.sources.length === 6, String(r.data.sources.length))
check('无缺失段', r.data.missing.length === 0, JSON.stringify(r.data.missing))
// 分档标签取自报告原文：事实核查模板里这一档写的是「❓ 无法裁定」，
// 语义色仍映射到「无法核实」。断言应跟你实际渲染的标签走，别照预期写死。
check('细节图含各分档标签', ['已证实', '未证实', '无法裁定'].every((t) => r.pages[1].html.includes(t)))
check('禁引用警示出现在细节图', r.pages[1].html.includes('不得在任何转述中被当作事实引用'))

console.log('\n缺段处理：')
const broken = fc.replace(/^## 来源（编号附录）[\s\S]*?(?=^## )/m, '')
const rb = buildReport(broken, { preset: 'report' })
check('缺「来源」时仍能渲染（不崩）', rb.pages.length === 2)
check('缺段被记入 missing', rb.data.missing.includes('sources'), JSON.stringify(rb.data.missing))

console.log('\ngeneric 预设 = 任意内容（含无标题的对话片段）：')
const conv = readFileSync(new URL('../cases/sample-conversation.md', import.meta.url), 'utf8')
const c = buildReport(conv, { preset: 'generic' })
check('无标题内容也能出图', c.pages.length === 1)
check('kind=flow', c.kind === 'flow')
check('不硬编标题（无 <h1>）', !c.pages[0].html.includes('<h1>'))
check('第一段没被吞（当导语吃掉）', c.pages[0].html.includes('用来验证 generic 预设'))
check('引用块保留', c.pages[0].html.includes('<blockquote>'))
check('代码块保留', c.pages[0].html.includes('<pre><code'))
check('列表保留', c.pages[0].html.includes('<ul>'))
check('指定 --title 时才出现标题',
  buildReport(conv, { preset: 'generic', title: '对话摘录' }).pages[0].html.includes('<h1>对话摘录</h1>'))
check('核查报告也能用 generic 输出（不套结论卡）',
  buildReport(fc, { preset: 'generic' }).pages[0].html.includes('哪些是真的'))
check('标题取第一个标题块', genAuto.pages[1].title.includes('技术评审记录'), genAuto.pages[1].title)
check('标题不是正文首段', !genAuto.pages[1].title.includes('本季度评审共覆盖'))

console.log('\n短图两种来源必须可区分：')
const noBrief = buildReport(gen)
check('无 brief → authored=false', noBrief.pages[0].authored === false)
check('无 brief → kicker 标「原文提取」', noBrief.pages[0].html.includes('原文提取'))
check('无 brief → 页脚说明未改写', noBrief.pages[0].html.includes('短图为原文提取'))

const brief = {
  by: '测试',
  conclusion: '这份报告的结论是：拆层比调参更有效。',
  points: ['要点甲', '要点乙', '要点丙'],
  numbers: [{ label: '命中率', value: '61% → 84%' }],
  caveat: '只在单机验证',
}
const withBrief = buildReport(gen, { brief })
check('有 brief → authored=true', withBrief.pages[0].authored === true)
check('有 brief → 结论来自 brief', withBrief.pages[0].html.includes('拆层比调参更有效'))
check('有 brief → 要点渲染成有序列表', withBrief.pages[0].html.includes('要点甲') && withBrief.pages[0].html.includes('<ol class="points">'))
check('有 brief → 关键数字渲染', withBrief.pages[0].html.includes('61% → 84%'))
check('有 brief → 边界说明', withBrief.pages[0].html.includes('只在单机验证'))
check('有 brief → 页脚声明非原文摘录', withBrief.pages[0].html.includes('非原文摘录'))
check('有 brief → 仍出两张图', withBrief.pages.length === 2)

const emptyBrief = buildReport(gen, { brief: { by: 'x' } })
check('空 brief 视为没给（退化为原文提取）', emptyBrief.pages[0].authored === false)

const fcBrief = buildReport(fc, { brief: { conclusion: '核查短图的模型结论', points: ['判断一', '判断二'] } })
check('事实核查 + brief → 判断被覆盖', fcBrief.pages[0].html.includes('判断一'))
check('事实核查 + brief → 档位仍取自报告', fcBrief.pages[0].html.includes('证伪'))
check('事实核查 + brief → 长图不受影响', fcBrief.pages[1].html.includes('哪些是真的'))

console.log('\n分隔线：')
{
  const md = ['# 标题', '', '导语一句。', '', '## 第一节', '', '正文一。', '', '## 第二节', '', '正文二。', '', '## 第三节', '', '正文三。'].join('\n')
  const doc = buildReport(md, { preset: 'report' })
  const full = doc.pages.find((p) => p.kind === 'full')
  const cuts = (full.html.match(/data-cut/g) || []).length
  check('3 个二级小节 → 2 条分隔线', cuts === 2, `实际 ${cuts}`)
  check('分隔线位于两节之间（第二节前有线）', /data-cut[\s\S]{0,80}第二节/.test(full.html))
  check('导语与第一节之间没有分隔线', !/导语一句[\s\S]{0,60}data-cut/.test(full.html))
  const short = doc.pages.find((p) => p.kind === 'summary')
  check('短图不含分隔线', !short || !short.html.includes('data-cut'))
}

console.log('\n核查报告正文里的表格与子标题：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '', '**已证实 / 高**（依据：一手页面）', '',
    '## 始末 / 事实概要', '', '正文一段。', '',
    '### A. 子标题', '',
    '| 项 | 来源 | 强度 |', '|---|---|---|', '| 难度偏低 | GameSpot | 2~3 |', '',
    '## 哪些是真的、哪些是假的', '', '- 甲 | 乙 | 丙', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const doc = buildReport(md, { preset: 'auto' })
  const full = doc.pages.find((p) => p.kind === 'full')
  check('表格渲染成 <table>', full.html.includes('<table'))
  check('表格有表头单元格', /<th>项<\/th>/.test(full.html))
  check('不再出现裸竖线段落', !/<p>\|[^<]{6,}/.test(full.html))
  check('### 子标题渲染成 <h3>', /<h3>A\. 子标题<\/h3>/.test(full.html))
  check('不再出现字面 ###', !/<p>###/.test(full.html))
  check('档位从「已证实 / 高」解析出来', /已证实/.test(full.html) && !/无法核实 · 置信度 未知/.test(full.html),
    'tier 被默认成无法核实')
  check('来源从编号列表解析出来', /共 1 条来源|官网/.test(full.html))
}

console.log('\n首图：多档结论要拆成逐条，不能挤成一段：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '',
    '**这一组数字整体成立，但销量是第三方估算。**', '',
    '定档：**已证实 / 高**（媒体评分、在线峰值、好评率均为一手平台数据）；**很可能属实 / 中高**（销量量级）；**不存在 / 已证伪**（"官方宣布首周销量""差评轰炸"）。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const cover = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'summary')
  const rows = (cover.html.match(/class="tier-row"/g) || []).length
  check('三档 → 三行', rows === 3, `实际 ${rows} 行`)
  check('定档不再作为整段出现', !cover.html.includes('定档：'))
  check('每行带档位徽章 + 范围', /已证实 \/ 高/.test(cover.html) && /销量量级/.test(cover.html))
  check('「已证伪」被识别（不是漏掉）', /不存在 \/ 已证伪/.test(cover.html))
  check('多档 → 中性徽标', /分档结论/.test(cover.html) && /3 档并列/.test(cover.html) || /分档结论/.test(cover.html))
}

console.log('\n首图：徽标必须挨着被核查的内容：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '', '**已证实 / 高**（依据：一手页面）', '',
    '**「某产品销量破百万」这一组数字整体成立，但销量是第三方估算。**', '',
    '乙轨：即便剔除估算，Steam 峰值与好评率仍可独立复现。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const doc = buildReport(md, { preset: 'auto' })
  const cover = doc.pages.find((p) => p.kind === 'summary')
  const html = cover.html
  const claimAt = html.indexOf('class="claim"')
  const railsAt = html.indexOf('class="rails"')
  check('首图有「被核查内容」块', claimAt > 0)
  check('该块在双轨之前（先知道证实了什么）', claimAt > 0 && claimAt < railsAt, `claim=${claimAt} rails=${railsAt}`)
  check('被核查内容挨着徽标', /class="verdict">[\s\S]{0,400}class="claim"/.test(html))
  check('报告没给甲轨时不摆「甲轨」空话', !/甲轨/.test(html), '复述了档位')
  check('乙轨仍完整显示', /乙轨/.test(html) && /独立复现/.test(html))
}

console.log('\n首图：报告自己写了甲轨时两条都显示：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '', '**可能属实 / 中**', '',
    '甲轨（正式结论）：媒体评分与在线峰值均可复现。', '',
    '乙轨（保守口径）：剔除估算后仅剩媒体评分。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const cover = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'summary')
  check('显示了甲轨', /甲轨/.test(cover.html) && /正式结论/.test(cover.html))
  check('显示了乙轨', /乙轨/.test(cover.html) && /保守口径/.test(cover.html))
}

console.log('\n核查详情：分段线不带进正文、表格型段不丢：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '', '**已证实 / 高**', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 利益相关与污染面', '', '甲轨：内容。', '', '---', '',
    '## 本次未能核实到的', '',
    '| 缺口 | 尝试过什么 | 结果 |', '|---|---|---|', '| 官方销量 | 官网、X | 均无 |', '',
    '---', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const detail = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'full')
  check('正文里没有残留的 --- ', !/-{3,}/.test(detail.html), '还有分隔线被当内容')
  check('表格型「未能核实到的」不被丢掉', /本次未能核实到的/.test(detail.html) && /官方销量/.test(detail.html))
  check('表格型段落渲染成 <table>', /未能核实到的[\s\S]{0,300}<table/.test(detail.html))
  check('段间有分隔线可裁', (detail.html.match(/data-cut/g) || []).length >= 3)
}

console.log('\n行内链接：')
const { inline } = await import('../lib/modes/markdown.mjs')
check('相对链接被渲染成 <a>', inline('[English](MEASUREMENTS.md)').includes('<a href="MEASUREMENTS.md">'))
check('绝对链接带 target=_blank', inline('[x](https://a.com)').includes('target="_blank"'))
check('javascript: 不生成链接', !inline('[x](javascript:alert(1))').includes('<a '), inline('[x](javascript:alert(1))'))
check('data: 不生成链接', !inline('[x](data:text/html,hi)').includes('<a '))
check('拒绝时不吃掉右括号', inline('[x](javascript:1) 后文').includes('后文'))

console.log('\nMarkdown 块解析：')
const blocks = parseBlocks(gen)
const kinds = blocks.map((b) => b.type)
check('识别出标题块', kinds.includes('h'))
check('识别出表格块', kinds.includes('table'))
check('识别出引用块', kinds.includes('quote'))
check('识别出有序列表', kinds.includes('ol'))
check('识别出无序列表', kinds.includes('ul'))
check('识别出分隔线', kinds.includes('hr'))
const tb = blocks.find((b) => b.type === 'table')
check('表格表头 3 列', tb && tb.header.length === 3, JSON.stringify(tb?.header))
check('表格有 3 行数据', tb && tb.rows.length === 3, String(tb?.rows.length))

const o = outline(gen)
check('outline 给出 titleIdx', typeof o.titleIdx === 'number' && o.titleIdx >= 0)
check('outline 给出导语', o.dek.length > 10, String(o.dek.length))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
