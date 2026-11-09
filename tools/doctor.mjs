#!/usr/bin/env node
/**
 * doctor — 渲染能力诊断。给用户/排障看的可读报告。
 *
 *   node tools/doctor.mjs            # 探测并打印（不落盘、不覆盖 readiness.json）
 *   node tools/doctor.mjs --json     # 机器可读
 *   node tools/doctor.mjs --save     # 探测并把结果写进 readiness.json
 *   node tools/doctor.mjs --first-run # 模拟插件首次挂载：命中缓存就不重测
 */

import { checkEnvironment, adviceOf } from '../lib/render/check.mjs'
import { ensureReadiness, readinessPath } from '../lib/first-run.mjs'

const argv = process.argv.slice(2)
const wantJson = argv.includes('--json')
const wantSave = argv.includes('--save')
const firstRun = argv.includes('--first-run')

function badge(level) {
  return { ok: '✓', warn: '!', error: '✕', info: '·', cmd: '$' }[level] || '·'
}

if (firstRun) {
  const r = await ensureReadiness({ quiet: true })
  const rep = r.report
  if (wantJson) { console.log(JSON.stringify(r, null, 2)); process.exit(0) }
  console.log(`首次挂载判定：${r.firstRun ? `需要探测（原因：${r.reason}）` : '命中缓存，跳过探测'}`)
  console.log(`状态文件：${readinessPath()}`)
  console.log(`渲染等级：${rep.renderLevel}`)
  process.exit(0)
}

const report = await checkEnvironment()
const advice = adviceOf(report)

if (wantJson) {
  console.log(JSON.stringify({ report, advice }, null, 2))
  process.exit(report.renderLevel === 'html' ? 1 : 0)
}

console.log('dsh-card-export · 渲染能力诊断')
console.log('─'.repeat(58))
console.log(`平台        ${report.environment.platform} ${report.environment.arch}  ·  Node ${report.environment.node}`)
console.log(`容器环境    ${report.environment.isContainerLike || '否'}`)
const fc = report.factCheck || { present: 'unknown' }
console.log(`fact-check  ${fc.present === true ? `✓ ${fc.via}  → ${fc.path}`
  : fc.present === false ? '✗ 未检测到（不影响本插件功能）'
    : `? 无法判定（${fc.reason || '未知原因'}）`}`)
console.log(`候选浏览器  ${report.browsers.length ? report.browsers.map(b => `${b.name}(tier${b.tier})`).join(', ') : '（无）'}`)
console.log(`实际选用    ${report.browserPicked ? `${report.browserPicked.name} → ${report.browserPicked.path}` : '（无可用）'}`)
console.log(`PNG 直出    ${report.png.ok ? `✓ ok  高 ${report.png.height}px  ${report.png.bytes} bytes` : `✕ ${report.png.error || '未测'}`}`)
console.log(`PDF 输出    ${report.pdf.ok ? `✓ ok  ${report.pdf.bytes} bytes` : `✕ ${report.pdf.error || '未测'}`}`)
if (report.containerFlagsNeeded) console.log('沙箱特征    检测到（重试时会自动加 --no-sandbox / --disable-dev-shm-usage）')
console.log(`渲染等级    ${report.renderLevel}  —  ${({ png: '可直出长图 PNG', pdf: '只能出 PDF', html: '只能出 HTML' })[report.renderLevel]}`)
console.log(`耗时        ${report.elapsedMs} ms`)
console.log('─'.repeat(58))
for (const a of advice) console.log(`${badge(a.level)} ${a.text}`)

if (wantSave) {
  const r = await ensureReadiness({ force: true, quiet: true })
  console.log(`\n已写入：${readinessPath()}`)
  process.exit(report.renderLevel === 'html' ? 1 : 0)
}

process.exit(report.renderLevel === 'html' ? 1 : 0)
