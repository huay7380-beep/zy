# P0 语音闭环与多音色/克隆声音实现计划 v1

状态：待确认实施。  
范围：只针对主体状态对话框自有语音输出能力、音色配置、克隆声音插件位和 UI 映射；不接入世界核心、不执行需求传递、不写入人际/事件图谱。

## 目标

P0 的第一目标不是一次性完成最强语音系统，而是先让主体状态对话框形成稳定、流畅、可持续扩展的语音闭环：

1. 用户可以用文字或已可用的浏览器 STT transcript 与模块对话。
2. 模块以简洁第一人称生成 `voice_line` / `voiceText`。
3. 语音输出可以选择不同音色。
4. 语音输出 adapter 可替换。
5. 克隆声音作为独立配置和插件能力接入，不写死到 prompt 或 UI。
6. 当真实 TTS 或克隆服务不可用时，自动回退到浏览器 TTS 或纯文字输出，不影响对话。

第二目标“系统节点和进度审查”仍保留，但排在 P0 语音闭环之后。当前计划只为后续状态审查预留 `voice_response_plan.v1` 和状态引用字段，不扩大到真实系统巡检实现。

## 当前基线

已具备：

- 浏览器 STT 第一版：`browser_speech_recognition`，transcript 可进入 `submitDialogue(..., "speech_transcript")`。
- 浏览器 TTS 第一版：`browser_speech_synthesis`，只朗读 `StatusDialogueOutput.voiceText`。
- 对话本地 fallback：模型不可用时仍能生成第一人称状态回复。
- 语音端口状态位：右侧巡逻窗口已能显示 STT/TTS adapter、status、fallback。
- 3D 粒子 OS 已有 `voice.stt_adapter`、`voice.tts_adapter`、`voice.voice_profile`、`voice.clone_profile` 等投射点。

尚未具备：

- 独立 `voice_profile.v1` 配置文件与读取链路。
- 独立 `clone_profile.v1` 配置文件与读取链路。
- 可替换 TTS adapter 的真实服务调用层。
- 音色选择 UI。
- 声音克隆真实服务。
- TTS 输出缓存、健康检查、延迟统计和失败回退记录。

## P0 边界

本计划允许：

- 定义 voice profile、clone profile、TTS adapter、voice response plan 的契约。
- 在右侧主体状态对话框中展示和切换音色。
- 调用本地或远程 TTS 服务生成音频。
- 在 3D 粒子 OS 与目录中展示音色、克隆、adapter、输入输出和 fallback 状态。

本计划不做：

- 不把用户需求传递到世界模型。
- 不创建 `requirement_packet.v1`。
- 不写入人际关系图谱、事件图谱或世界核心。
- 不保存未经确认的原始音频样本。
- 不把克隆声音配置写进模型 prompt。
- 不让 TTS 输出再次进入 STT 对话链路；后续持续监听阶段必须加入回声抑制和输出期间输入门控。

## 数据契约

### voice_profile.v1

用途：描述“我用什么声音说话”，包括普通音色、服务音色、克隆音色的统一入口。

建议字段：

```json
{
  "schema": "voice_profile.v1",
  "profile_id": "voice.default.browser.zh-CN",
  "display_name": "默认中文音色",
  "enabled": true,
  "adapter_id": "browser_speech_synthesis",
  "voice_id": "zh-CN-browser-default",
  "locale": "zh-CN",
  "style": "calm_first_person",
  "speed": 1,
  "pitch": 1,
  "volume": 1,
  "emotion_defaults": {
    "neutral": "calm",
    "warn": "steady",
    "blocked": "low_energy"
  },
  "clone_profile_id": null,
  "fallback_profile_id": "voice.text_only",
  "updated_at": "2026-06-25T00:00:00.000Z"
}
```

关键规则：

- `profile_id` 是 UI、TTS adapter、3D 粒子映射共同引用的稳定 ID。
- `adapter_id` 决定交给哪个 TTS adapter。
- `clone_profile_id` 为空时表示普通音色；不为空时表示该 voice profile 依赖克隆配置。
- `fallback_profile_id` 必须存在，避免真实服务失败时中断对话。

### clone_profile.v1

用途：描述“克隆声音从哪里来、当前是否可用、如何受控调用”。当前阶段只保存元数据和引用，不保存原始音频。

