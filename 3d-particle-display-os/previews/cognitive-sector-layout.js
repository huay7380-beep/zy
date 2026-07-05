const colors = {
  core: "#f7f4e8",
  input: "#39c5b6",
  evidence: "#6ca8ff",
  state: "#8bd16a",
  reasoning: "#f2c14e",
  decision: "#ef6a5b",
  self: "#ba8cff",
  action: "#e5b74c",
  feedback: "#55c3a7"
};

const camera = {
  yaw: -0.52,
  pitch: 0.55,
  zoom: 1,
  distance: 3.4
};

const homeCamera = { ...camera };
const topCamera = { yaw: 0, pitch: 1.18, zoom: 0.92, distance: 3.4 };

const layers = [
  { id: "structure", label: "结构", note: "核心、扇区、模块", enabled: true },
  { id: "thinking", label: "思维流", note: "感知到决策", enabled: true },
  { id: "decision", label: "决策流", note: "候选到边界", enabled: true },
  { id: "feedback", label: "反馈流", note: "执行回到状态", enabled: true },
  { id: "height", label: "高度层", note: "认知状态分层", enabled: true }
];

const sectors = [
  sector("input", "输入 / 感知", -135, colors.input, "外部世界进入系统，最低层，靠近证据。"),
  sector("evidence", "证据 / 记忆", -90, colors.evidence, "source_refs、事件链、历史记忆，用于更新状态。"),
  sector("state", "世界状态 / 模型", -45, colors.state, "系统认为世界当前是什么样，连接推理。"),
  sector("reasoning", "推理 / 预测", 0, colors.reasoning, "模拟、可能性、能力候选，进入决策。"),
  sector("decision", "决策 / 治理", 45, colors.decision, "候选方案、风险、意志权重。"),
  sector("self", "自我 / 边界", 90, colors.self, "权限、契约、状态对话、安全门。"),
  sector("action", "行动 / 工具", 135, colors.action, "工具、执行候选、实体项目。"),
  sector("feedback", "反馈 / 学习", 180, colors.feedback, "结果、偏差、记忆校准，再回到输入。")
];

const nodes = [
  node("world-core", "世界核心", "core", 0, 0, 0, 34, 100, 100, 100, "世界核心是认知引力中心。所有距离都表示与当前目标的相关性。"),
  node("current-goal", "当前目标", "core", 0.16, 0.03, 0.18, 22, 98, 95, 100, "当前目标紧贴世界核心，作为思维流起点。"),

  nodeAt("external-world", "外部世界来源", "input", 0.86, -1.4, 19, 88, 82, 64, "输入扇区，外部世界先作为 observation。"),
  nodeAt("perception-fusion", "感知与融合", "input", 0.62, -0.9, 22, 92, 86, 72, "更靠近核心，因为它直接形成可推理的 observation bundle。"),
  nodeAt("event-extraction", "事件抽取层", "input", 0.74, -0.55, 18, 88, 82, 58, "事件结构化位于输入和证据之间。"),

  nodeAt("global-events", "全域事件图谱", "evidence", 0.78, -0.7, 18, 86, 84, 54, "事件链和证据引用。"),
  nodeAt("feedback-memory", "反馈与记忆", "evidence", 0.9, -0.9, 17, 82, 82, 48, "反馈进入记忆，准备更新状态。"),
  nodeAt("learning-engine", "学习引擎", "evidence", 1.06, -0.2, 16, 78, 78, 42, "学习沉淀在证据和反馈之间。"),

  nodeAt("world-state", "世界状态模型", "state", 0.54, 0, 24, 96, 88, 78, "当前状态位于中层，最靠近核心。"),
  nodeAt("world-model", "多域世界图谱", "state", 0.72, 0.08, 21, 90, 86, 62, "事实组织层，支撑推理。"),
  nodeAt("social-cognition", "人际辅助接入位", "state", 0.96, 0.1, 17, 82, 78, 46, "未来真实子系统，暂时处于外围相关层。"),

  nodeAt("forecast-simulation", "可能性预测", "reasoning", 0.72, 0.55, 20, 88, 72, 68, "预测在上层，因为它不是事实。"),
  nodeAt("capability-composition", "能力拼接与沙盒", "reasoning", 0.92, 0.45, 18, 82, 74, 48, "能力候选靠近执行，但先在推理中验证。"),
  nodeAt("relationship-policy", "关系策略层", "reasoning", 1.08, 0.36, 16, 76, 78, 42, "策略辅助推理，离核心稍远。"),

  nodeAt("decision-governance", "决策与意志治理", "decision", 0.58, 0.88, 23, 94, 82, 72, "决策是推理后的选择点，高度更高。"),
  nodeAt("safety-scope", "安全范围治理", "decision", 0.72, 1.08, 20, 92, 90, 66, "风险审查高于候选，紧邻自我边界。"),
  nodeAt("decision-candidate", "候选方案", "decision", 0.86, 0.72, 16, 78, 66, 58, "候选不是事实，位于上层。"),

  nodeAt("status-dialogue-system", "主体状态对话", "self", 0.62, 1.22, 20, 88, 86, 62, "只读状态解释，位于自我边界区。"),
  nodeAt("visual-os", "三维粒子操作层", "self", 0.5, 1.0, 22, 92, 88, 76, "视觉操作层连接决策和意图。"),
  nodeAt("projection-contracts", "投影与意图契约", "self", 0.76, 1.14, 18, 86, 92, 58, "graph_projection 与 visual_operation_intent。"),

  nodeAt("action-layer", "行动与工具", "action", 0.72, 0.12, 22, 88, 82, 64, "行动在中层，必须经过自我边界。"),
  nodeAt("entity-work-nodes", "实体工作节点", "action", 0.88, 0.08, 19, 84, 76, 50, "实体项目和可落地工作节点。"),
  nodeAt("tool-runtime", "工具执行候选", "action", 1.04, 0.02, 16, 76, 72, 44, "外围执行候选，未确认不靠近核心。"),

  nodeAt("action-result", "行动结果", "feedback", 0.66, -0.32, 19, 84, 80, 58, "行动结果进入反馈扇区。"),
  nodeAt("deviation-analysis", "偏差分析", "feedback", 0.82, -0.42, 17, 80, 78, 48, "比较预测和实际结果。"),
  nodeAt("strategy-correction", "策略修正", "feedback", 0.98, -0.16, 16, 78, 76, 42, "反馈用于校准策略和状态。")
];

