#!/usr/bin/env node
/**
 * modes/markdown — 通用 Markdown 块解析器 + 渲染器。
 *
 * 只覆盖"报告类文档里真正会出现"的语法，不做完整 CommonMark：
 *   标题（#/##/###…）、段落、无序/有序列表、表格、引用、围栏代码块、分隔线、
 *   行内：**粗体**、`代码`、[文本](链接)、[n] 来源角标。
 *
 * 为什么自己写：零依赖是硬约束；而且报告的排版不需要 HTML 直通与嵌套列表的极端情况。
 * 未识别的块按段落输出——宁可退化成纯文本，也不吞内容。
 */

/** 行内渲染。链接支持相对路径（报告里常见 `[English](README.en.md)`），但拒绝 javascript:/data:。
 *
 *  HTML **原样输出**（用户明确选择）：先把标签挖出来占位，转义其余文本后放回，
 *  这样 `<span>` / MathML 之类会真的生效，而正文里的裸 `<` `&` 仍然安全。
 *  代价：这些 HTML 会在本机 headless 浏览器里执行——只用于渲染自己信任的文档。
 */
/**
 * 检测文档里有没有"会生效的原始 HTML"（代码块与行内代码里的不算）。
 * 用于出图前询问用户：要不要让这些 HTML 生效（会在本机浏览器执行）。
 * @returns {{found:boolean, count:number, tags:Record<string,number>, samples:string[]}}
 */
