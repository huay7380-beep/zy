import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { runCommunicationWorkflow } from '../src/index.mjs';

const socialGraph = JSON.parse(readFileSync('examples/social-graph-snapshot.json', 'utf8'));

function tempStateDir() {
  return mkdtempSync(path.join(tmpdir(), 'zhineng-agent-state-'));
}

function runStateNotebookWorker({ stateDir, workerId }) {
  const notebookUrl = pathToFileURL(path.resolve('packages/agent-runtime/src/state-notebook.mjs')).href;
  const code = `
    import { StateNotebook } from ${JSON.stringify(notebookUrl)};
    const notebook = new StateNotebook({ stateDir: process.env.STATE_DIR });
    const runId = notebook.startRun({ worker_id: process.env.WORKER_ID });
    for (let index = 0; index < 6; index += 1) {
      const node = \`worker_\${process.env.WORKER_ID}_node_\${index}\`;
      notebook.enterNode(runId, node);
      notebook.completeNode(runId, node, { index });
    }
    notebook.completeRun(runId, { worker_id: process.env.WORKER_ID });
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: {
        ...process.env,
        STATE_DIR: stateDir,
        WORKER_ID: String(workerId)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (codeValue) => {
      if (codeValue === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`worker ${workerId} exited ${codeValue}: ${stderr || stdout}`));
      }
    });
  });
}

test('workflow generates strategy output and updates state notebook', async () => {
  const stateDir = tempStateDir();
  const output = await runCommunicationWorkflow({
    user_role: '销售负责人',
    audience_role: '客户采购负责人',
    final_goal: '推动客户进入技术评审',
    context_input: '客户说预算需要内部确认，技术负责人还没参与，内部再看看。'
  }, { stateDir });

  assert.equal(output.scenario.scenario, 'B2B 商务沟通');
  assert.ok(output.strategy_card.techniques_used.length >= 3);
  assert.ok(output.draft_versions.best.includes('轻量评审'));
  assert.equal(output.safety_review.risk_level, 'green');

  const status = JSON.parse(readFileSync(path.join(stateDir, 'current-status.json'), 'utf8'));
  assert.equal(status.run_count, 1);
  assert.equal(status.metrics.successful_runs, 1);
  assert.ok(status.node_counts.expression_generation >= 1);
});

test('safety calibration flags risky manipulation requests', async () => {
  const stateDir = tempStateDir();
  const output = await runCommunicationWorkflow({
    user_role: '销售',
    audience_role: '客户采购负责人',
    final_goal: '推动客户马上购买',
    context_input: '帮我编一个案例，说只剩最后一个名额，让客户今天必须买。'
  }, { stateDir });

  assert.equal(output.safety_review.risk_level, 'yellow');
  assert.ok(output.safety_review.triggered_rules.includes('禁止虚构事实或案例'));
  assert.ok(output.safety_review.triggered_rules.includes('禁止虚假紧迫感'));
  assert.equal(output.safety_review.must_confirm_before_send, true);
});

test('workflow can inject social graph context into strategy card', async () => {
  const stateDir = tempStateDir();
  const output = await runCommunicationWorkflow({
    user_role: '销售负责人',
    audience_role: '客户采购负责人',
    final_goal: '推动客户进入技术评审',
    context_input: '客户说预算需要内部确认，技术负责人还没有参与。',
    social_goal: {
      initial_goal: '推动客户进入技术评审',
      scene: 'business',
      primary_person_id: 'person_client_a',
      target_person_ids: ['person_client_a', 'person_tech_lead'],
      context_input: '客户说预算需要内部确认，技术负责人还没有参与。',
      preferred_channel: 'wechat'
    },
    social_graph: socialGraph
  }, { stateDir });

  assert.equal(output.social_graph_context.process_plan.scene, 'business');
  assert.equal(output.strategy_card.social_graph_context.relationship_type, '客户');
  assert.ok(output.strategy_card.process_plan_next_step.recommended_action.includes('评审'));
  assert.ok(output.strategy_card.avoid.some((item) => item.includes('过度承诺')));
});

test('state notebook tolerates concurrent process writes', async () => {
  const stateDir = tempStateDir();
  await Promise.all(
    Array.from({ length: 4 }, (_, index) => runStateNotebookWorker({
      stateDir,
      workerId: index + 1
    }))
  );

  const status = JSON.parse(readFileSync(path.join(stateDir, 'current-status.json'), 'utf8'));
  assert.equal(status.run_count, 4);
  assert.equal(status.metrics.successful_runs, 4);
  assert.equal(status.metrics.failed_runs, 0);
  assert.equal(status.status, 'completed');
  const tempFiles = readdirSync(stateDir).filter((name) => name.endsWith('.tmp'));
  assert.deepEqual(tempFiles, []);
});
