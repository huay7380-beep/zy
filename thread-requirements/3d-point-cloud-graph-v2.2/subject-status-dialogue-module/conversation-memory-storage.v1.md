# 主体状态对话框短上下文存储 v1

## 状态

- 版本：`status_dialogue_conversation_memory.v1`
- 当前状态：Phase 1 实现版，已接入主体状态对话框上下文与右侧巡逻状态窗口。
- 实现文件：`src/core/status-dialogue/conversation-memory.ts`
- 存储键：`zhineng.statusDialogue.conversationMemory.v1`

## 设计定位

短上下文不是传统聊天记录压缩，也不是完整对话日志。它只保存当前对话模块继续工作所需的“目标态记忆”，重点服务：

- 当前用户目标。
- 用户持续关注点。
- 已确认结果。
- 未解决问题。
- 当前聚焦节点。
- 下一轮回复应优先交付的结果。
- 状态巡逻相关的缺失项和引用。

它的目标是让主体状态对话框在多轮沟通中更像“持续巡逻的窗口”，而不是每一轮都从零开始解释。

## 存储方式

- 当前使用 renderer 侧 `localStorage`。
- 初始化时读取 `zhineng.statusDialogue.conversationMemory.v1`。
- 读取失败或内容异常时使用默认记忆卡。
- 每次对话结果返回后更新一次记忆卡。
- 当前不写入文件系统、不写入世界模型、不写入人际图谱、不写入事件图谱。

## 记忆卡字段

| 字段 | 用途 |
| --- | --- |
| `active_goal` | 当前对话应围绕的主目标 |
| `user_focus[]` | 用户长期关注点，例如结果优先、低延迟、状态巡逻、3D 可追溯 |
| `current_focus_node` | 当前 3D OS 聚焦节点 |
| `current_focus_status` | 当前聚焦节点状态 |
| `confirmed_facts[]` | 已确认事实和结果摘要 |
| `open_questions[]` | 仍需继续跟踪的问题 |
| `preferred_response` | 回复风格规则，默认结果优先、少讲无关过程 |
| `next_expected_result` | 下一轮应优先交付的结果 |
| `latest_user_intent` | 最近一轮用户意图摘要 |
| `result_summary` | 最近一轮输出结果摘要 |
| `status_refs[]` | 状态引用 |
| `missing_status[]` | 缺失状态项 |
| `boundaries[]` | 存储和行为边界 |

## 明确不保存

- 不保存完整原始聊天记录。
- 不保存隐藏推理过程。
- 不保存原始音频。
- 不保存 API key 或模型密钥。
- 不创建 `requirement_packet.v1`。
- 不写入世界模型、人际关系图谱、事件图谱或外部动作通道。

## 对话链路

1. 用户文字或语音转写进入 `submitDialogue`。
2. renderer 刷新只读 `status_snapshot.v1`。
3. renderer 将 `conversationMemory` 注入 `StatusDialogueContext`。
4. 主进程模型调用只接收当前用户输入、状态快照、当前聚焦节点和短上下文记忆。
5. 模型或本地 fallback 返回后，renderer 生成新的短上下文记忆卡。
6. 新记忆卡写回 `localStorage`，并在右侧巡逻状态窗口展示。

## 右侧巡逻状态窗口映射

当前界面新增 `conversation memory goal state` 面板，展示：

- `memory`：当前 `active_goal`。
- `turns`：已累计的目标态记忆更新轮数。
- `intent`：最近一轮用户意图。
- `focus`：当前聚焦节点。
- chips：用户关注点、已确认结果、未解决问题。
- 底部说明：下一轮应优先交付的结果。

## 世界系统三维粒子 OS 映射

主体状态对话框星云下已增加短上下文子粒子：

| 粒子 | 表示内容 |
| --- | --- |
| `memory.active_goal` | 当前目标 |
| `memory.user_focus` | 用户关注点罗盘 |
| `memory.confirmed_results` | 已确认结果 |
| `memory.open_questions` | 未解决问题 |
| `memory.next_expected_result` | 下一轮结果方向 |
| `memory.storage_boundary` | 本地存储边界 |

这些粒子只表达主体状态对话框自有能力，不表示已经接入世界核心或其他业务系统。

## 当前边界

- 当前为目标态短上下文，不是长期记忆系统。
- 当前为本地浏览器存储，不做跨设备同步。
- 当前只服务主体状态对话框，不向世界模型传递需求。
- 当前只读状态快照，不读取模块内部业务全文。
- 当前不改变现有 3D 粒子 OS 的全局结构，只在主体状态对话框星云下补充子层级。

## 验证要求

- `npm.cmd run typecheck`
- `npm.cmd run build`
- 检索 `status_dialogue_conversation_memory.v1`、`conversationMemory`、`memory.active_goal`。
- 页面打开 `http://[::1]:5173/?window=zhineng-graph`。
- 确认右侧巡逻状态窗口出现 memory 面板。
- 确认 3D canvas 非空白。
- 确认主体状态对话框星云源码包含短上下文子粒子。
