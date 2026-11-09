#!/usr/bin/env node
/** 检查代码块内的 HTML 是否仍被转义。 */
import { parseBlocks, renderBlocks } from '../lib/modes/markdown.mjs'

const fence = '```' 
const md = `${fence}html\n<b>x</b>\n${fence}`
console.log('输入:', JSON.stringify(md))
console.log('输出:', renderBlocks(parseBlocks(md)))
console.log('转义正确:', /&lt;b&gt;/.test(renderBlocks(parseBlocks(md))))
