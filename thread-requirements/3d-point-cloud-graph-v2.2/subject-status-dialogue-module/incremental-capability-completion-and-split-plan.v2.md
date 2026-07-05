# 主体状态对话框不完全具备内容补全与增量拆分计划 v2

状态：待用户确认后进入实现。  
更新时间：2026-06-25  
策略：边构建新功能，边拆分被新功能实际触碰到的边界；不做一次性大搬家，不影响其他线程正在推进的功能。

## 1. 当前判断

当前更合理的路径不是先把主体状态对话框完整拆成独立代码目录，再继续开发，而是在每一次补齐功能时，把该功能直接触碰到的契约、状态、UI、IPC、验证脚本同步拆出。

这样做的好处是：

- 不会为了重构而暂停当前可用功能。
- 不会大面积移动 `ZhinengConsole.tsx`、`src/main/index.ts` 和 CSS，降低与其他线程冲突的概率。
- 每一步拆分都有真实功能作为边界依据，不会形成空目录或过早抽象。
- 旧导出路径和旧 IPC 名称继续保留，其他线程引用不会被打断。

## 2. 已具备基础

当前已经具备以下基础，可以支撑继续补齐：

- 主体状态对话框已有独立需求文件夹：
  - `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module`
- 文字对话链路已可用。
- 浏览器 STT transcript 已能进入同一条对话链路。
- 浏览器 TTS 已能朗读 `StatusDialogueOutput.voiceText`。
- 主进程已有状态快照、真实环境检查、模型测试和对话 IPC。
- 3D 粒子 OS 中已有 `status-dialogue-system` 星云，并已有语音端口、模型接口、状态读取等子粒子表达。
- 核心契约拆分已经开始：
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\contracts.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-profile.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\clone-profile.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\voice-response-plan.ts`
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\index.ts`
- 旧路径已经保留兼容：
  - `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
  - 当前内容为 `export * from './status-dialogue'`

## 3. 当前不完全具备内容

### 3.1 代码结构仍不完全独立

当前主体状态对话框代码仍分布在：

- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\zhineng-console.css`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\*`

其中 `src/core/status-dialogue` 已开始独立，但 renderer 和 main 仍未拆出专属目录。

### 3.2 右侧巡逻状态窗口信息仍偏散

右侧主体状态对话框已经能显示身份、模式、状态摘要、边界、语音端口和日志，但状态位仍容易显得拥挤。

需要补齐：

- 把低频检查项、端口细节、边界细节收纳到设置/详情入口。
- 主面板只保留高频状态：
  - 当前模式。
  - 当前快照状态。
  - 当前语音输入输出状态。
  - 当前模型来源。
  - 最近一次回复状态。
- 设置详情内展示：
  - Phase 0/1 环境检查。
  - STT/TTS adapter 状态。
  - voice profile / clone profile 状态。
  - snapshot source。
  - fallback/error。
  - 边界锁。

### 3.3 `voice_profile.v1` 已有契约，但 UI 绑定不完整

当前 `voice-profile.ts` 已存在，说明核心类型已开始具备。

仍需补齐：

- renderer 中读取 `window.speechSynthesis.getVoices()`。
- 将浏览器 voice list 映射为 `voice_profile.v1[]`。
- 右侧窗口提供音色选择。
- TTS 朗读时使用当前选中的 voice、speed、pitch、volume。
- 3D 星云目录中展示输入、输出、fallback 和可追溯关系。

### 3.4 `clone_profile.v1` 已有契约，但仅是元数据能力

当前 `clone-profile.ts` 已存在，适合继续保持第一阶段元数据状态。

仍需补齐：

- UI 中展示克隆声音状态。
- 明确第一阶段不保存原始音频样本。
- 克隆 profile 未 ready 时，自动回退到普通 voice profile。
- 后续真实克隆服务接入前，保持只读/配置状态。

### 3.5 `voice_response_plan.v1` 已有契约，但输出链路未完整可视化

当前 `voice-response-plan.ts` 已存在，但仍需把每次输出映射到 UI 和 3D 星云。

仍需补齐：

- 每次 TTS 输出前生成 `voice_response_plan.v1`。
- 输出结束后生成 `voice_output_trace.v1`。
- UI 显示最近一次：
  - voice profile。
  - clone profile。
  - adapter。
  - status。
  - fallback reason。
  - latency。
- 3D 星云中增加 `voice.voice_response_plan` 和 `voice.output_trace` 子粒子。

### 3.6 真实 TTS adapter 尚未接入

当前仍是浏览器 TTS 第一版。

仍需补齐：

- 可替换 TTS adapter registry。
- adapter 健康检查。
- voices list。
- test synthesize。
- 低延迟 fallback。
- 用户选择后的真实 TTS 工具接入。

注意：真实 TTS 工具需要用户确认后再接入，不能在本计划阶段默认安装或启动。

### 3.7 系统节点和进度审查仍是 P1

当前状态检查主要基于 `runtime/status-cards/*.json` 和 snapshot。

仍需补齐：

- 将状态卡整理为节点/进度审查摘要。
- 让对话模型能把审查结果组织为自然对话。
- 仍不读取其他模块内部文件。
- 仍不写世界模型。
- 仍不执行需求传递。

### 3.8 测试和验证护栏不足

当前主要依赖：

- `npm.cmd run typecheck`
- `npm.cmd run build`
- 人工/截图验证

仍需补齐：

- 核心纯函数测试或验证脚本。
- STT/TTS fallback 行为验证。
- voice profile 选择验证。
- output trace 生成验证。
- 3D 星云映射检索验证。

## 4. 增量拆分规则

1. 旧导出路径继续保留：
   - `src/core/status-dialogue-contracts.ts`
2. 旧 IPC 名称继续保留：
   - `zhineng:status-dialogue:snapshot:get`
   - `zhineng:status-dialogue:real-env:check`
   - `zhineng:status-dialogue:model:test`
   - `zhineng:status-dialogue:complete`
3. 新目录只承接被当前功能触碰到的代码。
4. 先抽核心纯函数，再抽 hook，再抽面板组件。
5. CSS class 第一阶段不重命名，避免视觉回归。
6. 3D 粒子图主体结构不重写，只在 `status-dialogue-system` 星云下补子粒子。
7. 每一步完成后同步：
   - 模块说明文档。
   - `implementation-progress.v1.md`
   - 3D 星云映射说明。
8. 每一步至少执行：
   - `npm.cmd run typecheck`
9. 触及 UI、Electron IPC 或构建链路时执行：
   - `npm.cmd run build`

## 5. 补全阶段计划

### Step A：同步计划和当前真实状态

目标：把当前“边构建边拆”的策略写成正式基线。

动作：

- 保留 `incremental-capability-completion-and-split-plan.v1.md` 作为旧版计划。
- 新增本文件作为 v2 当前计划。
- 更新 README 指向 v2。
- 更新 `implementation-progress.v1.md`，记录当前补全策略。

验收：

```powershell
rg "incremental-capability-completion-and-split-plan.v2|边构建新功能|兼容 re-export" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

是否需要用户确认：否。  
原因：这是文档同步，不改变运行代码。

### Step B：右侧状态窗口设置化整理

目标：让右侧主体状态对话框更像完整巡逻状态窗口，而不是散乱状态面板。

动作：

- 主窗口保留高频状态。
- 增加设置/详情按钮。
- 低频状态进入可展开详情区。
- 将 Phase 0/1、speech ports、boundary、fallback/error 放入详情区。

拆分动作：

- 暂时不拆组件，只先整理 JSX 和 CSS。
- 如果 JSX 明显变重，再进入 Step G 组件拆分。

验收：

- 右侧主面板默认更简洁。
- 点击详情入口后可以看到完整状态。
- 文字输入、STT、TTS 不回退。
- `npm.cmd run typecheck`
- `npm.cmd run build`

是否需要用户确认：是。

需要确认：

1. 是否采用“设置/详情按钮”收纳低频状态。
2. 是否允许第一版只整理 UI 结构，不立刻拆 React 组件。

### Step C：浏览器多音色选择 UI

目标：先用浏览器 voice list 跑通多音色选择，不接第三方 TTS。

动作：

- 从 `window.speechSynthesis.getVoices()` 读取 voices。
- 映射为 `voice_profile.v1[]`。
- 右侧窗口显示：
  - 当前 voice profile。
  - voice selector。
  - test voice。
  - fallback 状态。
- TTS 使用当前 profile 的 voice、speed、pitch、volume。

拆分动作：

- 优先新增：
  - `src/renderer/src/status-dialogue/useStatusDialogueVoice.ts`
- UI 可先留在 `ZhinengConsole.tsx`，下一阶段再抽组件。

验收：

- 无 voice list 时仍能 fallback。
- 有 voice list 时可切换音色。
- 开关 voice 不影响文字对话。
- 不写磁盘配置。
- `npm.cmd run typecheck`
- `npm.cmd run build`

是否需要用户确认：是。

需要确认：

1. 是否确认第一版只用浏览器 voice list。
2. 是否确认音色选择第一版只保存在页面状态，不写入磁盘。
3. 是否确认默认 profile id 使用 `voice.default.browser.zh-CN`。

### Step D：语音输出计划和 trace 可视化

目标：让每次语音输出有可追溯的计划和结果。

动作：

- 在 TTS 输出前生成 `voice_response_plan.v1`。
- 在输出结束、失败、跳过或 fallback 时生成 `voice_output_trace.v1`。
- UI 展示最近一次 output trace。
- 3D 星云补充：
  - `voice.voice_response_plan`
  - `voice.output_trace`
  - `voice.fallback_policy`

拆分动作：

- 核心逻辑已经有 `voice-response-plan.ts`。
- 下一步只需要 renderer 绑定和 3D 映射补齐。

验收：

```powershell
rg "voice_response_plan.v1|voice_output_trace.v1|voice.output_trace" D:\zhineng\sightflow-desktop-agent-main\src
npm.cmd run typecheck
```

是否需要用户确认：是。

需要确认：

1. 是否只记录最近一次 output trace。
2. 是否暂不写入 `runtime/status-dialogue/tts-cache`。

### Step E：TTS adapter 框架

目标：建立真实 TTS 接入位置，但不立刻绑定具体工具。

动作：

- 新增 TTS adapter 类型。
- 新增 adapter registry。
- 新增 health/list voices/test synthesize IPC。
- adapter 不可用时继续使用浏览器 TTS fallback。

建议目录：

- `src/main/status-dialogue/tts-adapter.ts`
- `src/main/status-dialogue/ipc.ts`

建议 IPC：

- `zhineng:status-dialogue:tts:health`
- `zhineng:status-dialogue:tts:voices:list`
- `zhineng:status-dialogue:tts:synthesize:test`

验收：

- 无真实 adapter 配置时不报错。
- 浏览器 TTS 仍可用。
- 不启动外部服务。
- 不安装第三方工具。
- `npm.cmd run typecheck`
- `npm.cmd run build`

是否需要用户确认：是。

需要确认：

1. 第一版真实 TTS adapter 是否只做 `local_http`。
2. 是否暂不自动托管本地 TTS 进程。
3. 真实 TTS 工具是否等你从候选清单确认后再接入。

### Step F：克隆声音 profile 状态位

目标：先把克隆声音作为可配置能力表达出来，不处理原始音频。

动作：

- UI 展示 clone profile 状态。
- 未配置时显示 `not_configured`。
- 未 ready 时 TTS 自动回退普通 voice profile。
- 3D 星云补充 `voice.clone_profile` 的输入、输出和边界。

验收：

- 不保存原始音频样本。
- clone profile 不影响普通 TTS。
- `npm.cmd run typecheck`

是否需要用户确认：是。

需要确认：

1. 是否确认第一阶段只保存克隆 profile 元数据，不保存原始音频样本。
2. 是否确认真实克隆工具后续再选，不在本阶段接入。

### Step G：系统节点和进度审查摘要

目标：让主体状态对话框进入第二目标：检查系统节点和进度，并整理成自然对话。

动作：

- 将 `status_snapshot.v1` 转成 `patrol_review_summary.v1`。
- 汇总：
  - fresh。
  - stale。
  - missing。
  - conflict。
  - read_errors。
  - blocked。
- 本地 fallback 能回答“当前哪些模块缺失/过期/阻塞”。
- 远程模型 prompt 中加入简洁审查摘要，而不是塞入冗长原始数据。

建议目录：

- `src/core/status-dialogue/patrol-review.ts`
- `src/renderer/src/status-dialogue/useStatusDialoguePatrol.ts`

验收：

- 没有状态卡时能明确说明缺失。
- 有状态卡时能引用状态卡摘要。
- 不读取其他模块内部数据。
- 不写世界模型。
- 不执行需求传递。
- `npm.cmd run typecheck`
- `npm.cmd run build`

是否需要用户确认：是。

需要确认：

1. 是否确认 Step G 作为 P1，在多音色与输出 trace 稳定后再做。
2. 是否确认状态卡仍是唯一状态输入，不直接读其他模块内部文件。

### Step H：Renderer 和 Main 增量拆分

目标：在功能稳定后，把大文件中的主体状态对话框逻辑拆到独立目录。

Renderer 建议目录：

- `src/renderer/src/status-dialogue/StatusDialoguePanel.tsx`
- `src/renderer/src/status-dialogue/StatusDialogueVoicePanel.tsx`
- `src/renderer/src/status-dialogue/StatusDialogueSettingsPanel.tsx`
- `src/renderer/src/status-dialogue/useStatusDialogueModel.ts`
- `src/renderer/src/status-dialogue/useStatusDialogueSpeechInput.ts`
- `src/renderer/src/status-dialogue/useStatusDialogueSnapshot.ts`
- `src/renderer/src/status-dialogue/types.ts`

Main 建议目录：

- `src/main/status-dialogue/ipc.ts`
- `src/main/status-dialogue/snapshot-reader.ts`
- `src/main/status-dialogue/real-env-check.ts`
- `src/main/status-dialogue/model-probe.ts`
- `src/main/status-dialogue/model-complete.ts`

拆分顺序：

1. 先抽纯 helper。
2. 再抽 hook。
3. 再抽小面板。
4. 最后抽完整 `StatusDialoguePanel`。

验收：

- UI 视觉不回退。
- STT、TTS、文字输入、模型 fallback、状态快照均可用。
- `npm.cmd run typecheck`
- `npm.cmd run build`

是否需要用户确认：是。

需要确认：

1. 是否确认 CSS class 第一阶段不重命名。
2. 是否确认 3D 图主体仍留在 `ZhinengConsole.tsx`，暂不一起拆。

### Step I：测试和验证补齐

目标：给后续拆分建立稳定护栏。

优先测试对象：

- `normalizeVoiceProfile`
- `normalizeCloneProfile`
- `buildVoiceResponsePlan`
- `buildVoiceOutputTrace`
- `buildStatusSnapshotFromCards`
- `guardStatusDialogueOutput`
- `buildStatusDialogueSpeechPortsState`
- 未来的 `buildPatrolReviewSummary`

建议：

- 第一阶段新增纯函数测试或验证脚本。
- UI 自动化放到第二阶段，避免先引入大工具链。

验收：

```powershell
npm.cmd run typecheck
npm.cmd run build
```

如果新增专属脚本，建议：

```powershell
npm.cmd run status-dialogue:test
```

是否需要用户确认：是。

需要确认：

1. 是否允许新增主体状态对话框专属测试脚本。
2. 是否第一阶段只覆盖纯函数，UI 自动化后移。

## 6. 推荐下一轮执行范围

推荐下一轮只执行：

1. Step B：右侧状态窗口设置化整理。
2. Step C：浏览器多音色选择 UI。
3. Step D：语音输出计划和 trace 可视化。

暂不执行：

- 真实 TTS adapter。
- 真实克隆声音服务。
- 系统节点和进度审查 P1。
- renderer/main 大规模拆分。
- UI 自动化测试。

理由：

- 当前核心契约目录已经开始拆出，下一步最应该让这些契约真正进入 UI 和 3D 映射。
- 多音色输出是当前第一目标的一部分。
- output trace 能让后续真实 TTS/克隆接入更容易验证。
- 大拆分应等 UI 状态和 voice trace 稳定后再做。

## 7. 待用户确认清单

请确认以下点后，我再进入实现：

1. 是否确认下一轮只做 Step B/C/D。
2. 是否确认右侧窗口采用“设置/详情按钮”收纳低频状态。
3. 是否确认第一版多音色只用浏览器 voice list。
4. 是否确认第一版音色选择只保存在页面状态，不写磁盘。
5. 是否确认默认 profile id 使用 `voice.default.browser.zh-CN`。
6. 是否确认 output trace 第一版只保留最近一次内存记录。
7. 是否确认 `clone_profile.v1` 第一阶段只做元数据和状态位，不保存原始音频样本。
8. 是否确认真实 TTS adapter、真实克隆声音服务、系统节点/进度审查放到后续阶段。
9. 是否确认 CSS class 第一阶段不重命名。
10. 是否确认暂不拆 3D 图主体，只在 `status-dialogue-system` 星云下补子粒子。

## 8. 保持边界

本计划实施期间继续保持：

- 不写世界模型。
- 不创建 `requirement_packet.v1`。
- 不接真实人际关系图谱。
- 不接真实事件图谱。
- 不执行外部动作。
- 不保存原始音频样本。
- 不改变现有 IPC 通道名。
- 不重写 3D 粒子图主体结构。
- 不影响其他线程正在推进的功能。
