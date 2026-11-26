#!/usr/bin/env node
// Snapshot the existing UI surface for feature keywords before designing a change.
// Read-only. Exit 0 on success, 2 on usage or tool errors.
//
// Usage: ui-surface-snapshot.mjs [--root DIR]... KEYWORD...
//   --root DIR  Directory to search, relative to the repo root (repeatable; default: the repo).
//   KEYWORD     Case-insensitive literal name fragments, e.g. button dialog settings.

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const USAGE = [
  'Usage: ui-surface-snapshot.mjs [--root DIR]... KEYWORD...',
  '  --root DIR  Directory to search, relative to the repo root (repeatable; default: the repo).',
  '  KEYWORD     Case-insensitive literal name fragments, e.g. button dialog settings.',
].join('\n');

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

function toPosix(p) {
  return p.split(path.sep).join('/');
}

async function main() {
  const args = process.argv.slice(2);
  const roots = [];
  const keywords = [];

  while (args.length > 0) {
    const a = args.shift();
    if (a === '--root') {
      if (args.length === 0) dieUsage('ui-surface-snapshot: --root requires a directory');
      roots.push(args.shift());
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    } else if (a === '--') {
      keywords.push(...args);
      break;
    } else if (a.startsWith('-')) {
      dieUsage(`ui-surface-snapshot: unknown option: ${a}`);
    } else {
      keywords.push(a);
    }
  }

  if (keywords.length === 0) dieUsage('ui-surface-snapshot: give at least one keyword');

  const timeoutRaw = process.env.AUDIT_TIMEOUT || process.env.GH_TIMEOUT || '60';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('ui-surface-snapshot: AUDIT_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  const rootRes = await runBounded('git', ['rev-parse', '--show-toplevel'], 10, process.cwd());
  if (rootRes.code !== 0) {
    process.stderr.write('ui-surface-snapshot: not inside a git repository\n');
    process.exit(2);
  }
  const repoRoot = rootRes.stdout.trim();

  const safeRoots = (roots.length > 0 ? roots : ['.']).map((r) => {
    const abs = path.resolve(repoRoot, r);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      process.stderr.write(`ui-surface-snapshot: not a directory: ${r}\n`);
      process.exit(2);
    }
    // A root starting with "-" must never parse as an rg option.
    return r.startsWith('-') ? `./${r}` : r;
  });

  const baseExcludes = [
    '--hidden',
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
    '--glob',
    '!**/storybook-static/**',
  ];

  async function runRg(extraArgs) {
    const res = await runBounded('rg', [...baseExcludes, ...extraArgs], timeoutSec, repoRoot);
    if (res.code === 127) {
      process.stderr.write('ui-surface-snapshot: ripgrep (rg) is required\n');
      process.exit(2);
    }
    if (res.code > 1) {
      process.stderr.write(`ui-surface-snapshot: rg failed or timed out (exit ${res.code})\n`);
      process.exit(res.timedOut ? 124 : 2);
    }
    return res.stdout
      .split(/\r?\n/)
      .filter((l) => l.length > 0)
      .map(toPosix);
  }

  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  const matchesKeyword = (str) => {
    const low = str.toLowerCase();
    return lowerKeywords.some((k) => low.includes(k));
  };

  const files = await runRg(['--files', '--', ...safeRoots]);

  const section = (title, lines) => {
    process.stdout.write(`\n== ${title}\n`);
    for (const line of lines) {
      process.stdout.write(`${line}\n`);
    }
  };

  section(
    `Components matching: ${keywords.join(' ')}`,
    files.filter((f) => /\/components\/.*\.svelte$/.test(f) && matchesKeyword(f)).slice(0, 80),
  );

  const primitiveFolders = [
    ...new Set(
      files
        .filter((f) => /(\/components\/ui\/|packages\/ui\/src\/)/.test(f))
        .map((f) => f.replace(/\/[^/]+$/, '')),
    ),
  ]
    .sort()
    .slice(0, 60);
  section('Shared primitive folders (ui/, packages/ui)', primitiveFolders);

  section(
    'Routes matching',
    files.filter((f) => /\/routes\//.test(f) && matchesKeyword(f)).slice(0, 60),
  );

  const kwFlags = keywords.flatMap((k) => ['-e', k]);
  const consumers = await runRg([
    '-li',
    '-F',
    '--glob',
    '*.{svelte,ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ...kwFlags,
    '--',
    ...safeRoots,
  ]);
  section(
    'Consumers (files referencing the keywords)',
    consumers.filter((f) => !/\.(test|spec|stories)\./.test(f)).slice(0, 80),
  );

  section(
    'Stories and tests matching',
    files
      .filter((f) => /\.(stories|story|test|spec)\.([cm]?[jt]sx?|svelte)$/.test(f) && matchesKeyword(f))
      .slice(0, 60),
  );

  const cssFiles = files.filter((f) => /(^|\/)(app|global|globals|theme|tokens)\.css$/.test(f)).slice(0, 5);
  process.stdout.write('\n== Theme tokens and fonts (global CSS)\n');
  if (cssFiles.length === 0) {
    process.stdout.write('(no app/global/theme CSS found)\n');
  } else {
    for (const f of cssFiles) {
      process.stdout.write(`-- ${f}\n`);
      const safeCss = f.startsWith('-') ? `./${f}` : f;
      const tokens = await runRg([
        '-n',
        '-e',
        '^\\s*--[a-z0-9-]+\\s*:|font-family|@theme|@custom-variant|prefers-reduced-motion|\\.dark\\b',
        '--',
        safeCss,
      ]);
      for (const line of tokens.slice(0, 40)) {
        process.stdout.write(`${line}\n`);
      }
    }
  }

  section(
    'Storybook and component config',
    files.filter((f) => /(^|\/)(\.storybook\/main\.[jt]s|components\.json|svelte\.config\.js)$/.test(f)).slice(0, 20),
  );
}

await main();
