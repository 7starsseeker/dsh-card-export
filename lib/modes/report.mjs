#!/usr/bin/env node
/**
 * modes/report — 渲染的统一入口，按「两套预设」组织。
 *
 *   report   文档/报告类：任意 Markdown 报告都用这一套（C 皮肤，冷白+单一蓝）。
 *            事实核查报告是它的特例——识别到结论结构时，额外多出一张「首图」
 *            并把断言按档位分色，但仍属同一套版式，不是另一套皮肤。
 *   generic  通用/对话类：不套报告结构装饰，按内容流排版。
 *            对话导出（transcript-card）在这套之上扩展为消息流。
 *
 * 自动判定：默认走 report（本插件的本职就是「把报告变成图」）；
 * generic 需要显式指定——它是另一套预设，不该被默认命中。
 */

import { parseReport, renderCover, renderDetail } from './verdict.mjs'
import { parseBlocks, outline, renderBlocks, renderBlockList, inline, esc } from './markdown.mjs'
import { page as reportPage } from './skin-report.mjs'
import { detectLang, ui, sizeOf, HEADINGS } from './i18n.mjs'
import { detectSkeleton, enhanceDetail } from './skeletons.mjs'

export const PRESETS = ['auto', 'report', 'generic']

/** 两种预设的定位说明（文档与 --help 共用同一份措辞）。 */
export const PRESET_INFO = {
  report: {
    name: 'report',
    cn: '报告预设',
    for: '任意 Markdown 报告（含事实核查结论报告）',
    gives: '结构化版式：标题/导语/分节蓝条/表格/来源；事实核查报告额外产出「首图」',
  },
  generic: {
    name: 'generic',
    cn: '通用预设',
    for: '对话内容与其他非报告类内容（后续接入 transcript 消息流）',
    gives: '内容流排版：不做报告结构装饰',
  },
}

/**
 * 是否是一份事实核查结论报告（report 预设下的增强判定，不是独立预设）。
 * 用「命中几段特征」而不是「全部命中」：少一段的报告仍应按结论卡呈现，
 * 缺的那段在长图末尾列出，而不是整份降级成普通文档。
 * 中英两套锚点都认——报告用什么语言写，判定就该用那门语言的标题。
 */
