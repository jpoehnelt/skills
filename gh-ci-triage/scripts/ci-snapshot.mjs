#!/usr/bin/env node
// Read-only CI snapshot over the REST API: PR head, check runs and statuses on that head,
// workflow runs for the head, and recent runs on the base branch for a base-red comparison.
// Usage: ci-snapshot.mjs [-R owner/repo] [-w workflow] [pr-number-or-url]
// GH_TIMEOUT bounds each gh call in seconds (default 60).

import { spawn } from 'node:child_process';

const USAGE = 'usage: ci-snapshot.mjs [-R owner/repo] [-w workflow] [pr-number-or-url]';

function dieUsage(msg) {
  process.stderr.write(`${msg}\n`);
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

function runBounded(cmd, args, timeoutSec) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
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

function parseJsonPages(raw) {
  const text = raw.trim();
  if (!text) return [];
  try {
    return [JSON.parse(text)];
  } catch {
    // Incremental top-level decoder for concatenated JSON pages.
  }
  const values = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i += 1;
    if (i >= len) break;
    const start = i;
    const open = text[i];
    if (open !== '{' && open !== '[') throw new Error(`Unexpected JSON token at ${i}`);
    const stack = [open === '{' ? '}' : ']'];
    i += 1;
    let inString = false;
    let escaped = false;
    while (i < len && stack.length > 0) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === stack[stack.length - 1]) stack.pop();
      i += 1;
    }
    if (stack.length > 0) throw new Error('Unterminated JSON page');
    values.push(JSON.parse(text.slice(start, i)));
  }
  return values;
}

