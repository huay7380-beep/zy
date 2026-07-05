# 新目标归类规则

状态：草案，等待用户确认。

目标：让 Codex 在收到新目标时，先判断它属于哪个系统、是否影响接口或 3D 映射、是否应该回到已有方案，还是需要升级为新的版本方案。

## 归类字段

每个新目标至少记录：

| Field | 说明 |
| --- | --- |
| `source` | 用户原话或来源想法编号 |
| `primary_system` | 主归属系统 |
| `related_systems` | 关联系统 |
| `scheme_id` | 方案编号，已有则更新，新增则创建 |
| `entry_level` | `idea_capture`、`mini_alignment`、`version_plan` |
| `current_state` | 当前已有能力 |
| `desired_state` | 用户希望达到的目标 |
| `impact_flags` | 是否影响接口、状态读写、UI、3D 映射、外部动作 |
| `route` | 进入想法池、已有方案、已有版本迭代或新版本方案 |
| `confirmation_needed` | 需要用户确认的问题 |

## 系统归属

| System | 范围 |
| --- | --- |
| `version-governance` | 版本、想法池、多线程规则、验收规则 |
| `scheme-directory` | 方案索引、状态总览、目标归类 |
| `status-dialogue-system` | 主体状态对话框、巡逻窗口、对话逻辑、短上下文 |
| `voice-loop` | STT、TTS、音色、声音克隆、语音延迟和播放体验 |
| `runtime-integration` | IPC、运行时日志、状态卡、适配器、服务健康 |
| `world-system-3d-os` | 三维粒子 OS、星云、目录、视觉操作 |
| `projection-contracts` | 3D 映射、节点输入输出、权属和闸口 |
| `interpersonal-assistant` | 人际关系辅助系统 |
| `event-graph-system` | 事件图谱和全域事件图谱 |

## 路由规则

### 进入已有方案

适用于：

- 对已有方案的补充。
- 用户纠正方案原则。
- 不改变代码行为的方案修正。

示例：用户纠正 `idea-0004`：每一句语音都必须是高质量 TTS。这应更新 `voice-dialogue-latency-optimization-plan.v1.md`，不新开版本号。

### 回到已有版本迭代

适用于：

- 已实现功能的小修复。
- UI 小体验调整。
- 文档或验证补充。
- 不新增接口、不改变状态契约、不改变 3D 拓扑。

### 升级为新版本方案

出现以下任一情况，应进入 `version_plan`：

- 新用户可感知功能。
- 新 IPC/API/adapter/schema。
- 新状态读写路径。
- 新 3D 星云、节点、目录或映射。
- UI 主结构改变。
- 跨模块协作或外部动作。
- 安全边界、权限边界、执行边界变化。

## 质量优先规则

如果用户明确指定体验底线，该体验底线优先于一般性能建议。

当前已确认的用户倾向：

- 语音对话模块的每一句播报都应保持高质量 TTS 和一致音色体验。
- 延迟优化应通过流式、预热、缓存、并行和首句优先实现，不能用低质量语音替代高质量语音作为常规路径。
- 浏览器 TTS、文本-only 和低质量 fallback 只能作为故障兜底，不能作为正常体验目标。

## 输出要求

归类完成后，Codex 应同步：

1. `versions/idea-inbox.md`
2. `scheme-directory/scheme-ledger.md`
3. 对应方案文档
4. 必要时同步 `scheme-directory/status-dashboard.md`
