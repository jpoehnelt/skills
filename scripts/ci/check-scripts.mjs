#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IGNORED_TOP_DIRS = new Set(['.git', '.github', 'bin', 'node_modules', 'schemas', 'scripts', 'tests']);

export function validateScripts(rootDir = REPO_ROOT) {
  const errors = [];
  let checked = 0;

  const skillDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !IGNORED_TOP_DIRS.has(d.name))
    .map((d) => d.name)
    .sort();

  for (const dir of skillDirs) {
    const scriptsDir = path.join(rootDir, dir, 'scripts');
    if (!existsSync(scriptsDir)) continue;
    const files = readdirSync(scriptsDir, { withFileTypes: true }).filter((e) => e.isFile());
    for (const file of files) {
      const full = path.join(scriptsDir, file.name);
      const rel = `${dir}/scripts/${file.name}`;
      checked += 1;

      if (file.name.endsWith('.sh')) {
        errors.push(`${rel}: legacy Bash script must be migrated to zero-dep Node 22+ .mjs`);
        continue;
      }
      if (!file.name.endsWith('.mjs')) {
        errors.push(`${rel}: unexpected helper script extension (use .mjs)`);
        continue;
      }

      const content = readFileSync(full, 'utf8');
      if (!content.startsWith('#!/usr/bin/env node\n')) {
        errors.push(`${rel}: must start with #!/usr/bin/env node`);
      }

      const mode = statSync(full).mode;
      if ((mode & 0o111) === 0) {
        errors.push(`${rel}: must be executable (chmod +x)`);
      }

      if (/perl\s+-e/.test(content)) {
        errors.push(`${rel}: forbidden legacy perl timeout shim`);
      }

      // Syntax check with node --check.
      try {
        execFileSync(process.execPath, ['--check', full], { stdio: 'pipe', timeout: 10_000 });
      } catch (err) {
        errors.push(`${rel}: syntax error (${err.stderr?.toString('utf8').trim() || err.message})`);
      }

      // Verify zero external npm package imports (only node:* built-ins or relative imports).
      for (const imp of content.matchAll(/^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/gm)) {
        const spec = imp[1];
        if (!spec.startsWith('node:') && !spec.startsWith('./') && !spec.startsWith('../')) {
          errors.push(`${rel}: forbidden external dependency import "${spec}" (skill scripts must be zero-dep)`);
        }
      }

      // Every skill helper script must have a dedicated test file.
      const base = file.name.replace(/\.mjs$/, '');
      const testPath = path.join(rootDir, 'tests', 'scripts', `${base}.test.mjs`);
      if (!existsSync(testPath)) {
        errors.push(`${rel}: missing fixture test file tests/scripts/${base}.test.mjs`);
      }
    }
  }

  // Also syntax-check top-level bin/ and scripts/ .mjs files.
  for (const extraRel of ['bin/skills-sync.mjs', 'scripts/skills-sync.mjs', 'scripts/ci/check-skills.mjs', 'scripts/ci/check-scripts.mjs']) {
    const full = path.join(rootDir, extraRel);
    if (!existsSync(full)) continue;
    try {
      execFileSync(process.execPath, ['--check', full], { stdio: 'pipe', timeout: 10_000 });
    } catch (err) {
      errors.push(`${extraRel}: syntax error (${err.stderr?.toString('utf8').trim() || err.message})`);
    }
  }

  return { ok: errors.length === 0, errors, checked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateScripts();
  for (const e of result.errors) {
    process.stderr.write(`ERROR: ${e}\n`);
  }
  if (!result.ok) {
    process.stderr.write(`check-scripts: failed with ${result.errors.length} error(s)\n`);
    process.exit(1);
  }
  process.stdout.write(`check-scripts: OK (${result.checked} skill script(s) validated)\n`);
}
