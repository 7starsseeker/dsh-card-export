#!/usr/bin/env node
/**
 * 真实文档扫描：拿仓库里现成的 md 跑通用报告渲染，检查有没有"字面 Markdown 漏到图上"。
 * 只做只读检查，不改任何文件。
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { buildReport } from '../lib/modes/report.mjs'

const files = process.argv.slice(2).filter((f) => existsSync(f))

const LEAKS = [
  ['裸竖线表格行', /<p>\|[^<]{6,}/],
  ['字面粗体 **', /<p>[^<]{0,40}\*\*[^<]/],
  ['字面标题 #', /<p>#{1,6}\s/],
  ['字面围栏 ```', /<p>```/],
  ['字面列表 - ', /<p>[-*+]\s+\S/],
  ['字面分隔线 ---', /<p>-{3,}<\/p>/],
  ['未闭合表格', /<table>(?![\s\S]*?<\/table>)/],
]

let problems = 0
console.log('真实文档渲染扫描（通用报告路径）\n')
for (const f of files) {
  const md = readFileSync(f, 'utf8')
  let doc
  try { doc = buildReport(md, { preset: 'generic' }) } catch (e) {
    console.log(`✗ ${basename(f)}  渲染抛错: ${e.message}`)
    problems++; continue
  }
  const html = doc.pages.map((p) => p.html).join('')
  const body = html.slice(html.indexOf('<body'))
  const found = []
  for (const [name, re] of LEAKS) {
    const m = body.match(re)
    if (m) found.push(`${name}: ${m[0].replace(/\s+/g, ' ').slice(0, 46)}`)
  }
  const size = Math.round(statSync(f).size / 1024)
  if (found.length) {
    problems++
    console.log(`✗ ${basename(f)}  (${size} KB)`)
    for (const x of found) console.log(`    ${x}`)
  } else {
    console.log(`✓ ${basename(f)}  (${size} KB)`)
  }
}
console.log(`\n${files.length - problems}/${files.length} 份文档无字面记号泄漏`)
process.exit(problems === 0 ? 0 : 1)
