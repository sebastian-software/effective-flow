"""Manual per-test profile of slow host-driver unittest modules.

This is a diagnostic, not a test: it lives outside ``tests/`` and does not match
``test_*.py``, so neither the host-driver unittest discovery nor ``node --test``
runs it. Run it from the repository root with the same import path the suite
uses::

    PYTHONPATH=evals/host-driver/tests:evals/host-driver python3 -B \\
        evals/host-driver/diagnostics/profile_modules.py [options] [target ...]

Targets are unittest names (a module, a class or a single test id). Without
targets it profiles ``test_first_stage``, ``test_remaining_stage_worker`` and
``test_remaining_stage_admission``. ``--list`` resolves and prints every test id
of the selected targets without running any of them.

Measurement. Every test id runs in a fresh child interpreter (``sys.executable
-B``, inherited environment), never in this process, because ``RUSAGE_*`` values
accumulate over a process's lifetime. Two separate child runs exist per id:

* unprofiled: wall time (``time.monotonic``) plus ``RUSAGE_SELF`` and
  ``RUSAGE_CHILDREN`` user/system deltas taken immediately around running the
  one loaded test, plus its outcome;
* profiled: one ``cProfile.Profile(time.thread_time)`` per thread, enabled in
  the main thread around the test and in every ``threading.Thread`` (its
  ``run`` is wrapped before the test starts, so ``ThreadPoolExecutor`` workers
  are covered); the per-thread stats are merged with ``pstats``. The run records
  its ``RUSAGE_SELF`` delta and the coverage ratio of summed profiled thread CPU
  to ``RUSAGE_SELF`` user+system.

Profiled and unprofiled numbers are never compared with each other, because the
profiler inflates in-process time; before/after comparisons use the same mode.

Wait-site cost. For the stage loops in ``eval_first_stage.py``
(``run_first_stage`` and ``run_remaining_stage``) the report sums, from the
merged thread-CPU stats, the cumulative time each loop callee
(``concurrent.futures.wait``, ``Future.done``, ``Event.is_set``,
``driver.block``) spent when called from that function, adds the function's own
tottime, and reports the sum as an upper bound together with call counts. A
module aggregate states each site's share of the module's summed profiled
``RUSAGE_SELF`` user+system time.

Output. Every run writes into a directory outside the checkout: ``--output``
(refused inside the repository, and refused when it exists and is not empty) or,
by default, a fresh ``tempfile.mkdtemp`` directory under the temporary
directory. Per test id it holds a JSON summary, the raw child results, the raw
merged ``.pstats`` and the child's log; per module an aggregate JSON (sums of
wall and of self/children user/system time, wait-site cost and share, merged top
hot spots); ``summary.json`` combines them. A compact human-readable summary is
printed at the end. Paths inside reports are shown relative to the repository
root (``<stdlib>`` and ``<tmp>`` mark the interpreter library and the temporary
directory). The exit status is 0 only when every run produced results and every
outcome is a success or a skip.

Limitations:

* cProfile does not see subprocesses: child processes appear only as
  ``RUSAGE_CHILDREN`` time, which counts waited-for descendants only, so
  orphaned descendants are missing from it. Children time is never evidence for
  an in-process hot spot.
* Time blocked inside ``wait`` never counts, because ``time.thread_time``
  excludes it; the wait-site sum is an upper bound because ``Event.is_set`` and
  ``driver.block`` are also called outside the loops.
* Threads whose class overrides ``run`` without calling ``Thread.run`` and
  threads still running when the test ends are not covered; the coverage ratio
  and the reported unfinished-thread count expose that gap.
* From Python 3.12 cProfile is built on ``sys.monitoring`` and only one profiler
  can be active per interpreter, so per-thread profilers fail. Profiled mode
  detects that and stops with an error instead of falling back; use Python 3.11.
* Standard library only; it needs the repository-native ``PYTHONPATH`` above.
"""
from __future__ import annotations

import argparse
import cProfile
import functools
import json
import os
from pathlib import Path
import pstats
import re
import resource
import signal
import subprocess
import sys
import sysconfig
import tempfile
import threading
import time
import unittest


