import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import { defaultProjectRoot } from './knowledge-loader.mjs';

const STATUS_FILE = 'current-status.json';
const NOTE_FILE = 'operator-note.md';
const EVENTS_FILE = 'run-events.jsonl';
const LOCK_FILE = 'state.lock';

function nowIso() {
  return new Date().toISOString();
}

function defaultStatus() {
  return {
    schema_version: '1.0',
    project: 'zhineng-communication-agent',
    status: 'idle',
    updated_at: nowIso(),
    run_count: 0,
    current_run_id: null,
    current_node: null,
    node_counts: {},
    active_runs: {},
    last_run: null,
    recent_errors: [],
    metrics: {
      successful_runs: 0,
      failed_runs: 0,
      node_events: 0
    }
  };
}

function safeReadJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function trimErrors(errors) {
  return errors.slice(-10);
}

function retryableWriteError(error) {
  return ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code);
}

function atomicWriteFile(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tempPath, content, 'utf8');
  let lastError = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableWriteError(error)) {
        break;
      }
      sleepSync(Math.min(250, attempt * 25));
    }
  }
  try {
    unlinkSync(tempPath);
  } catch {
    // The rename may have succeeded in a late filesystem race.
  }
  throw lastError;
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

export class StateNotebook {
  constructor(options = {}) {
    const root = options.projectRoot ?? defaultProjectRoot();
    this.stateDir = options.stateDir ?? path.join(root, 'runtime/state');
    this.statusPath = path.join(this.stateDir, STATUS_FILE);
    this.notePath = path.join(this.stateDir, NOTE_FILE);
    this.eventsPath = path.join(this.stateDir, EVENTS_FILE);
    this.lockPath = path.join(this.stateDir, LOCK_FILE);
    mkdirSync(this.stateDir, { recursive: true });
    this.ensureFiles();
  }

  ensureFiles() {
    this.withLock(() => {
      if (!existsSync(this.statusPath)) {
        const status = defaultStatus();
        atomicWriteFile(this.statusPath, JSON.stringify(status, null, 2));
      }
      if (!existsSync(this.eventsPath)) {
        writeFileSync(this.eventsPath, '', 'utf8');
      }
      if (!existsSync(this.notePath)) {
        this.writeHumanNoteUnlocked(this.readStatus());
      }
    });
  }

  readStatus() {
    return safeReadJson(this.statusPath, defaultStatus());
  }

  writeStatus(status) {
    return this.withLock(() => this.writeStatusUnlocked(status));
  }

  writeStatusUnlocked(status) {
    status.updated_at = nowIso();
    atomicWriteFile(this.statusPath, JSON.stringify(status, null, 2));
    this.writeHumanNoteUnlocked(status);
  }

  appendEvent(type, details) {
    return this.withLock(() => this.appendEventUnlocked(type, details));
  }

