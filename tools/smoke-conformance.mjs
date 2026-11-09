#!/usr/bin/env node
/**
 * 渲染对照扫描：把 cases/conformance.md 里每种 Markdown 结构跑一遍，
 * 检查"该出现的是否出现、不该出现的字面记号是否漏出来"。
 *
 * 目的不是追求 100% 覆盖率，而是**如实列出哪里会坏**——
 * 报告类渲染器只承诺支持一个子集，超出子集的必须能看出来，不能静默变形。
 */
import { readFileSync } from 'node:fs'
import { buildReport } from '../lib/modes/report.mjs'

const md = readFileSync(new URL('../cases/conformance.md', import.meta.url), 'utf8')
const doc = buildReport(md, { preset: 'generic' })
const html = doc.pages.map((p) => p.html).join('\n')
const body = html.slice(html.indexOf('<body'))

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}${d ? '  → ' + d : ''}`)) }

console.log('结构是否渲染成对应元素：')
ok('粗体 → <strong>', /<strong>粗体<\/strong>/.test(body))
ok('斜体 → <em>', /<em>斜体<\/em>/.test(body))
ok('行内代码 → <code>', /<code>行内代码<\/code>/.test(body))
ok('链接 → <a href>', /<a href="https:\/\/example\.com"/.test(body))
ok('h2 → <h2>', /<h2>二级标题<\/h2>/.test(body))
ok('h3 → <h3>', /<h3>三级标题<\/h3>/.test(body))
ok('h4 → <h4>', /<h4>四级标题<\/h4>/.test(body))
ok('h5 → <h5>', /<h5>五级标题<\/h5>/.test(body))
ok('无序列表 → <ul>', /<ul>/.test(body))
ok('有序列表 → <ol>', /<ol>/.test(body))
ok('表格 → <table>', /<table>/.test(body))
ok('引用 → <blockquote>', /<blockquote>/.test(body))
ok('围栏代码 → <pre><code>', /<pre><code/.test(body))
ok('分隔线 → <hr>', /<hr>/.test(body))

console.log('\n列表细节：')
{
  const ol = body.match(/<ol>([\s\S]*?)<\/ol>/g) || []
  const li = ol.map((o) => (o.match(/<li>/g) || []).length)
  ok('带空行的有序列表合成一个 <ol>（1,2,3 同一组）', li.includes(3), `各组 li 数: ${li.join(',')}`)
  ok('有序项含续行（未被拆成段落）', /<li>第一条[\s\S]{3,}?续行 B[\s\S]*?<\/li>/.test(body))
  ok('嵌套列表产生嵌套 <ul>', /<li>父项一[\s\S]*?<ul>/.test(body), '嵌套被拍平')
  ok('任务列表方括号被识别（不残留字面 - [ ]）', !/<li>- \[ \]/.test(body), '残留字面任务框')
}

console.log('\n表格细节：')
{
  ok('转义竖线 \\| 不把单元格切开', /<td><code>a \| b<\/code><\/td>/.test(body), '单元格被 \\| 切断')
  ok('表格无首尾竖线也能识别', /<th>列甲<\/th>/.test(body), '缺竖线的表没识别')
  ok('对齐标记不出现在单元格里', !/<td[^>]*>:---/.test(body) && !/<td>\s*---\s*<\/td>/.test(body))
  ok('单元格内的 [n] 角标渲染为 <sup>', /<sup>\[1\]<\/sup>/.test(body))
}

console.log('\n不该漏出来的字面记号：')
{
  const leaks = [
    ['字面粗体 **', /<p>[^<]*\*\*[^<]*<\/p>/],
    ['字面竖线表格行', /<p>\|[^<]{6,}/],
    ['字面 # 标题', /<p>#{1,6}\s/],
    ['字面 ``` 围栏', /<p>```/],
    ['字面任务框 - [ ]', /<p>- \[[ x]\]/],
    ['字面分隔线 ---', /<p>-{3,}<\/p>/],
  ]
  for (const [name, re] of leaks) {
    const m = body.match(re)
    ok(name, !m, m ? m[0].slice(0, 50) : '')
  }
}

