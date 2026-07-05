import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function defaultProjectRoot() {
  return path.resolve(here, '../../..');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function loadKnowledge(projectRoot = defaultProjectRoot()) {
  return {
    scenarioPack: readJson(path.join(projectRoot, 'knowledge/scenario-packs/b2b-sales-followup.json')),
    techniques: readJson(path.join(projectRoot, 'knowledge/techniques/b2b-core-techniques.json')),
    safetyRules: readJson(path.join(projectRoot, 'knowledge/safety/boundary-rules.json'))
  };
}
