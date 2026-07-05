const lenses = [
  { id: "system", label: "系统 Lens", enabled: true, color: "#49b6a8", note: "静态模块底图", expression: "static" },
  { id: "thinking", label: "思维流 Lens", enabled: true, color: "#f2b84b", note: "目标激活与流动路径", expression: "dynamic" },
  { id: "memory", label: "记忆 Lens", enabled: false, color: "#7aa7ff", note: "时间轴与证据引用", expression: "mixed" },
  { id: "decision", label: "决策 Lens", enabled: false, color: "#ee6b62", note: "候选方案、风险、冲突", expression: "dynamic" },
  { id: "self", label: "自我状态 Lens", enabled: false, color: "#b58cff", note: "策略、权限、边界", expression: "mixed" }
];

const camera = {
  yaw: -0.48,
  pitch: 0.42,
  zoom: 1,
  distance: 3.25
};

const homeCamera = { ...camera };
const topCamera = { yaw: 0, pitch: 1.12, zoom: 0.96, distance: 3.25 };

const regions = [
  {
    id: "perception",
    label: "输入 / 感知区",
    x: -0.78,
    y: -0.18,
    z: -0.12,
    w: 0.44,
    h: 0.44,
    activeFor: ["thinking"],
    moduleIds: ["external-world", "perception-fusion", "event-extraction"]
  },
  {
    id: "memory",
    label: "记忆 / 证据区",
    x: -0.36,
    y: 0.48,
    z: -0.28,
    w: 0.5,
    h: 0.42,
    activeFor: ["memory", "thinking"],
    moduleIds: ["global-events", "world-state", "world-model", "learning-engine", "feedback-memory"]
  },
  {
    id: "reasoning",
    label: "推理 / 规划区",
    x: -0.02,
    y: -0.52,
    z: 0.18,
    w: 0.52,
    h: 0.38,
    activeFor: ["thinking"],
    moduleIds: ["social-cognition", "relationship-policy", "forecast-simulation"]
  },
  {
    id: "decision",
    label: "决策 / 风险区",
    x: 0.58,
    y: -0.14,
    z: 0.18,
    w: 0.46,
    h: 0.42,
    activeFor: ["decision", "thinking"],
    moduleIds: ["decision-governance", "safety-scope"]
  },
  {
    id: "execution",
    label: "执行 / 反馈区",
    x: 0.48,
    y: 0.46,
    z: -0.12,
    w: 0.48,
    h: 0.36,
    activeFor: ["decision", "thinking"],
    moduleIds: ["capability-composition", "action-layer", "entity-work-nodes"]
  },
  {
    id: "self",
    label: "自我 / 边界区",
    x: -0.02,
    y: 0.08,
    z: 0.5,
    w: 0.46,
    h: 0.38,
    activeFor: ["self", "decision"],
    moduleIds: ["status-dialogue-system", "visual-os", "projection-contracts"]
  }
];

