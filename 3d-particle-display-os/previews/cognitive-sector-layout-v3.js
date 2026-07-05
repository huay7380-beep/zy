import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const stage = document.querySelector("#threeStage");
const labelLayer = document.querySelector("#labelLayer");
const sectorList = document.querySelector("#sectorList");
const inspector = document.querySelector("#inspector");
const inspectorType = document.querySelector("#inspectorType");
const statusText = document.querySelector("#statusText");
const resetViewButton = document.querySelector("#resetView");
const modeButtons = [...document.querySelectorAll(".mode-button")];

const toggles = {
  sectors: document.querySelector("#toggleSectors"),
  landing: document.querySelector("#toggleLanding"),
  labels: document.querySelector("#toggleLabels"),
  links: document.querySelector("#toggleLinks"),
  process: document.querySelector("#toggleProcess"),
  decision: document.querySelector("#toggleDecision"),
  feedback: document.querySelector("#toggleFeedback"),
  shell: document.querySelector("#toggleShell")
};

const sectors = [
  sector("input", 1, "输入感知", -142, -1.7, 0.1, 0x2dd4bf, "接收外部世界、用户、屏幕、文档、API 和设备信号。"),
  sector("evidence", 2, "证据事件", -96, -1.35, 0.45, 0xfb923c, "把输入整理为 observation、事件、证据、时间线和事实候选。"),
  sector("state", 3, "世界状态", -50, -0.75, 1.0, 0x84cc16, "维护系统当前认为的世界状态、人物、关系、任务和事实底座。"),
  sector("reasoning", 4, "推理预测", -4, 0.15, 1.85, 0xa78bfa, "进行可能性分支、因果推演、能力组合和沙盒模拟。"),
  sector("decision", 5, "决策治理", 42, 0.25, 2.15, 0xf472b6, "比较方案、权重、风险、安全边界和最终选择。"),
  sector("action", 6, "行动执行", 88, -0.35, 1.15, 0xfacc15, "把被批准的意图转为任务计划、工具调用、自动化或人工交接。"),
  sector("feedback", 7, "反馈学习", 134, -1.45, 0.35, 0x60a5fa, "把执行结果、偏差、复盘和优化回流到状态与策略。"),
  sector("self", 8, "自我操作", 180, 0.35, 2.35, 0x67e8f9, "承载状态对话、三维显示 OS、投射契约和系统自检。")
].map((item) => ({ ...item, inner: 0.95, outer: 3.05, width: 34 }));

