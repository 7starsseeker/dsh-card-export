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

// 长图顶部原来只挂 found[0] 一个档：三档结论的报告，长图顶上写着「已证实」，
// 而长图里没有别处交代另两档——首图的中性徽标至少还指向右侧定档正文。两图必须说同一件事。
const headOf = (html) => {
  const a = html.indexOf('<div class="dhead">')
  const b = html.indexOf('<div class="cut"')
  return a === -1 ? '' : html.slice(a, b === -1 ? undefined : b)
}

console.log('\n长图：多档结论的顶部要挂全部档位：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '',
    '**这一组数字整体成立，但销量是第三方估算。**', '',
    '定档：**已证实 / 高**（媒体评分、在线峰值、好评率均为一手平台数据）；**很可能属实 / 中高**（销量量级）；**不存在 / 已证伪**（"官方宣布首周销量""差评轰炸"）。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const detail = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'full')
  const head = headOf(detail.html)
  // 徽章只出现一次：在逐条行的 chip 里。顶部再挂一排同名徽章＝同一句话写两遍
  check('三档 → 顶部三行逐条', (head.match(/class="tier-row"/g) || []).length === 3,
    `实际 ${(head.match(/class="tier-row"/g) || []).length} 行`)
  check('顶部不再只给一个全篇置信度', !/置信度 (高|中高|中|低)/.test(head), '仍在顶部写单一置信度')
  check('每档各自的置信度跟着徽章', /已证实 \/ 高/.test(head) && /很可能属实 \/ 中高/.test(head))
  check('顶部标出档数', /3 档并列/.test(head))
  check('徽章不在逐条之外重复', (head.match(/class="dchip"/g) || []).length === 0,
    `多出 ${(head.match(/class="dchip"/g) || []).length} 个`)
  check('范围与档位对得上（不是错行）', /tier-chip[^>]*>已证实 \/ 高<\/span>[\s\S]{0,200}媒体评分/.test(head))
}

console.log('\n一行一档（没有「定档：」前缀）：也按分档逐条渲染，两图一致：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '',
    '**已证实 / 高**（媒体评分、在线峰值）', '',
    '**证伪 / 中**（"官方宣布首周销量"）', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const pages = buildReport(md, { preset: 'auto' }).pages
  const cover = pages.find((p) => p.kind === 'summary').html
  const head = headOf(pages.find((p) => p.kind === 'full').html)
  check('长图：两个档位都在（含证伪）', /已证实 \/ 高/.test(head) && /证伪 \/ 中/.test(head))
  check('长图：顶部摆出两档范围', (head.match(/class="tier-row"/g) || []).length === 2,
    `实际 ${(head.match(/class="tier-row"/g) || []).length} 行`)
  // 短图：徽标写「N 档并列 · 见右侧」，右侧现在真有逐条可指
  check('短图：徽标指向右侧', /见右侧/.test(cover))
  check('短图：右侧摆出两档逐条', (cover.match(/class="tier-row"/g) || []).length === 2,
    `实际 ${(cover.match(/class="tier-row"/g) || []).length} 行`)
  check('短图：档位行不再在正文里重复一遍', !/class="judge"[\s\S]{0,400}已证实 \/ 高/.test(cover),
    '同一句既当分档又当判断')
  check('短图：仍是中性「分档结论」徽标（不冒充单一档）', /分档结论/.test(cover) && /2 档并列/.test(cover))
}

console.log('\n判断句里顺带点了档位（没有声明行）：徽标不能指向空处：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '',
    '按现有材料，**已证实**的只有平台数据，而**证伪**的是「官方宣布首周销量」一说。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const pages = buildReport(md, { preset: 'auto' }).pages
  const cover = pages.find((p) => p.kind === 'summary').html
  check('短图：徽标不写「见右侧」（右侧没有逐条）', !/见右侧/.test(cover))
  check('短图：把两档徽章自己摆出来', (cover.match(/class="dchip"/g) || []).length === 2,
    `实际 ${(cover.match(/class="dchip"/g) || []).length} 个`)
  check('短图：判断句原样保留', /按现有材料/.test(cover))
  check('长图：顶部也列出两档', (headOf(pages.find((p) => p.kind === 'full').html).match(/class="dchip"/g) || []).length === 2)
}

