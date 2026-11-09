#!/usr/bin/env node
/**
 * dsh-ui 迷你渲染器 —— 把对话里的 ```dsh-ui JSON 渲染成卡片，而不是代码块。
 *
 * 定位：**可选增强**，默认关闭。忠实原文仍是默认行为；这个模式只服务"想让图更像对话现场"的场景。
 *
 * 三条约束：
 *   1. 只支持子集，遇不认识的组件**明确标出**，不猜、不吞；
 *   2. JSON 解析失败 → 退回代码块（原文一字不改），并标注；
 *   3. 不引入网络/字体/图标依赖，纯 CSS 画。
 */

import { inline as mdInline, esc } from './markdown.mjs'

/** 卡片文本一律转义 HTML：内容来自对话原文，不属于「作者明确写的文档 HTML」。 */
const inline = (s) => mdInline(s, { html: false })

/** 支持的组件（其余一律标注为不支持）。 */
export const SUPPORTED = ['title', 'text', 'callout', 'list', 'keyvalue', 'table', 'stat', 'badge', 'steps', 'divider', 'code', 'json']

/**
 * 缺 `type` 时按形状推断——**只在唯一确定时**推断。
 * 真实数据里确实出现过没有 type 的表格条目；不推断就会丢内容，
 * 但乱猜更糟，所以只认这几种无歧义的形状。
 */
export function inferType(it) {
  if (!it || typeof it !== 'object') return null
  if (Array.isArray(it.columns) && Array.isArray(it.rows)) return 'table'
  if (Array.isArray(it.pairs)) return 'keyvalue'
  if (Array.isArray(it.steps)) return 'steps'
  if (Array.isArray(it.items) && it.items.every((x) => typeof x === 'string')) return 'list'
  return null
}

const TONE = {
  info: { bg: '#F2F4F7', bar: '#1F3A8A', label: '提示' },
  success: { bg: '#F1F6F2', bar: '#175A3B', label: '完成' },
  warning: { bg: '#FAF7EC', bar: '#6F5100', label: '注意' },
  error: { bg: '#FBF1EF', bar: '#A63228', label: '问题' },
}

/**
 * 尝试把一段 JSON 渲染成卡片。
 * @returns {{ok:true, html:string, unsupported:string[]} | {ok:false, reason:string}}
 */
