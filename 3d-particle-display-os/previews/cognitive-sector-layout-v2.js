import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const stage = document.querySelector("#threeStage");
const labelLayer = document.querySelector("#labelLayer");
const sectorList = document.querySelector("#sectorList");
const inspector = document.querySelector("#inspector");
const inspectorMode = document.querySelector("#inspectorMode");
const statusText = document.querySelector("#statusText");
const backToWorld = document.querySelector("#backToWorld");

const toggles = {
  chambers: document.querySelector("#toggleChambers"),
  static: document.querySelector("#toggleStatic"),
  labels: document.querySelector("#toggleLabels"),
  thinking: document.querySelector("#toggleThinking"),
  decision: document.querySelector("#toggleDecision"),
  feedback: document.querySelector("#toggleFeedback")
};

const modeButtons = [...document.querySelectorAll(".mode-button")];

const sectors = [
  {
    id: "input",
    label: "输入感知扇区",
    short: "输入",
    angle: -140,
    yMin: -1.95,
    yMax: 0.1,
    color: 0x2dd4bf,
    reason: "外部世界先进入感知和事件抽取，靠近证据区与状态区。"
  },
  {
    id: "evidence",
    label: "证据事件扇区",
    short: "证据",
    angle: -92,
    yMin: -1.55,
    yMax: 0.45,
    color: 0xfb923c,
    reason: "事件记录承接输入，并向世界状态沉淀。"
  },
  {
    id: "state",
    label: "世界状态扇区",
    short: "状态",
    angle: -42,
    yMin: -0.75,
    yMax: 1.15,
    color: 0x84cc16,
    reason: "状态与世界模型位于核心近侧，是其他模块共享的事实底座。"
  },
  {
    id: "reasoning",
    label: "推理预测扇区",
    short: "推理",
    angle: 6,
    yMin: 0.15,
    yMax: 2.05,
    color: 0xa78bfa,
    reason: "从状态向未来分支和能力组合上升，毗邻决策区。"
  },
  {
    id: "decision",
    label: "决策治理扇区",
    short: "决策",
    angle: 53,
    yMin: 0.1,
    yMax: 2.25,
    color: 0xf472b6,
    reason: "决策需要推理输入与安全边界，输出给行动区。"
  },
  {
    id: "action",
    label: "行动项目扇区",
    short: "行动",
    angle: 101,
    yMin: -0.45,
    yMax: 1.15,
    color: 0xfacc15,
    reason: "可执行模块与实体项目靠近决策和反馈，保持可交接边界。"
  },
  {
    id: "feedback",
    label: "反馈学习扇区",
    short: "反馈",
    angle: 148,
    yMin: -1.65,
    yMax: 0.35,
    color: 0x60a5fa,
    reason: "行动结果回流学习和记忆，再校准世界状态。"
  },
  {
    id: "self",
    label: "自我操作扇区",
    short: "自我",
    angle: 196,
    yMin: 0.35,
    yMax: 2.35,
    color: 0x67e8f9,
    reason: "状态对话、视觉 OS、投射契约是观察与接入控制面。"
  }
].map((sector) => ({
  ...sector,
  inner: 1.18,
  outer: 4.85,
  width: 36
}));

