#!/usr/bin/env node
/**
 * rasterize — HTML 页面 → 长图 PNG / PDF（零 npm 依赖，走系统 Chromium 系浏览器 CLI）
 *
 * 探测顺序：Edge（Win11 默认）→ Chrome → 其他 Chromium（Brave/Chromium/Vivaldi）
 * 降级顺序：PNG(scale 2) → PNG(scale 1) → PDF（无高度上限）→ 仅交付 HTML
 *
 * 容器 / 无桌面部署（DSH Web、docker）：
 *   · 探测链同样覆盖 Linux 路径（chromium / chromium-browser / google-chrome / microsoft-edge）；
 *   · 容器里 Chromium 常因沙箱或 /dev/shm 太小而首轮失败（stderr: "No usable sandbox" /
 *     "Failed to move to new namespace" / dev/shm），此时自动追加 --no-sandbox
 *     --disable-dev-shm-usage 重试一次；
 *   · 这两个参数会降低隔离强度，**因此不作为默认值**，只在首轮命中特征时才启用；
 *   · 容器里完全没装 Chromium 时，链路终点是 HTML —— 这是设计内的行为，不是故障。
 *
 * 用法：
 *   node rasterize.mjs <page.html> <out.png> [--width 960] [--scale 2] [--mode auto|png|pdf] [--browser <path>]
 *   node rasterize.mjs --probe            # 只探测本机有哪些可用浏览器
 *
 * 设计约束：
 *   · 只 import node: 内置模块，不引 puppeteer —— 长页面用 --window-size 精确设高即可（实测 8086px 可出）；
 *   · 高度由页面自行写进 <html data-h> 或 <title>H=n</title>，读不到就明确报错，不猜；
 *   · 任一降级都会在返回值的 mode / fallback 字段里留下痕迹，不静默。
 */

import { existsSync, statSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, resolve, join, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { platform } from 'node:os'
import { blankBottom } from './blank-height.mjs'

/** 探测候选项。Windows 优先，macOS/Linux 一并列出（DSH 插件不限平台）。 */
function candidates() {
  const env = process.env
  const pf = env['ProgramFiles'] || 'C:\\Program Files'
  const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const lad = env['LOCALAPPDATA'] || ''
  const out = []

  if (env.RENDER_BROWSER) out.push({ name: 'RENDER_BROWSER', path: env.RENDER_BROWSER, tier: 0 })

  // 1. Edge
  out.push(
    { name: 'Edge', path: join(pf86, 'Microsoft/Edge/Application/msedge.exe'), tier: 1 },
    { name: 'Edge', path: join(pf, 'Microsoft/Edge/Application/msedge.exe'), tier: 1 },
  )
  if (lad) out.push({ name: 'Edge', path: join(lad, 'Microsoft/Edge/Application/msedge.exe'), tier: 1 })

  // 2. Chrome
  out.push(
    { name: 'Chrome', path: join(pf, 'Google/Chrome/Application/chrome.exe'), tier: 2 },
    { name: 'Chrome', path: join(pf86, 'Google/Chrome/Application/chrome.exe'), tier: 2 },
  )
  if (lad) out.push({ name: 'Chrome', path: join(lad, 'Google/Chrome/Application/chrome.exe'), tier: 2 })

  // 3. 其他 Chromium
  out.push(
    { name: 'Brave', path: join(pf, 'BraveSoftware/Brave-Browser/Application/brave.exe'), tier: 3 },
    { name: 'Chromium', path: join(pf, 'Chromium/Application/chrome.exe'), tier: 3 },
    { name: 'Vivaldi', path: join(lad, 'Vivaldi/Application/vivaldi.exe'), tier: 3 },
  )

  if (platform() !== 'win32') {
    out.push(
      { name: 'Edge', path: '/usr/bin/microsoft-edge', tier: 1 },
      { name: 'Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', tier: 1 },
      { name: 'Chrome', path: '/usr/bin/google-chrome', tier: 2 },
      { name: 'Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', tier: 2 },
      { name: 'Chromium', path: '/usr/bin/chromium', tier: 3 },
      { name: 'Chromium', path: '/usr/bin/chromium-browser', tier: 3 },
    )
  }

  const seen = new Set()
  return out.filter((c) => {
    if (!c.path || seen.has(c.path.toLowerCase())) return false
    seen.add(c.path.toLowerCase())
    try { return existsSync(c.path) && statSync(c.path).isFile() } catch { return false }
  }).sort((a, b) => a.tier - b.tier)
}

function run(bin, args, { timeout = 90000 } = {}) {
  return new Promise((res, rej) => {
    execFile(bin, args, { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) { err.stderr = stderr; return rej(err) }
        res({ stdout: String(stdout || ''), stderr: String(stderr || '') })
      })
  })
}

