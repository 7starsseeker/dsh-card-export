#!/usr/bin/env node
/**
 * modes/transcript — 对话内容 → 消息流长图（第二套预设）。
 *
 * 数据源：DSH 会话日志 `session.v4.jsonl.zstd`（DSH 专用，不承诺跨 harness）。
 *
 * 三条硬事实决定了实现，别改成猜的：
 *   1. `user/message` 里**混着注入内容**（runtime-context / skill-catalog / plugin:* / time-context /
 *      tool-jobs / compact-checkpoint）。所以只有 `data.source.kind === 'user'` 才算真人指令，
 *      绝不靠"文本像不像用户说的话"来判断。
 *   2. 思考块是 `assistant/message` 的 `content[].type === 'reasoning'`；
 *      正文是 `type === 'text'`。默认**排除思考**，`--with-thinking` 才带上。
 *   3. 工具调用与结果默认也排除（属于"可能被收起的部分"），`--with-tools` 才带上，且只留摘要。
 *
 * 范围选择：`--last N`（最近 N 轮）/ `--turns a-b` / `--seq a-b`（按事件序号）。
 */

import { readFileSync, existsSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { join } from 'node:path'
import { esc, inline } from './markdown.mjs'
import { renderDshUi, DSH_UI_CSS } from './dsh-ui.mjs'

/* ------------------------------ 读取 ------------------------------ */

/** DSH 会话文件是多帧 zstd；整体解压失败时按帧魔数切开逐帧解。 */
function decompress(buf) {
  try {
    const s = zstdDecompressSync(buf).toString('utf8')
    if (s.split('\n').filter(Boolean).length > 1) return s
  } catch { /* 走逐帧 */ }
  const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
  const idx = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) idx.push(i)
  }
  const parts = []
  for (let k = 0; k < idx.length; k++) {
    const end = k + 1 < idx.length ? idx[k + 1] : buf.length
    try { parts.push(zstdDecompressSync(buf.subarray(idx[k], end)).toString('utf8')) } catch { /* 跳过坏帧 */ }
  }
  return parts.join('')
}

const KEEP_KINDS = new Set(['user'])

/**
 * 附件 id（`sha256:<hex>`）→ 本地文件路径。
 * DSH 附件库布局：<DSH_HOME>/attachments/v1/objects/<前两位>/<hex>
 * @returns {string|null} 不存在时返回 null，由调用方决定怎么降级
 */
export function resolveAttachment(attachmentId, home = process.env.DSH_HOME) {
  if (!attachmentId || !home) return null
  const hex = String(attachmentId).replace(/^sha256:/, '')
  if (!/^[0-9a-f]{16,}$/i.test(hex)) return null
  const p = join(home, 'attachments', 'v1', 'objects', hex.slice(0, 2), hex)
  try { return existsSync(p) ? p : null } catch { return null }
}

/** 抽出 content 里的图片 part（形状：{type:'image', attachment:{attachmentId,mediaType,bytes,width,height,name}}）。 */
function imageParts(parts) {
  return parts.filter((p) => p && p.type === 'image' && p.attachment)
    .map((p) => ({ type: 'image', ...p.attachment }))
}

/**
 * 解析会话日志。
 * @returns {{meta:object, items:Array<object>, turns:number[]}}
 */
