import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'gh-pr-feedback-loop', 'scripts', 'pr-snapshot.mjs');

function writeStub(binDir, name, scriptBody) {
  const p = path.join(binDir, name);
  writeFileSync(p, `#!/usr/bin/env node\n${scriptBody}\n`);
  chmodSync(p, 0o755);
  return p;
}

describe('pr-snapshot.mjs', () => {
  it('renders summary, detects branch reuse, handles multi-page pagination, bot quota, and sticky markers', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'pr-snap-'));
    const binDir = path.join(tmp, 'bin');
    mkdirSync(binDir);
    const nowIso = new Date().toISOString();

    writeStub(
      binDir,
      'gh',
      `
      const args = process.argv.slice(2);
      const endpoint = args[1] || '';
      if (endpoint === 'repos/acme/app/pulls/42') {
        console.log(JSON.stringify({
          number: 42,
          title: 'feat: widget',
          html_url: 'https://github.com/acme/app/pull/42',
          state: 'open',
          draft: false,
          merged: false,
          head: { ref: 'feat/reused', sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', user: { login: 'acme' } },
          base: { ref: 'main', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
          mergeable: true,
          mergeable_state: 'clean',
          body: 'PR body'
        }));
      } else if (endpoint.startsWith('repos/acme/app/pulls?state=closed')) {
        console.log(JSON.stringify([{ number: 41, merged_at: '${nowIso}' }]));
      } else if (endpoint.includes('/check-runs')) {
        // Two concatenated pages (simulating gh api --paginate).
        process.stdout.write(JSON.stringify({ check_runs: [{ status: 'completed', conclusion: 'success', name: 'lint', html_url: 'https://ci/1' }] }));
        process.stdout.write(JSON.stringify({ check_runs: [{ status: 'completed', conclusion: 'failure', name: 'test-page-2', html_url: 'https://ci/2' }] }));
      } else if (endpoint.includes('/status')) {
        console.log(JSON.stringify({ statuses: [{ state: 'pending', context: 'visual', target_url: 'https://vis/1' }] }));
      } else if (endpoint.endsWith('/reviews?per_page=100')) {
        console.log(JSON.stringify([{ id: 10, state: 'COMMENTED', user: { login: 'chatgpt-codex-connector[bot]' }, commit_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', body: 'Looks good' }]));
      } else if (endpoint === 'graphql') {
        // Two concatenated GraphQL pages of reviewThreads.
        process.stdout.write(JSON.stringify({
          data: { repository: { pullRequest: { reviewThreads: { nodes: [
            { id: 'T1', isResolved: true, isOutdated: false, path: 'a.ts', line: 1, comments: { totalCount: 1, nodes: [{ author: { login: 'rev' }, body: 'fixed' }] }, latest: { nodes: [{ author: { login: 'rev' }, body: 'fixed' }] } }
          ] } } } }
        }));
        process.stdout.write(JSON.stringify({
          data: { repository: { pullRequest: { reviewThreads: { nodes: [
            { id: 'T2', isResolved: false, isOutdated: false, path: 'b.ts', line: 9, comments: { totalCount: 2, nodes: [{ author: { login: 'rev' }, body: 'page 2 bug' }] }, latest: { nodes: [{ author: { login: 'bot' }, body: 'reply' }] } }
          ] } } } }
        }));
      } else if (endpoint.includes('/pulls/42/comments')) {
        console.log(JSON.stringify([{ id: 77, path: 'b.ts', line: 9, user: { login: 'rev' }, position: 3 }]));
      } else if (endpoint.includes('/issues/42/comments')) {
        process.stdout.write(JSON.stringify([{ id: 100, user: { login: 'gemini-code-assist[bot]' }, created_at: '${nowIso}', body: 'You have reached your daily quota limit.' }]));
        process.stdout.write(JSON.stringify([{ id: 101, user: { login: 'visual-bot[bot]' }, created_at: '${nowIso}', body: '<!-- reg-suit-data: abc -->\\nDiff ready' }]));
      } else {
        process.stderr.write('unexpected endpoint: ' + endpoint);
        process.exit(1);
      }
      `,
    );

    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '42', 'acme/app'], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.match(stdout, /--- summary ---/);
      assert.match(stdout, /"branch_reused_from_pr": 41/);
      assert.match(stdout, /"failing_checks": 1/);
      assert.match(stdout, /"pending_checks": 1/);
      assert.match(stdout, /"unresolved_threads": 1/);
      assert.match(stdout, /"codex_reviewed_head_sha": true/);
      assert.match(stdout, /"bot_quota_active": true/);
      assert.match(stdout, /test-page-2/);
      assert.match(stdout, /T2\tb\.ts\t9/);
      assert.match(stdout, /MARKER\t101\tvisual-bot\[bot\]\treg-suit-data: abc/);
      assert.match(stdout, /QUOTA\t100\tgemini-code-assist\[bot\]/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports partial section failures honestly and exits non-zero when GraphQL fails', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'pr-snap-fail-'));
    const binDir = path.join(tmp, 'bin');
    mkdirSync(binDir);

    writeStub(
      binDir,
      'gh',
      `
      const endpoint = process.argv[3] || '';
      if (endpoint === 'repos/acme/app/pulls/5') {
        console.log(JSON.stringify({
          number: 5, title: 't', html_url: 'u', state: 'open', draft: false, merged: false,
          head: { ref: 'feat/ok', sha: '1111111111111111111111111111111111111111' },
          base: { ref: 'main', sha: '2222222222222222222222222222222222222222' },
        }));
      } else if (endpoint === 'graphql') {
        process.stderr.write('HTTP 500');
        process.exit(1);
      } else if (endpoint.includes('/check-runs')) {
        console.log(JSON.stringify({ check_runs: [] }));
      } else if (endpoint.includes('/status')) {
        console.log(JSON.stringify({ statuses: [] }));
      } else {
        console.log('[]');
      }
      `,
    );

    try {
      let failedErr = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '5', 'acme/app'], {
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (err) {
        failedErr = err;
      }
      assert.ok(failedErr, 'expected non-zero exit when GraphQL fails');
      assert.equal(failedErr.code, 1);
      assert.match(failedErr.stderr, /GraphQL failed/);
      assert.match(failedErr.stdout, /"unresolved_threads": "unavailable"/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('kills hung child process group on GH_TIMEOUT without leaving orphan grandchild', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'pr-snap-to-'));
    const binDir = path.join(tmp, 'bin');
    const pidFile = path.join(tmp, 'grandchild.pid');
    mkdirSync(binDir);

    const ghStub = path.join(binDir, 'gh');
    writeFileSync(
      ghStub,
      `#!/usr/bin/env bash\nsleep 60 &\necho $! > "${pidFile}"\nwait\n`,
    );
    chmodSync(ghStub, 0o755);

    try {
      let err = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '9', 'acme/app'], {
          env: { ...process.env, GH_TIMEOUT: '1', PATH: `${binDir}:${process.env.PATH}` },
          timeout: 10_000,
        });
      } catch (e) {
        err = e;
      }
      assert.ok(err, 'expected timeout failure');
      assert.equal(err.code, 124);
      const gcPid = Number(readFileSync(pidFile, 'utf8').trim());
      assert.ok(Number.isInteger(gcPid) && gcPid > 0);
      // Give OS a brief tick to reap the process group, then verify grandchild is dead.
      await new Promise((r) => setTimeout(r, 150));
      let alive = true;
      try {
        process.kill(gcPid, 0);
      } catch {
        alive = false;
      }
      assert.equal(alive, false, `orphan grandchild ${gcPid} survived timeout`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