const BASE_ARGS = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--disable-extensions', '--virtual-time-budget=3000',
]

/** 容器专用参数：降低隔离强度，仅在首轮命中沙箱特征时追加。 */
const CONTAINER_FLAGS = ['--no-sandbox', '--disable-dev-shm-usage']

/** 首轮失败后，靠 stderr 判断「该不该用容器参数重试」。 */
const CONTAINER_HINTS = /no usable sandbox|sandbox[- ]?|failed to move to new namespace|dev\/shm|zygote|operation not permitted/i

/** 首轮失败后，靠 stderr 判断「该不该用容器参数重试」。导出以便单测。 */
export function hitContainerHints(tried) {
  if (process.env.RENDER_FORCE_CONTAINER_RETRY === '1') return true // 调试用：强制走重试分支
  try { return CONTAINER_HINTS.test(JSON.stringify(tried || [])) } catch { return false }
}

/** 列出本机所有存在的候选浏览器（不做可执行性验证，供能力探测展示用）。 */
export function listBrowsers() {
  return candidates().map(({ name, path, tier }) => ({ name, path, tier }))
}

/** 依次尝试，返回第一个能跑通 --version 的浏览器。 */
export async function probeBrowser() {
  const found = candidates()
  const tried = []
  for (const c of found) {
    try {
      await run(c.path, ['--version'], { timeout: 15000 })
      tried.push({ ...c, ok: true })
      return { browser: c, tried, available: found.map(({ name, path, tier }) => ({ name, path, tier })) }
    } catch (e) {
      tried.push({ ...c, ok: false, error: String(e.message || e).slice(0, 120) })
    }
  }
  return { browser: null, tried, available: found.map(({ name, path, tier }) => ({ name, path, tier })) }
}

/**
 * 页面自报高度。优先用 `data-hb`（卡片底边）：文档 scrollHeight 会包含卡片之外的
 * 额外高度，导致截图底部出现几十到几百像素的空白带；卡片底边是画面上真实的结束位置。
 * 没有 data-hb 的老页面退回 data-h / title。
 */
async function measure(bin, url, width) {
  const { stdout } = await run(bin, [...BASE_ARGS, '--dump-dom', `--window-size=${width},1200`, url])
  const hb = stdout.match(/data-hb="(\d+)"/)
  if (hb) return Number(hb[1])
  const m = stdout.match(/data-h="(\d+)"/) || stdout.match(/H=(\d+)/)
  return m ? Number(m[1]) : null
}

function swapExt(p, ext) {
  const i = p.lastIndexOf('.')
  return (i > 0 ? p.slice(0, i) : p) + ext
}

function isRealFile(p) {
  try { return statSync(p).size > 0 } catch { return false }
}

/** PDF 是否真的是 PDF（首 4 字节 %PDF）。浏览器偶尔会「成功退出但没写文件」。 */
function looksLikePdf(p) {
  try { return readFileSync(p).subarray(0, 4).toString('latin1') === '%PDF' } catch { return false }
}

async function exportPng(bin, url, outPng, { width, height, scales, container = false }) {
  const tried = []
  const extra = container ? CONTAINER_FLAGS : []
  for (const scale of scales) {
    try {
      await run(bin, [...BASE_ARGS, ...extra, `--force-device-scale-factor=${scale}`,
        `--screenshot=${outPng}`, `--window-size=${width},${height}`, url])
      if (!isRealFile(outPng)) throw new Error('截图文件不存在或为空')
      return { ok: true, path: outPng, scale, bytes: statSync(outPng).size, tried, container }
    } catch (e) {
      tried.push({ scale, container, error: String(e.stderr || e.message || e).slice(0, 200) })
    }
  }
  return { ok: false, tried }
}