const nodes = [
  node("goal-core", "system", "目标核心", "goal_core", "核心", "static", true, 0, 0, 0.74, 32, 98, 92, 88, "世界系统核心；独立视觉投影，不写入事实源"),
  node("projection-port", "system", "Projection 输入", "input_port", "端口", "static", true, -1.05, 0.18, -0.28, 13, 74, 88, 34, "graph_projection_vnext.v1"),
  node("intent-port", "system", "Intent 输出", "output_port", "端口", "static", true, 1.02, 0.18, -0.28, 13, 76, 86, 32, "visual_operation_intent.v1"),

  hub("perception-hub", "输入感知区", "perception", -0.78, -0.18, -0.02),
  hub("memory-hub", "记忆证据区", "memory", -0.36, 0.48, -0.16),
  hub("reasoning-hub", "推理规划区", "reasoning", -0.02, -0.52, 0.3),
  hub("decision-hub", "决策风险区", "decision", 0.58, -0.14, 0.3),
  hub("execution-hub", "执行反馈区", "execution", 0.48, 0.46, 0.02),
  hub("self-hub", "自我边界区", "self", -0.02, 0.08, 0.62),

  originalModule("external-world", "外部世界来源", "perception", "世界输入层", "perception", -0.93, -0.3, -0.2, 15, "所有外部来源先作为观测入口进入系统"),
  originalModule("perception-fusion", "感知与融合", "perception", "观测对齐层", "perception", -0.78, -0.1, 0.04, 16, "Observation Atom、Fusion Bundle、冲突与潜变量"),
  originalModule("event-extraction", "事件抽取层", "event", "事件结构化", "perception", -0.62, -0.29, -0.05, 15, "把观测转成谁、何时、何地、做了什么"),

  originalModule("global-events", "全域事件图谱", "event", "变化记录层", "memory", -0.52, 0.38, -0.34, 14, "社会、物理、学习、实验、决策、行动和反馈事件"),
  originalModule("world-state", "世界状态模型", "state", "核心状态层", "memory", -0.36, 0.5, -0.1, 17, "事件描述变化，状态描述变化后的世界"),
  originalModule("world-model", "多域世界图谱", "world_model", "事实组织层", "memory", -0.2, 0.4, -0.22, 16, "多域事实、任务、知识、能力、预测和反馈图谱"),
  originalModule("learning-engine", "学习引擎", "learning", "规则内化层", "memory", -0.48, 0.62, -0.16, 13, "把经验、规则和失败条件内化为可检索结构"),
  originalModule("feedback-memory", "反馈与记忆", "feedback", "校准回路", "memory", -0.18, 0.62, -0.28, 14, "结果、偏差、策略修正和知识更新"),

  originalModule("social-cognition", "人际辅助接入位", "social", "未来真实子系统", "reasoning", -0.18, -0.64, 0.16, 15, "现有人际关系辅助系统的只读投影位置"),
  originalModule("relationship-policy", "关系策略层", "social", "策略分配器", "reasoning", 0.02, -0.42, 0.34, 14, "关系策略桶、权限等级和处理目标"),
  originalModule("forecast-simulation", "可能性预测", "forecast", "未来分支层", "reasoning", 0.16, -0.64, 0.28, 15, "变量、影响边、未来分支和反事实试跑"),

  originalModule("decision-governance", "决策与意志治理", "decision", "目标选择层", "decision", 0.48, -0.28, 0.34, 17, "候选策略、风险审查、意志评分和最终选择"),
  originalModule("safety-scope", "安全范围治理", "safety", "范围版本层", "decision", 0.72, -0.02, 0.18, 16, "安全评估范围、版本修订和审查结果"),

  originalModule("capability-composition", "能力拼接与沙盒", "capability", "外部能力层", "execution", 0.32, 0.38, 0.02, 15, "外部软件、工具、代码、API 的能力候选"),
  originalModule("action-layer", "行动与工具", "action", "执行候选层", "execution", 0.64, 0.52, -0.08, 16, "工具调用、提醒、文档生成和受控执行候选"),
  workNebula("entity-work-nodes", "实体工作节点", "execution", 0.5, 0.72, 0.1, 20, "实体业务项目星云目录；点击展开当前已登记的实体项目粒子云"),

  originalModule("status-dialogue-system", "系统主体状态对话系统", "dialogue", "全局状态只读问答", "self", -0.18, 0.02, 0.66, 15, "状态快照、模型问答、语音和只读边界"),
  originalModule("visual-os", "三维粒子操作层", "visual", "视觉操作面", "self", 0.08, 0.0, 0.62, 16, "观察、下钻、比较、模拟和可审查意图"),
  originalModule("projection-contracts", "投影与意图契约", "visual", "接口契约层", "self", 0.02, 0.22, 0.46, 14, "graph_projection_vnext 与 visual_operation_intent"),

  workCloudNode("cross-border-ecommerce-route", "跨境电商通路", "project_summary", "theory_design_only", -0.02, 0.87, 0.22, 16, 88, "cross-border-ecommerce-ai-route/nodes/process-manifest.json", "实体工作节点中的子项目；已完成理论方案、节点目录、模板和只读调度 manifest"),
  workCloudNode("cbx-strategy-scope", "经营策略范围", "strategy", "draft", -0.16, 0.73, 0.36, 10, 72, "docs/00-overview.md", "业务模式、目标市场、预算边界、首期指标和不可自动执行边界"),
  workCloudNode("cbx-entity-compliance", "大陆主体合规", "compliance", "draft", -0.24, 0.75, 0.28, 10, 70, "docs/01-mainland-compliance.md", "营业执照、银行、税务、海关、电子口岸、外汇、ICP、数据合规清单"),
  workCloudNode("cbx-product-compliance", "产品合规准入", "compliance", "draft", -0.38, 0.9, 0.1, 10, 70, "docs/01-mainland-compliance.md", "HS code 候选、目标国认证、标签、包装、知识产权和禁限售风险"),
  workCloudNode("cbx-market-selection", "市场与客户画像", "strategy", "draft", -0.28, 1.06, -0.04, 10, 68, "docs/04-acquisition-and-promotion.md", "目标国家、客户类型、采购触发和渠道优先级"),
  workCloudNode("cbx-independent-site", "独立站/RFQ", "site", "draft", -0.04, 1.12, -0.1, 12, 76, "docs/02-independent-site-and-data.md", "独立站结构、产品页、RFQ 表单、事件采集和合规页面"),
  workCloudNode("cbx-content-assets", "产品图文视频", "content", "draft", 0.22, 1.06, -0.04, 10, 72, "docs/03-product-content-photo.md", "主图、细节图、场景图、视频、证据图和英文资料包"),
  workCloudNode("cbx-catalog-pricing", "目录与价格本", "commercial", "draft", 0.34, 0.88, 0.08, 10, 76, "templates/product-master-record.template.json", "ProductMaster、PriceBook、成本、MOQ、数量阶梯和毛利红线"),
  workCloudNode("cbx-acquisition", "推广获客", "growth", "draft", 0.22, 0.7, 0.22, 11, 74, "docs/04-acquisition-and-promotion.md", "SEO、Google、LinkedIn、Meta、邮件、WhatsApp、展会和平台获客"),
  workCloudNode("cbx-lead-capture", "线索入库", "sales", "draft", -0.02, 0.66, 0.3, 10, 72, "templates/inquiry-intake.template.json", "RFQ、广告表单、邮箱、聊天和名片统一为可评分线索"),
  workCloudNode("cbx-inquiry-reception", "询盘接待", "sales", "draft", -0.18, 0.56, 0.14, 11, 78, "docs/05-inquiry-quote-sales.md", "识别客户需求、缺口问题、首响草案和跟进计划"),
  workCloudNode("cbx-quote-engine", "报价引擎", "sales", "draft", 0.14, 0.54, 0.12, 12, 80, "templates/quotation.template.md", "基于产品、成本、运费、条款和风险生成报价草案"),
  workCloudNode("cbx-contract-payment", "PI/合同/收款", "finance", "draft", 0.38, 0.6, -0.02, 10, 74, "docs/06-fulfillment-finance-after-sales.md", "PI、合同、付款说明、到账和外汇资料门禁"),
  workCloudNode("cbx-fulfillment", "订单履约", "fulfillment", "draft", 0.46, 0.78, -0.18, 11, 74, "docs/06-fulfillment-finance-after-sales.md", "生产、QC、包装、物流订舱、发货和到货状态"),
  workCloudNode("cbx-customs-tax-fx", "报关税务外汇", "compliance", "draft", 0.34, 0.98, -0.28, 10, 72, "docs/01-mainland-compliance.md", "报关资料、退免税、收汇、外汇申报和单证一致性"),
  workCloudNode("cbx-after-sales-retention", "售后复购", "customer_success", "draft", 0.04, 1.02, -0.34, 10, 70, "docs/08-customer-ai-examples.md", "到货确认、客诉、满意度、复购提醒和客户维护"),
  workCloudNode("cbx-audit-learning", "审计复盘", "audit", "draft", -0.22, 0.96, -0.26, 10, 72, "docs/09-roadmap-acceptance.md", "渠道 ROI、报价命中、订单证据、风险台账和优化动作"),

  node("active-goal", "thinking", "当前问题", "active_focus", "动态思维", "dynamic", false, -0.12, -0.18, 0.92, 15, 94, 82, 98, "只作为显示焦点"),
  node("past-snapshot", "memory", "历史证据", "past_event", "时间层", "static_reference", false, -0.62, 0.72, -0.62, 12, 58, 78, 34, "source ref，不等于实时事实写入"),
  node("current-state", "memory", "当前状态", "current_state", "时间层", "static_reference", false, -0.36, 0.7, 0.02, 13, 72, 84, 52, "status projection"),
  node("future-branch", "memory", "未来分支", "forecast_branch", "时间层", "forecast", false, 0.06, 0.72, 0.6, 13, 66, 56, 42, "预测，不是 confirmed fact"),
  node("option-a", "decision", "只读接入方案", "candidate", "决策候选", "dynamic", false, 0.42, -0.46, 0.5, 13, 72, 74, 60, "preview only"),
  node("option-b", "decision", "受控意图回传", "candidate", "决策候选", "dynamic", false, 0.74, -0.36, 0.42, 14, 78, 69, 66, "requires confirmation"),
  node("risk-node", "decision", "接入风险", "risk", "风险", "dynamic", false, 0.82, 0.14, 0.22, 14, 86, 82, 70, "必须经过 review gate"),
  node("policy-node", "self", "只读策略", "policy", "自我约束", "static_policy", false, -0.25, 0.18, 0.72, 12, 84, 96, 48, "read-only"),
  node("capability-node", "self", "可用能力", "capability", "自我约束", "static_policy", false, 0.22, 0.28, 0.68, 12, 70, 80, 44, "intent only"),
  node("blocked-action", "self", "禁止直写", "blocked_action", "自我约束", "blocked", false, 0.08, -0.1, 0.74, 12, 88, 98, 38, "blocked")
];

