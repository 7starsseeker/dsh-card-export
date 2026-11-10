/**
 * skeletons — fact-check 2.0.0 的六个产物骨架，声明式识别。
 *
 * 为什么是一张表而不是六套解析器：只有「裁决」骨架有 fact-check 写进模板的出图锚点
 * （`## 一句话结论` / `## 哪些是真的、哪些是假的` / `## 来源`），其余五个骨架对方
 * **明确不许自创锚点**——"那会让解析器误判成裁决，把一份释义报告渲染成带档位徽标的
 * 判决书"（SKILL.md §4b）。所以这里不解析结构、不造档位，只做一件事：
 * 认出这是哪个骨架，然后把它自己声明的「结论段」抬到短图上。
 *
 * 表从哪来（三级降级，上游从不调用下游，这条耦合是单向的）：
 *   ① `FACT_CHECK_ANCHORS` 指向的 JSON（显式，测试与排障用）；
 *   ② 上游 fact-check 装在哪就找哪：`$DSH_HOME/profiles/<profile>/node_modules/
 *      dsh-fact-check/reference/skeleton-anchors.json`，或技能形态
 *      `$DSH_HOME/skills/<skill>/reference/skeleton-anchors.json`；
 *   ③ 都读不到 → 内置表（与上游 2.0.0 的表同构、同内容）。
 *
 * 匹配规则（上游 `matchRule: stripTrailingParenThenExact`，逐字照做）：先把标题末尾的
 * 括号说明剥掉（可叠加，全角半角都认），再与表里的短标题做**全等**比较。**不做前缀、
 * 不做子串**——否则 `边界`（4-E）会误吞 `边界与反例`（4-C）。
 *
 * 共享标题必须排除（这是上游交接工单点名的坑）：`## 来源` 物理上出现在 4-E / 4-M / 4-S
 * 的正文里，只有裁决能把它当锚点；`定界` / `缺口` / `可比性检验` 三者谁都不许用来识别。
 * 排除集合读表里的 `sharedHeadings`，不写死在识别逻辑里。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MATCH_RULE = 'stripTrailingParenThenExact'
const ANCHOR_REL = join('reference', 'skeleton-anchors.json')

/**
 * 内置表：与上游 `reference/skeleton-anchors.json` 同构、同内容（上游 2.0.0）。
 * 上游表读不到时用它，行为与读表一致——它只是同一份声明的本地副本。
 */
export const BUILTIN_TABLE = {
  version: '2.0.0',
  matchRule: MATCH_RULE,
  minHitsDefault: 2,
  skeletons: [
    {
      id: 'verdict',
      name: { zh: '裁决', en: 'Verdict' },
      exportCard: true,
      match: ['一句话结论', '哪些是真的、哪些是假的', '来源'],
      matchEn: ['One-line verdict', 'What is true, what is false', 'Sources'],
      minHits: 2,
      lead: ['一句话结论'],
      leadEn: ['One-line verdict'],
      secondary: [],
      secondaryEn: [],
    },
    {
      id: 'definition',
      name: { zh: '释义', en: 'Definition' },
      exportCard: false,
      match: ['一句话定义', '义项', '规范定义', '边界', '构成 / 运作方式', '常见误解', '出处', '设定框架', '角色', '剧情', '常见设定误解'],
      matchEn: ['One-line definition', 'Senses', 'Normative definition', 'Boundaries', 'Composition and mechanism', 'Common misconceptions'],
      minHits: 2,
      lead: ['一句话定义'],
      leadEn: ['One-line definition'],
      secondary: ['规范定义'],
      secondaryEn: ['Normative definition'],
    },
    {
      id: 'causal',
      name: { zh: '因果机制', en: 'Causal mechanism' },
      exportCard: false,
      match: ['时间线', '各方角色与诉求', '因果链', '排除的成因', '排除的成因 / 未发生的环节', '边界与反例', '未知', '差异与成因', '主因', '前提核对', '拆条款', '落地概率', '机制链', '反向 / 对冲'],
      matchEn: ['Timeline', 'Actors and their stakes', 'Causal chain', 'Ruled out', 'Limits and counterexamples', 'Open questions', 'Differences and their causes', 'Primary cause', 'Premise check', 'Clauses', 'Probability of enactment', 'Transmission chain', 'Countervailing effects'],
      minHits: 2,
      lead: ['主因', '落地概率', '因果链', '差异与成因'],
      leadEn: ['Primary cause', 'Probability of enactment', 'Causal chain', 'Differences and their causes'],
      secondary: ['排除的成因', '排除的成因 / 未发生的环节'],
      secondaryEn: ['Ruled out'],
    },
    {
      id: 'compare',
      name: { zh: '对照', en: 'Comparison' },
      exportCard: false,
      match: ['对比维度', '逐维对照', '不可比', '分场景结论'],
      matchEn: ['Comparison dimensions', 'Dimension by dimension', 'Not comparable', 'Scenario conclusions'],
      minHits: 2,
      lead: ['分场景结论'],
      leadEn: ['Scenario conclusions'],
      secondary: ['不可比'],
      secondaryEn: ['Not comparable'],
    },
    {
      id: 'map',
      name: { zh: '地图', en: 'Map' },
      exportCard: false,
      match: ['核心发现', '确定性分层', '分歧在哪', '机制解释', '建议'],
      matchEn: ['Key findings', 'Certainty tiers', 'Where sources disagree', 'Mechanism', 'Recommendations'],
      minHits: 2,
      lead: ['核心发现'],
      leadEn: ['Key findings'],
      secondary: ['确定性分层'],
      secondaryEn: ['Certainty tiers'],
    },
    {
      id: 'metric',
      name: { zh: '指标卡', en: 'Metric card' },
      exportCard: false,
      match: ['数值', '走势', '口径差异', '可信度'],
      matchEn: ['Figures', 'Trend', 'Basis differences', 'Confidence'],
      minHits: 2,
      lead: ['数值'],
      leadEn: ['Figures'],
      secondary: ['口径差异'],
      secondaryEn: ['Basis differences'],
    },
  ],
  sharedHeadings: {
    noSkeletonMayUse: { zh: ['定界', '缺口', '可比性检验'], en: ['Scope', 'Gaps', 'Comparability check'] },
    verdictOnly: { zh: ['来源'], en: ['Sources'] },
  },
}

