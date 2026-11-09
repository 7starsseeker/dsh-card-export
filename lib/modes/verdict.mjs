#!/usr/bin/env node
/**
 * modes/verdict — 事实核查报告（Markdown）→ 首图 / 细节图 的 HTML。
 *
 * 输入契约：fact-check 技能 Step 4 报告模板的固定二级标题。解析按标题锚定，
 * 不要求对方改版；缺段只标注、不静默补空（见 missing 字段）。
 *
 * 视觉：C 皮肤（冷白 + 单一蓝）。判定语义色固定，不随主题漂移；
 * 五档判定色彼此亮度接近（1.02–1.29），因此**颜色永远不是唯一区分手段**——
 * 每档同时带图标 + 标签文字 + 边框/底纹差异。
 *
 * 零依赖，只输出 HTML 字符串；栅格化由 render/rasterize.mjs 负责。
 */

import { parseBlocks, renderBlocks } from './markdown.mjs'

/** 判定语义色（对比度已按 WCAG 在 #FBFAF7 上验过，见 README）。 */
export const TIERS = {
  '已证实': { color: '#175A3B', icon: '✓' },
  '很可能属实': { color: '#226B57', icon: '✓' },
  '未证实': { color: '#6F5100', icon: '?' },
  '证伪': { color: '#A63228', icon: '✕' },
  '无法核实': { color: '#565B60', icon: '—' },
}

export const BUCKETS = {
  fact: { label: '已证实', sub: '事实级', tier: '已证实', ban: false },
  interp: { label: '已证实', sub: '解读级（不是事实本身）', tier: '已证实', ban: false },
  unverified: { label: '未证实', sub: '单一来源或无法溯源', tier: '未证实', ban: true },
  unresolvable: { label: '无法裁定', sub: '各来源矛盾且无法判定', tier: '无法核实', ban: true },
}

const SEC = [
  { key: 'summary', re: /^一句话结论/ },
  { key: 'background', re: /^始末/ },
  { key: 'facts', re: /^哪些是真的/ },
  { key: 'views', re: /^国内外视角/ },
  { key: 'stakeholders', re: /^利益相关/ },
  { key: 'why', re: /^为什么会这样/ },
  { key: 'takeaway', re: /^一句话总结/ },
  { key: 'unverified', re: /^本次未能核实/ },
  { key: 'sources', re: /^来源/ },
  { key: 'tools', re: /^工具与能力/ },
]

const REQUIRED = ['summary', 'facts', 'sources']

/* --------------------------- 文本工具 --------------------------- */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 行内 Markdown 的最小渲染：**粗体**、`代码`、[n] 来源角标。链接保留文本。 */
function inline(s) {
  let t = esc(s)
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, txt, url) =>
    `<a href="${url}" target="_blank" rel="noreferrer">${txt}</a>`)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')
  return t
}

/* ----------------------------- 解析 ----------------------------- */

/**
 * 解析报告 Markdown。
 * @param {string} md
 * @returns {object} 结构化数据 + missing（缺失的段）
 */