export function detectHtml(md) {
  const src = String(md || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const stripped = src
    .replace(/```[\s\S]*?```/g, '')      // 围栏代码块
    .replace(/`[^`\n]*`/g, '')           // 行内代码
    .replace(/<!--[\s\S]*?-->/g, '')     // 注释
  const MATH = new Set(['math', 'mi', 'mo', 'mn', 'mrow', 'mfrac', 'msqrt', 'mroot', 'msup', 'msub',
    'msubsup', 'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd', 'mtext', 'mspace', 'mfenced', 'mstyle'])
  const STYLE = new Set(['span', 'br', 'mark', 'u', 'b', 'i', 'em', 'strong', 'div', 'p', 'table', 'thead',
    'tbody', 'tr', 'td', 'th', 'sup', 'sub', 'small', 'big', 'code', 'del', 'ins', 'kbd', 'a',
    'details', 'summary', 'blockquote', 'hr', 'ul', 'ol', 'li', 'font', 'center', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
  // img 能加载外部 URL 且可挂 onerror，按"外链/可执行"对待
  const ACTIVE = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'form', 'input',
    'button', 'video', 'audio', 'source', 'canvas', 'svg', 'base', 'img'])

  const byCat = { math: {}, style: {}, active: {}, other: {} }
  const samples = []
  for (const m of stripped.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const name = m[1].toLowerCase()
    if (/^https?$/.test(name)) continue          // <https://…> 是自动链接
    const cat = MATH.has(name) ? 'math' : STYLE.has(name) ? 'style' : ACTIVE.has(name) ? 'active' : 'other'
    byCat[cat][name] = (byCat[cat][name] || 0) + 1
    if (samples.length < 5) samples.push(m[0].slice(0, 60))
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
  const summary = {
    math: { count: sum(byCat.math), tags: byCat.math },
    style: { count: sum(byCat.style), tags: byCat.style },
    active: { count: sum(byCat.active), tags: byCat.active },
    other: { count: sum(byCat.other), tags: byCat.other },
  }
  const count = summary.math.count + summary.style.count + summary.active.count + summary.other.count
  return { found: count > 0, count, summary, samples, hasActive: summary.active.count > 0 }
}

/** 全局 HTML 直通开关。默认开（报告是作者/模型写的可信内容）；
 *  渲染来源不明的文档前应调用 setHtmlPassthrough(false)，退化为全部转义。 */
let HTML_PASSTHROUGH = true
export function setHtmlPassthrough(on) { HTML_PASSTHROUGH = on !== false }
export function htmlPassthrough() { return HTML_PASSTHROUGH }

export function inline(s, opts = {}) {
  const allowHtml = opts.html !== undefined ? opts.html !== false : HTML_PASSTHROUGH
  const tags = []
  let t = String(s)
  if (allowHtml) {
    t = t.replace(/<(\/?[a-zA-Z][^>]*|!--[\s\S]*?--)>/g, (m) => {
      tags.push(m)
      return `\u0000H${tags.length - 1}\u0000`
    })
  }
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 图片必须在链接之前处理：否则 `![alt](url)` 会先被链接规则吃掉，只剩 "!" + 链接
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) =>
    `<span class="imgref">[图片] ${alt || src}</span>`)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, href) => {
    // 危险协议不生成链接，原样保留（保留完整匹配，避免吃掉右括号）
    if (/^(?:javascript|data|vbscript):/i.test(href)) return m
    const abs = /^https?:\/\//i.test(href)
    return `<a href="${href}"${abs ? ' target="_blank" rel="noreferrer"' : ''}>${txt}</a>`
  })
  // 三星号（粗体+斜体）先单独处理，否则会产生 <strong><em>x</strong></em> 这种错配
  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  // 粗体允许内部含 *斜体*（真实文档里很常见：**…*not* canonicalised.**）。
  // 用非贪婪且不排斥 * 的匹配；否则整对 ** 会原样漏到图上。
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  // 斜体：*文字* 或 _文字_（前面已处理 **粗体**，这里不会误伤）
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  t = t.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  // 图片：报告图不内嵌外链图，渲染成明确的引用标记（不让它变成 "!" + 链接）
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) =>
    `<span class="imgref">[图片] ${alt || src}</span>`)
  // 自动链接：<https://…>（esc 之后是 &lt;…&gt;）
  t = t.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g,
    (_m, url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  // 脚注引用：[^1] → 上标，链接到文末注释区
  t = t.replace(/\[\^([^\]]+)\]/g, (_m, id) =>
    `<sup class="fnref"><a href="#fn-${encodeURIComponent(id)}">[${id}]</a></sup>`)
  t = t.replace(/\[(\d+)\]/g, '<sup>[$1]</sup>')
  // 放回原样输出的 HTML 标签
  t = t.replace(/\u0000H(\d+)\u0000/g, (_m, i) => tags[Number(i)] || '')
  return t
}

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 解析成块序列。
 * @param {string} md
 * @returns {Array<object>} [{type, ...}]
 */
export function parseBlocks(md) {
  const lines = String(md || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0

  const flushList = (buf, ordered) => {
    if (!buf.length) return
    blocks.push({ type: ordered ? 'ol' : 'ul', items: buf.slice() })
    buf.length = 0
  }

  let listBuf = []
  let listOrdered = false
  const footnotes = []

  /** 把一段缩进内容解析成嵌套块（供列表项内嵌表格/子列表使用）。 */
  const parseNested = (chunk) => {
    if (!chunk.length) return []
    const dedent = Math.min(...chunk.filter((l) => l.trim()).map((l) => (l.match(/^\s*/) || [''])[0].length))
    const text = chunk.map((l) => l.slice(dedent)).join('\n')
    return parseBlocks(text)
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 空行：一般情况下结束列表；但如果下一个非空行还是同类列表项，
    // 说明只是「项与项之间空一行」，列表要继续——否则每项都会变成独立的
    // <ol>，渲染出来每一条都显示 1.（真实核查报告的「未证实」小节就是这样）。
    if (!trimmed) {
      if (listBuf.length) {
        let j = i
        while (j < lines.length && !lines[j].trim()) j++
        const next = (lines[j] || '').trim()
        const sameUl = listOrdered === false && /^[-*+]\s+/.test(next)
        const sameOl = listOrdered === true && /^\d+[.)]\s+/.test(next)
        if (!(sameUl || sameOl)) flushList(listBuf, listOrdered)
      }
      i++
      continue
    }

    // 围栏代码块
    const fence = trimmed.match(/^```(\w*)/)
    if (fence) {
      flushList(listBuf, listOrdered)
      const lang = fence[1] || ''
      const body = []
      i++
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i++ }
      i++ // 跳过收尾 ```
      blocks.push({ type: 'code', lang, text: body.join('\n') })
      continue
    }

    // Setext 一级标题（`标题` 下一行全是等号）。只认 `===`：真实文档里 `---` 更多是分隔线，
    // 按 CommonMark 会变成 h2，容易把整段结构改坏，这里保守处理。
    if (i + 1 < lines.length && /^={2,}\s*$/.test((lines[i + 1] || '').trim()) && trimmed && !/^[|>#]/.test(trimmed)) {
      flushList(listBuf, listOrdered)
      blocks.push({ type: 'h', level: 1, text: trimmed })
      i += 2
      continue
    }

    // 标题
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      flushList(listBuf, listOrdered)
      blocks.push({ type: 'h', level: h[1].length, text: h[2].trim() })
      i++
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList(listBuf, listOrdered)
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    // 表格（表头 + 分隔行）。首尾竖线可省略（GFM 允许 `列甲 | 列乙` 这种写法）
    if (trimmed.includes('|') && isTableSeparator(lines[i + 1])) {
      flushList(listBuf, listOrdered)
      const rows = []
      const header = splitRow(trimmed)
      i += 2
      while (i < lines.length && /^\s*\|?.*\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(splitRow(lines[i].trim())); i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // 引用（连续 > 行合并）
    if (/^>\s?/.test(trimmed)) {
      flushList(listBuf, listOrdered)
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: buf.join(' ').trim() })
      continue
    }

    // 脚注定义：`[^id]: 内容`（可含缩进续行）。不进正文，末尾统一输出注释区
    const fnDef = trimmed.match(/^\[\^([^\]]+)\]:\s*(.+)$/)
    if (fnDef) {
      flushList(listBuf, listOrdered)
      let body = fnDef[2].trim()
      i++
      while (i < lines.length && /^\s{2,}\S/.test(lines[i])) { body += ' ' + lines[i].trim(); i++ }
      footnotes.push({ id: fnDef[1], text: body })
      continue
    }

    // HTML 块（原样输出）：以标签开头的行，连续收集到空行
    const htmlStart = trimmed.match(/^<\/?([a-zA-Z][a-zA-Z0-9-]*)[\s>/]/)
    if (htmlStart && !/^<https?:/.test(trimmed)) {
      flushList(listBuf, listOrdered)
      const buf = [lines[i]]
      i++
      while (i < lines.length && lines[i].trim()) { buf.push(lines[i]); i++ }
      // 直通关掉时（外源文档），块级 HTML 也只能当普通段落转义输出
      if (HTML_PASSTHROUGH) {
        blocks.push({ type: 'html', html: buf.join('\n') })
      } else {
        blocks.push({ type: 'p', text: buf.map((l) => l.trim()).join(' ') })
      }
      continue
    }

    // 列表
    const ul = trimmed.match(/^[-*+]\s+(.+)$/)
    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (ul || ol) {
      const ordered = !!ol
      if (listBuf.length && ordered !== listOrdered) flushList(listBuf, listOrdered)
      listOrdered = ordered
      const itemText = (ul ? ul[1] : ol[1]).trim()
      i++
      // 收集缩进续行；遇到「空行 + 更深缩进」时，后续可能是嵌套块（GFM 规则）
      const inlineParts = []
      let nestedChunk = null
      while (i < lines.length) {
        const raw = lines[i]
        if (!raw.trim()) {
          let j = i + 1
          while (j < lines.length && !lines[j].trim()) j++
          const next = lines[j] || ''
          const deeper = /^\s{2,}\S/.test(next) && !/^\s*([-*+]|\d+[.)])\s/.test(next)
          if (deeper) {
            nestedChunk = []
            i = j
            while (i < lines.length && (lines[i].trim() === '' || /^\s{2,}/.test(lines[i]))) {
              nestedChunk.push(lines[i]); i++
            }
            while (nestedChunk.length && !nestedChunk[nestedChunk.length - 1].trim()) nestedChunk.pop()
            break
          }
          break
        }
        if (/^\s{2,}\S/.test(raw) && !/^\s*([-*+]|\d+[.)])\s/.test(raw)) { inlineParts.push(raw.trim()); i++; continue }
        break
      }
      const text = [itemText, ...inlineParts].join(' ').trim()
      const nested = nestedChunk ? parseNested(nestedChunk) : []
      listBuf.push(nested.length ? { text, blocks: nested } : text)
      continue
    }

    // 段落（连续非空行合并）
    flushList(listBuf, listOrdered)
    const para = [trimmed]
    i++
    while (i < lines.length) {
      const t2 = lines[i].trim()
      if (!t2 || /^(#{1,6}\s|>|\||```|-{3,}$|\*{3,}$)/.test(t2) ||
          /^[-*+]\s+/.test(t2) || /^\d+[.)]\s+/.test(t2)) break
      para.push(t2); i++
    }
    blocks.push({ type: 'p', text: para.join(' ') })
  }
  flushList(listBuf, listOrdered)
  if (footnotes.length) blocks.push({ type: 'footnotes', items: footnotes })
  return blocks
}

