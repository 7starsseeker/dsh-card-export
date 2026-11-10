# 提案：给六个骨架补一份机器可读的锚点表（已落地：表由 fact-check 提供）

> 从 `dsh-card-export`（消费方）提给 `dsh-fact-check`（生产方）。
> 状态：**已落地**。上游已提供 `reference/skeleton-anchors.json`，与
> [`skeleton-anchors.draft.json`](./skeleton-anchors.draft.json) 逐字一致；消费方已改为读该文件
> （`lib/modes/skeletons.mjs`，三级降级）。本目录仅作留档，**事实以上游文件为准**。
>
> 两边是单向联动：上游维护这份表，本仓只消费；上游从不调用本仓。

## 0. 三条硬约束

1. **只补一份文件**，不改上游既有的报告模板与发布形态。
2. **不动任何正文标题**，不新增、不改写、不删除一个 `##`。这份表只是把已有的标题事实写成机器能读的形式。
3. **不改变任何行为**：这份 JSON 不被 fact-check 自己的流程读取，只给下游消费。

## 1. 现状与问题

fact-check 2.0.0 把产物从"一种报告模板"扩到"六种骨架"（4-V 裁决 / 4-E 释义 / 4-C 因果机制 / 4-M 对照 / 4-S 地图 / 4-L 指标卡）。

出图侧只有**裁决**一套锚点，因为那是唯一写进 `SKILL.md` 模板、逐字固定的承诺（`一句话结论` / `哪些是真的、哪些是假的` / `来源`，命中任意两段即走结论卡）。其余五个骨架没有锚点，`SKILL.md` §4b 又明确写了"不要给其它骨架自创锚点"。

于是出图侧只有两条路：

1. **退化成普通文档**：内容不丢，但首图没有结论；
2. **自己靠标题猜**：猜错的形态是**静默**的——一份释义报告被渲染成带档位徽标的判决书，比退化更糟。

消费方现在走第 1 条 + 一份**内置表**（`lib/modes/skeletons.mjs`），表是从 `SKILL.md` 的中文模板与 §4b 的英文序列里抄的，**没有契约效力**：对方改一个标题，我们这边静默失效。

## 2. 要做的事

### 2.1 新增 `reference/skeleton-anchors.json`

内容照抄 [`skeleton-anchors.draft.json`](./skeleton-anchors.draft.json)。字段：

| 字段 | 含义 |
|---|---|
| `id` | 稳定标识，改标题不改 id |
| `name` | 出图侧首图标签用的显示名（中/英各一） |
| `exportCard` | 该骨架是否已有出图契约。只有 `verdict: true`；false 表示"出图侧可以做导语卡，但不得造档位/双轨" |
| `match` / `matchEn` | 该骨架的**独有**标题（短标题，已去掉括号说明）；共享标题不进来 |
| `minHits` | 命中几个才算认出（默认 2） |
| `lead` / `leadEn` | 该骨架的"结论段"，出图侧抬到首图；多数骨架只有一段，因果是优先级列表 |
| `secondary` / `secondaryEn` | 可选的第二个结构段 |
| `sharedHeadings` | 跨骨架重复的标题分两类：`noSkeletonMayUse`（谁都不许用来识别）、`verdictOnly`（只保留给裁决，其余骨架不得用） |

**匹配规则（写进文件、两边照做）**：把标题末尾的括号说明去掉，与 `match` 里的短标题做**全等**比较；不做前缀、不做子串。这样 `边界`（4-E）不会误吞 `边界与反例`（4-C），`来源（编号附录）` 也只认成 `来源`。

### 2.2 加一条 `lint-skill` 断言

在 `tools/lint-skill.mjs` 里加一组结构断言（不改现有断言）：

1. `skeleton-anchors.json` 能被解析，六个 id 齐全：`verdict, definition, causal, compare, map, metric`；
2. **每个 `match` 都真的出现在该骨架模板块里**——按 `#### 4-V 裁决` / `#### 4-E 释义` / `#### 4-C 因果机制` / `#### 4-M 对照` / `#### 4-S 地图` / `#### 4-L 指标卡` 定位块，收集块内 `## ` 标题，去掉括号说明后与 `match` 比；
3. **`matchEn` 与 §4b 的英文序列一致**——读 §4b 那段代码块里 `4-V` / `4-E` / `4-C1` / `4-C2` / `4-C3` / `4-M` / `4-S` / `4-L` 各行，按 ` · ` 切分，同样去括号后比（因果取三个入口的并集）；
4. **没有跨骨架撞车**：同一个短标题不得出现在两个骨架的 `match` 里；
5. **`exportCard` 只有裁决为 true**；
6. **`sharedHeadings.noSkeletonMayUse` 里的标题一个都没进任何 `match`；`sharedHeadings.verdictOnly` 里的标题只出现在裁决的 `match` 里**（`来源` 是裁决现行锚点之一，其它骨架用它会与裁决互相认领）。

这条断言的意义：标题改名 === 断言变红，两边同时知道，不再静默失效。

### 2.3 文档与记录（各一句）

- `SKILL.md` §4b 那段「只有 4-V 有出图锚点」的引用块后面加一行：机器可读版本见 `reference/skeleton-anchors.json`；
- `CHANGELOG.md` 里补一句"补一份机器可读的骨架锚点表，供出图侧消费；不改变行为"；
- `README` 里若提到出图契约，补一句同一事实。

## 3. 完成判据

在 fact-check 仓跑：

```bash
node tools/lint-skill.mjs     # 断言数增加，全部通过；不出现新的失败项
node tools/route.mjs selftest # 仍 48/48
node tools/smoke-plugin.mjs   # 仍 27/27
git diff --stat               # 只多出 reference/skeleton-anchors.json + 少量文档/断言行
```

并把 `git diff SKILL.md` 贴出来证明**除了一行指针外没有改动**。

## 4. 消费方怎么用（不需要对面配合）

- 读到 `reference/skeleton-anchors.json` → 用它的 `match` / `lead` / `secondary` / `name`；
- 读不到（旧版本、目录形态、包装在别处）→ 用内置表；
- 内置表也认不出 → 逐字退回普通文档。

三级降级，**不硬依赖**。所以这份文件可以随任意一次改动带上，不阻塞任何发布。

## 5. 不要做的事

- 不要给其它五个骨架**在 `SKILL.md` 里新造出图锚点**（这份 JSON 不是锚点，它是既有标题的索引）；
- 不要改裁决那三个标题；
- 不要为了这份表调整任何模板的段序；
- 不要升版本号。

## 6. 待定

1. 文件放 `reference/`（已在 `files` 里，分发无碍）还是 `tools/`？建议 `reference/`。
2. 三个附段（正反 / 经验建议 / 属性维度）要不要也列出来？草案里放在 `attachments` 且标注"消费方忽略"，只是留个完整的家底。