建议字段：

```json
{
  "schema": "clone_profile.v1",
  "clone_profile_id": "clone.user.primary",
  "display_name": "用户主克隆音色",
  "provider": "gpt_sovits",
  "status": "not_configured",
  "consent_status": "user_owned_or_authorized",
  "locale": "zh-CN",
  "sample_refs": [],
  "embedding_ref": null,
  "speaker_id": null,
  "quality": {
    "naturalness": "unknown",
    "similarity": "unknown",
    "latency": "unknown"
  },
  "boundaries": {
    "raw_audio_stored_by_app": false,
    "requires_explicit_user_action": true
  },
  "created_at": "2026-06-25T00:00:00.000Z",
  "updated_at": "2026-06-25T00:00:00.000Z"
}
```

关键规则：

- `status` 可为 `not_configured`、`sample_required`、`ready`、`error`。
- 当前应用默认不保存原始音频，只保存样本引用或外部服务返回的 speaker/profile 引用。
- 克隆服务不可用时，绑定它的 voice profile 必须回退到普通音色。

### tts_adapter.v1

用途：让浏览器 TTS、本地 HTTP TTS、远程 HTTP TTS、本地进程 TTS 使用同一调用边界。

建议能力字段：

```ts
type TtsAdapterKind =
  | "browser_speech_synthesis"
  | "local_http"
  | "remote_http"
  | "local_process"
  | "text_only";

type TtsAdapterCapabilities = {
  voice_list: boolean;
  clone_voice: boolean;
  streaming: boolean;
  emotion_hint: boolean;
  ssml: boolean;
};
```

建议方法：

- `healthCheck()`：返回 adapter 是否可用、延迟、错误摘要。
- `listVoices()`：返回可选 voice profiles 或 provider voices。
- `synthesize(request)`：输入 `voice_response_plan.v1`，输出音频 URL、音频 bytes 引用或直接播放结果。
- `stop()`：停止当前朗读。

### voice_response_plan.v1

用途：把模型输出和 TTS 执行分开。模型只决定“说什么”和“语气提示”，adapter 决定“怎么发声”。

建议字段：

```json
{
  "schema": "voice_response_plan.v1",
  "text": "我看到了 3 个状态卡，其中 1 个过期。",
  "voice_profile_id": "voice.default.browser.zh-CN",
  "clone_profile_id": null,
  "emotion_hint": "steady",
  "speed": 1,
  "pitch": 1,
  "volume": 1,
  "fallback_allowed": true,
  "source_output_id": "status_dialogue_output_001"
}
```

关键规则：

- TTS 只朗读 `text`，不朗读隐藏上下文、完整 prompt、状态卡原文或调试对象。
- `emotion_hint` 是轻量提示，不要求第一阶段实现强拟情感。
- `source_output_id` 用于 UI、日志、3D 粒子和目录追溯同一次回复。

## 代码落点

当前不立即拆大目录，先做低冲突扩展：