const edges = [
  edge("projection-port", "external-world", "system", "association"),
  edge("external-world", "perception-fusion", "system", "association"),
  edge("perception-fusion", "event-extraction", "system", "association"),
  edge("event-extraction", "global-events", "system", "association"),
  edge("global-events", "world-state", "system", "association"),
  edge("world-state", "world-model", "system", "association"),
  edge("world-model", "social-cognition", "system", "association"),
  edge("social-cognition", "relationship-policy", "system", "association"),
  edge("relationship-policy", "forecast-simulation", "system", "association"),
  edge("forecast-simulation", "decision-governance", "system", "association"),
  edge("decision-governance", "capability-composition", "system", "association"),
  edge("capability-composition", "action-layer", "system", "association"),
  edge("action-layer", "entity-work-nodes", "system", "association"),
  edge("entity-work-nodes", "cross-border-ecommerce-route", "system", "association"),
  edge("cross-border-ecommerce-route", "cbx-strategy-scope", "system", "association"),
  edge("cbx-strategy-scope", "cbx-entity-compliance", "system", "association"),
  edge("cbx-entity-compliance", "cbx-product-compliance", "system", "association"),
  edge("cbx-product-compliance", "cbx-market-selection", "system", "association"),
  edge("cbx-market-selection", "cbx-independent-site", "system", "association"),
  edge("cbx-independent-site", "cbx-content-assets", "system", "association"),
  edge("cbx-content-assets", "cbx-catalog-pricing", "system", "association"),
  edge("cbx-catalog-pricing", "cbx-acquisition", "system", "association"),
  edge("cbx-acquisition", "cbx-lead-capture", "system", "association"),
  edge("cbx-lead-capture", "cbx-inquiry-reception", "system", "association"),
  edge("cbx-inquiry-reception", "cbx-quote-engine", "system", "association"),
  edge("cbx-quote-engine", "cbx-contract-payment", "system", "association"),
  edge("cbx-contract-payment", "cbx-fulfillment", "system", "association"),
  edge("cbx-fulfillment", "cbx-customs-tax-fx", "system", "association"),
  edge("cbx-customs-tax-fx", "cbx-after-sales-retention", "system", "association"),
  edge("cbx-after-sales-retention", "cbx-audit-learning", "system", "association"),
  edge("cbx-audit-learning", "cross-border-ecommerce-route", "system", "feedback", true, "4.2s"),
  edge("action-layer", "feedback-memory", "system", "association"),
  edge("feedback-memory", "intent-port", "system", "association"),
  edge("visual-os", "projection-contracts", "system", "evidence"),
  edge("projection-contracts", "status-dialogue-system", "system", "evidence"),
  edge("safety-scope", "decision-governance", "system", "evidence"),

  edge("goal-core", "active-goal", "thinking", "causal", true, "2.5s"),
  edge("active-goal", "external-world", "thinking", "causal", true, "2.8s"),
  edge("external-world", "perception-fusion", "thinking", "causal", true, "3s"),
  edge("perception-fusion", "event-extraction", "thinking", "causal", true, "3.1s"),
  edge("event-extraction", "world-state", "thinking", "causal", true, "3.2s"),
  edge("world-state", "world-model", "thinking", "causal", true, "3.2s"),
  edge("world-model", "forecast-simulation", "thinking", "causal", true, "3s"),
  edge("forecast-simulation", "decision-governance", "thinking", "causal", true, "3s"),
  edge("decision-governance", "action-layer", "thinking", "feedback", true, "3.4s"),

  edge("past-snapshot", "global-events", "memory", "evidence"),
  edge("global-events", "world-state", "memory", "evidence"),
  edge("world-state", "current-state", "memory", "evidence"),
  edge("current-state", "future-branch", "memory", "feedback", true, "4s"),
  edge("feedback-memory", "learning-engine", "memory", "feedback", true, "3.8s"),

  edge("decision-governance", "option-a", "decision", "causal", true, "2.4s"),
  edge("decision-governance", "option-b", "decision", "causal", true, "2.6s"),
  edge("option-a", "safety-scope", "decision", "conflict"),
  edge("option-b", "risk-node", "decision", "conflict"),
  edge("risk-node", "safety-scope", "decision", "conflict"),
  edge("safety-scope", "visual-os", "decision", "conflict"),

  edge("visual-os", "policy-node", "self", "association"),
  edge("projection-contracts", "capability-node", "self", "feedback"),
  edge("policy-node", "blocked-action", "self", "conflict"),
  edge("blocked-action", "intent-port", "self", "conflict")
];