const nebulae = [
  nebula("external-world", "外部世界来源", "input", "perception", 0.9, 0.7, -1.28, -10, "语音、图像、屏幕、文档、网络和设备只作为观察入口。", ["语音", "图像", "屏幕", "文档", "网络", "设备"]),
  nebula("perception-fusion", "感知与融合", "input", "perception", 0.92, 0.82, -0.84, 7, "把多源观察合成为候选事实，保留冲突和不确定性。", ["Observation Atom", "Fusion Bundle", "时空校准", "冲突记录", "潜变量"]),
  nebula("event-extraction", "事件抽取层", "input", "event", 0.9, 0.86, -0.18, 16, "把观察整理为谁、何时、何地、做了什么、影响谁。", ["who", "when", "where", "what", "evidence refs"]),
  nebula("global-events", "全域事件图谱", "evidence", "event", 0.9, 0.78, -0.6, 0, "将社会、物理、学习、决策、行动与反馈事件串成时间链。", ["社会事件", "物理事件", "决策事件", "行动事件", "反馈事件", "事件链"]),
  nebula("world-state", "世界状态模型", "state", "state", 0.97, 0.98, -0.08, -6, "当前世界被系统认为处于什么状态，是全图最靠近核心的事实层。", ["state_snapshot", "state_delta", "confidence", "risk overlay", "forecast overlay"]),
  nebula("world-model", "多域世界图谱", "state", "world", 0.9, 0.9, 0.44, 8, "把人物、事件、任务、知识、物体、安全和反馈统一成可引用图谱。", ["人际图谱", "任务图谱", "知识图谱", "物体图谱", "安全图谱", "反馈图谱"]),
  nebula("social-cognition", "人际辅助接入体", "state", "social", 0.92, 0.74, 0.76, 18, "原有人际关系辅助系统作为社会认知模块投射进世界模型。", ["people", "relationships", "B2B follow-up", "identity resolution", "read-only adapter"]),
  nebula("relationship-policy", "关系策略层", "state", "social", 0.88, 0.67, 1.02, -16, "关系策略、权限等级和目标分配器，为社交决策提供约束。", ["策略桶", "处理目标", "L0-L4 权限", "policy card", "risk boundary"]),
  nebula("forecast-simulation", "预测模拟层", "reasoning", "forecast", 0.91, 0.82, 1.45, -8, "生成未来分支、变量影响和反事实推演，不直接写成事实。", ["变量", "未来分支", "反事实", "沙盒模拟", "可能结果"]),
  nebula("capability-composition", "能力组合层", "reasoning", "capability", 0.86, 0.66, 0.92, 14, "把工具、API、代码和外部能力组合为可审查候选。", ["tool adapter", "capability slot", "call plan", "dry-run", "handoff"]),
  nebula("decision-governance", "决策治理层", "decision", "decision", 0.96, 0.94, 1.2, -8, "汇合推理、策略、风险和目标贡献，形成选择过程。", ["候选方案", "权重", "风险审查", "目标贡献", "最终选择"]),
  nebula("safety-scope", "安全边界层", "decision", "safety", 0.92, 0.76, 0.72, 14, "对权限、边界、审计和不允许自动执行的区域进行可视化约束。", ["scope", "permission", "audit", "blocked action", "review"]),
  nebula("action-layer", "行动与交接层", "action", "action", 0.9, 0.84, 0.26, -8, "把被批准的意图转成计划、清单、沙盒候选或现有模块交接。", ["task plan", "manual checklist", "sandbox candidate", "controlled handoff", "dry-run"]),
  nebula("entity-work-nodes", "实体工作节点", "action", "action", 0.91, 0.72, -0.06, 13, "承载实体业务项目星云，当前包含跨境电商 AI 自动化通路。", ["跨境电商通路", "经营策略确认", "主体与证照", "产品准入", "独立站", "获客询盘", "报价订单", "履约售后"]),
  nebula("feedback-memory", "反馈记忆层", "feedback", "feedback", 0.89, 0.88, -0.72, -8, "将行动结果、偏差和修正写回可审计记忆。", ["outcome", "deviation", "correction", "calibration", "next loop"]),
  nebula("learning-engine", "学习更新层", "feedback", "learning", 0.88, 0.74, -0.28, 13, "把反馈和验证转成规则、知识和策略更新。", ["review", "knowledge update", "test", "policy tuning", "memory update"]),
  nebula("status-dialogue-system", "状态对话系统", "self", "dialogue", 0.9, 0.8, 1.62, -12, "向用户解释当前状态、焦点、边界和下一步，不直接改动事实源。", ["status snapshot", "first-person reply", "voice input", "voice output", "conversation memory"]),
  nebula("visual-os", "三维粒子操作层", "self", "visual", 0.95, 0.96, 1.12, 2, "负责观察、下钻、比较、模拟、选择和发出操作意图。", ["global view", "domain view", "drill down", "compare", "simulate", "review"]),
  nebula("projection-contracts", "投射与意图契约", "self", "contract", 0.93, 0.84, 0.78, 16, "定义 graph_projection_vnext 与 visual_operation_intent 的接入字段。", ["projection_id", "clusters", "nodes", "edges", "source_refs", "intent"])
];

