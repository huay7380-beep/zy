# 输入错误与托盘关闭修复记录 2026-06-26

## 用户现象

- 通过右下角悬浮窗进行语音输入时仍出现输入错误。
- 右下角悬浮窗没有明显关闭入口。
- 需要在系统右下角隐藏栏/托盘中提供图标，右键可关闭悬浮窗。

## 检查结果

- 现有运行日志没有记录 renderer 侧输入错误堆栈。
- CosyVoice 服务仍正常。
- 本地 Whisper 脚本与 Python 环境存在。
- 使用已有测试音频验证本地 Whisper 可工作，返回成功转写结果。
- 当前代码在 Chrome STT Bridge 失败后会继续尝试 Electron 内置 SpeechRecognition，该路径容易返回 `network`，会造成用户看到输入错误。
- 主进程原来没有 Electron Tray，右下角悬浮窗只能通过窗口内按钮或 IPC 关闭。

## 修复内容

### 语音输入链路

新的输入回退顺序：

1. Chrome STT Bridge。
2. 本地 Whisper STT。
3. Electron/Browser SpeechRecognition。
4. 文字输入 fallback。

Chrome STT Bridge 未返回文字或 IPC 调用失败时，不再把它作为最终红色错误暴露，而是显示正在切换到本地 STT。

### 运行日志

新增主进程日志：

- `runtime/status-dialogue-logs/voice-flow-YYYYMMDD.jsonl`

记录事件：

- `chrome_stt_start`
- `chrome_stt_complete`
- `chrome_stt_launch_failed`
- `chrome_stt_bridge_failed`
- `local_stt_start`
- `local_stt_complete`
- `local_stt_failed`

日志只记录状态、错误摘要、耗时、事件列表和 transcript 长度，不记录原始音频、API key、完整 prompt 或隐藏推理。

### 系统托盘

新增 Electron Tray：

- 左键：打开右下角悬浮窗。
- 右键菜单：
  - 打开右下角悬浮窗
  - 关闭右下角悬浮窗
  - 打开 3D 粒子 OS
  - 关闭 3D 粒子 OS
  - 退出程序

## 验证

- `npm.cmd run typecheck` 通过。
- `npm.cmd run build` 通过。
- 本地 Whisper 测试音频转写通过。
- 已重启 Electron 开发进程，主进程与 renderer 进程已重新加载本次改动。
- CosyVoice 进程保持运行，未被本次重启中断。
- 托盘图标资源 `resources/icon.png` 存在，尺寸为 512x512。
- 启动日志未发现新的主进程崩溃、preload 崩溃或 IPC 注册失败。

## 复测观察点

- 语音输入失败时，先看界面是否显示 `LOCAL STT FALLBACK`。
- 复测后检查 `runtime/status-dialogue-logs/voice-flow-YYYYMMDD.jsonl`。
- 右下角系统隐藏栏应出现应用图标，右键可选择关闭悬浮窗。
