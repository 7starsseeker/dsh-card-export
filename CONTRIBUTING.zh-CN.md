# 参与贡献

## 先跑一遍自检

```bash
npm run smoke     # 十一组，364 项
npm run doctor    # 渲染能力诊断
```

`smoke` 全部通过再动代码。它不依赖浏览器（除 `doctor`），在 CI 与离线环境都能跑。

## 本项目的三条硬规矩

**1. 渲染器不总结、不推断、不改写。**

短图的结论必须由调用方（模型或人）读完全文后写进 `--brief`。渲染器只排版。缺 brief 就退化为「原文提取」并在图上标明——**不要为了好看而让渲染器编一段摘要**。

**2. 图上只放事实，操作提示放对话。**

例如图片未导出：图上写 `[图片] xxx.png · 1200×840 · 18 KB（本次未导出）`；
「加 `--with-images` 可以包含」这类说明走 stderr，由技能在对话里转述。有单测约束这条。

**3. 不猜数据。**

- 报告解析按固定二级标题锚定，不靠"像不像"；
- 会话里注入内容与真人消息靠 `source.kind` 区分，绝不靠文本特征；
- `dsh-ui` 缺 `type` 时只在形状唯一确定时推断，认不出就原样保留并标注。

## 改动的落地要求

- **新增能力要有断言**：每个 `tools/smoke-*.mjs` 对应一块能力，加了行为就加断言。
- **断言从需求推，不从实现抄**：实现与断言写同一个常量，只证明"同一个数字写了两遍"。
- **不发明需求**：没要求的抽象、兜底、多实现不要加；想到了但没做的，写进 `CHANGELOG` 的已知边界或开 issue。
- **文档同步**：改了行为就改 `README.md` / `README.zh-CN.md` / 对应 `SKILL.md` / `CHANGELOG.md` + `CHANGELOG.zh-CN.md`。`SKILL.md` 是技能正文的唯一来源，插件在调用时现读，不要另存副本。

## 目录约定

| 路径 | 放什么 |
|---|---|
| `lib/` | 插件与渲染实现，零 npm 依赖，只 import `node:` 内建与包内相对模块 |
| `skills/<id>/SKILL.md` | 技能正文（frontmatter 的 `name` 必须与目录名一致） |
| `tools/` | CLI 与自检脚本；`smoke-*.mjs` 是断言入口 |
| `cases/` | 回归样张（报告 / 对话 / brief 范例） |

`tools/_*.mjs` 是**一次性排查脚本**（探 asar 字符串、探会话字段、A/B 对比），不进 npm 包，也不要挂到 `package.json` 的 scripts 上。`skills/_*` 是已退役技能的墓碑目录，同样不进包。

## 提交与 PR

- 一个 PR 做一件事；跨度大的改动先开 issue 说清 in-scope / out-of-scope。
- 提交信息用祈使句，说明"改了什么"而不是"改了哪个文件"。
- PR 描述里贴自检的**原始输出**（不是"跑过了"）。

## 报告问题

功能缺陷、渲染错位、平台兼容问题走 [Issues](https://github.com/7starsseeker/dsh-card-export/issues)。
涉及安全的问题**不要**开公开 issue，见 [SECURITY.md](SECURITY.md)。
