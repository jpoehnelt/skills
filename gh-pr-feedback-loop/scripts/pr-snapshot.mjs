#!/usr/bin/env node
// Read-only PR state: compact summary, branch-reuse check, checks, statuses,
// reviews, unresolved threads, inline comments, and issue-comment quota/marker scan.
// Usage: pr-snapshot.mjs <pr-number-or-url> [owner/repo]
// GH_TIMEOUT bounds each gh call in seconds (default 60).

import { spawn } from 'node:child_process';

const USAGE = 'usage: pr-snapshot.mjs <pr-number-or-url> [owner/repo]';
const QUOTA_RE =
  /reached your daily quota limit|daily limit exceeded|rate limit exceeded|quota exhausted|please wait up to \d+ hours/i;
const MARKER_RE = /<!--\s*([A-Za-z0-9._:/-]+(?:\s+[^-\n][^\n]*?)?)\s*-->/g;

function dieUsage(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function parseRepoFromRemoteUrl(url) {
  const cleaned = url.trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function killProcessGroup(pid, signal) {
  try {
    if (process.platform === 'win32') {
      process.kill(pid, signal);
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    // Process group already exited.
  }
}

function runBounded(cmd, args, timeoutSec) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    let killTimer = null;

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, 'SIGTERM');
      killTimer = setTimeout(() => {
        killProcessGroup(child.pid, 'SIGKILL');
      }, 2000);
      killTimer.unref();
    }, timeoutSec * 1000);
    timer.unref();

    child.on('error', (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code: err.code === 'ENOENT' ? 127 : 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: err.message,
        timedOut: false,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const exitCode = timedOut ? 124 : code !== null ? code : signal ? 128 : 1;
      resolve({
        code: exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        timedOut,
      });
    });
  });
}

// Parse one JSON value or concatenated JSON pages emitted by `gh api --paginate`.
function parseJsonPages(raw) {
  const text = raw.trim();
  if (!text) return [];
  try {
    return [JSON.parse(text)];
  } catch {
    // Fall through to incremental top-level JSON decoder.
  }
  const values = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    while (i < len && /\s/.test(text[i])) i += 1;
    if (i >= len) break;
    const start = i;
    const open = text[i];
    if (open !== '{' && open !== '[') {
      throw new Error(`Unexpected JSON token at offset ${i}`);
    }
    const stack = [open === '{' ? '}' : ']'];
    i += 1;
    let inString = false;
    let escaped = false;
    while (i < len && stack.length > 0) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        stack.push('}');
      } else if (ch === '[') {
        stack.push(']');
      } else if (ch === stack[stack.length - 1]) {
        stack.pop();
      }
      i += 1;
    }
    if (stack.length > 0) {
      throw new Error('Unterminated JSON document in paginated response');
    }
    values.push(JSON.parse(text.slice(start, i)));
  }
  return values;
}

function flattenArrayPages(pages) {
  const out = [];
  for (const page of pages) {
    if (Array.isArray(page)) {
      out.push(...page);
    } else if (page && typeof page === 'object') {
      out.push(page);
    }
  }
  return out;
}

function firstMeaningfulLine(body, maxLen = 160) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('<!--'));
  return (lines[0] || '-').slice(0, maxLen);
}