async function exportPdf(bin, url, outPdf, { container = false } = {}) {
  try {
    await run(bin, [...BASE_ARGS, ...(container ? CONTAINER_FLAGS : []),
      '--no-pdf-header-footer', `--print-to-pdf=${outPdf}`, url])
    if (!isRealFile(outPdf)) throw new Error('PDF 文件不存在或为空')
    if (!looksLikePdf(outPdf)) throw new Error('输出不是合法 PDF（首字节不是 %PDF）')
    return { ok: true, path: outPdf, bytes: statSync(outPdf).size, container }
  } catch (e) {
    return { ok: false, error: String(e.stderr || e.message || e).slice(0, 200) }
  }
}

/** PNG：首轮失败且命中容器特征时，追加容器参数重试一次（结果带 containerRetry 标记）。 */
async function pngAttempt(bin, url, outPng, opts) {
  const first = await exportPng(bin, url, outPng, opts)
  if (first.ok || !hitContainerHints(first.tried)) return first
  const second = await exportPng(bin, url, outPng, { ...opts, container: true })
  second.containerRetry = true
  second.firstRound = first.tried
  return second
}

/** PDF：同上。 */
async function pdfAttempt(bin, url, outPdf) {
  const first = await exportPdf(bin, url, outPdf, {})
  if (first.ok || !hitContainerHints([first.error])) return first
  const second = await exportPdf(bin, url, outPdf, { container: true })
  second.containerRetry = true
  second.firstRound = first.error
  return second
}

/**
 * 渲染 HTML。PNG 优先，失败降 PDF，再不行把 HTML 交回去。
 * @param {string} htmlPath 源页面
 * @param {string} outPath  期望产物路径（按扩展名决定目标类型）
 * @param {{width?:number, scale?:number, mode?:'auto'|'png'|'pdf', browser?:string}} opts
 * @returns {Promise<object>} { ok, mode, path, browser, ... , fallback?, error? }
 */