const landingObjects = [
  landing("chrome-stt", "Chrome STT Bridge", "input", "port", 0.78, 0.2, -13, "语音输入端口", "把麦克风语音转成状态对话输入，不保存原始音频。", ["speech_transcript", "status-dialogue", "fallback"]),
  landing("screen-observation", "屏幕观察入口", "input", "demand", 0.72, -0.55, 2, "桌面上下文", "把屏幕内容作为只读 observation 或平台预览证据。", ["screen", "OCR", "preview"]),
  landing("intake-runtime", "intake-runtime", "input", "package", 0.82, -0.95, 16, "只读采集运行时", "负责导入、manifest、source matrix 和 observation 扩展。", ["manifest", "source matrix", "observation"]),
  landing("pilot-import", "Pilot/MVP 导入", "input", "demand", 0.74, -1.32, 28, "需求进入口", "把真实输入整理为 PilotImportBatch 和闭环 MVP 入口。", ["pilot", "mvp import", "readiness"]),

  landing("event-graph", "全域事件图谱", "evidence", "software", 0.86, -0.35, -17, "事件证据层", "记录社会、物理、学习、决策、行动和反馈事件。", ["event_chain", "event_cluster", "evidence_refs"]),
  landing("source-intake-matrix", "Source Intake Matrix", "evidence", "package", 0.74, -0.82, 0, "来源矩阵", "按平台、adapter、capability 和 observation 描述输入来源。", ["adapter", "capability", "raw event"]),
  landing("snapshot-validate", "Platform Snapshot Validate", "evidence", "port", 0.7, -1.15, 14, "平台预览验证", "验证平台快照和自动化预览是否可进入 dry-run。", ["snapshot", "preview", "blocked flag"]),
  landing("duplicate-review", "Duplicate Observation Review", "evidence", "demand", 0.68, -1.42, 27, "重复观察审查", "只读确认重复 observation，避免重复写入事实。", ["review", "confirm", "read-only"]),

  landing("social-graph", "social-graph", "state", "package", 0.9, 0.2, -18, "人际事实系统", "承载人物、关系、互动历史和 B2B follow-up 状态。", ["people", "relationships", "follow-up"]),
  landing("identity-resolution", "identity-resolution", "state", "package", 0.86, -0.18, -3, "身份连续性", "把渠道身份、候选人物和确认队列接入实体解析。", ["candidate", "confirm", "merge"]),
  landing("storage-runtime", "storage-runtime", "state", "package", 0.82, -0.55, 14, "存储状态底座", "保存状态、报告、导入结果和运行摘要的持久层。", ["state", "reports", "runtime"]),
  landing("relationship-policy", "关系策略卡", "state", "demand", 0.78, -0.9, 27, "策略分配器", "把关系目标、权限等级、风险边界投射到世界状态。", ["goal", "permission", "risk"]),

  landing("possibility-branch", "possibility-branch", "reasoning", "package", 0.86, 0.35, -18, "可能性分支", "根据目标、事件和状态生成反事实与未来分支。", ["branch", "counterfactual", "backtest"]),
  landing("capability-registry", "capability-upgrade-registry", "reasoning", "project", 0.84, 0.02, -2, "能力升级候选", "记录替换、升级、专家能力、候选项目和确认门。", ["candidate", "replacement", "dry-run"]),
  landing("tool-runtime", "tool-runtime", "reasoning", "package", 0.8, -0.35, 14, "工具能力运行时", "把外部工具能力表达为 dry-run 调用计划和结果。", ["adapter", "call plan", "result"]),
  landing("forecast-sandbox", "Forecast Sandbox", "reasoning", "software", 0.72, -0.72, 28, "预测沙盒", "承载模拟、比较、分支评估和不写事实的预测叠加层。", ["simulate", "compare", "forecast"]),

  landing("decision-cluster", "decision-cluster", "decision", "package", 0.92, 0.45, -18, "决策集群", "汇合候选方案、权重、风险、目标贡献和选择结果。", ["candidate", "weight", "choice"]),
  landing("safety-scope", "安全边界系统", "decision", "software", 0.88, 0.08, -2, "治理边界", "定义权限、不可自动执行区域、审计和人工确认门。", ["permission", "audit", "gate"]),
  landing("pt028-pack", "PT-028 Feedback Decision Pack", "decision", "demand", 0.8, -0.32, 15, "反馈决策包", "把真实反馈窗口、审查和 handoff 验证转成决策材料。", ["feedback", "handoff", "finalize"]),
  landing("objective-audit", "MVP Objective Audit", "decision", "port", 0.74, -0.72, 28, "目标审查", "检查 MVP 目标、输入边界和闭环是否 ready。", ["audit", "objective", "ready"]),

  landing("trigger-engine", "trigger-engine", "action", "package", 0.88, 0.2, -18, "触发引擎", "生成提醒、平台预览、手工清单和 dry-run 自动化候选。", ["trigger plan", "preview", "manual"]),
  landing("agent-runtime", "agent-runtime", "action", "package", 0.84, -0.15, -2, "执行协调", "为计划、代理循环和状态检查提供运行协调层。", ["agent", "plan", "loop"]),
  landing("cross-border-route", "跨境电商 AI 通路", "action", "project", 0.9, -0.55, 15, "实体业务项目", "从产品源头、独立站、获客、询盘、报价、订单到履约售后的项目星云。", ["SKU", "独立站", "询盘", "报价", "订单", "履约"]),
  landing("mvp-self-agent", "MVP Self Agent", "action", "software", 0.78, -0.95, 29, "自运行候选", "为 MVP 外部输入、模板、预检和闭环 trial 提供执行入口。", ["preflight", "input kit", "trial"]),

  landing("mvp-runtime", "mvp-runtime", "feedback", "package", 0.86, -0.2, -17, "闭环 MVP", "把真实用户 review、优化结果、报告和状态看板形成闭环。", ["review", "optimization", "report"]),
  landing("feedback-report", "Feedback Reports", "feedback", "demand", 0.78, -0.62, -1, "反馈报告", "整理反馈、偏差、二次优化和下一轮建议。", ["feedback", "deviation", "next pass"]),
  landing("pt028-collection", "PT-028 Feedback Collection", "feedback", "software", 0.76, -0.98, 13, "真实反馈采集", "把 session、coverage、finalize 和 acceptance chain 接入反馈流。", ["session", "coverage", "finalize"]),
  landing("learning-update", "Learning Update", "feedback", "port", 0.7, -1.28, 27, "学习更新端口", "将验证结果转成知识、策略、状态和文档更新候选。", ["knowledge", "policy", "state"]),

  landing("status-dialogue", "Status Dialogue", "self", "software", 0.9, 0.65, -18, "状态对话系统", "以第一人称解释系统状态、焦点、边界和下一步。", ["snapshot", "reply", "voice"]),
  landing("particle-display-os", "3d-particle-display-os", "self", "project", 0.92, 0.28, -2, "三维显示 OS", "当前正在构建的三维认知可视化与投射实验区。", ["v2", "v3", "lens"]),
  landing("projection-contracts", "Projection Contracts", "self", "port", 0.86, -0.12, 14, "投射契约", "定义 graph_projection_vnext 与 visual_operation_intent 边界。", ["nodes", "edges", "intent"]),
  landing("voice-tts", "CosyVoice / Browser TTS", "self", "port", 0.74, -0.52, 28, "语音输出端口", "将状态对话 voiceText 输出到本地或浏览器语音通道。", ["voice profile", "tts", "fallback"])
];

