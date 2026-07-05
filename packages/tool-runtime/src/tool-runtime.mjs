import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const SOCIAL_ASSISTANCE_CATEGORIES = new Set([
  'communication',
  'knowledge',
  'productivity',
  'web',
  'ai'
]);

const HIGH_RISK_WORDS = [
  'send',
  'message',
  'contacts',
  'meeting',
  'calendar',
  'todo',
  'docs',
  'workflow',
  'bot',
  'app',
  'write',
  'push',
  'sync'
];

function projectRoot() {
  return path.resolve(here, '../../..');
}

function nowIso() {
  return new Date().toISOString();
}

function slug(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'tool';
}

function createRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function textOf(...values) {
  return values.map((value) => String(value ?? '')).join(' ').toLowerCase();
}

function requireFields(record, fields, entityName) {
  const missing = fields.filter((field) => record[field] === undefined || record[field] === null || record[field] === '');
  if (missing.length) {
    throw new Error(`${entityName} missing required fields: ${missing.join(', ')}`);
  }
}

function inferRequiresCredentials(cli) {
  const text = textOf(cli.requires, cli.description, cli.install_notes);
  return /account|api key|token|secret|auth|login|credentials|workspace|project access/i.test(text);
}

function inferCanSendMessage(cli) {
  const text = textOf(cli.name, cli.display_name, cli.description);
  return cli.category === 'communication'
    && /message|bot|meeting|calendar|contacts|todos|docs|smart sheets|lark|feishu|wecom/i.test(text);
}

function inferCanModifyExternalState(cli) {
  const text = textOf(cli.description, cli.requires);
  return HIGH_RISK_WORDS.some((word) => text.includes(word))
    || ['communication', 'web', 'productivity', 'devops'].includes(cli.category);
}

function inferCanReadExternalData(cli) {
  const text = textOf(cli.description);
  return /search|read|list|browse|extract|manage|download|notes|docs|contacts|history|content/i.test(text)
    || ['knowledge', 'productivity', 'web', 'communication'].includes(cli.category);
}

function inferRiskLevel(capabilities) {
  if (capabilities.can_send_message || capabilities.can_modify_external_state) return 'high';
  if (capabilities.requires_credentials || capabilities.can_read_external_data) return 'medium';
  return 'low';
}

function defaultCliAnythingRegistryPath(root = projectRoot()) {
  return path.join(root, '1/CLI-Anything-main/public_registry.json');
}