export function parseReport(md, opts = {}) {
  const src = String(md || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  const buckets = {}
  let cur = null
  let title = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1 && !title) { title = h1[1].trim(); continue }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      const head = h2[1].trim()
      const hit = SEC.find((s) => s.re.test(head))
      if (hit) { cur = hit.key; buckets[cur] = buckets[cur] || []; continue }
      cur = null // 未识别的二级标题：忽略（不把它的正文混进上一节）
      continue
    }
    // 段与段之间的 `---` 是排版分隔线，不是内容：留着会原样画进图里（04 段末尾就多出一条）
    if (/^\s*-{3,}\s*$/.test(line)) continue
    if (cur) buckets[cur].push(line)
  }

  // 段尾/段首的 `---` 是排版分隔线，不是内容：不加处理会把「---」原样画进图里。
  // 只去行尾空白，**保留行首缩进**——缩进是「列表项续行」的唯一标记，
  // trim() 掉以后续行会变成独立段落，列表被拆成每项一个 <ol>（编号全变 1）。
  const stripRules = (arr) => {
    const out = arr.map((l) => l.replace(/\s+$/, ''))
    const isJunk = (l) => l.trim() === '' || /^-{3,}$/.test(l.trim())
    while (out.length && isJunk(out[0])) out.shift()
    while (out.length && isJunk(out[out.length - 1])) out.pop()
    return out.filter((l) => !/^-{3,}$/.test(l.trim()))
  }
  const joined = (k) => stripRules(buckets[k] || []).join('\n').trim()
  const data = {
    title: title || '',
    raw: { summary: joined('summary'), background: joined('background'), why: joined('why'),
      takeaway: joined('takeaway'), stakeholders: joined('stakeholders'),
      unverified: joined('unverified'), tools: joined('tools'),
      facts: joined('facts'), views: joined('views') },
    verdict: parseVerdict(joined('summary')),
    facts: parseFacts(buckets.facts || []),
    views: parseViews(buckets.views || []),
    stakeholders: parseStakeholders(buckets.stakeholders || []),
    unverified: bullets(buckets.unverified || []),
    sources: parseSources(buckets.sources || []),
    tools: bullets(buckets.tools || []),
  }
  data.missing = REQUIRED.filter((k) => !data[k] || (Array.isArray(data[k]) && data[k].length === 0) ||
    (typeof data[k] === 'string' && !data[k])) +
    SEC.filter((s) => !(s.key in buckets)).map((s) => s.key).filter((k) => REQUIRED.includes(k) && !data.missing?.includes(k))
  data.missing = [...new Set(SEC.filter((s) => !buckets[s.key]).map((s) => s.key))]
  if (opts?.title) data.title = opts.title
  // 报告模板本身没有 H1（不含标题）。与其把首句截断成半句话，不如用一个中性标题 +
  // 把首句作为副标题（dek）——图上标题永远不该是「……由…」这种残句。
  if (!data.title) {
    data.title = '事实核查报告'
    data.dek = deriveTitle(data.raw.background)
  }
  return data
}

/** 无 H1 时取「事实概要」首句做副标题；截断优先落在标点处，不做半句硬切。 */
function deriveTitle(background) {
  const first = (background || '').split('\n').find(Boolean) || ''
  const m = first.replace(/\[(\d+)\]/g, '').match(/^[^。！？]*[。！？]?/)
  const sentence = (m ? m[0] : first).trim()
  if (!sentence) return ''
  const LIMIT = 56
  if (sentence.length <= LIMIT) return sentence
  const cut = sentence.slice(0, LIMIT)
  const lastPunct = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('；'), cut.lastIndexOf('「'))
  return (lastPunct > LIMIT * 0.5 ? cut.slice(0, lastPunct) : cut) + '…'
}

