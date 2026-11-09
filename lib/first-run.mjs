#!/usr/bin/env node
/**
 * first-run — 插件首次挂载时的能力探测与建议（幂等，只跑一次）。
 *
 * 状态落在**包外**：<配置目录>/readiness.json
 *   Windows  %LOCALAPPDATA%\dsh-card-export\readiness.json
 *   其它     $XDG_CONFIG_HOME/dsh-card-export/readiness.json 或 ~/.config/...
 * 与 local.json 分开：那个是用户手写的配置，机器不该覆盖它。
 *
 * 触发条件（任一成立就重测）：
 *   · readiness.json 不存在
 *   · 文件里的 schemaVersion 与当前不一致
 *   · 记录的平台 / Node 主版本与当前不一致（换机器或升级 Node 后能力可能变）
 *   · 显式 force
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { checkEnvironment, adviceOf } from './render/check.mjs'

export const APP_DIR = 'dsh-card-export'
export const SCHEMA_VERSION = 1

export function configDir() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, APP_DIR)
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, APP_DIR)
  return join(homedir(), '.config', APP_DIR)
}

export function readinessPath() {
  if (process.env.CARD_EXPORT_READINESS) return process.env.CARD_EXPORT_READINESS
  return join(configDir(), 'readiness.json')
}

function nodeMajor(v) {
  const m = String(v || '').match(/v(\d+)/)
  return m ? Number(m[1]) : null
}

function readState(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

/** 是否需要重新探测（纯判断，便于单测）。 */
export function needsProbe(state, ctx = {}) {
  if (!state) return 'no-state'
  if (state.schemaVersion !== SCHEMA_VERSION) return 'schema-changed'
  if (state.environment?.platform !== (ctx.platform || process.platform)) return 'platform-changed'
  if (nodeMajor(state.environment?.node) !== nodeMajor(ctx.node || process.version)) return 'node-major-changed'
  return null
}

/**
 * 首次挂载时调用。命中需要探测则跑一次并落盘，然后返回报告与建议。
 * @param {{logger?:{info?:Function,warn?:Function}, force?:boolean, quiet?:boolean}} opts
 * @returns {Promise<{firstRun:boolean, reason:string|null, report:object, advice:object[]}>}
 */
export async function ensureReadiness(opts = {}) {
  const log = opts.logger || {}
  const file = readinessPath()
  const state = readState(file)
  const reason = opts.force ? 'forced' : needsProbe(state, {})

  if (!reason && state) {
    return { firstRun: false, reason: null, report: state, advice: adviceOf(state) }
  }

  let report
  try {
    report = await checkEnvironment()
  } catch (e) {
    report = {
      schemaVersion: SCHEMA_VERSION, checkedAt: new Date().toISOString(),
      environment: { platform: process.platform, node: process.version },
      renderLevel: 'unknown', error: String(e.message || e).slice(0, 300),
      advice: [{ level: 'error', text: `能力探测失败：${String(e.message || e).slice(0, 160)}` }],
    }
  }

  try {
    mkdirSync(configDir(), { recursive: true })
    writeFileSync(file, JSON.stringify(report, null, 2), 'utf8')
  } catch (e) {
    log.warn?.(`dsh-card-export: 能力探测结果无法落盘（${String(e.message || e).slice(0, 120)}），下次启动会重测`)
  }

  const advice = report.advice?.length ? report.advice : adviceOf(report)

  if (!opts.quiet) {
    const line = `dsh-card-export 首次部署探测：${report.renderLevel}（${describeLevel(report.renderLevel)}）` +
      (report.browserPicked ? `，浏览器 ${report.browserPicked.name}` : '')
    if (report.renderLevel === 'png') log.info?.(line)
    else log.warn?.(line)
    for (const a of advice) {
      if (a.level === 'error' || a.level === 'warn') log.warn?.(`  · ${a.text}`)
      else log.info?.(`  · ${a.text}`)
    }
  }

  return { firstRun: true, reason, report, advice }
}

function describeLevel(level) {
  return { png: '可直出长图 PNG', pdf: '只能出 PDF', html: '只能出 HTML', unknown: '探测未完成' }[level] || level
}
