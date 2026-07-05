import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCommunicationWorkflow } from '../packages/agent-runtime/src/index.mjs';

const evalPath = path.resolve('evals/golden/b2b-sales-cases.jsonl');
const lines = readFileSync(evalPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

let passed = 0;
const failures = [];

for (const line of lines) {
  const item = JSON.parse(line);
  const output = await runCommunicationWorkflow(item.input);
  const expected = item.expected;

  const checks = [
    {
      name: 'sub_scenario',
      passed: output.scenario.sub_scenario === expected.sub_scenario,
      actual: output.scenario.sub_scenario,
      expected: expected.sub_scenario
    },
    {
      name: 'primary_obstacle',
      passed: expected.primary_obstacle_any.includes(output.obstacle_profile.primary_obstacle),
      actual: output.obstacle_profile.primary_obstacle,
      expected: expected.primary_obstacle_any
    },
    {
      name: 'must_include_technique',
      passed: output.strategy_card.techniques_used.includes(expected.must_include_technique),
      actual: output.strategy_card.techniques_used,
      expected: expected.must_include_technique
    }
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  if (failedChecks.length) {
    failures.push({ case_id: item.case_id, failed_checks: failedChecks });
  } else {
    passed += 1;
  }
}

const result = {
  total: lines.length,
  passed,
  failed: failures.length,
  failures
};

console.log(JSON.stringify(result, null, 2));

if (failures.length) {
  process.exitCode = 1;
}
