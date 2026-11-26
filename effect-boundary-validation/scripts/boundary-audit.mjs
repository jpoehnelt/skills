#!/usr/bin/env node
// List candidate ingress, cast, signature, and decode sites for a boundary review.
// Read-only. Exit 0 when clean, 1 when a banned import or ast-grep rule fails, 2 on usage or tool errors.
//
// Usage: boundary-audit.mjs [--ban MODULE]... [--rule AST_GREP_RULE_ID]... [PATH...]
//   --ban MODULE   Module whose imports must not appear (repeatable), e.g. --ban zod --ban valibot.
//   --rule ID      ast-grep rule id to run if the repo has sgconfig.yml (repeatable).
//   PATH           Paths relative to the repo root (default: the whole repo).

import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import path from 'node:path';

const USAGE = [
  'Usage: boundary-audit.mjs [--ban MODULE]... [--rule AST_GREP_RULE_ID]... [PATH...]',
  '  --ban MODULE   Module whose imports must not appear (repeatable), e.g. --ban zod --ban valibot.',
  '  --rule ID      ast-grep rule id to run if the repo has sgconfig.yml (repeatable).',
  '  PATH           Paths relative to the repo root (default: the whole repo).',
].join('\n');

const SAFE_SGCONFIG_KEYS = new Set([
  'ruleDirs',
  'utilDirs',
  'testConfigs',
  'languageGlobs',
  'languageInjections',
]);

function dieUsage(msg) {
  if (msg) process.stderr.write(`${msg}\n`);
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

function killProcessGroup(pid, signal) {
  try {
    if (process.platform === 'win32') process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch {
    // Already exited.
  }
}

function runBounded(cmd, args, timeoutSec, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const out = [];
    const err = [];
    let timedOut = false;
    let killTimer = null;

    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => killProcessGroup(child.pid, 'SIGKILL'), 2000);
      killTimer.unref();
    }, timeoutSec * 1000);
    timer.unref();

    child.on('error', (e) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code: e.code === 'ENOENT' ? 127 : 1, stdout: '', stderr: e.message, timedOut: false });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code: timedOut ? 124 : code !== null ? code : signal ? 128 : 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
      });
    });
  });
}