export function loadCliAnythingRegistry({
  registryPath = defaultCliAnythingRegistryPath()
} = {}) {
  if (!existsSync(registryPath)) {
    return {
      found: false,
      registry_path: registryPath,
      meta: null,
      clis: [],
      warning: 'cli_anything_registry_not_found'
    };
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  return {
    found: true,
    registry_path: registryPath,
    meta: registry.meta ?? null,
    clis: registry.clis ?? []
  };
}

export function buildToolAdapterCapability(input) {
  requireFields(input, ['capability_id', 'provider', 'name', 'display_name'], 'ToolAdapterCapability');
  const capabilities = {
    can_read_external_data: false,
    can_modify_external_state: false,
    can_send_message: false,
    can_generate_artifact: false,
    supports_dry_run: true,
    requires_credentials: false,
    requires_user_confirmation: true,
    ...(input.capabilities ?? {})
  };
  const riskLevel = input.risk_level ?? inferRiskLevel(capabilities);

  return {
    schema_version: 'tool_adapter_capability.v1',
    capability_id: input.capability_id,
    provider: input.provider,
    name: input.name,
    display_name: input.display_name,
    category: input.category ?? 'custom',
    description: input.description ?? '',
    install: {
      package_manager: input.install?.package_manager ?? null,
      install_cmd: input.install?.install_cmd ?? null,
      npx_cmd: input.install?.npx_cmd ?? null,
      detect_cmd: input.install?.detect_cmd ?? null,
      entry_point: input.install?.entry_point ?? null,
      skill_md: input.install?.skill_md ?? null
    },
    capabilities,
    risk_level: riskLevel,
    allowed_use_cases: input.allowed_use_cases ?? [],
    blocked_use_cases: input.blocked_use_cases ?? [
      '未经用户确认真实发送消息',
      '未经授权读取外部账号数据',
      '绕过 RawEvent、审计和反馈回写直接影响决策'
    ],
    safety_notes: input.safety_notes ?? [
      '默认仅生成 dry-run 调用计划。',
      '真实外部执行必须另行完成授权、目标校验、用户确认和审计。'
    ],
    source_registry_ref: input.source_registry_ref ?? null,
    metadata: input.metadata ?? {}
  };
}

export function buildCliAnythingToolCapabilities(registry, {
  onlySocialAssistance = true
} = {}) {
  const clis = registry?.clis ?? [];
  return clis
    .filter((cli) => !onlySocialAssistance || SOCIAL_ASSISTANCE_CATEGORIES.has(cli.category))
    .map((cli) => {
      const capabilities = {
        can_read_external_data: inferCanReadExternalData(cli),
        can_modify_external_state: inferCanModifyExternalState(cli),
        can_send_message: inferCanSendMessage(cli),
        can_generate_artifact: ['ai', 'audio', 'music', 'web'].includes(cli.category),
        supports_dry_run: true,
        requires_credentials: inferRequiresCredentials(cli),
        requires_user_confirmation: true
      };
      return buildToolAdapterCapability({
        capability_id: `cli_anything.${slug(cli.name)}`,
        provider: 'cli_anything',
        name: cli.name,
        display_name: cli.display_name ?? cli.name,
        category: cli.category ?? 'unknown',
        description: cli.description ?? '',
        install: {
          package_manager: cli.package_manager ?? cli.install_strategy ?? null,
          install_cmd: cli.install_cmd ?? cli.install_notes ?? null,
          npx_cmd: cli.npx_cmd ?? null,
          detect_cmd: cli.detect_cmd ?? cli.entry_point ?? null,
          entry_point: cli.entry_point ?? null,
          skill_md: cli.skill_md ?? null
        },
        capabilities,
        allowed_use_cases: [
          '为社交辅助系统补充外部信息读取、资料整理、知识沉淀或受控平台动作预览',
          '把工具输出先转成 IntakeObservation 或 RawEvent，再进入人物、事件、决策和审计链路'
        ],
        source_registry_ref: {
          registry_path: registry.registry_path ?? null,
          registry_updated: registry.meta?.updated ?? null,
          source_url: cli.source_url ?? cli.homepage ?? null
        },
        metadata: {
          homepage: cli.homepage ?? null,
          requires: cli.requires ?? null
        }
      });
    });
}

function proposedCommandFor(capability, requestedAction) {
  if (requestedAction?.proposed_command) return requestedAction.proposed_command;
  const entry = capability.install?.npx_cmd ?? capability.install?.entry_point ?? capability.install?.detect_cmd;
  if (!entry) return null;
  const action = requestedAction?.action ?? '--help';
  return `${entry} ${action}`.trim();
}

function baseSafetyChecks({ capability, userConfirmed, connectorAuthorized, targetVerified }) {
  return [
    {
      check_id: 'dry_run_default',
      label: '默认 dry-run',
      passed: true,
      evidence: ['tool_runtime never executes external commands in v1 dry-run path']
    },
    {
      check_id: 'user_confirmation',
      label: '用户确认',
      passed: !capability.capabilities.requires_user_confirmation || userConfirmed === true,
      evidence: [`user_confirmed=${userConfirmed === true}`]
    },
    {
      check_id: 'connector_authorization',
      label: '外部连接器授权',
      passed: connectorAuthorized === true || !capability.capabilities.requires_credentials,
      evidence: [
        `requires_credentials=${capability.capabilities.requires_credentials}`,
        `connector_authorized=${connectorAuthorized === true}`
      ]
    },
    {
      check_id: 'target_verification',
      label: '目标对象或外部工作区校验',
      passed: targetVerified === true || !capability.capabilities.can_modify_external_state,
      evidence: [
        `can_modify_external_state=${capability.capabilities.can_modify_external_state}`,
        `target_verified=${targetVerified === true}`
      ]
    }
  ];
}

export function buildToolCallPlan({
  capability,
  purpose,
  requestedAction,
  targetContext = {},
  source = {},
  userConfirmed = false,
  connectorAuthorized = false,
  targetVerified = false,
  executionMode = 'dry_run',
  realExecutionAllowed = false,
  operator = 'system'
} = {}) {
  requireFields({ capability, purpose, requestedAction }, ['capability', 'purpose', 'requestedAction'], 'ToolCallPlanInput');
  requireFields(capability, ['capability_id', 'provider', 'name', 'display_name'], 'ToolAdapterCapability');
  const createdAt = nowIso();
  const safetyChecks = baseSafetyChecks({
    capability,
    userConfirmed,
    connectorAuthorized,
    targetVerified
  });
  const proposedCommand = proposedCommandFor(capability, requestedAction);

  return {
    schema_version: 'social_tool_call_plan.v1',
    plan_id: createRuntimeId('tool_plan'),
    created_at: createdAt,
    operator,
    capability_id: capability.capability_id,
    provider: capability.provider,
    tool_name: capability.name,
    tool_display_name: capability.display_name,
    purpose,
    requested_action: {
      action: requestedAction.action,
      input_summary: requestedAction.input_summary ?? '',
      proposed_command: proposedCommand,
      expected_output: requestedAction.expected_output ?? 'dry-run preview or structured tool output'
    },
    source: {
      decision_id: source.decision_id ?? null,
      trigger_id: source.trigger_id ?? null,
      event_id: source.event_id ?? null
    },
    target_context: targetContext,
    execution_mode: executionMode,
    real_execution_allowed: realExecutionAllowed === true,
    requires_user_confirmation: capability.capabilities.requires_user_confirmation !== false,
    user_confirmed: userConfirmed === true,
    connector_authorized: connectorAuthorized === true,
    target_verified: targetVerified === true,
    risk_level: capability.risk_level ?? inferRiskLevel(capability.capabilities ?? {}),
    safety_checks: safetyChecks,
    blocked_actions: inspectToolCallSafety({
      execution_mode: executionMode,
      real_execution_allowed: realExecutionAllowed === true,
      requires_user_confirmation: capability.capabilities.requires_user_confirmation !== false,
      user_confirmed: userConfirmed === true,
      connector_authorized: connectorAuthorized === true,
      target_verified: targetVerified === true,
      capability
    }).blocked_actions,
    audit_event: {
      event_type: 'tool_call_plan_created',
      result: 'planned',
      linked_decision_id: source.decision_id ?? null,
      linked_trigger_id: source.trigger_id ?? null,
      linked_event_id: source.event_id ?? null,
      capability_id: capability.capability_id,
      real_execution_allowed: realExecutionAllowed === true,
      created_at: createdAt
    }
  };
}

export function inspectToolCallSafety(planOrInput) {
  const capability = planOrInput.capability ?? {};
  const blockedActions = [];
  const executionMode = planOrInput.execution_mode ?? 'dry_run';
  const realExecutionAllowed = planOrInput.real_execution_allowed === true;
  const requiresUserConfirmation = planOrInput.requires_user_confirmation !== false;

  if (executionMode !== 'dry_run' && realExecutionAllowed !== true) {
    blockedActions.push({
      action: 'execute_external_tool',
      blocked_until: 'real_execution_allowed',
      reason: '工具真实执行未打开，当前只能生成计划或预览。'
    });
  }

  if (requiresUserConfirmation && planOrInput.user_confirmed !== true) {
    blockedActions.push({
      action: 'execute_external_tool',
      blocked_until: 'user_confirmation',
      reason: '工具调用需要用户确认。'
    });
  }

  if (capability.capabilities?.requires_credentials && planOrInput.connector_authorized !== true) {
    blockedActions.push({
      action: 'read_or_write_external_account',
      blocked_until: 'connector_authorization',
      reason: '外部账号或连接器尚未授权。'
    });
  }

  if (capability.capabilities?.can_modify_external_state && planOrInput.target_verified !== true) {
    blockedActions.push({
      action: 'modify_external_state',
      blocked_until: 'target_verification',
      reason: '尚未校验目标对象、窗口、工作区或外部资源。'
    });
  }

  if (capability.capabilities?.can_send_message && realExecutionAllowed !== true) {
    blockedActions.push({
      action: 'send_message',
      blocked_until: 'controlled_send_gate',
      reason: '消息发送类工具默认禁止真实发送，只允许 dry-run 预览。'
    });
  }

  return {
    safe_for_dry_run: true,
    safe_for_real_execution: blockedActions.length === 0 && realExecutionAllowed === true,
    blocked_actions: blockedActions,
    required_before_real_execution: unique(blockedActions.map((item) => item.blocked_until))
  };
}

export function runToolCallDryRun({
  plan,
  observedOutput = null,
  operator = 'system'
} = {}) {
  if (!plan) throw new Error('runToolCallDryRun requires plan');
  const safety = inspectToolCallSafety(plan);
  const blockedActions = (plan.blocked_actions ?? []).length
    ? plan.blocked_actions
    : safety.blocked_actions;
  const requiredBeforeRealExecution = unique([
    ...safety.required_before_real_execution,
    ...blockedActions.map((item) => item.blocked_until)
  ]);
  const checkedAt = nowIso();
  return {
    schema_version: 'social_tool_call_result.v1',
    result_id: createRuntimeId('tool_result'),
    plan_id: plan.plan_id,
    checked_at: checkedAt,
    operator,
    capability_id: plan.capability_id,
    provider: plan.provider,
    tool_name: plan.tool_name,
    execution_mode: 'dry_run',
    command_executed: false,
    real_execution_allowed: false,
    status: blockedActions.length
      ? 'previewed_blocked_before_execution'
      : 'preview_ready_no_external_execution',
    proposed_command: plan.requested_action?.proposed_command ?? null,
    observed_output: observedOutput,
    blocked_actions: blockedActions,
    required_before_real_execution: requiredBeforeRealExecution,
    evidence_refs: [
      `tool_plan:${plan.plan_id}`,
      'external_command_execution:false'
    ],
    audit_event: {
      event_type: 'tool_call_dry_run',
      result: blockedActions.length ? 'blocked_before_execution' : 'preview_ready',
      linked_plan_id: plan.plan_id,
      linked_decision_id: plan.source?.decision_id ?? null,
      linked_trigger_id: plan.source?.trigger_id ?? null,
      capability_id: plan.capability_id,
      command_executed: false,
      real_execution_allowed: false,
      checked_at: checkedAt
    }
  };
}
