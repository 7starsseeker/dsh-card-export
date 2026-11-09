#!/usr/bin/env node
/**
 * rasterize 的单测：只测纯判断逻辑（不启动浏览器，秒级、可离线）。
 * 真实的容器沙箱失败无法在本机复现，因此这里锁的是「什么情况该重试」这条判据。
 */
import { hitContainerHints } from '../lib/render/rasterize.mjs'

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

const CASES_TRUE = [
  ['Chrome sandbox 报错', [{ error: 'Failed to move to new namespace: No usable sandbox!' }]],
  ['dev/shm 太小', [{ error: 'Failed to create shared memory: /dev/shm insufficient' }]],
  ['zygote 启动失败', [{ error: 'zygote_host_impl_linux.cc Failed' }]],
  ['EACCES 权限', [{ error: 'spawn EACCES: Operation not permitted' }]],
]
const CASES_FALSE = [
  ['文件不存在', [{ error: 'ENOENT: no such file or directory' }]],
  ['截图为空', [{ error: '截图文件不存在或为空' }]],
  ['空数组', []],
  ['undefined', undefined],
]

console.log('hitContainerHints — 应判定为真：')
for (const [n, v] of CASES_TRUE) check(n, hitContainerHints(v) === true)

console.log('hitContainerHints — 应判定为假：')
for (const [n, v] of CASES_FALSE) check(n, hitContainerHints(v) === false)

console.log('调试开关：')
process.env.RENDER_FORCE_CONTAINER_RETRY = '1'
check('RENDER_FORCE_CONTAINER_RETRY=1 时恒为真', hitContainerHints([]) === true)
delete process.env.RENDER_FORCE_CONTAINER_RETRY

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail === 0 ? 0 : 1)
