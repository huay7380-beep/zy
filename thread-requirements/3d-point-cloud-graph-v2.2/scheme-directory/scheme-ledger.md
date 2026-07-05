# 方案总账

状态：方案目录总账仍为草案；`SCHEME-0007` 已完成 Phase 1-6 首轮实现并通过基础验证。

本文件用于快速检查当前方案、来源、归属系统、确认状态和实现状态。

| Scheme ID | Source | Title | Primary System | Related Systems | Status | Implementation | Document |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SCHEME-0001` | `idea-0001`, `idea-0002` | 版本治理、想法池和想法推进规则 | version-governance | projection-contracts, world-system-3d-os | drafted | docs only, no code | `version-governance.v1.md`; `versions/idea-pool-promotion-plan.v1.md` |
| `SCHEME-0003` | `idea-0003` | 语音对话心跳、模块事件提醒和需求监督 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os | drafted | docs only, no code | `subject-status-dialogue-module/voice-dialogue-heartbeat-requirement-supervision-plan.v1.md` |
| `SCHEME-0004` | `idea-0004` | 语音对话延迟路径优化，高质量 TTS 优先 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts | drafted | docs only, no code | `subject-status-dialogue-module/voice-dialogue-latency-optimization-plan.v1.md` |
| `SCHEME-0005` | current-thread | 方案目录、方案状态检查和新目标归类入口 | scheme-directory | version-governance, projection-contracts | drafted | docs only, no code | `scheme-directory/README.md`; `scheme-directory/classification-rules.md`; `scheme-directory/status-dashboard.md` |
| `SCHEME-0006` | `idea-0006` | 小智式语音会话桥接路线 A 与唤醒词分阶段方案 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os | W3 prerequisites ready | minimal bridge implemented; W1/W2 implemented; W3 detector adapter contract, state slot, UI status and 3D mapping added; runtime wake still disabled | `subject-status-dialogue-module/voice-dialogue-xiaozhi-style-bridge-plan.v1.md`; `subject-status-dialogue-module/w3-detector-adapter-readiness.v1.md` |
| `SCHEME-0007` | `idea-0007` | 系统事件语音播报编排器与全系统反馈链路 | status-dialogue-system | voice-loop, runtime-integration, projection-contracts, world-system-3d-os, scheme-directory | implemented_phase_1_6 | Phase 1-6 implemented: event contracts, read-only status-events IPC, minimal voice event orchestration, event queue GUI, 3D nebula mapping, `system_feedback_route_manifest.v1`; `voice:event-broadcast:validate`, `typecheck` and `build` passed | `subject-status-dialogue-module/voice-event-broadcast-orchestrator-plan.v1.md`; `subject-status-dialogue-module/voice-event-broadcast-feedback-route-implementation-plan.v1.md`; `subject-status-dialogue-module/system-feedback-route-manifest.v1.md` |

## 当前重点

1. `SCHEME-0004` 需要用户确认高质量 TTS 优先原则和延迟优化阶段。
2. `SCHEME-0003` 需要用户确认心跳、模块事件提醒、关注度调整和进程监督边界。
3. `SCHEME-0005` 需要用户确认方案目录作为后续目标检查入口。
4. `SCHEME-0006` 已按用户确认的路线 A 完成最小 bridge、W1 配置骨架、W2 VAD 预检和 W3 前置契约；当前默认仍是手动点击 STT，真实自动唤醒运行时仍需确认 detector adapter 与唤醒词策略。
5. `SCHEME-0007` 已完成 Phase 1-6：事件契约、只读事件路由、最小语音事件编排器、事件队列 GUI、3D 映射和新增系统反馈路由清单；下一步是真实 GUI 复测、事件文件样例接入和与心跳监督方案联动。

## 版本关系

- 当前尚未占用 `0.0.01`。
- 当前所有新增内容仍为方案草案或索引文档。
- 用户确认后，才可按 `versions/idea-pool-promotion-plan.v1.md` 推进到 `0.0.XX.0`。