const flowSpecs = {
  process: {
    color: 0x39d5cd,
    path: ["sector:input", "sector:evidence", "sector:state", "sector:reasoning", "sector:decision", "sector:action", "sector:feedback", "sector:self", "sector:input"]
  },
  decision: {
    color: 0xf472b6,
    path: ["social-graph", "relationship-policy", "possibility-branch", "decision-cluster", "safety-scope", "trigger-engine", "cross-border-route"]
  },
  feedback: {
    color: 0xfacc15,
    path: ["cross-border-route", "mvp-runtime", "feedback-report", "learning-update", "storage-runtime", "status-dialogue", "particle-display-os"]
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10100d);
scene.fog = new THREE.FogExp2(0x10100d, 0.038);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 90);
camera.position.set(7.2, 4.3, 9.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 4.2;
controls.maxDistance = 15;
controls.target.set(0, 0.2, 0);

const backgroundGroup = new THREE.Group();
const shellGroup = new THREE.Group();
const sectorGroup = new THREE.Group();
const landingGroup = new THREE.Group();
const linkGroup = new THREE.Group();
const flowGroup = new THREE.Group();
const detailGroup = new THREE.Group();
scene.add(backgroundGroup, shellGroup, sectorGroup, landingGroup, linkGroup, flowGroup, detailGroup);

const hitMeshes = [];
const labelRecords = [];
const sectorById = new Map(sectors.map((item) => [item.id, item]));
const landingById = new Map();
const flowParticles = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let focusTween = null;

setup();
renderSectorList();
bindUi();
resize();
animate();

function sector(id, sequence, label, angle, yMin, yMax, color, rule) {
  return { id, sequence, label, angle, yMin, yMax, color, rule };
}

function landing(id, label, sectorId, type, weight, yOffset, angleOffset, role, detail, children) {
  return { id, label, sectorId, type, weight, yOffset, angleOffset, role, detail, children };
}

function setup() {
  scene.add(new THREE.AmbientLight(0xf4eedc, 0.58));
  const keyLight = new THREE.DirectionalLight(0xffefc4, 2.2);
  keyLight.position.set(4, 7, 6);
  scene.add(keyLight);
  const coolLight = new THREE.PointLight(0x39d5cd, 18, 19);
  coolLight.position.set(-5, 3, -4);
  scene.add(coolLight);

  createBackgroundStars();
  createCore();
  createShellRings();
  createSectors();
  createLandingObjects();
  createFlows();
  setMode("overview");
}

function createBackgroundStars() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const random = seededRandom("v3-background");
  for (let i = 0; i < 1100; i += 1) {
    const radius = 9 + random() * 19;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.75,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  backgroundGroup.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xf3ebd6,
    size: 0.018,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  })));
}