const lensState = new Map(lenses.map((lens) => [lens.id, lens.enabled]));
let selectedNodeId = null;
let activeCloudId = null;
let isDragging = false;
let dragStart = { x: 0, y: 0, yaw: camera.yaw, pitch: camera.pitch };

const controlsEl = document.querySelector("#lensControls");
const regionLayer = document.querySelector("#regionLayer");
const edgeLayer = document.querySelector("#edgeLayer");
const nodeLayer = document.querySelector("#nodeLayer");
const stage = document.querySelector("#stage");
const inspector = document.querySelector("#inspector");
const visibleCount = document.querySelector("#visibleCount");
const cameraState = document.querySelector("#cameraState");
const resetButton = document.querySelector("#resetView");
const pulseButton = document.querySelector("#pulseFlow");
const viewHomeButton = document.querySelector("#viewHome");
const viewTopButton = document.querySelector("#viewTop");

function node(id, lens, label, role, category, expression, isStatic, x, y, z, size, importance, confidence, activation, boundary) {
  return { id, lens, label, role, category, expression, static: isStatic, x, y, z, size, importance, confidence, activation, boundary };
}

function hub(id, label, region, x, y, z) {
  return {
    ...node(id, "system", label, "region_hub", "分类区域", "static", true, x, y, z, 18, 78, 88, 44, `${region} classification region`),
    region,
    source: "3d-particle-display-os classification"
  };
}