function isSafeSgConfig(content) {
  let underSafe = false;
  for (const rawLine of content.split(/\r?\n/)) {
    if (/^[ \t]*(#.*)?$/.test(rawLine)) continue;
    if (/^---[ \t]*(#.*)?$/.test(rawLine)) {
      underSafe = false;
      continue;
    }
    const topMatch = rawLine.match(/^([A-Za-z][A-Za-z0-9_]*):/);
    if (topMatch) {
      if (!SAFE_SGCONFIG_KEYS.has(topMatch[1])) return false;
      underSafe = true;
      continue;
    }
    if (/^[ \t]/.test(rawLine) && underSafe) continue;
    return false;
  }
  return true;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isExecutable(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const bans = [];
  const rules = [];
  const paths = [];

  while (args.length > 0) {
    const a = args.shift();
    if (a === '--ban') {
      if (args.length === 0) dieUsage('boundary-audit: --ban requires a module');
      bans.push(args.shift());
    } else if (a === '--rule') {
      if (args.length === 0) dieUsage('boundary-audit: --rule requires a rule id');
      rules.push(args.shift());
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else if (a === '--') {
      paths.push(...args);
      break;
    } else if (a.startsWith('-')) {
      dieUsage(`boundary-audit: unknown option: ${a}`);
    } else {
      paths.push(a);
    }
  }

  const timeoutRaw = process.env.AUDIT_TIMEOUT || process.env.GH_TIMEOUT || '60';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('boundary-audit: AUDIT_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  const rootRes = await runBounded('git', ['rev-parse', '--show-toplevel'], 10, process.cwd());
  if (rootRes.code !== 0) {
    process.stderr.write('boundary-audit: not inside a git repository\n');
    process.exit(2);
  }
  const root = rootRes.stdout.trim();
  const safePaths = (paths.length > 0 ? paths : ['.']).map((p) => {
    const abs = path.resolve(root, p);
    if (!existsSync(abs)) {
      process.stderr.write(`boundary-audit: path does not exist: ${p}\n`);
      process.exit(2);
    }
    // A path starting with "-" (e.g. --pre=cmd.ts) must never parse as an option.
    return p.startsWith('-') ? `./${p}` : p;
  });

  const globs = [
    '--hidden',
    '--glob',
    '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,svelte}',
    '--glob',
    '!**/.git/**',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/dist/**',
    '--glob',
    '!**/build/**',
    '--glob',
    '!**/.svelte-kit/**',
  ];
  const noTests = ['--glob', '!**/*.{test,spec}.*'];

  async function search(pattern, extraArgs = []) {
    const res = await runBounded(
      'rg',
      ['-H', '-n', '--max-columns', '200', ...globs, ...extraArgs, '-e', pattern, '--', ...safePaths],
      timeoutSec,
      root,
    );
    if (res.code === 127) {
      process.stderr.write('boundary-audit: ripgrep (rg) is required\n');
      process.exit(2);
    }
    if (res.code > 1) {
      process.stderr.write(`boundary-audit: rg failed or timed out (exit ${res.code})\n`);
      process.exit(res.timedOut ? 124 : 2);
    }
    if (res.stdout) process.stdout.write(res.stdout);
    return res.code === 0;
  }

  let banned = 0;

  if (bans.length > 0) {
    const alt = bans.map(escapeRegex).join('|');
    process.stdout.write(`Banned imports: ${bans.join(' ')} (must be empty)\n`);
    const banPattern =
      `\\b(from|import|require)(\\.resolve|\\.meta\\.resolve)?(\\s|/\\*[\\s\\S]*?\\*/|//[^\\n]*\\n)*(\\?\\.)?\\(?(\\s|/\\*[\\s\\S]*?\\*/|//[^\\n]*\\n)*['"\`](${alt})(/[^'"\`]*)?['"\`]`;
    const found = await search(banPattern, ['-U']);
    if (found) banned = 1;
    process.stdout.write('\n');
  }

  process.stdout.write('Parse and cast sites (each should feed a schema decode or read trusted local data)\n');
  await search('JSON\\.parse\\(|\\.json\\(\\)|\\bevent\\.data\\b|as unknown as|\\bas any\\b|:\\s*any\\b|\\.run<[^>]+>\\(', noTests);

  process.stdout.write('\nSignature and constant-time checks (verify raw bytes before parsing)\n');
  await search('timingSafeEqual|createHmac|crypto\\.subtle\\.(verify|sign)|verifySignature|[Ss]ignature', noTests);

  process.stdout.write('\nSchema decode sites\n');
  await search('Schema\\.decode(Unknown)?[A-Za-z]*\\b|Schema\\.fromJsonString|onExcessProperty', noTests);

  if (rules.length > 0) {
    process.stdout.write('\n');
    for (const rule of rules) {
      if (!/^[A-Za-z0-9_.-]+$/.test(rule)) {
        process.stderr.write(`boundary-audit: invalid --rule id: ${rule}\n`);
        process.exit(2);
      }
    }
    const filter = `^(${rules.map((r) => r.replace(/\./g, '\\.')).join('|')})$`;

    // Refuse tracked node_modules to avoid executing checkout-supplied binaries.
    const trackedNm = await runBounded('git', ['ls-files', '--', 'node_modules'], 10, root);
    if (trackedNm.stdout.trim().length > 0) {
      process.stderr.write('boundary-audit: refusing --rule: node_modules has tracked files in this checkout\n');
      process.exit(2);
    }

    const sgConfigPath = path.join(root, 'sgconfig.yml');
    if (!existsSync(sgConfigPath)) {
      process.stderr.write('boundary-audit: --rule requested but no sgconfig.yml at repo root\n');
      process.exit(2);
    }
    const sgConfigContent = readFileSync(sgConfigPath, 'utf8');
    if (!isSafeSgConfig(sgConfigContent)) {
      process.stderr.write(
        'boundary-audit: refusing --rule: sgconfig.yml has a top-level key outside ruleDirs, utilDirs, testConfigs, languageGlobs, languageInjections\n',
      );
      process.exit(2);
    }

    const localSg = path.join(root, 'node_modules', '.bin', 'ast-grep');
    const sgCmd = isExecutable(localSg) ? localSg : 'ast-grep';

    const inspectRes = await runBounded(
      sgCmd,
      ['scan', '--config', 'sgconfig.yml', '--inspect', 'entity', devNull],
      timeoutSec,
      root,
    );
    if (inspectRes.code === 127) {
      process.stderr.write('boundary-audit: --rule requested but ast-grep executable not found; install dependencies\n');
      process.exit(2);
    }
    if (inspectRes.code !== 0) {
      process.stderr.write('boundary-audit: ast-grep could not list its loaded rules\n');
      process.exit(inspectRes.timedOut ? 124 : 2);
    }
    const loadedOutput = `${inspectRes.stderr}\n${inspectRes.stdout}`;
    for (const rule of rules) {
      if (!loadedOutput.includes(`|rule|${rule}:`)) {
        process.stderr.write(`boundary-audit: --rule ${rule} is not loaded by sgconfig.yml\n`);
        process.exit(2);
      }
    }

    process.stdout.write(`ast-grep rules: ${rules.join(' ')}\n`);
    const promote = rules.map((r) => `--error=${r}`);
    const scanRes = await runBounded(
      sgCmd,
      ['scan', '--config', 'sgconfig.yml', '--filter', filter, ...promote, '--report-style', 'short', '--', ...safePaths],
      timeoutSec,
      root,
    );
    if (scanRes.stdout) process.stdout.write(scanRes.stdout);
    if (scanRes.stderr) process.stderr.write(scanRes.stderr);
    if (scanRes.code === 1) {
      banned = 1;
    } else if (scanRes.code > 1) {
      process.stderr.write(`boundary-audit: ast-grep failed or timed out (exit ${scanRes.code})\n`);
      process.exit(scanRes.timedOut ? 124 : 2);
    }
  }

  process.exit(banned);
}

await main();
