import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkSkills, computeSkillHashes, main, pullSkills, statusSkills } from '../scripts/skills-sync.mjs';

function makeFixtureSource() {
  const dir = mkdtempSync(path.join(tmpdir(), 'skills-src-'));
  writeFileSync(
    path.join(dir, 'profiles.json'),
    JSON.stringify(
      {
        version: 1,
        profiles: {
          base: ['alpha-skill', 'beta-skill'],
          extra: ['gamma-skill'],
        },
      },
      null,
      2,
    ),
  );
  for (const name of ['alpha-skill', 'beta-skill', 'gamma-skill']) {
    mkdirSync(path.join(dir, name, 'scripts'), { recursive: true });
    mkdirSync(path.join(dir, name, 'references'), { recursive: true });
    writeFileSync(
      path.join(dir, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Test ${name}. Use when testing.\n---\n\n# ${name}\n`,
    );
    writeFileSync(path.join(dir, name, 'scripts', 'helper.mjs'), `#!/usr/bin/env node\nconsole.log('${name}');\n`);
    writeFileSync(path.join(dir, name, 'references', 'notes.md'), `# Notes for ${name}\n`);
  }
  return dir;
}

describe('skills-sync', () => {
  it('pulls profiles, writes v2 lockfile with treeHash over scripts/references, creates symlinks, and passes offline check', async () => {
    const srcDir = makeFixtureSource();
    const repoDir = mkdtempSync(path.join(tmpdir(), 'skills-repo-'));
    try {
      mkdirSync(path.join(repoDir, '.agents', 'skills', 'repo-local-skill'), { recursive: true });
      writeFileSync(
        path.join(repoDir, '.agents', 'skills', 'repo-local-skill', 'SKILL.md'),
        '---\nname: repo-local-skill\ndescription: Local skill. Use when testing.\n---\n\n# Local\n',
      );
      writeFileSync(
        path.join(repoDir, '.agents', 'skills.json'),
        JSON.stringify(
          {
            targetDir: '.agents/skills',
            symlinks: ['.claude/skills'],
            sources: {
              'jpoehnelt/skills': {
                repo: 'jpoehnelt/skills',
                ref: 'main',
                profiles: ['base'],
                include: ['gamma-skill'],
                exclude: ['beta-skill'],
              },
            },
            local: ['repo-local-skill'],
          },
          null,
          2,
        ),
      );

      const summary = await pullSkills({
        cwd: repoDir,
        localSources: { 'jpoehnelt/skills': srcDir },
      });
      assert.deepEqual(summary.added.sort(), ['alpha-skill', 'gamma-skill']);

      const lock = JSON.parse(readFileSync(path.join(repoDir, 'skills-lock.json'), 'utf8'));
      assert.equal(lock.version, 2);
      assert.ok(lock.skills['alpha-skill'].treeHash);
      assert.ok(lock.skills['alpha-skill'].files['SKILL.md']);
      assert.ok(lock.skills['alpha-skill'].files['scripts/helper.mjs']);
      assert.ok(lock.skills['alpha-skill'].files['references/notes.md']);
      assert.equal(lock.skills['beta-skill'], undefined);
      assert.ok(existsSync(path.join(repoDir, '.claude', 'skills', 'alpha-skill', 'SKILL.md')));

      const checkOk = checkSkills({ cwd: repoDir });
      assert.equal(checkOk.ok, true, checkOk.errors.join('\n'));

      const rows = statusSkills({ cwd: repoDir });
      assert.equal(rows.length, 3);

      // Mutating a script inside a managed skill must fail offline check (treeHash mismatch).
      writeFileSync(
        path.join(repoDir, '.agents', 'skills', 'alpha-skill', 'scripts', 'helper.mjs'),
        '#!/usr/bin/env node\nconsole.log("tampered");\n',
      );
      const checkScriptDrift = checkSkills({ cwd: repoDir });
      assert.equal(checkScriptDrift.ok, false);
      assert.match(checkScriptDrift.errors.join('\n'), /Tree hash mismatch/);

      // Re-pulling without --force must refuse to overwrite local edits to managed skills.
      await assert.rejects(
        () => pullSkills({ cwd: repoDir, localSources: { 'jpoehnelt/skills': srcDir } }),
        /has local edits/,
      );

      // Re-pulling with --force restores clean state.
      await pullSkills({ cwd: repoDir, force: true, localSources: { 'jpoehnelt/skills': srcDir } });
      assert.equal(checkSkills({ cwd: repoDir }).ok, true);

      // An unmanaged directory inside .agents/skills/ must fail offline check.
      mkdirSync(path.join(repoDir, '.agents', 'skills', 'rogue-skill'), { recursive: true });
      writeFileSync(path.join(repoDir, '.agents', 'skills', 'rogue-skill', 'SKILL.md'), '# rogue\n');
      const checkRogue = checkSkills({ cwd: repoDir });
      assert.equal(checkRogue.ok, false);
      assert.match(checkRogue.errors.join('\n'), /Unmanaged skill folder/);
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects v1 lockfiles lacking treeHash and removes skills dropped from manifest without touching local[]', async () => {
    const srcDir = makeFixtureSource();
    const repoDir = mkdtempSync(path.join(tmpdir(), 'skills-repo-'));
    try {
      mkdirSync(path.join(repoDir, '.agents', 'skills', 'keep-local'), { recursive: true });
      writeFileSync(path.join(repoDir, '.agents', 'skills', 'keep-local', 'SKILL.md'), '# local\n');
      writeFileSync(
        path.join(repoDir, '.agents', 'skills.json'),
        JSON.stringify({
          targetDir: '.agents/skills',
          sources: {
            'jpoehnelt/skills': { repo: 'jpoehnelt/skills', include: ['alpha-skill', 'beta-skill'] },
          },
          local: ['keep-local'],
        }),
      );

      await pullSkills({ cwd: repoDir, localSources: { 'jpoehnelt/skills': srcDir } });
      assert.ok(existsSync(path.join(repoDir, '.agents', 'skills', 'beta-skill', 'SKILL.md')));

      // Drop beta-skill from manifest.
      writeFileSync(
        path.join(repoDir, '.agents', 'skills.json'),
        JSON.stringify({
          targetDir: '.agents/skills',
          sources: {
            'jpoehnelt/skills': { repo: 'jpoehnelt/skills', include: ['alpha-skill'] },
          },
          local: ['keep-local'],
        }),
      );
      const res = await pullSkills({ cwd: repoDir, localSources: { 'jpoehnelt/skills': srcDir } });
      assert.deepEqual(res.removed, ['beta-skill']);
      assert.equal(existsSync(path.join(repoDir, '.agents', 'skills', 'beta-skill')), false);
      assert.equal(existsSync(path.join(repoDir, '.agents', 'skills', 'keep-local', 'SKILL.md')), true);

      // Downgrade lockfile to v1 and verify check fails.
      writeFileSync(path.join(repoDir, 'skills-lock.json'), JSON.stringify({ version: 1, skills: {} }));
      const v1Check = checkSkills({ cwd: repoDir });
      assert.equal(v1Check.ok, false);
      assert.match(v1Check.errors.join('\n'), /version 2/);

      // CLI exit code verification.
      let stderr = '';
      const code = await main(['check', '--cwd', repoDir], {
        stdout: { write() {} },
        stderr: { write(s) { stderr += s; } },
      });
      assert.equal(code, 1);
      assert.match(stderr, /FAIL/);
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('computes deterministic treeHash independent of traversal order', () => {
    const dir = makeFixtureSource();
    try {
      const h1 = computeSkillHashes(path.join(dir, 'alpha-skill'));
      const h2 = computeSkillHashes(path.join(dir, 'alpha-skill'));
      assert.equal(h1.treeHash, h2.treeHash);
      assert.equal(h1.computedHash, h2.computedHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
