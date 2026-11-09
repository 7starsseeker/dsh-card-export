#!/usr/bin/env node
/**
 * 插件契约自检：候选/正文都取自 SKILL.md，且用户配置能真正关掉可选技能。
 * 不启动浏览器、不落盘到用户目录（用 CARD_EXPORT_CONFIG_DIR 指到临时目录）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { list, get, SKILLS, provider, name as pluginName, inject } from '../lib/index.js'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'card-export-cfg-'))
process.env.CARD_EXPORT_CONFIG_DIR = tmp

console.log('导出契约：')
check('导出了 apply()', typeof (await import('../lib/index.js')).apply === 'function')
check('inject 含 skills', Array.isArray(inject) && inject.includes('skills'))
check('插件名是 kebab-case 且与 cordis.patch.yml id 一致', pluginName === 'card-export', pluginName)
check('provider 暴露 list/get', typeof provider.list === 'function' && typeof provider.get === 'function')
check('登记表非空', SKILLS.length > 0)

console.log('\n默认（无 config.json）：')
let cands = await list()
check('list() 返回 2 条（report-card + transcript-card）', cands.length === 2, `条数=${cands.length}`)
const names = cands.map((c) => c.name).sort()
check('两个技能 id 都在', names.join(',') === 'report-card,transcript-card', names.join(','))
const c0 = cands[0]
check('候选 name = report-card', c0.name === 'report-card')
check('候选有 description', typeof c0.description === 'string' && c0.description.length > 10)
check('候选 provider 与插件名一致', c0.provider === pluginName)
check('候选 rank = 600（bundled）', c0.rank === 600)
check('resourceBase 指向包根', c0.resourceBase?.kind === 'directory')

const def = await get(c0)
check('get() 正文非空', typeof def.content === 'string' && def.content.length > 200, `${def.content?.length} 字符`)
check('get() 正文已剥离 frontmatter', !def.content.startsWith('---'))
check('get() 正文含使用章节', def.content.includes('## 出图'))
check('get() 正文含交付前回检', def.content.includes('交付前回检'))

console.log('\n用户配置关闭（按技能 id）：')
writeFileSync(join(tmp, 'config.json'), JSON.stringify({ skills: { 'report-card': false } }), 'utf8')
cands = await list()
check('list() 只剩 1 条（被关的技能从目录消失）', cands.length === 1, `条数=${cands.length}`)
check('剩下的是 transcript-card', cands[0]?.name === 'transcript-card', String(cands[0]?.name))
let threw = false
try { await get(c0) } catch { threw = true }
check('get() 对已关闭技能抛错而不是交出定义', threw)

console.log('\n用户配置关闭（旧键 verdictCard 别名）：')
writeFileSync(join(tmp, 'config.json'), JSON.stringify({ skills: { verdictCard: false } }), 'utf8')
cands = await list()
check('旧写法仍能关闭 report-card', cands.length === 1 && cands[0].name === 'transcript-card', JSON.stringify(cands.map((c) => c.name)))

console.log('\n用户配置写坏 JSON：')
writeFileSync(join(tmp, 'config.json'), '{ not json', 'utf8')
cands = await list()
check('坏配置回退默认（仍返回 2 条）', cands.length === 2, `条数=${cands.length}`)

console.log('\n名字不符时：')
threw = false
try { await get({ ...c0, name: 'no-such-skill' }) } catch { threw = true }
check('未知技能抛错', threw)

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
