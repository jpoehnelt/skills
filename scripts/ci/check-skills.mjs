#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const IGNORED_TOP_DIRS = new Set([
  '.git',
  '.github',
  'bin',
  'node_modules',
  'schemas',
  'scripts',
  'tests',
]);

const KNOWN_SKILL_PREFIXES = [
  'agents-',
  'alchemy-',
  'cloudflare-',
  'comms-',
  'drizzle-',
  'effect-',
  'eng-',
  'gh-',
  'k8s-',
  'nix-',
  'reg-',
  'sentry-',
  'seo-',
  'svelte-',
  'ui-',
];

// Legitimate non-skill identifiers that happen to start with a skill prefix.
const NON_SKILL_BACKTICK_ALLOWLIST = new Set([
  'agents-manifest',
  'alchemy-cli',
  'cloudflare-workers',
  'drizzle-kit',
  'drizzle-orm',
  'effect-ts',
  'gh-pages',
  'nix-darwin-sync',
  'reg-suit-data',
  'svelte-check',
  'svelte-kit',
  'ui-surface-snapshot',
]);

const SUBJECTIVE_SLOP_WORDS = [
  'delve',
  'tapestry',
  'substrate',
  'flywheel',
  'leverage',
  'utilize',
  'crucial',
  'pivotal',
];

const EMOJI_RE = /\p{Extended_Pictographic}/u;

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { raw: null, fields: {}, body: content };
  const raw = match[1];
  const fields = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    fields[key] = val;
  }
  return { raw, fields, body: content.slice(match[0].length) };
}

function stripFencedCodeBlocks(markdown) {
  return markdown.replace(/^```[\s\S]*?^```/gm, '');
}

function loadPrivateNameTerms(env = process.env) {
  const terms = [];
  if (env.PRIVATE_NAMES) {
    for (const item of env.PRIVATE_NAMES.split(/[\n,]+/)) {
      const t = item.trim();
      if (t && !t.startsWith('#')) terms.push(t);
    }
  }
  if (env.PRIVATE_NAMES_FILE && existsSync(env.PRIVATE_NAMES_FILE)) {
    const text = readFileSync(env.PRIVATE_NAMES_FILE, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith('#')) terms.push(t);
    }
  }
  return terms;
}

