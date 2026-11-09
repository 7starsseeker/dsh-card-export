#!/usr/bin/env node
/**
 * 对话预设的单元测试：用**合成会话日志**跑解析/筛选/渲染，不依赖真实大文件。
 * 真实文件的冒烟另见 --real 参数（默认跳过，避免测试依赖本机会话库）。
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { readSession, selectRange, renderTranscript, LEVELS, featuresOf } from '../lib/modes/transcript.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'card-export-ts-'))

/** 造一份最小会话：2 轮，含注入内容、思考块、工具调用。 */
function makeSession() {
  const ev = (seq, type, data) => JSON.stringify({ type, seq, time: 1790000000000 + seq, data })
  const lines = [
    JSON.stringify({ type: 'session', version: 4, id: 'session-test', cwd: 'C:\\x', createdAt: 1790000000000, agentPreset: 'neko-whale-standard' }),
    ev(0, 'turn/start', { turn: 1 }),
    ev(1, 'session/title', { title: '测试会话标题', messageSeqs: [2] }),
    ev(2, 'user/message', { turn: 1, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第一问：这句话会被导出' }] }),
    ev(3, 'user/message', { turn: 1, role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context. 这段不该进图' }] }),
    ev(4, 'user/message', { turn: 1, role: 'user', source: { kind: 'plugin:hindsight' }, content: [{ type: 'text', text: '<hindsight_knowledge>不该进图</hindsight_knowledge>' }] }),
    ev(5, 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [
      { type: 'reasoning', text: '这是思考块，默认不该出现' },
      { type: 'text', text: '第一答：正文会导出' }] } }),
    ev(5.5, 'assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: [
      { type: 'text', text: '第一答补充：这才是本轮最终回答' }] } }),
    ev(6, 'tool/call', { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' }),
    ev(7, 'tool/result', { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: 'file1\nfile2' }] } }),
    ev(7.5, 'turn/start', { turn: 2 }),
    ev(8, 'user/message', { turn: 2, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '第二问' }] }),
    ev(9, 'assistant/message', { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '第二答' }] } }),
    ev(10, 'user/message', { turn: 2, role: 'user', source: { kind: 'time-context' }, content: [{ type: 'text', text: 'Time sampled...' }] }),
  ]
  const file = join(tmp, 'session.v4.jsonl.zstd')
  writeFileSync(file, zstdCompressSync(Buffer.from(lines.join('\n') + '\n', 'utf8')))
  return file
}

const file = makeSession()
const s = readSession(file)

console.log('解析：')
check('读出会话头', s.meta.id === 'session-test')
check('读出标题', s.meta.title === '测试会话标题', String(s.meta.title))
check('读出轮次 1、2', JSON.stringify(s.turns) === '[1,2]', JSON.stringify(s.turns))
check('真人用户消息 2 条', s.items.filter((i) => i.kind === 'user').length === 2, String(s.items.filter((i) => i.kind === 'user').length))
check('注入内容未进入事件流',
  !s.items.some((i) => /runtime-context|hindsight_knowledge|Time sampled/.test(i.text || '')), '仍含注入内容')
check('含思考块事件', s.items.some((i) => i.kind === 'thinking'))
check('含工具调用事件', s.items.some((i) => i.kind === 'tool'))
check('事件按 seq 升序', s.items.every((it, i) => i === 0 || it.seq >= s.items[i - 1].seq))

console.log('\n范围选择：')
const all = selectRange(s, {})
check('不指定范围 → 全量', all.items.length === s.items.length, `${all.items.length}/${s.items.length}`)

const last1 = selectRange(s, { last: 1 })
check('--last 1 → 只剩第 2 轮', last1.items.every((i) => i.turn === 2), JSON.stringify([...new Set(last1.items.map((i) => i.turn))]))

const t1 = selectRange(s, { turns: '1-1' })
check('--turns 1-1 → 只剩第 1 轮', t1.items.every((i) => i.turn === 1))

const sq = selectRange(s, { seq: '5-7' })
check('--seq 5-7 → 只留该区间', sq.items.every((i) => i.seq >= 5 && i.seq <= 7), JSON.stringify(sq.items.map((i) => i.seq)))

const bad = selectRange(s, { turns: 'x-y' })
check('非法范围被忽略（退回全量）', bad.items.length === s.items.length)

