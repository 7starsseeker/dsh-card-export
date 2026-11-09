#!/usr/bin/env node
/** dsh-ui 迷你渲染器的单测：子集渲染、未知组件标注、坏 JSON 退回。 */
import { renderDshUi, SUPPORTED } from '../lib/modes/dsh-ui.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

console.log('子集渲染：')
const spec = { gap: 12, title: '卡片标题', items: [
  { type: 'title', content: '小标题' },
  { type: 'text', content: '一段说明' },
  { type: 'callout', tone: 'success', title: '完成', content: '做完了' },
  { type: 'list', items: ['甲', '乙'] },
  { type: 'keyvalue', pairs: [{ key: '提交', value: 'abc123' }] },
  { type: 'table', columns: ['状态', '显示'], rows: [['未开播', '弹幕 17537']] },
  { type: 'stat', label: '命中率', value: '84%' },
  { type: 'badge', content: '已上线' },
  { type: 'divider' },
]}
const r = renderDshUi(JSON.stringify(spec))
check('解析并渲染成功', r.ok === true, r.reason)
check('卡片标题渲染', r.html.includes('卡片标题'))
check('callout 用 tone 上色', r.html.includes('ui-callout') && r.html.includes('#175A3B'))
check('list 渲染成 ul', r.html.includes('<ul class="ui-list">'))
check('keyvalue 渲染成行', r.html.includes('提交') && r.html.includes('abc123'))
check('table 渲染表头与数据', r.html.includes('<th>状态</th>') && r.html.includes('未开播'))
check('stat 渲染数值', r.html.includes('84%'))
check('divider 渲染 hr', r.html.includes('ui-hr'))
check('无未知组件时不出现警告', !r.html.includes('不支持'))

console.log('\n未知组件与坏输入：')
const unknown = renderDshUi(JSON.stringify({ items: [{ type: 'timeline' }, { type: 'text', content: 'x' }] }))
check('未知组件被标注', unknown.ok === true && unknown.unsupported.includes('timeline'), JSON.stringify(unknown.unsupported))
check('未知组件不中断其他渲染', unknown.html.includes('ui-text'))

const noType = renderDshUi(JSON.stringify({ items: [{ columns: ['a'], rows: [['1']] }] }))
check('缺 type 但形状唯一 → 推断为 table', noType.unsupported.length === 0 && noType.html.includes('<th>a</th>'),
  JSON.stringify(noType.unsupported))

const unknownShape = renderDshUi(JSON.stringify({ items: [{ foo: 1, bar: 2 }] }))
check('形状也认不出 → 标注并原样保留该段', unknownShape.unsupported.includes('(无 type)') &&
  unknownShape.html.includes('未识别组件') && unknownShape.html.includes('"foo": 1'))

const bad = renderDshUi('{ not json')
check('坏 JSON → ok:false 且给原因', bad.ok === false && bad.reason.includes('JSON'))

const empty = renderDshUi('{"items":[]}')
check('空 items → ok:false', empty.ok === false)

console.log('\n安全：')
const xss = renderDshUi(JSON.stringify({ items: [{ type: 'text', content: '<img src=x onerror=alert(1)>' }] }))
check('内容被转义（不注入 HTML）', !xss.html.includes('<img src=x') && xss.html.includes('&lt;img'))
check('支持列表可查询', SUPPORTED.includes('table') && SUPPORTED.includes('callout'))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