const edges = [
  edge("current-goal", "external-world", "thinking"),
  edge("external-world", "perception-fusion", "thinking"),
  edge("perception-fusion", "event-extraction", "thinking"),
  edge("event-extraction", "global-events", "thinking"),
  edge("global-events", "world-state", "thinking"),
  edge("world-state", "world-model", "thinking"),
  edge("world-model", "forecast-simulation", "thinking"),
  edge("forecast-simulation", "decision-governance", "thinking"),

  edge("decision-governance", "decision-candidate", "decision"),
  edge("decision-candidate", "safety-scope", "decision"),
  edge("safety-scope", "visual-os", "decision"),
  edge("visual-os", "projection-contracts", "decision"),
  edge("projection-contracts", "action-layer", "decision"),

  edge("action-layer", "action-result", "feedback"),
  edge("action-result", "deviation-analysis", "feedback"),
  edge("deviation-analysis", "feedback-memory", "feedback"),
  edge("feedback-memory", "learning-engine", "feedback"),
  edge("learning-engine", "world-state", "feedback"),
  edge("strategy-correction", "perception-fusion", "feedback")
];

const layerState = new Map(layers.map((layer) => [layer.id, layer.enabled]));
let selectedId = "world-core";
let isDragging = false;
let dragStart = { x: 0, y: 0, yaw: camera.yaw, pitch: camera.pitch };

const stage = document.querySelector("#stage");
const sectorLayer = document.querySelector("#sectorLayer");
const edgeLayer = document.querySelector("#edgeLayer");
const nodeLayer = document.querySelector("#nodeLayer");
const toggleList = document.querySelector("#toggleList");
const inspector = document.querySelector("#inspector");
const focusTitle = document.querySelector("#focusTitle");
const cameraState = document.querySelector("#cameraState");

document.querySelector("#playThinking").addEventListener("click", () => playSequence("thinking"));
document.querySelector("#playDecision").addEventListener("click", () => playSequence("decision"));
document.querySelector("#playFeedback").addEventListener("click", () => playSequence("feedback"));
document.querySelector("#viewHome").addEventListener("click", () => setCamera(homeCamera));
document.querySelector("#viewTop").addEventListener("click", () => setCamera(topCamera));

function sector(id, label, angleDeg, color, reason) {
  return { id, label, angle: (angleDeg * Math.PI) / 180, color, reason };
}

function node(id, label, sectorId, x, y, z, size, importance, confidence, activation, detail) {
  return { id, label, sectorId, x, y, z, size, importance, confidence, activation, detail };
}

function nodeAt(id, label, sectorId, radius, height, size, importance, confidence, activation, detail) {
  const item = sectors.find((entry) => entry.id === sectorId);
  const angle = item.angle;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return node(id, label, sectorId, x, height, z, size, importance, confidence, activation, detail);
}

