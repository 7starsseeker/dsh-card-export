#!/usr/bin/env node
/**
 * fact-check 探测与「不推销」约束的单测。
 * 关键断言：未安装时给出的介绍里，不得出现任何安装引导（命令/链接/建议安装字样）。
 */
import { detectFactCheck, adviceOf } from '../lib/render/check.mjs'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let pass = 0, fail = 0
const check = (n, c, d = '') => { c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n} ${d}`)) }

const tmp = mkdtempSync(join(tmpdir(), 'card-export-fc-'))
const home = join(tmp, '.dsh')
mkdirSync(home, { recursive: true })

console.log('detectFactCheck — 各种安装形态：')
delete process.env.DSH_HOME
check('无 DSH_HOME → unknown（不猜）', detectFactCheck().present === 'unknown')

process.env.DSH_HOME = home
check('空 home → 未安装', detectFactCheck().present === false)

// 技能形态
const skillDir = join(home, 'skills', 'fact-check')
mkdirSync(skillDir, { recursive: true })
writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: fact-check\nversion: 1.0.0\n---\n\n# 事实核查\n', 'utf8')
let r = detectFactCheck()
check('技能形态被识别', r.present === true && r.via.startsWith('skill@'), JSON.stringify(r))

// 插件形态优先（两者都在时应报插件）
const pm = join(home, 'profiles', 'desktop', 'node_modules', 'dsh-fact-check')
mkdirSync(pm, { recursive: true })
writeFileSync(join(pm, 'package.json'), '{"name":"dsh-fact-check"}', 'utf8')
r = detectFactCheck()
check('插件形态被识别', r.present === true && r.via.startsWith('plugin@'), JSON.stringify(r))

console.log('\nadviceOf — 已安装：')
const withFc = adviceOf({ renderLevel: 'png', browserPicked: { name: 'Edge' }, environment: { platform: 'win32' }, factCheck: { present: true } })
check('提到对 fact-check 的渲染优化', withFc.some((x) => x.text.includes('渲染优化')))
check('提到自动多出结论短图', withFc.some((x) => x.text.includes('结论短图')))
check('仍保留渲染就绪结论', withFc.some((x) => x.text.includes('渲染就绪')))

console.log('\nadviceOf — 未安装（重点：不得推销）：')
const noFc = adviceOf({ renderLevel: 'png', browserPicked: { name: 'Edge' }, environment: { platform: 'win32' }, factCheck: { present: false } })
const noFcText = noFc.map((x) => x.text).join('\n')
check('介绍了 fact-check 是什么', noFcText.includes('交叉核实'))
check('说明没有它也不缺功能', noFcText.includes('功能不缺'))
const promo = /(建议安装|推荐安装|请安装|快去装|装上|install|npm i |dsh plugin add|https?:\/\/)/i
check('不含任何安装引导或链接', !promo.test(noFcText), (noFcText.match(promo) || [])[0] || '')
check('不含命令类条目（cmd 级）', !noFc.some((x) => x.level === 'cmd'))

console.log('\nadviceOf — 探测未知：')
const unknown = adviceOf({ renderLevel: 'png', browserPicked: { name: 'Edge' }, environment: { platform: 'win32' }, factCheck: { present: 'unknown' } })
check('未知时不提 fact-check', !unknown.some((x) => x.text.includes('dsh-fact-check')))

console.log('\n回归：未安装且无浏览器时，fact-check 介绍不挤掉渲染建议：')
const noBoth = adviceOf({ renderLevel: 'html', environment: { platform: 'linux', isContainerLike: 'docker' }, factCheck: { present: false } })
check('既有 chromium 安装建议', noBoth.some((x) => x.text.includes('apt-get install -y chromium')))
check('又有 fact-check 介绍', noBoth.some((x) => x.text.includes('交叉核实')))
check('fact-check 部分仍是零命令', !noBoth.filter((x) => x.text.includes('fact-check')).some((x) => x.level === 'cmd'))

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