console.log('\n新增支持（脚注 / HTML 原样 / 列表内表格）：')
{
  const { parseBlocks, renderBlocks } = await import('../lib/modes/markdown.mjs')
  const fn = renderBlocks(parseBlocks('正文有注[^1]。\n\n[^1]: 注释内容'))
  ok('脚注引用 → 上标链接', /<sup class="fnref">.*#fn-1/.test(fn.replace(/\n/g, '')))
  ok('脚注生成文末注释区', /class="footnotes"/.test(fn) && /注释内容/.test(fn))
  ok('脚注定义不再留在正文', !/<p>\[\^1\]/.test(fn))

  const html = renderBlocks(parseBlocks('<div class="x">\n  <b>原样</b>\n</div>\n\n后续'))
  ok('HTML 块原样输出', /<div class="x">/.test(html) && /<b>原样<\/b>/.test(html))
  ok('HTML 之后的段落仍正常', /<p>后续<\/p>/.test(html))
  const inlineHtml = renderBlocks(parseBlocks('含 <span style="color:red">红字</span> 的段落'))
  ok('行内 HTML 原样输出', /<span style="color:red">红字<\/span>/.test(inlineHtml))
  ok('行内 HTML 里的 MathML 原样保留', /<math>/.test(renderBlocks(parseBlocks('公式 <math><mi>x</mi></math>'))))

  const nested = renderBlocks(parseBlocks('- 说明：\n\n  | k | v |\n  |---|---|\n  | a | 1 |'))
  ok('列表内表格（空行+缩进）渲染成 <table>', /<li>说明：\s*<table>/.test(nested))
  const flat = renderBlocks(parseBlocks('- 说明：\n  | k | v |\n  |---|---|'))
  ok('列表内表格（无空行）保持拍平（GFM 规则）', !flat.includes('<table>'))
}

console.log('\nHTML 检测（出图前询问用）：')
{
  const { detectHtml } = await import('../lib/modes/markdown.mjs')
  const plain = detectHtml('纯文本一段，含 <https://example.com> 自动链接。')
  ok('纯文本不误报', plain.found === false, JSON.stringify(plain.summary))
  ok('自动链接不算 HTML', plain.count === 0, String(plain.count))

  const mathDoc = detectHtml('<math display="block"><mfrac><mi>a</mi><mi>b</mi></mfrac></math>')
  ok('MathML 归入 math 类', mathDoc.summary.math.count > 0 && mathDoc.found)

  const styled = detectHtml('含 <span style="color:red">红</span> 与 <br>')
  ok('排版标签归入 style 类', styled.summary.style.count > 0 && !styled.hasActive)

  const risky = detectHtml('正常\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>')
  ok('script / img 判为可执行类', risky.hasActive === true, JSON.stringify(risky.summary.active))
  ok('可执行类会给出计数', risky.summary.active.count >= 2, String(risky.summary.active.count))

  const fenced = detectHtml('```html\n<script>alert(1)</script>\n```')
  ok('代码块内的标签不算（不会触发询问）', fenced.found === false, JSON.stringify(fenced.summary))
}

console.log('\nHTML 直通开关（外源内容用）：')
{
  const { parseBlocks, renderBlocks, setHtmlPassthrough, htmlPassthrough } = await import('../lib/modes/markdown.mjs')
  const md = '含 <span style="color:red">红字</span> 的段落\n\n<div class="x">块级</div>'
  setHtmlPassthrough(true)
  const on = renderBlocks(parseBlocks(md))
  ok('默认直通：行内标签生效', /<span style="color:red">红字<\/span>/.test(on))
  ok('默认直通：块级 HTML 生效', /<div class="x">块级<\/div>/.test(on))

  setHtmlPassthrough(false)
  ok('关掉后 htmlPassthrough() 返回 false', htmlPassthrough() === false)
  const off = renderBlocks(parseBlocks(md))
  ok('关掉后行内标签变字面', /&lt;span/.test(off), off.slice(0, 60))
  ok('关掉后块级 HTML 变段落', !/<div class="x">/.test(off) && /&lt;div/.test(off))
  setHtmlPassthrough(true)   // 复位，避免影响后续断言
  ok('复位成功', htmlPassthrough() === true)
}

console.log('\n安全：')
{
  const { parseBlocks, renderBlocks } = await import('../lib/modes/markdown.mjs')
  const f = '```'
  const code = renderBlocks(parseBlocks(`${f}html\n<b>x</b>\n${f}`))
  ok('代码块内的 HTML 转义（不执行）', /&lt;b&gt;x&lt;\/b&gt;/.test(code), code.slice(0, 80))
  ok('代码块没有变成真标签', !/<pre><code[^>]*><b>/.test(code))
}
ok('图片不内嵌，转成文本/占位', !/<img /.test(body), '出现了 <img>')

console.log('\n已知边界（明确不支持，如实断言当前行为）：')
{
  const { parseBlocks, renderBlocks } = await import('../lib/modes/markdown.mjs')
  const fn = parseBlocks('正文[^1]\n\n[^1]: 脚注')
  ok('脚注定义被识别为 footnotes 块', fn.some((b) => b.type === 'footnotes'))
  const setext = renderBlocks(parseBlocks('标题\n===\n\n正文'))
  ok('Setext `===` 标题支持', setext.includes('<h1>标题</h1>'))
  const dash = parseBlocks('正文\n\n---\n\n后续')
  ok('`---` 仍按分隔线处理（不误判成标题）', dash.some((b) => b.type === 'hr'))
}

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
