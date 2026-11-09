---
name: transcript-card
version: 0.1.0
description: 对话内容图片化导出（Transcript Card，缩写 TSC）。把 DSH 会话里的对话导出成可分享的长图：按轮次 / 事件序号 / 最近 N 轮选范围，默认只导出真人指令与回答，思考块与工具调用默认排除但可显式包含。当用户说「把这段对话导出成图」「导出最近三轮」「把上面的回答做成图片」时使用。
---

# 对话内容图片化导出（TSC）

把 DSH 会话日志渲染成一张消息流长图。**只渲染，不改写**：选到哪段，图上就是哪段原文。

## 范围怎么选（四种）

| 用户说 | 参数 | 说明 |
|---|---|---|
| 「最近三轮」 | `--last 3` | 按轮次尾部截取 |
| 「第 2 到第 5 轮」 | `--turns 2-5` | 按轮次区间 |
| 「从 > 这段 开始，到 > 那段 为止」 | `--from "这段" --to "那段"` | **引用式定位**：拿消息里的原文当锚点 |
| 「事件 120 到 260」 | `--seq 120-260` | 按事件序号（排障用） |

引用式定位的规则（有单测兜着）：

- 引文可以带 `>`、markdown 记号、空白差异，比对前都归一化；
- **短引文可以，但必须唯一命中**（「删了」这种 2–3 字指令很常见）；多处命中会拒绝并列出候选位置；
- 找不到会明确报错，并提示先 `--dump` 看轮次；
- 只给 `--from` 表示「从这里导到结尾」；只给 `--to` 会报错。

## 折叠档位：对齐客户端「工作步骤展示」

客户端有四档（`settings.transcript.*`），导出用同名 `--level`：

| 档位 | 导出内容 |
|---|---|
| `compact` 简洁 | 每轮只留**最后一条**回答 + 用户指令（客户端的「仅最终回答」） |
| `standard` 标准（**默认**） | 所有助手回答 + 用户指令；过程（思考/工具/命令行）收起 |
| `detailed` 详细 | + 工具调用（名称与参数摘要），不含结果 |
| `verbose` 完全展开 | + 思考全文 + 工具结果 |

客户端在**所有档位**下都不显示的内容（系统提示词行、普通上下文注入、`permission` 命令行），这里同样永不导出——注入内容在解析阶段就被 `source.kind` 挡掉。

`--with-thinking` / `--with-tools` 可在不换档位的前提下单独加一类内容。

## dsh-ui 卡片：默认渲染，JSON 兜底

装了 GenUI 的环境里，对话里看到的是**卡片**；导出的忠实目标是"你看到的",所以默认按卡片渲染：

