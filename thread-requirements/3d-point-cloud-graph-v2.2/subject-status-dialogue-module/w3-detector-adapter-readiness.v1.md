# W3 Detector Adapter Readiness v1

日期：2026-06-28
归属：`status-dialogue-system`
关联方案：`SCHEME-0006` / `idea-0006`

## 结论

当前已经具备并已实现 `W3.0 browser phrase detector` 的最小执行阶段，但不具备直接启用真实本地自动唤醒运行时。

也就是说，当前可以通过右下角 GUI 显式点击 `start w3` 启用浏览器短语闭环；真实本地 keyword detector 仍是后续 `W3.1`。默认仍保持手动 `STT`，不会在应用启动后自动打开后台持续监听。

## 已补齐的前置条件

| 条件 | 状态 | 证据 |
| --- | --- | --- |
| W1 唤醒配置骨架 | 已满足 | `xiaozhi_style_wake_config.v1`，默认 `manual_click`、`wake_word.enabled=false`、`continuous_listen_enabled=false` |
| W2 VAD 预检 | 已满足 | `xiaozhi_style_vad_precheck.v1` 与 `check vad`，只做人声能量预检，不提交对话 |
| W3 adapter 契约插槽 | 已补齐 | `xiaozhi_style_wake_detector_adapter.v1` |
| W3 detector 状态插槽 | 已补齐 | `xiaozhi_style_wake_detector_state.v1` |
| UI 可观察状态位 | 已补齐并可执行 | 主体状态窗口设置区显示 `start w3/stop w3`、`w3 stage`、`window`、`gate wake pause` |
| 3D 粒子 OS 映射 | 已补齐并更新 | `voice.wake_detector_adapter` 子粒子，另新增 `voice.completion_notice` |
| 默认安全边界 | 已补齐 | `enabled=false`、`adapter_id=none`、`no_background_listening_until_user_confirmation`、`no_raw_audio_persistence` |
| 与原功能隔离 | 已满足 | 不改变文字输入、Chrome STT、本地 Whisper、CosyVoice/browser TTS 原路径 |

## 当前仍需用户确认的 W3 事项

1. detector adapter 选型：
   - `sherpa_onnx_reserved`：偏本地、离线、可控，适合后续做长期方案评估。
   - `openwakeword_reserved`：偏本地、开源方向，但中文自定义唤醒词需进一步评估。
   - `porcupine_reserved`：工程成熟度高，但授权、中文自定义词和闭源边界需确认。
   - `browser_phrase_match_reserved`：W3.0 已实现；依赖浏览器转写结果，不是真正低延迟本地唤醒词，只适合作为验证 fallback。
2. 默认唤醒短语：
   - 当前确认候选：`小张`、`高手`、`小天才`。
   - 不保留 `张博` 作为唤醒词。
3. 持续监听策略：
   - W3.0 已做用户显式开关，不默认常驻。
   - 命中后只打开 `wake_window_ms=8000` 的对话窗口。
4. 回声门控：
   - TTS 播放期间必须暂停唤醒词 detector。
   - 不能把“暂停唤醒词 detector”实现成“屏蔽全部输入”。
   - 输入链路和唤醒词 gate 必须明确分离：输入可以持续接收，唤醒词只负责是否打开对话窗口。
   - 最终目标是边播放 TTS 边接收用户信息；需要屏蔽的只是系统正在播放的内容，即 playback echo/content，而不是用户输入本身。
5. 隐私边界：
   - 默认不保存原始音频。
   - 如需保存短时诊断片段或训练样本，必须另开确认项和可见开关。

## W3 最小实现建议

第一步只实现 adapter 接口和一个可禁用的本地 detector 桥：

```text
microphone stream
  -> vad gate
  -> wake detector adapter
  -> wake_detected event
  -> wake window open
  -> existing STT path
```

不要在 W3 第一轮直接实现语义唤醒；语义唤醒属于 W4。

## W3 验收条件

- 默认启动后仍显示 `manual_click`，不会自动监听。
- 打开 W3 开关后，UI 必须显示 adapter、runtime、wake window 和 gate 状态。
- detector 命中只打开对话窗口，不直接把音频内容提交给模型。
- TTS 播放期间唤醒词 detector 必须暂停。
- TTS 播放期间不能把整条输入链路静音或屏蔽；只允许屏蔽系统播放内容形成的回声/自我转写。
- 输入链路、唤醒词 detector、STT 转写和模型提交必须分别有状态表达。
- 关闭 W3 开关后，麦克风 stream 必须停止。
- 保存原始音频必须是独立确认项，并且必须有可见开关；默认关闭。
- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 静态检索确认未创建 `requirement_packet.v1`，未写世界模型、人际图谱、事件图谱或外部动作通道。

## 当前边界

- 不启用真实唤醒词。
- 不启动后台持续监听。
- 不保存原始音频。
- 不接入世界模型写入。
- 不创建 `requirement_packet.v1`。
- 不改变现有 STT/TTS provider 路径。