export async function render(htmlPath, outPath, opts = {}) {
  const width = opts.width || 960
  const mode = opts.mode || 'auto'
  const scales = opts.scale ? [opts.scale] : [2, 1]
  const file = resolve(htmlPath)
  if (!existsSync(file)) return { ok: false, error: `页面不存在：${file}`, fallback: 'none' }

  const url = pathToFileURL(file).href
  let browser = null
  if (opts.browser) {
    if (!existsSync(opts.browser)) return { ok: false, error: `指定的浏览器不存在：${opts.browser}`, fallback: 'html', html: file }
    browser = { name: 'explicit', path: opts.browser }
  } else {
    const p = await probeBrowser()
    browser = p.browser
    if (!browser) {
      return {
        ok: false, error: '未找到可用的 Chromium 系浏览器（Edge / Chrome / Brave / Chromium / Vivaldi 均不可用）',
        tried: p.tried, fallback: 'html', html: file,
        hint: '产物已定位到 HTML：可直接打开后截图，或用系统打印另存为 PDF。',
      }
    }
  }

  const outPng = extname(outPath).toLowerCase() === '.png' ? resolve(outPath) : swapExt(resolve(outPath), '.png')
  const outPdf = swapExt(outPng, '.pdf')
  const base = { browser: browser.name, browserPath: browser.path, html: file, attempts: [] }

  // ── PDF 直出模式：跳过 PNG，直接打 PDF（无高度上限）
  if (mode === 'pdf') {
    const pdf = await pdfAttempt(browser.path, url, outPdf)
    if (pdf.ok) {
      return { ...base, ok: true, mode: 'pdf', path: pdf.path, bytes: pdf.bytes,
        ...(pdf.containerRetry ? { containerRetry: true } : {}) }
    }
    return { ...base, ok: false, mode: 'html', error: `PDF 渲染失败：${pdf.error}`, fallback: 'html', path: file,
      hint: '产物已定位到 HTML：可直接打开后截图，或用系统打印另存为 PDF。' }
  }

  // ── PNG（1 级 + 2 级降 scale，必要时容器参数重试）
  const height = await measure(browser.path, url, width)
  if (height) {
    const png = await pngAttempt(browser.path, url, outPng, { width, height, scales })
    base.attempts.push({ step: 'png', height, scales,
      result: png.ok ? 'ok' : png.tried, ...(png.containerRetry ? { containerRetry: true } : {}) })
    if (png.ok) {
      // 自报高度与实际绘制位置的偏差：量一次底部空白，按正确高度让浏览器重画一遍。
      // （像素只用来"量"，不用来"裁"——最终图始终是浏览器直出的完整画面）
      let finalHeight = height
      const probe = blankBottom(png.path)
      if (probe && probe.blank > 4) {
        const target = height - Math.round(probe.blank / png.scale)
        if (target > 200) {
          const again = await pngAttempt(browser.path, url, outPng, { width, height: target, scales })
          if (again.ok) {
            finalHeight = target
            base.attempts.push({ step: 'png', height: target, result: 'ok',
              ...(again.containerRetry ? { containerRetry: true } : {}),
              correctedFrom: height })
          }
        }
      }
      return { ...base, ok: true, mode: 'png', path: png.path, scale: png.scale,
        height: finalHeight, width, bytes: statSync(outPng).size,
        ...(finalHeight !== height ? { heightCorrected: { from: height, to: finalHeight } } : {}),
        ...(png.containerRetry ? { containerRetry: true } : {}) }
    }
  } else {
    base.attempts.push({ step: 'png', result: 'skipped: 页面未自报高度（需要 <html data-h> 或 <title>H=n</title>）' })
  }

  if (mode === 'png') {
    return { ...base, ok: false, error: 'PNG 渲染失败（已试过降 scale）', fallback: 'html', path: file }
  }

  // ── PDF 降级（无高度上限，超高页面最后一道可用的栅格化）
  const pdf = await pdfAttempt(browser.path, url, outPdf)
  base.attempts.push({ step: 'pdf', result: pdf.ok ? 'ok' : pdf.error,
    ...(pdf.containerRetry ? { containerRetry: true } : {}) })
  if (pdf.ok) {
    return { ...base, ok: true, mode: 'pdf', path: pdf.path, bytes: pdf.bytes,
      degraded: 'PNG 失败，已降级为 PDF（无高度上限，但宽高比按 A4 排版）',
      ...(pdf.containerRetry ? { containerRetry: true } : {}) }
  }

  // ── 最后一级：只交 HTML
  return { ...base, ok: false, mode: 'html', path: file, fallback: 'html',
    error: 'PNG 与 PDF 均失败',
    hint: '产物已定位到 HTML：可直接打开后截图，或用系统打印另存为 PDF。' }
}

/* ------------------------------ CLI ------------------------------ */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (isMain) {
  const argv = process.argv.slice(2)
  const opt = {}
  const files = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--probe') opt.probe = true
    else if (a.startsWith('--')) opt[a.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true
    else files.push(a)
  }

  if (opt.probe) {
    const p = await probeBrowser()
    console.log(JSON.stringify({
      picked: p.browser ? { name: p.browser.name, path: p.browser.path } : null,
      tried: p.tried, candidates: p.available,
    }, null, 2))
    process.exit(p.browser ? 0 : 1)
  }

  if (files.length < 2) {
    console.error('用法: node rasterize.mjs <page.html> <out.png> [--width 960] [--scale 2] [--mode auto|png|pdf] [--browser <path>]')
    console.error('       node rasterize.mjs --probe')
    process.exit(2)
  }
  const r = await render(files[0], files[1], {
    width: opt.width ? Number(opt.width) : undefined,
    scale: opt.scale ? Number(opt.scale) : undefined,
    mode: typeof opt.mode === 'string' ? opt.mode : undefined,
    browser: typeof opt.browser === 'string' ? opt.browser : undefined,
  })
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
}
