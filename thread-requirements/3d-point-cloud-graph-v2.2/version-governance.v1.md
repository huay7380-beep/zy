# 3D 粒子 OS 版本规则方案 v1

状态：待用户确认后生效。

更新时间：2026-06-27

## 目标

建立一个适合多线程并行开发的版本规则。之后每新增一个功能、目标或可验收能力，都必须进入 `0.0.XX` 版本档案，并在实现前完成方案设计、计划、边界和验证方案。其他线程在制定计划前，必须先读取本版本规则和版本目录，按顺序建立版本，避免功能重叠、编号冲突和验收记录丢失。

本规则当前只作为确认稿，不代表已经开始新的功能实现。

## 版本号结构

采用四段式，但前两段在当前阶段固定：

```text
0.0.XX.N
```

含义：

| 段 | 含义 | 规则 |
| --- | --- | --- |
| `0` | 总系统早期构建阶段 | 当前总系统尚未进入正式 1.x，固定为 0 |
| `0` | v2.2 稳定基线后的增量能力层 | 当前只在 v2.2 需求基线下做功能增量，固定为 0 |
| `XX` | 功能/目标版本号 | 两位数顺序编号，例如 `01`、`02`、`03` |
| `N` | 实现/测试迭代号 | `0` 表示方案确认基线，`1` 表示第一次实现和测试，`2` 表示第二次修复或测试，依次递增 |

示例：

| 版本 | 含义 |
| --- | --- |
| `0.0.01` | 第 1 个功能/目标版本的稳定档案 |
| `0.0.01.0` | 第 1 个功能/目标的方案确认版 |
| `0.0.01.1` | 第 1 个功能/目标的第一次实现和测试记录 |
| `0.0.01.2` | 第 1 个功能/目标的第二次修复或复测记录 |
| `0.0.02.0` | 第 2 个功能/目标的方案确认版 |

保留规则：

- `0.0.00` 保留为版本治理规则自身的基线版本，不用于具体功能。
- `0.0.01` 起用于真实功能或目标。
- 当 `0.0.99` 用尽时，进入 `0.1.00`，但当前阶段先不启用。

## 什么内容需要建立版本

需要建立 `0.0.XX` 的情况：

- 新增一个用户可感知功能。
- 完成一个明确目标的实现闭环。
- 新增或改变一个跨模块接口。
- 改变 3D 粒子 OS 的节点、星云、目录或映射规则。
- 新增状态卡、图谱映射、对话模块、语音模块、命令传达等可独立验收能力。
- 改变多线程协作规则、版本规则、验收规则或边界规则。

不需要单独建立版本的情况：

- 同一功能版本内的小修复，记录为 `0.0.XX.N`。
- 不改变功能行为的错别字修正文档，可记录在当前版本 changelog。
- 验证补充、截图补充、日志补充，记录在当前版本 evidence。

如果不确定是否需要新版本，默认先建 `0.0.XX.0` 方案草案，等待确认。

## 适配“想到哪里做到哪里”的工作方式

本规则不要求用户每次灵感出现都先写完整大方案。为了适配用户的自然探索方式，后续采用三层入口：

| 层级 | 适用情况 | 是否建版本 | 是否完整设计 | 允许动作 |
| --- | --- | --- | --- | --- |
| `idea_capture` | 临时想法、方向补充、还没确定要实现 | 不建 `0.0.XX` | 不需要 | 只记录、归类、等待整理 |
| `mini_alignment` | 小修正、小验证、同一版本内的轻量调整 | 进入已有 `0.0.XX.N` | 需要简短对齐 | 可做低风险实现或验证 |
| `version_plan` | 新功能、跨模块接口、UI/3D 映射、状态或边界改变 | 必须新建或进入现有 `0.0.XX` | 必须完整设计 | 用户确认后执行 |

推荐工作流：

```text
用户想到新点子
  -> 先进入 idea_capture
  -> 判断是否属于已有版本
  -> 如果只是补充，放入该版本 open_questions / backlog
  -> 如果会形成新功能，创建 0.0.XX.0
  -> 方案确认后执行 0.0.XX.1
```

对用户习惯的建议：

