# Host-driver test profile (2026-11-17)

Point-in-time developer evidence for issue
[#684](https://github.com/sebastian-software/effective-flow/issues/684). It covers the slow Python
modules under `evals/host-driver/tests/` on a host without SHA extensions. It records the effect of
the composed-fixture node wrapper, a per-test profile of `test_first_stage`,
`test_remaining_stage_worker` and `test_remaining_stage_admission`, and one decision per hot spot.
Hot spots that remain are tracked in
[#686](https://github.com/sebastian-software/effective-flow/issues/686). The last section,
"Deliberate load procedure (#695)", describes how to run the suite under deliberate load.

## Host

| Item           | Recorded value                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU            | Intel Core i7-8700 @ 3.20 GHz, 12 logical CPUs                                                                                                                                                                                                                                                                                                 |
| CPU flags      | `aes`, `ssse3`, `sse4_2`, `avx2`; no `sha_ni`, no `avx512f`, no `hypervisor`                                                                                                                                                                                                                                                                   |
| Virtualization | Incus LXC system container on bare metal; the tests ran in a rootless Podman container inside it                                                                                                                                                                                                                                               |
| OS             | Ubuntu 26.04.1 LTS guest, kernel 7.0.0; test container Debian 12, Python 3.11.2, Node.js 24.22.2                                                                                                                                                                                                                                               |
| Mitigations    | `meltdown`: PTI; `spectre_v2`: IBRS, IBPB conditional, STIBP conditional, RSB filling; `retbleed`: IBRS; `mds`, `mmio_stale_data`: clear CPU buffers, SMT vulnerable; `l1tf`: PTE inversion, SMT vulnerable; `tsx_async_abort`: TSX disabled; `srbds`: microcode; `vmscape`: IBPB before exit to userspace; `gather_data_sampling`: vulnerable |
| `TMPDIR`       | Unset, so `/tmp`: a runner-owned bind mount on ZFS (`rw,nosuid,nodev`), the same backing for every run below                                                                                                                                                                                                                                   |
| Load           | Shared host. Other workloads ran at the same time (load average about 1 to 5), so before and after runs were interleaved                                                                                                                                                                                                                       |

The host qualifies for the profile. Each profiled module took about four times its CI time (at
least 3.9x).
The CI time is the sum of per-case durations in the `ubuntu-latest` CI run for `61985a05`, which
also includes one interpreter start per case:

| Module                           | This host, unprofiled wall | CI per-case sum | Ratio |
| -------------------------------- | -------------------------: | --------------: | ----: |
| `test_first_stage`               |                    265.3 s |          60.2 s |  4.4x |
| `test_remaining_stage_worker`    |                    224.1 s |          50.9 s |  4.4x |
| `test_remaining_stage_admission` |                    150.3 s |          37.8 s |  4.0x |

## Composed fixture before and after

Command, run from the repository root in a fresh container each time:
`PYTHONPATH=evals/host-driver/tests:evals/host-driver python3 -B -m unittest -v test_remaining_stage_composed`.
"Before" is a detached checkout of `61985a05`. "After" carries the node wrapper. Runs alternated,
starting with an after run. Wall time is measured around the unittest command inside the container.

| State  | Run 1    | Run 2    | Run 3    | Median   |
| ------ | -------- | -------- | -------- | -------- |
| Before | 182.12 s | 184.81 s | 188.93 s | 184.81 s |
| After  | 165.63 s | 168.39 s | 168.11 s | 168.11 s |

All six runs passed all three tests. The slowest after run (168.39 s) is faster than the fastest
before run (182.12 s). The median drops by 16.70 s (9.0 %). The drop is the node bytes the fixture
no longer copies and hashes. The remaining time is not node hashing. This module was not profiled,
and [#686](https://github.com/sebastian-software/effective-flow/issues/686) records it as an
observation.

## Profile method

Script: `evals/host-driver/diagnostics/profile_modules.py` with default targets and `--top 40`.
It ran from the repository root with
`PYTHONPATH=evals/host-driver/tests:evals/host-driver`, and its output directory was in the
container's `/tmp`, outside the checkout. Each of the 58 test ids ran twice, each time in a fresh
child interpreter:

- **Unprofiled:** wall time plus that child's `RUSAGE_SELF` and `RUSAGE_CHILDREN` user/system
  deltas around the single test.
- **Profiled:** one `cProfile.Profile(time.thread_time)` in the main thread and one in every
  `threading.Thread`. The script wraps `Thread.run` before the test starts, so
  `ThreadPoolExecutor` workers, including the stage-loop pools, are profiled in their own thread.
  The per-thread stats are merged.

Coverage check: summed profiled thread CPU divided by the profiled run's `RUSAGE_SELF`
user+system was 1.00 (`test_first_stage`), 0.99 (`test_remaining_stage_worker`) and 1.00
(`test_remaining_stage_admission`), with no unfinished threads. Pool-thread work is therefore
captured. Profiled and unprofiled numbers are never compared with each other.

Limitations:

- cProfile does not attribute subprocess hot spots. Child processes appear only as
  `RUSAGE_CHILDREN` time, which counts only waited-for descendants, so orphaned descendants are
  missing from it.
- Time blocked inside `wait` does not count, because `time.thread_time` excludes it.

A second profiled run took one test per module with the same script. Its `pstats` caller
attribution is the basis for the shares in "Hot spots" below.

One profiled run failed:
`test_remaining_stage_worker.RemainingStageWorkerContracts.test_changed_prior_seal_or_future_batch_artifact_stops_next_batch`
(`(6, 0) != (6, 1)`: no batch was sealed). The fixture's six-thread barrier has a 30 s timeout,
and cProfile overhead (about 4x in-process time) pushed the six reservations past it. The same
test passed in its unprofiled run and in the full suite. Its profile data is included. This
profile run is a slow-host reproduction of that barrier arrival-skew failure; see
"Deliberate load procedure (#695)".

## Per-module results

Unprofiled times are summed over all test ids of the module:

| Module                           | Tests | Wall    | Self user | Self system | Children user | Children system |
| -------------------------------- | ----: | ------- | --------: | ----------: | ------------: | --------------: |
| `test_first_stage`               |    36 | 265.3 s |   78.50 s |     87.15 s |        0.00 s |          0.00 s |
| `test_remaining_stage_worker`    |     8 | 224.1 s |   64.49 s |     68.43 s |        3.09 s |          1.29 s |
| `test_remaining_stage_admission` |    14 | 150.3 s |   46.04 s |     45.68 s |        4.14 s |          1.63 s |

In-process CPU dominates the measured time. Self CPU is about 60 % of wall time in each module
(165.7 s of 265.3 s, 132.9 s of 224.1 s, 91.7 s of 150.3 s), and about half of it is system time.
Children time is below 4 % of wall time and at most 6.3 % of self CPU
(`test_remaining_stage_admission`), so child system time does not dominate. The remaining 40 % of
wall time is off-CPU, for example sleeps, waits or I/O. This profile does not attribute it, and it
was not investigated.

Top in-process hot spots by thread CPU (`tottime`) in the profiled runs, with module self CPU
(`RUSAGE_SELF` user+system) of 644.2 s, 517.7 s and 364.4 s respectively:

| Function                                                       | `test_first_stage`  | `test_remaining_stage_worker` | `test_remaining_stage_admission` |
| -------------------------------------------------------------- | ------------------- | ----------------------------- | -------------------------------- |
| `posix.lstat`                                                  | 89.9 s, 9.55M calls | 73.1 s, 7.92M calls           | 48.9 s, 4.67M calls              |
| `pathlib.py:55(parse_parts)`                                   | 59.5 s, 3.02M calls | 45.4 s, 2.41M calls           | 32.3 s, 1.57M calls              |
| `posixpath:418(_joinrealpath)`                                 | 50.4 s, 0.89M calls | 41.0 s, 0.75M calls           | 27.2 s, 0.45M calls              |
| `posixpath:71(join)`                                           | 49.7 s, 9.40M calls | 40.3 s, 7.72M calls           | 26.8 s, 4.58M calls              |
| `builtins.isinstance`                                          | 25.8 s, 32.5M calls | 22.4 s, 28.6M calls           | 15.5 s, 18.1M calls              |
| `posix.stat`                                                   | 15.9 s, 1.31M calls | 13.3 s, 1.11M calls           | 9.8 s, 0.73M calls               |
| `evals/host-driver/eval_first_stage.py:142(pinned)` (own time) | 3.1 s, 69.7k calls  | 2.2 s, 40.6k calls            | below the top 40                 |

All rows but the last are standard-library frames. The caller attribution assigns them to the
repository code below, as shares of profiled thread CPU in the sampled tests:

| Hot spot                                                                                                                             | Share                   | Decision                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `canonical()` (`evals/host-driver/eval_first_stage.py:63`) calls `Path.resolve()`, one `lstat` per path component, twice per pin     | 49 to 52 %              | Follow-up issue [#686](https://github.com/sebastian-software/effective-flow/issues/686): inside the immutability contract |
| Pin volume: 15,498 to 18,889 `pinned()` calls per sampled test (6 or 7 `authenticate()` calls); cumulative `authenticate` / `pinned` | 89 to 95 % / 65 to 67 % | Follow-up issue [#686](https://github.com/sebastian-software/effective-flow/issues/686)                                   |
| `file_digest()` (cumulative, mostly its own `canonical()` call)                                                                      | 21 %                    | Follow-up issue [#686](https://github.com/sebastian-software/effective-flow/issues/686)                                   |
| `Path.resolve()` in `read_bound_json()` (`evals/host-driver/eval_driver_runtime.py:158`)                                             | 8 %                     | Follow-up issue [#686](https://github.com/sebastian-software/effective-flow/issues/686)                                   |
| Large-executable hashing in these three modules                                                                                      | none                    | No measurable cost, unchanged: their fixtures use 40-byte synthetic executables                                           |

The high system share fits the syscall-heavy `lstat` pattern on a host with PTI and IBRS active.
This explanation was not measured separately.

## Stage-loop wait sites

Gate: a wait site changes only when its own thread CPU reaches 5 % of the module's `RUSAGE_SELF`
user+system time. The site cost is an upper bound. It is the cumulative thread CPU of the loop's
callees (`concurrent.futures.wait`, `Future.done`, `Event.is_set`, `driver.block`) when the stage
function calls them, plus the stage function's own time. Blocked time inside `wait` and
children time are not counted.

| Site                                                                    | Module reaching it in the profile | Upper bound | Share of self CPU | Decision                              |
| ----------------------------------------------------------------------- | --------------------------------- | ----------: | ----------------: | ------------------------------------- |
| `run_first_stage` wait, `evals/host-driver/eval_first_stage.py:918`     | `test_first_stage`                |    0.4585 s |            0.07 % | No measurable cost, unchanged         |
| `run_remaining_stage` wait, `evals/host-driver/eval_first_stage.py:989` | `test_remaining_stage_worker`     |    0.0133 s |           0.003 % | No measurable cost, unchanged         |
| `run_remaining_stage` wait, `evals/host-driver/eval_first_stage.py:989` | `test_remaining_stage_admission`  |    0.0000 s |            0.00 % | Not reached by this module, unchanged |

Neither site meets the gate, so `evals/host-driver/eval_first_stage.py` is unchanged. Both loops
keep their 0.1 s interval, so the old and new worst-case stop-reaction latency is the same, about
0.1 s per loop wake. With no changed site, the 5x before and 5x after repetitions do not apply.

Also not reached by the profiled modules, and unchanged:

- The 50 ms watchdog `select` in `evals/host-driver/eval_host_worker.py:69`. The profiled modules
  forbid `os.fork`, and it runs in a child process that cProfile cannot see.
- `Driver.run_all` polling in `evals/host-driver/run-cohorts.py:553`.

## Open evidence debt

None. The host qualifies for both manual bullets.

## After #686 (2026-11-17)

Re-measurement for issue [#686](https://github.com/sebastian-software/effective-flow/issues/686),
which removes duplicated canonicalization and duplicated pins inside one call (commit a, items
1 to 4) and replaces the `Path.resolve()` fixed point in `canonical()` with a loop-safe
`os.path.realpath()` check (commit b, item 5). The decisions are recorded in
[the host-driver README](../../evals/host-driver/README.md).

Same host class as above: Intel Core i7-8700, no `sha_ni`, the same mitigation state, Incus LXC
guest with rootless Podman, Python 3.11.2 in the container, `TMPDIR` unset so `/tmp` on the same
runner-owned ZFS bind mount. "Before" is a detached checkout of `1b1fd1c7`; "after (a)" and
"after" are detached checkouts of the two code commits. Each state ran in its own fresh
container, one run at a time. Other workloads shared the host (load average about 1 to 6).

Absolute numbers differ from the section above: this session's "before" self CPU of
`test_first_stage` was 272.7 s against 165.7 s there, on the same code paths. Compare numbers only
within this section.

### Wall time per module

Command per module, as above:
`PYTHONPATH=evals/host-driver/tests:evals/host-driver python3 -B -m unittest -v <module>`. Each
round ran every module after, then before. All 18 runs passed.

| Module                           | State  | Run 1    | Run 2    | Run 3    | Median   | Median drop       |
| -------------------------------- | ------ | -------- | -------- | -------- | -------- | ----------------- |
| `test_first_stage`               | Before | 296.22 s | 298.22 s | 256.75 s | 296.22 s |                   |
| `test_first_stage`               | After  | 132.17 s | 129.45 s | 117.06 s | 129.45 s | 166.77 s (56.3 %) |
| `test_remaining_stage_worker`    | Before | 337.28 s | 215.43 s | 213.85 s | 215.43 s |                   |
| `test_remaining_stage_worker`    | After  | 165.45 s | 106.53 s | 97.36 s  | 106.53 s | 108.90 s (50.6 %) |
| `test_remaining_stage_admission` | Before | 156.50 s | 135.99 s | 134.11 s | 135.99 s |                   |
| `test_remaining_stage_admission` | After  | 80.82 s  | 67.25 s  | 68.96 s  | 68.96 s  | 67.03 s (49.3 %)  |

In every module the slowest after run is faster than the fastest before run, so the wall-time
result is conclusive.

### Self CPU per module

One unprofiled `profile_modules.py` run per state over all 58 test ids, with the method above. All
runs succeeded.

| Module                           | Tests | State  | Wall    | Self user | Self system | Self user+system | Drop              |
| -------------------------------- | ----: | ------ | ------- | --------: | ----------: | ---------------: | ----------------- |
| `test_first_stage`               |    36 | Before | 453.1 s |  139.23 s |    133.49 s |         272.72 s |                   |
| `test_first_stage`               |    36 | After  | 133.9 s |   44.15 s |     45.72 s |          89.87 s | 182.85 s (67.0 %) |
| `test_remaining_stage_worker`    |     8 | Before | 264.7 s |   84.15 s |     76.30 s |         160.45 s |                   |
| `test_remaining_stage_worker`    |     8 | After  | 108.1 s |   34.28 s |     33.03 s |          67.31 s | 93.14 s (58.0 %)  |
| `test_remaining_stage_admission` |    14 | Before | 151.3 s |   46.66 s |     45.93 s |          92.59 s |                   |
| `test_remaining_stage_admission` |    14 | After  | 75.2 s  |   23.43 s |     23.14 s |          46.57 s | 46.02 s (49.7 %)  |

Children time is unchanged within noise (at most 4.2 s user and 1.6 s system per module).

### Profiled attribution

Profiled runs of the same three sampled tests as above, one per state, including one after
commit (a). `canonical()` share is its cumulative thread CPU divided by the test's profiled
thread CPU. Call counts come from a separate `sys.setprofile` count of the same tests, because
the fixtures load several copies of `eval_first_stage.py` and cProfile mislabeled some entries of
those copies in the worker test after commit (b).

| Sampled test module              | State     | Thread CPU | `canonical()` share | `canonical()` calls | `pinned()` calls |
| -------------------------------- | --------- | ---------: | ------------------: | ------------------: | ---------------: |
| `test_first_stage`               | Before    |   265.79 s |              65.0 % |             220,410 |           92,988 |
| `test_first_stage`               | After (a) |    93.74 s |              51.1 % |              77,562 |           76,248 |
| `test_first_stage`               | After     |    79.25 s |              46.2 % |              77,562 |           76,248 |
| `test_remaining_stage_worker`    | Before    |   179.95 s |              62.0 % |             154,071 |           64,973 |
| `test_remaining_stage_worker`    | After (a) |    65.23 s |              48.1 % |              56,071 |           53,686 |
| `test_remaining_stage_worker`    | After     |    59.82 s |      not attributed |              56,071 |           53,686 |
| `test_remaining_stage_admission` | Before    |    54.12 s |              59.5 % |              50,918 |           21,468 |
| `test_remaining_stage_admission` | After (a) |    22.84 s |              43.7 % |              18,418 |           17,712 |
| `test_remaining_stage_admission` | After     |    21.63 s |              39.1 % |              18,418 |           17,712 |

`authenticate()` ran 36, 25 and 8 times per sampled test in every state, so the drop comes from
work per call, not from fewer calls. Items 1 to 4 (commit a) account for nearly all of it: they
cut profiled thread CPU by 64.7 %, 63.8 % and 57.8 % of the before value. They cut `canonical()`
calls by 65 %, 64 % and 64 %, and `pinned()` calls by 18 %, 17 % and 17 %. Item 5 (commit b)
changes no call count. It cut profiled thread CPU by a further 5.5, 3.0 and 2.2 points. That
share is overstated: cProfile inflates the Python-level `pathlib` frames that item 5 removes, and
the unprofiled runs did not measure commit (a) separately. Item 5 is a loop-safety change, and
no unprofiled saving is claimed for it.

What remains: `canonical()` is still the largest single cost, through the `lstat` walk inside
`realpath()`, once per pin. Every call still re-reads and re-verifies every pinned input. The
off-CPU share of wall time and `test_remaining_stage_composed` were not addressed.

## Deliberate load procedure (#695)

Developer procedure for issue
[#695](https://github.com/sebastian-software/effective-flow/issues/695). Two cases failed under
load: the composed six-worker recovery case
(`test_remaining_stage_composed.ComposedRemainingStageContracts.test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate`,
a fixed 35 s `wait_for('six wrapper starts')`) and the batch-failure case
(`test_remaining_stage.RemainingStageCohortContracts.test_current_batch_failure_blocks_every_future_batch_and_preserves_original_charges`).
The waits are now scoped to liveness (`evals/host-driver/tests/liveness_wait.py`) instead of fixed
timeouts. To check a change to these waits, run the suite under at least the load that failed: two
additional full suites in parallel (load1 mean 8.8, peak 18 in the issue), or a stressor that holds
the host `load1` at or above 8.8. Read `load1` from `/proc/loadavg` of the host, for example every
5 s.

The measurements below come from the host described in "Host" (i7-8700, 12 logical CPUs, rootless
Podman container, Python 3.11.2, Node.js 24.22.2) at base `04c2aca7`, before the liveness waits.

### Method A: full suite under load

Start N CPU busy loops in the same container, run `pnpm test`, then stop the loops:

```sh
for i in $(seq 8); do sh -c 'while :; do :; done' & done
pnpm test
kill $(jobs -p)
```

Alternatively run two additional full suites in parallel, each in its own checkout. The target is a
`load1` mean of at least 8.8. With 8 busy loops (`load1` mean 14.4, peak 21.9, wall 1385 s) neither
named case failed: the composed recovery case took 77.3 s and the batch-failure case 27.0 s. Full
suite load alone did not reproduce the failure on this host. With the liveness waits, three
consecutive runs of the same procedure passed every test of `test_remaining_stage`,
`test_remaining_stage_worker` and `test_remaining_stage_composed`.

### Method B: targeted reproduction

From the repository root, with 16 busy loops in the same container, run these concurrently: 2
copies of the composed recovery case (stop after 210 s) and 3 copies of the batch-failure case
(stop after 150 s). Each copy is:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=evals/host-driver/tests:evals/host-driver \
  python3 -B -m unittest -v <test id>
```

At `load1` mean 8.4 (peak 16.5) both composed copies failed: the fixed 35 s
`wait_for('six wrapper starts')` expired, the child exited 1 and the parent reported `1 != 0`. The
batch-failure case passed but slowed from about 27 s to 77 to 87 s.

Method B loads the host beyond the composed case's unchanged 180 s inner timeout: its setup and
wrapper starts ran about five times slower than on a quiet host. With the liveness waits the
batch-failure case still passes, and the composed case now stops at the per-wait deadline cap with
a message that lists every wrapper as still running, instead of at a fixed 35 s wait. Use method B
to check that a stall is reported with the producers' liveness, not as a pass criterion.

The composed child prints one stderr line prefixed `composed-phase-timing: ` with the cumulative
elapsed seconds at the end of each phase (setup, starts, recovery, ready, context, closures,
batchTwo, summary, teardown) and `headroomSeconds` to the 120 s or 180 s inner timeout. The parent
forwards that line on success; on failure it is part of the child's captured output. Use it to read
phase timings and the remaining headroom under load.

### Profiling script as a reproduction

`evals/host-driver/diagnostics/profile_modules.py` is a slow-host reproduction of the barrier
arrival-skew failure: its cProfile overhead (about 4x in-process time) reproduced the failing
`(6, 0)` result described in "Profile method". It is not a reproduction of the `compute()`
timeout, because cProfile slows only in-process Python and not the node `compute()` subprocess.
