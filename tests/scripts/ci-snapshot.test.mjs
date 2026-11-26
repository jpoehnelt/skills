import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'gh-ci-triage', 'scripts', 'ci-snapshot.mjs');

function writeStub(binDir, name, body) {
  const p = path.join(binDir, name);
  writeFileSync(p, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(p, 0o755);
}

describe('ci-snapshot.mjs', () => {
  it('fetches paginated PR check runs, statuses, workflow runs, and base branch comparison', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'ci-snap-'));
    const binDir = path.join(tmp, 'bin');
    mkdirSync(binDir);

    writeStub(
      binDir,
      'gh',
      `
      const endpoint = process.argv[3] || '';
      if (endpoint === 'repos/acme/app/pulls/12') {
        console.log(JSON.stringify({
          number: 12, html_url: 'https://github.com/acme/app/pull/12', state: 'open', draft: false, merged: false,
          base: { ref: 'main' }, head: { ref: 'feat/x', sha: '1111111111111111111111111111111111111111' }, mergeable_state: 'unstable'
        }));
      } else if (endpoint.includes('/check-runs')) {
        process.stdout.write(JSON.stringify({ check_runs: [{ status: 'completed', conclusion: 'success', name: 'build', html_url: 'u1' }] }));
        process.stdout.write(JSON.stringify({ check_runs: [{ status: 'completed', conclusion: 'failure', name: 'e2e', html_url: 'u2' }] }));
      } else if (endpoint.includes('/status')) {
        console.log(JSON.stringify({ statuses: [{ state: 'failure', context: 'visual', target_url: 'u3' }] }));
      } else if (endpoint.includes('head_sha=')) {
        console.log(JSON.stringify({ workflow_runs: [{ id: 900, name: 'CI', status: 'completed', conclusion: 'failure', html_url: 'u4' }] }));
      } else if (endpoint === 'repos/acme/app/actions/workflows/ci.yml/runs') {
        console.log(JSON.stringify({ workflow_runs: [{ id: 899, name: 'CI', status: 'completed', conclusion: 'success', head_sha: '22222222deadbeef', html_url: 'u5' }] }));
      } else {
        process.exit(1);
      }
      `,
    );

    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '-R', 'acme/app', '-w', 'ci.yml', '12'], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.match(stdout, /completed\tfailure\te2e/);
      assert.match(stdout, /failure\tvisual/);
      assert.match(stdout, /Recent runs on main for ci\.yml/);
      assert.match(stdout, /899\tCI\tcompleted\tsuccess\t22222222/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('exits non-zero when a section fails while still printing remaining sections', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'ci-snap-err-'));
    const binDir = path.join(tmp, 'bin');
    mkdirSync(binDir);

    writeStub(
      binDir,
      'gh',
      `
      const endpoint = process.argv[3] || '';
      if (endpoint === 'repos/acme/app') {
        console.log(JSON.stringify({ default_branch: 'main' }));
      } else {
        process.stderr.write('502 Bad Gateway');
        process.exit(1);
      }
      `,
    );

    try {
      let err = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '-R', 'acme/app'], {
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.equal(err.code, 1);
      assert.match(err.stderr, /section failed: recent runs on main/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