function edge(from, to, type) {
  return { from, to, type };
}

function renderToggles() {
  toggleList.innerHTML = "";
  for (const layer of layers) {
    const label = document.createElement("label");
    label.className = "toggle";
    label.style.color = layerColor(layer.id);
    label.innerHTML = `
      <input type="checkbox" ${layerState.get(layer.id) ? "checked" : ""} />
      <span><strong>${layer.label}</strong><span>${layer.note}</span></span>
      <em>${layer.id}</em>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      layerState.set(layer.id, event.target.checked);
      render();
    });
    toggleList.append(label);
  }
}

function layerColor(id) {
  if (id === "thinking") return colors.reasoning;
  if (id === "decision") return colors.decision;
  if (id === "feedback") return colors.feedback;
  if (id === "height") return colors.self;
  return colors.core;
}

function metrics() {
  const rect = stage.getBoundingClientRect();
  const base = Math.min(rect.width, rect.height) * 0.34;
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

function project(point) {
  const { width, height, base } = metrics();
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

function sectorPolygon(item) {
  const step = Math.PI / 8;
  const inner = 0.22;
  const outer = 1.32;
  const y = -0.04;
  const points = [
    { x: Math.cos(item.angle - step) * inner, y, z: Math.sin(item.angle - step) * inner },
    { x: Math.cos(item.angle - step) * outer, y, z: Math.sin(item.angle - step) * outer },
    { x: Math.cos(item.angle + step) * outer, y, z: Math.sin(item.angle + step) * outer },
    { x: Math.cos(item.angle + step) * inner, y, z: Math.sin(item.angle + step) * inner }
  ];
  return points.map(project);
}

function renderSectors() {
  sectorLayer.innerHTML = "";
  const { width, height } = metrics();
  sectorLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!layerState.get("structure")) return;

  for (const radius of [0.45, 0.75, 1.05, 1.32]) {
    const circlePoints = [];
    for (let i = 0; i < 72; i += 1) {
      const angle = (Math.PI * 2 * i) / 72;
      circlePoints.push(project({ x: Math.cos(angle) * radius, y: -0.04, z: Math.sin(angle) * radius }));
    }
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    ring.setAttribute("points", circlePoints.map((point) => `${point.x},${point.y}`).join(" "));
    ring.setAttribute("class", "ring");
    sectorLayer.append(ring);
  }

  if (layerState.get("height")) {
    for (const y of [-1.4, 0, 1.2]) {
      const bandPoints = [];
      for (let i = 0; i < 72; i += 1) {
        const angle = (Math.PI * 2 * i) / 72;
        bandPoints.push(project({ x: Math.cos(angle) * 1.38, y, z: Math.sin(angle) * 1.38 }));
      }
      const band = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      band.setAttribute("points", bandPoints.map((point) => `${point.x},${point.y}`).join(" "));
      band.setAttribute("class", "height-band");
      sectorLayer.append(band);
    }
  }

  for (const item of sectors) {
    const polygon = sectorPolygon(item);
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    shape.setAttribute("points", polygon.map((point) => `${point.x},${point.y}`).join(" "));
    shape.setAttribute("class", "sector-plane");
    shape.setAttribute("fill", item.color);
    shape.setAttribute("stroke", item.color);
    sectorLayer.append(shape);

    const labelPoint = project({
      x: Math.cos(item.angle) * 1.15,
      y: -0.08,
      z: Math.sin(item.angle) * 1.15
    });
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(labelPoint.x));
    label.setAttribute("y", String(labelPoint.y));
    label.setAttribute("class", "sector-label");
    label.textContent = item.label;
    sectorLayer.append(label);
  }
}

function makePath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bend = Math.min(80, Math.max(22, Math.hypot(dx, dy) * 0.12));
  const c1x = from.x + dx * 0.36;
  const c1y = from.y + dy * 0.36 - bend;
  const c2x = from.x + dx * 0.64;
  const c2y = from.y + dy * 0.64 + bend;
  return `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;
}

function renderEdges() {
  edgeLayer.innerHTML = "";
  const { width, height } = metrics();
  edgeLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);

  let dynamicIndex = 0;
  for (const item of edges) {
    if (!layerState.get(item.type)) continue;

    const source = nodes.find((entry) => entry.id === item.from);
    const target = nodes.find((entry) => entry.id === item.to);
    if (!source || !target) continue;

    const from = project(source);
    const to = project(target);
    const pathId = `edge-${item.from}-${item.to}-${item.type}`;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("id", pathId);
    path.setAttribute("d", makePath(from, to));
    path.setAttribute("class", `edge ${item.type}`);
    edgeLayer.append(path);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "4.2");
    dot.setAttribute("class", `flow-dot ${item.type}`);
    const motion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
    motion.setAttribute("dur", `${2.6 + (dynamicIndex % 4) * 0.25}s`);
    motion.setAttribute("begin", `${(dynamicIndex % 5) * 0.24}s`);
    motion.setAttribute("repeatCount", "indefinite");
    const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
    mpath.setAttribute("href", `#${pathId}`);
    mpath.setAttributeNS("http://www.w3.org/1999/xlink", "href", `#${pathId}`);
    motion.append(mpath);
    dot.append(motion);
    edgeLayer.append(dot);
    dynamicIndex += 1;
  }
}