function originalModule(id, label, kind, status, region, x, y, z, size, detail) {
  return {
    ...node(id, "system", label, kind, "原系统模块", "static_module", true, x, y, z, size, 82, 84, 48, detail),
    region,
    source: "sightflow-desktop-agent-main/src/renderer/src/zhineng-console/ZhinengConsole.tsx:WORLD_SYSTEM_NEBULAE",
    status
  };
}

function workNebula(id, label, region, x, y, z, size, detail) {
  return {
    ...node(id, "system", label, "entity_work_nebula", "实体星云", "static_work_nebula", true, x, y, z, size, 90, 92, 66, detail),
    region,
    status: "entity_project_directory",
    source: "cross-border-ecommerce-ai-route/os-particle-projection.json",
    drillDownCloudId: id,
    cloudSummary: "当前包含 1 个实体业务子项目：跨境电商 AI 自动化通路。"
  };
}

function workCloudNode(id, label, role, status, x, y, z, size, importance, sourceRef, detail) {
  return {
    ...node(id, "system", label, role, "实体工作子项目", "project_particle", true, x, y, z, size, importance, 88, status === "theory_design_only" ? 82 : 58, detail),
    region: "execution",
    status,
    source: `cross-border-ecommerce-ai-route/${sourceRef}`,
    cloud: "entity-work-nodes",
    parent: "entity-work-nodes",
    projectId: "cross_border_ecommerce_ai_route"
  };
}

