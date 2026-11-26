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
const SCRIPT = path.join(REPO_ROOT, 'gh-pr-commit-review', 'scripts', 'review-candidates.mjs');

describe('review-candidates.mjs', () => {
  it('filters multi-page open PRs strictly after UTC cutoff', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'rev-cand-'));
    const binDir = path.join(tmp, 'bin');
    mkdirSync(binDir);
    const ghStub = path.join(binDir, 'gh');
    writeFileSync(
      ghStub,
      `#!/usr/bin/env node
      process.stdout.write(JSON.stringify([
        { number: 10, updated_at: '2026-11-26T05:00:00Z', title: 'new pr', html_url: 'https://github.com/a/b/pull/10' },
        { number: 9, updated_at: '2026-11-25T05:00:00Z', title: 'old pr', html_url: 'https://github.com/a/b/pull/9' }
      ]));
      process.stdout.write(JSON.stringify([
        { number: 11, updated_at: '2026-11-26T06:00:00Z', title: 'page 2 pr', html_url: 'https://github.com/a/b/pull/11' }
      ]));
      `,
    );
    chmodSync(ghStub, 0o755);

    try {
      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '2026-11-26T00:00:00Z', 'a/b'], {
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
      assert.match(stdout, /10\t2026-11-26T05:00:00Z\tnew pr/);
      assert.match(stdout, /11\t2026-11-26T06:00:00Z\tpage 2 pr/);
      assert.doesNotMatch(stdout, /\b9\t/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects impossible calendar dates with exit 2', async () => {
    let err = null;
    try {
      await execFileAsync(process.execPath, [SCRIPT, '2026-02-30', 'a/b']);
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 2);
    assert.match(err.stderr, /not a real UTC date/);
  });
});
