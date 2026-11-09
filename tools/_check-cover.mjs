#!/usr/bin/env node
/** 看首图里「定档」是否已拆成逐条。 */
import { readFileSync } from 'node:fs'
import { parseReport, renderCover } from '../lib/modes/verdict.mjs'

const md = readFileSync('G:/Users/Administrator/Documents/deepseek-harness/default-workspace/影之刃零_事实核查报告.md', 'utf8')
const d = parseReport(md)
console.log('档位条目：')
for (const t of d.verdict.tierItems) console.log(`  [${t.label}] → ${t.scope.slice(0, 50)}`)
const cover = renderCover(d)
console.log('tier-row 数:', (cover.match(/tier-row/g) || []).length)
console.log('定档整句是否仍混在段落里:', cover.includes('定档：'))
console.log('徽标类型:', cover.includes('分档结论') ? '中性分档' : '单一')
