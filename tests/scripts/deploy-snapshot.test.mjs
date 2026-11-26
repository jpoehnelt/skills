import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'alchemy-infra', 'scripts', 'deploy-snapshot.mjs');

function makeRepoWithWorkflow() {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-snap-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    path.join(dir, '.github', 'workflows', 'deploy.yml'),
    [
      'name: Deploy',
      'on:',
      '  push:',
      'jobs:',
      '  prod:',
      '    environment: production',
      '    steps:',
      '      - run: pnpm deploy',
    ].join('\n'),
  );
  return dir;
}

describe('deploy-snapshot.mjs', () => {
  it('extracts workflow declarations offline with --local-only', async () => {
    const repo = makeRepoWithWorkflow();
    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '--local-only'], { cwd: repo });
      assert.match(stdout, /=== \.github\/workflows\/deploy\.yml ===/);
      assert.match(stdout, /environment: production/);
      assert.match(stdout, /run: pnpm deploy/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('prints recent runs via stubbed gh and exits non-zero when gh fails', async () => {
    const repo = makeRepoWithWorkflow();
    const binDir = path.join(repo, '.stub-bin');
    mkdirSync(binDir);
    const ghStub = path.join(binDir, 'gh');
    writeFileSync(
      ghStub,
      `#!/usr/bin/env node
      if (process.env.FAIL_GH === '1') { process.exit(1); }
      console.log(JSON.stringify({
        workflow_runs: [{ id: 55, head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', head_sha: 'abcdef123456', html_url: 'https://ci/55' }]
      }));
      `,
    );
    chmodSync(ghStub, 0o755);

    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '-R', 'acme/app', '-n', '3'], {
        cwd: repo,
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.match(stdout, /55\tmain\tpush\tcompleted\tsuccess\tabcdef12/);

      let err = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '-R', 'acme/app'], {
          cwd: repo,
          env: { ...process.env, FAIL_GH: '1', PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.equal(err.code, 1);
      assert.match(err.stderr, /section failed: recent runs for deploy\.yml/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
