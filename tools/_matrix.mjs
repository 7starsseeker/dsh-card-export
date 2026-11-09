#!/usr/bin/env node
/**
 * 页面命名与分发矩阵（调试用）。
 * 正式的断言在 tools/smoke-report.mjs；这里只用于人眼看预设走向。
 */
import { readFileSync } from 'node:fs'
import { PRESETS, buildReport, PRESET_INFO } from '../lib/modes/report.mjs'

const fc = readFileSync(new URL('../cases/sample-report.md', import.meta.url), 'utf8')
const gen = readFileSync(new URL('../cases/sample-generic.md', import.meta.url), 'utf8')

console.log('PRESETS =', PRESETS.join(' | '))
for (const p of ['report', 'generic']) {
  console.log(`  ${p}: ${PRESET_INFO[p].for} → ${PRESET_INFO[p].gives}`)
}
console.log('')
for (const [name, md] of [['fact-check', fc], ['普通报告', gen]]) {
  for (const p of ['auto', 'report', 'generic']) {
    const r = buildReport(md, { preset: p })
    console.log(`  ${name} / ${p} → preset=${r.preset} kind=${r.kind} pages=${r.pages.map((x) => x.kind).join('+')}`)
  }
}