  appendEventUnlocked(type, details) {
    const event = {
      time: nowIso(),
      type,
      ...details
    };
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  withLock(operation) {
    const timeoutMs = 10000;
    const staleMs = 30000;
    const start = Date.now();
    let fd = null;
    let lastLockError = null;

    while (fd === null) {
      try {
        fd = openSync(this.lockPath, 'wx');
      } catch (error) {
        lastLockError = error;
        const lockContention = error.code === 'EEXIST' || retryableWriteError(error);
        if (!lockContention) throw error;
        if (existsSync(this.lockPath)) {
          try {
            const stats = statSync(this.lockPath);
            if (Date.now() - stats.mtimeMs > staleMs) {
              unlinkSync(this.lockPath);
              continue;
            }
          } catch {
            // Another process may be creating or removing the lock.
          }
        }
        if (Date.now() - start > timeoutMs) {
          throw new Error(`state notebook lock timeout: ${this.lockPath}; last error: ${lastLockError?.code ?? 'unknown'}`);
        }
        sleepSync(20 + Math.floor(Math.random() * 30));
      }
    }

    try {
      return operation();
    } finally {
      closeSync(fd);
      try {
        unlinkSync(this.lockPath);
      } catch {
        // Another recovery path may already have removed a stale lock.
      }
    }
  }

  createRunId() {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const suffix = Math.random().toString(16).slice(2, 8);
    return `run_${stamp}_${suffix}`;
  }

  startRun(inputSummary) {
    return this.withLock(() => {
      const status = this.readStatus();
      const runId = this.createRunId();
      status.status = 'running';
      status.run_count += 1;
      status.current_run_id = runId;
      status.current_node = 'workflow_start';
      status.active_runs[runId] = {
        run_id: runId,
        status: 'running',
        started_at: nowIso(),
        current_node: 'workflow_start',
        input_summary: inputSummary
      };
      this.writeStatusUnlocked(status);
      this.appendEventUnlocked('run_started', { run_id: runId, input_summary: inputSummary });
      return runId;
    });
  }

  enterNode(runId, nodeName) {
    return this.withLock(() => {
      const status = this.readStatus();
      status.status = 'running';
      status.current_run_id = runId;
      status.current_node = nodeName;
      status.node_counts[nodeName] = (status.node_counts[nodeName] ?? 0) + 1;
      status.metrics.node_events += 1;
      if (status.active_runs[runId]) {
        status.active_runs[runId].current_node = nodeName;
      }
      this.writeStatusUnlocked(status);
      this.appendEventUnlocked('node_started', { run_id: runId, node: nodeName });
    });
  }

  completeNode(runId, nodeName, summary = {}) {
    return this.withLock(() => {
      const status = this.readStatus();
      if (status.active_runs[runId]) {
        status.active_runs[runId].last_completed_node = nodeName;
        status.active_runs[runId].last_node_summary = summary;
      }
      this.writeStatusUnlocked(status);
      this.appendEventUnlocked('node_completed', { run_id: runId, node: nodeName, summary });
    });
  }

  completeRun(runId, outputSummary = {}) {
    return this.withLock(() => {
      const status = this.readStatus();
      const active = status.active_runs[runId] ?? {};
      delete status.active_runs[runId];
      status.metrics.successful_runs += 1;
      status.status = Object.keys(status.active_runs).length ? 'running' : 'completed';
      status.current_run_id = Object.keys(status.active_runs)[0] ?? null;
      status.current_node = status.current_run_id ? status.active_runs[status.current_run_id].current_node : null;
      status.last_run = {
        run_id: runId,
        status: 'completed',
        started_at: active.started_at ?? null,
        completed_at: nowIso(),
        output_summary: outputSummary
      };
      this.writeStatusUnlocked(status);
      this.appendEventUnlocked('run_completed', { run_id: runId, output_summary: outputSummary });
    });
  }

  failRun(runId, error) {
    return this.withLock(() => {
      const status = this.readStatus();
      delete status.active_runs[runId];
      status.metrics.failed_runs += 1;
      status.status = Object.keys(status.active_runs).length ? 'running' : 'failed';
      status.current_run_id = Object.keys(status.active_runs)[0] ?? null;
      status.current_node = status.current_run_id ? status.active_runs[status.current_run_id].current_node : null;
      const errorRecord = {
        run_id: runId,
        time: nowIso(),
        message: error?.message ?? String(error)
      };
      status.recent_errors = trimErrors([...status.recent_errors, errorRecord]);
      status.last_run = {
        run_id: runId,
        status: 'failed',
        completed_at: nowIso(),
        error: errorRecord.message
      };
      this.writeStatusUnlocked(status);
      this.appendEventUnlocked('run_failed', errorRecord);
    });
  }

  rebuildFromEvents() {
    return this.withLock(() => {
      const status = defaultStatus();
      const activeRuns = {};
      const lines = existsSync(this.eventsPath)
        ? readFileSync(this.eventsPath, 'utf8').split('\n').filter(Boolean)
        : [];

      for (const line of lines) {
        let event = null;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'run_started') {
          status.run_count += 1;
          activeRuns[event.run_id] = {
            run_id: event.run_id,
            status: 'running',
            started_at: event.time,
            current_node: 'workflow_start',
            input_summary: event.input_summary
          };
        }

        if (event.type === 'node_started') {
          status.node_counts[event.node] = (status.node_counts[event.node] ?? 0) + 1;
          status.metrics.node_events += 1;
          if (activeRuns[event.run_id]) {
            activeRuns[event.run_id].current_node = event.node;
          }
        }

        if (event.type === 'node_completed' && activeRuns[event.run_id]) {
          activeRuns[event.run_id].last_completed_node = event.node;
          activeRuns[event.run_id].last_node_summary = event.summary;
        }

        if (event.type === 'run_completed') {
          const active = activeRuns[event.run_id] ?? {};
          delete activeRuns[event.run_id];
          status.metrics.successful_runs += 1;
          status.last_run = {
            run_id: event.run_id,
            status: 'completed',
            started_at: active.started_at ?? null,
            completed_at: event.time,
            output_summary: event.output_summary
          };
        }

        if (event.type === 'run_failed') {
          delete activeRuns[event.run_id];
          status.metrics.failed_runs += 1;
          const errorRecord = {
            run_id: event.run_id,
            time: event.time,
            message: event.message
          };
          status.recent_errors = trimErrors([...status.recent_errors, errorRecord]);
          status.last_run = {
            run_id: event.run_id,
            status: 'failed',
            completed_at: event.time,
            error: event.message
          };
        }
      }

      status.active_runs = activeRuns;
      status.current_run_id = Object.keys(activeRuns)[0] ?? null;
      status.current_node = status.current_run_id ? activeRuns[status.current_run_id].current_node : null;
      status.status = status.current_run_id
        ? 'running'
        : status.metrics.failed_runs && status.last_run?.status === 'failed'
          ? 'failed'
          : status.metrics.successful_runs || status.run_count
            ? 'completed'
            : 'idle';

      this.writeStatusUnlocked(status);
      return status;
    });
  }

  writeHumanNoteUnlocked(status) {
    const nodeLines = Object.entries(status.node_counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => `- ${name}: ${count}`)
      .join('\n') || '- 暂无节点运行记录';

    const activeLines = Object.values(status.active_runs)
      .map((run) => `- ${run.run_id}: ${run.current_node}`)
      .join('\n') || '- 当前没有活动运行';

    const errorLines = status.recent_errors
      .slice(-5)
      .map((error) => `- ${error.time} ${error.run_id}: ${error.message}`)
      .join('\n') || '- 暂无错误';

    const lastRun = status.last_run
      ? `${status.last_run.run_id} / ${status.last_run.status}`
      : '暂无';

    const note = `# 运行状态笔记

更新时间：${status.updated_at}

当前状态：${status.status}

累计运行次数：${status.run_count}

当前运行：${status.current_run_id ?? '无'}

当前节点：${status.current_node ?? '无'}

最近一次运行：${lastRun}

成功运行次数：${status.metrics.successful_runs}

失败运行次数：${status.metrics.failed_runs}

## 活动运行

${activeLines}

## 节点运行次数

${nodeLines}

## 最近错误

${errorLines}

## 外部读取

- JSON 快照：runtime/state/current-status.json
- 事件流：runtime/state/run-events.jsonl
`;
    atomicWriteFile(this.notePath, note);
  }
}