function splitRow(line) {
  // `\|` 是单元格内的竖线，不能当分隔符：先换成占位符，切完再还原
  const PH = '\u0000PIPE\u0000'
  const safe = line.replace(/\\\|/g, PH)
  const cells = safe.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.replace(new RegExp(PH, 'g'), '|').trim())
  return cells
}

/** 表格分隔行：`|---|:--:|` 或 `--- | ---` 都算。 */
function isTableSeparator(line) {
  const t = String(line || '').trim()
  if (!t || !t.includes('|')) return false
  return /^\|?[\s:|-]+\|?$/.test(t) && /-/.test(t)
}

/** 文档级结构：标题、导语、各级小节。 */
export function outline(md) {
  const blocks = parseBlocks(md)
  // 标题取「第一个标题块」——报告常把文档标题写成 ## 而正文小节也用 ##，
  // 要求必须是 H1 会让标题退化成第一段正文（那通常是导语，不是标题）。
  const titleIdx = blocks.findIndex((b) => b.type === 'h')
  const title = titleIdx === -1 ? '' : blocks[titleIdx].text

  // 导语：标题之后、下一个标题之前的第一个段落
  let dek = ''
  for (let k = titleIdx + 1; k < blocks.length; k++) {
    const b = blocks[k]
    if (b.type === 'h') break
    if (b.type === 'p') { dek = b.text; break }
  }

  const headings = blocks.filter((b, i) => b.type === 'h' && i !== titleIdx)
  const sections = headings.map((b) => b.text)          // 全部标题（含 h3），用于统计
  const sectionsH2 = headings.filter((b) => b.level === 2).map((b) => b.text)

  return {
    blocks,
    title: title || '',
    titleFromHeading: titleIdx !== -1,
    titleIdx,
    dek,
    sections,
    sectionsH2: sectionsH2.length ? sectionsH2 : sections, // 目录优先只用 h2，避免 h2/h3 混排出「7.1」这种断档
  }
}

