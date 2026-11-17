# Host-driver test profile (2026-11-17)

Point-in-time developer evidence for issue
[#684](https://github.com/sebastian-software/effective-flow/issues/684). It covers the slow Python
modules under `evals/host-driver/tests/` on a host without SHA extensions. It records the effect of
the composed-fixture node wrapper, a per-test profile of `test_first_stage`,
`test_remaining_stage_worker` and `test_remaining_stage_admission`, and one decision per hot spot.
Hot spots that remain are tracked in
[#686](https://github.com/sebastian-software/effective-flow/issues/686).

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
test passed in its unprofiled run and in the full suite. Its profile data is included.

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
