#!/usr/bin/env node
/**
 * 生成「HTML 直通 vs 强制转义」的视觉对照图：
 * 同一段文本，左栏走报告路径（原样输出），右栏走 dsh-ui 卡片路径（转义）。
 * 产出单张 PNG，肉眼可直接比较。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { inline } from '../lib/modes/markdown.mjs'
import { renderDshUi, DSH_UI_CSS } from '../lib/modes/dsh-ui.mjs'
import { render } from '../lib/render/rasterize.mjs'

const outDir = process.argv[2] || '.'
mkdirSync(outDir, { recursive: true })

const sample = '这段有 <span style="color:#A63228;font-weight:800">红色加粗文字</span>，'
  + '有 <mark>高亮</mark>、<u>下划线</u>，<br>还有强制换行，'
  + '以及公式 <math><mfrac><mn>1</mn><mn>2</mn></mfrac><mo>+</mo><msup><mi>x</mi><mn>2</mn></msup></math>。'

// ① 报告路径：inline 默认直通
const reportHtml = `<div class="panel"><div class="tag">① 报告文档路径 · HTML 直通</div>
<div class="body">${inline(sample)}</div>
<div class="note">标签真的生效：红字、高亮、下划线、换行、公式排版都在。</div></div>`

// ② 卡片路径：inline({html:false})
const card = renderDshUi(JSON.stringify({ items: [{ type: 'text', content: sample }] }))
const cardHtml = `<div class="panel"><div class="tag">② dsh-ui 卡片路径 · 强制转义</div>
<div class="body card-body">${card.html}</div>
<div class="note">同一句话，标签全变成字面文本：没有红字、没有换行、没有公式。</div></div>`

const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>HTML 两条路径对照</title>
<style>
body{margin:0;padding:26px 0 40px;background:#EDEEF0;
  font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC",sans-serif;color:#0A0A0A}
.wrap{width:960px;margin:0 auto;background:#FAFAF8;padding:0 48px 34px}
.band{height:6px;background:#1F3A8A;margin:0 -48px 24px}
h1{font-size:22px;margin:0 0 6px;font-weight:800}
.sub{color:#6A6F76;font-size:12px;margin-bottom:22px}
.panel{border:1px solid #DDE0E4;border-radius:8px;padding:14px 16px;margin:0 0 18px;background:#fff}
.tag{font-size:11px;letter-spacing:2px;font-weight:800;color:#1F3A8A;margin-bottom:10px}
.body{font-size:15px;line-height:1.95;white-space:normal;word-break:break-word}
.card-body{background:#FAFAF8;border-radius:6px}
.note{margin-top:10px;padding-top:8px;border-top:1px dashed #E2E5E9;font-size:11.5px;color:#6A6F76}
${DSH_UI_CSS}
</style></head><body>
<div class="wrap"><div class="band"></div>
<h1>同一段文本，两条渲染路径的差别</h1>
<div class="sub">上面是报告（作者写的文档），下面是对话里的 dsh-ui 卡片（会话原文）</div>
${reportHtml}
${cardHtml}
</div>
<script>window.addEventListener('load',function(){
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
  document.documentElement.setAttribute('data-h',h);document.documentElement.setAttribute('data-hb',h);});</script>
</body></html>`

const htmlPath = join(outDir, 'html-two-paths.html')
writeFileSync(htmlPath, page, 'utf8')
const r = await render(htmlPath, join(outDir, 'html-two-paths.png'), { width: 1056 })
console.log(JSON.stringify({ ok: r.ok, png: join(outDir, 'html-two-paths.png'), height: r.height, error: r.error }, null, 2))
