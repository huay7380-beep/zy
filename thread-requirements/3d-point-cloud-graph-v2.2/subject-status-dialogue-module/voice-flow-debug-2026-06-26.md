# 语音输入后无语音输出链路检查记录 2026-06-26

## 用户现象

- 通过右下角悬浮窗进行语音输入后，语音能够被识别成文字。
- 对话框有文字反馈。
- 没有听到音频输出。
- 反馈内容看起来没有达到主体状态对话框预期。

## 检查结论

底层模型和 TTS 服务均可用，问题在 renderer 语音输入回调到语音输出之间的状态读取链路。

## 已验证事实

- Electron 进程存在，音频服务进程存在。
- CosyVoice 服务 `http://127.0.0.1:8000/health` 返回 `ok`。
- DeepSeek 兼容模型 API 探针成功，约 1.1s 返回 JSON。
- CosyVoice 直接合成探针成功，生成正常 WAV。
- 用户测试后 CosyVoice 服务日志没有新增合成记录，说明悬浮窗 UI 没有发起 TTS 合成请求。

## 根因

`voiceEnabled` 默认是 `false`。语音输入路径会在识别开始时调用 `setVoiceEnabled(true)`，但随后同一轮异步回调继续使用点击时创建的旧 `submitDialogue/speakDialogue` 闭包。

这个旧闭包内读取到的仍是 `voiceEnabled=false`，因此 `speakDialogue` 会把本轮语音输出标记为 `voice output disabled`，不会调用 `zhineng:status-dialogue:tts:synthesize`，也就不会触发 CosyVoice。

## 修复

- 新增 `voiceEnabledRef` 保存最新语音输出开关。
- 新增 `setVoiceOutputEnabled`，同步更新 ref 和 React state。
- 所有 STT 成功路径与手动 voice 按钮改用 `setVoiceOutputEnabled`。
- `speakDialogue` 读取 `voiceEnabledRef.current`，避免同一轮语音输入后读到旧状态。

## 当前边界

- 没有修改 STT 识别实现。
- 没有修改 CosyVoice 服务。
- 没有修改模型 API 配置。
- 没有写入世界模型、人际图谱或事件图谱。
- 没有新增需求传递。

## 验证结果

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 检索确认旧 `setVoiceEnabled(` 调用已清空。
- DeepSeek 模型探针通过。
- CosyVoice 直接合成探针通过。

## 用户复测观察点

复测时关注右侧巡逻窗口：

- `voice` 应从 `off` 切到 `CosyVoice local default`。
- `trace` 应先出现 `ready`，播放结束后变为 `spoken`。
- CosyVoice 日志应新增 `synthesis text ...`。
- 如果仍无声音，看 `trace` 的错误摘要，而不是只看文字回复。
