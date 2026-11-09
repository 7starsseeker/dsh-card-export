#!/usr/bin/env node
/**
 * 数学公式回归：确认 MathML 能原样进图、属性不被吃掉、代码块里的 LaTeX 不被误渲染。
 *
 * 为什么单独一组：公式走的是「HTML 直通」+「块级 HTML」两条路径，
 * 任何一条被改动（比如为了安全把标签全转义）都会静默把公式变成一串源码。
 * 这里只在 HTML 层断言，不快照，跑得很快。
 */
import { readFileSync } from 'node:fs'
import { parseBlocks, renderBlocks, inline, setHtmlPassthrough } from '../lib/modes/markdown.mjs'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? '  → ' + d : ''}`)) }

const demo = readFileSync(new URL('../cases/math-demo.md', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../cases/math-layout.md', import.meta.url), 'utf8')
const htmlOf = (md) => renderBlocks(parseBlocks(md))

setHtmlPassthrough(true)
const demoHtml = htmlOf(demo)
const layoutHtml = htmlOf(layout)

console.log('基础结构：')
ok('分式保留 <mfrac>', /<mfrac>/.test(demoHtml))
ok('根号保留 <msqrt>', /<msqrt>/.test(demoHtml))
ok('上下限保留 <munderover>', /<munderover>/.test(demoHtml))
ok('积分上下标保留 <msubsup>', /<msubsup>/.test(demoHtml))
ok('矩阵保留 <mtable>', /<mtable>/.test(demoHtml))
ok('中文公式保留 <mtext>', /<mtext>中文|准确率/.test(demoHtml))
ok('没有被转义成字面', !/&lt;math/.test(demoHtml))

console.log('\n版式属性（不能被吃掉）：')
{
  const srcLayout = (layout.match(/displaystyle="true"/g) || []).length
  const outLayout = (layoutHtml.match(/displaystyle="true"/g) || []).length
  ok('displaystyle 全部保留', srcLayout > 0 && srcLayout === outLayout, `源 ${srcLayout} / 出 ${outLayout}`)

  const srcSt = (layout.match(/stretchy="true"/g) || []).length
  const outSt = (layoutHtml.match(/stretchy="true"/g) || []).length
  ok('stretchy 全部保留', srcSt > 0 && srcSt === outSt, `源 ${srcSt} / 出 ${outSt}`)

  ok('块级公式保留 display="block"', /display="block"/.test(layoutHtml))
  ok('行内公式保留 display="inline"', /display="inline"/.test(demoHtml))
}

console.log('\n长嵌套结构：')
{
  // 加权交叉熵那条：应有 2 个 ∑、1 个外层 log、2 个嵌套分数
  const seg = layoutHtml.slice(layoutHtml.indexOf('加权交叉熵'))
  ok('外层与内层求和都在', (seg.match(/<munderover><mo>∑/g) || []).length >= 2)
  ok('嵌套分式在', (seg.match(/<mfrac>/g) || []).length >= 2)
  ok('log 与括号都在', /log/.test(seg) && /stretchy="true"/.test(seg))
  ok('嵌套根号/分式都在', /<msqrt>[\s\S]{0,400}<mfrac>/.test(seg))
}

console.log('\n代码块里的 LaTeX 必须字面：')
{
  const fenced = htmlOf('```latex\n\\frac{a}{b} \\le \\sqrt{x^2}\n```')
  ok('反斜杠保留', fenced.includes('\\frac') && fenced.includes('\\le') && fenced.includes('\\sqrt'))
  ok('花括号保留', fenced.includes('{a}') && fenced.includes('{b}'))
  ok('没有被当成标签', !/<mfrac>/.test(fenced))
}

console.log('\n关掉 HTML 直通时公式变字面（预期行为）：')
{
  setHtmlPassthrough(false)
  const off = inline('<math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>')
  ok('公式变字面', /&lt;math&gt;/.test(off), off.slice(0, 40))
  setHtmlPassthrough(true)
  ok('开关已复位', /<math>/.test(inline('<math><mi>x</mi></math>')))
}

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
