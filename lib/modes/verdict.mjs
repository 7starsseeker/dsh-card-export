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
 * 语言：报告用什么语言写，图上标签就用什么语言（i18n.mjs）。判定语义不随语言变，
 * 内部档位键始终是中文那五个，英文只在显示层出现。
 *
 * 零依赖，只输出 HTML 字符串；栅格化由 render/rasterize.mjs 负责。
 */

import { parseBlocks, renderBlocks } from './markdown.mjs'
import { detectLang, ui, TIER_EN, TERM_EN, TERM_ZH, HEADINGS, confName } from './i18n.mjs'

/** 判定语义色（对比度已按 WCAG 在 #FBFAF7 上验过，见 README）。 */
export const TIERS = {
  '已证实': { color: '#175A3B', icon: '✓' },
  '很可能属实': { color: '#226B57', icon: '✓' },
  '未证实': { color: '#6F5100', icon: '?' },
  '证伪': { color: '#A63228', icon: '✕' },
  '无法核实': { color: '#565B60', icon: '—' },
}

/** 档位的显示名：中文原样，英文走 TIER_EN。 */
export function tierName(tier, lang) {
  return lang === 'en' ? (TIER_EN[tier] || tier) : tier
}

/** 断言分档桶：内部键固定，label 在渲染时按语言取显示名。 */
export const BUCKETS = {
  fact: { label: '已证实', tier: '已证实', ban: false },
  interp: { label: '已证实', tier: '已证实', ban: false },
  unverified: { label: '未证实', tier: '未证实', ban: true },
  unresolvable: { label: '无法裁定', tier: '无法核实', ban: true },
}

const SEC = Object.entries(HEADINGS).map(([key, re]) => ({ key, re }))

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
  // 斜体：*文字*（粗体已先处理，这里不会误伤）。英文报告里 `*unconfirmed*` 这类强调很常见，
  // 不认的话会把星号原样印在图上。规则与 markdown.mjs 的行内渲染保持一致。
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
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
  const lang = detectLang(src, opts)
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
      const hit = SEC.find((s) => s.re.zh.test(head) || s.re.en.test(head))
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
    lang,
    title: title || '',
    raw: { summary: joined('summary'), background: joined('background'), why: joined('why'),
      takeaway: joined('takeaway'), stakeholders: joined('stakeholders'),
      unverified: joined('unverified'), tools: joined('tools'),
      facts: joined('facts'), views: joined('views') },
    verdict: parseVerdict(joined('summary'), lang),
    facts: parseFacts(buckets.facts || [], lang),
    views: parseViews(buckets.views || []),
    stakeholders: parseStakeholders(buckets.stakeholders || [], lang),
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
    data.title = ui(lang).verdict.defaultTitle
    data.dek = deriveTitle(data.raw.background, lang)
  }
  return data
}

/**
 * 无 H1 时取「事实概要」首句做副标题；截断优先落在标点处，不做半句硬切。
 * 截断长度按语言给：56 个汉字的信息量约等于 100 个拉丁字符，用同一个数会把英文切在半句上。
 */
