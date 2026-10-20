---
name: eng-benchmark-checklist
description: Vet a performance measurement for limiter, tuning, limits, errors, repeatability, relevance, and whether the work happened before you report or act on it. Use when you run a benchmark or report a measured speedup or regression.
disable-model-invocation: true
---

# Benchmark checklist

Use this when you produce a performance number: a before and after, a regression claim, a tuning loop, or a library or config choice. Answer each question with evidence from a run, not a guess about the code.

For a quick ballpark the user asked for, one run is enough. Still check questions 4 and 7 and say it is one run. A choice between options is never a ballpark.

Repo facts (from AGENTS.md or CLAUDE.md, or a harness README): the repo's load and benchmark harnesses, their default targets, and the metrics endpoints to scrape during a run.

## Before you run anything

- Read the harness's flags. If its default target is a shared or production endpoint, point it at one you own; never load production without explicit authorization.
- Write down the claim you expect to make, in the words you would ship ("export is 30% faster at p50 on the 60k-row dataset"). The questions test that sentence.
- Read the measurement script. Note what it times, counts, and ignores.
- Check `uptime` and `nproc`. If the machine is busy, find out what is running. If you cannot stop it, interleave the sides and say so.

## The questions

1. **Why not double?** Name the limiter. Profile in a run you do not report, because profilers slow the work. Use CPU per process (`top`, `pidstat`), a runtime profiler (`node --cpu-prof`, `py-spy`, `perf`), I/O wait, and syscall counts (`strace -c`). Watch the load generator: if it saturates first, you measured it. If a change did not move the number, the limiter explains why.
2. **Was it tuned?** Run every side the way production runs it: release builds, production flags, batching, connection pools, realistic cache state, same versions and data. A limiter that is a setting (a commit per row, a debug build, a missing index) means that side is untuned. Tune it and measure again. If you cannot, do not pick a winner.
3. **Did it break limits?** Do the arithmetic against disk and network bandwidth, core counts, and the share of time the changed piece took. Removing a piece that takes 10% of the run makes it at most about 11% faster. A result past a limit measured something other than the work.
4. **Did it error?** Count failures and non-success responses, and check that outputs are correct. Rejections are fast, and timeouts and retries are slow. Add an error count if the script lacks one.
5. **Does it reproduce?** Run each side at least 5 times, alternating A, B, A, B so warmup and drift favor neither. Report the median and range. A gap smaller than run-to-run variation is no measurable difference.
6. **Does it matter?** Measure the end-to-end path a user waits on, with realistic data sizes and concurrency, and report the micro result as a share of the whole. For production paths, compare with tracing spans (`sentry-perf` when the repo uses Sentry).
7. **Did it even happen?** Confirm the work ran inside the timed region: the request reached the server, rows were written, bytes were read, and the result was used. Lazy code and timeouts produce numbers for work that never happened.

## Report

- Lead with the verdict: faster, slower, no measurable difference, or inconclusive.
- Give the number with its unit, run count, range, and limiter. For example: "p50 41 ms to 33 ms, median of 7 runs per side, range 32 to 35 ms after, bound by JSON parsing on one core."
- Call it inconclusive when you cannot name the limiter, a side ran untuned, or questions 4 and 7 could not be checked. Name the gap.
- Keep a PR body to one primary number. Link the runs and evidence.

## Verify

For a ballpark, only the claim sentence and questions 4 and 7 apply, and the report says it is one run. Otherwise:

- The claim sentence was written before the runs.
- Limiter named from a profile, not from reading code.
- Every side tuned the same way production is.
- At least 5 alternating runs per side, with median and range.
- Errors counted and work confirmed inside the timed region.