/* ------------------------------ 表：定位与校验 ------------------------------ */

/** 去掉标题末尾的括号说明（可叠加）。全角半角都认，最多剥 4 层防病态输入。 */
export function stripTailParen(title) {
  let s = String(title == null ? '' : title).trim()
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[（(][^（）()]*[）)]\s*$/, '').trim()
    if (!next || next === s) break
    s = next
  }
  return s
}

/** 上游表在哪。只认 DSH_HOME 下的两处布局与显式环境变量——不写死任何盘符。 */
export function findAnchorFile() {
  const explicit = process.env.FACT_CHECK_ANCHORS
  if (explicit && existsSync(explicit)) return explicit
  const home = process.env.DSH_HOME
  if (!home) return null
  const cands = []
  try {
    for (const p of readdirSync(join(home, 'profiles'), { withFileTypes: true })) {
      if (p.isDirectory()) cands.push(join(home, 'profiles', p.name, 'node_modules', 'dsh-fact-check', ANCHOR_REL))
    }
  } catch { /* 没有 profiles 目录就换下一种形态 */ }
  try {
    for (const d of readdirSync(join(home, 'skills'), { withFileTypes: true })) {
      if (d.isDirectory()) cands.push(join(home, 'skills', d.name, ANCHOR_REL))
    }
  } catch { /* 同上 */ }
  return cands.find((f) => existsSync(f)) || null
}

/**
 * 校验并归一上游表。
 * 认不出/规则不认识 → 返回 null（调用方退回内置表），绝不拿半懂的表去认骨架。
 */
export function normalizeTable(json) {
  if (!json || typeof json !== 'object') return null
  if (json.matchRule !== MATCH_RULE) return null
  const raw = Array.isArray(json.skeletons) ? json.skeletons : null
  if (!raw || !raw.length) return null
  const noUse = new Set([
    ...(json.sharedHeadings?.noSkeletonMayUse?.zh || []),
    ...(json.sharedHeadings?.noSkeletonMayUse?.en || []),
  ].map(String))
  const verdictOnly = new Set([
    ...(json.sharedHeadings?.verdictOnly?.zh || []),
    ...(json.sharedHeadings?.verdictOnly?.en || []),
  ].map(String))
  const keep = (arr, id) => (Array.isArray(arr) ? arr : [])
    .map((x) => String(x).trim())
    .filter((x) => x && !noUse.has(x) && (id === 'verdict' || !verdictOnly.has(x)))
  const out = []
  for (const s of raw) {
    const id = String(s?.id || '').trim()
    if (!id) continue
    const match = keep(s.match, id)
    const matchEn = keep(s.matchEn, id)
    if (!match.length && !matchEn.length) continue
    out.push({
      id,
      name: { zh: s.name?.zh || id, en: s.name?.en || id },
      exportCard: !!s.exportCard,
      match,
      matchEn,
      minHits: Math.max(2, Number(s.minHits) || 2),
      lead: keep(s.lead, id),
      leadEn: keep(s.leadEn, id),
      secondary: keep(s.secondary, id),
      secondaryEn: keep(s.secondaryEn, id),
    })
  }
  return out.length ? { skeletons: out } : null
}

