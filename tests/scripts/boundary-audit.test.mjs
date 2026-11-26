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
const SCRIPT = path.join(REPO_ROOT, 'effect-boundary-validation', 'scripts', 'boundary-audit.mjs');

function makeGitFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'boundary-fix-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

describe('boundary-audit.mjs', () => {
  it('handles dash-leading paths safely and detects multiline/commented banned imports', async () => {
    const repo = makeGitFixture();
    try {
      const weirdFile = '--pre=cmd.ts';
      writeFileSync(
        path.join(repo, weirdFile),
        'import /* sneaky comment */\n  { z } from "zod";\nexport const x = JSON.parse("{}");\n',
      );
      let err = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '--ban', 'zod', '--', weirdFile], { cwd: repo });
      } catch (e) {
        err = e;
      }
      assert.ok(err, 'expected exit 1 for banned zod import');
      assert.equal(err.code, 1);
      assert.match(err.stdout, /--pre=cmd\.ts/);
      assert.match(err.stdout, /from "zod"/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('refuses untrusted sgconfig.yml (customLanguages and flow-style root) with exit 2', async () => {
    const repo = makeGitFixture();
    try {
      writeFileSync(path.join(repo, 'index.ts'), 'export const a = 1;\n');
      writeFileSync(
        path.join(repo, 'sgconfig.yml'),
        'ruleDirs:\n  - rules\ncustomLanguages:\n  foo:\n    libraryPath: ./evil.so\n',
      );
      let err1 = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '--rule', 'no-raw-json'], { cwd: repo });
      } catch (e) {
        err1 = e;
      }
      assert.ok(err1);
      assert.equal(err1.code, 2);
      assert.match(err1.stderr, /refusing --rule: sgconfig\.yml/);

      // Flow-style root mapping must also be refused.
      writeFileSync(path.join(repo, 'sgconfig.yml'), '{ ruleDirs: ["rules"] }\n');
      let err2 = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '--rule', 'no-raw-json'], { cwd: repo });
      } catch (e) {
        err2 = e;
      }
      assert.ok(err2);
      assert.equal(err2.code, 2);
      assert.match(err2.stderr, /refusing --rule: sgconfig\.yml/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('refuses tracked node_modules binaries and runs stubbed ast-grep cleanly when safe', async () => {
    const repo = makeGitFixture();
    const binDir = path.join(repo, '.stub-bin');
    mkdirSync(binDir);
    try {
      writeFileSync(path.join(repo, 'index.ts'), 'export const a = 1;\n');
      writeFileSync(path.join(repo, 'sgconfig.yml'), 'ruleDirs:\n  - rules\n');

      // 1. Safe checkout with stubbed ast-grep on PATH returning a finding (exit 1).
      const sgStub = path.join(binDir, 'ast-grep');
      writeFileSync(
        sgStub,
        `#!/usr/bin/env node
        const args = process.argv.slice(2);
        if (args.includes('--inspect')) {
          process.stderr.write('entity|rule|no-raw-json: rules/no-raw-json.yml\\n');
          process.exit(0);
        }
        process.stdout.write('index.ts:1:1 error[no-raw-json]\\n');
        process.exit(1);
        `,
      );
      chmodSync(sgStub, 0o755);

      let findingErr = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '--rule', 'no-raw-json', 'index.ts'], {
          cwd: repo,
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (e) {
        findingErr = e;
      }
      assert.ok(findingErr);
      assert.equal(findingErr.code, 1);
      assert.match(findingErr.stdout, /error\[no-raw-json\]/);

      // 2. Tracked node_modules must be refused with exit 2.
      mkdirSync(path.join(repo, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(path.join(repo, 'node_modules', '.bin', 'ast-grep'), '#!/bin/sh\necho pwned\n');
      chmodSync(path.join(repo, 'node_modules', '.bin', 'ast-grep'), 0o755);
      execFileSync('git', ['add', '-f', 'node_modules/.bin/ast-grep'], { cwd: repo });

      let trackedErr = null;
      try {
        await execFileAsync(process.execPath, [SCRIPT, '--rule', 'no-raw-json', 'index.ts'], {
          cwd: repo,
          env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
        });
      } catch (e) {
        trackedErr = e;
      }
      assert.ok(trackedErr);
      assert.equal(trackedErr.code, 2);
      assert.match(trackedErr.stderr, /node_modules has tracked files/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