console.log('\n有「定档」行时：短图不重复摆徽章：')
{
  const md = [
    '# 测试报告', '',
    '## 一句话结论', '',
    '定档：**已证实 / 高**（媒体评分）；**很可能属实 / 中高**（销量量级）；**不存在 / 已证伪**（官方销量）。', '',
    '## 哪些是真的、哪些是假的', '', '- 甲', '',
    '## 来源', '', '1. 官网 https://example.com',
  ].join('\n')
  const cover = buildReport(md, { preset: 'auto' }).pages.find((p) => p.kind === 'summary').html
  check('短图：徽标指向右侧（右侧确有逐条）', /见右侧/.test(cover))
  check('短图：徽章只出现一次（在逐条行里）', (cover.match(/class="dchip"/g) || []).length === 0,
    `多出 ${(cover.match(/class="dchip"/g) || []).length} 个徽章`)
  check('短图：三行逐条仍在', (cover.match(/class="tier-row"/g) || []).length === 3)
}

console.log('\n长图：单档结论顶部保持原样：')
{
  const head = headOf(r.pages[1].html)
  check('单档 → 一个徽章', (head.match(/class="dchip"/g) || []).length === 1)
  check('单档 → 仍写档位与置信度', /✕ 证伪/.test(head) && /置信度 高/.test(head))
  check('单档 → 不多摆分档行', !/class="tier-row"/.test(head) && !/档并列/.test(head))
}

/* ------------------------- 英文报告（同一套皮肤） ------------------------- */

const enFc = [
  '# Test report', '',
  '## One-line verdict', '',
  '**Confirmed** · Confidence: high (basis: two independent evaluations)', '',
  '**Rail B (conservative reading)**: the magnitude is unconfirmed.', '',
  'The claim holds on the two rows we could inspect.', '',
  '**Checked on**: 2026-11-10', '',
  '## What happened', '', 'Background sentence. [1]', '',
  '## What is true, what is false', '',
  '**✅ Confirmed — fact level**',
  '- Fact one. [1]',
  '**⚠️ Unconfirmed** (single source)',
  '- Maybe. [2]',
  '  > Must not be repeated as fact in any retelling',
  '**❓ Unresolved** (sources conflict)',
  '- Unclear. [1][2]',
  '  > Must not be repeated as fact in any retelling', '',
  '## Domestic vs international coverage', '',
  '- Domestic channels: same numbers. [1]',
  '- International channels: same numbers. [2]', '',
  '## Why this happened', '', 'Because the table is laid out that way. [1]', '',
  '## Stakeholders and contamination surface (annotation only, no downgrade)', '',
  '**Rail A**: Confirmed — annotation does not enter tiering.', '',
  '**Rail B (conservative reading)**: Unconfirmed.', '',
  '| Source | Level | Observable basis | Rail B action |',
  '|---|---|---|---|',
  '| [1] Official | L1 | Public documents | Kept |', '',
  '## One-sentence takeaway', '', 'It holds where it can be checked.', '',
  '## What we could not verify', '', '- Magnitude: no independent recomputation.', '',
  '## Sources (numbered appendix)', '', '1. Official page https://example.com — table', '',
  '## Tools and capabilities used', '- Web search.',
].join('\n')

