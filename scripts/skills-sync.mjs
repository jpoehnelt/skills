import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db']);
const SAFE_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SHA_RE = /^[a-f0-9]{40}$/;

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function computeFileHash(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

function listFilesRecursive(dir, baseDir = dir) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const files = [];
  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(baseDir, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) {
      throw new Error(`Refusing symlink inside skill directory: ${rel}`);
    }
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(full, baseDir));
    } else if (entry.isFile()) {
      files.push({ rel, full });
    }
  }
  return files;
}

export function computeSkillHashes(skillDir) {
  const filesList = listFilesRecursive(skillDir);
  filesList.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const files = {};
  const treeLines = [];
  for (const { rel, full } of filesList) {
    const hex = computeFileHash(full);
    files[rel] = `sha256:${hex}`;
    treeLines.push(`${rel}\0${hex}\n`);
  }
  const skillMdEntry = files['SKILL.md'];
  if (!skillMdEntry) {
    throw new Error(`Missing SKILL.md in ${skillDir}`);
  }
  const computedHash = skillMdEntry.slice('sha256:'.length);
  const treeHash = sha256Buffer(Buffer.from(treeLines.join(''), 'utf8'));
  return { computedHash, treeHash, files };
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${label} (${filePath}): ${err.message}`);
  }
}

function assertSafeRelativePath(relPath, label) {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }
  if (path.isAbsolute(relPath)) {
    throw new Error(`Invalid ${label}: must be relative (${relPath})`);
  }
  const normalized = path.posix.normalize(relPath.replace(/\\/g, '/'));
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Path traversal refused in ${label}: ${relPath}`);
  }
  return normalized;
}