const flowPaths = {
  thinking: [
    ["external-world", "perception-fusion"],
    ["perception-fusion", "event-extraction"],
    ["event-extraction", "global-events"],
    ["global-events", "world-state"],
    ["world-state", "world-model"],
    ["world-model", "forecast-simulation"],
    ["forecast-simulation", "decision-governance"]
  ],
  decision: [
    ["world-model", "decision-governance"],
    ["relationship-policy", "decision-governance"],
    ["capability-composition", "decision-governance"],
    ["decision-governance", "safety-scope"],
    ["safety-scope", "action-layer"],
    ["decision-governance", "action-layer"]
  ],
  feedback: [
    ["action-layer", "entity-work-nodes"],
    ["entity-work-nodes", "feedback-memory"],
    ["feedback-memory", "learning-engine"],
    ["learning-engine", "world-state"],
    ["world-state", "status-dialogue-system"],
    ["status-dialogue-system", "visual-os"],
    ["visual-os", "projection-contracts"]
  ]
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11100d);
scene.fog = new THREE.FogExp2(0x11100d, 0.045);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80);
camera.position.set(5.7, 3.25, 7.7);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 3.1;
controls.maxDistance = 12;
controls.target.set(0, 0.25, 0);

const chamberGroup = new THREE.Group();
const nebulaGroup = new THREE.Group();
const flowGroup = new THREE.Group();
const subCloudGroup = new THREE.Group();
const backgroundGroup = new THREE.Group();
scene.add(backgroundGroup, chamberGroup, nebulaGroup, flowGroup, subCloudGroup);

const nebulaMeshes = [];
const nebulaById = new Map();
const labelRecords = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let selectedNebula = null;
let animatedFlowParticles = [];
let focusTween = null;

setupScene();
renderSectorList();
bindUi();
resize();
animate();

function nebula(id, label, sector, type, importance, relevance, height, angleOffset, detail, children) {
  return { id, label, sector, type, importance, relevance, height, angleOffset, detail, children };
}

function setupScene() {
  scene.add(new THREE.AmbientLight(0xf0eadb, 0.56));

  const keyLight = new THREE.DirectionalLight(0xffefc4, 2.4);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0x35d5d0, 18, 18);
  rimLight.position.set(-3, 2.5, -3.5);
  scene.add(rimLight);

  createBackgroundStars();
  createWorldCore();
  createChambers();
  placeNebulae();
  createFlows();
  setMode("overview");
}

function createBackgroundStars() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const random = seededRandom("background-stars");
  for (let i = 0; i < 900; i += 1) {
    const radius = 8 + random() * 16;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.75,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf3ebd6,
    size: 0.018,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  backgroundGroup.add(new THREE.Points(geometry, material));
}

function createWorldCore() {
  const core = new THREE.Group();
  core.name = "world-core";

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 48, 32),
    new THREE.MeshStandardMaterial({
      color: 0xfff2c2,
      emissive: 0xfacc15,
      emissiveIntensity: 0.76,
      roughness: 0.34,
      metalness: 0.18
    })
  );
  core.add(sphere);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.006, 8, 120), ringMaterial);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.006, 8, 120), ringMaterial.clone());
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2.7;
  core.add(ringA, ringB);
  nebulaGroup.add(core);

  addLabel("world-core", "世界核心", () => core.position.clone().add(new THREE.Vector3(0, 0.62, 0)), "sector-label");
}