export function validateRepo(rootDir = REPO_ROOT, env = process.env) {
  const errors = [];
  const warnings = [];
  const privateTerms = loadPrivateNameTerms(env);

  const skillDirs = readdirSync(rootDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !IGNORED_TOP_DIRS.has(d.name))
    .map((d) => d.name)
    .sort();

  const skillSet = new Set(skillDirs);

  if (skillDirs.length === 0) {
    errors.push('No skill directories found at repository root');
    return { ok: false, errors, warnings, skillCount: 0 };
  }

  for (const dir of skillDirs) {
    const skillMdPath = path.join(rootDir, dir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      errors.push(`${dir}: missing SKILL.md`);
      continue;
    }

    const content = readFileSync(skillMdPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const lineCount = lines.at(-1) === '' ? lines.length - 1 : lines.length;

    if (lineCount > 120) {
      errors.push(`${dir}/SKILL.md: exceeds 120-line hard cap (${lineCount} lines)`);
    } else if (lineCount > 100) {
      warnings.push(`${dir}/SKILL.md: exceeds 100-line target (${lineCount} lines)`);
    }

    const { raw, fields, body } = parseFrontmatter(content);
    if (!raw) {
      errors.push(`${dir}/SKILL.md: missing YAML frontmatter`);
      continue;
    }

    if (fields.name !== dir) {
      errors.push(`${dir}/SKILL.md: frontmatter name "${fields.name || ''}" does not match folder "${dir}"`);
    }
    if (!fields.description) {
      errors.push(`${dir}/SKILL.md: missing frontmatter description`);
    } else {
      if (fields.description.length > 400) {
        errors.push(`${dir}/SKILL.md: description exceeds 400 chars (${fields.description.length})`);
      }
      if (!/\buse\s+(when|for)\b/i.test(fields.description)) {
        errors.push(`${dir}/SKILL.md: description must include a "Use when" or "Use for" trigger`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'disable-model-invocation')) {
      errors.push(`${dir}/SKILL.md: forbidden frontmatter key "disable-model-invocation"`);
    }

    const prose = stripFencedCodeBlocks(body);

    // Structural punctuation & emoji bans (errors).
    // Allow comms-unslop to illustrate banned punctuation inside inline code ticks only.
    const proseWithoutInlineCode = prose.replace(/`[^`]*`/g, '');
    if (proseWithoutInlineCode.includes('\u2014')) {
      errors.push(`${dir}/SKILL.md: contains em dash (\u2014) in prose`);
    }
    if (proseWithoutInlineCode.includes('\u2013')) {
      errors.push(`${dir}/SKILL.md: contains en dash (\u2013) in prose`);
    }
    if (/[\u201c\u201d\u2018\u2019]/.test(proseWithoutInlineCode)) {
      errors.push(`${dir}/SKILL.md: contains curly quotes in prose`);
    }
    if (EMOJI_RE.test(proseWithoutInlineCode)) {
      errors.push(`${dir}/SKILL.md: contains emoji in prose`);
    }

    // Subjective AI vocabulary words stay warnings (per policy).
    for (const word of SUBJECTIVE_SLOP_WORDS) {
      const re = new RegExp(`\\b${word}\\b`, 'i');
      if (re.test(proseWithoutInlineCode)) {
        warnings.push(`${dir}/SKILL.md: contains subjective AI-vocab word "${word}"`);
      }
    }

    // Structural private-leak checks (always errors).
    if (/\/Users\/[A-Za-z0-9_.-]+\//.test(content) && dir !== 'nix-darwin') {
      errors.push(`${dir}/SKILL.md: contains hardcoded macOS home path (/Users/...)`);
    }
    if (/[A-Za-z0-9-]+\.ts\.net\b/.test(content)) {
      errors.push(`${dir}/SKILL.md: contains private Tailscale domain (.ts.net)`);
    }
    for (const term of privateTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      if (re.test(content)) {
        errors.push(`${dir}/SKILL.md: contains private name "${term}"`);
      }
    }

    // Check script links exist and no stale .sh script paths remain.
    for (const scriptMatch of content.matchAll(/(?:\.\/)?scripts\/([A-Za-z0-9._-]+)/g)) {
      const scriptFile = scriptMatch[1];
      if (scriptFile.endsWith('.sh')) {
        errors.push(`${dir}/SKILL.md: references legacy .sh script scripts/${scriptFile} (migrate to .mjs)`);
      }
      const scriptFullPath = path.join(rootDir, dir, 'scripts', scriptFile);
      if (!existsSync(scriptFullPath)) {
        errors.push(`${dir}/SKILL.md: references missing script scripts/${scriptFile}`);
      }
    }

    // Check backticked cross-references to skills resolve to existing skills.
    for (const tickMatch of prose.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
      const token = tickMatch[1];
      if (NON_SKILL_BACKTICK_ALLOWLIST.has(token)) continue;
      if (KNOWN_SKILL_PREFIXES.some((prefix) => token.startsWith(prefix))) {
        if (!skillSet.has(token)) {
          errors.push(`${dir}/SKILL.md: backticked skill reference \`${token}\` does not exist`);
        }
      }
    }
  }

  // README.md 1:1 parity check.
  const readmePath = path.join(rootDir, 'README.md');
  if (!existsSync(readmePath)) {
    errors.push('README.md is missing');
  } else {
    const readme = readFileSync(readmePath, 'utf8');
    const readmeSkills = new Set();
    for (const m of readme.matchAll(/\[([a-z0-9-]+)\]\(\.\/([a-z0-9-]+)\/SKILL\.md\)/g)) {
      if (m[1] !== m[2]) {
        errors.push(`README.md: mismatched link label "${m[1]}" vs path "./${m[2]}/SKILL.md"`);
      }
      readmeSkills.add(m[2]);
    }
    for (const dir of skillDirs) {
      if (!readmeSkills.has(dir)) {
        errors.push(`README.md: missing table row for skill "${dir}"`);
      }
    }
    for (const listed of readmeSkills) {
      if (!skillSet.has(listed)) {
        errors.push(`README.md: lists non-existent skill "${listed}"`);
      }
    }
  }

  // profiles.json 1:1 parity check.
  const profilesPath = path.join(rootDir, 'profiles.json');
  if (!existsSync(profilesPath)) {
    errors.push('profiles.json is missing');
  } else {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(profilesPath, 'utf8'));
    } catch (err) {
      errors.push(`profiles.json: invalid JSON (${err.message})`);
      parsed = null;
    }
    if (parsed && typeof parsed.profiles === 'object' && parsed.profiles !== null) {
      const profileSkills = new Set();
      for (const [profileName, list] of Object.entries(parsed.profiles)) {
        if (!Array.isArray(list)) {
          errors.push(`profiles.json: profile "${profileName}" must be an array`);
          continue;
        }
        for (const s of list) {
          if (!skillSet.has(s)) {
            errors.push(`profiles.json: profile "${profileName}" references unknown skill "${s}"`);
          }
          profileSkills.add(s);
        }
      }
      for (const dir of skillDirs) {
        if (!profileSkills.has(dir)) {
          errors.push(`profiles.json: skill "${dir}" is not assigned to any profile`);
        }
      }
    } else if (parsed) {
      errors.push('profiles.json: missing top-level "profiles" object');
    }
  }

  return { ok: errors.length === 0, errors, warnings, skillCount: skillDirs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateRepo();
  for (const w of result.warnings) {
    process.stderr.write(`WARN: ${w}\n`);
  }
  for (const e of result.errors) {
    process.stderr.write(`ERROR: ${e}\n`);
  }
  if (!result.ok) {
    process.stderr.write(`check-skills: failed with ${result.errors.length} error(s) across ${result.skillCount} skills\n`);
    process.exit(1);
  }
  process.stdout.write(`check-skills: OK (${result.skillCount} skills, ${result.warnings.length} warning(s))\n`);
}
