import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'eng-cutover-verification', 'scripts', 'cutover-audit.mjs');

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cutover-fix-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(path.join(dir, 'app.ts'), 'export const mode = "v2";\n');
  writeFileSync(path.join(dir, 'legacy.ts'), 'export const oldApi = true;\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir });
  rmSync(path.join(dir, 'legacy.ts'));
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'retire legacy'], { cwd: dir });
  return dir;
}

describe('cutover-audit.mjs', () => {
  it('passes retired, required, removed-scope, test, live-check, and --final on clean tree', async () => {
    const repo = makeRepo();
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          SCRIPT,
          '--retired',
          'no-old-api:::app.ts:::oldApi',
          '--retired',
          'legacy-file-gone:::legacy.ts:::oldApi',
          '--required',
          'has-v2:::app.ts:::v2',
          '--test',
          'unit:::true',
          '--live-check',
          'probe:::echo live-ok',
          '--final',
        ],
        { cwd: repo },
      );
      assert.match(stdout, /PASS retired: no-old-api/);
      assert.match(stdout, /PASS retired: legacy-file-gone \(scope removed: legacy\.ts\)/);
      assert.match(stdout, /PASS required: has-v2/);
      assert.match(stdout, /PASS final: worktree is clean/);
      assert.match(stdout, /all assertions passed/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('fails --final when live-check is missing or worktree is dirty, and enforces --timeout', async () => {
    const repo = makeRepo();
    try {
      let err1 = null;
      try {
        await execFileAsync(
          process.execPath,
          [SCRIPT, '--required', 'has-v2:::app.ts:::v2', '--final'],
          { cwd: repo },
        );
      } catch (e) {
        err1 = e;
      }
      assert.ok(err1);
      assert.equal(err1.code, 1);
      assert.match(err1.stderr, /at least one --live-check is required/);

      let err2 = null;
      try {
        await execFileAsync(
          process.execPath,
          [SCRIPT, '--timeout', '1', '--test', 'hang:::sleep 30'],
          { cwd: repo, timeout: 10_000 },
        );
      } catch (e) {
        err2 = e;
      }
      assert.ok(err2);
      assert.equal(err2.code, 1);
      assert.match(err2.stderr, /timed out after 1s/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