function edge(from, to, lens, type, dynamic = false, duration = "3s") {
  return { from, to, lens, type, dynamic, duration };
}

function lensNodeCount(lensId) {
  return nodes.filter((item) => item.lens === lensId).length;
}

function dynamicLensActive() {
  return lenses.some((lens) => lens.id !== "system" && lensState.get(lens.id));
}

function activeLensIds() {
  return new Set([...lensState.entries()].filter((entry) => entry[1]).map((entry) => entry[0]));
}

function shouldShowNode(item) {
  if (item.cloud) {
    return activeCloudId === item.cloud && (lensState.get(item.lens) || dynamicLensActive());
  }

  if (item.static) {
    return lensState.get("system") || dynamicLensActive();
  }

  return lensState.get(item.lens);
}

function renderControls() {
  controlsEl.innerHTML = "";

  for (const lens of lenses) {
    const label = document.createElement("label");
    label.className = "lens-toggle";
    label.style.color = lens.color;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = lensState.get(lens.id);
    input.addEventListener("change", () => {
      lensState.set(lens.id, input.checked);
      render();
    });

    const copy = document.createElement("div");
    copy.className = "lens-copy";
    copy.innerHTML = `<strong>${lens.label}</strong><span>${lens.note}</span>`;

    const count = document.createElement("span");
    count.className = "lens-count";
    count.textContent = lensNodeCount(lens.id);

    label.append(input, copy, count);
    controlsEl.append(label);
  }
}

function stageMetrics() {
  const rect = stage.getBoundingClientRect();
  const base = Math.min(rect.width, rect.height) * 0.43;
  return { width: rect.width, height: rect.height, base };
}

function rotatePoint(point) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const y2 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}

function projectPoint(point) {
  const { width, height, base } = stageMetrics();
  const rotated = rotatePoint(point);
  const perspective = camera.distance / Math.max(1.2, camera.distance - rotated.z);
  const depth = perspective * camera.zoom;
  return {
    x: width / 2 + rotated.x * base * depth,
    y: height / 2 + rotated.y * base * depth,
    z: rotated.z,
    depth
  };
}

function project(item) {
  return projectPoint(item);
}

function regionCorners(region) {
  const hw = region.w / 2;
  const hh = region.h / 2;
  return [
    { x: region.x - hw, y: region.y - hh, z: region.z },
    { x: region.x + hw, y: region.y - hh, z: region.z },
    { x: region.x + hw, y: region.y + hh, z: region.z },
    { x: region.x - hw, y: region.y + hh, z: region.z }
  ];
}

function renderRegions() {
  regionLayer.innerHTML = "";
  const { width, height } = stageMetrics();
  regionLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const showContext = lensState.get("system") || dynamicLensActive();
  const active = activeLensIds();

  if (!showContext) {
    return;
  }

  for (const region of regions) {
    const corners = regionCorners(region).map(projectPoint);
    const center = projectPoint(region);
    const isActive = region.activeFor.some((lensId) => active.has(lensId));

    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", corners.map((corner) => `${corner.x},${corner.y}`).join(" "));
    polygon.setAttribute("class", `region-plane${lensState.get("system") ? "" : " is-context"}${isActive ? " is-active" : ""}`);
    regionLayer.append(polygon);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(center.x));
    label.setAttribute("y", String(center.y));
    label.setAttribute("class", "region-label");
    label.textContent = region.label;
    regionLayer.append(label);
  }
}

function makeEdgePath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = Math.min(84, Math.max(18, Math.hypot(dx, dy) * 0.13));
  const c1x = from.x + dx * 0.34;
  const c1y = from.y + dy * 0.34 - bend;
  const c2x = from.x + dx * 0.66;
  const c2y = from.y + dy * 0.66 + bend;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