let CACHE = null

/**
 * 取当前生效的表。
 * @param {{force?:boolean}} opts force=true 时忽略缓存（测试与排障用）
 * @returns {{source:'upstream'|'builtin', file:string|null, reason:string, skeletons:object[]}}
 */
export function loadTable(opts = {}) {
  if (CACHE && !opts.force) return CACHE
  const file = findAnchorFile()
  if (file) {
    try {
      const norm = normalizeTable(JSON.parse(readFileSync(file, 'utf8')))
      if (norm) return (CACHE = { source: 'upstream', file, reason: 'ok', skeletons: norm.skeletons })
      CACHE = { source: 'builtin', file, reason: '上游表形状或 matchRule 不认识，退回内置表', skeletons: BUILTIN_TABLE.skeletons }
      return CACHE
    } catch (e) {
      CACHE = { source: 'builtin', file, reason: `上游表解析失败（${e.message}），退回内置表`, skeletons: BUILTIN_TABLE.skeletons }
      return CACHE
    }
  }
  return (CACHE = { source: 'builtin', file: null, reason: '没找到上游表，用内置表', skeletons: BUILTIN_TABLE.skeletons })
}

/* -------------------------------- 识别 -------------------------------- */

/** 只按 `##` 切；`###` 属于段内，不参与骨架识别。 */
function sectionsOf(md) {
  const out = []
  let cur = null
  for (const line of String(md || '').replace(/\r\n/g, '\n').split('\n')) {
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) { cur = { title: h2[1].trim(), lines: [] }; out.push(cur); continue }
    if (/^#\s/.test(line)) { cur = null; continue }
    if (cur) cur.lines.push(line)
  }
  return out
}

/** 中文全等、英文大小写不敏感的全等。 */
const same = (a, b) => a === b || a.toLowerCase() === b.toLowerCase()
const inList = (title, list) => list.some((k) => same(title, k))

/**
 * 取一节的「一段话」：正文首段；若该节以列表开头，取前两条用「；」连起来
 * （指标卡的 `## 数值` 就是列表形态：官方口径一条、第三方估算一条）。
 */
function leadOf(lines) {
  const rows = lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() && !/^-{3,}$/.test(l.trim()))
  if (!rows.length) return ''
  const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/
  if (!bullet.test(rows[0])) return rows[0].trim()
  return rows.slice(0, 2).map((l) => l.replace(bullet, '').trim()).join('；')
}

/** 一条列表里最多取 n 项，供「分层 / 口径差异」这类副块使用。 */
function itemsOf(lines, n = 4) {
  const bullet = /^\s*(?:[-*•]|\d+[.)])\s+/
  return lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim())
    .map((l) => l.replace(bullet, '').trim())
    .filter((l) => l && !/^[-|]{3,}$/.test(l))
    .slice(0, n)
}

/** 按优先级列表找第一个存在的段（`lead` 是优先级，不是"取第一个"）。 */
const pickFirst = (secs, list) => {
  for (const key of list) {
    const hit = secs.find((s) => same(stripTailParen(s.title), key))
    if (hit) return hit
  }
  return null
}

/**
 * 认出报告属于哪个骨架。
 * @param {string} md
 * @param {{skeletons?:object[]}} [opts] 指定表（测试注入用）；默认用 loadTable()
 * @returns {{id:string,name:{zh:string,en:string},leadTitle:string,leadText:string,
 *            secondaryTitle:string,secondaryItems:string[]}|null}
 */
