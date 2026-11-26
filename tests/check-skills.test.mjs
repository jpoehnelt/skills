import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { validateRepo } from '../scripts/ci/check-skills.mjs';

function makeMiniRepo(skillContent, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-skills-'));
  const skillName = extra.skillName || 'eng-sample';
  mkdirSync(path.join(dir, skillName), { recursive: true });
  writeFileSync(path.join(dir, skillName, 'SKILL.md'), skillContent);
  writeFileSync(
    path.join(dir, 'README.md'),
    extra.readme ?? `| [${skillName}](./${skillName}/SKILL.md) | Sample skill. |\n`,
  );
  writeFileSync(
    path.join(dir, 'profiles.json'),
    extra.profiles ?? JSON.stringify({ version: 1, profiles: { base: [skillName] } }),
  );
  return dir;
}

describe('check-skills validator', () => {
  it('passes valid skill and keeps subjective AI-vocab words as warnings only', () => {
    const dir = makeMiniRepo(
      '---\nname: eng-sample\ndescription: Sample skill. Use when testing.\n---\n\n# Sample\n\nThis leverages a crucial check.\n',
    );
    try {
      const res = validateRepo(dir, {});
      assert.equal(res.ok, true, res.errors.join('\n'));
      assert.ok(res.warnings.some((w) => w.includes('crucial')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on disable-model-invocation, em dashes, private names, and broken cross-refs', () => {
    const dir = makeMiniRepo(
      [
        '---',
        'name: eng-sample',
        'description: Sample skill. Use when testing.',
        'disable-model-invocation: true',
        '---',
        '',
        '# Sample',
        '',
        'Uses an em dash \u2014 and secretcorp and `eng-nonexistent-skill`.',
      ].join('\n'),
    );
    try {
      const res = validateRepo(dir, { PRIVATE_NAMES: 'secretcorp' });
      assert.equal(res.ok, false);
      const joined = res.errors.join('\n');
      assert.match(joined, /disable-model-invocation/);
      assert.match(joined, /em dash/);
      assert.match(joined, /private name "secretcorp"/);
      assert.match(joined, /eng-nonexistent-skill/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on README and profiles.json parity drift', () => {
    const dir = makeMiniRepo(
      '---\nname: eng-sample\ndescription: Sample skill. Use when testing.\n---\n\n# Sample\n',
      { readme: '# Empty\n', profiles: JSON.stringify({ version: 1, profiles: { base: [] } }) },
    );
    try {
      const res = validateRepo(dir, {});
      assert.equal(res.ok, false);
      const joined = res.errors.join('\n');
      assert.match(joined, /README\.md: missing table row/);
      assert.match(joined, /profiles\.json: skill "eng-sample" is not assigned/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
