import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyIdentityConfirmationDecision,
  createIdentityStore,
  loadIdentitySnapshot
} from './identity-resolution.mjs';

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function latestDecision(entries, confirmationId) {
  return [...entries].reverse().find((entry) =>
    entry.confirmation_id === confirmationId
    && entry.queue_entry_type === 'identity_confirmation_decision'
  ) ?? null;
}

function commandForDecision({ dataDir, confirmation, candidate = null, action = 'confirm_candidate', actor = 'operator' }) {
  const base = [
    'npm.cmd run identity:confirm --',
    `--data-dir="${dataDir}"`,
    `--confirmation-id=${confirmation.confirmation_id}`,
    `--actor=${actor}`
  ];
  if (action === 'reject_all') return [...base, '--reject-all'].join(' ');
  return [...base, `--candidate-id=${candidate?.candidate_id ?? '<candidate_id>'}`].join(' ');
}

export function buildIdentityConfirmationUiModel(storeOrOptions, {
  actor = 'operator',
  title = '身份确认队列',
  apiEnabled = false
} = {}) {
  const store = createIdentityStore(storeOrOptions);
  const snapshot = loadIdentitySnapshot(store);
  const queue = snapshot.identity_confirmation_queue ?? [];
  const requests = queue.filter((entry) =>
    (entry.queue_entry_type ?? 'identity_confirmation_request') === 'identity_confirmation_request'
  );
  const confirmations = requests.map((request) => {
    const decision = latestDecision(queue, request.confirmation_id);
    const candidates = (request.candidates ?? []).map((candidate) => ({
      candidate_id: candidate.candidate_id,
      candidate_person_id: candidate.candidate_person_id,
      confidence: candidate.confidence,
      status: candidate.status,
      match_reasons: candidate.match_reasons ?? [],
      evidence_refs: candidate.metadata?.evidence_refs ?? request.evidence_refs ?? [],
      display_name: candidate.metadata?.display_name ?? candidate.candidate_person_id,
      platform: candidate.metadata?.platform ?? 'unknown',
      thread_key: candidate.metadata?.thread_key ?? null,
      command: commandForDecision({
        dataDir: store.dataDir,
        confirmation: request,
        candidate,
        actor
      })
    }));
    return {
      confirmation_id: request.confirmation_id,
      source_observation_id: request.source_observation_id ?? null,
      channel_identity_id: request.channel_identity_id ?? null,
      reason: request.reason ?? null,
      created_at: request.created_at ?? null,
      status: decision ? decision.decision_status : request.decision_status ?? 'pending',
      decision,
      evidence_refs: request.evidence_refs ?? [],
      operator_next_actions: request.operator_next_actions ?? [],
      candidates,
      reject_all_command: commandForDecision({
        dataDir: store.dataDir,
        confirmation: request,
        action: 'reject_all',
        actor
      })
    };
  });
  const pending = confirmations.filter((item) => item.status === 'pending');
  return {
    schema_version: 'identity_confirmation_ui.v1',
    title,
    generated_at: nowIso(),
    data_dir: store.dataDir,
    queue_path: store.paths.identityConfirmationQueue,
    api_enabled: apiEnabled,
    actor,
    summary: {
      confirmation_count: confirmations.length,
      pending_count: pending.length,
      decided_count: confirmations.length - pending.length
    },
    confirmations
  };
}

export function applyIdentityConfirmationUiDecision(storeOrOptions, payload, {
  actor = 'identity-confirmation-ui'
} = {}) {
  const action = payload?.action === 'reject_all' ? 'reject_all' : 'confirm_candidate';
  return applyIdentityConfirmationDecision(storeOrOptions, {
    confirmation_id: payload?.confirmation_id,
    candidate_id: payload?.candidate_id,
    person_id: payload?.person_id,
    action,
    confirmed_by: payload?.confirmed_by ?? actor,
    evidence_refs: payload?.evidence_refs ?? ['identity-confirmation-ui'],
    reason: payload?.reason
  }, { actor });
}

