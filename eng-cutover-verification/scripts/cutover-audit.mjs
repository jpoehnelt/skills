#!/usr/bin/env node
// Read-only: proves retired patterns are gone and replacements exist in tracked
// files, then runs the given test and live-check commands from the repo root.

import { spawn } from 'node:child_process';

const USAGE = [
  'Usage: cutover-audit.mjs [assertions]   (repeat any assertion)',
  "  --retired 'label:::git-pathspec:::extended-regex'   fails if the regex still matches",
  "  --required 'label:::git-pathspec:::extended-regex'  fails if nothing matches",
  "  --test 'label:::shell-command'                      runs from the repo root",
  "  --live-check 'label:::shell-command'                runs from the repo root",
  '  --final   also require a clean tree and at least one --live-check',
  '  --timeout SECONDS   per-command limit for --test and --live-check (default 900)',
  '',
  'Repository searches alone never prove live state.',
].join('\n');

function dieUsage(msg) {
  process.stderr.write(`cutover-audit: ${msg}\n\n${USAGE}\n`);
  process.exit(2);
}

function killProcessGroup(pid, signal) {
  try {
    if (process.platform === 'win32') process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch {
    // Already exited.
  }
}

function runBounded(cmd, args, timeoutSec, cwd, streamOutput = false) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: streamOutput ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const out = [];
    const err = [];
    let timedOut = false;
    let killTimer = null;

    if (!streamOutput) {
      child.stdout.on('data', (c) => out.push(c));
      child.stderr.on('data', (c) => err.push(c));
    }

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
  const specs = [];
  let finalMode = false;
  let liveCount = 0;
  let timeoutSec = 900;

  while (args.length > 0) {
    const a = args.shift();
    if (a === '--retired' || a === '--required' || a === '--test' || a === '--live-check') {
      if (args.length === 0) dieUsage(`${a} requires a value`);
      const val = args.shift();
      specs.push({ kind: a.slice(2), spec: val });
      if (a === '--live-check') liveCount += 1;
    } else if (a === '--final') {
      finalMode = true;
    } else if (a === '--timeout') {
      const v = args.shift() || '';
      if (!/^[1-9][0-9]*$/.test(v)) dieUsage('--timeout requires a positive number of seconds');
      timeoutSec = Number(v);
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else {
      dieUsage(`unknown argument: ${a}`);
    }
  }

  if (specs.length === 0) dieUsage('at least one assertion is required');

  const rootRes = await runBounded('git', ['rev-parse', '--show-toplevel'], 10, process.cwd());
  if (rootRes.code !== 0) {
    process.stderr.write('cutover-audit: not inside a Git worktree\n');
    process.exit(2);
  }
  const repoRoot = rootRes.stdout.trim();

  let failures = 0;
  const fail = (msg) => {
    process.stderr.write(`FAIL ${msg}\n`);
    failures += 1;
  };
  const pass = (msg) => {
    process.stdout.write(`PASS ${msg}\n`);
  };

  for (const { kind, spec } of specs) {
    const firstSep = spec.indexOf(':::');
    if (firstSep <= 0 || firstSep + 3 >= spec.length) {
      fail(`${kind}: malformed spec ${spec}`);
      continue;
    }
    const label = spec.slice(0, firstSep);
    const rest = spec.slice(firstSep + 3);

    if (kind === 'retired' || kind === 'required') {
      const secondSep = rest.indexOf(':::');
      if (secondSep <= 0 || secondSep + 3 >= rest.length) {
        fail(`${kind}: malformed spec ${spec}`);
        continue;
      }
      const scope = rest.slice(0, secondSep);
      const regex = rest.slice(secondSep + 3);

      const lsRes = await runBounded('git', ['ls-files', '--error-unmatch', '--', scope], 30, repoRoot);
      if (lsRes.code > 1) {
        fail(`${kind}: ${label} scope could not be evaluated: ${lsRes.stderr.trim()}`);
        continue;
      }
      if (lsRes.code === 1) {
        if (kind === 'retired') {
          const histRes = await runBounded('git', ['log', '-1', '--format=%h', '--', scope], 30, repoRoot);
          if (histRes.code === 0 && histRes.stdout.trim()) {
            pass(`retired: ${label} (scope removed: ${scope})`);
          } else {
            fail(`retired: ${label} scope was never tracked (typo or shallow clone?): ${scope}`);
          }
        } else {
          fail(`required: scope is not tracked: ${scope}`);
        }
        continue;
      }

      const grepRes = await runBounded('git', ['grep', '-n', '-E', '--', regex, '--', scope], 60, repoRoot);
      if (grepRes.code > 1) {
        fail(`${kind}: ${label} could not be evaluated\n${grepRes.stderr || grepRes.stdout}`);
      } else if (kind === 'retired') {
        if (grepRes.code === 1) pass(`retired: ${label}`);
        else fail(`retired: ${label}\n${grepRes.stdout.trim()}`);
      } else if (grepRes.code === 0) {
        pass(`required: ${label}`);
      } else {
        fail(`required: ${label} (${scope} / ${regex})`);
      }
    } else {
      process.stdout.write(`RUN ${kind}: ${label}\n`);
      const cmdRes = await runBounded('bash', ['-o', 'pipefail', '-c', rest], timeoutSec, repoRoot, true);
      if (cmdRes.code === 0) {
        pass(`${kind}: ${label}`);
      } else if (cmdRes.timedOut) {
        fail(`${kind}: ${label} (timed out after ${timeoutSec}s)`);
      } else {
        fail(`${kind}: ${label} (exit ${cmdRes.code})`);
      }
    }
  }

  if (finalMode) {
    if (liveCount === 0) {
      fail('final: at least one --live-check is required; repository searches do not prove live state');
    }
    const statusRes = await runBounded('git', ['status', '--porcelain'], 10, repoRoot);
    if (statusRes.stdout.trim().length > 0) {
      fail('final: worktree is not clean');
      const shortRes = await runBounded('git', ['status', '--short'], 10, repoRoot);
      process.stderr.write(shortRes.stdout);
    } else {
      pass('final: worktree is clean');
    }
  }

  if (failures > 0) {
    process.stderr.write(`cutover-audit: ${failures} assertion(s) failed\n`);
    process.exit(1);
  }
  process.stdout.write('cutover-audit: all assertions passed\n');
}

await main();
