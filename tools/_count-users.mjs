#!/usr/bin/env node
/** 从已生成的对话 HTML 里数出「用户」条目，确认范围导出没丢指令。 */
import { readFileSync } from 'node:fs'

const h = readFileSync(process.argv[2], 'utf8')
const users = [...h.matchAll(/<div class="role">用户<\/div><div class="body">([\s\S]*?)<\/div>/g)]
  .map((m) => m[1].replace(/<[^>]+>/g, '').slice(0, 70))
const assistants = [...h.matchAll(/<div class="role">助手<\/div><div class="body">[\s\S]*?<\/div>/g)]
console.log('用户消息条数:', users.length)
users.forEach((u, i) => console.log(`  ${i + 1}. ${u}`))
console.log('助手回复条数:', assistants.length)
