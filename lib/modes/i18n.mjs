/**
 * modes/i18n — 报告语言判定 + 界面文案表。
 *
 * 为什么单独一份：渲染器（verdict / report）里原来写死了中文文案，于是英文报告
 * 只有两条路——进不了结论卡皮肤，或者进了也是中文 chrome。语言要能和内容分开：
 * 报告用什么语言写，图上的标签就用什么语言，判定语义（档位、双轨、分档）不变。
 *
 * 判定规则（确定性，不猜）：
 *   1. 先数「二级标题命中」——中文锚点与英文锚点各数一遍，多者胜；
 *   2. 标题都没命中时，退回字符占比（CJK / (CJK + 拉丁)，≥ 0.2 判中文）；
 *   3. 报告里没有中文字符 ⇒ 英文。
 * 混合语言报告（标题中文、正文英文）按标题走中文——保持既有输出不变。
 *
 * @module dsh-card-export/i18n
 */

/** 判定档位在英文下的显示名。内部规范键仍是中文（颜色/图标/解析都以它为锚）。 */
export const TIER_EN = {
  '已证实': 'Confirmed',
  '很可能属实': 'Likely true',
  '未证实': 'Unconfirmed',
  '证伪': 'False',
  '无法核实': 'Unverifiable',
}

/** 英文档位词 → 内部规范键。顺序有意义：unconfirmed 必须先于 confirmed 匹配。 */
export const TERM_EN = [
  ['unconfirmed', '未证实'],
  ['unverifiable', '无法核实'],
  ['likely true', '很可能属实'],
  ['confirmed', '已证实'],
  ['false', '证伪'],
]

export const TERM_ZH = [
  ['已证实', '已证实'],
  ['很可能属实', '很可能属实'],
  ['未证实', '未证实'],
  ['已证伪', '证伪'],
  ['证伪', '证伪'],
  ['无法核实', '无法核实'],
]

/** 置信度：内部统一用中文档位词，英文只在显示层映射。 */
export const CONF_EN = { '高': 'high', '中高': 'medium-high', '中': 'medium', '低': 'low', '未知': 'unknown' }
export function confName(conf, lang) {
  return lang === 'en' ? (CONF_EN[conf] || conf) : conf
}