export function looksLikeFactCheck(md) {
  const hits = new Set()
  for (const line of String(md || '').split('\n')) {
    if (!/^##\s+/.test(line)) continue
    const head = line.replace(/^##\s+/, '').trim()
    for (const [key, re] of Object.entries(HEADINGS)) {
      if (re.zh.test(head) || re.en.test(head)) hits.add(key)
    }
  }
  return ['summary', 'facts', 'sources'].filter((k) => hits.has(k)).length >= 2
}

/* ------------------ report 预设：普通报告（无结论区） ------------------ */

/** 报告正文拆成「逐块 HTML」，供分页时按块切分。 */
export function docBlocks(md) {
  const { blocks, title, dek } = outline(md)
  // skipDek 跳的是「全文第一个段落」，不是「导语那一块」——所以只有真的识别出导语时才能跳。
  // 标题后面紧跟二级标题（`# 标题` → `## 一句话定义` → 正文）时 outline 的 dek 是空的，
  // 这时再 skipDek 就会把「一句话定义」下面那句正文当成导语吃掉：4-E 释义骨架正好是这个形状。
  return { title, dek, list: renderBlockList(blocks, { skipHeading: true, skipDek: !!dek }) }
}

/** 用给定的块切片渲染一页（分页时每页调用一次）。 */
export function renderDocFrom({ title, dek, list }, opts = {}) {
  const L = ui(opts.lang).doc
  const mark = !!opts.markBlocks
  // 二级小节之间插入裁切标记：长报告要手动分段时按它裁，不会切在段落中间。
  // 第一个章节前面不插（那里是导语与正文的自然衔接，不需要裁切线）。
  const CUT = '<div class="cut" data-cut></div>'
  let seenSection = false
  const body = list.map((h, i) => {
    const isSection = /^\s*<h2/i.test(h)
    let cut = ''
    if (isSection) {
      if (seenSection) cut = CUT
      seenSection = true
    }
    const html = mark ? `<div class="bk" data-split data-i="${i}">${h}</div>` : h
    return cut + html
  }).join('\n')
  const part = opts.part && opts.part.n > 1
    ? `<span class="partno">第 ${opts.part.i} / ${opts.part.n} 张</span> · ` : ''
  const inner = `<div class="band"></div>
<div class="kicker">${esc(opts.kicker || L.kickerDoc)}</div>
<h1>${esc(opts.title || title)}</h1>
${dek ? `<div class="dek">${inline(dek)}</div>` : ''}
<div class="doc">${body}</div>
<div class="foot">${part}${esc(opts.footer || L.docFoot)}</div>`
  return { html: reportPage(inner, { title: opts.title || title, paged: !!opts.part }), title: opts.title || title }
}

/** 任意 Markdown 报告 → 单张报告图（不分页路径）。 */
export function renderReportDoc(md, opts = {}) {
  const { title, dek, list } = docBlocks(md)
  // 认出骨架后，把它声明过的那几段换成强化块（数字卡 / 分层条 / 灰底块）；
  // 认不出就原样渲染——非 fact-check 报告的产物逐字不变。
  const skel = detectSkeleton(md)
  return renderDocFrom({ title, dek, list: skel ? enhanceDetail(list, skel) : list }, opts)
}

/* ------------------ report 预设：短图（结论） ------------------ */

/**
 * 普通报告的短图。
 *
 * 两种来源，必须能区分开：
 *   ① 给了 brief（模型读完报告后写的摘要）→ 按「结论 + 要点 + 关键数字」排版，
 *      并在页脚标明「摘要为撰写，非原文摘录」。这是正常路径。
 *   ② 没给 brief → 退化为原文提取（标题 + 首个结论/导语段 + 目录），
 *      kicker 与页脚都明确写「原文提取」。渲染器不会假装自己会总结。
 *
 * 为什么不在渲染器里做抽取式摘要：报告的价值在推理链，掐句子得到的不是摘要，
 * 是碎片；而编出一段像总结的话，就是二次创作。两件事都不能默认做。
 */
export function renderSummaryDoc(md, opts = {}) {
  const lang = opts.lang || detectLang(md)
  const L = ui(lang).doc
  const { blocks, title, dek, sections, sectionsH2 } = outline(md)
  const brief = normalizeBrief(opts.brief)

  if (brief) return renderAuthoredSummary(md, brief, { ...opts, lang, title: opts.title || title, sections, sectionsH2 })

  // —— ② 原文提取（明确标注，不冒充摘要）
  // fact-check 2.0.0 的五个非裁决骨架：只把该骨架自己声明的「结论段」抬到短图上，
  // 不解析结构、不造档位（对方明确不许给这些骨架自创锚点）。认不出就走下面的老逻辑。
  const skel = detectSkeleton(md)
  const CONCL = /(一句话总结|结论|总结|结论先行|小结|takeaway|bottom line|verdict|conclusion)/i
  let conclusion = ''
  let inConcl = false
  for (const b of blocks) {
    if (b.type === 'h') { inConcl = CONCL.test(b.text); continue }
    if (inConcl && b.type === 'p' && !conclusion) { conclusion = b.text; break }
  }
  if (!conclusion) conclusion = dek

  const nav = sectionsH2.slice(0, 8)
  const more = sectionsH2.length - nav.length
  const words = sizeOf(md, lang)

  // 标签必须诚实：有「结论」小节才叫结论；退到导语就叫导语，不能拿导语冒充结论。
  // 认出了骨架时标签写「骨架名 · 段名」（例：释义 · 一句话定义），读者一眼知道这段是什么。
  const hasConclusion = !!conclusion && conclusion !== dek
  const lead = skel ? skel.leadText : (hasConclusion ? conclusion : (dek || ''))
  const leadLabel = skel
    ? `${esc(skel.name[lang] || skel.name.zh)} · ${esc(skel.leadTitle)}`
    : (hasConclusion ? L.conclusion : L.lead)

  // 骨架自带的第二个块（地图的确定性分层、指标卡的口径差异、因果的被排除项）：
  // 它本来就是列表形态，按列表原样摆，不重写。
  const skelExtra = skel?.secondaryItems.length
    ? `<div class="sec"><h2><i>+</i>${inline(skel.secondaryTitle)}</h2>
  <ul class="nav">${skel.secondaryItems.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>`
    : ''

  const inner = `<div class="band"></div>
<div class="kicker">${esc(opts.kicker || L.kickerExtract)}</div>
<h1>${esc(opts.title || title)}</h1>
${lead ? `<div class="takeaway" style="margin:0 0 24px"><b>${leadLabel}</b>${inline(lead)}</div>`
    : '<div class="meta"></div>'}
${skelExtra}
<div class="sec"><h2><i>${L.contents}</i>${L.contentsHeading}</h2>
  <ul class="nav">${nav.map((s) => `<li>${inline(s)}</li>`).join('')}${more > 0 ? `<li class="dim">${L.moreSections(more)}</li>` : ''}</ul>
</div>
<div class="foot">${L.sizeLine(words.toLocaleString('en-US'), sections.length)}；${L.fullInImage}<br>
${L.extractNote}</div>`

  return { html: reportPage(inner, { title: opts.title || title }), title: opts.title || title, authored: false }
}

/* ------------------ brief（模型撰写的摘要）支持 ------------------ */

/** 把外部传入的 brief 规范成内部结构；缺字段就当没给。 */
export function normalizeBrief(b) {
  if (!b) return null
  const conclusion = typeof b.conclusion === 'string' ? b.conclusion.trim() : ''
  const points = Array.isArray(b.points) ? b.points.map((p) => String(p).trim()).filter(Boolean) : []
  const numbers = Array.isArray(b.numbers)
    ? b.numbers.filter((n) => n && n.label != null && n.value != null)
      .map((n) => ({ label: String(n.label).trim(), value: String(n.value).trim() }))
    : []
  const caveat = typeof b.caveat === 'string' ? b.caveat.trim() : ''
  if (!conclusion && !points.length && !numbers.length) return null
  return { conclusion, points, numbers, caveat, by: b.by ? String(b.by) : null }
}

/** brief → 短图（结论 + 要点 + 关键数字）。 */
function renderAuthoredSummary(md, brief, opts) {
  const lang = opts.lang || detectLang(md)
  const L = ui(lang).doc
  const words = sizeOf(md, lang)
  const h2 = opts.sectionsH2 || []
  const nav = h2.slice(0, 6)
  const more = h2.length - nav.length

  const inner = `<div class="band"></div>
<div class="kicker">${esc(opts.kicker || L.kickerSummary)}</div>
<h1>${esc(opts.title || L.defaultTitle)}</h1>
<div class="takeaway" style="margin:0 0 22px"><b>${L.conclusion}</b>${inline(brief.conclusion || L.noConclusion)}</div>
${brief.points.length ? `<div class="sec"><h2><i>${L.points}</i>${L.pointsHeading}</h2>
  <ol class="points">${brief.points.map((p) => `<li>${inline(p)}</li>`).join('')}</ol></div>` : ''}
${brief.numbers.length ? `<div class="sec"><h2><i>${L.numbers}</i>${L.numbersHeading}</h2>
  <div class="nums">${brief.numbers.map((n) =>
    `<div class="num"><span class="nv">${inline(n.value)}</span><span class="nl">${inline(n.label)}</span></div>`).join('')}</div></div>` : ''}
${brief.caveat ? `<div class="note dim" style="margin-top:18px"><b>${L.limits}</b>${inline(brief.caveat)}</div>` : ''}
${nav.length ? `<div class="sec"><h2><i>${L.contents}</i>${L.contentsHeading}</h2>
  <ul class="nav">${nav.map((s) => `<li>${inline(s)}</li>`).join('')}${more > 0 ? `<li class="dim">${L.moreSections(more)}</li>` : ''}</ul></div>` : ''}
<div class="foot">${L.summaryNote(brief.by ? esc(brief.by) : '')}<br>
${L.sizeLine(words.toLocaleString('en-US'), (opts.sections || []).length)}。</div>`

  return { html: reportPage(inner, { title: opts.title || L.defaultTitle }), title: opts.title || L.defaultTitle, authored: true }
}

const FLOW_CSS = `
*{box-sizing:border-box}
body{margin:0;padding:26px 0 40px;background:#EDEEF0;color:#0A0A0A;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif}
.card{width:900px;margin:0 auto;overflow:hidden;background:#FAFAF8;padding:0 60px 40px}
.band{background:#3A3F46;height:4px;margin:0 -60px 26px}
.kicker{font-size:11px;letter-spacing:5px;font-weight:700;color:#6A6F76;margin-bottom:14px}
h1{font-size:25px;line-height:1.45;margin:0 0 14px;font-weight:700}
.dek{font-size:14.5px;line-height:1.85;color:#3A3F46;margin:0 0 16px;padding-bottom:14px;
  border-bottom:1px solid #DDE0E4}
.flow h2{font-size:15px;font-weight:700;margin:24px 0 10px}
.flow h3{font-size:14px;font-weight:700;margin:18px 0 8px}
.flow p{font-size:14.5px;line-height:1.95;margin:0 0 12px}
.flow ul,.flow ol{margin:0 0 12px;padding-left:22px;font-size:14px;line-height:1.9}
.flow blockquote{margin:0 0 12px;padding:8px 14px;background:#F2F4F7;border-left:3px solid #6A6F76;
  font-size:13.5px;color:#3A3F46}
.flow code{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:4px;padding:1px 5px;font-size:12.5px}
.flow pre{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:8px;padding:12px 14px;margin:0 0 12px}
.flow pre code{background:none;border:none;padding:0;font-size:12px;line-height:1.7}
.flow table{width:100%;border-collapse:collapse;font-size:13px;margin:0 0 14px}
.flow th{text-align:left;font-size:11.5px;color:#6A6F76;font-weight:700;padding:6px 10px 6px 0;
  border-bottom:1px solid #6A6F76}
.flow td{padding:8px 10px 8px 0;border-top:1px solid #DDE0E4;vertical-align:top;line-height:1.65}
.flow hr{border:none;border-top:1px solid #DDE0E4;margin:20px 0}
.flow a{color:#1F3A8A}
sup{font-size:9.5px;font-weight:700;color:#1F3A8A;margin-left:1px}
.foot{margin-top:28px;padding-top:14px;border-top:1px solid #6A6F76;color:#6A6F76;font-size:11px;line-height:1.8}
`

function flowPage(inner, title) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${FLOW_CSS}</style></head><body><div class="card">${inner}</div>
<script>window.addEventListener('load',function(){
  var c=document.querySelector('.card');
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var hb=Math.ceil(c.getBoundingClientRect().bottom+window.scrollY);
  document.documentElement.setAttribute('data-hb',hb);document.documentElement.setAttribute('data-h',h);document.title='H='+h;});</script>
</body></html>`
}

/**
 * 任意内容 → 内容流单图（generic 预设）。
 *
 * 这里是「什么都能放」的通道：对话片段、随手记、核查报告原文都行。
 * 因此对缺标题的内容要老实处理——没有标题就不硬编一个，也不把首段当导语吃掉；
 * 原文第几段是第几段，不被吞、不被改写。
 */
export function renderGeneric(md, opts = {}) {
  const lang = opts.lang || detectLang(md)
  const L = ui(lang).doc
  const { blocks, title, titleFromHeading, dek } = outline(md)
  const t = opts.title || (titleFromHeading ? title : '')
  const lead = titleFromHeading ? dek : ''          // 无标题文档：首段就是正文，不是导语
  const body = renderBlocks(blocks, {
    skipHeading: titleFromHeading,                   // 有标题才跳过它（由外壳渲染）
    skipDek: !!lead,
  })
  const inner = `<div class="band"></div>
<div class="kicker">${esc(opts.kicker || L.kickerFlow)}</div>
${t ? `<h1>${esc(t)}</h1>` : ''}
${lead ? `<div class="dek">${inline(lead)}</div>` : ''}
<div class="flow">${body}</div>
<div class="foot">${esc(opts.footer || L.docFootFlow)}</div>`
  return { html: flowPage(inner, t || L.genericTitle), title: t || L.genericTitle }
}

/* --------------------------- 统一入口 --------------------------- */

/**
 * Markdown → 页面数组。
 * @param {string} md
 * @param {{preset?:'auto'|'report'|'generic', title?:string, kicker?:string, footer?:string}} opts
 * @returns {{preset:string, kind:string, pages:Array<{kind:string, html:string, title:string}>, data?:object}}
 */
export function buildReport(md, opts = {}) {
  const want = opts.preset || 'auto'
  const preset = want === 'auto' ? 'report' : want
  const lang = opts.lang || detectLang(md)

  if (preset === 'generic') {
    const g = renderGeneric(md, { ...opts, lang })
    return { preset: 'generic', kind: 'flow', pages: [{ kind: 'report', ...g }] }
  }

  // report 预设固定两张：短图（结论）+ 长图（完整报告，逐字按原文排版）
  if (looksLikeFactCheck(md)) {
    const data = parseReport(md, { title: opts.title, lang })
    const brief = normalizeBrief(opts.brief)
    // 核查报告本身已「结论先行」，默认直接用它的档位/双轨/判断做短图。
    // 给了 brief 就用模型更聚焦的表述覆盖判断与总结，但**档位与双轨仍取自报告**——
    // 那是事实判定，不能被摘要改写。
    if (brief) {
      if (brief.points.length) data.verdict.judge = brief.points.slice(0, 3)
      if (brief.conclusion) data.raw.takeaway = brief.conclusion
    }
    return {
      preset: 'report',
      kind: 'verdict',
      pages: [
        { kind: 'summary', html: renderCover(data), title: data.title, authored: !!brief },
        { kind: 'full', html: renderDetail(data), title: data.title },
      ],
      data,
    }
  }

  const s = renderSummaryDoc(md, { ...opts, lang })
  const f = renderReportDoc(md, { ...opts, lang })
  return {
    preset: 'report',
    kind: 'doc',
    pages: [
      { kind: 'summary', ...s },
      { kind: 'full', ...f },
    ],
  }
}
