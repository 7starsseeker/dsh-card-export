#!/usr/bin/env node
/**
 * config — 技能的按需启停。
 *
 *   node tools/config.mjs --list                # 列出技能、当前状态与配置文件位置
 *   node tools/config.mjs --disable report-card  # 关闭（写入包外 config.json）
 *   node tools/config.mjs --enable  report-card  # 打开
 *   node tools/config.mjs --init                # 写一份带注释的默认配置
 *   node tools/config.mjs --path                # 只打印配置文件路径
 *
 * 关闭后该技能不再出现在技能目录里（不再占用每会话的上下文）。
 */

import { configPath, readUserConfig, writeDefaultConfig, configDir } from '../lib/user-config.mjs'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { SKILLS } from '../lib/index.js'

const argv = process.argv.slice(2)
const has = (k) => argv.includes(`--${k}`)
const val = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null }

/** 已知技能 id（来自插件登记表）。 */
const KNOWN = SKILLS.map((s) => s.name)

function loadRaw() {
  const f = configPath()
  if (!existsSync(f)) return {}
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} }
}

function save(cfg) {
  mkdirSync(configDir(), { recursive: true })
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
}

if (has('path')) { console.log(configPath()); process.exit(0) }

if (has('init')) {
  const f = writeDefaultConfig()
  console.log(`已写入默认配置：${f}`)
  process.exit(0)
}

if (has('list')) {
  const cfg = readUserConfig()
  console.log(`配置文件：${configPath()}${existsSync(configPath()) ? '' : '（不存在，使用默认）'}`)
  console.log(`已知技能：${KNOWN.join(', ') || '（无）'}`)
  for (const [id, on] of Object.entries(cfg.skills)) {
    const known = KNOWN.includes(id) ? '' : '  ← 未在插件登记表中（可能尚未实现）'
    console.log(`  ${on === false ? '✗ 关闭' : '✓ 启用'}  ${id}${known}`)
  }
  process.exit(0)
}

const id = val('disable') || val('enable')
if (!id) {
  console.error('用法: node tools/config.mjs [--list | --init | --path | --disable <id> | --enable <id>]')
  process.exit(2)
}
if (!KNOWN.includes(id)) {
  console.error(`未知技能 id：${id}\n可用：${KNOWN.join(', ')}`)
  process.exit(2)
}

const cfg = loadRaw()
cfg.skills = cfg.skills || {}
cfg.skills[id] = has('enable')
delete cfg._comment
save(cfg)
console.log(`${has('enable') ? '已启用' : '已关闭'}：${id}`)
console.log(`配置文件：${configPath()}`)
console.log('技能目录会在下次刷新时生效（插件监听配置变更需重启 DSH）。')