async function detectDefaultBranch() {
  const head = await runBounded('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], 10);
  if (head.code === 0 && head.stdout.trim()) {
    return head.stdout.trim().replace(/^origin\//, '');
  }
  const mainRef = await runBounded('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/main'], 10);
  if (mainRef.code === 0) return 'main';
  const masterRef = await runBounded('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/master'], 10);
  if (masterRef.code === 0) return 'master';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  let repo = '';
  let workflow = '';
  const positional = [];

  while (args.length > 0) {
    const a = args.shift();
    if (a === '-R') {
      if (args.length === 0) dieUsage(USAGE);
      repo = args.shift();
    } else if (a === '-w') {
      if (args.length === 0) dieUsage(USAGE);
      workflow = args.shift();
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else if (a.startsWith('-')) {
      dieUsage(USAGE);
    } else {
      positional.push(a);
    }
  }

  let prArg = positional[0] || '';
  let urlRepo = '';
  const urlMatch = prArg.match(/github\.com[/:]([^/]+\/[^/]+)\/pull\/([0-9]+)/);
  if (urlMatch) {
    urlRepo = urlMatch[1];
    prArg = urlMatch[2];
  }
  const prNum = prArg ? prArg.split('/').pop() : '';
  if (prNum && !/^[1-9][0-9]*$/.test(prNum)) {
    dieUsage(`ci-snapshot: invalid PR number: ${positional[0]}`);
  }

  const timeoutRaw = process.env.GH_TIMEOUT || '60';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('ci-snapshot: GH_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  if (!repo && urlRepo) repo = urlRepo;
  if (!repo) {
    const remoteRes = await runBounded('git', ['remote', 'get-url', 'origin'], 10);
    if (remoteRes.code !== 0) {
      dieUsage('ci-snapshot: no origin remote; pass -R owner/repo');
    }
    repo = parseRepoFromRemoteUrl(remoteRes.stdout) || '';
    if (!repo) dieUsage('ci-snapshot: could not parse owner/repo from origin remote');
  }

  async function ghApi(apiArgs) {
    const res = await runBounded('gh', ['api', ...apiArgs], timeoutSec);
    if (res.code === 127) dieUsage('ci-snapshot: gh is required');
    return res;
  }

  let failed = 0;
  let base = '';

  if (prNum) {
    const prRes = await ghApi([`repos/${repo}/pulls/${prNum}`]);
    if (prRes.code !== 0) {
      process.stderr.write(`ci-snapshot: failed to fetch PR #${prNum} (exit ${prRes.code})\n`);
      process.exit(prRes.timedOut ? 124 : 1);
    }
    const pr = JSON.parse(prRes.stdout);
    const headSha = pr.head?.sha || '';
    base = pr.base?.ref || '';

    process.stdout.write(
      `${JSON.stringify(
        {
          number: pr.number,
          url: pr.html_url,
          state: pr.state,
          draft: pr.draft,
          merged: pr.merged,
          base,
          head: pr.head?.ref,
          sha: headSha,
          mergeable_state: pr.mergeable_state,
        },
        null,
        2,
      )}\n`,
    );

    process.stdout.write(`\nCheck runs on ${headSha} (status, conclusion, name, url)\n`);
    const crRes = await ghApi([`repos/${repo}/commits/${headSha}/check-runs?per_page=100`, '--paginate']);
    if (crRes.code === 0) {
      for (const page of parseJsonPages(crRes.stdout)) {
        for (const r of page?.check_runs || []) {
          process.stdout.write(`${[r.status, r.conclusion || '-', r.name, r.html_url || '-'].join('\t')}\n`);
        }
      }
    } else {
      process.stderr.write(`ci-snapshot: section failed: check-runs (exit ${crRes.code})\n`);
      failed = 1;
    }

    process.stdout.write('\nCommit statuses (state, context, url)\n');
    const stRes = await ghApi([`repos/${repo}/commits/${headSha}/status?per_page=100`, '--paginate']);
    if (stRes.code === 0) {
      for (const page of parseJsonPages(stRes.stdout)) {
        for (const s of page?.statuses || []) {
          process.stdout.write(`${[s.state, s.context, s.target_url || '-'].join('\t')}\n`);
        }
      }
    } else {
      process.stderr.write(`ci-snapshot: section failed: commit statuses (exit ${stRes.code})\n`);
      failed = 1;
    }

    process.stdout.write(`\nWorkflow runs for ${headSha} (id, workflow, status, conclusion, url)\n`);
    const wrRes = await ghApi([`repos/${repo}/actions/runs?head_sha=${headSha}&per_page=100`, '--paginate']);
    if (wrRes.code === 0) {
      for (const page of parseJsonPages(wrRes.stdout)) {
        for (const run of page?.workflow_runs || []) {
          process.stdout.write(`${[run.id, run.name, run.status, run.conclusion || '-', run.html_url || '-'].join('\t')}\n`);
        }
      }
    } else {
      process.stderr.write(`ci-snapshot: section failed: workflow runs for ${headSha} (exit ${wrRes.code})\n`);
      failed = 1;
    }
  } else {
    const repoRes = await ghApi([`repos/${repo}`]);
    if (repoRes.code === 0) {
      try {
        base = JSON.parse(repoRes.stdout)?.default_branch || '';
      } catch {
        base = '';
      }
    }
    if (!base) {
      base = (await detectDefaultBranch()) || '';
      if (!base) {
        process.stderr.write("ci-snapshot: cannot find the default branch; run 'git remote set-head origin --auto'\n");
        process.exit(1);
      }
    }
  }

  const runsPath = workflow
    ? `repos/${repo}/actions/workflows/${workflow}/runs`
    : `repos/${repo}/actions/runs`;
  process.stdout.write(
    `\nRecent runs on ${base}${workflow ? ` for ${workflow}` : ''} (id, workflow, status, conclusion, sha, url)\n`,
  );
  const recentRes = await ghApi([runsPath, '-X', 'GET', '-f', `branch=${base}`, '-F', 'per_page=10']);
  if (recentRes.code === 0) {
    for (const page of parseJsonPages(recentRes.stdout)) {
      for (const run of page?.workflow_runs || []) {
        process.stdout.write(
          `${[run.id, run.name, run.status, run.conclusion || '-', String(run.head_sha || '').slice(0, 8), run.html_url || '-'].join('\t')}\n`,
        );
      }
    }
  } else {
    process.stderr.write(`ci-snapshot: section failed: recent runs on ${base} (exit ${recentRes.code})\n`);
    failed = 1;
  }

  process.exit(failed);
}

await main();