export function resolveSourceSkillList(sourceConfig, profilesData) {
  const result = new Map();
  if (Array.isArray(sourceConfig.profiles) && sourceConfig.profiles.length > 0) {
    if (!profilesData || typeof profilesData.profiles !== 'object') {
      throw new Error(`Source ${sourceConfig.repo} requests profiles, but profiles.json is missing`);
    }
    for (const profileName of sourceConfig.profiles) {
      const list = profilesData.profiles[profileName];
      if (!Array.isArray(list)) {
        throw new Error(`Unknown profile "${profileName}" in source ${sourceConfig.repo}`);
      }
      for (const skillName of list) {
        result.set(skillName, skillName);
      }
    }
  }
  if (Array.isArray(sourceConfig.include)) {
    for (const skillName of sourceConfig.include) {
      result.set(skillName, skillName);
    }
  }
  if (Array.isArray(sourceConfig.skills)) {
    for (const item of sourceConfig.skills) {
      if (!SAFE_SKILL_NAME.test(item.name)) {
        throw new Error(`Invalid skill name "${item.name}" in source ${sourceConfig.repo}`);
      }
      result.set(item.name, assertSafeRelativePath(item.path, `skill path for ${item.name}`));
    }
  }
  if (Array.isArray(sourceConfig.exclude)) {
    for (const skillName of sourceConfig.exclude) {
      result.delete(skillName);
    }
  }
  for (const name of result.keys()) {
    if (!SAFE_SKILL_NAME.test(name)) {
      throw new Error(`Invalid skill name "${name}" in source ${sourceConfig.repo}`);
    }
  }
  return [...result.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'skills-sync/2',
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function resolveGitHubCommit(repo, ref) {
  if (SHA_RE.test(ref)) return ref;
  const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`;
  const res = await fetch(url, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve ${repo}@${ref}: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data?.sha || !SHA_RE.test(data.sha)) {
    throw new Error(`Unexpected commit payload from GitHub for ${repo}@${ref}`);
  }
  return data.sha;
}

async function fetchGitHubTarball(repo, sha, destDir) {
  const url = `https://api.github.com/repos/${repo}/tarball/${sha}`;
  const res = await fetch(url, {
    headers: githubHeaders(),
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`Failed to download tarball for ${repo}@${sha}: HTTP ${res.status}`);
  }
  const tarPath = path.join(destDir, 'source.tar.gz');
  const extractDir = path.join(destDir, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(tarPath, buf);

  // Verify archive entries do not escape extractDir before extracting.
  const { stdout: listing } = await execFileAsync('tar', ['-tzf', tarPath], {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  for (const rawLine of listing.split('\n')) {
    const entry = rawLine.trim();
    if (!entry) continue;
    if (entry.startsWith('/') || entry.includes('..')) {
      throw new Error(`Unsafe archive entry refused in ${repo}@${sha}: ${entry}`);
    }
  }

  await execFileAsync('tar', ['-xzf', tarPath, '-C', extractDir], {
    timeout: 30_000,
  });
  const roots = readdirSync(extractDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  if (roots.length !== 1) {
    throw new Error(`Unexpected tarball root layout for ${repo}@${sha}`);
  }
  return path.join(extractDir, roots[0].name);
}

async function getLocalCommitSha(localDir) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', localDir, 'rev-parse', 'HEAD'], {
      timeout: 5_000,
    });
    const sha = stdout.trim();
    if (SHA_RE.test(sha)) return sha;
  } catch {
    // Non-git fixture directory; use synthetic zero SHA marker.
  }
  return '0'.repeat(40);
}

function ensureSymlinks(cwd, targetDirAbs, symlinks) {
  if (!Array.isArray(symlinks)) return;
  for (const linkRel of symlinks) {
    const safeRel = assertSafeRelativePath(linkRel, 'symlink');
    const linkAbs = path.resolve(cwd, safeRel);
    const parentAbs = path.dirname(linkAbs);
    mkdirSync(parentAbs, { recursive: true });
    const desiredTarget = path.relative(parentAbs, targetDirAbs);
    if (existsSync(linkAbs) || lstatSafe(linkAbs)) {
      const st = lstatSync(linkAbs);
      if (st.isSymbolicLink()) {
        const current = readlinkSync(linkAbs);
        if (path.resolve(parentAbs, current) === targetDirAbs) continue;
        rmSync(linkAbs, { force: true });
      } else {
        throw new Error(`Symlink path already exists and is not a symlink: ${safeRel}`);
      }
    }
    symlinkSync(desiredTarget, linkAbs, 'dir');
  }
}

function lstatSafe(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function atomicReplaceDir(srcDir, destDir) {
  const parent = path.dirname(destDir);
  mkdirSync(parent, { recursive: true });
  const stageDir = mkdtempSync(path.join(parent, '.skills-sync-stage-'));
  const stagedTarget = path.join(stageDir, 'skill');
  try {
    cpSync(srcDir, stagedTarget, { recursive: true, dereference: false });
    let backupDir = null;
    if (existsSync(destDir)) {
      backupDir = `${destDir}.bak-${process.pid}-${Date.now()}`;
      renameSync(destDir, backupDir);
    }
    try {
      renameSync(stagedTarget, destDir);
      if (backupDir) rmSync(backupDir, { recursive: true, force: true });
    } catch (err) {
      if (backupDir && existsSync(backupDir) && !existsSync(destDir)) {
        renameSync(backupDir, destDir);
      }
      throw err;
    }
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

function resolveDefaultPaths(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const manifestPath = path.resolve(cwd, options.manifest || '.agents/skills.json');
  const lockPath = path.resolve(cwd, options.lock || 'skills-lock.json');
  return { cwd, manifestPath, lockPath };
}

export async function pullSkills(options = {}) {
  const { cwd, manifestPath, lockPath } = resolveDefaultPaths(options);
  const manifest = readJson(manifestPath, 'manifest');
  const targetDirRel = assertSafeRelativePath(manifest.targetDir || '.agents/skills', 'targetDir');
  const targetDirAbs = path.resolve(cwd, targetDirRel);
  const localDeclared = new Set(manifest.local || []);
  const prevLock = existsSync(lockPath) ? readJson(lockPath, 'lockfile') : { version: 2, skills: {} };
  const prevSkills = prevLock.skills || {};
  const localMap = options.localSources || {};

  const tempWorkRoot = mkdtempSync(path.join(tmpdir(), 'skills-sync-'));
  const nextSkills = {};
  const summary = { added: [], updated: [], unchanged: [], removed: [], commits: {} };

  try {
    mkdirSync(targetDirAbs, { recursive: true });

    for (const [sourceKey, sourceConfig] of Object.entries(manifest.sources || {})) {
      const repo = sourceConfig.repo || sourceKey;
      const ref = sourceConfig.ref || 'main';
      let sourceRoot;
      let commitSha;
      let sourceType = 'github';

      const mappedLocal = localMap[repo] || localMap[sourceKey] || localMap['*'];
      if (mappedLocal) {
        sourceRoot = path.resolve(mappedLocal);
        if (!existsSync(sourceRoot)) {
          throw new Error(`Local source directory not found: ${sourceRoot}`);
        }
        commitSha = await getLocalCommitSha(sourceRoot);
        sourceType = 'local';
      } else {
        // Reuse pinned commit from lockfile unless --update or no prior entry for this source.
        const priorCommit = Object.values(prevSkills).find(
          (entry) => entry.source === repo && SHA_RE.test(entry.commit || ''),
        )?.commit;
        commitSha = !options.update && priorCommit ? priorCommit : await resolveGitHubCommit(repo, ref);
        const sourceTemp = mkdtempSync(path.join(tempWorkRoot, 'src-'));
        sourceRoot = await fetchGitHubTarball(repo, commitSha, sourceTemp);
      }

      summary.commits[repo] = commitSha;
      const profilesPath = path.join(sourceRoot, 'profiles.json');
      const profilesData = existsSync(profilesPath) ? readJson(profilesPath, 'profiles.json') : null;
      const resolvedList = resolveSourceSkillList(sourceConfig, profilesData);

      for (const [skillName, skillRelPath] of resolvedList) {
        if (localDeclared.has(skillName)) {
          throw new Error(`Skill "${skillName}" is declared in both sources (${repo}) and local[]`);
        }
        if (nextSkills[skillName]) {
          throw new Error(`Duplicate managed skill "${skillName}" across sources`);
        }
        const srcSkillDir = path.resolve(sourceRoot, skillRelPath);
        if (!existsSync(path.join(srcSkillDir, 'SKILL.md'))) {
          throw new Error(`Skill "${skillName}" (${skillRelPath}/SKILL.md) not found in ${repo}@${commitSha}`);
        }

        const { computedHash, treeHash, files } = computeSkillHashes(srcSkillDir);
        const destSkillDir = path.join(targetDirAbs, skillName);

        // Guard against clobbering uncommitted/silent edits to managed skills unless --force.
        if (existsSync(destSkillDir) && !options.force) {
          const prevEntry = prevSkills[skillName];
          if (prevEntry?.treeHash) {
            const currentDisk = computeSkillHashes(destSkillDir);
            if (currentDisk.treeHash !== prevEntry.treeHash && currentDisk.treeHash !== treeHash) {
              throw new Error(
                `Managed skill "${skillName}" has local edits (disk treeHash differs from skills-lock.json). Re-run with --force to overwrite.`,
              );
            }
          }
        }

        const prevEntry = prevSkills[skillName];
        if (!existsSync(destSkillDir)) {
          atomicReplaceDir(srcSkillDir, destSkillDir);
          summary.added.push(skillName);
        } else {
          const diskHashes = computeSkillHashes(destSkillDir);
          if (diskHashes.treeHash !== treeHash) {
            atomicReplaceDir(srcSkillDir, destSkillDir);
            summary.updated.push(skillName);
          } else {
            summary.unchanged.push(skillName);
          }
        }

        nextSkills[skillName] = {
          source: repo,
          sourceType,
          commit: commitSha,
          skillPath: `${skillRelPath}/SKILL.md`,
          installMode: 'copy',
          computedHash,
          treeHash,
          files,
        };
      }
    }

    // Remove managed skills dropped from manifest (never touch local[] skills).
    for (const oldSkillName of Object.keys(prevSkills)) {
      if (!nextSkills[oldSkillName] && !localDeclared.has(oldSkillName)) {
        const staleDir = path.join(targetDirAbs, oldSkillName);
        if (existsSync(staleDir)) {
          rmSync(staleDir, { recursive: true, force: true });
          summary.removed.push(oldSkillName);
        }
      }
    }

    ensureSymlinks(cwd, targetDirAbs, manifest.symlinks || []);

    const sortedSkills = {};
    for (const key of Object.keys(nextSkills).sort()) {
      sortedSkills[key] = nextSkills[key];
    }
    const lockPayload = {
      version: 2,
      targetDir: targetDirRel,
      skills: sortedSkills,
    };
    writeFileSync(lockPath, `${JSON.stringify(lockPayload, null, 2)}\n`, 'utf8');
    return summary;
  } finally {
    rmSync(tempWorkRoot, { recursive: true, force: true });
  }
}

export function checkSkills(options = {}) {
  const { cwd, manifestPath, lockPath } = resolveDefaultPaths(options);
  const errors = [];

  let manifest;
  let lock;
  try {
    manifest = readJson(manifestPath, 'manifest');
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
  try {
    lock = readJson(lockPath, 'lockfile');
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }

  if (lock.version !== 2 || typeof lock.skills !== 'object' || lock.skills === null) {
    errors.push(`skills-lock.json must be version 2 (found version=${lock.version}); run 'skills-sync pull'`);
    return { ok: false, errors };
  }

  const targetDirRel = assertSafeRelativePath(manifest.targetDir || '.agents/skills', 'targetDir');
  const targetDirAbs = path.resolve(cwd, targetDirRel);
  const localDeclared = new Set(manifest.local || []);
  const lockedNames = new Set(Object.keys(lock.skills));

  if (!existsSync(targetDirAbs)) {
    errors.push(`Target skills directory does not exist: ${targetDirRel}`);
    return { ok: false, errors };
  }

  // 1. Verify every locked skill exists, has valid commit SHA, and matches treeHash + computedHash.
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (!SAFE_SKILL_NAME.test(name)) {
      errors.push(`Invalid locked skill name: ${name}`);
      continue;
    }
    if (localDeclared.has(name)) {
      errors.push(`Skill "${name}" is listed in both skills-lock.json and manifest local[]`);
    }
    if (!SHA_RE.test(entry.commit || '')) {
      errors.push(`Locked skill "${name}" does not record a 40-char pinned commit SHA`);
    }
    if (!entry.treeHash || !entry.computedHash) {
      errors.push(`Locked skill "${name}" is missing treeHash or computedHash`);
      continue;
    }
    const skillDir = path.join(targetDirAbs, name);
    if (!existsSync(skillDir)) {
      errors.push(`Locked skill missing on disk: ${targetDirRel}/${name}`);
      continue;
    }
    try {
      const disk = computeSkillHashes(skillDir);
      if (disk.computedHash !== entry.computedHash) {
        errors.push(`SKILL.md hash mismatch for managed skill "${name}" (run 'skills-sync pull')`);
      }
      if (disk.treeHash !== entry.treeHash) {
        errors.push(
          `Tree hash mismatch for managed skill "${name}" (includes SKILL.md, scripts/*, references/*); do not edit vendored skills locally`,
        );
      }
    } catch (err) {
      errors.push(`Failed hashing managed skill "${name}": ${err.message}`);
    }
  }

  // 2. Verify every explicit include / skills item in manifest is present in lockfile.
  for (const [sourceKey, sourceConfig] of Object.entries(manifest.sources || {})) {
    const excluded = new Set(sourceConfig.exclude || []);
    for (const inc of sourceConfig.include || []) {
      if (!excluded.has(inc) && !lockedNames.has(inc)) {
        errors.push(`Manifest include "${inc}" (source ${sourceKey}) is missing from skills-lock.json`);
      }
    }
    for (const item of sourceConfig.skills || []) {
      if (!excluded.has(item.name) && !lockedNames.has(item.name)) {
        errors.push(`Manifest skill "${item.name}" (source ${sourceKey}) is missing from skills-lock.json`);
      }
    }
    for (const exc of excluded) {
      if (lockedNames.has(exc) && lock.skills[exc]?.source === (sourceConfig.repo || sourceKey)) {
        errors.push(`Excluded skill "${exc}" is still present in skills-lock.json`);
      }
    }
  }

  // 3. Verify every directory under targetDir is either locked or declared in local[].
  const diskEntries = readdirSync(targetDirAbs, { withFileTypes: true });
  for (const entry of diskEntries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;
    if (!lockedNames.has(entry.name) && !localDeclared.has(entry.name)) {
      errors.push(
        `Unmanaged skill folder "${targetDirRel}/${entry.name}" is neither in skills-lock.json nor manifest local[]`,
      );
    }
  }

  // 4. Verify every local[] skill exists on disk with a SKILL.md.
  for (const localName of localDeclared) {
    const localSkillMd = path.join(targetDirAbs, localName, 'SKILL.md');
    if (!existsSync(localSkillMd)) {
      errors.push(`Declared local skill missing SKILL.md: ${targetDirRel}/${localName}/SKILL.md`);
    }
  }

  // 5. Verify configured symlinks resolve to targetDir.
  for (const linkRel of manifest.symlinks || []) {
    const safeRel = assertSafeRelativePath(linkRel, 'symlink');
    const linkAbs = path.resolve(cwd, safeRel);
    const st = lstatSafe(linkAbs);
    if (!st) {
      errors.push(`Missing configured symlink: ${safeRel} -> ${targetDirRel}`);
    } else if (!st.isSymbolicLink()) {
      errors.push(`Configured symlink path is not a symlink: ${safeRel}`);
    } else {
      const resolved = path.resolve(path.dirname(linkAbs), readlinkSync(linkAbs));
      if (resolved !== targetDirAbs) {
        errors.push(`Symlink "${safeRel}" points to ${resolved}, expected ${targetDirAbs}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function statusSkills(options = {}) {
  const { manifestPath, lockPath } = resolveDefaultPaths(options);
  const manifest = readJson(manifestPath, 'manifest');
  const lock = existsSync(lockPath) ? readJson(lockPath, 'lockfile') : { version: 2, skills: {} };
  const rows = [];
  for (const [name, entry] of Object.entries(lock.skills || {})) {
    rows.push({
      name,
      kind: 'managed',
      source: entry.source,
      commit: (entry.commit || '').slice(0, 8),
      files: Object.keys(entry.files || {}).length,
    });
  }
  for (const name of manifest.local || []) {
    rows.push({
      name,
      kind: 'local',
      source: 'local',
      commit: '-',
      files: '-',
    });
  }
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return rows;
}

function usage() {
  return [
    'Usage: skills-sync <command> [options]',
    '',
    'Commands:',
    '  pull    Sync skills from .agents/skills.json and update skills-lock.json (v2)',
    '  check   Offline CI check verifying treeHash, pinned SHAs, local[], and symlinks',
    '  status  Print installed managed and local skills summary',
    '',
    'Options:',
    '  --update              Resolve refs to latest upstream commits (pull)',
    '  --force               Overwrite modified managed skills on disk (pull)',
    '  --local [repo=]DIR    Use a local checkout directory for a source (pull, repeatable)',
    '  --cwd DIR             Repository root directory (default: current directory)',
    '  --manifest PATH       Manifest path relative to cwd (default: .agents/skills.json)',
    '  --lock PATH           Lockfile path relative to cwd (default: skills-lock.json)',
    '  -h, --help            Show this help message',
  ].join('\n');
}

export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  const args = [...argv];
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    io.stdout.write(`${usage()}\n`);
    return 0;
  }

  const cmd = args.shift();
  const options = { localSources: {} };

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--update') {
      options.update = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--local') {
      const val = args.shift();
      if (!val) {
        io.stderr.write('skills-sync: --local requires a value\n');
        return 2;
      }
      const eq = val.indexOf('=');
      if (eq > 0) {
        options.localSources[val.slice(0, eq)] = val.slice(eq + 1);
      } else {
        options.localSources['*'] = val;
      }
    } else if (arg === '--cwd') {
      options.cwd = args.shift();
      if (!options.cwd) {
        io.stderr.write('skills-sync: --cwd requires a directory\n');
        return 2;
      }
    } else if (arg === '--manifest') {
      options.manifest = args.shift();
      if (!options.manifest) {
        io.stderr.write('skills-sync: --manifest requires a path\n');
        return 2;
      }
    } else if (arg === '--lock') {
      options.lock = args.shift();
      if (!options.lock) {
        io.stderr.write('skills-sync: --lock requires a path\n');
        return 2;
      }
    } else if (arg === '-h' || arg === '--help') {
      io.stdout.write(`${usage()}\n`);
      return 0;
    } else {
      io.stderr.write(`skills-sync: unknown option: ${arg}\n`);
      return 2;
    }
  }

  try {
    if (cmd === 'pull') {
      const res = await pullSkills(options);
      io.stdout.write(
        `skills-sync pull complete: added=${res.added.length} updated=${res.updated.length} unchanged=${res.unchanged.length} removed=${res.removed.length}\n`,
      );
      return 0;
    }
    if (cmd === 'check') {
      const res = checkSkills(options);
      if (res.ok) {
        io.stdout.write('skills-sync check: OK\n');
        return 0;
      }
      for (const err of res.errors) {
        io.stderr.write(`skills-sync check: FAIL ${err}\n`);
      }
      return 1;
    }
    if (cmd === 'status') {
      const rows = statusSkills(options);
      io.stdout.write('NAME\tKIND\tSOURCE\tCOMMIT\tFILES\n');
      for (const r of rows) {
        io.stdout.write(`${r.name}\t${r.kind}\t${r.source}\t${r.commit}\t${r.files}\n`);
      }
      return 0;
    }
    io.stderr.write(`skills-sync: unknown command: ${cmd}\n${usage()}\n`);
    return 2;
  } catch (err) {
    io.stderr.write(`skills-sync: ${err.message}\n`);
    return 1;
  }
}