REPOSITORY = Path(__file__).resolve().parents[3]
DEFAULT_MODULES = ('test_first_stage', 'test_remaining_stage_worker', 'test_remaining_stage_admission')
CHILD_FLAG = '--child-run'
DRIVER_FILE = 'eval_first_stage.py'
FUTURES_FILE = 'concurrent/futures/_base.py'
# Loop callees per stage function: (path suffix or '' for any file, function name).
WAIT_SITES = {
    'run_first_stage': ((FUTURES_FILE, 'wait'), (FUTURES_FILE, 'done'),
                        ('threading.py', 'is_set'), ('', 'block')),
    'run_remaining_stage': ((FUTURES_FILE, 'wait'), ('threading.py', 'is_set'), ('', 'block')),
}
SUCCESSFUL = ('success', 'skipped')
DETAIL_LIMIT = 4000


class ResolutionError(ValueError):
    """A target cannot be resolved to at least one loadable test id."""


class ProfilerUnavailable(RuntimeError):
    """Per-thread cProfile profilers cannot run in this interpreter."""


def flatten(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from flatten(item)
        else:
            yield item


def resolve_test_ids(targets=DEFAULT_MODULES):
    """Return {target: [test ids]} without running any test; raise ResolutionError."""
    resolved = {}
    for target in targets:
        loader = unittest.TestLoader()
        try:
            suite = loader.loadTestsFromName(target)
        except Exception as error:
            raise ResolutionError(f'cannot resolve {target}: {error}') from error
        ids = [case.id() for case in flatten(suite)]
        failed = [identity for identity in ids if identity.startswith('unittest.loader._FailedTest')]
        if loader.errors or failed:
            raise ResolutionError(f'cannot resolve {target}:\n' + '\n'.join(loader.errors or failed))
        if not ids:
            raise ResolutionError(f'{target} yields no test ids')
        resolved[target] = ids
    return resolved


def relative_text(text):
    """Show repository, interpreter-library and temporary paths without host prefixes."""
    replacements = sorted({
        (str(REPOSITORY) + os.sep, ''),
        (sysconfig.get_paths()['stdlib'] + os.sep, '<stdlib>/'),
        (os.path.realpath(tempfile.gettempdir()) + os.sep, '<tmp>/'),
        (tempfile.gettempdir() + os.sep, '<tmp>/'),
    }, key=lambda pair: -len(pair[0]))
    for prefix, label in replacements:
        text = text.replace(prefix, label)
    return text


def label(function):
    filename, line, name = function
    if filename == '~':
        return name
    return f'{relative_text(filename)}:{line}({name})'


def require_per_thread_profiling():
    """Fail loudly when a second thread cannot run its own cProfile profiler."""
    outer = cProfile.Profile(time.thread_time)
    errors = []

    def inner():
        profile = cProfile.Profile(time.thread_time)
        try:
            profile.enable()
            profile.disable()
        except Exception as error:
            errors.append(error)

    outer.enable()
    try:
        thread = threading.Thread(target=inner)
        thread.start()
        thread.join()
    finally:
        outer.disable()
    if errors:
        raise ProfilerUnavailable(
            f'per-thread cProfile profilers are unavailable on Python {sys.version.split()[0]} '
            f'({errors[0]}); from Python 3.12 only one profiler can be active per interpreter. '
            'Run profiled mode with Python 3.11; there is no fallback.')


class ThreadProfiles:
    """Profile every threading.Thread with its own thread-CPU cProfile profiler."""

    def __init__(self):
        self.lock = threading.Lock()
        self.finished = []
        self.started = 0
        self.original = None

    def install(self):
        original = threading.Thread.run
        collector = self

        @functools.wraps(original)
        def run(thread):
            profile = cProfile.Profile(time.thread_time)
            with collector.lock:
                collector.started += 1
            profile.enable()
            try:
                return original(thread)
            finally:
                profile.disable()
                with collector.lock:
                    collector.finished.append(profile)

        self.original = original
        threading.Thread.run = run

    def uninstall(self):
        threading.Thread.run = self.original


def merge_profiles(profiles):
    merged = None
    for profile in profiles:
        profile.create_stats()
        if not profile.stats:
            continue
        if merged is None:
            merged = pstats.Stats(profile)
        else:
            merged.add(profile)
    return merged


def rusage():
    own = resource.getrusage(resource.RUSAGE_SELF)
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    return own.ru_utime, own.ru_stime, children.ru_utime, children.ru_stime


def outcome(result):
    for entries, kind in ((result.errors, 'error'), (result.failures, 'failure')):
        if entries:
            return kind, relative_text('\n'.join(text for _, text in entries))[-DETAIL_LIMIT:]
    if result.unexpectedSuccesses:
        return 'unexpected-success', ''
    if result.skipped:
        return 'skipped', relative_text(result.skipped[0][1])[-DETAIL_LIMIT:]
    if result.expectedFailures:
        return 'expected-failure', ''
    return ('success', '') if result.testsRun == 1 else ('not-run', '')


def child_main(argv):
    """Run exactly one test id in this fresh interpreter and write its raw result."""
    mode, test_id, result_path, pstats_path = argv
    profiled = mode == 'profiled'
    if profiled:
        require_per_thread_profiling()
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName(test_id)
    cases = list(flatten(suite))
    if loader.errors or [case.id() for case in cases] != [test_id]:
        raise ResolutionError(f'{test_id} does not resolve to exactly one test:\n' + '\n'.join(loader.errors))
    result = unittest.TestResult()
    threads = main = None
    if profiled:
        threads = ThreadProfiles()
        threads.install()
        main = cProfile.Profile(time.thread_time)
    before = rusage()
    started = time.monotonic()
    if profiled:
        main.enable()
    try:
        suite.run(result)
    finally:
        if profiled:
            main.disable()
        wall = time.monotonic() - started
        after = rusage()
    record = {'schemaVersion': 1, 'mode': mode, 'testId': test_id, 'wallSeconds': wall,
              'rusage': dict(zip(('selfUser', 'selfSystem', 'childrenUser', 'childrenSystem'),
                                 (b - a for a, b in zip(before, after))))}
    record['outcome'], record['details'] = outcome(result)
    if profiled:
        threads.uninstall()
        with threads.lock:
            finished = list(threads.finished)
            record['threads'] = {'profiled': len(finished),
                                 'unfinished': threads.started - len(finished)}
        merged = merge_profiles([main, *finished])
        if merged is None:
            raise RuntimeError(f'{test_id} produced no profile data')
        merged.dump_stats(pstats_path)
    Path(result_path).write_text(json.dumps(record, indent=2) + '\n')
    return 0


def top_functions(stats, count):
    rows = sorted(stats.stats.items(), key=lambda item: item[1][2], reverse=True)[:count]
    return [{'function': label(function), 'calls': nc, 'primitiveCalls': cc,
             'tottime': tt, 'cumtime': ct} for function, (cc, nc, tt, ct, _) in rows]


def wait_site_costs(stats):
    """Thread-CPU upper bound per stage loop: loop callees' per-caller cumtime plus own tottime."""
    sites = {}
    for site, callees in WAIT_SITES.items():
        callers = [function for function in stats.stats
                   if os.path.basename(function[0]) == DRIVER_FILE and function[2] == site]
        entry = {'callerTottime': sum(stats.stats[f][2] for f in callers),
                 'callerCalls': sum(stats.stats[f][1] for f in callers), 'callees': []}
        for function, (_, _, _, _, edges) in stats.stats.items():
            path = function[0].replace(os.sep, '/')
            if not any(function[2] == name and path.endswith(suffix) for suffix, name in callees):
                continue
            calls = cumtime = 0
            for caller in callers:
                if caller in edges:
                    # Caller edges are (calls, primitive calls, tottime, cumtime).
                    calls += edges[caller][0]
                    cumtime += edges[caller][3]
            if calls:
                entry['callees'].append({'function': label(function), 'calls': calls, 'cumtime': cumtime})
        entry['callees'].sort(key=lambda row: row['cumtime'], reverse=True)
        entry['calleeCumtime'] = sum(row['cumtime'] for row in entry['callees'])
        entry['upperBound'] = entry['calleeCumtime'] + entry['callerTottime']
        sites[site] = entry
    return sites


def load_stats(paths):
    merged = None
    for path in paths:
        if merged is None:
            merged = pstats.Stats(str(path))
        else:
            merged.add(str(path))
    return merged


def file_stem(test_id):
    return re.sub(r'[^A-Za-z0-9._-]', '_', test_id)


def run_child(mode, test_id, output, timeout):
    stem = file_stem(test_id)
    result_path = output / f'{stem}.{mode}.raw.json'
    pstats_path = output / f'{stem}.pstats'
    log_path = output / f'{stem}.{mode}.log'
    command = [sys.executable, '-B', str(Path(__file__).resolve()), CHILD_FLAG, mode, test_id,
               str(result_path), str(pstats_path)]
    with open(log_path, 'wb') as log:
        child = subprocess.Popen(command, cwd=REPOSITORY, stdin=subprocess.DEVNULL, stdout=log,
                                 stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            return {'mode': mode, 'testId': test_id, 'outcome': 'timeout', 'log': log_path.name}
    if code != 0 or not result_path.exists():
        return {'mode': mode, 'testId': test_id, 'outcome': 'child-error', 'exitCode': code,
                'log': log_path.name}
    record = json.loads(result_path.read_text())
    record['log'] = log_path.name
    if mode == 'profiled':
        record['pstats'] = pstats_path.name
    return record


def profiled_summary(record, stats, top):
    own = record['rusage']['selfUser'] + record['rusage']['selfSystem']
    record['profiledThreadCpu'] = stats.total_tt
    record['coverage'] = stats.total_tt / own if own else None
    record['topFunctions'] = top_functions(stats, top)
    record['waitSites'] = wait_site_costs(stats)
    return record


def aggregate(module, records, output, top):
    unprofiled = [r['unprofiled'] for r in records if r.get('unprofiled', {}).get('rusage')]
    profiled = [r['profiled'] for r in records if r.get('profiled', {}).get('pstats')]
    summary = {'module': module, 'tests': len(records)}
    if unprofiled:
        summary['unprofiled'] = {
            'runs': len(unprofiled), 'wallSeconds': sum(r['wallSeconds'] for r in unprofiled),
            **{key: sum(r['rusage'][key] for r in unprofiled)
               for key in ('selfUser', 'selfSystem', 'childrenUser', 'childrenSystem')}}
    if profiled:
        own = sum(r['rusage']['selfUser'] + r['rusage']['selfSystem'] for r in profiled)
        stats = load_stats(output / r['pstats'] for r in profiled)
        sites = wait_site_costs(stats)
        for entry in sites.values():
            entry['shareOfSelfCpu'] = entry['upperBound'] / own if own else None
        summary['profiled'] = {
            'runs': len(profiled), 'selfCpu': own, 'profiledThreadCpu': stats.total_tt,
            'coverage': stats.total_tt / own if own else None,
            'unfinishedThreads': sum(r['threads']['unfinished'] for r in profiled),
            'waitSites': sites, 'topFunctions': top_functions(stats, top)}
    summary['outcomes'] = sorted({r[mode]['outcome'] for r in records
                                  for mode in ('unprofiled', 'profiled') if mode in r})
    return summary


def inside_repository(path):
    return path == REPOSITORY or REPOSITORY in path.parents


def output_directory(requested):
    """Create the output directory; refuse any location inside the checkout before writing."""
    if requested is None:
        base = Path(tempfile.gettempdir()).resolve()
        if inside_repository(base):
            raise SystemExit(f'refusing output inside the repository: {base}')
        return Path(tempfile.mkdtemp(prefix='host-driver-profile-', dir=str(base)))
    directory = Path(requested).expanduser().resolve()
    if inside_repository(directory):
        raise SystemExit(f'refusing output inside the repository: {directory}')
    if directory.exists() and (not directory.is_dir() or any(directory.iterdir())):
        raise SystemExit(f'output must be a new or empty directory: {directory}')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    return directory


def seconds(value):
    return '-' if value is None else f'{value:.2f}'


def print_summary(records, modules, output, top):
    print(f'output: {output}')
    for record in records:
        unprofiled, profiled = record.get('unprofiled'), record.get('profiled')
        parts = [record['testId']]
        if unprofiled:
            r = unprofiled.get('rusage')
            parts.append(f"{unprofiled['outcome']} wall {seconds(unprofiled.get('wallSeconds'))}s")
            if r:
                parts.append(f"self {seconds(r['selfUser'])}u/{seconds(r['selfSystem'])}s "
                             f"children {seconds(r['childrenUser'])}u/{seconds(r['childrenSystem'])}s")
        if profiled:
            parts.append(f"profiled {profiled['outcome']} coverage {seconds(profiled.get('coverage'))}")
        print('  ' + ' | '.join(parts))
    for module in modules:
        print(f"module {module['module']} ({module['tests']} tests, outcomes {', '.join(module['outcomes'])})")
        if 'unprofiled' in module:
            u = module['unprofiled']
            print(f"  wall {seconds(u['wallSeconds'])}s self {seconds(u['selfUser'])}u/{seconds(u['selfSystem'])}s "
                  f"children {seconds(u['childrenUser'])}u/{seconds(u['childrenSystem'])}s")
        if 'profiled' in module:
            p = module['profiled']
            print(f"  profiled self CPU {seconds(p['selfCpu'])}s thread CPU {seconds(p['profiledThreadCpu'])}s "
                  f"coverage {seconds(p['coverage'])} unfinished threads {p['unfinishedThreads']}")
            for site, entry in p['waitSites'].items():
                share = entry['shareOfSelfCpu']
                print(f"  {site}: upper bound {entry['upperBound']:.4f}s "
                      f"({'-' if share is None else f'{share:.2%}'} of self CPU), caller calls {entry['callerCalls']}")
            for row in p['topFunctions'][:min(top, 10)]:
                print(f"    {row['tottime']:.4f}s {row['calls']} calls {row['function']}")


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == [CHILD_FLAG]:
        return child_main(argv[1:])
    parser = argparse.ArgumentParser(description='Profile host-driver unittest modules per test id.')
    parser.add_argument('targets', nargs='*', default=list(DEFAULT_MODULES),
                        help='unittest modules, classes or test ids (default: the three slow modules)')
    parser.add_argument('--list', action='store_true', help='print the resolved test ids without running them')
    parser.add_argument('--mode', choices=('both', 'unprofiled', 'profiled'), default='both')
    parser.add_argument('--output', help='new or empty output directory outside the repository')
    parser.add_argument('--top', type=int, default=25, help='number of hot spots to report')
    parser.add_argument('--timeout', type=float, default=900, help='seconds per child run')
    args = parser.parse_args(argv)
    if args.top < 1 or args.timeout <= 0:
        parser.error('--top and --timeout must be positive')
    try:
        resolved = resolve_test_ids(args.targets)
    except ResolutionError as error:
        print(error, file=sys.stderr)
        return 2
    if args.list:
        for ids in resolved.values():
            print('\n'.join(ids))
        return 0
    modes = ('unprofiled', 'profiled') if args.mode == 'both' else (args.mode,)
    if 'profiled' in modes:
        try:
            require_per_thread_profiling()
        except ProfilerUnavailable as error:
            print(error, file=sys.stderr)
            return 2
    output = output_directory(args.output)
    records = []
    for test_id in dict.fromkeys(i for ids in resolved.values() for i in ids):
        record = {'testId': test_id}
        for mode in modes:
            record[mode] = run_child(mode, test_id, output, args.timeout)
        if record.get('profiled', {}).get('pstats'):
            profiled_summary(record['profiled'], load_stats([output / record['profiled']['pstats']]), args.top)
        (output / f'{file_stem(test_id)}.json').write_text(json.dumps(record, indent=2) + '\n')
        records.append(record)
    by_module = {}
    for record in records:
        by_module.setdefault(record['testId'].split('.', 1)[0], []).append(record)
    modules = [aggregate(module, items, output, args.top) for module, items in by_module.items()]
    for module in modules:
        (output / f"{module['module']}.aggregate.json").write_text(json.dumps(module, indent=2) + '\n')
    (output / 'summary.json').write_text(json.dumps({'schemaVersion': 1, 'python': sys.version.split()[0],
                                                     'modes': modes, 'tests': records, 'modules': modules},
                                                    indent=2) + '\n')
    print_summary(records, modules, output, args.top)
    ok = all(record[mode]['outcome'] in SUCCESSFUL for record in records for mode in modes)
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