- 可以继续“想到哪里说到哪里”，不要为了规则压制想法。
- 线程接到想法后，先帮用户判断它是 `idea_capture`、`mini_alignment` 还是 `version_plan`。
- 只要涉及新功能、跨模块、接口、状态写入、3D 映射或外部动作，就必须进入 `0.0.XX.0` 完整方案。
- 如果只是当前功能内的小体验调整，可以在已有版本下做 `0.0.XX.N` 小迭代，但仍要记录目的、触及范围和验证结果。
- 如果用户明确说“先不要实现”，只能进入方案或想法池。

建议新增轻量想法池：

```text
versions/idea-inbox.md
```

想法池只保存未进入版本的候选目标，不代表已确认、不代表要实现、不占用版本号。

想法池配套推进方案：

```text
versions/idea-pool-promotion-plan.v1.md
```

想法池内容推进为具体版本号时，必须先完成以下判断：

1. 系统归属：明确 `primary_system`，例如 `status-dialogue-system`、`world-system-3d-os`、`projection-contracts`。
2. 是否已有版本：如果属于已经实现功能的小调整，优先回到原有 `0.0.XX.N` 迭代，不新建版本。
3. 是否触发新方案：只要涉及新功能、跨模块、接口、状态读写、3D 映射、UI 结构化或边界变化，就必须形成 `0.0.XX.0` 方案。
4. 是否可验证：推进前必须说明验证方式、边界和不触碰范围。
5. 是否有冲突：推进前必须读取 `version-ledger.md` 和已有 `0.0.XX` 目录，避免重复领取版本号。

想法池只允许两种出口：

- `merged_to_existing_version`：合并到已有版本的 backlog、open questions 或下一次 `0.0.XX.N`。
- `promoted_to_version_plan`：领取或准备领取新的 `0.0.XX`，先写 `0.0.XX.0` 方案，确认后再实现。

禁止从想法池直接进入代码、UI 或运行时状态修改。

## 版本目录结构

所有版本档案统一放在：

```text
D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\
```

单个版本目录：

```text
versions/
  README.md
  version-ledger.md
  idea-inbox.md
  idea-pool-promotion-plan.v1.md
  ../scheme-directory/
  0.0.XX/
    README.md
    plan.0.0.XX.0.md
    scope-and-boundary.md
    interface-map.md
    implementation-log.md
    verification-plan.md
    acceptance-report.md
    changelog.md
    iterations/
      0.0.XX.1.md
      0.0.XX.2.md
    evidence/
      screenshots/
      logs/
      test-output/
    artifacts/
      generated-docs/
      fixtures/
```

最小必须文件：

| 文件 | 必须性 | 用途 |
| --- | --- | --- |
| `README.md` | 必须 | 版本总览，说明功能、状态、范围和入口 |
| `plan.0.0.XX.0.md` | 必须 | 实现前方案，必须先确认 |
| `scope-and-boundary.md` | 必须 | 明确做什么、不做什么、上下游边界 |
| `interface-map.md` | 必须 | 输入、输出、依赖、数据流和 3D 映射 |
| `verification-plan.md` | 必须 | 类型、构建、行为、视觉、边界验证 |
| `implementation-log.md` | 实现后必须 | 实际改动、触及文件、风险和结果 |
| `acceptance-report.md` | 验收后必须 | 验收证据、未完成项、用户确认状态 |
| `changelog.md` | 必须 | 该版本每次迭代的变更摘要 |
| `iterations/*.md` | 有迭代时必须 | 记录 `0.0.XX.N` 的每次测试和修复 |
| `evidence/` | 有验证时必须 | 截图、日志、测试输出、音频等证据 |

## 版本总账

`versions/version-ledger.md` 是所有线程必须先读的版本总账。

每个版本必须登记：

| 字段 | 说明 |
| --- | --- |
| `version_id` | 例如 `0.0.04` |
| `current_iteration` | 例如 `0.0.04.2` |
| `title` | 功能/目标名称 |
| `status` | `proposed`、`planned`、`in_progress`、`implemented`、`verified`、`accepted`、`blocked`、`superseded` |
| `owner_thread` | 负责线程或记录来源 |
| `created_at` | 建立时间 |
| `confirmed_at` | 用户确认时间 |
| `depends_on` | 依赖版本 |
| `touch_scope` | 计划触及的目录、模块、UI、接口 |
| `boundary` | 不触碰范围 |
| `verification` | 验证命令和证据入口 |
| `next` | 后续版本或待确认项 |

状态含义：