function createCore() {
  const core = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0xfff2c2,
      emissive: 0xfacc15,
      emissiveIntensity: 0.86,
      roughness: 0.32,
      metalness: 0.16
    })
  );
  core.add(sphere);

  const material = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.007, 8, 120), material);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.006, 8, 120), material.clone());
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2.5;
  core.add(ringA, ringB);
  scene.add(core);
  addLabel("core", "世界核心", () => core.position.clone().add(new THREE.Vector3(0, 0.62, 0)), "sector-label");
}

function createShellRings() {
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xe7dfc8, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  for (const radius of [3.2, 4.5, 5.8, 6.9]) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 8, 180), ringMaterial.clone());
    torus.rotation.x = Math.PI / 2;
    shellGroup.add(torus);
  }

  const equator = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(6.9, 6.9, 0.02, 96, 1, true)),
    new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.08 })
  );
  shellGroup.add(equator);
}

function createSectors() {
  for (const item of sectors) {
    const geometry = createWedgeGeometry(item);
    const material = new THREE.MeshStandardMaterial({
      color: item.color,
      transparent: true,
      opacity: 0.095,
      roughness: 0.7,
      metalness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { kind: "sector", id: item.id };
    sectorGroup.add(mesh);
    hitMeshes.push(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: item.color, transparent: true, opacity: 0.34 })
    );
    sectorGroup.add(edges);

    addLabel(`sector-${item.id}`, `${item.sequence}. ${item.label}`, () => sectorAnchor(item).add(new THREE.Vector3(0, 0.18, 0)), "sector-label");
  }
}

function createLandingObjects() {
  for (const item of landingObjects) {
    const sectorItem = sectorById.get(item.sectorId);
    const angle = degToRad(sectorItem.angle + item.angleOffset);
    const radius = 4.85 + (1 - item.weight) * 1.7 + (Math.abs(item.angleOffset) / 32) * 0.42;
    const y = THREE.MathUtils.lerp(sectorItem.yMin, sectorItem.yMax, 0.48) + item.yOffset;
    const position = polarToVector(angle, radius, y);
    item.position = position;

    const group = new THREE.Group();
    group.position.copy(position);
    group.userData = { kind: "landing", id: item.id };
    const mesh = makeLandingMesh(item, sectorItem.color);
    mesh.userData = { kind: "landing", id: item.id };
    group.add(mesh);
    group.add(makeLocalCloud(item, sectorItem.color));
    landingGroup.add(group);
    hitMeshes.push(mesh);
    item.group = group;
    landingById.set(item.id, item);

    const link = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([sectorAnchor(sectorItem), position]),
      new THREE.LineBasicMaterial({ color: sectorItem.color, transparent: true, opacity: 0.22 })
    );
    linkGroup.add(link);

    addLabel(`landing-${item.id}`, item.label, () => group.position.clone().add(new THREE.Vector3(0, 0.26, 0)), "landing-label");
  }
}

function makeLandingMesh(item, color) {
  const size = 0.13 + item.weight * 0.17;
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.22 + item.weight * 0.22,
    roughness: 0.44,
    metalness: 0.12
  });

  if (item.type === "package") {
    return new THREE.Mesh(new THREE.BoxGeometry(size * 1.35, size * 0.82, size * 1.35), material);
  }
  if (item.type === "project") {
    return new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.15, 1), material);
  }
  if (item.type === "demand") {
    return new THREE.Mesh(new THREE.DodecahedronGeometry(size * 1.06, 0), material);
  }
  if (item.type === "port") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 1.25, size * 0.18, 10, 60), material);
    ring.rotation.x = Math.PI / 2;
    return ring;
  }
  return new THREE.Mesh(new THREE.SphereGeometry(size, 28, 18), material);
}