/** 二级标题锚点：中英各一套。键名跨语言一致，解析结果才能是同一份数据结构。 */
export const HEADINGS = {
  summary: { zh: /^一句话结论/, en: /^one[- ]line (verdict|conclusion)/i },
  background: { zh: /^始末/, en: /^(what happened|background|the facts?)\b/i },
  facts: { zh: /^哪些是真的/, en: /^what is true|^true or false|^what'?s true/i },
  views: { zh: /^国内外视角/, en: /^(domestic|home vs\.? international)/i },
  stakeholders: { zh: /^利益相关/, en: /^(stakeholders|conflicts of interest|who benefits)/i },
  why: { zh: /^为什么会这样/, en: /^why (this|it|did)/i },
  takeaway: { zh: /^一句话总结/, en: /^(one[- ]sentence )?(takeaway|bottom line)/i },
  unverified: { zh: /^本次未能核实/, en: /^what we could ?n[o']t (verify|confirm)|^not verified/i },
  sources: { zh: /^来源/, en: /^sources?\b/i },
  tools: { zh: /^工具与能力/, en: /^(tools and capabilities|tools used|methods and tools)/i },
}

/** 界面文案。zh 侧必须与改造前逐字一致——中文报告的产物不能变。 */
export const UI = {
  zh: {
    htmlLang: 'zh-CN',
    verdict: {
      kicker: 'FACT CHECK REPORT',
      kickerDetail: 'FACT CHECK REPORT · 细节',
      pageTitle: (t) => `核查结论 · ${t}`,
      pageTitleDetail: (t) => `核查细节 · ${t}`,
      defaultTitle: '事实核查报告',
      confidence: '置信度',
      tierCount: (n) => `${n} 档并列`,
      seeRight: ' · 见右侧',
      tieredVerdict: '分档结论',
      railA: '甲轨',
      railB: '乙轨',
      railJoin: (base, label) => `${base}${label}`,
      railAHint: '甲轨 · 正式结论',
      railBHint: '乙轨 · 保守口径',
      railBOnlyHint: '（剔除估算与转述后仍成立的部分）',
      notGiven: '（报告未给出）',
      notGivenShort: '（未给出）',
      takeaway: '一句话总结',
      basisNote: '核查口径：本报告的「已证实 / 证伪」基于公开信息源的判定，不构成法律事实认定；结论随新证据可变。',
      coverFoot: (src, facts) => `共 ${src} 条来源、${facts} 项断言分档，完整核对过程见细节图。`,
      detailDiscipline: '排版纪律：证据是附录不是主体；未证实与无法裁定不得与已证实混排；来源比对写明口径一致或分歧。',
      missing: (list) => `本图按报告模板缺以下段落，未生成对应区块：${list.join('、')}`,
      ban: '不得在任何转述中被当作事实引用',
      sections: {
        background: '始末 / 事实概要',
        facts: '哪些是真的、哪些是假的',
        views: '国内外视角',
        stakeholders: '利益相关与污染面（标注，不参与定档）',
        why: '为什么会这样',
        takeaway: '一句话总结',
        unverified: '本次未能核实到的',
        sources: '来源（编号附录）',
        tools: '工具与能力使用情况',
      },
      buckets: {
        fact: { label: '已证实', sub: '事实级' },
        interp: { label: '已证实', sub: '解读级（不是事实本身）' },
        unverified: { label: '未证实', sub: '单一来源或无法溯源' },
        unresolvable: { label: '无法裁定', sub: '各来源矛盾且无法判定' },
      },
      stakeholderTable: { source: '来源', level: '层级', basis: '可观察依据', action: '乙轨动作' },
      derivedRail: (tier, conf, basis) => `${tier} · 置信度 ${conf}` + (basis ? `（依据：${basis}）` : ''),
    },
    doc: {
      kickerExtract: 'REPORT · 原文提取',
      kickerSummary: 'REPORT · 摘要',
      kickerDoc: 'REPORT',
      kickerFlow: 'CONTENT',
      lead: '导语',
      conclusion: '结论',
      noConclusion: '（未提供结论）',
      contents: '目录',
      contentsHeading: '本报告包含',
      moreSections: (n) => `…另 ${n} 节`,
      points: '要点',
      pointsHeading: '读完这份报告该知道的',
      numbers: '数字',
      numbersHeading: '关键指标',
      limits: '边界',
      sizeLine: (n, s) => `全文约 ${n} 字、${s} 节`,
      fullInImage: '完整内容见长图。',
      extractNote: '短图为原文提取，未做改写与推断。',
      summaryNote: (by) => `摘要${by ? `（${by}）` : ''}基于全文撰写，非原文摘录；完整原文与出处见长图。`,
      docFoot: '由 dsh-card-export 渲染。内容为原文档，未做改写与摘要。',
      docFootFlow: '由 dsh-card-export 渲染。内容为原文，未做改写与摘要。',
      genericTitle: '内容',
      defaultTitle: '报告',
    },
  },
  en: {
    htmlLang: 'en',
    verdict: {
      kicker: 'FACT CHECK REPORT',
      kickerDetail: 'FACT CHECK REPORT · DETAIL',
      pageTitle: (t) => `Verdict · ${t}`,
      pageTitleDetail: (t) => `Detail · ${t}`,
      defaultTitle: 'Fact Check Report',
      confidence: 'Confidence',
      tierCount: (n) => `${n} tiers`,
      seeRight: ' · see right',
      tieredVerdict: 'Tiered verdict',
      railA: 'Rail A',
      railB: 'Rail B',
      railJoin: (base, label) => (label ? `${base} ${label}` : base),
      railAHint: 'Rail A · formal verdict',
      railBHint: 'Rail B · conservative reading',
      railBOnlyHint: ' (what still holds once estimates and retold claims are removed)',
      notGiven: '(not given in the report)',
      notGivenShort: '(not given)',
      takeaway: 'One-sentence takeaway',
      basisNote: 'Basis: the verdicts in this report come from public sources; they are not a legal finding of fact, and they change as new evidence appears.',
      coverFoot: (src, facts) => `${src} sources, ${facts} claims tiered; the full audit trail is in the detail image.`,
      detailDiscipline: 'Typesetting discipline: evidence is an appendix, not the body; unconfirmed and unresolved claims never share a block with confirmed ones; every cross-source comparison states whether the readings agree.',
      missing: (list) => `Sections missing from the report template, so no block was generated: ${list.join(', ')}`,
      ban: 'Must not be cited as fact in any retelling',
      sections: {
        background: 'What happened',
        facts: 'What is true, what is false',
        views: 'Domestic vs international coverage',
        stakeholders: 'Stakeholders and contamination surface (annotation only, no downgrade)',
        why: 'Why this happened',
        takeaway: 'One-sentence takeaway',
        unverified: 'What we could not verify',
        sources: 'Sources (numbered appendix)',
        tools: 'Tools and capabilities used',
      },
      buckets: {
        fact: { label: 'Confirmed', sub: 'fact level' },
        interp: { label: 'Confirmed', sub: 'interpretation level (not the fact itself)' },
        unverified: { label: 'Unconfirmed', sub: 'single source or untraceable' },
        unresolvable: { label: 'Unresolved', sub: 'sources conflict, cannot adjudicate' },
      },
      stakeholderTable: { source: 'Source', level: 'Level', basis: 'Observable basis', action: 'Rail B action' },
      derivedRail: (tier, conf, basis) => `${tier} · confidence ${conf}` + (basis ? ` (basis: ${basis})` : ''),
    },
    doc: {
      kickerExtract: 'REPORT · EXCERPT',
      kickerSummary: 'REPORT · SUMMARY',
      kickerDoc: 'REPORT',
      kickerFlow: 'CONTENT',
      lead: 'Lead',
      conclusion: 'Conclusion',
      noConclusion: '(no conclusion provided)',
      contents: 'Contents',
      contentsHeading: 'In this report',
      moreSections: (n) => `…and ${n} more sections`,
      points: 'Points',
      pointsHeading: 'What you need to know',
      numbers: 'Numbers',
      numbersHeading: 'Key figures',
      limits: 'Limits',
      sizeLine: (n, s) => `About ${n} words across ${s} sections`,
      fullInImage: 'the full text is in the long image.',
      extractNote: 'This card is extracted from the report; nothing was rewritten or inferred.',
      summaryNote: (by) => `Summary${by ? ` (${by})` : ''} written from the full text, not an excerpt; the original text and its sources are in the long image.`,
      docFoot: 'Rendered by dsh-card-export. The text is the source document: nothing rewritten, nothing summarised.',
      docFootFlow: 'Rendered by dsh-card-export. The text is as written: nothing rewritten, nothing summarised.',
      genericTitle: 'Content',
      defaultTitle: 'Report',
    },
  },
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const LATIN = /[A-Za-z]/g

/** 判定报告语言：'zh' | 'en'。opts.lang 可强制覆盖（CLI --lang）。 */
export function detectLang(text, opts = {}) {
  if (opts.lang === 'zh' || opts.lang === 'en') return opts.lang
  const s = String(text || '')
  let zhHits = 0
  let enHits = 0
  for (const line of s.split('\n')) {
    if (!/^##\s+/.test(line)) continue
    const head = line.replace(/^##\s+/, '').trim()
    if (Object.values(HEADINGS).some((h) => h.zh.test(head))) zhHits++
    if (Object.values(HEADINGS).some((h) => h.en.test(head))) enHits++
  }
  if (zhHits !== enHits) return zhHits > enHits ? 'zh' : 'en'
  const cjk = (s.match(CJK) || []).length
  if (!cjk) return 'en'
  const latin = (s.match(LATIN) || []).length
  return cjk / (cjk + latin) >= 0.2 ? 'zh' : 'en'
}

/** 取某个语言的界面文案。未知语言按中文（既有产物不变）。 */
export function ui(lang) {
  return UI[lang] || UI.zh
}

/**
 * 字数口径：中文数汉字（原有行为），英文数词。
 * 报告图上的「约 N 字」在英文下必须是 words，否则 12,585 个字符会被读成 12,585 个词。
 */
export function sizeOf(md, lang) {
  const s = String(md || '')
  if (lang === 'en') {
    return s.replace(/[#*|>`_~\[\]()]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
  }
  return s.replace(/\s/g, '').length
}