function createChambers() {
  for (const sector of sectors) {
    const geometry = createWedgeGeometry(sector);
    const material = new THREE.MeshStandardMaterial({
      color: sector.color,
      transparent: true,
      opacity: 0.075,
      roughness: 0.68,
      metalness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${sector.id}-chamber`;
    chamberGroup.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({
        color: sector.color,
        transparent: true,
        opacity: 0.28
      })
    );
    chamberGroup.add(edges);

    const labelPosition = polarToVector(degToRad(sector.angle), 4.35, sector.yMax + 0.14);
    addLabel(`sector-${sector.id}`, sector.label, () => labelPosition.clone(), "sector-label");
  }
}

function createWedgeGeometry(sector) {
  const start = degToRad(sector.angle - sector.width / 2);
  const end = degToRad(sector.angle + sector.width / 2);
  const y0 = sector.yMin;
  const y1 = sector.yMax;
  const r0 = sector.inner;
  const r1 = sector.outer;

  const vertices = [
    polarToVector(start, r0, y0),
    polarToVector(end, r0, y0),
    polarToVector(end, r1, y0),
    polarToVector(start, r1, y0),
    polarToVector(start, r0, y1),
    polarToVector(end, r0, y1),
    polarToVector(end, r1, y1),
    polarToVector(start, r1, y1)
  ];

  const positions = vertices.flatMap((vertex) => [vertex.x, vertex.y, vertex.z]);
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function placeNebulae() {
  const placed = nebulae.map((item) => {
    const sector = sectors.find((candidate) => candidate.id === item.sector);
    const angle = degToRad(sector.angle + item.angleOffset);
    const radius = THREE.MathUtils.lerp(sector.outer - 0.5, sector.inner + 0.54, item.relevance);
    return { item, sector, angle, radius, position: polarToVector(angle, radius, item.height) };
  });

  relaxPositions(placed);

  for (const entry of placed) {
    const group = createNebula(entry.item, entry.sector);
    group.position.copy(entry.position);
    nebulaGroup.add(group);
    entry.item.group = group;
    entry.item.position = entry.position.clone();
    nebulaById.set(entry.item.id, entry.item);
    addLabel(entry.item.id, entry.item.label, () => group.position.clone().add(new THREE.Vector3(0, 0.28, 0)), "");
  }
}

function createNebula(item, sector) {
  const group = new THREE.Group();
  group.name = item.id;

  const size = 0.13 + item.importance * 0.18;
  const color = new THREE.Color(sector.color);
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(size, 32, 22),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28 + item.importance * 0.22,
      roughness: 0.45,
      metalness: 0.1
    })
  );
  sphere.userData.nebulaId = item.id;
  nebulaMeshes.push(sphere);
  group.add(sphere);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(size * 2.35, 0.01, 8, 96),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    })
  );
  halo.rotation.x = Math.PI / 2;
  halo.rotation.z = item.importance * Math.PI;
  group.add(halo);

  const particles = makeLocalParticleCloud(item.id, sector.color, size, item.importance);
  group.add(particles);
  return group;
}

function makeLocalParticleCloud(seed, color, size, importance) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const random = seededRandom(seed);
  const count = Math.round(42 + importance * 58);
  for (let i = 0; i < count; i += 1) {
    const radius = size * (1.6 + random() * 4.4);
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    positions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * 0.62,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color,
      size: 0.024,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
}

function relaxPositions(entries) {
  for (let pass = 0; pass < 18; pass += 1) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.item.sector !== b.item.sector) continue;
        const delta = a.position.clone().sub(b.position);
        const distance = Math.max(delta.length(), 0.001);
        const min = 0.72;
        if (distance < min) {
          delta.normalize().multiplyScalar((min - distance) * 0.5);
          a.position.add(delta);
          b.position.sub(delta);
        }
      }
    }
  }
}

function createFlows() {
  flowGroup.clear();
  animatedFlowParticles = [];
  const colors = {
    thinking: 0x35d5d0,
    decision: 0xf472b6,
    feedback: 0xfacc15
  };

  for (const [mode, edges] of Object.entries(flowPaths)) {
    const group = new THREE.Group();
    group.name = mode;
    group.visible = false;
    flowGroup.add(group);

    for (const [fromId, toId] of edges) {
      const from = nebulaById.get(fromId);
      const to = nebulaById.get(toId);
      if (!from || !to) continue;
      const curve = makeFlowCurve(from.position, to.position, mode);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(72)),
        new THREE.LineBasicMaterial({
          color: colors[mode],
          transparent: true,
          opacity: 0.42
        })
      );
      group.add(line);

      for (let i = 0; i < 2; i += 1) {
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 14, 10),
          new THREE.MeshBasicMaterial({
            color: colors[mode],
            transparent: true,
            opacity: 0.86
          })
        );
        pulse.userData = { curve, offset: i * 0.48, speed: mode === "thinking" ? 0.08 : 0.065 };
        group.add(pulse);
        animatedFlowParticles.push(pulse);
      }
    }
  }
}

function makeFlowCurve(from, to, mode) {
  const mid = from.clone().lerp(to, 0.5);
  const lift = mode === "feedback" ? -0.18 : 0.42;
  mid.y += lift + from.distanceTo(to) * 0.08;
  return new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
}

function renderSectorList() {
  sectorList.innerHTML = "";
  for (const sector of sectors) {
    const button = document.createElement("button");
    button.className = "sector-item";
    button.type = "button";
    button.dataset.sector = sector.id;
    button.innerHTML = `
      <strong><span class="swatch" style="color:${cssColor(sector.color)};background:${cssColor(sector.color)}"></span>${sector.label}</strong>
      <p>${sector.reason}</p>
    `;
    button.addEventListener("click", () => focusSector(sector));
    sectorList.appendChild(button);
  }
}

function bindUi() {
  window.addEventListener("resize", resize);
  renderer.domElement.addEventListener("click", onCanvasClick);

  for (const button of modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }

  toggles.chambers.addEventListener("change", () => {
    chamberGroup.visible = toggles.chambers.checked;
  });
  toggles.static.addEventListener("change", () => {
    nebulaGroup.visible = toggles.static.checked;
  });
  toggles.labels.addEventListener("change", updateLabelVisibility);
  toggles.thinking.addEventListener("change", updateFlowVisibility);
  toggles.decision.addEventListener("change", updateFlowVisibility);
  toggles.feedback.addEventListener("change", updateFlowVisibility);

  backToWorld.addEventListener("click", resetWorldView);
}

function onCanvasClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(nebulaMeshes, false);
  if (!hits.length) return;
  const nebula = nebulaById.get(hits[0].object.userData.nebulaId);
  if (nebula) selectNebula(nebula);
}

function selectNebula(item) {
  selectedNebula = item;
  subCloudGroup.clear();
  clearSubLabels();
  createSubCloud(item);
  setNebulaFocus(item);
  setInspector(item);
  backToWorld.disabled = false;
  statusText.textContent = `已展开 ${item.label}：子星云保持在原扇区内显示。`;
}

function createSubCloud(item) {
  const color = sectors.find((sector) => sector.id === item.sector).color;
  const center = item.position.clone();
  const children = item.children.length ? item.children : ["输入", "处理", "输出"];
  const ringRadius = 0.52 + Math.min(children.length, 8) * 0.055;
  const random = seededRandom(`${item.id}-subcloud`);

  children.forEach((label, index) => {
    const angle = index * Math.PI * 2 / children.length + random() * 0.18;
    const y = (index % 3 - 1) * 0.16;
    const position = center.clone().add(new THREE.Vector3(Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius));
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.055 + (index === 0 ? 0.022 : 0), 16, 12),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.36,
        roughness: 0.42
      })
    );
    mesh.position.copy(position);
    subCloudGroup.add(mesh);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([center, position]),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35
      })
    );
    subCloudGroup.add(line);
    addLabel(`sub-${item.id}-${index}`, label, () => position.clone().add(new THREE.Vector3(0, 0.12, 0)), "sub-label", true);
  });
}

function setInspector(item) {
  const sector = sectors.find((candidate) => candidate.id === item.sector);
  inspectorMode.textContent = sector.short;
  inspector.innerHTML = `
    <h1>${item.label}</h1>
    <p>${item.detail}</p>
    <dl>
      <div><dt>所在扇区</dt><dd>${sector.label}</dd></div>
      <div><dt>重要性</dt><dd>${Math.round(item.importance * 100)} / 100，决定星云核心尺寸和光强</dd></div>
      <div><dt>相关性</dt><dd>${Math.round(item.relevance * 100)} / 100，决定与世界核心距离</dd></div>
      <div><dt>高度位置</dt><dd>${describeHeight(item.height)}</dd></div>
      <div><dt>子星云</dt><dd>${item.children.join(" / ")}</dd></div>
    </dl>
  `;
}

function setNebulaFocus(item) {
  const target = item.position.clone();
  const cameraOffset = target.clone().normalize().multiplyScalar(2.25);
  if (cameraOffset.length() < 0.1) cameraOffset.set(1, 0.5, 1);
  cameraOffset.y += 1.2;
  focusTween = {
    fromTarget: controls.target.clone(),
    toTarget: target,
    fromCamera: camera.position.clone(),
    toCamera: target.clone().add(cameraOffset),
    progress: 0
  };
}

function focusSector(sector) {
  const target = polarToVector(degToRad(sector.angle), 2.7, (sector.yMin + sector.yMax) / 2);
  focusTween = {
    fromTarget: controls.target.clone(),
    toTarget: target,
    fromCamera: camera.position.clone(),
    toCamera: target.clone().add(new THREE.Vector3(1.5, 1.3, 2.7)),
    progress: 0
  };
  statusText.textContent = `${sector.label}：${sector.reason}`;
}

function resetWorldView() {
  selectedNebula = null;
  subCloudGroup.clear();
  clearSubLabels();
  backToWorld.disabled = true;
  inspectorMode.textContent = "世界核心";
  inspector.innerHTML = `
    <h1>世界核心</h1>
    <p>从中心观察 19 个系统星云。距离表示目标相关性，高度表示认知阶段和时间倾向，体积表示模块类型边界。</p>
    <dl>
      <div><dt>静态结构</dt><dd>模块与扇区舱室</dd></div>
      <div><dt>动态结构</dt><dd>思维流、决策流、反馈流</dd></div>
      <div><dt>交互</dt><dd>点击任意星云展开子星云</dd></div>
    </dl>
  `;
  focusTween = {
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(0, 0.25, 0),
    fromCamera: camera.position.clone(),
    toCamera: new THREE.Vector3(5.7, 3.25, 7.7),
    progress: 0
  };
  statusText.textContent = "已返回世界核心。";
}

function setMode(mode) {
  for (const button of modeButtons) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  toggles.thinking.checked = mode === "thinking" || mode === "all";
  toggles.decision.checked = mode === "decision" || mode === "all";
  toggles.feedback.checked = mode === "feedback" || mode === "all";
  if (mode === "overview") {
    toggles.thinking.checked = false;
    toggles.decision.checked = false;
    toggles.feedback.checked = false;
  }
  updateFlowVisibility();
  const labels = {
    overview: "总览模式：显示静态三维舱室与模块星云。",
    thinking: "思维流：从外部输入到状态、模型、预测与决策的认知扩散。",
    decision: "决策流：从模型、策略和能力候选汇入治理与安全边界。",
    feedback: "反馈流：行动结果回流反馈记忆、学习更新和视觉投射。",
    all: "全链路：同时显示思维、决策和反馈三类动态流。"
  };
  statusText.textContent = labels[mode] || labels.overview;
}

function updateFlowVisibility() {
  const visibility = {
    thinking: toggles.thinking.checked,
    decision: toggles.decision.checked,
    feedback: toggles.feedback.checked
  };
  for (const child of flowGroup.children) {
    child.visible = Boolean(visibility[child.name]);
  }
}

function updateLabelVisibility() {
  labelLayer.style.display = toggles.labels.checked ? "block" : "none";
}

function addLabel(id, text, positionGetter, className = "", isSub = false) {
  const element = document.createElement("div");
  element.className = `scene-label ${className}`.trim();
  element.textContent = text;
  element.dataset.id = id;
  labelLayer.appendChild(element);
  labelRecords.push({ id, element, positionGetter, isSub });
  return element;
}

function clearSubLabels() {
  for (let index = labelRecords.length - 1; index >= 0; index -= 1) {
    if (labelRecords[index].isSub) {
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
    const halfWidth = Math.min(record.element.offsetWidth / 2 || 70, 112);
    const halfHeight = Math.min(record.element.offsetHeight / 2 || 14, 32);
    const x = clamp(rawX, halfWidth + 8, width - halfWidth - 8);
    const y = clamp(rawY, halfHeight + 8, height - halfHeight - 8);
    record.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
  }
}

function animate(time = 0) {
  requestAnimationFrame(animate);
  const seconds = time * 0.001;

  for (const item of nebulae) {
    if (!item.group) continue;
    item.group.rotation.y += 0.0017 + item.importance * 0.0007;
    item.group.children[1].rotation.z += 0.002;
  }

  for (const pulse of animatedFlowParticles) {
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

function degToRad(degrees) {
  return degrees * Math.PI / 180;
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

function cssColor(color) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function describeHeight(height) {
  if (height > 1.2) return "高层：未来、预测、治理或操作意识";
  if (height > 0.35) return "中高层：结构模型、策略和可解释控制";
  if (height > -0.35) return "中层：当前状态、行动或接入边界";
  return "低层：输入、历史事件、反馈和校准";
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