export function readSession(file) {
  const lines = decompress(readFileSync(file)).split('\n').filter(Boolean)
  const items = []
  const meta = { id: null, title: null, cwd: null, createdAt: null, agentPreset: null }
  const turns = new Set()
  const turnStarts = []   // [{seq, turn}]，用于给没有 turn 字段的消息定轮次

  for (const l of lines) {
    let o
    try { o = JSON.parse(l) } catch { continue }

    if (o.type === 'session') {
      meta.id = o.id; meta.cwd = o.cwd; meta.createdAt = o.createdAt; meta.agentPreset = o.agentPreset
      continue
    }
    if (o.type === 'session/title' && o.data?.title) { meta.title = o.data.title; continue }
    if (o.type === 'turn/start' && o.data?.turn != null) { turnStarts.push({ seq: o.seq, turn: o.data.turn }); continue }

    if (o.type === 'user/message') {
      const kind = o.data?.source?.kind
      if (!KEEP_KINDS.has(kind)) continue                // 注入内容一律不进图
      const text = (o.data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
      if (!text) continue
      // 真人消息**不带 data.turn**（实测 54/54 全为 null），只能按序号归属：
      // 落在哪个 turn/start 之后，就算哪一轮。
      items.push({ kind: 'user', seq: o.seq, turn: null, text })
      continue
    }

    if (o.type === 'assistant/message') {
      const msg = o.data?.message
      const parts = msg?.content || []
      const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim()
      const thinking = parts.filter((p) => p.type === 'reasoning').map((p) => p.text).join('\n').trim()
      const turn = o.data?.turn ?? null
      if (text) items.push({ kind: 'assistant', seq: o.seq, turn, text })
      for (const img of imageParts(parts)) items.push({ kind: 'image', seq: o.seq, turn, ...img })
      if (thinking) items.push({ kind: 'thinking', seq: o.seq, turn, text: thinking })
      if (turn != null) turns.add(turn)
      continue
    }

    if (o.type === 'tool/call') {
      items.push({ kind: 'tool', seq: o.seq, turn: o.data?.turn ?? null,
        name: o.data?.name || 'tool', args: String(o.data?.arguments ?? '') })
      continue
    }
    if (o.type === 'tool/result') {
      const parts = o.data?.message?.content || []
      const text = parts.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
      items.push({ kind: 'tool-result', seq: o.seq, turn: o.data?.turn ?? null,
        name: o.data?.message?.source?.kind || 'tool', text })
      for (const img of imageParts(parts)) items.push({ kind: 'image', seq: o.seq, turn: o.data?.turn ?? null, ...img })
      continue
    }
  }

  items.sort((a, b) => (a.seq || 0) - (b.seq || 0))

  // 按 turn/start 的序号把无轮次的消息归属到轮（真人消息都走这条）
  turnStarts.sort((a, b) => a.seq - b.seq)
  const turnOf = (seq) => {
    let t = null
    for (const s of turnStarts) { if (s.seq <= seq) t = s.turn; else break }
    return t
  }
  for (const it of items) {
    if (it.turn == null) it.turn = turnOf(it.seq)
    if (it.turn != null) turns.add(it.turn)
  }

  return { meta, items, turns: [...turns].sort((a, b) => a - b) }
}

/* ------------------------------ 选取 ------------------------------ */

const parseRange = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return null
  const a = Number(m[1]), b = Number(m[2])
  return a <= b ? [a, b] : [b, a]
}

/** 比对前归一化：去引用标记、去 markdown 记号、去全部空白、统一大小写。
 *  去掉空白是有意的——用户引文常把换行/空格带偏（「第一问： 这句话」vs「第一问：这句话」）。 */
