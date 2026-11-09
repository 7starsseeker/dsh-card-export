#!/usr/bin/env node
/** 对照：同一段含 HTML 的文本，报告文档 vs dsh-ui 卡片，两条路径产出什么。 */
import { inline } from '../lib/modes/markdown.mjs'
import { renderDshUi } from '../lib/modes/dsh-ui.mjs'

const sample = '这段有 <span style="color:#A63228">红色文字</span>、<br>强制换行，以及 MathML 公式 <math><msup><mi>x</mi><mn>2</mn></msup></math>。'

console.log('原始文本：')
console.log('  ' + sample)
console.log('\n① 报告文档路径（inline 默认 html 直通）：')
console.log('  ' + inline(sample))

const card = renderDshUi(JSON.stringify({ items: [{ type: 'text', content: sample }] }))
console.log('\n② dsh-ui 卡片路径（inline html:false，强制转义）：')
console.log('  ' + card.html.replace(/\n/g, ' ').slice(0, 400))