export function detectSkeleton(md, opts = {}) {
  const table = opts.skeletons || loadTable().skeletons
  const secs = sectionsOf(md)
  if (secs.length < 2) return null
  const titles = secs.map((s) => stripTailParen(s.title))
  for (const sk of table) {
    const keys = [...sk.match, ...sk.matchEn]
    const hits = titles.filter((t) => inList(t, keys)).length
    if (hits < sk.minHits) continue        // 命中不够就换下一个骨架，绝不"猜一个最像的"
    const lead = pickFirst(secs, [...sk.lead, ...sk.leadEn])
    if (!lead) continue
    const leadText = leadOf(lead.lines)
    if (!leadText) continue
    const sec = pickFirst(secs, [...sk.secondary, ...sk.secondaryEn])
    return {
      id: sk.id,
      name: sk.name,
      leadTitle: stripTailParen(lead.title),
      leadText,
      secondaryTitle: sec ? stripTailParen(sec.title) : '',
      secondaryItems: sec ? itemsOf(sec.lines) : [],
    }
  }
  return null
}

/* ---------------------------- 详图强化要素 ---------------------------- */

/**
 * 详图的「强化要素」对应表。
 *
 * 裁决详图里那些强化块（分档卡片、双轨、灰底禁引用）之所以存在，是因为那几段有
 * **固定的语义槽**：档位、口径、不得引用。别的骨架也有各自的那几段，只是以前一律
 * 按普通列表画。这里按骨架声明「哪一段该换呈现」，换的只是摆放方式：
 * 文字仍逐字来自原文，不合并、不重排、不删（_audit-coverage 仍在守这一条）。
 *
 *   nums   数字并列 → 数字卡（指标卡的 `## 数值`：官方口径 / 第三方估算）
 *   rails  分层条目 → 左边框灰条（地图的 `## 确定性分层`）
 *   muted  不该当结论的 → 灰底块（因果的被排除成因、对照的不可比、释义的常见误解）
 */
const DETAIL_RULES = {
  metric: [{ head: ['数值', 'Figures'], kind: 'nums' }],
  map: [{ head: ['确定性分层', 'Certainty tiers'], kind: 'rails' }],
  causal: [{ head: ['排除的成因', '排除的成因 / 未发生的环节', 'Ruled out'], kind: 'muted' }],
  compare: [{ head: ['不可比', 'Not comparable'], kind: 'muted' }],
  definition: [{ head: ['常见误解', 'Common misconceptions'], kind: 'muted' }],
}

const stripTags = (s) => String(s).replace(/<[^>]+>/g, '')

/** 「标签：内容」拆两半；冒号可能被行内标记包着，所以按纯文本定位再切原文。 */
function splitColon(html) {
  const m = String(html).match(/^(.*?)[：:]\s*([\s\S]+)$/)
  return m ? [m[1].trim(), m[2].trim()] : ['', String(html).trim()]
}

const RENDER = {
  nums: (items) => `<div class="nums">${items.map((it) => {
    const [k, v] = splitColon(it)
    return `<div class="num"><span class="nv">${v}</span>${k ? `<span class="nl">${k}</span>` : ''}</div>`
  }).join('')}</div>`,
  rails: (items) => `<div class="rails col">${items.map((it) => {
    const [k, v] = splitColon(it)
    return `<div class="rail">${k ? `<b>${k}</b>` : ''}${v}</div>`
  }).join('')}</div>`,
  muted: (_items, body) => `<div class="fact ban">${body}</div>`,
}

/**
 * 把「逐块 HTML」里被声明的段落换成强化块。
 * 只替换**没有**嵌套结构的列表块；段落/表格/嵌套列表原样保留——换不动就不换，
 * 绝不为了好看去拆原文。
 */
export function enhanceDetail(list, skel) {
  const rules = DETAIL_RULES[skel?.id]
  if (!rules?.length) return list
  const out = []
  for (let i = 0; i < list.length; i++) {
    const html = list[i]
    const h = html.match(/^<h2>([\s\S]*?)<\/h2>$/)
    const title = h ? stripTailParen(stripTags(h[1]).trim()) : null
    const rule = title ? rules.find((r) => inList(title, r.head)) : null
    if (!rule) { out.push(html); continue }
    const body = list[i + 1] || ''
    // 列表块的 class 随渲染路径不同（详图是 `<ul>`，裁决图是 `<ul class="ul">`），
    // 所以只认标签不认 class；带嵌套的列表仍按 `</li>` 切，切不干净就保留原文。
    const isList = /^<ul[^>]*>[\s\S]*<\/ul>$/.test(body)
    const items = isList ? [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]) : []
    if (rule.kind !== 'muted' && !items.length) { out.push(html); continue }
    if (rule.kind === 'muted' && !body) { out.push(html); continue }
    out.push(html, RENDER[rule.kind](items, body))
    i++   // 原来的列表块已被强化块替代
  }
  return out
}