function makeLocalCloud(item, color) {
  const random = seededRandom(`cloud-${item.id}`);
  const positions = [];
  const count = 22 + Math.round(item.weight * 30);
  for (let i = 0; i < count; i += 1) {
    const radius = 0.22 + random() * 0.55;
    const theta = random() * Math.PI * 2;
    const y = (random() - 0.5) * 0.36;
    positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    color,
    size: 0.022,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
}

function createFlows() {
  flowGroup.clear();
  flowParticles.length = 0;
  for (const [name, spec] of Object.entries(flowSpecs)) {
    const group = new THREE.Group();
    group.name = name;
    group.visible = false;
    flowGroup.add(group);
    const points = spec.path.map((id) => getFlowPoint(id)).filter(Boolean);
    for (let i = 0; i < points.length - 1; i += 1) {
      const curve = new THREE.CatmullRomCurve3([
        points[i].clone(),
        points[i].clone().lerp(points[i + 1], 0.5).add(new THREE.Vector3(0, 0.35, 0)),
        points[i + 1].clone()
      ]);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(64)),
        new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.46 })
      );
      group.add(line);

      for (let pulseIndex = 0; pulseIndex < 2; pulseIndex += 1) {
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.043, 14, 10),
          new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.9 })
        );
        pulse.userData = { curve, offset: pulseIndex * 0.48, speed: name === "process" ? 0.06 : 0.075 };
        group.add(pulse);
        flowParticles.push(pulse);
      }
    }
  }
}

function createWedgeGeometry(item) {
  const start = degToRad(item.angle - item.width / 2);
  const end = degToRad(item.angle + item.width / 2);
  const vertices = [
    polarToVector(start, item.inner, item.yMin),
    polarToVector(end, item.inner, item.yMin),
    polarToVector(end, item.outer, item.yMin),
    polarToVector(start, item.outer, item.yMin),
    polarToVector(start, item.inner, item.yMax),
    polarToVector(end, item.inner, item.yMax),
    polarToVector(end, item.outer, item.yMax),
    polarToVector(start, item.outer, item.yMax)
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z]), 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function renderSectorList() {
  sectorList.innerHTML = "";
  for (const item of sectors) {
    const button = document.createElement("button");
    button.className = "sector-item";
    button.type = "button";
    button.innerHTML = `
      <strong><span class="sequence-pill">${item.sequence}</span>${item.label}</strong>
      <p>${item.rule}</p>
    `;
    button.addEventListener("click", () => selectSector(item));
    sectorList.appendChild(button);
  }
}

function bindUi() {
  window.addEventListener("resize", resize);
  renderer.domElement.addEventListener("click", onCanvasClick);
  resetViewButton.addEventListener("click", resetView);
  for (const button of modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }
  toggles.sectors.addEventListener("change", () => { sectorGroup.visible = toggles.sectors.checked; });
  toggles.landing.addEventListener("change", () => { landingGroup.visible = toggles.landing.checked; });
  toggles.labels.addEventListener("change", () => { labelLayer.style.display = toggles.labels.checked ? "block" : "none"; });
  toggles.links.addEventListener("change", () => { linkGroup.visible = toggles.links.checked; });
  toggles.shell.addEventListener("change", () => { shellGroup.visible = toggles.shell.checked; });
  toggles.process.addEventListener("change", updateFlowVisibility);
  toggles.decision.addEventListener("change", updateFlowVisibility);
  toggles.feedback.addEventListener("change", updateFlowVisibility);

  window.previewV3 = {
    selectLanding: (id) => {
      const item = landingById.get(id);
      if (item) selectLanding(item);
    },
    selectSector: (id) => {
      const item = sectorById.get(id);
      if (item) selectSector(item);
    }
  };
}

function onCanvasClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(hitMeshes, false);
  if (!hits.length) return;
  const hit = hits[0].object.userData;
  if (hit.kind === "sector") selectSector(sectorById.get(hit.id));
  if (hit.kind === "landing") selectLanding(landingById.get(hit.id));
}

function selectSector(item) {
  detailGroup.clear();
  inspectorType.textContent = "内圈处理逻辑";
  inspector.innerHTML = `
    <h1>${item.sequence}. ${item.label}</h1>
    <p>${item.rule}</p>
    <dl>
      <div><dt>角色</dt><dd>只负责认知处理顺序与逻辑，不直接承载具体软件。</dd></div>
      <div><dt>邻接</dt><dd>${describeNeighbors(item)}</dd></div>
      <div><dt>外圈挂接</dt><dd>${landingObjects.filter((landingItem) => landingItem.sectorId === item.id).map((landingItem) => landingItem.label).join(" / ")}</dd></div>
      <div><dt>高度规则</dt><dd>${describeHeight((item.yMin + item.yMax) / 2)}</dd></div>
    </dl>
  `;
  setFocus(sectorAnchor(item), 4.2);
  statusText.textContent = `${item.label}：内圈负责处理逻辑，外圈对象通过接入线挂载到这里。`;
}

