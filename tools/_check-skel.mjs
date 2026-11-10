import { readFileSync } from 'node:fs'
import { buildReport } from '../lib/modes/report.mjs'
import { loadTable, detectSkeleton, stripTailParen, BUILTIN_TABLE, normalizeTable } from '../lib/modes/skeletons.mjs'

const t = loadTable()
console.log('表来源 =', t.source, '| file =', t.file || '(无)', '| reason =', t.reason)
console.log('骨架数 =', t.skeletons.length, '| ids =', t.skeletons.map((s) => s.id).join(', '))
const v = t.skeletons.find((s) => s.id === 'verdict')
const d = t.skeletons.find((s) => s.id === 'definition')
console.log('verdict 保留 来源 =', v?.match.includes('来源'), '| definition 是否含 来源 =', d?.match.includes('来源'))

console.log('\n剥括号：')
for (const s of ['规范定义（权威原文）', '建议（须标明是建议）', '边界与反例', '构成 / 运作方式', '机制解释（本骨架必写，不是可选项）']) {
  console.log('  ', s, '→', stripTailParen(s))
}

console.log('\n三个夹具识别：')
for (const f of ['fc-2.0.0-definition.md', 'fc-2.0.0-map.md', 'fc-2.0.0-metric.md']) {
  const md = readFileSync(new URL('../cases/' + f, import.meta.url), 'utf8')
  const sk = detectSkeleton(md)
  console.log('  ', f.padEnd(28), sk ? `${sk.id} / lead=${sk.leadTitle} / sec=${sk.secondaryTitle || '-'}` : 'null')
}

console.log('\n陷阱：')
const traps = {
  '边界与反例 + 常见误解（只有 1 个释义特征）': '# X\n\n## 边界与反例\n- 甲\n\n## 常见误解\n- 乙\n',
  '来源 + 定界 + 缺口 + 可比性检验（全是被排除的共享标题）': '# X\n\n## 来源\n- a\n\n## 定界\n- b\n\n## 缺口\n- c\n\n## 可比性检验\n- d\n',
  '数值 + 来源（指标卡只有 1 个特征）': '# X\n\n## 数值\n- a\n\n## 来源\n- b\n',
}
for (const [k, md] of Object.entries(traps)) {
  console.log('  ', k, '→', detectSkeleton(md)?.id ?? 'null（符合预期）')
}

console.log('\n归一表：规则不认识时是否拒绝 =', normalizeTable({ matchRule: 'unknownRule', skeletons: [{ id: 'x', match: ['a'] }] }) === null)
console.log('内置表骨架数 =', BUILTIN_TABLE.skeletons.length)

const md = readFileSync(new URL('../cases/fc-2.0.0-map.md', import.meta.url), 'utf8')
const r = buildReport(md, { preset: 'auto' })
const full = r.pages.find((p) => p.kind === 'full').html
console.log('\n地图详图分层条数 =', (full.match(/class="rail"/g) || []).length)
