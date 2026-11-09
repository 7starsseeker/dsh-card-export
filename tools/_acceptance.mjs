#!/usr/bin/env node
/**
 * 验收脚本：从**装机路径**（profile node_modules 的符号链接）验证三件事
 *   ① 技能候选与正文是现读的（不是打包时的快照）
 *   ② 按技能 id 关闭后，技能立即从 list() 消失
 *   ③ 重新开启后立即恢复
 *
 * 用法：node _acceptance.mjs <装机路径>
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.argv[2]
if (!root) { console.error('用法: node _acceptance.mjs <插件装机目录>'); process.exit(2) }

const { list, get } = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
const cfgDir = process.env.CARD_EXPORT_CONFIG_DIR || join(process.env.LOCALAPPDATA || '', 'dsh-card-export')

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

console.log('① 候选与正文现读：')
let cands = await list()
check('list() 返回两个技能', cands.length === 2, JSON.stringify(cands.map((c) => c.name)))
check('id 正确', cands.map((c) => c.name).sort().join(',') === 'report-card,transcript-card',
  cands.map((c) => c.name).join(','))

for (const cand of cands) {
  const g = await get(cand)
  const raw = readFileSync(cand.path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const body = raw.startsWith('---') ? raw.slice(raw.indexOf('\n---', 3) + 4).trimStart() : raw
  check(`${cand.name} 正文与磁盘一致`, g.content === body,
    `get=${g.content.length} 磁盘=${body.length}`)
  check(`${cand.name} 正文非空且不像快照`, g.content.length > 500, `${g.content.length} 字`)
}

console.log('\n② 按 id 关闭：')
const cfgFile = join(cfgDir, 'config.json')
const before = (() => { try { return readFileSync(cfgFile, 'utf8') } catch { return null } })()
try {
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(cfgDir, { recursive: true })
  writeFileSync(cfgFile, JSON.stringify({ skills: { 'transcript-card': false } }), 'utf8')
  cands = await list()
  check('关闭后只剩 1 个', cands.length === 1, `条数=${cands.length}`)
  check('剩下的是 report-card', cands[0]?.name === 'report-card', String(cands[0]?.name))

  console.log('\n③ 重新开启：')
  writeFileSync(cfgFile, JSON.stringify({ skills: { 'transcript-card': true } }), 'utf8')
  cands = await list()
  check('恢复为 2 个', cands.length === 2, `条数=${cands.length}`)
} finally {
  // 还原原有配置（可能是 null = 本来就没有）
  const { writeFileSync, rmSync } = await import('node:fs')
  if (before === null) { try { rmSync(cfgFile) } catch {} }
  else { writeFileSync(cfgFile, before, 'utf8') }
  console.log(`\n配置已还原（${before === null ? '删除临时 config.json' : '写回原内容'}）`)
}

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