| 层级 | 触发 | 图上表现 |
|---|---|---|
| ① 渲染成卡片 | ` ```dsh-ui ` 块能解析、组件受支持 | 卡片（callout / list / keyvalue / table / stat / badge / steps / …） |
| ② 单条原文兜底 | 某条组件认不出（未知 type，且形状也判断不出） | 「未识别组件，原样保留」+ 该条 JSON |
| ③ 整块原文兜底 | JSON 解析失败、items 为空 | 整块退回代码块，原文一字不改 |

想看原始 JSON 就 `--no-render-ui`（等价于强制走 ③）。

**缺 `type` 时按形状推断，只认唯一确定的**：`columns+rows`→table、`pairs`→keyvalue、`steps`→steps、纯字符串 `items`→list。真实数据里确实出现过没有 `type` 的表格条目，不推断就会丢内容；形状也认不出就不猜，走 ②。

推断是有代价的：万一某个组件用 `items` 表达非列表语义会被误判成列表。缓解是 `--no-render-ui` 永远能拿回原文。

## 交付：图里不放操作提示，提示在对话里说

这是硬规矩，别再往图里写参数：

| 放哪里 | 内容 |
|---|---|
| **图上** | 只放事实：`[图片] 名字 · 1200×840 · 117 KB（本次未导出）`、`代码块共 60 行，此处显示前 40 行`、页脚一行出处说明 |
| **对话里**（你来说） | 什么没进图、各多少条、用什么参数能包含 |

命令跑完会在 **stderr** 打一段「需要在对话中告知用户」，形如：

```
· 已排除 24 段思考（--level verbose 或 --with-thinking 可包含）
· 已排除 49 次工具调用（--level detailed 或 --with-tools 可包含）
· 图中共 3 张图片只显示占位、未内嵌（--with-images 可包含）
```

你要把这些**转述给用户**（可以合并成一句，比如「这张图里没有思考过程和工具调用，要带上就说一声」），不要把参数原文糊到用户脸上，更不要写进图里。

同理：`--dump` 里的 `notes` / `images` 字段也是给操作者看的，不是图面内容。

## 图片与表情

事实先行：图片是**独立 content part**（`{type:'image', attachment:{attachmentId:'sha256:…', mediaType, bytes, width, height, name}}`），实体在 `<DSH_HOME>/attachments/v1/objects/<前两位>/<hash>`。

| 情况 | 图上表现 | 开关 |
|---|---|---|
| 图片（默认） | `[图片] 名字 · 尺寸 · 体积（本次未导出）` | `--with-images` 真内嵌 |
| 附件本地找不到 | `[图片] 名字 …（本地附件库找不到）` | 不静默消失 |
| 单张超上限（默认 3 MB） | `[图片] 名字 · 体积（本次未导出）` | `maxImageBytes` 控制 |
| 表情标记 `[表情: xxx]` | 小标签「表情 · xxx」，**文字一个不少** | 无（始终如此） |
| 正文里的 `data:` base64 | 省略并标「已省略 N 字符」 | 无 |

默认不内嵌的理由很实际：一张截图 base64 后上百 KB，几张就能把长图推到几十 MB，转发反而更难。**要真图就显式 `--with-images`。**

## 用法

```bash
# 先看这份会话有哪些轮次、各类事件多少条（不出图，快）
node tools/render-transcript.mjs <session.v4.jsonl.zstd> --out <dir> --dump

# 导出最近 3 轮
node tools/render-transcript.mjs <session.v4.jsonl.zstd> --out <dir> --last 3 --png

# 导出第 2–5 轮，连思考块一起
node tools/render-transcript.mjs <session.v4.jsonl.zstd> --out <dir> --turns 2-5 --with-thinking --png
```

会话文件位置：`<DSH_HOME>/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd`。

## 哪些内容会进图（这条别猜，是查过的）

`user/message` 里**混着大量注入内容**：`runtime-context`、`skill-catalog`、`plugin:hindsight`、`time-context`、`tool-jobs`、`compact-checkpoint`。只有 `source.kind === 'user'` 才是真人输入，其余一律不进图——靠"文本像不像用户说的"判断会漏也会错。

思考块来自 `assistant/message` 的 `content[].type === 'reasoning'`；正文是 `type === 'text'`。

## 交付前回检

1. **读图**：打开看一眼，确认轮次连续、没有把注入内容当成用户指令。
2. **核对范围**：`--dump` 里的 `range` 与用户要的是否一致；`hidden` 里排除了什么，要能对用户讲清楚。
3. **措辞**：图上文字全部来自原文，不要为了通顺改字；如果图上出现数字，回检口径（谁统计的、什么基准）。

## 已知边界

- **DSH 专用**：依赖 `session.v4.jsonl.zstd` 的字段（`data.source.kind`、`content[].type`、`data.turn`）。宿主升级可能改这些字段，届时解析会明确报错（选不到任何事件），不会静默出错图。
- **不含系统提示与运行时上下文**：那些是注入内容，不是对话。
- **默认整张，可沿分隔线裁（需用户确认）**：超长对话出一张很长的图，**轮与轮之间有一条通栏细线**。返回里带 `tooLong`（`heightPx` + `cutLines`）时，**先在对话里问用户要不要切**；得到明确答复后才可执行 `node tools/crop-image.mjs <图> --at 3,6 --confirmed` 或 `--max 5000 --confirmed`。不带 `--confirmed` 工具会拒绝执行（退出码 3，不产出文件）。裁切线整行丢弃，接缝不留灰边。想更短也可以用 `--last` / `--turns` 缩小范围。
- **不导出附件与图片**：只处理文本。