export function normalizeForMatch(s) {
  return String(s ?? '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*`_#>|]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

const MIN_ANCHOR = 2

/**
 * 在一组事件里找引文锚点。
 * 规则：短引文可以，但必须唯一命中；命中多处又太短，就拒绝而不是瞎猜。
 */
function findAnchors(items, quote) {
  const q = normalizeForMatch(quote)
  if (q.length < MIN_ANCHOR) return { error: `引文太短（${q.length} 字），无法定位` }
  const search = (needle) => {
    const hits = []
    items.forEach((it, i) => { if (normalizeForMatch(it.text).includes(needle)) hits.push(i) })
    return hits
  }
  let hits = search(q)
  let matchedBy = 'full'
  if (!hits.length) {
    const short = q.slice(0, Math.min(12, q.length))
    if (short.length >= MIN_ANCHOR) {
      hits = search(short)
      matchedBy = `prefix:${short.length}`
    }
  }
  if (!hits.length) return { error: `没找到包含这段引文的消息：${String(quote).slice(0, 40)}…` }
  if (hits.length > 1 && q.length < 4) {
    const where = hits.slice(0, 5).map((i) => `#${items[i].seq}`).join('、')
    return { error: `引文「${String(quote).slice(0, 20)}」太短且命中 ${hits.length} 处（${where}），请多给几个字` }
  }
  return { hits, matchedBy, ambiguous: hits.length > 1 }
}

/**
 * 按范围挑选事件。
 * @param {{items:Array, turns:number[]}} session
 * @param {{last?:number, turns?:string, seq?:string, from?:string, to?:string}} opts
 */
export function selectRange(session, opts = {}) {
  // ① 引用式定位：用户说「从 > 这段 开始 到 > 那段 为止」
  if (opts.from || opts.to) {
    if (!opts.from) return { items: [], range: {}, error: '给了 --to 但没有 --from：引用式定位需要起点' }
    const a = findAnchors(session.items, opts.from)
    if (a.error) return { items: [], range: {}, error: a.error }
    const startIdx = a.hits[0]

    let endIdx = session.items.length - 1
    let toAnchor = null
    if (opts.to) {
      const b = findAnchors(session.items, opts.to)
      if (b.error) return { items: [], range: {}, error: b.error }
      const after = b.hits.filter((i) => i >= startIdx)
      if (!after.length) return { items: [], range: {}, error: '终点引文出现在起点之前，范围为空' }
      endIdx = after[after.length - 1]
      toAnchor = { seq: session.items[endIdx].seq, matchedBy: b.matchedBy, preview: String(opts.to).slice(0, 40) }
    }

    const items = session.items.slice(startIdx, endIdx + 1)
    return {
      items,
      range: { fromSeq: session.items[startIdx].seq, toSeq: session.items[endIdx].seq,
        fromTurn: session.items[startIdx].turn, toTurn: session.items[endIdx].turn },
      anchors: {
        from: { seq: session.items[startIdx].seq, matchedBy: a.matchedBy, preview: String(opts.from).slice(0, 40) },
        to: toAnchor,
      },
    }
  }

  const turnRange = parseRange(opts.turns)
  const seqRange = parseRange(opts.seq)
  const last = opts.last ? Math.max(1, Number(opts.last)) : 0

  let minTurn = null
  if (turnRange) minTurn = turnRange
  else if (last && session.turns.length) {
    const maxTurn = session.turns[session.turns.length - 1]
    minTurn = [Math.max(1, maxTurn - last + 1), maxTurn]
  }

  const picked = session.items.filter((it) => {
    if (seqRange && (it.seq < seqRange[0] || it.seq > seqRange[1])) return false
    // 指定了轮次范围时，turn 为空的消息无法归属，一律排除——
    // 否则 `--last 2` 会把所有轮次外消息都带进来（实测把 2 轮导出成 54 条用户指令）。
    if (minTurn) {
      if (it.turn == null) return false
      if (it.turn < minTurn[0] || it.turn > minTurn[1]) return false
    }
    return true
  })
  return { items: picked, range: { turns: minTurn, seq: seqRange, last: last || null } }
}

/**
 * 显示档位——对齐 DSH 客户端的「工作步骤展示」（settings.transcript.*），四档同名：
 *   compact   简洁：每轮只留最后一条回答（客户端叫「仅最终回答」）
 *   standard  标准：所有助手回答可见，过程（思考/工具/命令行）收起   ← 默认
 *   detailed  详细：+ 工具调用（名称与参数摘要）
 *   verbose   完全展开：+ 思考全文 + 工具结果
 *
 * 客户端在所有档位下都不显示的（系统提示词行、普通上下文注入、permission 命令行），
 * 这里同样永远不导出——所以注入内容在 readSession 就已被 source.kind 挡掉。
 */
export const LEVELS = ['compact', 'standard', 'detailed', 'verbose']

export function featuresOf(level = 'standard', opts = {}) {
  const lv = LEVELS.includes(level) ? level : 'standard'
  return {
    level: lv,
    thinking: opts.withThinking ?? (lv === 'verbose'),
    tools: opts.withTools ?? (lv === 'detailed' || lv === 'verbose'),
    toolResults: lv === 'verbose',
    finalOnly: lv === 'compact',
  }
}

/** 是否把某类项目纳入。 */
function keep(it, f) {
  if (it.kind === 'thinking') return !!f.thinking
  if (it.kind === 'tool') return !!f.tools
  if (it.kind === 'tool-result') return !!f.toolResults
  // 图片始终保留：默认渲染成占位标记（带名字/尺寸/体积），不会静默消失
  return true
}

/** 默认单条消息的可见字数上限。超出后截断，并明确写出原文长度。 */
export const DEFAULT_MAX_CHARS = 1200

/**
 * 处理单条正文里「图没法看」的部分。
 *
 * 只做两件有明确标记的事，不改写内容：
 *   ① 内嵌 base64 / data URI 换成「[内嵌数据，已省略 N 字符]」——否则一张图就是几十万字符的乱码墙；
 *   ② 超过 maxChars 的正文截断，末尾写「…（原文 N 字，此处仅显示前 M 字）」。
 * 两处标记都写进图里，读者能知道自己看到的是节选。
 */
export function clipText(text, maxChars = DEFAULT_MAX_CHARS) {
  let t = String(text ?? '')
  const notes = []

  t = t.replace(/data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]{80,}/g, (m) => {
    notes.push(`内嵌数据已省略 ${m.length} 字符`)
    return `[内嵌图片/数据，已省略 ${m.length} 字符]`
  })
  // 不做「疑似 base64」的泛化猜测：一长串字母数字可能是哈希、token、压缩后的代码行，
  // 猜错就是吃掉真实内容。没有 data: 前缀的，靠下面的字数上限截断并标注即可。

  const total = t.length
  if (maxChars > 0 && total > maxChars) {
    t = t.slice(0, maxChars) + `…（原文 ${total} 字，此处仅显示前 ${maxChars} 字）`
  }
  return { text: t, clipped: total > (maxChars || Infinity), notes }
}

const CSS = `
*{box-sizing:border-box}
body{margin:0;padding:26px 0 40px;background:#EDEEF0;color:#0A0A0A;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif}
.card{width:900px;margin:0 auto;overflow:hidden;background:#FAFAF8;padding:0 60px 34px}
.band{background:#3A3F46;height:4px;margin:0 -60px 24px}
.kicker{font-size:11px;letter-spacing:5px;font-weight:800;color:#6A6F76;margin-bottom:12px}
h1{font-size:24px;line-height:1.45;margin:0 0 10px;font-weight:800}
.meta{color:#6A6F76;font-size:11.5px;line-height:1.8;padding-bottom:14px;border-bottom:2px solid #0A0A0A}
.turn{margin-top:26px}
/* 分隔线：既是正常的分节符，也是一条笔直的裁切参考线。
   通栏（延伸到卡片左右边缘）——切开时线到边，不会切歪；视觉上就是一条细分割线。 */
.cut{height:1px;background:#E2E5E9;margin:38px -60px 16px}
.thd{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:2px;color:#6A6F76;
  font-weight:800;margin-bottom:12px}
.thd::after{content:'';flex:1;height:1px;background:#DDE0E4}
.msg{margin-bottom:12px;padding:12px 16px;border-left:3px solid #DDE0E4;background:#FFFFFF}
.msg.user{border-left-color:#1F3A8A;background:#F2F4F7}
.role{font-size:10.5px;letter-spacing:2px;font-weight:800;color:#6A6F76;margin-bottom:6px}
.msg.user .role{color:#1F3A8A}
.body{font-size:14px;line-height:1.9;white-space:pre-wrap;word-break:break-word}
.body code{background:#F2F4F7;border:1px solid #DDE0E4;border-radius:4px;padding:1px 5px;font-size:12.5px}
.body pre{margin:8px 0 10px;padding:11px 14px;background:#F2F4F7;border:1px solid #DDE0E4;border-radius:6px;overflow:hidden}
.body pre code{background:none;border:none;padding:0;font-size:11.5px;line-height:1.7;
  display:block;white-space:pre-wrap;word-break:break-all;color:#2A2F36}
.codenote{font-size:11px;color:#6A6F76;margin:-6px 0 10px}
.body strong{font-weight:800}
.think{margin-bottom:12px;padding:10px 14px;background:#F2F4F7;border:1px dashed #C9CDD3;color:#565B60}
.think .role{color:#565B60}
.think .body{font-size:12.5px;line-height:1.8;color:#565B60}
.img{margin-bottom:12px}
.img img{display:block;max-width:100%;height:auto;border:1px solid #DDE0E4;background:#fff}
.imgcap{display:block;color:#6A6F76;font-size:11px;margin-top:5px}
.imgph{display:inline-block;padding:6px 12px;background:#F2F4F7;border:1px dashed #C9CDD3;
  color:#565B60;font-size:12px}
.meme{display:inline-block;padding:1px 7px;margin:0 2px;background:#F2F4F7;border:1px solid #DDE0E4;
  border-radius:3px;font-size:12px;color:#1F3A8A}
.tool{margin-bottom:10px;padding:9px 13px;background:#FFFFFF;border:1px solid #DDE0E4;font-size:12px;color:#3A3F46}
.tool .nm{font-weight:800;color:#1F3A8A;font-family:Consolas,monospace}
.tool .args{color:#6A6F76;margin-top:4px;font-family:Consolas,monospace;font-size:11.5px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.foot{margin-top:26px;padding-top:12px;border-top:1px solid #6A6F76;color:#6A6F76;font-size:11px;line-height:1.8}
`

const LABEL = { user: '用户', assistant: '助手', thinking: '思考', tool: '工具调用', 'tool-result': '工具结果' }

/** 轮与轮之间的裁切标记（长图需要手动分段时的参照）。 */
const CUT_MARK = '<div class="cut" data-cut></div>'

/** 对话 → 单张消息流图。 */
export function renderTranscript(session, picked, opts = {}) {
  const maxChars = opts.maxChars === 0 ? 0 : (opts.maxChars || DEFAULT_MAX_CHARS)
  const f = featuresOf(opts.level, opts)
  let show = picked.items.filter((it) => keep(it, f))

  // compact：每轮只留最后一条助手回答（对应客户端的「仅最终回答」）
  if (f.finalOnly) {
    const lastAssist = new Map()
    for (const it of show) if (it.kind === 'assistant') lastAssist.set(it.turn, it.seq)
    show = show.filter((it) => it.kind !== 'assistant' || lastAssist.get(it.turn) === it.seq)
  }

  const turnNums = [...new Set(show.map((i) => i.turn).filter((t) => t != null))]
  const clippedCount = { value: 0 }

  const blocks = []
  const imgMeta = { omitted: 0, inlined: 0, missing: 0, oversized: 0 }
  const uiStats = { rendered: 0, fallback: 0, unsupported: [] }
  // dsh-ui 卡片默认渲染：用户看到的对话是卡片，导出也应一致；
  // --no-render-ui 退回原始 JSON 代码块（想看组件原文时用）。
  const renderUi = opts.renderUi !== false
  const imgOptsFor = {
    withImages: !!opts.withImages,
    home: opts.home,
    maxImageBytes: opts.maxImageBytes,
    stats: imgMeta,
    renderUi,
    uiStats,
  }
  const renderOne = (it) => renderItem(it, maxChars, clippedCount, imgOptsFor)
  // 轮与轮之间插入裁切标记：长图要手动分段时有一眼可见的参照，不用猜位置。
  // 标记本身很轻（一条虚线 + 角标），不打断阅读。
  for (const t of turnNums) {
    const inTurn = show.filter((i) => i.turn === t)
    if (!inTurn.length) continue
    if (blocks.length) blocks.push(CUT_MARK)
    blocks.push(`<div class="turn" data-split><div class="thd">第 ${t} 轮</div>${
      inTurn.map(renderOne).join('')}</div>`)
  }
  // 无轮次归属的消息（事件流里 turn 为空）单独一段
  const loners = show.filter((i) => i.turn == null)
  if (loners.length) {
    if (blocks.length) blocks.push(CUT_MARK)
    blocks.push(`<div class="turn" data-split><div class="thd">轮次外消息</div>${loners.map(renderOne).join('')}</div>`)
  }

  const part = ''

  const title = opts.title || session.meta.title || '对话摘录'
  const rangeText = describeRange(picked)
  // 交付说明（什么没进图、用哪个参数能包含）不写进图里——
  // 图是给读者看的成品；这些是给操作者看的提示，由 SKILL 要求在对话中告知用户。
  const notes = []
  if (!f.thinking && picked.items.some((i) => i.kind === 'thinking')) {
    notes.push(`已排除 ${picked.items.filter((i) => i.kind === 'thinking').length} 段思考（--level verbose 或 --with-thinking 可包含）`)
  }
  if (!f.tools && picked.items.some((i) => i.kind === 'tool')) {
    notes.push(`已排除 ${picked.items.filter((i) => i.kind === 'tool').length} 次工具调用（--level detailed 或 --with-tools 可包含）`)
  }
  if (f.finalOnly) {
    notes.push('当前为简洁档：每轮只保留最后一条回答（--level standard 可看全部回答）')
  }
  if (clippedCount.value) {
    notes.push(`${clippedCount.value} 条消息过长已截断或省略内嵌数据，图上已标出原文长度（--max-chars 可调）`)
  }

  const inner = `<div class="band"></div>
<div class="kicker">CONVERSATION</div>
<h1>${esc(title)}</h1>
<div class="meta">${esc(rangeText)}　·　共 ${show.filter((i) => i.kind === 'user').length} 条用户指令、
${show.filter((i) => i.kind === 'assistant').length} 条回答${session.meta.agentPreset ? `　·　${esc(session.meta.agentPreset)}` : ''}</div>
${blocks.join('\n')}
<div class="foot">${part}由 dsh-card-export 渲染自 DSH 会话日志；正文为原文，未做改写。</div>`

  // notes 是给操作者看的交付说明，不进图；images 是图片处理统计，同样只回给调用方。
  return {
    html: page(inner, title, renderUi ? DSH_UI_CSS : ''),
    title,
    counts: { turns: turnNums.length, shown: show.length, total: picked.items.length },
    notes,
    images: imgMeta,
    ...(renderUi ? { dshUi: { rendered: uiStats.rendered, fallback: uiStats.fallback, unsupported: [...new Set(uiStats.unsupported)] } } : {}),
  }
}

/* ------------------------------ 图片与表情 ------------------------------ */

const MEME_RE = /\[表情[:：]\s*([^\]\n]*)\]/g

