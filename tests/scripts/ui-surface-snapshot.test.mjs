import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO_ROOT, 'svelte-ui-delivery', 'scripts', 'ui-surface-snapshot.mjs');

describe('ui-surface-snapshot.mjs', () => {
  it('handles dash-leading --root safely and lists components, routes, consumers, tokens, and stories', async () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ui-snap-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    try {
      mkdirSync(path.join(repo, '-ui', 'src', 'components', 'ui', 'button'), { recursive: true });
      mkdirSync(path.join(repo, '-ui', 'src', 'routes', 'settings'), { recursive: true });
      writeFileSync(path.join(repo, '-ui', 'src', 'components', 'ui', 'button', 'Button.svelte'), '<button><slot /></button>\n');
      writeFileSync(path.join(repo, '-ui', 'src', 'components', 'ui', 'button', 'Button.stories.ts'), 'export default {};\n');
      writeFileSync(path.join(repo, '-ui', 'src', 'routes', 'settings', '+page.svelte'), '<Button />\n');
      writeFileSync(path.join(repo, '-ui', 'src', 'app.css'), ':root {\n  --color-ink: #111;\n}\n');

      const { stdout } = await execFileAsync(process.execPath, [SCRIPT, '--root', '-ui', 'button'], { cwd: repo });
      assert.match(stdout, /Button\.svelte/);
      assert.match(stdout, /Button\.stories\.ts/);
      assert.match(stdout, /\+page\.svelte/);
      assert.match(stdout, /--color-ink/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('exits 2 on missing keyword or non-directory root', async () => {
    let err = null;
    try {
      await execFileAsync(process.execPath, [SCRIPT], { cwd: REPO_ROOT });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 2);
  });
});
