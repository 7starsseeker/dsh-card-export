# dsh-card-export

> English: [README.md](README.md) · 本文为中文版

把 Markdown 报告和 DSH 对话导出成可分享的图片。**DeepSeek Harness 插件**，含两个技能。

[![selftest](https://github.com/7starsseeker/dsh-card-export/actions/workflows/selftest.yml/badge.svg)](https://github.com/7starsseeker/dsh-card-export/actions/workflows/selftest.yml)
[![npm](https://img.shields.io/npm/v/dsh-card-export.svg)](https://www.npmjs.com/package/dsh-card-export)
[![npm downloads](https://img.shields.io/npm/dm/dsh-card-export.svg)](https://www.npmjs.com/package/dsh-card-export)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.15-brightgreen.svg)](package.json)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![DSH plugin](https://img.shields.io/badge/DSH-plugin-1F3A8A.svg)](https://github.com/7starsseeker)
[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

零 npm 依赖：不内置浏览器、不下载 Chromium，直接用机器上已有的 Chromium 系浏览器（Edge → Chrome → Brave/Chromium/Vivaldi），失败降级 PDF，再不行交付 HTML。

---

## 目录

- [它是什么](#它是什么)
- [两个技能](#两个技能)
- [环境要求](#环境要求)
- [安装](#安装)
- [用法](#用法)
- [配置](#配置)
- [它是怎么工作的](#它是怎么工作的)
- [自己验证](#自己验证)
- [能力边界](#能力边界)
- [项目结构](#项目结构)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 它是什么

两件事，一套渲染底座：

1. **报告 → 两张图**：任意 Markdown 报告，只要走 `report` 预设（默认就是它），都会产出**短图（结论）+ 长图（完整原文）**两张。
2. **对话 → 一张图**：DSH 会话里选定的一段对话变成消息流长图，含用户指令与助手回答，思考块与工具调用可选。

只有显式指定 `--preset generic` 时才是单张（适合非报告类文档：随笔、说明、清单）。

只做渲染，不做内容加工：**报告里没写的，图上不会有；对话里没说的，图上也不会补。**

## 两个技能

| 技能 | 中文名 | 缩写 | 做什么 |
|---|---|---|---|
| `report-card` | 报告图片化导出 | RPC | 任意 Markdown 报告 → 短图（结论）+ 长图（完整报告） |
| `transcript-card` | 对话内容图片化导出 | TSC | DSH 会话片段 → 消息流长图 |

### report-card：为什么是两张图

- **短图**——在尽量小的版面给出足够信息。结论由**模型读完报告后撰写**（`--brief`），渲染器只排版；没给 brief 就退化为「原文提取」，并在图上标明。
- **长图**——**严格按原报告的结构、顺序、内容**逐段还原：不重组、不删减、不改写、不替作者总结。

产物由**预设**决定，不按报告内容区分：`report`（默认）=两张，`generic`（显式指定）=一张。来自 [dsh-fact-check](https://github.com/7starsseeker/dsh-fact-check) 的报告是 `report` 预设下的另一种皮肤：短图里多出档位徽标、甲乙双轨、断言分档；长图仍是报告原文。这套皮肤的识别依据就是报告自己的二级标题（`## 一句话结论` / `## 哪些是真的` / `## 来源` 命中任意两段），所以那条耦合归 fact-check 的报告模板所有，不归本插件。**英文报告同样适用**：等价锚点是 `One-line verdict` / `What is true, what is false` / `Sources`，走上同一套皮肤、同一套判定语义，只是标签整套换成英文（Confirmed / Likely true / Unconfirmed / False / Unverifiable，以及页脚、小节标题、禁引用警示）。语言由报告自己的二级标题判定，`--lang zh|en` 可强制；中文产物与改造前逐字节一致。

### transcript-card：忠实于你看到的

装了 [GenUI](https://github.com/omdsh-dev/dsh-genui) 的环境里，对话中的 ` ```dsh-ui ` 块显示为卡片。导出的忠实目标是**你在 DSH 里看到的样子**，所以默认按卡片渲染：

| 层级 | 触发 | 图上表现 |
|---|---|---|
| ① 渲染成卡片 | 能解析、组件受支持 | 卡片（callout / list / keyvalue / table / stat / badge / steps / …） |
| ② 单条原文兜底 | 某条组件认不出 | 「未识别组件，原样保留」+ 该条 JSON，其他条目照常渲染 |
| ③ 整块原文兜底 | JSON 解析失败、items 为空 | 整块退回代码块，一字不改 |

想看原始 JSON：`--no-render-ui`。

## 环境要求

- **Node.js ≥ 22.15**（会话日志是 zstd 压缩的，`node:zlib` 从 22.15 才有 zstd）
- **Chromium 系浏览器之一**（用于栅格化）：Edge / Chrome / Brave / Chromium / Vivaldi
- DSH（插件形态），或直接调用 `tools/` 下的 CLI（不装插件也能跑）

没有浏览器也能用，但只能拿到 PDF 或 HTML——见[降级链](#降级链)。

## 安装

### 作为 DSH 插件

```bash
dsh plugin --profile desktop add dsh-card-export
```

本地开发用 `link:` 安装（改源码重启即生效，市场会显示「本地开发」）：

```bash
dsh plugin --profile desktop add T:\dsh-card-export
```

装完重启 DSH，技能目录里会出现 `report-card` 与 `transcript-card`。

### 不装插件，直接当 CLI 用

```bash
git clone https://github.com/7starsseeker/dsh-card-export.git
cd dsh-card-export
node tools/doctor.mjs            # 先看这台机器能出什么
```

## 用法

### 导出报告

```bash
# 先看解析结果（不出图）
node tools/render-report.mjs report.md --out ./out --dump

# 出短图 + 长图
node tools/render-report.mjs report.md --out ./out --png --width 960

# 带模型撰写的摘要（推荐）
node tools/render-report.mjs report.md --out ./out --brief brief.json --png

# 只要 HTML（无浏览器环境）
node tools/render-report.mjs report.md --out ./out
```

`brief.json` 形如：

```json
{
  "conclusion": "一句话：这份报告到底在说什么",
  "points": ["该知道的第 1 件事", "第 2 件事", "第 3 件事"],
  "numbers": [{ "label": "指标名", "value": "61% → 84%" }],
  "caveat": "本次覆盖不到的边界"
}
```

### 导出对话

```bash
# 先看有哪些轮次、各类事件多少条
node tools/render-transcript.mjs session.v4.jsonl.zstd --out ./out --dump

# 最近 3 轮
node tools/render-transcript.mjs <session> --out ./out --last 3 --png

# 指定轮次 / 事件区间
node tools/render-transcript.mjs <session> --out ./out --turns 2-5 --png
node tools/render-transcript.mjs <session> --out ./out --seq 120-260 --png

# 引用式定位：从「这段」到「那段」
node tools/render-transcript.mjs <session> --out ./out --from "第一句原文" --to "最后一句原文" --png
```

会话文件在 `<DSH_HOME>/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`。

### 显示档位

对齐客户端「工作步骤展示」（`settings.transcript.*`）：

| `--level` | 导出内容 |
|---|---|
| `compact` 简洁 | 每轮只留最后一条回答 + 用户指令 |
| `standard` 标准（默认） | 所有助手回答 + 用户指令；过程收起 |
| `detailed` 详细 | + 工具调用（名称与参数摘要） |
| `verbose` 完全展开 | + 思考全文 + 工具结果 |

### 超长图：默认整张；要分段需你确认

**默认产物永远是一张完整长图。** 渲染不会自己切分。

内容确实过长（> 12000px）时，结果里会多一个 `tooLong` 块（高度 + 每条分隔线的位置 + 一句待确认的问题）。**技能会在对话里问你要不要切**，得到答复才执行：

```bash
node tools/crop-image.mjs 图.png --lines                    # 只看线位置（随时可跑）
node tools/crop-image.mjs 图.png --at 7,11 --confirmed       # 用户同意后：在第 7、11 条线处切
node tools/crop-image.mjs 图.png --max 5000 --confirmed      # 每段尽量 ≤ 5000px
```

`--confirmed` 是硬闸门：不带它一律拒绝执行（退出码 3，不产出任何文件），报错里会把「高度 / 线数 / 计划几刀」列出来，正是要拿去问用户的内容。裁切沿线上切、线本身整行丢弃，接缝不留灰边。

切点落在**内容块边界**，不会从半句话或半张表格中间断开；单块超一页时独占一张。

## 配置

可选的用户配置在包外（升级不丢）：

```
Windows  %LOCALAPPDATA%\dsh-card-export\config.json
其它     $XDG_CONFIG_HOME/dsh-card-export/config.json
```

```json
{ "skills": { "report-card": true, "transcript-card": true } }
```

按技能 id 启停；设为 `false` 后该技能不再出现在技能目录里（省上下文）。用 CLI 改：

```bash
node tools/config.mjs --list
node tools/config.mjs --disable transcript-card
node tools/config.mjs --init
```

首装探测结果写在同目录 `readiness.json`（真实渲染一次 PNG、一次 PDF 得出的能力结论，含是否装了 dsh-fact-check）。

## 它是怎么工作的

```
Markdown 报告 ──┐
                ├─► 解析（标题锚定 / 块级）─► HTML（C 皮肤）─► 浏览器 CLI 截图 ─► PNG
DSH 会话日志 ───┘                                 │
                                                  └─► 失败 ─► PDF ─► HTML
```

### 降级链

```
Edge（Win11 默认）→ Chrome → Brave / Chromium / Vivaldi
        ↓ 全都没有或渲染失败
      PDF（无高度上限，按 A4 排版）
        ↓ 还不行
      HTML（自行截图或打印）
```

容器场景：Linux 路径同样在探测链内；首轮失败若命中沙箱特征（`No usable sandbox` / `/dev/shm`），自动追加 `--no-sandbox --disable-dev-shm-usage` 重试一次。这两个参数降低隔离强度，**只在撞墙时启用，不作默认**。

### 不猜数据

- 汇报解析按**固定二级标题锚定**，不要求报告改版；
- 会话里 `user/message` 混着 6 类注入内容（runtime-context / skill-catalog / plugin:* / time-context / tool-jobs / compact-checkpoint），**只有 `source.kind === 'user'` 才算真人输入**；
- 真人消息**不带 `turn` 字段**，轮次按 `turn/start` 序号推导。

## 自己验证

```bash
npm run smoke     # 十一组自检，364 项断言
npm run doctor    # 渲染能力诊断（真实出图一次）
```

十一组分别覆盖：渲染器探测与容器重试判据、首装探测与建议矩阵、报告解析与 brief 两种来源、对话解析与四档位、dsh-ui 卡片与三级兜底、fact-check 探测与「不推销」约束、插件契约与按需启停、分隔线识别与裁切、报告内容完整性（逐行核对）、Markdown 语法对照与 HTML 检测、数学公式与版式属性。

## 能力边界

| 边界 | 具体表现 |
|---|---|
| **只渲染，不改写** | 不做摘要、不做推断、不改判定。报告里的错别字、错口径会原样出现在图上。 |
| **短图质量取决于 brief** | 渲染器不会总结；不给 brief 就只有「原文提取」，图上会标明。 |
| **缺段不补** | 报告缺 `一句话结论`/`哪些是真的`/`来源` 时仍出图，缺的段在长图末尾列出。 |
| **Markdown 子集** | 支持：标题 `#`–`#####`、Setext `===`、段落、有序/无序列表（含续行与嵌套）、表格（含 `\|` 转义与无首尾竖线写法）、引用、围栏代码、分隔线、行内粗体/斜体/删除线/代码/链接/自动链接/图片引用/`[n]` 角标。**不支持**：列表内嵌表格（会被拍平）、脚注、数学公式、HTML 直通（一律转义）。 |
| **图片默认不内嵌** | 图上出占位标记（名字/尺寸/体积）。`--with-images` 才内嵌本地附件，单张上限 3 MB。 |
| **字体不打包** | 吃系统字栈，跨机器字形有差异。 |
| **DSH 专用** | 对话导出依赖 `session.v4.jsonl.zstd` 的字段；宿主升级若改字段会明确报错（选不到事件），不会静默出错图。 |
| **默认整张** | 输出永远是一张长图，渲染不自行切分。要分段必须你确认后由 `crop-image.mjs --confirmed` 执行（沿图上分隔线裁）。 |

### 图里不写操作提示

图上只放事实（例如 `[图片] xxx.png · 1200×840 · 18 KB（本次未导出）`）。**什么没进图、各多少条、用哪个参数能包含**——这些在命令行 stderr 给出，由技能要求在对话里转述给用户，不占图面。

## 项目结构

```
lib/
  index.js              插件：挂载 + 技能注册 + 后台首装探测
  first-run.mjs         幂等首装探测（readiness.json）
  user-config.mjs       包外用户配置（按技能 id 启停）
  render/
    rasterize.mjs       浏览器探测 → PNG / PDF / HTML
    check.mjs           真实能力探测 + 建议矩阵
    blank-height.mjs    只读量底部空白，用来修正截图高度（不裁图）
  modes/
    markdown.mjs        通用 Markdown 块解析与逐块渲染
    skin-report.mjs     报告类共用皮肤（C：冷白 + 单一蓝）
    report.mjs          报告入口：预设识别、brief、分隔线
    verdict.mjs         事实核查报告：短图 / 长图
    transcript.mjs      对话：会话解析、范围选取、消息流渲染
    dsh-ui.mjs          dsh-ui 迷你卡片渲染器（含三级兜底）
skills/
  report-card/SKILL.md
  transcript-card/SKILL.md
tools/                  doctor / config / render-* / smoke-*
cases/                  两份样张 + brief 范例
```

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全相关问题见 [SECURITY.md](SECURITY.md)，发版流程见 [RELEASING.md](RELEASING.md)。

## 许可证

[Apache License 2.0](LICENSE)。第三方组件说明见 [NOTICE](NOTICE)。

模板与 CSS 为本仓库原创；审美取向参考过 [guizang 设计技能](https://github.com/7starsseeker)（AGPL-3.0-only），但未复制其任何文件、样式或文档文本。