/**
 * 块 → HTML。
 * @param {object[]} blocks
 * @param {{skipHeading?:boolean, skipDek?:boolean}} opts
 *   skipHeading  跳过第一个标题块（标题由外壳渲染）
 *   skipDek      跳过紧随其后的第一个段落（导语由外壳渲染）
 */
/** 块 → HTML 的逐块版本（保留块边界，供分页切分用）。 */
export function renderBlockList(blocks, { skipHeading = false, skipDek = false } = {}) {
  const out = []
  let headingSkipped = !skipHeading
  let dekSkipped = !skipDek
  for (const b of blocks) {
    if (b.type === 'h') { if (!headingSkipped) { headingSkipped = true; continue } }
    else if (b.type === 'p') { if (!dekSkipped) { dekSkipped = true; continue } }
    const html = renderBlocks([b])
    if (html) out.push(html)
  }
  return out
}

export function renderBlocks(blocks, { skipHeading = false, skipDek = false } = {}) {
  const out = []
  // 列表项：可能是纯字符串，也可能是「文本 + 嵌套块」（GFM：项内空行+缩进可放表格/子列表）
  const renderLi = (x) => (typeof x === 'string'
    ? `<li>${inline(x)}</li>`
    : `<li>${inline(x.text)}${x.blocks?.length ? '\n' + renderBlocks(x.blocks) : ''}</li>`)
  let headingSkipped = !skipHeading
  let dekSkipped = !skipDek
  for (const b of blocks) {
    if (b.type === 'h') {
      if (!headingSkipped) { headingSkipped = true; continue }
      if (b.level === 1) { out.push(`<h1>${inline(b.text)}</h1>`); continue }
      if (b.level === 2) { out.push(`<h2>${inline(b.text)}</h2>`); continue }
      out.push(`<h${b.level}>${inline(b.text)}</h${b.level}>`)
      continue
    }
    if (b.type === 'p') {
      if (!dekSkipped) { dekSkipped = true; continue }
      out.push(`<p>${inline(b.text)}</p>`)
      continue
    }
    switch (b.type) {
      case 'ul': out.push(`<ul>${b.items.map(renderLi).join('')}</ul>`); continue
      case 'ol': out.push(`<ol>${b.items.map(renderLi).join('')}</ol>`); continue
      case 'table': out.push(`<table>${b.header.length
        ? `<thead><tr>${b.header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''}
        <tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue
      case 'quote': out.push(`<blockquote>${inline(b.text)}</blockquote>`); continue
      case 'code': out.push(`<pre><code data-lang="${esc(b.lang)}">${esc(b.text)}</code></pre>`); continue
      case 'hr': out.push('<hr>'); continue
      // HTML 块原样输出（用户明确选择）：内容会在本机 headless 浏览器里执行
      case 'html': out.push(b.html); continue
      // 脚注区：文末注释，与正文的 [^id] 上标对应
      case 'footnotes': out.push(`<div class="footnotes"><div class="fn-title">注释</div>${
        b.items.map((f) => `<div class="fn" id="fn-${encodeURIComponent(f.id)}">`
          + `<span class="fn-id">[${esc(f.id)}]</span> ${inline(f.text)}</div>`).join('')}</div>`); continue
      default: continue
    }
  }
  return out.join('\n')
}
