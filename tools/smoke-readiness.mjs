#!/usr/bin/env node
/**
 * 首装探测的纯逻辑单测：needsProbe 命中条件 + adviceOf 的建议矩阵。
 * 不启动浏览器、不落盘，秒级。
 */
import { needsProbe, SCHEMA_VERSION } from '../lib/first-run.mjs'
import { adviceOf } from '../lib/render/check.mjs'

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const base = {
  schemaVersion: SCHEMA_VERSION,
  environment: { platform: process.platform, node: process.version },
}

console.log('needsProbe — 何时重测：')
check('无状态 → no-state', needsProbe(null) === 'no-state')
check('schema 变化 → schema-changed', needsProbe({ ...base, schemaVersion: 0 }) === 'schema-changed')
check('平台变化 → platform-changed',
  needsProbe({ ...base, environment: { ...base.environment, platform: 'plan9' } }) === 'platform-changed')
check('Node 主版本变化 → node-major-changed',
  needsProbe({ ...base, environment: { ...base.environment, node: 'v1.0.0' } }) === 'node-major-changed')
check('完全一致 → null（走缓存）', needsProbe(base) === null)

console.log('\nadviceOf — 建议矩阵：')
const png = adviceOf({ renderLevel: 'png', browserPicked: { name: 'Edge' }, environment: { platform: 'win32' } })
check('png → 单条 ok 建议', png.length === 1 && png[0].level === 'ok')

const pdf = adviceOf({ renderLevel: 'pdf', containerFlagsNeeded: true, environment: { platform: 'linux' } })
check('pdf → 提到不是长图', pdf.some(a => a.text.includes('不是长图')))
check('pdf + 沙箱特征 → 提到自动重试', pdf.some(a => a.text.includes('--no-sandbox')))

const win = adviceOf({ renderLevel: 'html', environment: { platform: 'win32', isContainerLike: null } })
check('html/win32 → winget Edge', win.some(a => a.text.includes('winget install')))
check('html → 必含 HTML 兜底说明', win.some(a => a.text.includes('什么都不装')))

const docker = adviceOf({ renderLevel: 'html', environment: { platform: 'linux', isContainerLike: 'docker' } })
check('html/docker → apt 安装 chromium', docker.some(a => a.text.includes('apt-get install -y chromium')))
check('html/docker → apk 安装 chromium', docker.some(a => a.text.includes('apk add --no-cache chromium')))
check('html/docker → shm-size 建议', docker.some(a => a.text.includes('--shm-size')))

const lin = adviceOf({ renderLevel: 'html', environment: { platform: 'linux', isContainerLike: null } })
check('html/linux(非容器) → dnf 也可提', lin.some(a => a.text.includes('dnf install')))

const mac = adviceOf({ renderLevel: 'html', environment: { platform: 'darwin', isContainerLike: null } })
check('html/darwin → brew cask', mac.some(a => a.text.includes('brew install')))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