| 状态 | 含义 |
| --- | --- |
| `proposed` | 已提出版本想法，未形成完整方案 |
| `planned` | `0.0.XX.0` 方案已完成，等待确认或准备实现 |
| `in_progress` | 正在实现 |
| `implemented` | 已实现，但验证未完成 |
| `verified` | 已通过验证，等待用户确认 |
| `accepted` | 用户确认通过，成为稳定版本 |
| `blocked` | 同一阻塞条件重复出现，无法继续 |
| `superseded` | 被后续版本替代 |

## 多线程协作流程

任何线程开始新功能前，必须执行以下流程：

1. 读取 `version-governance.v1.md`。
2. 读取 `versions/README.md` 和 `versions/version-ledger.md`。
3. 读取 `scheme-directory/README.md` 和 `scheme-directory/scheme-ledger.md`，确认是否已有相同或相邻方案。
4. 检查当前是否已有相同或相邻目标的版本。
5. 如果已有版本，优先在该版本下新增 `0.0.XX.N` 迭代，不重复创建功能版本。
6. 如果是新目标，按顺序占用下一个 `0.0.XX`。
7. 先创建 `plan.0.0.XX.0.md`，写明目标、接口、边界、验证方案。
8. 等用户确认或线程明确获得实现授权后，才进入代码或 UI 实现。
9. 实现时只触碰计划中列出的文件范围；如果范围变化，先更新版本文档。
10. 完成后新增 `iterations/0.0.XX.N.md`，记录实现、测试、结果和问题。
11. 验证通过后更新 `acceptance-report.md` 和 `version-ledger.md`。

如果线程接到的是临时想法而非明确功能：

1. 先记录到 `versions/idea-inbox.md`。
2. 标记来源、时间、用户原话摘要、可能归属模块。
3. 按 `versions/idea-pool-promotion-plan.v1.md` 判断系统归属、已有版本候选和触发项。
4. 如果是已实现功能的小调整，合并到已有版本的 backlog、open questions 或下一次 `0.0.XX.N`。
5. 如果触发新功能、跨模块、接口、状态读写、3D 映射、UI 结构化或边界变化，再领取 `0.0.XX` 并转成 `0.0.XX.0`。
6. 在完成上述判断前，不占用版本号、不进入实现。

冲突处理：

- 如果两个线程同时规划同一能力，以先创建版本目录并登记 `version-ledger.md` 的版本为主。
- 后来的线程不得覆盖已有版本，应追加为同版本迭代或创建依赖版本。
- 如果两个版本都已产生，需要在 `version-ledger.md` 标记 `conflict_review_required`，由用户确认合并方向。

## 版本建立前的方案要求

每个 `0.0.XX.0` 方案必须包含：

1. 用户需求原文摘要。
2. 当前状态核对。
3. 目标定义。
4. 不做什么。
5. 上游输入。
6. 下游输出。
7. 数据结构或接口。
8. UI 或 3D 粒子 OS 映射。
9. 文件触及范围。
10. 多线程冲突风险。
11. 实现步骤。
12. 验证方案。
13. 回退方案。
14. 需要用户确认的问题。

如果缺少以上内容，不能进入实现。

## 版本实现后的记录要求

每个 `0.0.XX.N` 迭代必须记录：

1. 本次迭代目标。
2. 实际修改内容。
3. 实际触及文件。
4. 和 `plan.0.0.XX.0.md` 的差异。
5. 类型、构建、行为、视觉、边界验证结果。
6. 失败项和残余风险。
7. 是否影响其他线程。
8. 是否需要继续迭代。
9. 是否可以进入用户验收。

## 版本验收规则

一个 `0.0.XX` 版本只有在以下条件同时满足时，才可标记为 `accepted`：

- 版本目录完整。
- 方案、边界、接口、验证计划存在。
- 实现日志和迭代记录存在。
- 验证命令或人工验证证据存在。
- 3D 粒子 OS 映射已记录，或明确说明本版本不涉及 3D 映射。
- 未完成内容已列出。
- 用户确认通过。

未满足时只能是 `implemented` 或 `verified`，不能标记为 `accepted`。

## 每轮完成后的 TTS 播报规则

本线程以及后续与主体状态对话框相关的线程，完成用户当轮请求后必须执行对应 TTS 播报。

规则：

