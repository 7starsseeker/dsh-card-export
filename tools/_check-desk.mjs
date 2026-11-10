import { readFileSync, statSync } from 'node:fs'

const DESK = 'G:/Users/Administrator/Desktop/fact-check-2.0.0-骨架锚点工单.md'
const DRAFT = 'T:/dsh-card-export/proposals/skeleton-anchors.draft.json'

const md = readFileSync(DESK, 'utf8')
const bytes = statSync(DESK).size
const bom = readFileSync(DESK).subarray(0, 3).toString('hex')
console.log('desk size =', bytes, 'bytes | first3 =', bom, '| lines =', md.split('\n').length)

const m = md.match(/```json\n([\s\S]*?)\n```/)
if (!m) { console.log('FAIL: 找不到 json 代码块'); process.exit(1) }

let embedded
try { embedded = JSON.parse(m[1]) } catch (e) { console.log('FAIL: 内嵌 JSON 解析失败 —', e.message); process.exit(1) }
const draft = JSON.parse(readFileSync(DRAFT, 'utf8'))

const same = JSON.stringify(embedded) === JSON.stringify(draft)
console.log('内嵌 JSON 合法 =', true, '| 与 draft 完全一致 =', same)
console.log('骨架 id =', embedded.skeletons.map((s) => s.id).join(', '))
console.log('exportCard=true 的骨架 =', embedded.skeletons.filter((s) => s.exportCard).map((s) => s.id).join(', ') || '(无)')

// 跨骨架撞车自检（同一短标题不得出现在两个骨架的 match 里）
const seen = new Map()
const dup = []
for (const s of embedded.skeletons) {
  for (const t of [...s.match, ...(s.matchEn || [])]) {
    if (seen.has(t) && seen.get(t) !== s.id) dup.push(`${t}: ${seen.get(t)} × ${s.id}`)
    seen.set(t, s.id)
  }
}
console.log('跨骨架撞车 =', dup.length ? dup.join(' / ') : '无')
const excluded = new Set([...(embedded.sharedHeadings?.noSkeletonMayUse?.zh || []), ...(embedded.sharedHeadings?.noSkeletonMayUse?.en || [])])
const leaked = [...seen.keys()].filter((t) => excluded.has(t))
console.log('noSkeletonMayUse 漏进 match =', leaked.length ? leaked.join(' / ') : '无')

// verdictOnly 只许出现在裁决里
const only = new Set([...(embedded.sharedHeadings?.verdictOnly?.zh || []), ...(embedded.sharedHeadings?.verdictOnly?.en || [])])
const misplaced = [...only].filter((t) => seen.has(t) && seen.get(t) !== 'verdict')
console.log('verdictOnly 出现在别的骨架 =', misplaced.length ? misplaced.join(' / ') : '无')
console.log('verdict 是否保留 来源 锚点 =', embedded.skeletons.find((s) => s.id === 'verdict').match.includes('来源'))

/* ---------- 用真实 SKILL.md 验证 match / matchEn（对面 lint 要断言的那两条） ---------- */
const SKILL = 'T:/fact-check-skill/SKILL.md'
const sk = readFileSync(SKILL, 'utf8').split('\n')
const stripParen = (s) => String(s).replace(/[（(][^）)]*[）)]\s*$/, '').trim()
const BLOCK = {
  verdict: '#### 4-V 裁决', definition: '#### 4-E 释义', causal: '#### 4-C 因果机制',
  compare: '#### 4-M 对照', map: '#### 4-S 地图', metric: '#### 4-L 指标卡',
}
function blockHeadings(marker) {
  const i = sk.findIndex((l) => l.startsWith(marker))
  if (i < 0) return null
  const out = []
  for (let k = i + 1; k < sk.length; k++) {
    if (/^###\s/.test(sk[k]) || /^####\s/.test(sk[k])) break
    const h = sk[k].match(/^##\s+(.+)$/)
    if (h) out.push(stripParen(h[1]))
  }
  return out
}
function seqLine(prefix) {
  const line = sk.find((l) => l.startsWith(prefix + ' '))
  if (!line) return null
  return line.replace(prefix, '').trim().split('·').map((x) => stripParen(x)).filter(Boolean)
}

console.log('\n—— 用 SKILL.md 核对（对面 lint 断言 2 / 3）——')
const EN_SEQ = { verdict: ['4-V'], definition: ['4-E'], causal: ['4-C1', '4-C2', '4-C3'], compare: ['4-M'], map: ['4-S'], metric: ['4-L'] }
let bad = 0
for (const s of embedded.skeletons) {
  const zh = blockHeadings(BLOCK[s.id])
  const missZh = s.match.filter((m) => !zh?.some((h) => h === m))
  const en = (EN_SEQ[s.id] || []).flatMap((p) => seqLine(p) || [])
  const missEn = en.length ? s.matchEn.filter((m) => !en.some((h) => h === m)) : s.matchEn
  const zhOk = zh && !missZh.length
  console.log(`${s.id.padEnd(11)} zh ${zh ? zh.length + ' 个标题' : '块没找到'} → ${zhOk ? 'ok' : '缺 ' + missZh.join(' / ')}` +
    ` | en ${en.length ? en.length + ' 个标题' : '序列没找到'} → ${en.length && !missEn.length ? 'ok' : '缺 ' + missEn.join(' / ')}`)
  if (!zhOk || missEn.length || !en.length) bad++
}
process.exit(bad || !same || dup.length || leaked.length || misplaced.length ? 1 : 0)