export function renderIdentityConfirmationHtml(model) {
  const first = model.confirmations.find((item) => item.status === 'pending') ?? model.confirmations[0] ?? null;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(model.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --line: #d8dde6;
      --text: #1f2933;
      --muted: #65758b;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --warn: #b45309;
      --danger: #b91c1c;
      --ok: #15803d;
      font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(240px, 320px) 1fr; }
    aside { border-right: 1px solid var(--line); background: #eef2f6; padding: 18px; }
    main { padding: 20px; }
    h1 { font-size: 20px; margin: 0 0 14px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    h3 { font-size: 14px; margin: 0 0 10px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 10px; min-width: 0; }
    .metric strong { display: block; font-size: 18px; line-height: 1.1; }
    .metric span { color: var(--muted); font-size: 12px; }
    .list { display: grid; gap: 8px; }
    .item { width: 100%; text-align: left; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 10px; cursor: pointer; }
    .item[aria-selected="true"] { border-color: var(--accent); outline: 2px solid rgba(15, 118, 110, .18); }
    .status { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--line); color: var(--muted); }
    .status.pending { color: var(--warn); border-color: #f1c27d; background: #fff7ed; }
    .status.confirmed { color: var(--ok); border-color: #9ed6ad; background: #f0fdf4; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
    button, .button { min-height: 36px; border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 6px; padding: 8px 12px; cursor: pointer; font: inherit; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.primary:hover { background: var(--accent-dark); }
    button.danger { color: var(--danger); border-color: #f0b5b5; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .grid { display: grid; grid-template-columns: minmax(280px, 1.1fr) minmax(280px, .9fr); gap: 16px; }
    .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; min-width: 0; }
    .candidate { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: start; border: 1px solid var(--line); border-radius: 7px; padding: 12px; margin-bottom: 10px; }
    .candidate.active { border-color: var(--accent); background: #f0fdfa; }
    .candidate input { margin-top: 4px; }
    .meta { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .reasons { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag { border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; color: var(--muted); background: #f8fafc; }
    label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    input[type="text"], textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px; font: inherit; background: #fff; }
    textarea { min-height: 110px; resize: vertical; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #111827; color: #e5e7eb; border-radius: 7px; padding: 12px; min-height: 88px; }
    .empty { min-height: 320px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; background: var(--panel); }
    .notice { margin-top: 10px; color: var(--muted); font-size: 12px; }
    @media (max-width: 820px) {
      .shell { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .grid { grid-template-columns: 1fr; }
      .summary { grid-template-columns: 1fr 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <h1>${escapeHtml(model.title)}</h1>
      <div class="summary" aria-label="队列汇总">
        <div class="metric"><strong>${model.summary.confirmation_count}</strong><span>总数</span></div>
        <div class="metric"><strong>${model.summary.pending_count}</strong><span>待确认</span></div>
        <div class="metric"><strong>${model.summary.decided_count}</strong><span>已处理</span></div>
      </div>
      <div id="queueList" class="list"></div>
    </aside>
    <main>
      <div class="toolbar">
        <span id="currentStatus" class="status"></span>
        <button id="copyCommand" title="复制当前确认命令">复制命令</button>
        <button id="downloadDecision" title="下载当前决策 JSON">下载决策</button>
      </div>
      <section id="detail"></section>
    </main>
  </div>
  <script>
    const model = ${scriptJson(model)};
    let selectedConfirmationId = ${JSON.stringify(first?.confirmation_id ?? null)};
    let selectedCandidateId = null;
    let action = 'confirm_candidate';

    const byId = id => document.getElementById(id);
    const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const confirmation = () => model.confirmations.find(item => item.confirmation_id === selectedConfirmationId);
    const selectedCandidate = () => confirmation()?.candidates.find(item => item.candidate_id === selectedCandidateId) ?? null;

    function decisionPayload() {
      const item = confirmation();
      const evidence = byId('evidenceInput')?.value.split(',').map(x => x.trim()).filter(Boolean) ?? [];
      return {
        schema_version: 'identity_confirmation_ui_decision.v1',
        confirmation_id: item?.confirmation_id ?? null,
        action,
        candidate_id: action === 'confirm_candidate' ? selectedCandidateId : null,
        confirmed_by: byId('actorInput')?.value || model.actor || 'operator',
        evidence_refs: evidence.length ? evidence : ['identity-confirmation-ui']
      };
    }

    function commandText() {
      const item = confirmation();
      const actor = byId('actorInput')?.value || model.actor || 'operator';
      if (!item) return '';
      if (action === 'reject_all') {
        return 'npm.cmd run identity:confirm -- --data-dir="' + model.data_dir + '" --confirmation-id=' + item.confirmation_id + ' --actor=' + actor + ' --reject-all';
      }
      const candidate = selectedCandidate();
      return 'npm.cmd run identity:confirm -- --data-dir="' + model.data_dir + '" --confirmation-id=' + item.confirmation_id + ' --actor=' + actor + ' --candidate-id=' + (candidate?.candidate_id ?? '<candidate_id>');
    }

    function renderList() {
      byId('queueList').innerHTML = model.confirmations.map(item => \`
        <button class="item" aria-selected="\${item.confirmation_id === selectedConfirmationId}" data-id="\${html(item.confirmation_id)}">
          <strong>\${html(item.source_observation_id || item.confirmation_id)}</strong><br>
          <span class="meta">\${html(item.reason || 'identity_confirmation')}</span><br>
          <span class="status \${item.status === 'pending' ? 'pending' : 'confirmed'}">\${html(item.status)}</span>
        </button>
      \`).join('');
      document.querySelectorAll('.item').forEach(btn => btn.addEventListener('click', () => {
        selectedConfirmationId = btn.dataset.id;
        selectedCandidateId = null;
        action = 'confirm_candidate';
        render();
      }));
    }

    function renderDetail() {
      const item = confirmation();
      if (!item) {
        byId('currentStatus').textContent = 'empty';
        byId('detail').innerHTML = '<div class="empty">当前没有身份确认任务</div>';
        return;
      }
      if (!selectedCandidateId && item.candidates.length) selectedCandidateId = item.candidates[0].candidate_id;
      byId('currentStatus').className = 'status ' + (item.status === 'pending' ? 'pending' : 'confirmed');
      byId('currentStatus').textContent = item.status;
      byId('detail').innerHTML = \`
        <div class="grid">
          <section class="panel">
            <h2>候选人物</h2>
            \${item.candidates.map(candidate => \`
              <label class="candidate \${candidate.candidate_id === selectedCandidateId && action === 'confirm_candidate' ? 'active' : ''}">
                <input type="radio" name="candidate" value="\${html(candidate.candidate_id)}" \${candidate.candidate_id === selectedCandidateId && action === 'confirm_candidate' ? 'checked' : ''}>
                <span>
                  <strong>\${html(candidate.candidate_person_id)}</strong><br>
                  <span class="meta">\${html(candidate.display_name)} · \${html(candidate.platform)} · \${html(candidate.thread_key || 'no thread key')}</span>
                  <span class="reasons">\${candidate.match_reasons.map(reason => \`<span class="tag">\${html(reason)}</span>\`).join('')}</span>
                </span>
                <span class="status">\${Math.round((candidate.confidence ?? 0) * 100)}%</span>
              </label>
            \`).join('')}
            <button id="rejectAll" class="danger">拒绝全部候选</button>
          </section>
          <section class="panel">
            <h2>确认动作</h2>
            <label for="actorInput">操作者</label>
            <input id="actorInput" type="text" value="\${html(model.actor)}">
            <label for="evidenceInput" style="margin-top:12px">证据引用</label>
            <input id="evidenceInput" type="text" value="\${html(item.evidence_refs.join(','))}">
            <h3 style="margin-top:14px">命令预览</h3>
            <pre id="commandPreview"></pre>
            <h3>决策 JSON</h3>
            <pre id="decisionPreview"></pre>
            <p class="notice">页面不会自动发送外部消息；确认只写身份链接和审计记录。</p>
          </section>
        </div>
      \`;
      document.querySelectorAll('input[name="candidate"]').forEach(input => input.addEventListener('change', () => {
        selectedCandidateId = input.value;
        action = 'confirm_candidate';
        renderPreviews();
        renderDetail();
      }));
      byId('rejectAll').addEventListener('click', () => {
        action = 'reject_all';
        renderPreviews();
      });
      byId('actorInput').addEventListener('input', renderPreviews);
      byId('evidenceInput').addEventListener('input', renderPreviews);
      renderPreviews();
    }

    function renderPreviews() {
      if (byId('commandPreview')) byId('commandPreview').textContent = commandText();
      if (byId('decisionPreview')) byId('decisionPreview').textContent = JSON.stringify(decisionPayload(), null, 2);
    }

    function render() {
      renderList();
      renderDetail();
    }

    byId('copyCommand').addEventListener('click', async () => {
      const text = commandText();
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
    });
    byId('downloadDecision').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(decisionPayload(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'identity-confirmation-decision.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    render();
  </script>
</body>
</html>`;
}

export function writeIdentityConfirmationUi({
  model,
  outputDir = path.resolve('runtime/identity-confirmation-ui', `identity_confirmation_ui_${Date.now()}`)
} = {}) {
  if (!model) throw new Error('writeIdentityConfirmationUi requires model');
  mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, 'identity-confirmation-ui.html');
  const jsonPath = path.join(outputDir, 'identity-confirmation-ui.json');
  writeFileSync(htmlPath, renderIdentityConfirmationHtml(model), 'utf8');
  writeFileSync(jsonPath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return { html_path: htmlPath, json_path: jsonPath };
}