function firstLine(body, maxLen = 120) {
  const line = String(body || '').split(/\r?\n/)[0] || '';
  return line.slice(0, maxLen);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    if (argv[0] === '-h' || argv[0] === '--help') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    dieUsage(USAGE);
  }

  let prArg = argv[0];
  let urlRepo = '';
  const urlMatch = prArg.match(/github\.com[/:]([^/]+\/[^/]+)\/pull\/([0-9]+)/);
  if (urlMatch) {
    urlRepo = urlMatch[1];
    prArg = urlMatch[2];
  }
  const numStr = prArg.split('/').pop();
  if (!/^[1-9][0-9]*$/.test(numStr || '')) {
    dieUsage(`pr-snapshot: invalid PR number: ${argv[0]}`);
  }
  const num = Number(numStr);

  const timeoutRaw = process.env.GH_TIMEOUT || '60';
  if (!/^[1-9][0-9]*$/.test(timeoutRaw)) {
    dieUsage('pr-snapshot: GH_TIMEOUT must be a positive number of seconds');
  }
  const timeoutSec = Number(timeoutRaw);

  let repo = argv[1] || urlRepo;
  if (!repo) {
    const remoteRes = await runBounded('git', ['remote', 'get-url', 'origin'], 10);
    if (remoteRes.code !== 0) {
      dieUsage('pr-snapshot: no origin remote; pass owner/repo');
    }
    repo = parseRepoFromRemoteUrl(remoteRes.stdout);
    if (!repo) {
      dieUsage('pr-snapshot: could not parse owner/repo from origin remote');
    }
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    dieUsage(`pr-snapshot: invalid owner/repo: ${repo}`);
  }
  const [owner, name] = repo.split('/');

  async function ghApi(args) {
    const res = await runBounded('gh', ['api', ...args], timeoutSec);
    if (res.code === 127) {
      dieUsage('pr-snapshot: gh is required');
    }
    return res;
  }

  let failed = 0;

  // 1. Single PR fetch.
  const prRes = await ghApi([`repos/${repo}/pulls/${num}`]);
  if (prRes.code !== 0) {
    process.stderr.write(`pr-snapshot: failed to fetch PR #${num} (${prRes.stderr.trim() || `exit ${prRes.code}`})\n`);
    process.exit(prRes.timedOut ? 124 : 1);
  }
  let pr;
  try {
    pr = JSON.parse(prRes.stdout);
  } catch (err) {
    process.stderr.write(`pr-snapshot: invalid PR JSON: ${err.message}\n`);
    process.exit(1);
  }

  const headSha = pr.head?.sha || '';
  const headRef = pr.head?.ref || '';
  const headOwner = pr.head?.user?.login || pr.head?.repo?.owner?.login || owner;

  // 2. Prior merged PRs sharing head.ref (post-squash branch reuse check).
  let branchReusedFromPr = null;
  if (headRef && !pr.merged) {
    const headQuery = `${headOwner}:${headRef}`;
    const closedRes = await ghApi([
      `repos/${repo}/pulls?state=closed&head=${encodeURIComponent(headQuery)}&per_page=100`,
      '--paginate',
    ]);
    if (closedRes.code === 0) {
      try {
        const closedPrs = flattenArrayPages(parseJsonPages(closedRes.stdout));
        const priorMerged = closedPrs
          .filter((item) => item && item.number !== num && Boolean(item.merged_at))
          .sort((a, b) => Number(b.number) - Number(a.number));
        if (priorMerged.length > 0) {
          branchReusedFromPr = priorMerged[0].number;
        }
      } catch (err) {
        process.stderr.write(`pr-snapshot: section failed: merged-branch check (${err.message})\n`);
        failed = 1;
      }
    } else {
      process.stderr.write(`pr-snapshot: section failed: merged-branch check (exit ${closedRes.code})\n`);
      failed = 1;
    }
  }

  // 3. Check runs on headSha.
  const checkRuns = [];
  const checkRunsRes = await ghApi([`repos/${repo}/commits/${headSha}/check-runs?per_page=100`, '--paginate']);
  if (checkRunsRes.code === 0) {
    try {
      for (const page of parseJsonPages(checkRunsRes.stdout)) {
        if (Array.isArray(page?.check_runs)) checkRuns.push(...page.check_runs);
      }
    } catch (err) {
      process.stderr.write(`pr-snapshot: section failed: check-runs (${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write(`pr-snapshot: section failed: check-runs (exit ${checkRunsRes.code})\n`);
    failed = 1;
  }

  // 4. Commit statuses on headSha.
  const statuses = [];
  const statusRes = await ghApi([`repos/${repo}/commits/${headSha}/status?per_page=100`, '--paginate']);
  if (statusRes.code === 0) {
    try {
      for (const page of parseJsonPages(statusRes.stdout)) {
        if (Array.isArray(page?.statuses)) statuses.push(...page.statuses);
      }
    } catch (err) {
      process.stderr.write(`pr-snapshot: section failed: commit statuses (${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write(`pr-snapshot: section failed: commit statuses (exit ${statusRes.code})\n`);
    failed = 1;
  }

  // 5. Reviews.
  const reviews = [];
  const reviewsRes = await ghApi([`repos/${repo}/pulls/${num}/reviews?per_page=100`, '--paginate']);
  if (reviewsRes.code === 0) {
    try {
      reviews.push(...flattenArrayPages(parseJsonPages(reviewsRes.stdout)));
    } catch (err) {
      process.stderr.write(`pr-snapshot: section failed: reviews (${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write(`pr-snapshot: section failed: reviews (exit ${reviewsRes.code})\n`);
    failed = 1;
  }

  // 6. Unresolved review threads via GraphQL.
  let unresolvedThreads = null;
  const gqlQuery = `
query($owner: String!, $name: String!, $num: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $num) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line
          comments(first: 1) { totalCount nodes { author { login } body } }
          latest: comments(last: 1) { nodes { author { login } body } }
        }
      }
    }
  }
}`;
  const threadsRes = await ghApi([
    'graphql',
    '--paginate',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `num=${num}`,
    '-f',
    `query=${gqlQuery}`,
  ]);
  if (threadsRes.code === 0) {
    try {
      const nodes = [];
      for (const page of parseJsonPages(threadsRes.stdout)) {
        const list = page?.data?.repository?.pullRequest?.reviewThreads?.nodes;
        if (Array.isArray(list)) nodes.push(...list);
      }
      unresolvedThreads = nodes.filter((t) => t && !t.isResolved);
    } catch (err) {
      process.stderr.write(`pr-snapshot: thread resolution state unavailable (GraphQL parse failed: ${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write('pr-snapshot: thread resolution state unavailable (GraphQL failed); read threads another way\n');
    failed = 1;
  }

  // 7. Inline comments.
  const inlineComments = [];
  const inlineRes = await ghApi([`repos/${repo}/pulls/${num}/comments?per_page=100`, '--paginate']);
  if (inlineRes.code === 0) {
    try {
      inlineComments.push(...flattenArrayPages(parseJsonPages(inlineRes.stdout)));
    } catch (err) {
      process.stderr.write(`pr-snapshot: section failed: inline comments (${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write(`pr-snapshot: section failed: inline comments (exit ${inlineRes.code})\n`);
    failed = 1;
  }

  // 8. Issue comments: scan for bot quota warnings (last 24h) and sticky HTML markers.
  const issueComments = [];
  const quotaHits = [];
  const stickyMarkers = [];
  const nowMs = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const issueCommentsRes = await ghApi([`repos/${repo}/issues/${num}/comments?per_page=100`, '--paginate']);
  if (issueCommentsRes.code === 0) {
    try {
      issueComments.push(...flattenArrayPages(parseJsonPages(issueCommentsRes.stdout)));
      for (const c of issueComments) {
        const body = String(c?.body || '');
        const author = c?.user?.login || '-';
        const createdMs = Date.parse(c?.created_at || '');
        const within24h = Number.isFinite(createdMs) ? nowMs - createdMs <= oneDayMs : true;
        if (within24h && QUOTA_RE.test(body)) {
          quotaHits.push({
            id: c.id,
            author,
            created_at: c.created_at || '-',
            excerpt: firstMeaningfulLine(body, 120),
          });
        }
        MARKER_RE.lastIndex = 0;
        let m;
        while ((m = MARKER_RE.exec(body)) !== null) {
          stickyMarkers.push({
            id: c.id,
            author,
            marker: m[1].trim(),
          });
        }
      }
    } catch (err) {
      process.stderr.write(`pr-snapshot: section failed: issue comments (${err.message})\n`);
      failed = 1;
    }
  } else {
    process.stderr.write(`pr-snapshot: section failed: issue comments (exit ${issueCommentsRes.code})\n`);
    failed = 1;
  }

  // Compute compact top summary metrics.
  const failingConclusions = new Set(['failure', 'timed_out', 'action_required', 'startup_failure', 'cancelled']);
  const failingChecks =
    checkRuns.filter((r) => failingConclusions.has(r.conclusion)).length +
    statuses.filter((s) => s.state === 'failure' || s.state === 'error').length;
  const pendingChecks =
    checkRuns.filter((r) => r.status !== 'completed').length +
    statuses.filter((s) => s.state === 'pending').length;
  const codexReviewedHeadSha = reviews.some(
    (r) => /codex/i.test(r?.user?.login || '') && r.commit_id === headSha,
  );

  const summary = {
    number: pr.number,
    state: pr.state,
    draft: Boolean(pr.draft),
    merged: Boolean(pr.merged),
    head: headRef,
    head_sha: headSha,
    base: pr.base?.ref || '',
    branch_reused_from_pr: branchReusedFromPr,
    failing_checks: failingChecks,
    pending_checks: pendingChecks,
    unresolved_threads: unresolvedThreads === null ? 'unavailable' : unresolvedThreads.length,
    codex_reviewed_head_sha: codexReviewedHeadSha,
    bot_quota_active: quotaHits.length > 0,
    sticky_markers: stickyMarkers.map((m) => ({ id: m.id, author: m.author, marker: m.marker })),
  };

  process.stdout.write('--- summary ---\n');
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  process.stdout.write('--- pull request ---\n');
  process.stdout.write(
    `${JSON.stringify(
      {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        state: pr.state,
        draft: pr.draft,
        merged: pr.merged,
        head: headRef,
        head_sha: headSha,
        base: pr.base?.ref,
        base_sha: pr.base?.sha,
        mergeable: pr.mergeable,
        mergeable_state: pr.mergeable_state,
        body: pr.body,
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(`--- check runs on ${headSha} (status, conclusion, name, url) ---\n`);
  for (const r of checkRuns) {
    process.stdout.write(`${[r.status, r.conclusion || '-', r.name, r.html_url || '-'].join('\t')}\n`);
  }

  process.stdout.write('--- commit statuses (state, context, url) ---\n');
  for (const s of statuses) {
    process.stdout.write(`${[s.state, s.context, s.target_url || '-'].join('\t')}\n`);
  }

  process.stdout.write('--- reviews (id, state, author, commit, first line of body) ---\n');
  for (const r of reviews) {
    process.stdout.write(
      `${[r.id, r.state, r.user?.login || '-', String(r.commit_id || '').slice(0, 8), firstMeaningfulLine(r.body)].join('\t')}\n`,
    );
  }

  process.stdout.write(
    '--- unresolved review threads (thread id, path, line, outdated, comments, first author, first line, last author, last line) ---\n',
  );
  if (unresolvedThreads !== null) {
    for (const t of unresolvedThreads) {
      const firstComment = t.comments?.nodes?.[0];
      const latestComment = t.latest?.nodes?.[0];
      process.stdout.write(
        `${[
          t.id,
          t.path,
          t.line ?? '-',
          Boolean(t.isOutdated),
          t.comments?.totalCount ?? 0,
          firstComment?.author?.login || '-',
          firstLine(firstComment?.body),
          latestComment?.author?.login || '-',
          firstLine(latestComment?.body),
        ].join('\t')}\n`,
      );
    }
  }

  process.stdout.write('--- inline comments (id, path, line, author, outdated) ---\n');
  for (const c of inlineComments) {
    process.stdout.write(
      `${[c.id, c.path, c.line ?? c.original_line ?? '-', c.user?.login || '-', c.position === null].join('\t')}\n`,
    );
  }

  process.stdout.write('--- issue comment markers & bot quota ---\n');
  for (const q of quotaHits) {
    process.stdout.write(`QUOTA\t${q.id}\t${q.author}\t${q.created_at}\t${q.excerpt}\n`);
  }
  for (const m of stickyMarkers) {
    process.stdout.write(`MARKER\t${m.id}\t${m.author}\t${m.marker}\n`);
  }

  process.exit(failed);
}

await main();
