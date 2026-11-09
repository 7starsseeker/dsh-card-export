# Changelog

本文件记录本项目的重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] — 2026-11-09

首个版本。两个技能 + 一套零依赖渲染底座。

### 新增

- **插件骨架**：`ctx.skills.registerProvider` 注册两个技能，正文在调用时从各自 `SKILL.md` 现读，改完重启或热加载即生效；挂载时**不阻塞**（首装探测走 `setImmediate`）。
- **`report-card`（RPC）**：任意 Markdown 报告 → 短图 + 长图。
  - 短图由模型读全文后撰写（`--brief`：结论 / 要点 / 关键数字 / 边界）；没给 brief 时退化为「原文提取」，kicker 与页脚都明确标注。
  - 长图严格按原报告结构、顺序、内容还原。
  - 事实核查报告（命中「一句话结论 / 哪些是真的 / 来源」任意两段）自动出档位徽标、甲乙双轨、断言分档；`--brief` 只能覆盖判断与总结，**档位与双轨永远取自报告**。
  - 缺段不补：缺的段落在长图末尾列出。
- **`transcript-card`（TSC）**：DSH 会话 → 消息流长图。
  - 范围四种：`--last N` / `--turns a-b` / `--seq a-b` / 引用式 `--from "…" --to "…"`（归一化后匹配，短引文需唯一命中）。
  - 显示档位四档对齐客户端「工作步骤展示」：`compact` / `standard`（默认）/ `detailed` / `verbose`。
  - 只认 `source.kind === 'user'` 为真人指令，6 类注入内容一律不进图；真人消息无 `turn` 字段，轮次按 `turn/start` 序号推导。
  - 图片默认出占位标记（名字/尺寸/体积），`--with-images` 内嵌本地附件（单张 3 MB 上限）；`[表情: xxx]` 渲染为标签。
  - 超长单条默认 1200 字截断并标注原文长度，`--max-chars` 可调。
- **`dsh-ui` 迷你渲染器**：` ```dsh-ui ` 块默认渲染成卡片，三级兜底（卡片 → 单条原文 → 整块代码块）。缺 `type` 时按形状推断（`columns+rows`/`pairs`/`steps`/纯字符串 `items`），认不出就不猜。`--no-render-ui` 强制看原文。
- **渲染降级链**：Edge → Chrome → Brave/Chromium/Vivaldi → PDF → HTML。容器内首轮失败若命中沙箱特征，自动追加 `--no-sandbox --disable-dev-shm-usage` 重试一次（不作默认）。
- **首装探测**：真实渲染一次 PNG、一次 PDF 得出 `renderLevel`（png/pdf/html），按平台给建议；同时探测是否装了 dsh-fact-check（只介绍、不推销，有单测约束）。
- **分隔线**：长图不切分，改为在内容单元边界画一条通栏细线——报告在每个二级小节之间、对话在每轮之间。它看起来是普通分节符，同时因为线到卡片边缘且完全水平，可直接当裁切参考。线永远在单元边界，不会落在句子或表格中间。
- **配置**：包外 `config.json` 按技能 id 启停；旧键 `verdictCard` 仍识别。
- **自检**：八组共约 236 项断言（`npm run smoke`）。

### 修复（对照真实报告发现）

- **表格型段落被静默丢弃**：核查报告的「哪些是真的（#/论断/来源/定档表）」「本次未能核实到的（缺口/尝试/结果表）」原来只按 `- ` 项目符号解析，整张表不进图。现在按内容形态选渲染方式——带表格或 `###` 子标题的小节一律按原文 Markdown 渲染。
- **有序列表编号全是 1**：两个原因叠加——空行无条件结束列表；拼接正文时 `trim()` 掉了续行缩进，导致每项各自成组。
- **段尾 `---` 被当正文画出**：解析阶段直接丢弃分隔线行。
- **粗体里嵌斜体时整对 `**` 漏出**（`**…*not*…**`），以及 `***x***` 产生错配标签。
- **表格 `\|` 转义把单元格切断**；**缺首尾竖线的表格不被识别**。
- **图片语法变成 `!` + 链接**；**自动链接 `<https://…>` 原样露字符**；**Setext `===` 标题**不识别。
- 双轨标题改写丢了报告自己的限定语；来源附录丢了分组标题与末尾的注；序号字号偏小（11px→15px）。

### 变更（HTML 与公式）

- **HTML 直通改为出图前询问**：文档含原始 HTML 时不再擅自决定——命令退出码 4、零文件产出，返回 `htmlAsk`（按 `math` / `style` / `active` 分类统计 + 问句 + `--html on|off` 两个选项）；`<script>`/`<img>` 等归为 `active` 并在问句里提示建议选字面。纯文本文档不受影响，`--preflight` 可只检测不出图。
- **对话卡片永远转义**：`dsh-ui` 卡片内容来自会话原文，走 `inline(..., { html: false })`，不受 `--html` 影响。
- **数学公式走 MathML 零依赖路径**：Chromium 内置排版，`displaystyle="true"` 让上下限堆叠、`stretchy="true"` 让括号伸缩。实测 8 类常见公式语义 0 失真；长嵌套（加权交叉熵）逐项核对一致。

### 新增自检

- `smoke-coverage`（内容完整性，20 项）：逐行核对原文是否都落在图上。
- `smoke-conformance`（Markdown 对照，56 项）：30 种语法结构 + 已知边界的显式断言 + HTML 检测器。
- `smoke-math`（数学公式，20 项）：MathML 结构、`displaystyle`/`stretchy` 属性不被吃掉、长嵌套公式、代码块内 LaTeX 保持字面。

### 已知边界

- 长图不分页（`--split` 已取消）：需要分段时沿图上的分隔线裁。
- Markdown 支持子集：列表内嵌表格会被拍平成一行；脚注、数学公式不解析；HTML 一律转义（不执行）。
- 字体吃系统字栈，跨机器字形有差异。
- 字体吃系统字栈，跨机器字形有差异。
- 容器沙箱重试路径只单测了判据，未在受限容器里跑完整链路。

[Unreleased]: https://github.com/7starsseeker/dsh-card-export/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/7starsseeker/dsh-card-export/releases/tag/v0.1.0