console.log('\n英文报告：同一套皮肤，标签整套换成英文：')
{
  const doc = buildReport(enFc)
  const cover = doc.pages.find((p) => p.kind === 'summary').html
  const detail = doc.pages.find((p) => p.kind === 'full').html
  check('英文报告被识别为事实核查', looksLikeFactCheck(enFc) === true)
  check('语言判定 = en', doc.data.lang === 'en', String(doc.data.lang))
  check('仍走结论卡（verdict）', doc.kind === 'verdict', doc.kind)
  check('页面 lang 属性 = en', /<html lang="en">/.test(cover))
  check('无缺失段', doc.data.missing.length === 0, JSON.stringify(doc.data.missing))
  check('档位解析 = 已证实（内部键不变）', doc.data.verdict.tier === '已证实', doc.data.verdict.tier)
  check('置信度解析 = 高', doc.data.verdict.conf === '高', doc.data.verdict.conf)
  check('徽标显示 ✓ Confirmed + Confidence high', /✓/.test(cover) && /Confirmed/.test(cover) && /Confidence high/.test(cover))
  check('kickert 仍是 FACT CHECK REPORT', /FACT CHECK REPORT/.test(cover))
  check('双轨用 Rail B 文案', /Rail B \(conservative reading\)/.test(cover))
  check('不叠加英文解释（无双括号）', !/Rail B \(conservative reading\) \(what still holds/.test(cover))
  check('一句话总结标签是英文', /One-sentence takeaway/.test(cover))
  check('封面不再出现中文标签', !/置信度|一句话总结|核查口径|分档结论/.test(cover), '英文图上混进了中文')
  check('长图小节标题全英文',
    /01<\/i>What happened/.test(detail) && /02<\/i>What is true, what is false/.test(detail) &&
    /08<\/i>Sources \(numbered appendix\)/.test(detail) && /09<\/i>Tools and capabilities used/.test(detail))
  check('长图 kicker = FACT CHECK REPORT · DETAIL', /FACT CHECK REPORT · DETAIL/.test(detail))
  check('长图顶部单档徽章 + Confidence', /✓ Confirmed/.test(detail) && /Confidence high/.test(detail))
  check('断言分档标签英文', /&#160;Confirmed<\/span>/.test(detail) && /fact level/.test(detail))
  check('禁引用警示英文', (detail.match(/Must not be cited as fact in any retelling/g) || []).length === 2,
    `实际 ${(detail.match(/Must not be cited as fact in any retelling/g) || []).length} 处`)
  check('英文报告的分档卡片仍带底纹（ban）', (detail.match(/class="fact ban"/g) || []).length === 2)
  check('来源与视角解析出来', doc.data.sources.length === 1 && doc.data.views.length === 2,
    `sources=${doc.data.sources.length} views=${doc.data.views.length}`)
  check('英文报告不含中文段落标题', !/哪些是真的|本次未能核实/.test(detail))
}

console.log('\n语言可强制指定，且中英互不串味：')
{
  const forcedEn = buildReport(fc, { lang: 'en' })
  const forcedZh = buildReport(enFc, { lang: 'zh' })
  check('中文报告强制 en → 英文标签', /Confidence high|Confidence /.test(forcedEn.pages[0].html))
  check('英文报告强制 zh → 中文标签', /置信度/.test(forcedZh.pages[0].html))
  // 默认（不强制）时，中文产物里不该出现英文标签
  check('中文默认产物没有英文标签', !/Confidence high|One-sentence takeaway|Must not be cited/.test(r.pages[1].html))
}

console.log('\n英文普通报告：doc 预设的 chrome 也要是英文：')
{
  const enDoc = ['# Quarterly note', '', 'Intro paragraph.', '', '## Numbers', '', 'Body one.', '', '## Outlook', '', 'Body two.'].join('\n')
  const doc = buildReport(enDoc)
  const cover = doc.pages[0].html
  const full = doc.pages[1].html
  check('英文普通报告 → doc', doc.kind === 'doc', doc.kind)
  check('短图 kicker = REPORT · EXCERPT', /REPORT · EXCERPT/.test(cover))
  check('短图目录标签英文', /Contents/.test(cover) && /In this report/.test(cover))
  check('短图提示「导语/结论」用英文', /Lead|Conclusion/.test(cover))
  check('字数口径 = words（不是「字」）', /words/.test(cover) && !/\d+ 字/.test(cover))
  check('长图页脚英文', /Rendered by dsh-card-export/.test(full) && !/由 dsh-card-export/.test(full))
  const zhDoc = buildReport(['# 季度说明', '', '导语一段。', '', '## 数字', '', '正文一。', '', '## 展望', '', '正文二。'].join('\n'))
  check('中文普通报告仍写「字」', /字、2 节/.test(zhDoc.pages[0].html))
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
