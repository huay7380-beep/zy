# Phase 5 final verification - 2026-06-23

状态：Phase 5 巡逻状态窗口 UI 已实现并完成最终验证。

## 本次补充验证

- 入口：`http://127.0.0.1:4178/?window=zhineng-graph`，只读静态预览构建产物。
- 桌面视口：`1440 x 960`。
- 移动视口：`390 x 844`。
- 右侧主体状态对话框已整理为巡逻状态窗口。
- 桌面和移动端均确认：
  - `Subject Status Dialogue` 面板存在。
  - `patrol_only`、模型来源、语音端口、状态摘要、边界闸口、巡逻发现、焦点摘要、对话日志、输入栏可见。
  - 面板位于视口内。
  - 输入栏位于面板内。
  - 页面无横向溢出。
  - 3D canvas 存在且尺寸非零。

## 布局修正

- 给 `.zg-graph-window` 和其直接子项补充 `min-width: 0`，防止移动端 grid item 被 header/canvas 最小内容宽度撑到约 600px。
- 给 `.zg-graph-stage` 补充 `min-width: 0`。
- 移动端 `.zg-status-dialogue` 改为更高的可用高度，保证完整巡逻窗口和输入栏不被挤出面板。
- 移动端语音端口改为更紧凑的内部布局，避免 `TTS browser_speech_synthesis` 挤压。

## 截图产物

- `D:\zhineng\sightflow-desktop-agent-main\out\particle-os-phase5-patrol-window-check.png`
- `D:\zhineng\sightflow-desktop-agent-main\out\particle-os-phase5-patrol-window-mobile-check.png`

## 像素检查

桌面截图：

- `width: 1440`
- `height: 960`
- `distinctSampleColors: 4491`
- `brightSamples: 7218`

移动截图：

- `width: 390`
- `height: 844`
- `distinctSampleColors: 4384`
- `brightSamples: 4266`

结论：截图非空白，3D 粒子 OS 与巡逻状态窗口均可见。

## 边界确认

本阶段仍保持：

- 不创建 `requirement_packet.v1`。
- 不写入世界模型。
- 不写入人际图谱或事件图谱。
- 不接真实 STT/TTS。
- 不调用麦克风或浏览器 `getUserMedia`。
- 不保存音频样本。
- 不启动外部动作通道。

## 已执行验证命令

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `rg "Phase 5|巡逻状态窗口|patrol window|zg-patrol|speech plugin ports|status_refs|missing_status" ...`
- `rg "requirement_packet\\.v1|whisper\\.cpp|FunASR|Kokoro|CosyVoice|mediaDevices|getUserMedia|audio_samples|writeFileSync\\([^\\n]*(status-snapshots|status-cards|audio)|mkdirSync\\([^\\n]*(status-snapshots|status-cards|audio)" src`

