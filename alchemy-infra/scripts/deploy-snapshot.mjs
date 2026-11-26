#!/usr/bin/env node
// Read-only deploy snapshot: extracts deploy and secret declarations from
// GitHub Actions workflow files and prints recent runs for each workflow.
// Usage: deploy-snapshot.mjs [-R owner/repo] [-n limit] [--local-only] [workflow ...]
// GH_TIMEOUT bounds each gh call in seconds (default 20).

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = 'usage: deploy-snapshot.mjs [-R owner/repo] [-n limit] [--local-only] [workflow ...]';
const DECL_RE = /^[ \t]*(?:-\s+)?(name|on|run|if|environment|env-slug|secret-path):/;

function dieUsage(msg) {
  if (msg) process.stderr.write(`${msg}\n`);
  else process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

function parseRepoFromRemoteUrl(url) {
  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function killProcessGroup(pid, signal) {
  try {
    if (process.platform === 'win32') process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch {
    // Already exited.
  }
}

function runBounded(cmd, args, timeoutSec, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const out = [];
    const err = [];
    let timedOut = false;
    let killTimer = null;

    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => killProcessGroup(child.pid, 'SIGKILL'), 2000);
      killTimer.unref();
    }, timeoutSec * 1000);
    timer.unref();

    child.on('error', (e) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code: e.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: e.message, timedOut: false });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code: timedOut ? 124 : code !== null ? code : signal ? 128 : 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let repo = '';
  let countRaw = '5';
  let localOnly = false;
  const workflows = [];

  while (args.length > 0) {
    const a = args.shift();
    if (a === '-R') {
      if (args.length === 0) dieUsage();
      repo = args.shift();
    } else if (a === '-n') {
      if (args.length === 0) dieUsage();
      countRaw = args.shift();
    } else if (a === '--local-only') {
      localOnly = true;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else if (a.startsWith('-')) {
      dieUsage();
    } else {
      workflows.push(a);
    }
  }

  if (!/^[1-9][0-9]*$/.test(countRaw)) {
    dieUsage('deploy-snapshot: -n must be a positive integer');
  }
  const timeoutRaw = process.env.GH_TIMEOUT || '20';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('deploy-snapshot: GH_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  const rootRes = await runBounded('git', ['rev-parse', '--show-toplevel'], 10, process.cwd());
  if (rootRes.code !== 0) {
    dieUsage('deploy-snapshot: not inside a Git worktree');
  }
  const root = rootRes.stdout.trim();
  const workflowDir = path.join(root, '.github', 'workflows');

  if (workflows.length === 0 && existsSync(workflowDir)) {
    const entries = readdirSync(workflowDir, { withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith('.yml') || e.name.endsWith('.yaml')))
      .map((e) => e.name)
      .sort();
    workflows.push(...entries);
  }

  if (workflows.length === 0) {
    process.stderr.write('deploy-snapshot: no workflow files found in .github/workflows\n');
    process.exit(1);
  }

  if (!localOnly && !repo) {
    const remoteRes = await runBounded('git', ['remote', 'get-url', 'origin'], 10, root);
    if (remoteRes.code !== 0) {
      dieUsage('deploy-snapshot: no origin remote; pass -R owner/repo or --local-only');
    }
    repo = parseRepoFromRemoteUrl(remoteRes.stdout) || '';
    if (!repo) dieUsage('deploy-snapshot: could not parse owner/repo from origin remote');
  }

  let failed = 0;

  for (const wf of workflows) {
    const base = path.basename(wf);
    const fullPath = path.join(workflowDir, base);
    process.stdout.write(`=== .github/workflows/${base} ===\n`);
    if (!existsSync(fullPath)) {
      process.stderr.write(`deploy-snapshot: workflow file not found: .github/workflows/${base}\n`);
      failed = 1;
      continue;
    }

    const lines = readFileSync(fullPath, 'utf8').split(/\r?\n/);
    let matched = 0;
    for (let idx = 0; idx < lines.length; idx += 1) {
      if (DECL_RE.test(lines[idx])) {
        process.stdout.write(`${idx + 1}:${lines[idx]}\n`);
        matched += 1;
      }
    }
    if (matched === 0) {
      process.stdout.write('(no matching declarations)\n');
    }

    if (!localOnly) {
      process.stdout.write('Recent runs (id, branch, event, status, conclusion, sha, url)\n');
      const res = await runBounded(
        'gh',
        ['api', `repos/${repo}/actions/workflows/${base}/runs`, '-X', 'GET', '-F', `per_page=${countRaw}`],
        timeoutSec,
        root,
      );
      if (res.code === 127) {
        process.stderr.write('deploy-snapshot: section failed: gh is not installed (pass --local-only to skip runs)\n');
        failed = 1;
      } else if (res.code !== 0) {
        process.stderr.write(`deploy-snapshot: section failed: recent runs for ${base} (exit ${res.code})\n`);
        failed = 1;
      } else {
        try {
          const data = JSON.parse(res.stdout);
          for (const run of data?.workflow_runs || []) {
            process.stdout.write(
              `${[run.id, run.head_branch, run.event, run.status, run.conclusion || '-', String(run.head_sha || '').slice(0, 8), run.html_url || '-'].join('\t')}\n`,
            );
          }
        } catch (err) {
          process.stderr.write(`deploy-snapshot: section failed: invalid JSON for ${base} (${err.message})\n`);
          failed = 1;
        }
      }
    }
    process.stdout.write('\n');
  }

  process.exit(failed);
}

await main();
