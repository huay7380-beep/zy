import {
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const now = new Date();
const mirrorId = `cloud_source_mirror_${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const outputDir = path.join(root, 'runtime', 'cloud-sync', mirrorId);

const excludedDirNames = new Set([
  '.git',
  'node_modules',
  'runtime',
  'third_party',
  'tmp'
]);

const excludedExtensions = new Set([
  '.7z',
  '.dll',
  '.exe',
  '.lib',
  '.onnx',
  '.pt',
  '.rar',
  '.zip'
]);

const included = [
  'AGENTS.md',
  'README.md',
  'package.json',
  'docs/**',
  'examples/**',
  'knowledge/**',
  'packages/**',
  'schemas/**',
  'scripts/**',
  'views/**',
  '3d-particle-display-os/**',
  'capability-upgrade-registry/**',
  'cross-border-ecommerce-ai-route/**',
  'dialogue-system-patrol/**',
  'sightflow-desktop-agent-main/**',
  'thread-requirements/**',
  'tupu/**'
];

const excluded = [
  'third_party/**',
  '**/node_modules/**',
  '**/runtime/**',
  'tmp/**',
  '.git/**',
  '.env*',
  '*.log',
  '*.tmp',
  '*.pt',
  '*.onnx',
  '*.zip',
  '*.7z',
  '*.rar',
  '*.exe',
  '*.dll',
  '*.lib'
];

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function shouldExcludeDir(dirName) {
  return excludedDirNames.has(dirName);
}

function shouldExcludeFile(filePath) {
  const name = path.basename(filePath);
  if (name === '.env' || name.startsWith('.env.')) return true;
  if (name.endsWith('.log') || name.endsWith('.tmp')) return true;
  return excludedExtensions.has(path.extname(name).toLowerCase());
}

function walk(dir, result) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldExcludeDir(entry.name)) continue;
      walk(fullPath, result);
      continue;
    }
    if (!entry.isFile()) continue;
    if (shouldExcludeFile(fullPath)) continue;
    const stats = statSync(fullPath);
    result.candidate_files += 1;
    result.candidate_bytes += stats.size;
  }
}

function collectLargeExcluded(dir, result) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subtreeExcluded = shouldExcludeDir(entry.name);
      collectLargeExcluded(fullPath, result);
      if (subtreeExcluded) continue;
      continue;
    }
    if (!entry.isFile()) continue;
    const stats = statSync(fullPath);
    const excludedByPolicy = shouldExcludeFile(fullPath)
      || rel(fullPath).split('/').some((part) => excludedDirNames.has(part));
    if (excludedByPolicy && stats.size >= 50 * 1024 * 1024) {
      result.push({
        path: rel(fullPath),
        bytes: stats.size,
        reason: 'excluded_by_cloud_source_mirror_policy'
      });
    }
  }
}

const counts = {
  candidate_files: 0,
  candidate_bytes: 0,
  excluded_large_files: 0
};

walk(root, counts);
const largeExcluded = [];
collectLargeExcluded(root, largeExcluded);
largeExcluded.sort((a, b) => b.bytes - a.bytes);
counts.excluded_large_files = largeExcluded.length;

const manifest = {
  schema_version: 'cloud_source_mirror.v1',
  mirror_id: mirrorId,
  created_at: now.toISOString(),
  source_root: root,
  repository: {
    owner: 'huay7380-beep',
    name: 'zy',
    full_name: 'huay7380-beep/zy',
    url: 'https://github.com/huay7380-beep/zy.git',
    local_clone: 'D:\\zbx\\zy'
  },
  sync_policy: {
    mode: 'source_first_git_mirror',
    included,
    excluded
  },
  counts,
  excluded_large_files: largeExcluded.slice(0, 100),
  next_actions: [
    'Prepare local source mirror in D:\\zbx\\zy.',
    'Authenticate command-line Git for huay7380-beep.',
    'Run git push -u origin main after credentials are available.'
  ]
};

const markdown = `# Cloud Source Mirror

- mirror_id: ${manifest.mirror_id}
- created_at: ${manifest.created_at}
- repository: ${manifest.repository.full_name}
- url: ${manifest.repository.url}
- candidate_files: ${manifest.counts.candidate_files}
- candidate_mb: ${(manifest.counts.candidate_bytes / 1024 / 1024).toFixed(2)}
- excluded_large_files: ${manifest.counts.excluded_large_files}

## Excluded Large Files

${manifest.excluded_large_files.length
    ? manifest.excluded_large_files
      .map((item) => `- ${item.path} (${(item.bytes / 1024 / 1024).toFixed(2)} MB)`)
      .join('\n')
    : '- none'}
`;

mkdirSync(outputDir, { recursive: true });
writeFileSync(path.join(outputDir, 'cloud-source-mirror.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(path.join(outputDir, 'cloud-source-mirror.md'), markdown, 'utf8');
mkdirSync(path.join(root, 'runtime', 'cloud-sync'), { recursive: true });
writeFileSync(path.join(root, 'runtime', 'cloud-sync', 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(path.join(root, 'runtime', 'cloud-sync', 'latest.md'), markdown, 'utf8');

console.log(JSON.stringify({
  command: 'write-cloud-sync-manifest',
  mirror_id: manifest.mirror_id,
  repository: manifest.repository.full_name,
  candidate_files: manifest.counts.candidate_files,
  candidate_mb: Number((manifest.counts.candidate_bytes / 1024 / 1024).toFixed(2)),
  excluded_large_files: manifest.counts.excluded_large_files,
  json_path: path.join(outputDir, 'cloud-source-mirror.json'),
  markdown_path: path.join(outputDir, 'cloud-source-mirror.md')
}, null, 2));