function selectLanding(item) {
  detailGroup.clear();
  const sectorItem = sectorById.get(item.sectorId);
  createDetailNodes(item, sectorItem);
  inspectorType.textContent = "外圈落地对象";
  inspector.innerHTML = `
    <h1>${item.label}</h1>
    <p>${item.detail}</p>
    <dl>
      <div><dt>挂接扇区</dt><dd>${sectorItem.sequence}. ${sectorItem.label}</dd></div>
      <div><dt>对象类型</dt><dd>${describeType(item.type)}</dd></div>
      <div><dt>系统角色</dt><dd>${item.role}</dd></div>
      <div><dt>子节点</dt><dd>${item.children.join(" / ")}</dd></div>
    </dl>
  `;
  setFocus(item.position, 3.2);
  statusText.textContent = `${item.label}：外圈落地对象，逻辑上挂接到 ${sectorItem.label}。`;
}

function createDetailNodes(item, sectorItem) {
  const radius = 0.55 + Math.min(item.children.length, 6) * 0.06;
  item.children.forEach((label, index) => {
    const angle = index * Math.PI * 2 / item.children.length;
    const position = item.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, (index % 3 - 1) * 0.13, Math.sin(angle) * radius));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 10),
      new THREE.MeshStandardMaterial({ color: sectorItem.color, emissive: sectorItem.color, emissiveIntensity: 0.38 })
    );
    mesh.position.copy(position);
    detailGroup.add(mesh);
    detailGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([item.position, position]),
      new THREE.LineBasicMaterial({ color: sectorItem.color, transparent: true, opacity: 0.38 })
    ));
    addLabel(`detail-${item.id}-${index}`, label, () => position.clone().add(new THREE.Vector3(0, 0.12, 0)), "node-label", true);
  });
}

function resetView() {
  detailGroup.clear();
  clearDetailLabels();
  inspectorType.textContent = "双层总览";
  inspector.innerHTML = `
    <h1>中心系统 + 八扇区 + 外圈落地</h1>
    <p>八个扇区只表达认知处理方式和顺序，外圈承载软件、项目、具体需求和端口。流线穿过内圈，再驱动外圈功能。</p>
    <dl>
      <div><dt>中心</dt><dd>世界核心与当前总目标</dd></div>
      <div><dt>内圈</dt><dd>输入、事件、状态、推理、决策、行动、反馈、自我操作</dd></div>
      <div><dt>外圈</dt><dd>主系统包、功能、项目、端口、需求</dd></div>
    </dl>
  `;
  focusTween = {
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(0, 0.2, 0),
    fromCamera: camera.position.clone(),
    toCamera: new THREE.Vector3(7.2, 4.3, 9.2),
    progress: 0
  };
  statusText.textContent = "已回到双层总览。";
}

function setMode(mode) {
  for (const button of modeButtons) button.classList.toggle("active", button.dataset.mode === mode);
  toggles.process.checked = mode === "process";
  toggles.decision.checked = mode === "decision";
  toggles.feedback.checked = mode === "feedback";
  if (mode === "landing") {
    toggles.links.checked = true;
    linkGroup.visible = true;
  }
  updateFlowVisibility();
  const text = {
    overview: "总览：中心核心、内圈处理逻辑和外圈落地对象同时可见。",
    process: "处理顺序：显示输入、事件、状态、推理、决策、行动、反馈、自我操作的认知循环。",
    landing: "落地功能：突出外圈软件、项目、需求和端口与内圈扇区的挂接。",
    decision: "决策链：显示状态、策略、推理进入决策，再进入行动项目。",
    feedback: "反馈链：显示行动项目结果如何回流 MVP、反馈报告、学习更新和自我显示。"
  };
  statusText.textContent = text[mode] || text.overview;
}

function updateFlowVisibility() {
  const visible = {
    process: toggles.process.checked,
    decision: toggles.decision.checked,
    feedback: toggles.feedback.checked
  };
  for (const group of flowGroup.children) group.visible = Boolean(visible[group.name]);
}

