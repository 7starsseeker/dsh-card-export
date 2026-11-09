#!/usr/bin/env node
/**
 * 完整性自检：报告 → 详情图，**逐行核对原文是否都落在图上**。
 *
 * 为什么需要这一组：渲染"成功"不等于内容"在"。真实报告里出现过三类静默丢失——
 *   ① 表格型段落只认 `- ` 项目符号 ⇒ 整张表没渲染；
 *   ② 段尾 `---` 被当成正文画出来；
 *   ③ 列表续行被 trim 掉缩进 ⇒ 每项变成独立 <ol>，编号全变成 1。
 * 这三类都不会报错，只能靠"原文每行都能在输出里找到"来抓。
 */
import { parseReport, renderDetail } from '../lib/modes/verdict.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const norm = (s) => String(s)
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#160;/g, ' ')
  .replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')
  .replace(/[\s*`|>#\-—–·\[\]]+/g, '')
  .replace(/[（）()：:，,、；;。.！!？?"'“”‘’…]+/g, '')
  .toLowerCase()

const MD = `# 自测核查报告

## 一句话结论

**这一组数字整体成立，但销量是第三方估算。**

定档：**已证实 / 高**（媒体评分与在线峰值）；**很可能属实 / 中高**（销量量级）。

乙轨（剔除估算与转述后仍成立的部分）：媒体评分与好评率可独立复现。

---

## 始末 / 事实概要

产品于 10-29 发售，同步登陆三个平台 [1]。

### A. 发布前的预热

预购期共两轮宣发，官方未公布数字 [2]。

---

## 哪些是真的、哪些是假的

### ✅ 已证实 — 事实级（多独立来源）

| # | 论断 | 独立来源 | 定档 |
|---|---|---|---|
| 1 | 发售日为 10-29 | 官网 [1] | 已证实/高 |
| 2 | 峰值 822,361 | SteamCharts [2] | 已证实/高 |

### ⚠️ 未证实（单一来源，逐条带警示语）

> **⚠️ 警示：以下每条都只有单一来源。**

1. **「预购 85 万份」**
   唯一上游是 Alinea 的估算 [3]。
   *这是最大的口径风险。*

2. **「含 WeGame 破 100 万」**
   同样出自 Alinea，经 IGN 转述 [4]。

3. **「775,000+ 同时在线」**
   仅见社媒转述 [5]。

---

## 国内外视角

### 国内渠道

- **评论体量压倒性**：简中 37,014 篇，是英文的 9.2 倍 [6]。

---

## 利益相关与污染面

**甲轨（正式结论，不因来源标注降档）**：媒体 88 分、峰值 82.2 万均成立。

**乙轨（剔除 L1/L2 标注源后重算）**：剔除估算后销量不成立。

1. **首发时序**：所有销量数字都产生在发售前。

2. **引用链形状**：单点辐射结构。

---

## 为什么会这样

### C. 对比性分析

| 对比对象 | 结论 | 强度 |
|---|---|---|
| 前作 | 销量是 6.4 倍 | 中 |

---

## 一句话总结

**这不是爆款或翻车，而是口碑被技术问题拖住后腿的典型样本。**

---

## 本次未能核实到的

| 缺口 | 尝试过什么 | 结果 |
|---|---|---|
| 官方销量 | 官网、官方 X | 均无 |
| Epic 一手页 | 浏览器直连 | 403 |

---

## 来源（编号附录）

**官方 / 一手**
1. S-GAME 官网 https://example.com/a
2. SteamCharts https://example.com/b

**研究机构 / 估算**
3. Alinea Substack https://example.com/c

> 注：编号 4 为已剔除来源，未进入任何计数。

---

## 工具与能力使用情况

- 检索 12 轮，抓取 8 个页面。
`

const data = parseReport(MD)
const html = renderDetail(data)
const rendered = norm(html)

console.log('逐行覆盖：')
// 按 ## 切原文，逐行核对（表格行拆单元格；跳过不在详情图的「一句话结论」与纯标签行）
const sections = []
let cur = null
for (const line of MD.split('\n')) {
  const h2 = line.match(/^##\s+(.+)$/)
  if (h2) { cur = { title: h2[1].trim(), lines: [] }; sections.push(cur); continue }
  if (/^#\s/.test(line)) { cur = null; continue }
  if (cur) cur.lines.push(line)
}
let total = 0, missed = 0
for (const sec of sections) {
  if (/^一句话结论/.test(sec.title)) continue
  const probes = []
  for (const raw of sec.lines) {
    const l = raw.replace(/https?:\/\/\S+/g, '').trim()
    if (!l || /^-{3,}$/.test(l) || /^\|?\s*:?-{2,}/.test(l)) continue
    if (/^\*\*[^*]{2,30}[（(][^）)]*[）)][^*]*\*\*[：:]?$/.test(l)) continue
    for (const cell of (l.includes('|') ? l.replace(/^\||\|$/g, '').split('|') : [l])) {
      const n = norm(cell)
      if (n.length >= 4) probes.push({ raw: cell.trim(), n })
    }
  }
  const miss = probes.filter((p) => !rendered.includes(p.n))
  total += probes.length
  missed += miss.length
  check(`${sec.title}（${probes.length - miss.length}/${probes.length}）`, miss.length === 0,
    miss.slice(0, 2).map((m) => m.raw.slice(0, 40)).join(' / '))
}
check(`合计 ${total - missed}/${total} 行都在图上`, missed === 0, `丢 ${missed} 行`)

console.log('\n列表编号：')
{
  const ols = [...html.matchAll(/<ol>([\s\S]*?)<\/ol>/g)]
  check('「未证实」的三条合成一个 <ol>', ols.length === 1, `实际 ${ols.length} 个 <ol>`)
  check('该 <ol> 含 3 个 <li>', (ols[0]?.[1].match(/<li>/g) || []).length === 3,
    String((ols[0]?.[1].match(/<li>/g) || []).length))
  check('列表项含续行（不是只有标题行）', /<li>[\s\S]{40,}?<\/li>/.test(ols[0]?.[1] || ''))
}

console.log('\n结构与保真：')
check('正文没有残留的 ---', !/-{3,}/.test(html))
check('表格型段落渲染成 <table>', html.includes('<table'))
check('表格表头保留「定档」列', /<th>定档<\/th>/.test(html))
check('来源分组标题保留', /官方 \/ 一手/.test(html) && /研究机构 \/ 估算/.test(html))
check('来源附录末尾的注保留', /已剔除来源/.test(html))
check('双轨限定语保留原文', /甲轨（正式结论，不因来源标注降档）/.test(html))
check('段间有分隔线可裁', (html.match(/data-cut/g) || []).length >= 7)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