function deriveTitle(background, lang = 'zh') {
  // 先去掉行内标记：截断点落在 `**…**` 中间会留下半个 `**`，图上就会显示成字面星号
  const first = (background || '').split('\n').find(Boolean) || ''
  const plain = first.replace(/\[(\d+)\]/g, '').replace(/\*\*|__|`/g, '')
  const en = lang === 'en'
  // 英文句号是小数点也在用的符号：只有「句号后跟空格/行尾」才算句末
  const sentenceRe = en ? /^[\s\S]*?(?:[.!?](?=\s|$)|$)/ : /^[^。！？]*[。！？]?/
  const m = plain.match(sentenceRe)
  const sentence = (m ? m[0] : plain).trim()
  if (!sentence) return ''
  const LIMIT = en ? 100 : 56
  if (sentence.length <= LIMIT) return sentence
  const cut = sentence.slice(0, LIMIT)
  const lastPunct = en
    ? Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '))
    : Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'), cut.lastIndexOf('；'), cut.lastIndexOf('「'))
  return (lastPunct > LIMIT * 0.5 ? cut.slice(0, lastPunct) : cut) + '…'
}

function parseVerdict(text, lang = 'zh') {
  const L = ui(lang).verdict
  const en = lang === 'en'
  const out = { tier: '无法核实', icon: '—', conf: '未知', railA: '', railB: '', judge: [], summary: '' }
  if (!text) return out
  // 档位写法各家不同：`**已证实**`、`**已证实 / 高**`、`**Confirmed / high**`——
  // 所以先取出每个粗体段，再在段内找档位词，而不是要求段首就是档位词。
  // 解析两种语言的词表都收（语言只影响显示与 chrome），这样 --lang 强制覆盖不会把对方写法的档位解析成「无法核实」。
  const TERMS = [...TERM_EN, ...TERM_ZH]
  const confOf = (s) => {
    const hit = s.match(/(?:[/／·｜|\uff1a:]\s*)(高|中高|中|低|high|medium-high|medium|low)/i)
    return hit ? normConf(hit[1]) : ''
  }
  const findTier = (s) => {
    const low = s.toLowerCase()
    for (const [word, canon] of TERMS) {
      // 拉丁词按词边界匹配：unconfirmed 里含 confirmed，false 不能命中 falsehood 之类
      if (/^[\x00-\x7f\s]+$/.test(word)) {
        if (new RegExp(`\\b${word.replace(/\s+/g, '\\s+')}\\b`).test(low)) return canon
      } else if (s.includes(word)) return canon
    }
    return null
  }
  const found = []
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const span = m[1]
    const tier = findTier(span)
    if (!tier) continue
    found.push({ tier, conf: confOf(span) })
  }
  const tierHit = found[0] || null
  if (tierHit) {
    out.tier = tierHit.tier
    out.icon = (TIERS[tierHit.tier] || {}).icon || '—'
    if (tierHit.conf) out.conf = tierHit.conf
  } else {
    const alt = TERMS.map(([w]) => w.replace(/\s+/g, '\\s+')).join('|')
    const loose = text.match(new RegExp(`(${alt})\\s*(?:[/／·｜|\uff1a:]\\s*(高|中高|中|低|high|medium-high|medium|low))?`, 'i'))
    if (loose) {
      out.tier = findTier(loose[1]) || '无法核实'
      out.icon = (TIERS[out.tier] || {}).icon || '—'
      if (loose[2]) out.conf = normConf(loose[2])
    }
  }
  // 一份报告可能同时给出多个档位（媒体评分=已证实、销量量级=很可能属实、官方销量=不存在）。
  // 这时单个徽标就是以偏概全，只在语义真的是单一判定时才用徽标。
  out.tiers = [...new Set(found.map((f) => f.tier))]
  // 每档自己的置信度也要留着：多档时「置信度 高」只属于第一档，不能当成全篇的口径
  out.hits = found
  if (out.conf === '未知') {
    const confHit = text.match(/(?:置信度|confidence)\s*[:：<*]*\s*(高|中高|中|低|high|medium-high|medium|low)/i)
    if (confHit) out.conf = normConf(confHit[1])
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  // 「定档：A；B；C」这种一行三档的写法，直接画成一段没人看得清。
  // 拆成逐条：档位徽章 + 该档覆盖的范围，读起来才知道"哪部分是已证实"。
  out.tierItems = []
  for (const l of lines) {
    const m = l.match(/^(?:定档|tiering|tiers?)\s*[：:]\s*(.+)$/i)
    if (!m) continue
    for (const seg of m[1].split(/[；;]/)) {
      const bold = seg.match(/\*\*([^*]+)\*\*/)
      if (!bold) continue
      const label = bold[1].trim()
      const rest = seg.replace(/\*\*[^*]+\*\*/, '').trim()
      const scope = (rest.match(/[（(]([^）)]*)[）)]/) || [])[1] || rest.replace(/^[（(]|[）)]$/g, '')
      out.tierItems.push({
        label,
        tier: findTier(label) || '无法核实',
        scope: scope.trim(),
      })
    }
  }
  // 一行一档、但没写「定档：」前缀的写法（`**已证实 / 高**（媒体评分…）`）也是分档声明：
  // 档位 + 它覆盖的范围。多档时按逐条渲染，正文里不再把这两行原样重复一遍。
  // 只认「基本上是档位」的粗体段——档位词之外还剩一长串文字的，那是在讲一件事，不是分档。
  const declLines = new Set()
  const declItems = []
  if (out.tiers.length >= 2) {
    for (const l of lines) {
      const m = l.match(/^(?:[-*]\s+)?\*\*([^*]+)\*\*\s*(.*)$/)
      if (!m) continue
      const label = m[1].trim()
      const canon = findTier(label)
      if (!canon) continue
      const word = TERMS.find(([, c]) => c === canon)[0]
      const residue = label.replace(new RegExp(word, 'i'), '')
        .replace(/[\s/／·｜|、，,\uff1a:]/g, '')
        .replace(/高|中高|中|低|未知|置信度|high|medium-high|medium|low|unknown|confidence/gi, '')
      if (residue.length > 4) continue
      const rest = m[2].trim()
      const scope = (rest.match(/[（(]([^）)]*)[）)]/) || [])[1] || rest.replace(/^[：:]\s*/, '')
      declItems.push({ label, tier: canon, scope: scope.trim() })
      declLines.add(l)
    }
  }
  if (!out.tierItems.length && declItems.length) out.tierItems = declItems
  const RAIL_A = en ? /rail\s*a/i : /甲轨/
  const RAIL_B = en ? /rail\s*b/i : /乙轨/
  for (const l of lines) {
    const clean = l.replace(/\*\*/g, '').replace(/^[-*]\s*/, '')
      .replace(/^(?:乙轨|rail\s*b)[^：:]*[：:]\s*/i, '')
      .replace(/^(?:甲轨|rail\s*a)[^：:]*[：:]\s*/i, '')
    if (RAIL_B.test(l)) {
      out.railB = clean
      // 报告自己给双轨写的限定语（如「不因来源标注降档」）要保留，别在图上丢掉
      out.labelB = (l.match(/^\*{0,2}\s*(?:乙轨|rail\s*b)\s*([（(][^）)]*[）)])/i) || [])[1] || ''
      continue
    }
    if (RAIL_A.test(l)) {
      out.railA = clean
      out.labelA = (l.match(/^\*{0,2}\s*(?:甲轨|rail\s*a)\s*([（(][^）)]*[）)])/i) || [])[1] || ''
      continue
    }
    if (/(?:核查时间|checked on|key information dates?)/i.test(l) && !out.meta) { out.meta = clean; continue }
  }
  if (!out.railA) {
    // 报告没写「甲轨」行时，用「档位 + 置信度 + 依据」拼出正式结论，别去猜哪一行是它
    const basis = text.match(/(?:依据|basis)\s*[：:]\s*([^）)\n]+)/i)
    out.railA = L.derivedRail(tierName(out.tier, lang), confName(out.conf, lang), basis ? basis[1].trim() : '')
    out.railADerived = true
  }
  // 行首就是「**档位**」的，是声明行；句子中间提到档位的（「**已证实**的只有…」）是判断，得留下
  const alt = TERMS.map(([w]) => w.replace(/\s+/g, '\\s+')).join('|')
  const declStartRe = new RegExp(`^(?:[-*]\\s+)?\\*\\*(?:${alt})\\*\\*`, 'i')
  out.judge = lines
    .filter((l) => !/^(?:定档|tiering|tiers?)\s*[：:]/i.test(l))   // 定档另行渲染成逐条，不再混在段落里
    .filter((l) => !declLines.has(l))                // 一行一档的分档声明同理，别在正文里重写一遍
    .filter((l) => !declStartRe.test(l))
    .filter((l) => !(en ? /rail\s*[ab]|checked on|key information dates?|confidence/i : /乙轨|甲轨|核查时间|置信度/).test(l))
    .filter((l) => !/^---/.test(l))
    .slice(0, 3)
  return out
}

/** 置信度词归一：英文 token 也收进中文内部键，显示时再映射回英文。 */
function normConf(w) {
  const s = String(w || '').toLowerCase()
  if (s === 'high' || s === '高') return '高'
  if (s === 'medium-high' || s === '中高') return '中高'
  if (s === 'medium' || s === '中') return '中'
  if (s === 'low' || s === '低') return '低'
  return '未知'
}

function parseFacts(lines, lang = 'zh') {
  const out = []
  let kind = null
  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue
    // 分档小标题先判形态、再判词：`**⚠️ Unconfirmed**` 这种写法里 emoji 带变体选择符，
    // 靠 `^⚠️?` 锚行首并不可靠（⚠ 后面是 VS16，`?` 只作用于它）。只要是「加粗/emoji 开头、
    // 不是列表项」的一行，就在整行里找档位词——中英两套说法一并认。
    const isBullet = /^[-*]\s+/.test(l)
    const isHeading = !isBullet && /^(\*\*|[✅⚠❓✓])/.test(l)
    if (isHeading) {
      if (/解读级|interpretation level/i.test(l)) kind = 'interp'
      else if (/事实级|fact level/i.test(l)) kind = 'fact'
      else if (/未证实|\bunconfirmed\b/i.test(l)) kind = 'unverified'
      else if (/无法裁定|\bunresolved\b|\bunverifiable\b/i.test(l)) kind = 'unresolvable'
      continue
    }
    if (isBullet) {
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
    // 键可以是 `国内渠道：`、`**Domestic channels**:`、`Domestic (Chinese-language) channels:` 等写法
    const m = body.match(/^\*{0,2}(国内渠道|国外渠道|差异说明|domestic[^:*]*|international[^:*]*|difference[^:*]*)\*{0,2}\s*[：:]\s*(.+)$/i)
    if (m) out.push({ key: m[1].replace(/^\*+|\*+$/g, '').trim(), text: m[2] })
    else out.push({ key: '—', text: body })
  }
  return out
}

function parseStakeholders(lines, lang = 'zh') {
  const en = lang === 'en'
  const RAIL_A = en ? /^rail\s*a/i : /^甲轨/
  const RAIL_B = en ? /^rail\s*b/i : /^乙轨/
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
      if (/^(来源|层级|source|level)/i.test(cells[0] || '')) continue
      table.push(cells)
      continue
    }
    // 必须锚定行首：正文里也会出现「甲轨」二字（如「甲轨不因本节下调」），
    // 只判断「包含」会把那条不降权声明误当成轨道内容。
    const clean = l.replace(/\*\*/g, '').replace(/^[-*]\s*/, '')
    if (RAIL_A.test(clean)) {
      rails.a = clean.replace(en ? /^rail\s*a[^:]*[：:]\s*/i : /^甲轨[^：:]*[：:]\s*/, '')
      labels.a = (clean.match(en ? /^rail\s*a\s*([（(][^）)]*[）)])/i : /^甲轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
      continue
    }
    if (RAIL_B.test(clean)) {
      rails.b = clean.replace(en ? /^rail\s*b[^:]*[：:]\s*/i : /^乙轨[^：:]*[：:]\s*/, '')
      labels.b = (clean.match(en ? /^rail\s*b\s*([（(][^）)]*[）)])/i : /^乙轨\s*([（(][^）)]*[）)])/) || [])[1] || ''
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
    // 附录末尾的 `> 注：…` / `> Note: …` 说明（哪些编号被剔除/未采用）也是内容，不能丢
    const note = l.match(/^>\s*((?:注|note)[：:].+)$/i)
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
/* 英文档位词比两个汉字长得多：放宽徽标、收掉为汉字设计的字距，否则 "Confirmed" 会顶出块外 */
html:lang(en) .vbadge{width:auto;min-width:150px;max-width:230px;padding:16px 18px 14px}
html:lang(en) .vt{font-size:15px;letter-spacing:.2px;line-height:1.3;margin-top:9px}
.vbody{flex:1;min-width:0}
/* 被核查的那句话：紧挨徽标，替「已证实」交代对象 */
.claim{font-size:15px;line-height:1.92;font-weight:600;margin:0 0 9px}
.rails{display:flex;gap:14px;margin-bottom:13px;margin-top:11px}
.rails.wide{margin-bottom:14px}
.rail{flex:1;background:#F2F4F7;border-left:3px solid #1F3A8A;padding:9px 12px;font-size:12.5px;line-height:1.6}
.rail-wide{width:100%}
.rail b{display:block;font-size:10.5px;letter-spacing:1.5px;color:#1F3A8A;margin-bottom:3px}
.judge{font-size:14.5px;line-height:1.85}
/* 没有「定档」行时的多档徽章条：徽标说「N 档并列」，这里就是那 N 档 */
.vchips{margin:2px 0 12px;line-height:2}
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
.dcount{font-weight:800;color:#3A3F46;letter-spacing:.5px;margin-right:9px}
.missing{margin-top:14px;font-size:11.5px;color:#A63228}
/* 分隔线：普通分节符外观，同时是笔直的裁切参考（线通栏，切不歪） */
.cut{height:1px;background:#E2E5E9;margin:38px -60px 16px}
`

function page(inner, { title, lang = 'zh' }) {  return `<!DOCTYPE html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}</style></head><body><div class="card">${inner}</div>
<script>window.addEventListener('load',function(){
  var c=document.querySelector('.card');
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var hb=Math.ceil(c.getBoundingClientRect().bottom+window.scrollY);
  document.documentElement.setAttribute('data-hb',hb);document.documentElement.setAttribute('data-h',h);document.title='H='+h;});</script>
</body></html>`
}

function verdictBadge(v, tier, lang) {
  const L = ui(lang).verdict
  // 多档判定：一个「已证实」会把"销量只是估算""官方数字根本不存在"这些差异抹平，
  // 所以改用中性徽标，把分档交代给右侧的定档正文。
  if (Array.isArray(v.tiers) && v.tiers.length >= 2) {
    // 「见右侧」只有在右侧真有分档时才成立：报告没写「定档」行时，右侧只有各档徽章
    const hasRows = Array.isArray(v.tierItems) && v.tierItems.length > 0
    return `<div class="vbadge multi" style="background:#3A3F46;color:#FAFAF8">
    <span class="vi">≡</span><span class="vt">${L.tieredVerdict}</span>
    <span class="vc">${L.tierCount(v.tiers.length)}${hasRows ? L.seeRight : ''}</span></div>`
  }
  const c = (TIERS[tier] || TIERS['无法核实']).color
  return `<div class="vbadge" style="background:${c};color:#FAFAF8">
    <span class="vi">${v.icon}</span><span class="vt">${esc(tierName(v.tier, lang))}</span>
    <span class="vc">${L.confidence} ${esc(confName(v.conf, lang))}</span></div>`
}

/** 多档徽章条：每档一个徽章，带该档自己的置信度。首图与长图共用同一段 HTML。 */
function tierChipsHtml(v, lang) {
  const tiers = Array.isArray(v.tiers) ? v.tiers : []
  // 置信度按档取：多档时不存在一个全篇的置信度
  const confOf = {}
  for (const h of (Array.isArray(v.hits) ? v.hits : [])) if (h.conf && !confOf[h.tier]) confOf[h.tier] = h.conf
  return tiers.map((t) => {
    const def = TIERS[t] || TIERS['无法核实']
    const label = confOf[t] ? `${tierName(t, lang)} / ${confName(confOf[t], lang)}` : tierName(t, lang)
    return `<span class="dchip" style="background:${def.color}">${def.icon} ${esc(label)}</span>`
  }).join('')
}

/** 分档逐条：徽章 + 该档覆盖的范围。首图与长图共用同一段 HTML——两张图说的是同一件事。 */
function tierRowsHtml(items) {
  return `<div class="tiers">${items.map((t) => {
    const c = (TIERS[t.tier] || TIERS['无法核实']).color
    return `<div class="tier-row"><span class="tier-chip" style="background:${c}">${esc(t.label)}</span>
      <span class="tier-scope">${inline(t.scope)}</span></div>`
  }).join('')}</div>`
}

/**
 * 长图顶部的判定行。
 * 单档：徽标 + 该档置信度。
 * 多档：徽章交给下面的逐条行（一行一档，带覆盖范围），这里只标档数；
 * 只有拿不到逐条行时（档位是夹在判断句里点出来的）才把各档徽章摆在这一行。
 * 绝不能只挂 found[0] 一个档——那等于在长图顶部把「销量只是估算（很可能属实）」
 * 「官方数字根本不存在（证伪）」都说成了「已证实」，而长图里没有别处交代这个分档。
 */
function detailHead(v, hasRows, lang) {
  const L = ui(lang).verdict
  const tiers = Array.isArray(v.tiers) ? v.tiers : []
  if (tiers.length < 2) {
    const c = (TIERS[v.tier] || TIERS['无法核实']).color
    return `<div class="dmeta"><span class="dchip" style="background:${c}">${v.icon} ${esc(tierName(v.tier, lang))}</span>
${L.confidence} ${esc(confName(v.conf, lang))}　·　${inline(v.meta || '')}</div>`
  }
  // 有逐条时徽章就在逐条里，别在上一行重复一遍；没有逐条时（档位是在判断句里顺带点的），
  // 这一行是唯一能挂全档位的地方，那就把徽章摆出来。
  const strip = hasRows ? '' : tierChipsHtml(v, lang)
  return `<div class="dmeta">${strip}<span class="dcount">${L.tieredVerdict} · ${L.tierCount(tiers.length)}</span>${v.meta ? `　·　${inline(v.meta)}` : ''}</div>`
}

function railsHtml(a, b, opts = {}, lang = 'zh') {
  const L = ui(lang).verdict
  // 报告自己写「甲轨…」时才单独占一格；否则那格只是档位+置信度的复述，
  // 徽标已经说过了，再摆一次会让读者以为漏了内容。
  const showA = !opts.railADerived && a
  // 报告自己写的限定语原样保留（连标点一起），不要改写成「甲轨 · 正式结论」
  const labA = opts.labelA ? L.railJoin(L.railA, opts.labelA) : L.railAHint
  const labB = opts.labelB ? L.railJoin(L.railB, opts.labelB) : L.railBHint
  if (!showA && !b) return ''
  // 报告自己写了限定语时，英文不再叠一层解释（"Rail B (conservative reading) (what still holds…)" 双括号）；
  // 中文保持原样，既有产物不变。
  const hint = lang === 'en' && opts.labelB ? '' : L.railBOnlyHint
  if (!showA) return `<div class="rails"><div class="rail rail-wide"><b>${esc(labB)}${hint}</b>${inline(b)}</div></div>`
  return `<div class="rails">
    <div class="rail"><b>${esc(labA)}</b>${inline(a || L.notGiven)}</div>
    <div class="rail"><b>${esc(labB)}</b>${inline(b || L.notGiven)}</div></div>`
}

function factsHtml(facts, lang = 'zh') {
  const L = ui(lang).verdict
  return facts.map((f) => {
    const b = BUCKETS[f.kind] || BUCKETS.fact
    const c = (TIERS[b.tier] || TIERS['无法核实']).color
    const ic = (TIERS[b.tier] || TIERS['无法核实']).icon
    const label = (L.buckets[f.kind] || L.buckets.fact).label
    const sub = (L.buckets[f.kind] || L.buckets.fact).sub
    return `<div class="fact${b.ban ? ' ban' : ''}">
      <div class="fhead"><span class="tag" style="background:${c}">${ic}&#160;${esc(label)}</span>
      <span class="sub">${esc(sub)}</span></div>
      <div class="ft">${inline(f.text)}</div>
      ${b.ban ? `<div class="warn">${L.ban}</div>` : ''}</div>`
  }).join('')
}

/** 首图：结论徽标 + 被核查的那句话 + 双轨 + 一句话总结 + 口径声明。 */
export function renderCover(data) {
  const lang = data.lang || 'zh'
  const L = ui(lang).verdict
  const v = data.verdict
  const meta = v.meta || ''
  const summary = data.raw.takeaway || ''
  // 徽标必须和「被核查的内容」并排：单看一个「已证实」读者不知道证实了什么。
  const claim = v.judge[0] || ''
  const rest = v.judge.slice(1)
  const tiers = Array.isArray(v.tierItems) ? v.tierItems : []
  const tierRows = tiers.length ? tierRowsHtml(tiers) : ''
  // 多档但报告没写「定档」行：右侧原本一个分档都没有，徽标却说「见右侧」——
  // 这时把各档徽章自己摆出来，指过去才有落点。
  const tierChips = (!tiers.length && Array.isArray(v.tiers) && v.tiers.length >= 2)
    ? `<div class="vchips">${tierChipsHtml(v, lang)}</div>` : ''
  const inner = `<div class="band"></div>
<div class="kicker">${L.kicker}</div>
<h1>${esc(data.title)}</h1>
${data.dek ? `<div class="dek">${inline(data.dek)}</div>` : ''}
<div class="meta">${inline(meta)}</div>
<div class="verdict">${verdictBadge(v, v.tier, lang)}
  <div class="vbody">
    ${claim ? `<div class="claim">${inline(claim)}</div>` : ''}
    ${rest.length ? `<div class="judge">${rest.map((l) => inline(l)).join('<br>')}</div>` : ''}
    ${tierChips}
    ${tierRows}
    ${railsHtml(v.railA, v.railB, { railADerived: v.railADerived, labelA: v.labelA, labelB: v.labelB }, lang)}
  </div></div>
${summary ? `<div class="takeaway"><b>${L.takeaway}</b>${inline(summary)}</div>` : ''}
<div class="foot">${L.basisNote}<br>
${L.coverFoot(data.sources.length, data.facts.length)}</div>`
  return page(inner, { title: L.pageTitle(data.title), lang })
}

/** 细节图：对齐报告全部段落，缺段显式标注。 */
export function renderDetail(data) {
  const lang = data.lang || 'zh'
  const L = ui(lang).verdict
  const v = data.verdict
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

  add('01', L.sections.background, prose(data.raw.background))
  // 02 在真实报告里常是「### 分档 + 表格（# / 论断 / 独立来源 / 定档）」。
  // 表格形式一律按原文渲染——分档卡片只用于纯项目符号的报告，否则会丢掉整张表。
  const factsRaw = data.raw.facts || ''
  add('02', L.sections.facts,
    /\|\s*:?-{2,}/.test(factsRaw) ? prose(factsRaw) : factsHtml(data.facts, lang))

  // 03 同理：带 ### 子标题或表格时按原文渲染，避免解析器只认 `- ` 而漏掉引导句/表格
  const viewsRaw = data.raw.views || ''
  add('03', L.sections.views,
    (/###/.test(viewsRaw) || /\|\s*:?-{2,}/.test(viewsRaw))
      ? prose(viewsRaw)
      : (data.views.length
        ? `<table class="plain">${data.views.map((x) =>
          `<tr><td class="vk">${esc(x.key)}</td><td>${inline(x.text)}</td></tr>`).join('')}</table>` : ''))

  const sk = data.stakeholders
  add('04', L.sections.stakeholders, (sk.rails.a || sk.rails.b || sk.table.length || sk.notes.length)
    ? `<div class="rails wide">
        <div class="rail"><b>${esc(sk.labels.a ? L.railJoin(L.railA, sk.labels.a) : L.railAHint)}</b>${inline(sk.rails.a || L.notGivenShort)}</div>
        <div class="rail"><b>${esc(sk.labels.b ? L.railJoin(L.railB, sk.labels.b) : L.railBHint)}</b>${inline(sk.rails.b || L.notGivenShort)}</div></div>
      ${sk.table.length ? `<table class="plain rail-tbl">
        <tr><td class="si">${L.stakeholderTable.source}</td><td class="lv">${L.stakeholderTable.level}</td><td>${L.stakeholderTable.basis}</td><td>${L.stakeholderTable.action}</td></tr>
        ${sk.table.map((r) => `<tr>${r.map((cell, i) =>
          `<td class="${i === 0 ? 'si' : i === 1 ? 'lv' : ''}">${inline(cell)}</td>`).join('')}</tr>`).join('')}
      </table>` : ''}
      ${sk.notes.map((n) => `<div class="note">${inline(n)}</div>`).join('')}` : '')

  add('05', L.sections.why, prose(data.raw.why))
  add('06', L.sections.takeaway, data.raw.takeaway
    ? `<div class="takeaway inline">${inline(data.raw.takeaway)}</div>` : '')
  // 07 段在有的报告里是项目符号，有的是「缺口/尝试过什么/结果」表格——
  // 按内容形态选渲染方式，别因为只认 `- ` 就整段丢掉。
  const unv = data.raw.unverified || ''
  const unvIsTable = /\|\s*:?-{2,}/.test(unv)
  add('07', L.sections.unverified, unvIsTable
    ? prose(unv)
    : (data.unverified.length ? `<ul class="ul">${data.unverified.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : ''))
  add('08', L.sections.sources, data.sources.length
    ? `<table class="src-tbl">${data.sources.map((s) => (s.group
      ? `<tr class="src-group"><td colspan="2">${esc(s.group)}</td></tr>`
      : s.note
        ? `<tr class="src-note"><td colspan="2">${inline(s.note)}</td></tr>`
        : `<tr><td class="si">[${s.n}]</td><td>${inline(s.text)}</td></tr>`)).join('')}</table>` : '')
  add('09', L.sections.tools, data.tools.length
    ? `<ul class="ul">${data.tools.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>` : '')

  const miss = data.missing?.length ? `<div class="missing">${L.missing(data.missing)}</div>` : ''
  // 长图里没有别的地方交代分档范围（「定档」那一行只进首图），所以多档时把它摆到顶部
  const detailTiers = Array.isArray(v.tierItems) && v.tierItems.length >= 2 ? tierRowsHtml(v.tierItems) : ''

  const inner = `<div class="band"></div>
<div class="dhead"><div class="kicker">${L.kickerDetail}</div>
<h1 class="d">${esc(data.title)}</h1>
${data.dek ? `<div class="dek">${inline(data.dek)}</div>` : ''}
${detailHead(v, !!detailTiers, lang)}
${detailTiers}</div>
${parts.join('\n')}
${miss}
<div class="foot">${L.basisNote}<br>
${L.detailDiscipline}</div>`
  return page(inner, { title: L.pageTitleDetail(data.title), lang })
}

/** 一步到位：Markdown → { cover, detail } 两个 HTML 字符串。 */
export function buildHtml(md, opts = {}) {
  const data = parseReport(md, opts)
  return { data, cover: renderCover(data), detail: renderDetail(data) }
}
