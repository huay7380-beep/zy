# 想法池推进方案 v1

状态：草案，等待用户确认后作为版本治理规则的一部分启用。

目标：把用户临时提出的想法，从 `idea-inbox.md` 稳定推进到已有版本迭代或新的 `0.0.XX.0` 方案，避免多线程开发时出现重复建档、越界实现和接口冲突。

## 核心原则

- 想法池只负责承接和归类，不直接实现。
- 每条想法必须有主归属系统，必要时声明关联系统。
- 已实现功能的小调整，优先回到原版本做 `0.0.XX.N` 迭代。
- 新功能、跨模块、接口、状态读写、3D 映射、UI 结构化和边界变化，必须先进入 `0.0.XX.0` 方案。
- 任何想法在进入实现前，必须能回答：属于哪个系统、影响哪个版本、触碰哪些接口、如何验证、不做什么。

## 推进流程

```text
idea-inbox.md
  -> triage: 系统归属和触发项判断
  -> route:
       A. 已有功能小调整 -> existing version iteration
       B. 新能力或边界变化 -> new version plan
  -> promotion packet
  -> ledger reservation
  -> 0.0.XX.0 plan
  -> user confirmation
  -> 0.0.XX.1 implementation
```

## 第一步：Triage

每条想法进入想法池后，先补齐以下字段：

| Field | 说明 |
| --- | --- |
| `idea_id` | 例如 `idea-0002` |
| `primary_system` | 主归属系统，例如 `status-dialogue-system` |
| `related_systems` | 关联系统，例如 `voice-loop, projection-contracts` |
| `current_state` | 当前已有能力或缺口 |
| `user_goal` | 用户想达到的结果 |
| `entry_level` | `idea_capture`、`mini_alignment` 或 `version_plan` |
| `existing_version_candidate` | 如果属于已有功能，填写目标版本 |
| `promotion_triggers` | 触发新方案的原因 |
| `do_not_touch` | 当前阶段不允许影响的系统或文件 |

## 第二步：Route

### A. 回到已有版本

满足以下条件时，不新建 `0.0.XX`：

- 目标属于已经实现或已经建档的功能。
- 不新增跨模块接口。
- 不改变状态读写契约。
- 不改变 3D 星云拓扑或目录结构。
- 不改变 UI 主结构，只做小体验优化。
- 能通过一次已有版本迭代记录清楚。

执行方式：

1. 找到对应 `versions/0.0.XX/`。
2. 在该版本的 `implementation-log.md`、`changelog.md` 或 `open_questions/backlog` 中记录来源 `idea_id`。
3. 如果需要实现，新增 `iterations/0.0.XX.N.md`。
4. 验证后更新该版本的 evidence 和 acceptance 状态。
5. 在 `idea-inbox.md` 中把状态改为 `merged_to_existing_version`。

### B. 升级为新版本

出现任一触发项时，必须进入新的或已有的 `0.0.XX.0` 方案：

| Trigger | 含义 |
| --- | --- |
| `new_feature` | 新增用户可感知能力 |
| `cross_module` | 涉及多个模块或线程协作 |
| `interface_change` | 新增或改变 IPC、API、adapter、schema、配置 |
| `state_io` | 新增状态卡、快照、读写路径或运行时状态 |
| `3d_mapping` | 改变 3D 粒子 OS 星云、节点、目录、拓扑或映射 |
| `ui_structure` | 改变 UI 主结构、布局层级、面板职责 |
| `external_action` | 涉及外部工具、网络服务、设备或动作执行 |
| `boundary_change` | 改变安全边界、线程边界、系统边界或验收规则 |

执行方式：

1. 检查 `version-ledger.md` 和已有 `versions/0.0.XX/`，确认没有重复目标。
2. 找到下一个可用版本号。
3. 在 `version-ledger.md` 新增一行，状态先标记为 `proposed`。
4. 创建 `versions/0.0.XX/` 方案目录。
5. 编写 `plan.0.0.XX.0.md`、`scope-and-boundary.md`、`interface-map.md`、`verification-plan.md`。
6. 用户确认后，状态改为 `planned` 或 `in_progress`，再开始实现。
7. 在 `idea-inbox.md` 中把来源想法状态改为 `promoted_to_version_plan`。

## Promotion Packet

从想法池推进到版本前，必须先形成一份推进摘要，内容至少包括：

| Item | 必填 | 说明 |
| --- | --- | --- |
| `source_idea_ids` | 是 | 来源想法编号 |
| `primary_system` | 是 | 主归属系统 |
| `related_systems` | 否 | 关联系统 |
| `target_route` | 是 | `existing_version_iteration` 或 `new_version_plan` |
| `proposed_version` | 条件必填 | 新版本时填写，例如 `0.0.01` |
| `existing_version` | 条件必填 | 回到旧版本时填写 |
| `promotion_triggers` | 是 | 触发原因 |
| `interface_impact` | 是 | 是否影响接口 |
| `state_io_impact` | 是 | 是否影响状态读写 |
| `3d_mapping_impact` | 是 | 是否影响 3D 映射 |
| `ui_structure_impact` | 是 | 是否影响 UI 结构 |
| `boundary` | 是 | 当前不做什么 |
| `verification` | 是 | 验证方式 |

## 版本号领取规则

领取新版本号时：

1. 先读 `version-ledger.md`，找到最大已占用 `0.0.XX`。
2. 选择下一个未占用编号。
3. 如果两个线程同时领取，以先写入 `version-ledger.md` 的为准。
4. 后写入线程必须改为依赖版本或合并到已有版本。
5. 领取后不能直接实现，只能先建立 `0.0.XX.0` 方案。

## 3D 粒子 OS 映射规则

如果想法触发 `3d_mapping`，方案必须说明：

- 星云归属：`domain_id`
- 节点编号：`node_id`
- 父子层级：`parent_node_id`
- 输入端：`input_refs`
- 输出端：`output_refs`
- 负责人：`owner`
- 闸口：`gate`
- 边界：`boundary`
- 目录查询入口：`directory_ref`

没有这些字段时，不允许进入 3D 粒子 OS 实现。

## 对用户工作方式的适配

用户可以继续自由补充想法。线程负责把想法整理成以下三种结果之一：

1. 暂存：继续留在 `idea-inbox.md`。
2. 合并：归入已有版本的下一次迭代。
3. 升级：创建新的 `0.0.XX.0` 方案等待确认。

这样既保留快速发散，又保证真正实现时有边界、有版本、有验证。
