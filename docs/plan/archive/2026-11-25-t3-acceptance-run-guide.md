# Record how manual acceptance runs are set up on T3 Code

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Manual acceptance runs of Effective Flow on T3 Code (for example the three `merge-gate` PR-watch
runs of #635) sometimes need a thread that calls `watch_pull_request`, ends its turn and is woken
later. A `delegate_task` child never watches, and a native sub-agent cannot end its turn and be
woken, so such a run needs its own top-level thread from `t3_thread_launch`. That tool always
creates an unlinked top-level thread. In the #635 follow-up run 3 (sebastian-software/sf-test-repo#14)
the agent launched one without saying so first and did not link it in the parent thread, so the
acceptance thread looked like a stray thread. The same session also reported "ten minutes" and
"over 20 minutes" of waiting after two `t3_thread_wait` calls that returned `timedOut: true` after
about 45 seconds each.

Record the procedure as a maintainer guide so a separate top-level thread is the intended setup,
announced before launch and linked both ways, and elapsed times come from host timestamps.

## Outcome checkpoint

**Primary source:** user request in this session, based on the analysis in the T3 thread
"Fehlende Thread-Verknüpfung bei Abnahmeläufen"
**Original outcome:** a maintainer guide that makes a separate, announced and linked top-level
thread the documented setup for T3 acceptance runs that must watch and be woken
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** developer-guide page plus index entry plus one AGENTS.md pointer
**Continuation decision:** none

## Architecture decisions

- The guide is developer documentation under `docs/developer-guide/`, not shipped product text
  under `src/`: acceptance runs are a maintainer activity in this repository, and no workflow
  changes behaviour.
- `AGENTS.md` gets exactly one sentence pointing at the guide, because the agent that runs an
  acceptance run reads `AGENTS.md` but not the developer-guide index. The sentence states the rule
  briefly; the procedure lives only in the guide.
- The guide does not override the host rule that `t3_thread_launch` needs a user request: a
  maintainer request for an acceptance run that this guide marks as needing its own thread is that
  request, and the agent names the thread it is about to launch in one line before launching.
- A T3 thread type that is linked yet may watch is a host feature request and stays out of scope.

## Affected files

- `docs/developer-guide/t3-acceptance-runs.md` (new) — the guide.
- `docs/developer-guide/README.md` — one "See also" entry.
- `AGENTS.md` — one pointer sentence.

## Implementation details

### Approach

The guide has these sections:

1. **When a run needs its own thread** — a run whose acceptance requires the executing thread to
   watch a PR, end its turn and be woken (non-interactive `merge-gate`, inline runs that watch), or
   that must start without the parent thread's watch or approval state. Explain why
   `delegate_task` children and native sub-agents cannot do this. Everything else stays in the
   current thread or a delegated child.
2. **Before launching** — one visible line in the parent thread naming the run, why it needs a
   top-level thread, and its title. Title pattern: `<tool> run <n> (<mode>) <owner/repo>#<pr>`.
3. **Launch prompt** — the prompt names the parent thread's `link`, the skill build under test
   (version and commit), the run state and any no-answers instruction, the test PR, and where the
   evidence goes. It asks the launched thread to report its own `link` and result.
4. **Linking both ways** — right after the launch the parent thread prints the launched thread's
   `link` verbatim; the launched thread's prompt carries the parent's link. The recorded evidence
   names both threads.
5. **Waiting and timing** — wait with `t3_thread_wait`; a `timedOut: true` return states no
   elapsed time. Report every duration from host timestamps (thread `createdAt`/`updatedAt`, run
   `startedAt`/`completedAt`, PR check and wake times), never from a requested timeout or an
   estimate.
6. **Recording evidence** — on the issue or PR, per run: thread link, PR, run state, UTC
   timestamps of suspend, turn end, wake and result, and deviations.
7. **Known host gap** — `t3_thread_launch` has no origin field, so the link lines are the only
   relationship between the threads.

### Edge cases

- The maintainer asked for the runs without saying "new thread": the guide's announcement line is
  still required before launch.
- The launched thread itself must not launch further threads for the same run.

## Acceptance criteria

- [x] `docs/developer-guide/t3-acceptance-runs.md` exists with the seven sections above; check:
      each section heading is present (`grep -n '^## ' docs/developer-guide/t3-acceptance-runs.md`).
- [x] The guide names `delegate_task` children never watching and native sub-agents not being
      woken as the reasons for a top-level thread; check: both statements are in section 1.
- [x] The guide requires the announcement line before launch, the parent `link` in the launch
      prompt, and the launched thread's `link` printed verbatim in the parent; check: sections 2–4.
- [x] The guide requires durations from host timestamps and states that `timedOut: true` carries
      no elapsed time; check: section 5.
- [x] `docs/developer-guide/README.md` "See also" links the guide; `AGENTS.md` carries exactly one
      new sentence linking it; check: `git diff --stat` shows one changed line group in each.
- [x] `pnpm agent:check` and `pnpm test` pass.

## Validation plan

- `pnpm agent:check` (oxfmt formatting of the new and changed Markdown).
- `pnpm test` (contract tests that read `AGENTS.md`).
- `node build.mjs` and `pnpm test:distribution` are not required: no file under `src/` or the
  build changes; run `node build.mjs` once anyway to confirm nothing under `dist/` depends on the
  edited files.
- Manual read-through of the guide against the acceptance criteria.

## Assumptions and open points

- No implementation-relevant assumptions.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-25

**Requirement:** as above: a maintainer guide that makes a separate, announced and linked top-level
T3 thread the documented setup for acceptance runs that must watch and be woken, with durations
taken from host timestamps.

**Architecture decisions as built:** as planned. Developer-guide page only, no change under `src/`;
one pointer sentence in `AGENTS.md`; the host rule for `t3_thread_launch` stays in force, and the
guide makes the maintainer's acceptance request the user request while still requiring an
announcement line.

**Affected files:** `docs/developer-guide/t3-acceptance-runs.md` (new),
`docs/developer-guide/README.md`, `AGENTS.md`.

**Implementation details:** the guide carries the seven planned sections. The evidence list names
the run state as `interactive` or `non-interactive` plus the scenario under test.

**Test results:** Phase 5 in the project container (`effective-flow-node24`): `pnpm test` passed
(6578 tests, 6493 passed, 0 failed, 85 skipped), `node build.mjs` passed, `pnpm agent:check` failed
on this plan file's list indentation only; after `oxfmt` on this file `pnpm agent:check` passed.

**Review result:** documentation route; technical validation by `effective-flow-code-validator`
plus an acceptance-criteria read-through. No findings.

## Review findings

**Date:** 2026-11-25
**Reviewer:** effective-flow-code-validator (technical validation), orchestrator read-through

### Summary

No findings.
