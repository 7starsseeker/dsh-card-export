# 安全策略

> English: [SECURITY.md](SECURITY.md) · 本文为中文版

## 这个项目是什么

一个**只做渲染**的 DSH 插件：把 Markdown 报告和 DSH 会话片段变成图片。它不联网、不调用任何远程 API、不发遥测。

零 npm 依赖——`dependencies` 为空。这样做的直接目的是：**没有供应链**。没有第三方包可被投毒，没有 lockfile 需要审计，`npm i` 不会引入你没读过的代码。

## 什么会离开你的机器

**默认什么都不离开。**

唯一的出站行为是：调用本机已安装的 Chromium 系浏览器渲染本地 HTML 文件，截成图片写到本地路径。浏览器以子进程方式启动，参数里只有本地 `file://` URL。

没有网络请求、没有回调地址、没有使用统计。

## 它读什么

| 输入 | 说明 |
|---|---|
| 你显式指定的 Markdown 文件 | 你给的路径 |
| `<DSH_HOME>/sessions/**/session.v4.jsonl.zstd` | 仅在你导出对话时读取，且只读你指定的那一份 |
| `<DSH_HOME>/attachments/v1/objects/**` | 仅在 `--with-images` 时读取，用于内嵌图片 |
| `<DSH_HOME>/profiles/*/node_modules/dsh-fact-check` | 首装探测时**只判断存在性**，不读取内容 |

## 它写什么

| 输出 | 说明 |
|---|---|
| 你指定的输出目录 | HTML + PNG（或 PDF） |
| `%LOCALAPPDATA%\dsh-card-export\readiness.json` | 首装探测结果，包外，升级不丢 |
| `%LOCALAPPDATA%\dsh-card-export\config.json` | 仅在你主动运行 `tools/config.mjs --init/--enable/--disable` 时写入 |

不写注册表、不改系统配置、不动 DSH 的 profile 树（安装动作由 `dsh plugin add` 负责，不是本包）。

## 渲染内容里的风险

导出的是**用户自己的内容**，但有两类东西值得注意：

**1. HTML 直通（重要）。** 报告文档里的原始 HTML 默认会**真的生效**——这是为排版保留的能力（彩色文字、`<br>`、`<mark>`、MathML 公式）。代价是：这些 HTML 会在本机 headless 浏览器里执行。

因此有一条硬规则：

| 文档来源 | 做法 |
|---|---|
| 模型自己生成的 / 你本人写的 | 默认即可 |
| 网页抓取、他人提供、来源不明 | **必须 `--no-html`**（HTML 全部按字面显示） |

对话导出的 `dsh-ui` 卡片**永远转义**，不受该开关影响——那里的内容来自会话原文，不属于"作者写的文档 HTML"。

**2. 内嵌 base64 与超长文本。** 会话里可能存在 `data:` URI 或数万字符的输出。默认行为是省略并标注（`[内嵌图片/数据，已省略 N 字符]`、`默认 1200 字截断`），避免生成几百 MB 的图片。按需可调 `--max-chars 0` 关闭截断——代价是文件体积。

**3. 对话卡片永远转义。** `dsh-ui` 卡片里的文字走 `inline(..., { html: false })`，`<img src=x onerror=…>` 这类输入只会变成字面文本，有单测守着（`tools/smoke-dshui.mjs`）。报告正文里的 HTML 则按上面的开关处理。

另请注意：**渲染出的 HTML 是本地文件**，如果你把中间产物 HTML 分发给别人，接收方打开时的行为取决于其浏览器，与本项目无关。

## 沙箱与提权相关

- 容器环境里，若首轮渲染失败命中沙箱特征，插件会追加 `--no-sandbox --disable-dev-shm-usage` **重试一次**。这两个参数**降低浏览器隔离强度**，因此只在失败后启用，桌面环境下从不使用。它们在 `--dump`/返回值里可见（`containerRetry: true`）。
- 插件本身不申请任何提权，也不修改 DSH 的审批策略。

## 报告漏洞

**不要开公开 issue。** 请通过以下任一方式：

- GitHub 私密漏洞报告：<https://github.com/7starsseeker/dsh-card-export/security/advisories/new>
- 或发邮件到仓库 owner 的公开邮箱（见 GitHub 主页）

请包含：影响版本、复现步骤、最小复现输入（可脱敏）、你判断的影响面。

## 不在范围内

- 渲染结果的**内容正确性**（例如报告里的数字本身错了）——那是内容问题，不是安全漏洞。
- 依赖本机浏览器产生的行为（字体渲染差异、浏览器自身漏洞）。
- 你把导出的图片/HTML 分发出去之后的接收方环境问题。
