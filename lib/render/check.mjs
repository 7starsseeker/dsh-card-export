#!/usr/bin/env node
/**
 * check — 部署环境「能不能出图」的真实能力探测。
 *
 * 与 rasterize 的 --probe 的区别：那个只问「有没有浏览器」，这个跑一次**真实渲染**
 * （PNG 一次、PDF 一次），因为 --version 能过、截图照样可能因沙箱失败。
 *
 * 输出分级（renderLevel），决定这个部署实际能拿到什么：
 *   png  —— 首选，长图直出
 *   pdf  —— 只能出 PDF（PNG 失败但 PDF 可用，常见于宽高比/沙箱受限）
 *   html —— 只能交付 HTML（无可用 Chromium），用户自行截图/打印
 *
 * 零依赖；不修改任何用户配置，只在临时目录做一次性冒烟后清理。
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir, platform, arch, release } from 'node:os'
import { join } from 'node:path'
import { render, listBrowsers, probeBrowser } from './rasterize.mjs'

/**
 * 探测本机是否装了 dsh-fact-check（技能或插件形态都算）。
 *
 * 为什么不问宿主：本插件只 inject 了 skills 服务，没有可靠的「列出全部技能」入口；
 * 而 fact-check 的安装落点是稳定的——要么作为插件进 profile 的 node_modules，
 * 要么作为技能进 <DSH_HOME>/skills。两处都查，比猜 API 稳。
 *
 * @returns {{present:boolean|'unknown', via:string|null, path:string|null, reason?:string}}
 */