function parseVerdict(text) {
  const out = { tier: '无法核实', icon: '—', conf: '未知', railA: '', railB: '', judge: [], summary: '' }
  if (!text) return out
  // 档位写法各家不同：`**已证实**`、`**已证实 / 高**`、`**不存在 / 已证伪**`——
  // 所以先取出每个粗体段，再在段内找档位词，而不是要求段首就是档位词。
  const TIER_WORDS = ['已证实', '很可能属实', '未证实', '已证伪', '证伪', '无法核实']
  const normTier = (w) => (w === '已证伪' ? '证伪' : w)
  const found = []
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const span = m[1]
    const word = TIER_WORDS.find((w) => span.includes(w))
    if (!word) continue
    found.push({ tier: normTier(word), conf: (span.match(/[/／·｜|]\s*(高|中高|中|低)/) || [])[1] || '' })
  }
  const tierHit = found[0] || null
  if (tierHit) {
    out.tier = tierHit.tier
    out.icon = (TIERS[tierHit.tier] || {}).icon || '—'
    if (tierHit.conf) out.conf = tierHit.conf
  } else {
    const loose = text.match(/(已证实|很可能属实|未证实|已证伪|证伪|无法核实)\s*(?:[/／·｜|]\s*(高|中高|中|低))?/)
    if (loose) {
      out.tier = normTier(loose[1])
      out.icon = (TIERS[out.tier] || {}).icon || '—'
      if (loose[2]) out.conf = loose[2]
    }
  }
  // 一份报告可能同时给出多个档位（媒体评分=已证实、销量量级=很可能属实、官方销量=不存在）。
  // 这时单个徽标就是以偏概全，只在语义真的是单一判定时才用徽标。
  out.tiers = [...new Set(found.map((f) => f.tier))]
  if (out.conf === '未知') {
    const confHit = text.match(/置信度\s*[<**]*\s*(高|中高|中|低)/)
    if (confHit) out.conf = confHit[1]
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // 「定档：A；B；C」这种一行三档的写法，直接画成一段没人看得清。
  // 拆成逐条：档位徽章 + 该档覆盖的范围，读起来才知道"哪部分是已证实"。
  out.tierItems = []
  for (const l of lines) {
    const m = l.match(/^定档[：:]\s*(.+)$/)
    if (!m) continue
    for (const seg of m[1].split(/[；;]/)) {
      const bold = seg.match(/\*\*([^*]+)\*\*/)
      if (!bold) continue
      const label = bold[1].trim()
      const rest = seg.replace(/\*\*[^*]+\*\*/, '').trim()
      const scope = (rest.match(/[（(]([^）)]*)[）)]/) || [])[1] || rest.replace(/^[（(]|[）)]$/g, '')
      const canon = TIER_WORDS.find((w) => label.includes(w))
      out.tierItems.push({
        label,
        tier: normTier(canon || '无法核实'),
        scope: scope.trim(),
      })
    }
  }
  for (const l of lines) {
    const clean = l.replace(/\*\*/g, '').replace(/^[-*]\s*/, '')
      .replace(/^乙轨[^：:]*[：:]\s*/, '')
      .replace(/^甲轨[^：:]*[：:]\s*/, '')
    if (/乙轨/.test(l)) {
      out.railB = clean
      // 报告自己给双轨写的限定语（如「不因来源标注降档」）要保留，别在图上丢掉
      out.labelB = (l.match(/^\*{0,2}\s*乙轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
      continue
    }
    if (/甲轨/.test(l)) {
      out.railA = clean
      out.labelA = (l.match(/^\*{0,2}\s*甲轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
      continue
    }
    if (/核查时间/.test(l) && !out.meta) { out.meta = clean; continue }
  }
  if (!out.railA) {
    // 报告没写「甲轨」行时，用「档位 + 置信度 + 依据」拼出正式结论，别去猜哪一行是它
    const basis = text.match(/依据[：:]\s*([^）)\n]+)/)
    out.railA = `${out.tier} · 置信度 ${out.conf}` + (basis ? `（依据：${basis[1].trim()}）` : '')
    out.railADerived = true
  }
  out.judge = lines
    .filter((l) => !/^定档[：:]/.test(l))            // 定档另行渲染成逐条，不再混在段落里
    .filter((l) => !/\*\*(已证实|很可能属实|未证实|已证伪|证伪|无法核实)\*\*/.test(l))
    .filter((l) => !/乙轨|甲轨|核查时间|置信度/.test(l) || /^\s*$/.test(l))
    .filter((l) => !/^---/.test(l))
    .slice(0, 3)
  return out
}

function parseFacts(lines) {
  const out = []
  let kind = null
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    if (/已证实\s*[—–-]\s*事实级|^✅.*事实级/.test(l)) { kind = 'fact'; continue }
    if (/已证实\s*[—–-]\s*解读级|^✅.*解读级/.test(l)) { kind = 'interp'; continue }
    if (/^⚠️?.*未证实|未证实\*\*|^\*\*未证实/.test(l)) { kind = 'unverified'; continue }
    if (/^❓|无法裁定/.test(l)) { kind = 'unresolvable'; continue }
    if (/^[-*]\s+/.test(l)) {
      out.push({ kind: kind || 'fact', text: l.replace(/^[-*]\s+/, '') })
      continue
    }
    if (/^>/.test(l)) continue // 「不得引用」的提示行，图上由 ban 标记统一表达
  }
  return out
}

function parseViews(lines) {
  const out = []
  for (const raw of lines) {
    const l = raw.trim()
    if (!/^[-*]\s+/.test(l)) continue
    const body = l.replace(/^[-*]\s+/, '')
    const m = body.match(/^(国内渠道|国外渠道|差异说明)\s*[：:]\s*(.+)$/)
    if (m) out.push({ key: m[1], text: m[2] })
    else out.push({ key: '—', text: body })
  }
  return out
}

function parseStakeholders(lines) {
  const rails = { a: '', b: '' }
  const labels = { a: '', b: '' }
  const notes = []
  const table = []
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    if (/^\|/.test(l)) {
      if (/^\|\s*[-: ]+\|/.test(l)) continue
      const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      if (/^(来源|层级)/.test(cells[0] || '')) continue
      table.push(cells)
      continue
    }
    // 必须锚定行首：正文里也会出现「甲轨」二字（如「甲轨不因本节下调」），
    // 只判断「包含」会把那条不降权声明误当成轨道内容。
    const clean = l.replace(/\*\*/g, '').replace(/^[-*]\s*/, '')
    if (/^甲轨/.test(clean)) {
      rails.a = clean.replace(/^甲轨[^：:]*[：:]\s*/, '')
      labels.a = (clean.match(/^甲轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
      continue
    }
    if (/^乙轨/.test(clean)) {
      rails.b = clean.replace(/^乙轨[^：:]*[：:]\s*/, '')
      labels.b = (clean.match(/^乙轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
      continue
    }
    if (/^[-*]\s+/.test(l)) { notes.push(l.replace(/^[-*]\s+/, '')); continue }
    notes.push(l)
  }
  return { rails, labels, notes, table }
}

function bullets(lines) {
  return lines.map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''))
}

function parseSources(lines) {
  const out = []
  for (const raw of lines) {
    const l = raw.trim()
    // 分组标题（`**官方 / 一手**`）：附录靠它分层，丢了就变成一长串无分类的列表
    const group = l.match(/^\*\*([^*]{2,40})\*\*[：:]?$/)
    if (group) { out.push({ group: group[1].trim() }); continue }
    // 附录末尾的 `> 注：…` 说明（哪些编号被剔除/未采用）也是内容，不能丢
    const note = l.match(/^>\s*(注[：:].+)$/)
    if (note) { out.push({ note: note[1].trim() }); continue }
    // 编号列表（`1. 名称 https://…`）、或 `- [12] 名称`
    let m = l.match(/^\d+\.\s+(.+)$/)
    if (!m) m = l.match(/^[-*]\s+(.+)$/)
    if (!m) continue
    const body = m[1].trim()
    const numbered = body.match(/^\[(\d+)\]\s*(.+)$/)
    const text = numbered ? numbered[2] : body
    const urls = [...text.matchAll(/https?:\/\/\S+/g)].map((u) => u[0])
    // 一行里常有多个 URL（"官网 https://… ；Steam https://…"），全部剥掉并清掉残留的连接符
    const clean = text.replace(/https?:\/\/\S+/g, '')
      .replace(/[（(]\s*[）)]/g, '')
      .replace(/\s*[；;]\s*(?=[；;]|$)/g, '')
      .replace(/[（(]\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    out.push({
      n: numbered ? Number(numbered[1]) : out.filter((x) => x.n).length + 1,
      text: clean || text.replace(/https?:\/\/\S+/g, '').trim(),
      url: urls[0] || '',
    })
  }
  return out
}

/* ----------------------------- 渲染 ----------------------------- */

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:26px 0 40px;background:#EDEEF0;color:#0A0A0A;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif}
.card{width:900px;margin:0 auto;overflow:hidden;background:#FAFAF8;padding:0 60px 40px}
.band{background:#1F3A8A;height:6px;margin:0 -60px 26px}
.kicker{font-size:11px;letter-spacing:5px;font-weight:800;color:#1F3A8A;margin-bottom:14px}
h1{font-size:30px;line-height:1.38;margin:0 0 13px;font-weight:800;letter-spacing:-.3px}
h1.d{font-size:22px;margin:0 0 10px}
.dek{font-size:15px;line-height:1.75;color:#3A3F46;margin:0 0 12px;font-weight:500}
h1.d + .dek{font-size:13.5px;font-weight:500;margin-top:-4px}
.meta,.dmeta{color:#6A6F76;padding-bottom:16px;border-bottom:2px solid #0A0A0A;font-size:11.5px;line-height:1.7}
.verdict{display:flex;gap:26px;align-items:flex-start;padding:24px 0 22px}
.vbadge{flex:none;padding:16px 8px 14px;width:120px;text-align:center}
.vi{display:block;font-size:26px;font-weight:800;line-height:1}
.vt{display:block;font-size:18px;letter-spacing:3px;margin-top:8px;font-weight:800}
.vc{display:block;font-size:11px;margin-top:9px;border-top:1px solid rgba(255,255,255,.35);padding-top:8px}
.vbody{flex:1;min-width:0}
/* 被核查的那句话：紧挨徽标，替「已证实」交代对象 */
.claim{font-size:15px;line-height:1.92;font-weight:600;margin:0 0 9px}
.rails{display:flex;gap:14px;margin-bottom:13px;margin-top:11px}
.rails.wide{margin-bottom:14px}
.rail{flex:1;background:#F2F4F7;border-left:3px solid #1F3A8A;padding:9px 12px;font-size:12.5px;line-height:1.6}
.rail-wide{width:100%}
.rail b{display:block;font-size:10.5px;letter-spacing:1.5px;color:#1F3A8A;margin-bottom:3px}
.judge{font-size:14.5px;line-height:1.85}
/* 定档逐条：一行一档，徽章左对齐、范围右展开 */
.tiers{margin:4px 0 12px}
.tier-row{display:flex;gap:10px;align-items:flex-start;margin:0 0 7px}
.tier-chip{flex:0 0 auto;color:#FAFAF8;font-size:11px;font-weight:800;padding:2px 8px;
  border-radius:2px;white-space:nowrap;margin-top:2px;letter-spacing:.5px}
.tier-scope{flex:1;min-width:0;font-size:13px;line-height:1.75;color:#2A2F36}
.takeaway{background:#F2F4F7;border-left:4px solid #1F3A8A;padding:14px 18px;margin:2px 0 26px;
  font-size:14.5px;line-height:1.9}
.takeaway.inline{margin:0}
.takeaway b{display:block;font-size:10.5px;letter-spacing:2px;color:#1F3A8A;margin-bottom:6px}
.sec{margin-top:30px}
.sec h2{display:flex;gap:10px;align-items:baseline;font-weight:800;font-size:14px;letter-spacing:1.5px;
  margin:0 0 14px;padding-left:12px;border-left:5px solid #1F3A8A}
.sec h2 i{font-style:normal;font-size:15px;color:#1F3A8A;letter-spacing:1px;font-weight:800;
  font-variant-numeric:tabular-nums}
.prose p{font-size:14px;line-height:1.95;margin:0 0 11px}
/* 正文段通用 Markdown：表格/子标题/列表。样式与报告皮肤一致，避免两种外观 */
.md{font-size:14px;color:#0A0A0A}
.md p{line-height:1.95;margin:0 0 11px}
.md h3{font-size:15px;font-weight:800;margin:20px 0 9px;line-height:1.5}
.md h4{font-size:13.5px;font-weight:800;margin:16px 0 8px;color:#2A2F36}
.md ul,.md ol{margin:0 0 12px;padding-left:22px;line-height:1.9}
.md li{margin:0 0 4px}
.md table{width:100%;border-collapse:collapse;margin:2px 0 14px;font-size:12.5px}
.md th{text-align:left;font-weight:800;color:#2A2F36;padding:7px 10px 7px 0;
  border-bottom:2px solid #0A0A0A;line-height:1.5}
.md td{padding:8px 10px 8px 0;border-bottom:1px solid #E4E7EB;vertical-align:top;line-height:1.65}
.md code{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:4px;padding:1px 5px;font-size:12px}
.md pre{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:8px;padding:11px 14px;margin:0 0 12px;overflow:hidden}
.md blockquote{margin:0 0 12px;padding:8px 14px;background:#F2F4F7;border-left:3px solid #1F3A8A;color:#3A3F46}
.md .fnref a{color:#1F3A8A;text-decoration:none;font-size:11px}
.md .footnotes{margin-top:20px;padding-top:12px;border-top:1px solid #DDE0E4;font-size:12px;line-height:1.8}
.md .footnotes .fn-title{font-size:11px;letter-spacing:2px;font-weight:800;color:#6A6F76;margin-bottom:8px}
.md .footnotes .fn-id{color:#1F3A8A;font-weight:800;margin-right:4px}
.fact{background:#FFFFFF;border:1px solid #DDE0E4;padding:13px 16px;margin-bottom:11px}
.fact.ban{background:#F2F4F7}
.fhead{display:flex;align-items:baseline;gap:9px}
.tag{font-size:11.5px;font-weight:800;letter-spacing:1px;color:#FAFAF8;padding:2px 9px}
.sub{font-size:11.5px;color:#6A6F76}
.ft{font-size:14px;line-height:1.75;margin-top:7px}
.warn{font-size:11.5px;margin-top:7px;color:#A63228;font-weight:600}
sup{font-size:9.5px;font-weight:800;margin-left:1px;color:#1F3A8A}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:9px 10px 9px 0;vertical-align:top;line-height:1.65}
tr+tr td{border-top:1px solid #DDE0E4}
.plain tr:first-child td{border-top:none}
.vk{width:96px;white-space:nowrap;color:#6A6F76}
.rail-tbl td{font-size:12px}
.rail-tbl tr:first-child td{font-size:10.5px;letter-spacing:1.2px;color:#6A6F76;padding-bottom:6px}
.lv{width:46px;font-weight:800;color:#1F3A8A}
.si{width:190px;font-weight:700}
.src-tbl .si{width:44px;color:#1F3A8A;font-weight:800}
.src-group td{padding-top:16px;font-size:11.5px;font-weight:800;letter-spacing:1.5px;
  color:#1F3A8A;border:none;border-bottom:1px solid #DDE0E4}
.src-note td{padding-top:14px;font-size:11.5px;line-height:1.8;color:#6A6F76;border:none}
.st{display:block;font-size:11.5px;color:#6A6F76}
.note{font-size:12.5px;line-height:1.85;margin-top:10px;padding-left:2px}
.note b{color:#1F3A8A}
.note.dim{color:#6A6F76}
.ul{margin:0;padding-left:20px;font-size:13.5px;line-height:1.9}
.foot{margin-top:30px;padding-top:14px;border-top:2px solid #0A0A0A;color:#6A6F76;font-size:11px;line-height:1.8}
.dchip{display:inline-block;color:#FAFAF8;font-size:11px;font-weight:800;padding:1px 8px;margin-right:9px;letter-spacing:1px}
.missing{margin-top:14px;font-size:11.5px;color:#A63228}
/* 分隔线：普通分节符外观，同时是笔直的裁切参考（线通栏，切不歪） */
.cut{height:1px;background:#E2E5E9;margin:38px -60px 16px}
`

function page(inner, { title }) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}</style></head><body><div class="card">${inner}</div>
<script>window.addEventListener('load',function(){
  var c=document.querySelector('.card');
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var hb=Math.ceil(c.getBoundingClientRect().bottom+window.scrollY);
  document.documentElement.setAttribute('data-hb',hb);document.documentElement.setAttribute('data-h',h);document.title='H='+h;});</script>
</body></html>`
}

function verdictBadge(v, tier) {
  // 多档判定：一个「已证实」会把"销量只是估算""官方数字根本不存在"这些差异抹平，
  // 所以改用中性徽标，把分档交代给右侧的定档正文。
  if (Array.isArray(v.tiers) && v.tiers.length >= 2) {
    return `<div class="vbadge multi" style="background:#3A3F46;color:#FAFAF8">
    <span class="vi">≡</span><span class="vt">分档结论</span>
    <span class="vc">${v.tiers.length} 档并列 · 见右侧</span></div>`
  }
  const c = (TIERS[tier] || TIERS['无法核实']).color
  return `<div class="vbadge" style="background:${c};color:#FAFAF8">
    <span class="vi">${v.icon}</span><span class="vt">${esc(v.tier)}</span>
    <span class="vc">置信度 ${esc(v.conf)}</span></div>`
}

function railsHtml(a, b, opts = {}) {
  // 报告自己写「甲轨…」时才单独占一格；否则那格只是档位+置信度的复述，
  // 徽标已经说过了，再摆一次会让读者以为漏了内容。
  const showA = !opts.railADerived && a
  // 报告自己写的限定语原样保留（连标点一起），不要改写成「甲轨 · 正式结论」
  const labA = opts.labelA ? `甲轨${opts.labelA}` : '甲轨 · 正式结论'
  const labB = opts.labelB ? `乙轨${opts.labelB}` : '乙轨 · 保守口径'
  if (!showA && !b) return ''
  if (!showA) return `<div class="rails"><div class="rail rail-wide"><b>${esc(labB)}（剔除估算与转述后仍成立的部分）</b>${inline(b)}</div></div>`
  return `<div class="rails">
    <div class="rail"><b>${esc(labA)}</b>${inline(a || '（报告未给出）')}</div>
    <div class="rail"><b>${esc(labB)}</b>${inline(b || '（报告未给出）')}</div></div>`
}

function factsHtml(facts) {
  return facts.map((f) => {
    const b = BUCKETS[f.kind] || BUCKETS.fact
    const c = (TIERS[b.tier] || TIERS['无法核实']).color
    const ic = (TIERS[b.tier] || TIERS['无法核实']).icon
    return `<div class="fact${b.ban ? ' ban' : ''}">
      <div class="fhead"><span class="tag" style="background:${c}">${ic}&#160;${esc(b.label)}</span>
      <span class="sub">${esc(b.sub)}</span></div>
      <div class="ft">${inline(f.text)}</div>
      ${b.ban ? '<div class="warn">不得在任何转述中被当作事实引用</div>' : ''}</div>`
  }).join('')
}

/** 首图：结论徽标 + 被核查的那句话 + 双轨 + 一句话总结 + 口径声明。 */
export function renderCover(data) {
  const v = data.verdict
  const meta = v.meta || ''
  const summary = data.raw.takeaway || ''
  // 徽标必须和「被核查的内容」并排：单看一个「已证实」读者不知道证实了什么。
  const claim = v.judge[0] || ''
  const rest = v.judge.slice(1)
  const tiers = Array.isArray(v.tierItems) ? v.tierItems : []
  const tierRows = tiers.length
    ? `<div class="tiers">${tiers.map((t) => {
      const c = (TIERS[t.tier] || TIERS['无法核实']).color
      return `<div class="tier-row"><span class="tier-chip" style="background:${c}">${esc(t.label)}</span>
        <span class="tier-scope">${inline(t.scope)}</span></div>`
    }).join('')}</div>`
    : ''
  const inner = `<div class="band"></div>
<div class="kicker">FACT CHECK REPORT</div>
<h1>${esc(data.title)}</h1>
${data.dek ? `<div class="dek">${inline(data.dek)}</div>` : ''}
<div class="meta">${inline(meta)}</div>
<div class="verdict">${verdictBadge(v, v.tier)}
  <div class="vbody">
    ${claim ? `<div class="claim">${inline(claim)}</div>` : ''}
    ${rest.length ? `<div class="judge">${rest.map((l) => inline(l)).join('<br>')}</div>` : ''}
    ${tierRows}
    ${railsHtml(v.railA, v.railB, { railADerived: v.railADerived, labelA: v.labelA, labelB: v.labelB })}
  </div></div>
${summary ? `<div class="takeaway"><b>一句话总结</b>${inline(summary)}</div>` : ''}
<div class="foot">核查口径：本报告的「已证实 / 证伪」基于公开信息源的判定，不构成法律事实认定；结论随新证据可变。<br>
共 ${data.sources.length} 条来源、${data.facts.length} 项断言分档，完整核对过程见细节图。</div>`
  return page(inner, { title: `核查结论 · ${data.title}` })
}

/** 细节图：对齐报告全部段落，缺段显式标注。 */
export function renderDetail(data) {
  const v = data.verdict
  const c = (TIERS[v.tier] || TIERS['无法核实']).color
  const dm = `${v.meta || ''}`
  const parts = []

  const add = (n, title, body) => {
    if (!body) return
    // 段与段之间画分隔线：详情图也可能很长，需要沿着线手动裁（与报告/对话同一套规则）
    if (parts.length) parts.push('<div class="cut" data-cut></div>')
    parts.push(`<div class="sec"><h2><i>${n}</i>${esc(title)}</h2>${body}</div>`)
  }

  // 正文段（始末 / 为什么会这样）里常见 `###` 子标题与 Markdown 表格。
  // 逐行包 <p> 会把表格画成一排竖线、把 ### 当正文——所以走通用 Markdown 块渲染。
  const prose = (txt) => txt ? `<div class="md">${renderBlocks(parseBlocks(txt))}</div>` : ''

  add('01', '始末 / 事实概要', prose(data.raw.background))
  // 02 在真实报告里常是「### 分档 + 表格（# / 论断 / 独立来源 / 定档）」。
  // 表格形式一律按原文渲染——分档卡片只用于纯项目符号的报告，否则会丢掉整张表。
  const factsRaw = data.raw.facts || ''
  add('02', '哪些是真的、哪些是假的',
    /\|\s*:?-{2,}/.test(factsRaw) ? prose(factsRaw) : factsHtml(data.facts))

  // 03 同理：带 ### 子标题或表格时按原文渲染，避免解析器只认 `- ` 而漏掉引导句/表格
  const viewsRaw = data.raw.views || ''
  add('03', '国内外视角',
    (/###/.test(viewsRaw) || /\|\s*:?-{2,}/.test(viewsRaw))
      ? prose(viewsRaw)
      : (data.views.length
        ? `<table class="plain">${data.views.map((x) =>
          `<tr><td class="vk">${esc(x.key)}</td><td>${inline(x.text)}</td></tr>`).join('')}</table>` : ''))

  const sk = data.stakeholders
  add('04', '利益相关与污染面（标注，不参与定档）', (sk.rails.a || sk.rails.b || sk.table.length || sk.notes.length)
    ? `<div class="rails wide">
        <div class="rail"><b>${esc(sk.labels.a ? `甲轨${sk.labels.a}` : '甲轨 · 正式结论')}</b>${inline(sk.rails.a || '（未给出）')}</div>
        <div class="rail"><b>${esc(sk.labels.b ? `乙轨${sk.labels.b}` : '乙轨 · 保守口径')}</b>${inline(sk.rails.b || '（未给出）')}</div></div>
      ${sk.table.length ? `<table class="plain rail-tbl">
        <tr><td class="si">来源</td><td class="lv">层级</td><td>可观察依据</td><td>乙轨动作</td></tr>
        ${sk.table.map((r) => `<tr>${r.map((cell, i) =>
          `<td class="${i === 0 ? 'si' : i === 1 ? 'lv' : ''}">${inline(cell)}</td>`).join('')}</tr>`).join('')}
      </table>` : ''}
      ${sk.notes.map((n) => `<div class="note">${inline(n)}</div>`).join('')}` : '')

  add('05', '为什么会这样', prose(data.raw.why))
  add('06', '一句话总结', data.raw.takeaway
    ? `<div class="takeaway inline">${inline(data.raw.takeaway)}</div>` : '')
  // 07 段在有的报告里是项目符号，有的是「缺口/尝试过什么/结果」表格——
  // 按内容形态选渲染方式，别因为只认 `- ` 就整段丢掉。
  const unv = data.raw.unverified || ''
  const unvIsTable = /\|\s*:?-{2,}/.test(unv)
  add('07', '本次未能核实到的', unvIsTable
    ? prose(unv)
    : (data.unverified.length ? `<ul class="ul">${data.unverified.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''))
  add('08', '来源（编号附录）', data.sources.length
    ? `<table class="src-tbl">${data.sources.map((s) => (s.group
      ? `<tr class="src-group"><td colspan="2">${esc(s.group)}</td></tr>`
      : s.note
        ? `<tr class="src-note"><td colspan="2">${inline(s.note)}</td></tr>`
        : `<tr><td class="si">[${s.n}]</td><td>${inline(s.text)}</td></tr>`)).join('')}</table>` : '')
  add('09', '工具与能力使用情况', data.tools.length
    ? `<ul class="ul">${data.tools.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : '')

  const miss = data.missing?.length
    ? `<div class="missing">本图按报告模板缺以下段落，未生成对应区块：${data.missing.join('、')}</div>` : ''

  const inner = `<div class="band"></div>
<div class="dhead"><div class="kicker">FACT CHECK REPORT · 细节</div>
<h1 class="d">${esc(data.title)}</h1>
${data.dek ? `<div class="dek">${inline(data.dek)}</div>` : ''}
<div class="dmeta"><span class="dchip" style="background:${c}">${v.icon} ${esc(v.tier)}</span>
置信度 ${esc(v.conf)}　·　${inline(dm)}</div></div>
${parts.join('\n')}
${miss}
<div class="foot">核查口径：本报告的「已证实 / 证伪」基于公开信息源的判定，不构成法律事实认定；结论随新证据可变。<br>
排版纪律：证据是附录不是主体；未证实与无法裁定不得与已证实混排；来源比对写明口径一致或分歧。</div>`
  return page(inner, { title: `核查细节 · ${data.title}` })
}

/** 一步到位：Markdown → { cover, detail } 两个 HTML 字符串。 */
export function buildHtml(md, opts = {}) {
  const data = parseReport(md, opts)
  return { data, cover: renderCover(data), detail: renderDetail(data) }
}