export function renderDshUi(raw) {
  let spec
  try {
    spec = JSON.parse(String(raw).trim())
  } catch (e) {
    return { ok: false, reason: `JSON 解析失败：${e.message.slice(0, 60)}` }
  }
  const items = Array.isArray(spec) ? spec : (spec.items || (spec.type ? [spec] : []))
  if (!Array.isArray(items) || !items.length) return { ok: false, reason: '没有可渲染的 items' }

  const unsupported = []
  const parts = []

  for (const raw of items) {
    const it = raw || {}
    const type = it.type || inferType(it)
    if (!type || !SUPPORTED.includes(type)) {
      // 认不出来就别丢：原样贴出这一段 JSON，并说明是未识别组件
      unsupported.push(String(it.type || '(无 type)'))
      parts.push(`<div class="ui-unknown">未识别组件${it.type ? `「${esc(it.type)}」` : ''}，原样保留：
        <pre class="ui-code"><code>${esc(JSON.stringify(it, null, 2))}</code></pre></div>`)
      continue
    }

    switch (type) {
      case 'title':
        parts.push(`<div class="ui-title">${esc(it.content ?? it.text ?? '')}</div>`)
        break
      case 'text':
        parts.push(`<p class="ui-text">${inline(it.content ?? it.text ?? '')}</p>`)
        break
      case 'callout': {
        const t = TONE[it.tone] || TONE.info
        parts.push(`<div class="ui-callout" style="background:${t.bg};border-left-color:${t.bar}">
          <span class="ui-tone" style="color:${t.bar}">${esc(it.title || t.label)}</span>
          <div>${inline(it.content ?? '')}</div></div>`)
        break
      }
      case 'list':
        parts.push(`<ul class="ui-list">${(it.items || []).map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`)
        break
      case 'keyvalue':
        parts.push(`<div class="ui-kv">${(it.pairs || []).map((p) =>
          `<div class="ui-kv-row"><span>${esc(p.key)}</span><b>${esc(p.value)}</b></div>`).join('')}</div>`)
        break
      case 'table':
        parts.push(`<table class="ui-table">
          <thead><tr>${(it.columns || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${(it.rows || []).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
        break
      case 'stat':
        parts.push(`<div class="ui-stat"><b>${esc(it.value ?? '')}</b><span>${esc(it.label ?? '')}</span></div>`)
        break
      case 'badge':
        parts.push(`<span class="ui-badge">${esc(it.content ?? it.text ?? '')}</span>`)
        break
      case 'steps':
        parts.push(`<ol class="ui-steps">${(it.steps || it.items || []).map((s) =>
          `<li>${esc(typeof s === 'string' ? s : (s.title || s.content || ''))}</li>`).join('')}</ol>`)
        break
      case 'divider':
        parts.push('<hr class="ui-hr">')
        break
      case 'code':
        parts.push(`<pre class="ui-code"><code>${esc(it.code ?? it.content ?? '')}</code></pre>`)
        break
      case 'json':
        parts.push(`<pre class="ui-code"><code>${esc(JSON.stringify(it.data ?? it.content ?? {}, null, 2))}</code></pre>`)
        break
      default:
        unsupported.push(type)
    }
  }

  const head = spec.title ? `<div class="ui-card-title">${esc(spec.title)}</div>` : ''
  const note = unsupported.length
    ? `<div class="ui-warn">本渲染器不支持：${esc([...new Set(unsupported)].join('、'))}（原文仍可在 --render-ui 关闭时查看）</div>`
    : ''
  return {
    ok: true,
    unsupported,
    html: `<div class="ui-card" style="--gap:${Number(spec.gap) || 10}px">${head}${parts.join('')}${note}</div>`,
  }
}

export const DSH_UI_CSS = `
/* 卡片内部必须 normal：外层 .body 是 pre-wrap（为了保留对话换行），
   会把模板里的换行/缩进也渲染成空白，导致 callout 出现一大片空块。 */
.ui-card{white-space:normal;border:1px solid #DDE0E4;background:#FCFCFB;padding:14px 16px;
  margin:8px 0 10px;border-radius:6px}
.ui-card *{white-space:normal}
.ui-card>*+*{margin-top:var(--gap,10px)}
.ui-card-title{font-size:13px;font-weight:800;letter-spacing:.5px}
.ui-title{font-size:14px;font-weight:800}
.ui-text{margin:0;font-size:13.5px;line-height:1.8}
.ui-callout{border-left:4px solid #1F3A8A;padding:10px 13px;font-size:13px;line-height:1.8}
.ui-tone{display:block;font-size:10.5px;font-weight:800;letter-spacing:1.5px;margin-bottom:4px}
.ui-list{margin:0;padding-left:20px;font-size:13px;line-height:1.85}
.ui-kv{border-top:1px solid #DDE0E4}
.ui-kv-row{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #DDE0E4;font-size:13px}
.ui-kv-row span{width:110px;color:#6A6F76;flex:none}
.ui-table{width:100%;border-collapse:collapse;font-size:12.5px}
.ui-table th{text-align:left;font-size:11px;letter-spacing:.8px;color:#6A6F76;font-weight:800;
  padding:6px 10px 6px 0;border-bottom:2px solid #0A0A0A}
.ui-table td{padding:7px 10px 7px 0;border-top:1px solid #DDE0E4;vertical-align:top;line-height:1.6}
.ui-stat{display:inline-block;margin-right:18px}
.ui-stat b{display:block;font-size:18px;font-weight:800;line-height:1.2}
.ui-stat span{font-size:11px;color:#6A6F76}
.ui-badge{display:inline-block;padding:1px 8px;background:#F2F4F7;border:1px solid #DDE0E4;
  border-radius:3px;font-size:12px;color:#1F3A8A}
.ui-steps{margin:0;padding-left:20px;font-size:13px;line-height:1.9}
.ui-hr{border:none;border-top:1px solid #DDE0E4;margin:8px 0}
.ui-code{margin:0;padding:10px 12px;background:#F2F4F7;border:1px solid #DDE0E4;border-radius:5px;
  font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-all}
.ui-warn{font-size:11px;color:#6F5100;border-top:1px dashed #DDE0E4;padding-top:6px}
`
