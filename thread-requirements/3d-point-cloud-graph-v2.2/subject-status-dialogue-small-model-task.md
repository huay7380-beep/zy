# 主体状态对话框小模型接入任务

状态：当前线程独立目标记录。本文只描述主体状态对话框，不改变人际关系辅助系统现有功能。

## 目标

把 3D 粒子系统右侧的主体状态对话框升级为“我”的状态表达界面：
- 以第一人称输出最简洁、最有质量的状态回答。
- 语音输出同样使用第一人称短句，不做长篇旁白播报。
- 日志区域展示可审计的关注点摘要，例如当前焦点、边界、风险和下一检查点。
- 通过第三方小模型和固定提示词实现；没有模型配置时保留本地只读回退。

## 当前实现

- Renderer 通过 `zhineng:status-dialogue:complete` IPC 请求主进程。
- 主进程读取当前聊天服务配置：
  - `chatProvider.config.apiKey` 优先。
  - 若无，则使用 `vision.apiKey`。
  - `chatProvider.config.model` 优先，否则使用内置 lite 模型。
  - `chatProvider.config.baseURL` 或 `baseUrl` 优先，否则使用内置 OpenAI-compatible base URL。
- 主进程使用 `AIClient.callChat()` 调用 OpenAI-compatible `/chat/completions`。
- Renderer 提供本地 fallback：
  - 网页预览无 Electron IPC 时启用。
  - 未配置 key 时启用。
  - 模型调用失败时启用。

## 提示词契约

版本：`subject_status_dialogue.first_person.v1`

模型必须输出 JSON：

```json
{
  "reply": "一句最短有效的第一人称回答",
  "voice": "更短的第一人称语音句",
  "thoughts": ["3-5 条可审计关注点摘要"]
}
```

约束：
- `reply` 必须使用“我”的主体表达。
- 不允许用旁白口吻说“系统当前……”作为默认输出。
- 不允许编造实时业务事实。
- 不允许触发任何外部动作。
- `thoughts` 只展示关注点摘要，不展示隐藏推理链。

## 输入端口

| 端口 | 内容 | 来源 |
| --- | --- | --- |
| `input_port.user_query` | 用户文字问询 | 对话框输入框 |
| `input_port.focus_context` | 当前粒子焦点、层级、状态、owner、gate、compass、子节点数量 | 3D 粒子 UI |
| `input_port.global_counts` | 星云模块数量、内容星点数量 | 当前 fixture |
| `input_port.boundaries` | 只读、无外部动作、不读真实图谱、候选不等于事实 | 投影边界 |

## 输出端口

| 端口 | 内容 | 用途 |
| --- | --- | --- |
| `output_port.first_person_reply` | 第一人称简洁文本 | 对话框主回复 |
| `output_port.voice_line` | 更短语音句 | 浏览器语音合成 |
| `output_port.attention_log` | 关注点摘要 | 日志展示 |
| `fallback.local_status` | 本地状态回退 | 模型不可用时保持功能 |

## 3D 粒子映射

新增到 `status-dialogue-system` 星云的关键星点：
- `small_model_ipc_adapter`
- `first_person_prompt_contract`
- `input_port.user_query`
- `input_port.focus_context`
- `output_port.first_person_reply`
- `output_port.voice_line`
- `output_port.attention_log`
- `constraint.no_narrator`
- `constraint.minimal_voice`
- `constraint.no_hidden_cot`
- `fallback.local_status`

## 边界

- 当前对话框只检查状态，不执行动作。
- 当前对话框不读取真实 `data/people/**` 或 `data/events/**`。
- 当前对话框不直接接入人际关系辅助系统运行链路。
- 小模型输出不能越过行动层、安全层和真实执行闸口。
- 网页预览模式不会调用 Electron IPC，因此只走本地回退。