export function detectFactCheck() {
  const home = process.env.DSH_HOME
  if (!home || !existsSync(home)) {
    return { present: 'unknown', via: null, path: null, reason: 'DSH_HOME 未设置或不存在，无法定位技能/插件目录' }
  }

  // ① 插件形态：<home>/profiles/<profile>/node_modules/dsh-fact-check
  try {
    const profiles = join(home, 'profiles')
    if (existsSync(profiles)) {
      for (const p of readdirSync(profiles, { withFileTypes: true })) {
        if (!p.isDirectory()) continue
        const pkg = join(profiles, p.name, 'node_modules', 'dsh-fact-check', 'package.json')
        if (existsSync(pkg)) return { present: true, via: `plugin@${p.name}`, path: pkg }
      }
    }
  } catch { /* 探测失败按未知处理，不影响主流程 */ }

  // ② 技能形态：<home>/skills/*/SKILL.md 且 frontmatter name 为 fact-check
  try {
    const skills = join(home, 'skills')
    if (existsSync(skills)) {
      for (const d of readdirSync(skills, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const f = join(skills, d.name, 'SKILL.md')
        if (!existsSync(f)) continue
        const head = readFileSync(f, 'utf8').slice(0, 800)
        if (/^name:\s*fact-check\s*$/m.test(head)) return { present: true, via: `skill@${d.name}`, path: f }
      }
    }
  } catch { /* 同上 */ }

  return { present: false, via: null, path: null }
}

/** 冒烟用的最小页面：自带高度自报，尺寸小、渲染快。 */
const SMOKE_HTML = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><style>
body{margin:0;font:14px/1.7 "Microsoft YaHei",sans-serif;background:#fff}
.c{width:420px;padding:16px;border-left:4px solid #1F3A8A}
</style></head><body><div class="c"><b>render smoke test</b><br>这张图只用于验证渲染链路是否可用。</div>
<script>window.addEventListener('load',function(){
  var h=Math.ceil(document.querySelector('.c').getBoundingClientRect().height)+48;
  document.documentElement.setAttribute('data-h',h);document.title='H='+h;});</script>
</body></html>`

/**
 * 探测部署环境。
 * @param {{tmpBase?:string, keepArtifacts?:boolean}} opts
 * @returns {Promise<object>} 结构化报告（可直接喂给建议生成器）
 */
export async function checkEnvironment(opts = {}) {
  const started = Date.now()
  const env = {
    platform: platform(), arch: arch(), release: release(),
    node: process.version, dshHome: process.env.DSH_HOME || null,
    isContainerLike: detectContainer(),
  }

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    environment: env,
    browsers: listBrowsers(),
    browserPicked: null,
    png: { ok: false },
    pdf: { ok: false },
    containerFlagsNeeded: false,
    renderLevel: 'html',
    factCheck: detectFactCheck(),
    advice: [],
    elapsedMs: 0,
  }

  const picked = await probeBrowser()
  report.browserPicked = picked.browser ? { name: picked.browser.name, path: picked.browser.path } : null
  report.probeTried = picked.tried

  if (!picked.browser) {
    report.elapsedMs = Date.now() - started
    report.renderLevel = 'html'
    return report
  }

  // 临时目录：探测产物用完即删，不污染用户目录
  const base = opts.tmpBase || tmpdir()
  let dir
  try { dir = mkdtempSync(join(base, 'card-export-check-')) } catch { dir = join(base, `card-export-check-${Date.now()}`); mkdirSync(dir, { recursive: true }) }
  const page = join(dir, 'smoke.html')
  try {
    writeFileSync(page, SMOKE_HTML, 'utf8')

    // ① PNG：显式 mode:png，禁止降级——要的正是「能否直出长图」这个答案
    const png = await render(page, join(dir, 'smoke.png'), { width: 480, mode: 'png' })
    report.png = { ok: !!png.ok, bytes: png.bytes || 0, height: png.height || 0,
      error: png.ok ? null : (png.error || '未知'), attempts: png.attempts || [] }
    if (!png.ok) {
      const text = JSON.stringify(png.attempts || [])
      report.containerFlagsNeeded = /sandbox|dev\/shm|zygote|namespace/i.test(text)
    }

    // ② PDF：PNG 失败时也要知道 PDF 是否可用（这决定降级到 pdf 还是 html）
    const pdf = await render(page, join(dir, 'smoke.pdf'), { width: 480, mode: 'pdf' })
    report.pdf = { ok: !!pdf.ok, bytes: pdf.bytes || 0, error: pdf.ok ? null : (pdf.error || '未知') }
  } finally {
    if (!opts.keepArtifacts) { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
    else report.artifacts = dir
  }

  report.renderLevel = report.png.ok ? 'png' : (report.pdf.ok ? 'pdf' : 'html')
  report.elapsedMs = Date.now() - started
  return report
}

/** 容器特征探测（只做启发式，用于给出更贴合的建议，不参与能力判定）。 */
function detectContainer() {
  if (existsSync('/.dockerenv')) return 'docker'
  if (existsSync('/run/.containerenv')) return 'podman'
  const env = process.env
  if (env.KUBERNETES_SERVICE_HOST) return 'kubernetes'
  if (env.container) return env.container
  return null
}

/** 各平台的安装建议（按实际探测结果给出，不是通用文案）。 */
export function adviceOf(report) {
  const a = []
  const plat = report.environment.platform
  const inContainer = !!report.environment.isContainerLike

  // fact-check 探测：只说事实与差异，不推销。
  // 原则——没装就只介绍它是干什么的，不给安装命令、不给链接、不写"建议安装"。
  const fc = report.factCheck || { present: 'unknown' }
  if (fc.present === true) {
    a.push({
      level: 'info',
      text: '检测到 dsh-fact-check：本插件对它的报告有渲染优化——会自动多出一张结论短图，'
        + '并把断言按「已证实 / 未证实 / 无法裁定」分档、单列甲/乙双轨。普通 Markdown 报告不受影响，仍是短图+长图。',
    })
  } else if (fc.present === false) {
    a.push({
      level: 'info',
      text: '本机未检测到 dsh-fact-check。它是一套「联网多源交叉核实、结论先行、来源可溯源」的核查技能，'
        + '输出固定结构的核查报告。',
    })
    a.push({
      level: 'info',
      text: '本插件对它的加成仅限于：若报告是那个结构，短图会多出档位与双轨。没有它，export 照常可用，'
        + '任意 Markdown 报告都能出短图 + 长图，功能不缺。',
    })
  }
  // present === 'unknown'（找不到 DSH_HOME 等）时静默跳过：不猜、不说。

  if (report.renderLevel === 'png') {
    a.push({ level: 'ok', text: `渲染就绪：${report.browserPicked.name} 可直出 PNG 长图。无需任何额外部署。` })
    return a
  }

  if (report.renderLevel === 'pdf') {
    a.push({ level: 'warn', text: 'PNG 直出失败，但 PDF 可用。产物会是 PDF（无高度上限，按 A4 排版），不是长图。' })
    if (report.containerFlagsNeeded) {
      a.push({ level: 'warn', text: '失败特征显示是沙箱/共享内存问题（容器常见）；插件重试时会自动加 --no-sandbox --disable-dev-shm-usage。' })
    }
    return a
  }

  // 完全没有可用浏览器
  a.push({ level: 'error', text: '未找到可用的 Chromium 系浏览器：当前只能输出 HTML，需要自行截图或打印为 PDF。' })

  if (inContainer) {
    a.push({ level: 'info', text: `检测到容器环境（${report.environment.isContainerLike}）。推荐镜像内安装 Chromium：` })
    a.push({ level: 'cmd', text: 'Debian/Ubuntu:  apt-get update && apt-get install -y chromium' })
    a.push({ level: 'cmd', text: 'Alpine:         apk add --no-cache chromium' })
    a.push({ level: 'cmd', text: '并给容器更大共享内存：docker run --shm-size=512m …' })
    a.push({ level: 'info', text: '装好后运行 node tools/doctor.mjs 复测；沙箱受限时插件会自动追加 --no-sandbox 重试。' })
  } else if (plat === 'win32') {
    a.push({ level: 'cmd', text: 'winget install --id Microsoft.Edge' })
    a.push({ level: 'info', text: 'Windows 11 通常已预装 Edge，若探测不到请确认未被精简版镜像移除。' })
  } else if (plat === 'darwin') {
    a.push({ level: 'cmd', text: 'brew install --cask microsoft-edge   # 或 google-chrome' })
  } else {
    a.push({ level: 'cmd', text: 'Debian/Ubuntu:  apt-get install -y chromium' })
    a.push({ level: 'cmd', text: 'Fedora:         dnf install -y chromium' })
  }

  a.push({ level: 'info', text: '也可以什么都不装：HTML 产物一样完整，只是分享出去前需要你自己截一张。' })
  return a
}
