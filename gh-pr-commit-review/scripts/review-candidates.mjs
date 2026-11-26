#!/usr/bin/env node
// Read-only: lists open PRs updated after a UTC ISO-8601 cutoff (number, updated, title, url).
// Usage: review-candidates.mjs <iso-8601-cutoff> [owner/repo]
// GH_TIMEOUT bounds the gh call in seconds (default 60).

import { spawn } from 'node:child_process';

const USAGE = 'usage: review-candidates.mjs <iso-8601-cutoff> [owner/repo]';

function dieUsage(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function isValidUtcCutoff(cutoff) {
  const m = cutoff.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z)?$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) days[1] = 29;
  if (mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]) return false;
  if (m[4] !== undefined) {
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6]);
    if (h > 23 || mi > 59 || s > 59) return false;
  }
  return true;
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
    // Incremental decoder for concatenated pages.
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

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) dieUsage(USAGE);
  if (argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  const cutoff = argv[0];
  const timeoutRaw = process.env.GH_TIMEOUT || '60';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('review-candidates: GH_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$/.test(cutoff)) {
    dieUsage('review-candidates: cutoff must be UTC, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ');
  }
  if (!isValidUtcCutoff(cutoff)) {
    dieUsage(`review-candidates: cutoff is not a real UTC date and time: ${cutoff}`);
  }

  let repo = argv[1] || '';
  if (!repo) {
    const remoteRes = await runBounded('git', ['remote', 'get-url', 'origin'], 10);
    if (remoteRes.code !== 0) {
      dieUsage('review-candidates: no origin remote; pass owner/repo');
    }
    repo = parseRepoFromRemoteUrl(remoteRes.stdout) || '';
    if (!repo) dieUsage('review-candidates: could not parse owner/repo from origin remote');
  }

  const res = await runBounded(
    'gh',
    ['api', '--paginate', `repos/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=100`],
    timeoutSec,
  );
  if (res.code === 127) dieUsage('review-candidates: gh is required');
  if (res.code !== 0) {
    process.stderr.write(`review-candidates: gh api failed (exit ${res.code}): ${res.stderr.trim()}\n`);
    process.exit(res.timedOut ? 124 : 1);
  }

  const prs = [];
  for (const page of parseJsonPages(res.stdout)) {
    if (Array.isArray(page)) prs.push(...page);
  }

  for (const pr of prs) {
    if (typeof pr.updated_at === 'string' && pr.updated_at > cutoff) {
      process.stdout.write(`${[pr.number, pr.updated_at, pr.title, pr.html_url].join('\t')}\n`);
    }
  }
}

await main();
