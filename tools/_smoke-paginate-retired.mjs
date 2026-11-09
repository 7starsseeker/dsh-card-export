#!/usr/bin/env node
/**
 * 分页纯计算的单元测试：切点必须落在块边界，且不切碎内容。
 */
import { planPages, describePlan, DEFAULT_SPLIT_PX } from '../lib/render/paginate.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const B = (...hs) => hs.map((h, i) => [i * h, h])

console.log('基本分页：')
check('默认阈值是 8000', DEFAULT_SPLIT_PX === 8000, String(DEFAULT_SPLIT_PX))

let p = planPages(B(1000, 1000, 1000), { target: 8000 })
check('总量小于阈值 → 1 页', p.pages.length === 1)
check('1 页覆盖全部块', p.pages[0].from === 0 && p.pages[0].to === 2)

p = planPages(B(3000, 3000, 3000, 3000), { target: 8000 })
check('4×3000 按 8000 → 2 页', p.pages.length === 2, JSON.stringify(p.pages))
// 3 块 = 9000 > 8000，所以贪心只能放 2 块；断言的是「切点在块边界」这件事
check('第一页装 2 块（9000 超预算）', p.pages[0].from === 0 && p.pages[0].to === 1, JSON.stringify(p.pages[0]))
check('第二页从第 3 块开始', p.pages[1].from === 2)

console.log('\n边界情况：')
p = planPages(B(9000), { target: 8000 })
check('单块超阈值 → 独占 1 页（不切碎）', p.pages.length === 1 && p.pages[0].from === 0 && p.pages[0].to === 0)
check('超阈值块被记录', p.oversized.includes(0))

p = planPages(B(5000, 5000), { target: 8000 })
check('两块各 5000 → 2 页', p.pages.length === 2)

p = planPages([], { target: 8000 })
check('空输入 → 0 页且不崩', p.pages.length === 0)

p = planPages(B(100, 100), { target: 500, head: 100, foot: 200 })
check('预算 200 刚好装下两块 → 1 页', p.pages.length === 1, JSON.stringify(p.pages))

p = planPages(B(150, 150), { target: 500, head: 100, foot: 200 })
check('预算低于下限时按 400 算（两块 150 仍装得下）', p.pages.length === 1, JSON.stringify(p.pages))

p = planPages(B(400, 400), { target: 1000, head: 200, foot: 200 })
check('页眉页脚吃掉预算（600）后两块 400 装不下 → 2 页', p.pages.length === 2, JSON.stringify(p.pages))

p = planPages(B(10, 10), { target: 100, head: 200, foot: 200 })
check('预算被挤到下限时仍出页', p.pages.length >= 1)

console.log('\n连续性：')
const blocks = B(...Array(20).fill(700))
p = planPages(blocks, { target: 8000 })
const contiguous = p.pages.every((pg, i) => i === 0 ? pg.from === 0 : pg.from === p.pages[i - 1].to + 1)
check('每页首尾相接、无块丢失', contiguous && p.pages[p.pages.length - 1].to === 19, JSON.stringify(p.pages))
check('describePlan 给出摘要', describePlan(p, 14000).includes('共'))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
