#!/usr/bin/env node
/** 临时探针：脚注 / HTML 原样 / 列表内嵌表格。 */
import { parseBlocks, renderBlocks } from '../lib/modes/markdown.mjs'

const cases = {
  脚注: '正文有脚注[^1]与[^2]。\n\n[^1]: 注释一内容\n[^2]: 注释二内容',
  'HTML 块': '<div class="x">\n  <b>原样</b> 输出\n</div>\n\n后续段落',
  '行内 HTML': '含 <span style="color:red">红字</span> 与 MathML <math><mi>x</mi></math>',
  '列表内表格（空行+缩进）': '- 说明项：\n\n  | 键 | 值 |\n  |---|---|\n  | a | 1 |\n\n- 第二项',
  '列表内表格（无空行）': '- 说明项：\n  | 键 | 值 |\n  |---|---|',
}

for (const [k, v] of Object.entries(cases)) {
  console.log('--- ' + k)
  console.log(renderBlocks(parseBlocks(v)).replace(/></g, '>\n<').slice(0, 400))
}
