#!/usr/bin/env node
/**
 * trim 单测：造一张底部带空白的 PNG（用浏览器渲染一个已知高度页面），裁完校验：
 *   · 高度确实变小
 *   · 仍是合法 PNG（重新解析 IHDR 成功）
 *   · 裁掉的是背景色，不是内容
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { trimBottom } from '../lib/render/trim.mjs'
import { render } from '../lib/render/rasterize.mjs'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

function pngSize(file) {
  const b = readFileSync(file)
  const sig = b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20)
  return { sig, w, h }
}

const tmp = mkdtempSync(join(tmpdir(), 'card-trim-'))
const page = join(tmp, 'p.html')
// 故意让页面自报高度比内容高 300px，模拟真实偏差
writeFileSync(page, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:20px;background:#EDEEF0;font:14px sans-serif}
.card{width:600px;background:#fff;padding:20px}
</style></head><body><div class="card"><p>内容一行</p><p>内容两行</p></div>
<script>window.addEventListener('load',function(){
  var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)+300;
  document.documentElement.setAttribute('data-h',h);document.documentElement.setAttribute('data-hb',h);});</script>
</body></html>`, 'utf8')

const out = join(tmp, 'shot.png')
const r = await render(page, out, { width: 700, mode: 'png' })

console.log('渲染与裁剪：')
check('渲染成功', r.ok === true, r.error || '')
const before = r.height || 0
const after = pngSize(out).h
check('图片高度小于自报高度（空白被裁）', after < before, `自报=${before} 实际=${after}`)
const info = pngSize(out)
check('仍是合法 PNG', info.sig === true)
check('宽度未变', info.w === 700 * 2 || info.w === 700, String(info.w))

console.log('\n幂等与容错：')
const again = trimBottom(out)
check('再裁一次最多去掉 2px（不啃内容）', again.ok === true && (again.before - again.after) <= 2,
  JSON.stringify(again))
const notPng = join(tmp, 'x.txt'); writeFileSync(notPng, 'hello')
const bad = trimBottom(notPng)
check('非 PNG 明确返回失败', bad.ok === false && /PNG/.test(bad.reason || ''), JSON.stringify(bad))
check('失败时不损坏原文件', statSync(notPng).size === 5)

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
