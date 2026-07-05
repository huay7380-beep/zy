# 方案目录

状态：草案，等待用户确认后作为当前线程的方案检查入口启用。

用途：让用户和 Codex 能快速检查当前有哪些方案、方案属于哪个系统、是否已经确认、是否已经实现、后续应该进入想法池、已有版本迭代还是新的版本方案。

## 目录定位

本目录是“方案索引层”，不替代其他目录。

| 目录 | 职责 |
| --- | --- |
| `versions/idea-inbox.md` | 收集临时想法和补充需求，不占版本号 |
| `versions/` | 正式 `0.0.XX` 功能版本和迭代档案 |
| `subject-status-dialogue-module/` | 主体状态对话框模块的详细方案、实现记录和验证记录 |
| `scheme-directory/` | 跨方案索引、分类、状态检查和推进入口 |

## 文件

| File | 用途 |
| --- | --- |
| `scheme-ledger.md` | 当前方案总账，按方案编号记录状态、系统归属、实现情况和文档入口 |
| `classification-rules.md` | 新目标归类规则：属于哪个系统、是否需要版本号、是否只是已有功能小调整 |
| `status-dashboard.md` | 当前重点方案状态总览，方便用户检查“现在到哪了” |

## 检查顺序

当用户提出新目标或 Codex 需要检查当前方案状态时，按顺序读取：

1. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\README.md`
2. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\classification-rules.md`
3. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\scheme-ledger.md`
4. `D:\zhineng\thread-requirements\3d-point-cloud-graph-v2.2\scheme-directory\status-dashboard.md`
5. 相关模块目录或 `versions/idea-inbox.md`

## 状态定义

| Status | 含义 |
| --- | --- |
| `captured` | 已记录想法，还没有方案 |
| `drafted` | 已形成方案草案，等待用户确认 |
| `confirmed` | 用户已确认方案，可进入版本或实现计划 |
| `planned_version` | 已进入 `0.0.XX.0` 版本方案 |
| `in_progress` | 正在实现 |
| `implemented` | 已实现，验证未完全完成 |
| `verified` | 已通过验证，等待用户验收 |
| `accepted` | 用户确认通过 |
| `blocked` | 被明确阻塞 |
| `superseded` | 被后续方案替代 |

## 新目标处理流程

```text
user new target
  -> scheme-directory classification
  -> record/update idea-inbox
  -> update scheme-ledger
  -> if small adjustment: merge to existing scheme/version
  -> if new capability: prepare version_plan
  -> user confirmation
  -> implementation
```

## 边界

- 本目录只管理方案和状态，不写运行时状态。
- 本目录不占用 `0.0.XX` 版本号。
- 本目录不触发代码实现、外部动作或真实系统写入。
- 方案进入实现前仍必须按版本规则和模块边界确认。