- 契约层：`D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue-contracts.ts`
- 主进程：`D:\zhineng\sightflow-desktop-agent-main\src\main\index.ts`
- Renderer/UI：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\ZhinengConsole.tsx`
- 样式：`D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\zhineng-console\zhineng-console.css`

确认后再低风险抽出：

- `D:\zhineng\sightflow-desktop-agent-main\src\core\status-dialogue\`
- `D:\zhineng\sightflow-desktop-agent-main\src\main\status-dialogue\`
- `D:\zhineng\sightflow-desktop-agent-main\src\renderer\src\status-dialogue\`

建议运行时配置路径：

- `runtime/status-dialogue/voice-profiles/*.json`
- `runtime/status-dialogue/clone-profiles/*.json`
- `runtime/status-dialogue/tts-adapters/*.json`
- `runtime/status-dialogue/tts-cache/`

第一阶段可以只读配置；只有用户显式测试语音或选择音色时才触发 TTS 调用。

## UI 表达

右侧主体状态对话框新增一个紧凑的“Voice”区域：

- 当前 voice profile：显示 `display_name`、adapter、locale。
- 音色选择：下拉选择已发现或已配置的 voice profile。
- Adapter 状态：`ready`、`fallback`、`error`、`text only`。
- 克隆状态：未配置、需要样本、可用、错误。
- 测试按钮：只朗读一条短测试句，不触发模型、不写世界模型。
- fallback 提示：真实服务失败时显示当前回退到哪个 profile。

交互原则：

- 语音设置不挤占巡逻状态摘要；可做折叠区或紧凑行。
- 切换 voice profile 不改变对话模型上下文。
- 关闭 voice 后文字对话仍完整可用。
- TTS 播放中再次输入文字或语音时，应能停止当前播放或排队，第一阶段优先做“停止当前播放”。

## 3D 粒子 OS 与目录映射

在 `status-dialogue-system` 星云下增加或强化以下子粒子：

| 粒子 | 含义 | 输入 | 输出 | 归属闸口 |
| --- | --- | --- | --- | --- |
| `voice.voice_profile` | 音色配置 | voice profile json、浏览器 voice list、adapter voice list | 当前选中音色、fallback 音色 | 主体状态对话框 |
| `voice.clone_profile` | 克隆音色元数据 | clone profile json、外部服务 speaker ref | 克隆可用状态、错误摘要 | 主体状态对话框 |
| `voice.tts_adapter` | TTS 调用边界 | voice response plan、adapter config | 音频输出、播放状态、错误 | 主体状态对话框 |
| `voice.voice_response_plan` | 语音输出计划 | StatusDialogueOutput.voiceText、emotion_hint、voice profile | TTS 请求 | 主体状态对话框 |
| `voice.fallback_policy` | 失败回退 | adapter health、profile status | 浏览器 TTS 或 text only | 主体状态对话框 |
| `voice.output_trace` | 可追溯记录 | output id、profile id、adapter id | UI/目录可查的语音链路摘要 | 主体状态对话框 |

目录中需要同步展示：

- 当前选中的 voice profile。
- 当前 adapter。
- 克隆 profile 是否 ready。
- 最近一次 TTS 输出的 `source_output_id`。
- 最近一次 fallback 原因。

## 实施顺序

### P0.1 契约和默认配置

目标：先定义配置和类型，保证 UI、主进程、未来 adapter 不再各说各话。

实现：

- 扩展 `status-dialogue-contracts.ts`。
- 新增 `VoiceProfile`、`CloneProfile`、`TtsAdapterConfig`、`VoiceResponsePlan`。
- 新增 `DEFAULT_VOICE_PROFILE`、`DEFAULT_TEXT_ONLY_VOICE_PROFILE`。
- 新增归一化函数：
  - `normalizeVoiceProfile`
  - `normalizeCloneProfile`
  - `buildVoiceResponsePlan`
  - `selectFallbackVoiceProfile`

验收：

- 无真实 TTS 服务时仍能使用浏览器 TTS 或 text only。
- `npm.cmd run typecheck` 通过。
- 3D 粒子 OS 目录能展示这些节点的 schema 和 I/O。

### P0.2 浏览器多音色选择 UI

目标：先用浏览器已有 voices 跑通“多音色选择”。

实现：

- Renderer 读取 `window.speechSynthesis.getVoices()`。
- 把浏览器 voices 映射成临时 `voice_profile.v1`。
- 右侧窗口显示音色选择。
- 选择后写入当前 UI 状态；第一阶段可不持久化。
- TTS 播放使用当前 profile 的 `voice_id`、`speed`、`pitch`、`volume`。

验收：

- 用户可以选择不同浏览器音色。
- `voice on` 后下一次回复按所选音色朗读。
- 找不到 voice 时回退浏览器默认音色。

### P0.3 本地/远程 TTS adapter 框架

目标：给真实 TTS 服务留出稳定接口。

实现：

- 新增 `TtsAdapterConfig` 和 adapter registry。
- 主进程暴露只读/测试型 IPC：
  - `zhineng:status-dialogue:tts:voices:list`
  - `zhineng:status-dialogue:tts:synthesize:test`
  - `zhineng:status-dialogue:tts:health`
- 首选 HTTP adapter，不直接把 TTS 工具嵌进 renderer。
- 只传 `voice_response_plan.v1`，不传完整对话上下文。

验收：

- adapter 不可用时 UI 显示 fallback，不影响文字对话。
- 测试按钮能返回成功或错误摘要。
- 不保存原始用户音频样本。

### P0.4 第一真实 TTS 服务

推荐顺序：

1. 保留 `browser_speech_synthesis` 作为始终可用 fallback。
2. 低延迟本地普通音色：优先 `Kokoro` 或 `Piper`。
3. 中文自然表达增强：优先 `CosyVoice`；如果部署成本过高，再评估 `Fish Speech`。

理由：

- P0 目标是流畅闭环，低延迟比最高音质更重要。
- `Kokoro` / `Piper` 适合承担短 `voice_line` 的快速回放。
- `CosyVoice` 更适合中文自然表达和后续克隆能力。

验收：

- 本地或远程服务健康检查通过。
- 一条短 `voice_line` 可以输出音频并播放。
- 服务失败时自动回退浏览器 TTS。
- UI 显示 adapter、voice profile、latency、fallback。

### P0.5 克隆声音插件位

目标：先让克隆声音有配置、状态和回退规则，再接真实克隆服务。

实现：

- 新增 `clone_profile.v1` 配置读取。
- voice profile 可以绑定 `clone_profile_id`。
- UI 显示克隆 profile 状态。
- 克隆未 ready 时禁用选择或自动 fallback。
- 真实服务首选顺序：
  1. `CosyVoice`：中文自然表达和克隆路线合一时优先。
  2. `GPT-SoVITS`：定制音色和社区链路成熟，适合后续认真打磨克隆声音。
  3. `OpenVoice`：作为声音转换/风格迁移增强层。

验收：

- 未配置克隆服务时不会破坏普通 TTS。
- 配置 ready 的 clone profile 可被 voice profile 引用。
- UI 和目录能追溯当前克隆来源、adapter、fallback。

### P0.6 可观察性和验证

目标：让每次语音输出都能被 UI、目录、3D 粒子追溯。

实现：

- 新增 `voice.output_trace`。
- 记录最近一次：
  - `source_output_id`
  - `voice_profile_id`
  - `clone_profile_id`
  - `adapter_id`
  - `fallback_used`
  - `latency_ms`
  - `error_summary`

验收：

- 右侧 UI 可见最近一次语音输出来源。
- 3D 粒子目录可查同一条语音输出链路。
- 语音失败不阻塞对话。

## 验证方案

文档验证：

```powershell
rg "voice_profile.v1|clone_profile.v1|tts_adapter.v1|voice_response_plan.v1|Kokoro|Piper|CosyVoice|GPT-SoVITS|OpenVoice" D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\subject-status-dialogue-module
```

实现后类型和构建验证：

```powershell
cd D:\zhineng\sightflow-desktop-agent-main
npm.cmd run typecheck
npm.cmd run build
```

UI 验证：

- 打开 3D 粒子 OS。
- 确认右侧主体状态对话框显示 Voice 区。
- 切换音色后发送一句文字，确认朗读音色变化。
- 关闭 voice 后，文字对话不受影响。
- TTS 服务不可用时，UI 显示 fallback。

行为验证：

- `voiceText` 为空时不触发 TTS。
- TTS 只朗读 `voice_response_plan.v1.text`。
- 克隆 profile 不可用时回退普通 voice profile。
- 浏览器 voice list 为空时回退 text only。
- 不创建 `requirement_packet.v1`。
- 不写入世界模型、人际图谱、事件图谱。

性能观察：

- 浏览器 TTS：应接近即时。
- 低延迟本地 TTS：短句首音目标优先控制在 800-1500ms 内。
- 克隆声音：允许更高延迟，但 UI 必须显示等待或 fallback。

## 当前建议

我建议确认后按以下顺序实施：

1. P0.1：补齐契约和默认配置。
2. P0.2：先用浏览器 voice list 实现多音色选择 UI。
3. P0.3：加 TTS adapter IPC 和健康检查，不绑定具体工具。
4. P0.4：先接一个低延迟本地 TTS，优先 `Kokoro` 或 `Piper`。
5. P0.5：再接 `CosyVoice` 或 `GPT-SoVITS` 做克隆声音。

这样能最快把“完整流畅对话 + 多音色输出”跑起来，同时不牺牲后续克隆声音和拟情感表达的扩展空间。