// 轮次范围必须把「无轮次归属」的消息排除，否则会把整段会话漏进来
const withLoner = {
  meta: {}, turns: [1, 2],
  items: [
    { kind: 'user', seq: 1, turn: 1, text: 'a' },
    { kind: 'user', seq: 2, turn: null, text: '轮次外的消息' },
    { kind: 'assistant', seq: 3, turn: 2, text: 'b' },
  ],
}
const scoped = selectRange(withLoner, { last: 1 })
check('--last 排除无轮次消息', !scoped.items.some((i) => i.text === '轮次外的消息'), JSON.stringify(scoped.items.map((i) => i.text)))
check('--turns 同样排除', !selectRange(withLoner, { turns: '1-2' }).items.some((i) => i.turn == null))
check('不指定范围时保留无轮次消息', selectRange(withLoner, {}).items.some((i) => i.turn == null))

console.log('\n轮次归属（真人消息不带 turn，必须按 turn/start 序号推导）：')
check('用户消息获得了轮次', s.items.filter((i) => i.kind === 'user').every((i) => i.turn != null),
  JSON.stringify(s.items.filter((i) => i.kind === 'user').map((i) => i.turn)))
check('第 1 轮用户消息归到第 1 轮', s.items.find((i) => i.text.includes('第一问'))?.turn === 1)
check('第 2 轮用户消息归到第 2 轮', s.items.find((i) => (i.text || '').includes('第二问'))?.turn === 2)

const ranged = selectRange(s, { turns: '2-2' })
check('按轮次导出时用户指令不再被丢', ranged.items.some((i) => i.kind === 'user' && i.text.includes('第二问')),
  JSON.stringify(ranged.items.map((i) => `${i.kind}:${i.text.slice(0, 6)}`)))
check('按轮次导出时不含另一轮的用户指令', !ranged.items.some((i) => i.text.includes('第一问')))

console.log('\n引用式定位（从「>这段」到「>那段」）：')
const q1 = selectRange(s, { from: '第一问：这句话' })
check('只给 --from → 从锚点到末尾', q1.items.length > 0 && q1.items[0].text.includes('第一问'), String(q1.items.length))
check('锚点信息被回报', q1.anchors?.from?.seq != null, JSON.stringify(q1.anchors))

const q2 = selectRange(s, { from: '第一问：这句话', to: '第二问' })
check('给了 --from 和 --to → 取区间', q2.items[0].text.includes('第一问') && q2.items[q2.items.length - 1].text.includes('第二问'),
  JSON.stringify(q2.items.map((i) => (i.text || '').slice(0, 6))))
check('区间跨两轮', q2.items.some((i) => i.turn === 1) && q2.items.some((i) => i.turn === 2))

check('引文带 markdown 引用符也能匹配', selectRange(s, { from: '> 第一问：这句话' }).items.length > 0)
check('引文带空白差异也能匹配', selectRange(s, { from: '第一问： 这句话' }).items.length > 0)

const qNotFound = selectRange(s, { from: '这段文字根本不存在于会话里' })
check('找不到锚点时明确报错', typeof qNotFound.error === 'string' && qNotFound.error.includes('没找到'), qNotFound.error)

const qTooShort = selectRange(s, { from: '问' })
check('单字引文被拒绝', typeof qTooShort.error === 'string' && qTooShort.error.includes('太短'))

// 短但唯一的引文应当可用（真实会话里「删了」这种指令很常见）
check('短而唯一的引文可以定位', (() => {
  const r = selectRange(s, { from: '第二问' })
  return !r.error && r.items.length > 0 && r.items[0].text.includes('第二问')
})(), JSON.stringify(selectRange(s, { from: '第二问' }).error))

// 短且多处命中 → 拒绝并列出候选，而不是随便挑一个
const dupSession = {
  meta: {}, turns: [1],
  items: [
    { kind: 'user', seq: 1, turn: 1, text: '好的' },
    { kind: 'user', seq: 2, turn: 1, text: '好的' },
  ],
}
const dup = selectRange(dupSession, { from: '好的' })
check('短且多处命中时拒绝并给出候选位置',
  typeof dup.error === 'string' && dup.error.includes('命中 2 处'), dup.error)

const qReverse = selectRange(s, { from: '第二问', to: '第一问：这句话' })
check('终点在起点之前时报错', typeof qReverse.error === 'string' && qReverse.error.includes('之前'))

check('只给 --to 时报错提示需要起点',
  typeof selectRange(s, { to: '第二问' }).error === 'string')

check('引用式定位结果能直接渲染', (() => {
  const out = renderTranscript(s, q2, {})
  return out.html.includes('第一问') && out.html.includes('第二问')
})())

console.log('\n显示档位（对齐客户端四档）：')
check('LEVELS 四档齐全', LEVELS.join(',') === 'compact,standard,detailed,verbose')
const feat = (lv) => featuresOf(lv)
check('compact：仅最终回答', feat('compact').finalOnly === true)
check('standard：过程收起', feat('standard').thinking === false && feat('standard').tools === false)
check('detailed：含工具不含结果', feat('detailed').tools === true && feat('detailed').toolResults === false)
check('verbose：含思考与工具结果', feat('verbose').thinking === true && feat('verbose').toolResults === true)
check('--with-thinking 可越过档位', featuresOf('standard', { withThinking: true }).thinking === true)

