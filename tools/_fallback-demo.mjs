#!/usr/bin/env node
/** 三级兜底实测：卡片 → 单条原文 → 整块代码块。 */
import { renderDshUi } from '../lib/modes/dsh-ui.mjs'

const a = renderDshUi(JSON.stringify({ items: [{ type: 'callout', tone: 'success', content: 'ok' }] }))
console.log('① 正常渲染 → ok=' + a.ok + ' 卡片=' + a.html.includes('ui-card'))

const b = renderDshUi(JSON.stringify({ items: [{ type: 'radar' }, { type: 'text', content: 'x' }] }))
console.log('② 单条兜底 → 标注=' + JSON.stringify(b.unsupported)
  + ' 该条原样保留=' + b.html.includes('"type": "radar"')
  + ' 其余照常渲染=' + b.html.includes('ui-text'))

const c = renderDshUi('{broken')
console.log('③ 整块兜底 → ok=' + c.ok + ' 原因=' + c.reason)