function renderNodes() {
  nodeLayer.innerHTML = "";
  const items = [...nodes].sort((a, b) => project(a).z - project(b).z);

  for (const item of items) {
    if (!layerState.get("structure") && item.sectorId !== "core") continue;

    const point = project(item);
    const el = document.createElement("button");
    el.type = "button";
    el.className = ["node", item.sectorId === "core" ? "core" : "module", item.id === selectedId ? "active" : ""].filter(Boolean).join(" ");
    el.dataset.label = item.label;
    el.dataset.id = item.id;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.style.width = `${item.size * point.depth}px`;
    el.style.height = `${item.size * point.depth}px`;
    el.style.opacity = String(Math.max(0.42, item.confidence / 100));
    el.style.color = sectorColor(item.sectorId);
    el.style.zIndex = String(Math.round(100 + point.z * 60));
    el.addEventListener("click", () => {
      selectedId = item.id;
      updateInspector();
      renderNodes();
    });
    nodeLayer.append(el);
  }
}

function sectorColor(id) {
  const item = sectors.find((entry) => entry.id === id);
  return item ? item.color : colors.core;
}

function updateInspector() {
  const item = nodes.find((entry) => entry.id === selectedId) || nodes[0];
  const sectorInfo = sectors.find((entry) => entry.id === item.sectorId);
  focusTitle.textContent = item.label;
  inspector.innerHTML = `
    <h2>${item.label}</h2>
    <p>${item.detail}</p>
    <div class="metric-grid">
      <div class="metric"><span>重要性</span><strong>${item.importance}</strong></div>
      <div class="metric"><span>置信度</span><strong>${item.confidence}</strong></div>
      <div class="metric"><span>激活度</span><strong>${item.activation}</strong></div>
      <div class="metric"><span>高度 Y</span><strong>${item.y.toFixed(2)}</strong></div>
    </div>
    <div class="tag-list">
      <span>${sectorInfo ? sectorInfo.label : "世界核心"}</span>
      <span>radius ${Math.hypot(item.x, item.z).toFixed(2)}</span>
      <span>${sectorInfo ? sectorInfo.reason : "中心引力场"}</span>
    </div>
  `;
}

function renderCamera() {
  cameraState.textContent = `Yaw ${Math.round((camera.yaw * 180) / Math.PI)}° · Pitch ${Math.round((camera.pitch * 180) / Math.PI)}° · Zoom ${camera.zoom.toFixed(2)}x`;
}

function render() {
  renderSectors();
  renderEdges();
  renderNodes();
  renderCamera();
}

function playSequence(type) {
  layerState.set(type, true);
  renderToggles();
  render();
  const sequence = edges.filter((item) => item.type === type).map((item) => item.to);
  sequence.forEach((nodeId, index) => {
    window.setTimeout(() => {
      const el = [...nodeLayer.children].find((nodeEl) => nodeEl.dataset.id === nodeId);
      if (el) {
        el.classList.remove("pulse");
        void el.offsetWidth;
        el.classList.add("pulse");
      }
      selectedId = nodeId;
      updateInspector();
    }, index * 360);
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
  if (event.target.closest(".node")) return;
  isDragging = true;
  dragStart = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch };
  stage.classList.add("is-dragging");
  stage.setPointerCapture(event.pointerId);
});

stage.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  camera.yaw = dragStart.yaw + dx * 0.008;
  camera.pitch = clamp(dragStart.pitch + dy * 0.008, -1.18, 1.18);
  render();
});

stage.addEventListener("pointerup", (event) => {
  isDragging = false;
  stage.classList.remove("is-dragging");
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
});

stage.addEventListener("pointercancel", () => {
  isDragging = false;
  stage.classList.remove("is-dragging");
});

stage.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    camera.zoom = clamp(camera.zoom - event.deltaY * 0.0012, 0.62, 1.8);
    render();
  },
  { passive: false }
);

window.addEventListener("resize", render);

renderToggles();
updateInspector();
render();
