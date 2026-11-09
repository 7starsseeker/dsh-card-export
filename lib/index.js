/**
 * dsh-card-export — DSH 技能提供者：把本包 skills/ 下的技能挂到 `ctx.skills`。
 *
 * 刻意保持的三条性质（与 dsh-fact-check 一致）：
 *   · **不复制技能正文** —— 候选与正文都在调用时从各自的 SKILL.md 现读；
 *   · **零依赖** —— 只 import `node:` 内建与包内相对模块；
 *   · **改 SKILL.md 不必重启** —— 用 registry 给的 `invalidate()` 接住变更。
 *
 * 首装能力探测：挂载时**不阻塞**。探测要跑两次真实渲染（本机约 8.6s），
 * 同步跑会把 DSH 启动拖慢；这里用 setImmediate 排到挂载之后，结果落
 * `<配置目录>/readiness.json`，失败也不影响插件可用（技能仍能出 HTML）。
 *
 * @module dsh-card-export
 */

import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { ensureReadiness } from './first-run.mjs'
import { readUserConfig, isSkillEnabled } from './user-config.mjs'

const ROOT_URL = new URL('..', import.meta.url)
const ROOT_DIR = fileURLToPath(ROOT_URL)

/**
 * 技能登记表。`optional: true` 的技能可被 <配置目录>/config.json 关掉——
 * 典型场景：只想要其中一个能力时，关掉另一个可省下每会话注入的上下文。
 */
export const SKILLS = [
  { name: 'report-card', file: join(ROOT_DIR, 'skills', 'report-card', 'SKILL.md'), optional: true },
  { name: 'transcript-card', file: join(ROOT_DIR, 'skills', 'transcript-card', 'SKILL.md'), optional: true },
]

const PROVIDER_NAME = 'card-export'
const RANK = 600 // bundled
const WATCH_DEBOUNCE_MS = 150

/** 读 frontmatter（只认本包用到的四个键，避免引入 YAML 依赖）。 */
export function parseFrontmatter(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!src.startsWith('---')) return { fm: {}, body: text }
  const end = src.indexOf('\n---', 3)
  if (end === -1) return { fm: {}, body: text }
  const fm = {}
  for (const line of src.slice(3, end).split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return { fm, body: src.slice(end + 4).trimStart() }
}

export function isSkillName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(name))
}

function invocationOf(fm) {
  return {
    modelInvocable: String(fm['disable-model-invocation'] ?? '').toLowerCase() !== 'true',
    userInvocable: String(fm['user-invocable'] ?? '').toLowerCase() !== 'false',
  }
}

/** 读候选：每次调用都重读 SKILL.md 与用户配置，改完立刻生效。 */
export async function list() {
  const cfg = readUserConfig()
  const out = []
  for (const s of SKILLS) {
    if (s.optional && !isSkillEnabled(s.name, cfg)) continue
    const { fm } = parseFrontmatter(await readFile(s.file, 'utf8'))
    if (!isSkillName(fm.name)) throw new Error(`SKILL.md 的 name 不是 kebab-case：${JSON.stringify(fm.name)}（${s.file}）`)
    if (!fm.description) throw new Error(`SKILL.md 缺少 description：${s.file}`)
    if (fm.name !== s.name) throw new Error(`SKILL.md 的 name（${fm.name}）与目录登记（${s.name}）不一致：${s.file}`)
    out.push({
      name: fm.name,
      description: fm.description,
      invocation: invocationOf(fm),
      provider: PROVIDER_NAME,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: ROOT_DIR },
      rank: RANK,
      path: s.file,
      locator: new URL(`file://${s.file}`),
    })
  }
  return out
}

/** 读正文：按候选的 path 分发，不再假设只有一份 SKILL.md。 */
export async function get(candidate) {
  const entry = SKILLS.find((s) => s.name === candidate.name)
  if (!entry) throw new Error(`未知技能：${candidate.name}`)
  if (entry.optional && !isSkillEnabled(entry.name)) throw new Error(`技能已按用户配置关闭：${candidate.name}`)
  const { fm, body } = parseFrontmatter(await readFile(entry.file, 'utf8'))
  if (fm.name !== candidate.name) {
    throw new Error(`SKILL.md 的 name 已变为 ${JSON.stringify(fm.name)}，与候选 ${JSON.stringify(candidate.name)} 不符`)
  }
  return {
    name: candidate.name,
    description: fm.description || candidate.description,
    invocation: candidate.invocation,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: candidate.resourceBase,
    path: entry.file,
    content: body,
  }
}

export const provider = { name: PROVIDER_NAME, list, get }
export const name = PROVIDER_NAME
export const inject = ['skills']

/**
 * 监听 skills/ 目录，任一 SKILL.md 变更就让注册表重读目录。
 * 监听目录而不是文件：编辑器「写临时文件再改名」会让文件级 watcher 失效。
 */
function watchSkills(control, ctx) {
  if (typeof control?.invalidate !== 'function') return () => {}
  let timer
  let closed = false
  let watcher
  try {
    watcher = watch(join(ROOT_DIR, 'skills'), { persistent: false, recursive: true }, (_e, filename) => {
      if (closed) return
      if (filename !== null && !String(filename).endsWith('SKILL.md')) return
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => { timer = undefined; if (!closed) control.invalidate() }, WATCH_DEBOUNCE_MS)
    })
  } catch (error) {
    ctx?.logger?.warn?.(`card-export: 技能目录监听未启动，改 SKILL.md 后需重启：${error.message}`)
    return () => {}
  }
  const stop = () => {
    if (closed) return
    closed = true
    if (timer !== undefined) clearTimeout(timer)
    try { watcher.close() } catch {}
  }
  watcher.on('error', (error) => {
    ctx?.logger?.warn?.(`card-export: 技能目录监听已停用：${error.message}`)
    stop()
  })
  control.signal?.addEventListener?.('abort', stop, { once: true })
  return stop
}

export function apply(ctx) {
  ctx.skills.registerProvider((control) => {
    const stop = watchSkills(control, ctx)
    if (typeof ctx.effect === 'function') ctx.effect(function* () { yield () => stop() }, 'card-export skill watcher')
    return provider
  })

  // 首装探测：不 await，不让 8.6s 的渲染冒烟阻塞插件挂载。
  setImmediate(() => {
    ensureReadiness({ logger: ctx?.logger })
      .then((r) => {
        if (r.firstRun) {
          ctx?.logger?.info?.(`card-export: 首装探测完成，渲染等级 ${r.report.renderLevel}`)
        }
      })
      .catch((e) => ctx?.logger?.warn?.(`card-export: 首装探测失败（不影响使用）：${String(e.message || e).slice(0, 160)}`))
  })
}