const lvCompact = renderTranscript(s, selectRange(s, {}), { level: 'compact' })
check('compact 档每轮只留最后一条回答',
  lvCompact.html.includes('第一答补充') && !lvCompact.html.includes('第一答：正文会导出'),
  `补充=${lvCompact.html.includes('第一答补充')} 旧答=${lvCompact.html.includes('第一答：正文会导出')}`)
check('compact 仍保留用户指令', lvCompact.html.includes('第一问'))

console.log('\n渲染：')
const base = renderTranscript(s, selectRange(s, { turns: '1-2' }), {})
check('默认不含思考块', !base.html.includes('这是思考块'))
check('默认不含工具调用', !base.html.includes('bash'))
check('默认含用户与助手正文', base.html.includes('第一问') && base.html.includes('第一答'))
check('轮次分隔存在', base.html.includes('第 1 轮') && base.html.includes('第 2 轮'))
check('标题来自会话', base.html.includes('测试会话标题'))
check('交付说明不进图（无「已排除」字样）', !base.html.includes('已排除') && !base.html.includes('--with-'))
check('交付说明单独返回给调用方', base.notes.some((h) => h.includes('思考')) && base.notes.some((h) => h.includes('工具')))
check('交付说明写明如何包含', base.notes.every((h) => h.includes('--')))

const withThink = renderTranscript(s, selectRange(s, {}), { withThinking: true })
check('--with-thinking 才出现思考块', withThink.html.includes('这是思考块'))

const withTools = renderTranscript(s, selectRange(s, {}), { withTools: true })
check('--with-tools 出现工具调用（不含结果）',
  withTools.html.includes('bash') && !withTools.html.includes('file1'), '结果不该在这一档出现')

const verbose = renderTranscript(s, selectRange(s, {}), { level: 'verbose' })
check('verbose 才带工具结果', verbose.html.includes('file1'))
check('verbose 同时带思考', verbose.html.includes('这是思考块'))

const titled = renderTranscript(s, selectRange(s, {}), { title: '自定义标题' })
check('--title 覆盖会话标题', titled.html.includes('自定义标题'))

const only1 = renderTranscript(s, selectRange(s, { last: 1 }), {})
check('范围外的内容不出现', !only1.html.includes('第一问') && only1.html.includes('第二问'))
check('统计数字与内容一致', only1.counts.turns === 1, JSON.stringify(only1.counts))

const emptySession = { meta: {}, items: [], turns: [] }
check('空会话渲染不崩', typeof renderTranscript(emptySession, { items: [], range: {} }, {}).html === 'string')

console.log('\n超长内容处理：')
const longText = '开头文字。' + 'data:image/png;base64,' + 'A'.repeat(500) + ' 结尾文字。'
const clippedLong = renderTranscript(
  { meta: { title: 'T' }, items: [{ kind: 'user', seq: 1, turn: 1, text: longText }], turns: [1] },
  { items: [{ kind: 'user', seq: 1, turn: 1, text: longText }], range: {} }, {})
check('内嵌 base64 被省略', clippedLong.html.includes('已省略') && !clippedLong.html.includes('A'.repeat(200)))
check('省略处标出原长度', /内嵌图片\/数据，已省略 \d+ 字符/.test(clippedLong.html))

const superLong = 'X'.repeat(3000)
const clipped2 = renderTranscript(
  { meta: { title: 'T' }, items: [{ kind: 'assistant', seq: 1, turn: 1, text: superLong }], turns: [1] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: superLong }], range: {} }, {})
check('超长正文被截断并标出原文长度', clipped2.html.includes('原文 3000 字'))
check('截断提示作为交付说明返回（不进图）', clipped2.notes.some((h) => h.includes('截断')) && !clipped2.html.includes('--max-chars'))

const noClip = renderTranscript(
  { meta: { title: 'T' }, items: [{ kind: 'assistant', seq: 1, turn: 1, text: superLong }], turns: [1] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: superLong }], range: {} }, { maxChars: 0 })
check('--max-chars 0 关闭截断', noClip.html.includes('X'.repeat(3000)))