function setFocus(target, distance) {
  const cameraDirection = target.clone().normalize();
  if (cameraDirection.length() < 0.1) cameraDirection.set(1, 0.65, 1);
  cameraDirection.normalize().multiplyScalar(distance);
  cameraDirection.y += 1.4;
  focusTween = {
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    fromCamera: camera.position.clone(),
    toCamera: target.clone().add(cameraDirection),
    progress: 0
  };
}

function getFlowPoint(id) {
  if (id.startsWith("sector:")) return sectorAnchor(sectorById.get(id.slice(7)));
  const item = landingById.get(id);
  return item?.position?.clone();
}

function sectorAnchor(item) {
  return polarToVector(degToRad(item.angle), (item.inner + item.outer) / 2, (item.yMin + item.yMax) / 2);
}

function addLabel(id, text, positionGetter, className = "", isDetail = false) {
  const element = document.createElement("div");
  element.className = `scene-label ${className}`.trim();
  element.textContent = text;
  element.dataset.id = id;
  labelLayer.appendChild(element);
  labelRecords.push({ id, element, positionGetter, isDetail });
}

function clearDetailLabels() {
  for (let index = labelRecords.length - 1; index >= 0; index -= 1) {
    if (labelRecords[index].isDetail) {
      labelRecords[index].element.remove();
      labelRecords.splice(index, 1);
    }
  }
}

function updateLabels() {
  if (!toggles.labels.checked) return;
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  for (const record of labelRecords) {
    const position = record.positionGetter();
    const projected = position.project(camera);
    const visible = projected.z > -1 && projected.z < 1;
    record.element.style.opacity = visible ? "1" : "0";
    if (!visible) continue;
    const rawX = (projected.x * 0.5 + 0.5) * width;
    const rawY = (-projected.y * 0.5 + 0.5) * height;
    const halfWidth = Math.min(record.element.offsetWidth / 2 || 70, 118);
    const halfHeight = Math.min(record.element.offsetHeight / 2 || 14, 32);
    const x = clamp(rawX, halfWidth + 8, width - halfWidth - 8);
    const y = clamp(rawY, halfHeight + 8, height - halfHeight - 8);
    record.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }
}

function animate(time = 0) {
  requestAnimationFrame(animate);
  const seconds = time * 0.001;
  for (const item of landingObjects) {
    if (!item.group) continue;
    item.group.rotation.y += 0.0015 + item.weight * 0.0008;
    item.group.position.y = item.position.y + Math.sin(seconds * 1.2 + item.angleOffset) * 0.025;
  }
  for (const pulse of flowParticles) {
    if (!pulse.parent.visible) continue;
    const { curve, offset, speed } = pulse.userData;
    pulse.position.copy(curve.getPoint((seconds * speed + offset) % 1));
    pulse.scale.setScalar(0.78 + Math.sin(seconds * 7 + offset * 6) * 0.22);
  }
  if (focusTween) {
    focusTween.progress = Math.min(1, focusTween.progress + 0.035);
    const eased = easeOutCubic(focusTween.progress);
    controls.target.lerpVectors(focusTween.fromTarget, focusTween.toTarget, eased);
    camera.position.lerpVectors(focusTween.fromCamera, focusTween.toCamera, eased);
    if (focusTween.progress >= 1) focusTween = null;
  }
  controls.update();
  updateLabels();
  renderer.render(scene, camera);
}

function resize() {
  const width = stage.clientWidth || window.innerWidth;
  const height = stage.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function polarToVector(angle, radius, y) {
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function degToRad(value) {
  return value * Math.PI / 180;
}

function seededRandom(seed) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function describeNeighbors(item) {
  const index = sectors.findIndex((sectorItem) => sectorItem.id === item.id);
  const prev = sectors[(index - 1 + sectors.length) % sectors.length];
  const next = sectors[(index + 1) % sectors.length];
  return `前序：${prev.label}；后序：${next.label}`;
}

function describeHeight(value) {
  if (value > 1.1) return "高层：预测、治理、自我控制";
  if (value > 0.15) return "中高层：状态、策略、解释";
  if (value > -0.55) return "中层：当前状态、行动、接入";
  return "低层：输入、历史、反馈、校准";
}

function describeType(type) {
  return {
    package: "主系统 package / 运行时模块",
    project: "独立项目 / 业务星云",
    demand: "具体需求 / 待处理事项",
    port: "端口 / 契约 / 接入边界",
    software: "软件功能 / 可视化系统"
  }[type] || type;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
