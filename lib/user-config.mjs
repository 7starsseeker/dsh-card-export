/**
 * user-config — 包外用户配置（可选）。
 *
 * 位置：<配置目录>/config.json（与 readiness.json 同目录）
 *   Windows  %LOCALAPPDATA%\dsh-card-export\config.json
 *   其它     $XDG_CONFIG_HOME/dsh-card-export/config.json 或 ~/.config/...
 *
 * 为什么不用 cordis 的 loader config：那需要改 profile 树、且随宿主版本漂移；
 * 一个包外 JSON 更稳，也便于用户手改。读失败一律当「用默认值」，绝不阻断插件。
 *
 * 现有字段（全部可选）：
 *   skills.<技能 id>       布尔，默认 true —— 按技能 id 启停，如
 *                          {"skills": {"report-card": false, "transcript-card": false}}
 *   旧键兼容：skills.verdictCard / skills.transcriptCard 仍被识别
 *                          （verdictCard 对应 report-card，改名前的写法）
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_DIR = 'dsh-card-export'

export function configDir() {
  if (process.env.CARD_EXPORT_CONFIG_DIR) return process.env.CARD_EXPORT_CONFIG_DIR
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, APP_DIR)
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, APP_DIR)
  return join(homedir(), '.config', APP_DIR)
}

export function configPath() {
  return join(configDir(), 'config.json')
}

export const DEFAULTS = {
  // 键是技能 id；true 表示启用
  skills: { 'report-card': true, 'transcript-card': true },
}

/** 旧写法 → 现技能 id 的别名表。 */
const LEGACY = { verdictCard: 'report-card', transcriptCard: 'transcript-card' }

/** 读用户配置；缺文件/坏 JSON 一律回默认值。 */
export function readUserConfig() {
  const file = configPath()
  if (!existsSync(file)) return { ...DEFAULTS, skills: { ...DEFAULTS.skills }, _source: null }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const skills = { ...DEFAULTS.skills }
    for (const [k, v] of Object.entries(raw.skills || {})) {
      skills[LEGACY[k] || k] = v
    }
    return { ...DEFAULTS, ...raw, skills, _source: file }
  } catch {
    return { ...DEFAULTS, skills: { ...DEFAULTS.skills }, _source: file, _invalid: true }
  }
}

/** 写一份默认配置（供 `node tools/config.mjs --init`）。 */
export function writeDefaultConfig() {
  mkdirSync(configDir(), { recursive: true })
  const file = configPath()
  writeFileSync(file, JSON.stringify({
    _comment: [
      'dsh-card-export 用户配置。删掉本文件即回到默认（全部技能启用）。',
      '按技能 id 启停：false 表示不注册该技能，它不会出现在技能目录里，省上下文。',
      '  "report-card"      报告图片化导出（任意 Markdown；事实核查报告会出首图+细节图）',
      '  "transcript-card"  对话内容图片化导出（尚未实现，实现前无效）',
    ],
    skills: { ...DEFAULTS.skills },
  }, null, 2), 'utf8')
  return file
}

/** 某个技能是否启用。 */
export function isSkillEnabled(id, cfg = readUserConfig()) {
  return cfg.skills[id] !== false
}