console.log('\n图片与表情：')
const imgSession = {
  meta: { title: 'IMG' }, turns: [1],
  items: [
    { kind: 'user', seq: 1, turn: 1, text: '看这张图 [表情: 得意]' },
    { kind: 'image', seq: 2, turn: 1, attachmentId: 'sha256:deadbeefdeadbeefdeadbeef', mediaType: 'image/png', bytes: 12345, width: 800, height: 600, name: 'shot.png' },
  ],
}
const imgDefault = renderTranscript(imgSession, { items: imgSession.items, range: {} }, {})
check('默认图片出占位标记', imgDefault.html.includes('[图片]') && imgDefault.html.includes('shot.png'))
check('占位标记含尺寸与体积', imgDefault.html.includes('800×600') && imgDefault.html.includes('12 KB'))
check('占位标记说明本次未导出', imgDefault.html.includes('本次未导出'))
check('占位标记不写命令提示（命令不进图）', !imgDefault.html.includes('--with-images'))
check('默认不出现 <img>', !imgDefault.html.includes('<img '))

const imgOn = renderTranscript(imgSession, { items: imgSession.items, range: {} }, { withImages: true })
check('附件不存在时注明找不到', imgOn.html.includes('本地附件库找不到'), '缺失应可辨')

check('表情标记渲染成标签', imgDefault.html.includes('class="meme"') && imgDefault.html.includes('得意'))
check('表情原文没有被吞', imgDefault.html.includes('得意'))

// 真附件：造一个本地附件库并验证内嵌
const home = join(tmp, 'dsh-home')
const hex = 'a'.repeat(64)
const objDir = join(home, 'attachments', 'v1', 'objects', hex.slice(0, 2))
mkdirSync(objDir, { recursive: true })
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
writeFileSync(join(objDir, hex), pngBytes)
const realImgSession = {
  meta: {}, turns: [1],
  items: [{ kind: 'image', seq: 1, turn: 1, attachmentId: `sha256:${hex}`, mediaType: 'image/png', bytes: pngBytes.length, width: 10, height: 10, name: 'real.png' }],
}
const inlined = renderTranscript(realImgSession, { items: realImgSession.items, range: {} }, { withImages: true, home })
check('--with-images 且附件存在时内嵌 <img>', inlined.html.includes('<img src="data:image/png;base64,'))
check('内嵌图片带 alt 与说明', inlined.html.includes('alt="real.png"') && inlined.html.includes('real.png'))

const tooBig = renderTranscript(realImgSession, { items: realImgSession.items, range: {} }, { withImages: true, home, maxImageBytes: 5 })
check('超过体积上限时不内嵌', !tooBig.html.includes('<img') && tooBig.html.includes('本次未导出'))

console.log('\n代码块与换行：')
const fenced = '喵~ 已重打包。\n\n```dsh-ui\n{"gap":12,"items":[{"type":"callout","content":"好了"}]}\n```\n\n两个小提醒：\n1. 第一条\n2. 第二条'
const fs2 = renderTranscript(
  { meta: { title: 'T' }, turns: [1], items: [{ kind: 'assistant', seq: 1, turn: 1, text: fenced }] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: fenced }], range: {} }, {})
check('默认把 dsh-ui 渲染成卡片', fs2.html.includes('class="ui-card"') && fs2.html.includes('ui-callout'))
const fs2Raw = renderTranscript(
  { meta: { title: 'T' }, turns: [1], items: [{ kind: 'assistant', seq: 1, turn: 1, text: fenced }] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: fenced }], range: {} }, { renderUi: false })
check('--no-render-ui 时退回代码块', fs2Raw.html.includes('<pre data-lang="dsh-ui"><code>'))
check('退回时只有一个 code 元素',
  (fs2Raw.html.match(/<code>/g) || []).length === 1,
  `code 元素数=${(fs2Raw.html.match(/<code>/g) || []).length}`)
const nl = renderTranscript(
  { meta: {}, turns: [1], items: [{ kind: 'assistant', seq: 1, turn: 1, text: '第一行\n第二行' }] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: '第一行\n第二行' }], range: {} }, {})
check('正文内部换行保留成 <br>', nl.html.includes('第一行<br>第二行'))
check('代码块后不残留多余空行', !/<\/pre><br>/.test(fs2.html), '代码块后不该紧跟 <br>')
check('代码块外的正文仍在', fs2.html.includes('两个小提醒：'))

const longCode = '```js\n' + Array.from({ length: 60 }, (_, i) => `line${i}`).join('\n') + '\n```'
const fs3 = renderTranscript(
  { meta: {}, turns: [1], items: [{ kind: 'assistant', seq: 1, turn: 1, text: longCode }] },
  { items: [{ kind: 'assistant', seq: 1, turn: 1, text: longCode }], range: {} }, {})
check('超长代码块按行截断并标注', fs3.html.includes('代码块共 60 行，此处显示前 40 行'))
check('截断后仍保留前若干行', fs3.html.includes('line0') && !fs3.html.includes('line59'))

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
