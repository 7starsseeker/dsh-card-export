#!/usr/bin/env node
/**
 * render-verdict — 已废弃，仅为兼容保留。
 * 现入口：node tools/render-report.mjs <report.md> --out <dir> [--preset factcheck]
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
console.warn('[deprecated] render-verdict.mjs 已改为 render-report.mjs；本次调用会自动转发。\n')
const r = spawnSync(process.execPath, [join(HERE, 'render-report.mjs'), ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