function appendFlowDot(pathId, item, index) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("r", item.type === "conflict" ? "3.4" : "4.4");
  circle.setAttribute("class", `flow-dot lens-${item.lens}`);

  const motion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
  motion.setAttribute("dur", item.duration || "3s");
  motion.setAttribute("begin", `${(index % 5) * 0.24}s`);
  motion.setAttribute("repeatCount", "indefinite");
  motion.setAttribute("rotate", "auto");

  const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
  mpath.setAttribute("href", `#${pathId}`);
  mpath.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${pathId}`);

  motion.append(mpath);
  circle.append(motion);
  edgeLayer.append(circle);
}

function renderEdges(visibleItems) {
  edgeLayer.innerHTML = "";
  const { width, height } = stageMetrics();
  edgeLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const active = activeLensIds();
  const visibleIds = new Set(visibleItems.map((item) => item.id));
  let dynamicIndex = 0;

  for (const item of edges) {
    if (!active.has(item.lens) || !visibleIds.has(item.from) || !visibleIds.has(item.to)) {
      continue;
    }

    const fromNode = nodes.find((nodeItem) => nodeItem.id === item.from);
    const toNode = nodes.find((nodeItem) => nodeItem.id === item.to);
    const from = project(fromNode);
    const to = project(toNode);
    const pathId = `edge-${item.from}-${item.to}-${item.lens}`.replace(/[^a-zA-Z0-9-_]/g, "-");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("id", pathId);
    path.setAttribute("d", makeEdgePath(from, to));
    path.setAttribute("class", `edge ${item.type} lens-${item.lens}${item.dynamic ? " is-dynamic" : ""}`);
    edgeLayer.append(path);

    if (item.dynamic) {
      appendFlowDot(pathId, item, dynamicIndex);
      dynamicIndex += 1;
    }
  }
}

function renderNodes(visibleItems) {
  nodeLayer.innerHTML = "";
  const sorted = [...visibleItems].sort((a, b) => project(a).z - project(b).z);

  for (const item of sorted) {
    const point = project(item);
    const particle = document.createElement("button");
    particle.type = "button";
    particle.className = [
      "particle",
      `lens-${item.lens}`,
      item.static ? "static-node" : "dynamic-node",
      item.category === "原系统模块" ? "source-node" : "",
      item.category === "实体星云" ? "entity-nebula-node" : "",
      item.cloud ? "work-cloud-node" : "",
      item.static && !lensState.get("system") ? "context-node" : "",
      item.id === "goal-core" ? "core-node" : ""
    ]
      .filter(Boolean)
      .join(" ");
    particle.dataset.label = item.label;
    particle.dataset.nodeId = item.id;
    particle.style.left = `${point.x}px`;
    particle.style.top = `${point.y}px`;
    particle.style.width = `${item.size * point.depth}px`;
    particle.style.height = `${item.size * point.depth}px`;
    particle.style.opacity = String(Math.max(item.static ? 0.52 : 0.5, item.confidence / 100));
    particle.style.zIndex = String(Math.round(100 + point.z * 60));
    particle.setAttribute("aria-label", `${item.label}, ${item.role}`);

    if (item.id === selectedNodeId) {
      particle.classList.add("is-selected");
    }

    particle.addEventListener("click", () => {
      selectedNodeId = item.id;
      if (item.drillDownCloudId) {
        activeCloudId = activeCloudId === item.drillDownCloudId ? null : item.drillDownCloudId;
      }
      if (item.cloud) {
        activeCloudId = item.cloud;
      }
      render();
      updateInspector(item);
    });

    nodeLayer.append(particle);
  }
}

function visibleNodes() {
  return nodes.filter(shouldShowNode);
}

function updateCameraState() {
  cameraState.textContent = `Yaw ${Math.round((camera.yaw * 180) / Math.PI)}° · Pitch ${Math.round((camera.pitch * 180) / Math.PI)}° · Zoom ${camera.zoom.toFixed(2)}x`;
}

function render() {
  const visible = visibleNodes();
  visibleCount.textContent = activeCloudId ? `${visible.length} nodes · 实体工作节点已展开` : `${visible.length} nodes`;
  renderRegions();
  renderEdges(visible);
  renderNodes(visible);
  updateCameraState();

  if (selectedNodeId && !visible.some((item) => item.id === selectedNodeId)) {
    selectedNodeId = null;
    showEmptyInspector();
  }
}

function showEmptyInspector() {
  inspector.innerHTML = `<p class="muted">选择一个粒子查看模块来源、分类区域、静态/动态属性、重要性、置信度和边界；点击“实体工作节点”可展开跨境电商粒子云。</p>`;
}

function updateInspector(item) {
  const lens = lenses.find((lensItem) => lensItem.id === item.lens);
  const cloudButton = item.drillDownCloudId
    ? `<button id="toggleCloud" class="inspector-action" type="button">${activeCloudId === item.drillDownCloudId ? "收起跨境电商粒子云" : "展开跨境电商粒子云"}</button>`
    : "";
  const cloudMeta = item.cloudSummary ? `<p class="muted">${item.cloudSummary}</p>` : "";
  const projectMeta = item.projectId ? `<span>${item.projectId}</span>` : "";
  inspector.innerHTML = `
    <p class="eyebrow">${lens.label} · ${item.expression}</p>
    <h2>${item.label}</h2>
    <p class="muted">${item.category} / ${item.role}${item.status ? ` / ${item.status}` : ""}</p>
    ${cloudMeta}
    ${cloudButton}
    <div class="metric-grid">
      <div class="metric"><span>重要性</span><strong>${item.importance}</strong></div>
      <div class="metric"><span>置信度</span><strong>${item.confidence}</strong></div>
      <div class="metric"><span>激活度</span><strong>${item.activation}</strong></div>
      <div class="metric"><span>表达类型</span><strong>${item.static ? "静态" : "动态"}</strong></div>
    </div>
    <div class="tag-list">
      <span>${item.boundary}</span>
      <span>${item.region ? `${item.region} region` : lens.note}</span>
      ${projectMeta}
      ${item.source ? `<span>${item.source}</span>` : ""}
    </div>
  `;
  const toggle = document.querySelector("#toggleCloud");
  if (toggle && item.drillDownCloudId) {
    toggle.addEventListener("click", () => {
      activeCloudId = activeCloudId === item.drillDownCloudId ? null : item.drillDownCloudId;
      render();
      updateInspector(item);
    });
  }
}

function pulseThinkingFlow() {
  lensState.set("thinking", true);
  renderControls();
  render();

  const sequence = [
    "goal-core",
    "active-goal",
    "external-world",
    "perception-fusion",
    "event-extraction",
    "world-state",
    "world-model",
    "forecast-simulation",
    "decision-governance",
    "action-layer"
  ];

  sequence.forEach((nodeId, index) => {
    window.setTimeout(() => {
      const particle = [...nodeLayer.children].find((el) => el.dataset.nodeId === nodeId);
      if (particle) {
        particle.classList.remove("is-pulsing");
        void particle.offsetWidth;
        particle.classList.add("is-pulsing");
      }
      const item = nodes.find((nodeItem) => nodeItem.id === nodeId);
      if (item) {
        selectedNodeId = item.id;
        updateInspector(item);
      }
    }, index * 380);
  });
}

function setCamera(next) {
  camera.yaw = next.yaw;
  camera.pitch = next.pitch;
  camera.zoom = next.zoom;
  camera.distance = next.distance;
  render();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".particle")) {
    return;
  }

  isDragging = true;
  dragStart = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
  stage.classList.add("is-dragging");
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!isDragging) {
    return;
  }

  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  camera.yaw = dragStart.yaw + dx * 0.008;
  camera.pitch = clamp(dragStart.pitch + dy * 0.008, -1.18, 1.18);
  render();
});

stage.addEventListener("pointerup", (event) => {
  isDragging = false;
  stage.classList.remove("is-dragging");
  if (stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }
});

stage.addEventListener("pointercancel", () => {
  isDragging = false;
  stage.classList.remove("is-dragging");
});

stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom - event.deltaY * 0.0012, 0.62, 1.75);
    render();
  },
  { passive: false }
);

resetButton.addEventListener("click", () => {
  for (const lens of lenses) {
    lensState.set(lens.id, lens.enabled);
  }
  selectedNodeId = null;
  activeCloudId = null;
  setCamera(homeCamera);
  renderControls();
  showEmptyInspector();
  render();
});

pulseButton.addEventListener("click", pulseThinkingFlow);
viewHomeButton.addEventListener("click", () => setCamera(homeCamera));
viewTopButton.addEventListener("click", () => setCamera(topCamera));
window.addEventListener("resize", render);

renderControls();
showEmptyInspector();
render();