/** 表情标记 → 小标签。只替换标记本身，内容原样保留。 */
function withMemes(html) {
  return html.replace(MEME_RE, (_m, d) => `<span class="meme">表情 · ${esc(d.trim())}</span>`)
}

/** 普通文本段：保留换行（对话里换行有语义），其余按行内规则走。 */
function textChunk(s) {
  return withMemes(inline(s)).replace(/\n/g, '<br>')
}

/**
 * 消息正文渲染。
 *
 * 必须先认 **围栏代码块**：之前只做行内渲染，导致 ```dsh-ui … ``` 被当成
 * "一堆反引号包住的文字"，整段 JSON 渲染成大片灰色行内代码（用户实测截图就是这样）。
 * 代码块过多行时按行截断并标注，不静默吞掉。
 */
export function bodyHtml(text, { maxCodeLines = 40, renderUi = false, uiStats = null } = {}) {
  const src = String(text ?? '')
  const out = []
  const fence = /```([\w%-]*)\n?([\s\S]*?)```/g
  let last = 0
  let m
  while ((m = fence.exec(src)) !== null) {
    if (m.index > last) {
      // 代码块前的文字：去掉尾部空行，避免和 <pre> 的 margin 叠成大片留白
      const before = src.slice(last, m.index).replace(/\n+$/, '')
      if (before) out.push(textChunk(before))
    }
    const lang = m[1] || ''
    const body = m[2].replace(/\n$/, '')

    // dsh-ui 块：只有显式开启才渲染成卡片；解析失败退回代码块，原文不动
    if (renderUi && lang === 'dsh-ui') {
      const r = renderDshUi(body)
      if (r.ok) {
        if (uiStats) { uiStats.rendered++; if (r.unsupported.length) uiStats.unsupported.push(...r.unsupported) }
        out.push(r.html)
        last = m.index + m[0].length
        continue
      }
      if (uiStats) uiStats.fallback++
    }

    const lines = body.split('\n')
    let clipped = lines.slice(0, maxCodeLines).join('\n')
    let note = ''
    if (lines.length > maxCodeLines) {
      note = `<div class="codenote">代码块共 ${lines.length} 行，此处显示前 ${maxCodeLines} 行</div>`
    }
    out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(clipped)}</code></pre>${note}`)
    last = m.index + m[0].length
  }
  if (last < src.length) {
    // 代码块后的文字：去掉开头空行，否则会顶出一大块空白
    const after = src.slice(last).replace(/^\n+/, '')
    if (after) out.push(textChunk(after))
  }
  return out.join('')
}

function formatBytes(n) {
  if (!n) return ''
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
}

/**
 * 图片渲染。
 * 默认只出占位标记（写清名字/尺寸/体积），因为一张 PNG 动辄上百 KB 的 base64，
 * 塞进长图会让文件暴涨；`--with-images` 才真的内嵌本地附件。
 */
function renderImage(it, { withImages = false, home, maxImageBytes = 3 * 1024 * 1024, stats } = {}) {
  const dim = it.width && it.height ? `${it.width}×${it.height}` : ''
  const size = formatBytes(it.bytes)
  const meta = [dim, size].filter(Boolean).join(' · ')
  const name = it.name || (it.attachmentId || '').slice(7, 15) || '图片'

  if (!withImages) {
    if (stats) stats.omitted++
    // 图上只陈述事实：这里有一张图、本次没带进来。
    // 「用哪个参数能包含」属于交付说明，放到对话里讲，不占图面。
    return `<div class="img"><span class="imgph">[图片] ${esc(name)}${meta ? ` · ${esc(meta)}` : ''}（本次未导出）</span></div>`
  }
  const file = resolveAttachment(it.attachmentId, home)
  if (!file) {
    if (stats) stats.missing++
    return `<div class="img"><span class="imgph">[图片] ${esc(name)}${meta ? ` · ${esc(meta)}` : ''}（本地附件库找不到）</span></div>`
  }
  if (it.bytes && it.bytes > maxImageBytes) {
    if (stats) stats.oversized++
    return `<div class="img"><span class="imgph">[图片] ${esc(name)} · ${esc(size)}（本次未导出）</span></div>`
  }
  try {
    const b64 = readFileSync(file).toString('base64')
    const mime = it.mediaType || 'image/png'
    if (stats) stats.inlined++
    return `<div class="img"><img src="data:${esc(mime)};base64,${b64}" alt="${esc(name)}">
      <span class="imgcap">${esc(name)}${meta ? ` · ${esc(meta)}` : ''}</span></div>`
  } catch {
    if (stats) stats.missing++
    return `<div class="img"><span class="imgph">[图片] ${esc(name)}（读取失败）</span></div>`
  }
}

function renderItem(it, maxChars = DEFAULT_MAX_CHARS, clippedCount = null, imgOpts = {}) {
  const clipped = (text) => {
    const r = clipText(text, maxChars)
    if (r.clipped && clippedCount) clippedCount.value++
    return r.text
  }
  if (it.kind === 'image') return renderImage(it, imgOpts)
  if (it.kind === 'tool') {
    return `<div class="tool"><span class="nm">${esc(it.name)}</span><div class="args">${esc(clipped(it.args))}</div></div>`
  }
  if (it.kind === 'tool-result') {
    return `<div class="tool"><span class="nm">结果</span><div class="args">${esc(clipped(it.text))}</div></div>`
  }
  if (it.kind === 'thinking') {
    return `<div class="think"><div class="role">${LABEL.thinking}</div><div class="body">${esc(clipped(it.text))}</div></div>`
  }
  const cls = it.kind === 'user' ? 'msg user' : 'msg'
  return `<div class="${cls}"><div class="role">${LABEL[it.kind] || it.kind}</div><div class="body">${bodyHtml(clipped(it.text), { renderUi: imgOpts.renderUi, uiStats: imgOpts.uiStats })}</div></div>`
}

function describeRange(picked) {
  const { range } = picked
  const parts = []
  if (range.turns) parts.push(`第 ${range.turns[0]}–${range.turns[1]} 轮`)
  if (range.seq) parts.push(`事件 ${range.seq[0]}–${range.seq[1]}`)
  if (!parts.length) parts.push('全部轮次')
  return parts.join('　·　')
}

function page(inner, title, extraCss = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}${extraCss}</style></head><body><div class="card">${inner}</div>
<script>window.addEventListener('load',function(){
  var c=document.querySelector('.card');
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  var hb=Math.ceil(c.getBoundingClientRect().bottom+window.scrollY);
  document.documentElement.setAttribute('data-hb',hb);document.documentElement.setAttribute('data-h',h);document.title='H='+h;
  var els=[].slice.call(document.querySelectorAll('[data-split]'));
  var arr=els.map(function(e){var r=e.getBoundingClientRect();
    return [Math.round(r.top+window.scrollY),Math.round(r.height)];});
  var s=document.createElement('script');s.type='application/json';s.id='dsplit';
  s.textContent=JSON.stringify({h:h,blocks:arr});document.body.appendChild(s);});</script>
</body></html>`
}