- 每轮完成后都要生成一条与本轮任务匹配的播报文本。
- 如果用户指定播报文本，优先使用用户指定文本。
- 如果用户没有指定，使用简短结果式播报，例如“版本规则方案已经整理完成，请确认。”
- 播报优先使用当前已接入的 CosyVoice local_http。
- 如果 CosyVoice 不可用，允许 fallback 到浏览器 TTS 或报告未能播放的原因。
- 如果本轮属于某个 `0.0.XX.N` 版本迭代，TTS 播报结果应记录到该版本 `implementation-log.md` 或 `iterations/0.0.XX.N.md`。
- 如果本轮只是规则草案或非版本化问答，至少在当前相关进度文件或最终回复中说明是否已播放。
- 播报内容应是结果确认，不朗读隐藏推理、不朗读完整技术日志。

该规则已经在主体状态对话框方案中以 `CompletionTtsNotice.v1` 形式记录；本节将它提升为版本协作规则，避免其他线程只读版本文档时漏掉播报要求。

## 3D 粒子 OS 映射要求

凡是影响系统能力的版本，必须说明它在 3D 粒子 OS 中的位置：

```text
domain_id
node_id
label
owner
gate
compass
input_refs[]
output_refs[]
boundary[]
status
```

如果是主体状态对话框相关内容，默认归属：

```text
domain_id: status-dialogue-system
```

如果是全局版本治理规则，默认归属：

```text
domain_id: projection-contracts
node_id: projection-contracts:version-governance
```

## 命名模板

版本标题：

```text
0.0.XX - 功能名称
```

计划文件：

```text
plan.0.0.XX.0.md
```

迭代文件：

```text
iterations/0.0.XX.N.md
```

证据文件：

```text
evidence/test-output/0.0.XX.N-typecheck.txt
evidence/test-output/0.0.XX.N-build.txt
evidence/screenshots/0.0.XX.N-ui.png
evidence/logs/0.0.XX.N-runtime.jsonl
```

## 推荐 README 模板

```markdown
# 0.0.XX - 功能名称

状态：planned / in_progress / implemented / verified / accepted

## 目标

## 用户需求摘要

## 当前状态

## 范围

## 不做什么

## 上游输入

## 下游输出

## 3D 粒子 OS 映射

## 版本迭代

| 迭代 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| 0.0.XX.0 | 方案确认 | planned | plan.0.0.XX.0.md |

## 验证入口

## 未完成内容
```

## 推荐版本总账模板

```markdown
# 版本总账

| Version | Iteration | Title | Status | Owner Thread | Depends On | Touch Scope | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0.0.00 | 0.0.00.0 | 版本治理规则 | planned | current-thread | v2.2 baseline | thread-requirements | version-governance.v1.md |
```

## 当前确认建议

建议用户确认后执行：

1. 将本规则固化为 `0.0.00`。
2. 创建 `versions/version-ledger.md`。
3. 创建 `versions/0.0.00/`，记录版本治理规则自身。
4. 后续每个新功能从 `0.0.01.0` 开始建档。
5. 所有线程在计划新功能前先读 `version-governance.v1.md`、`scheme-directory/scheme-ledger.md` 和 `versions/version-ledger.md`。
6. 创建 `versions/idea-inbox.md`，用于接住用户临时想法，不立刻占用版本号。
7. 创建并启用 `versions/idea-pool-promotion-plan.v1.md`，用于把想法池内容推进到已有版本迭代或新的 `0.0.XX.0` 方案。
8. 创建并启用 `scheme-directory/`，用于方案状态检查、新目标归类和用户检查当前实现情况。

## 本方案待确认问题

1. 是否确认 `0.0.XX` 为功能版本，`0.0.XX.0` 为方案版，`0.0.XX.1` 起为实现/测试迭代。
2. 是否确认 `0.0.00` 专用于版本治理规则自身。
3. 是否确认所有新功能必须先建 `plan.0.0.XX.0.md`，再进入实现。
4. 是否确认其他线程必须先读取版本总账，再领取版本号。
5. 是否确认版本目录统一放在 `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\versions\`。
6. 是否确认使用 `idea_capture / mini_alignment / version_plan` 三层入口适配用户“想到哪里做到哪里”的工作习惯。
7. 是否确认每轮完成后 TTS 播报规则提升为版本协作通用规则。
8. 是否确认每条想法必须标记主归属系统，并按 `idea-pool-promotion-plan.v1.md` 判断是合并到已有版本，还是升级为新版本方案。
9. 是否确认 `scheme-directory/` 作为后续方案检查和新目标归类的默认入口。
