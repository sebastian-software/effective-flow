"""Observer delegation and allowlisted retention do not repair fixture outcomes."""
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest import mock

from composed_diagnostics import (ENVIRONMENT, MAX_FILE_BYTES, Observer, create_session,
                                  directory_fd, retain)


class ComposedDiagnosticsContracts(unittest.TestCase):
    def test_original_authentication_still_decides_refund_and_unknown(self):
        filename = Path(__file__).resolve().parents[1] / 'eval_driver_runtime.py'
        spec = importlib.util.spec_from_file_location('diagnostic_test_runtime', filename)
        runtime = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(runtime)
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            events = root / 'events'
            events.mkdir()
            task = {'suite': 'iterate', 'scenario': 'fixture', 'slot': 1}
            job = {'artifactDir': str(root), 'task': task, 'remainingStage': {'ordinal': 7}}
            job_path = root / 'worker-job.json'
            runtime.save(job_path, job)
            runtime.save(root / 'task.json', task)
            digest = runtime.sha(job_path)
            refusal_path = root / 'launch-refusal.json'
            refusal = {'kind': 'effective-flow-host-launch-refusal', 'jobSha256': digest,
                       'taskSha256': runtime.sha(root / 'task.json'), 'task': task,
                       'state': 'qualification-refused-before-launch'}
            module = SimpleNamespace(execute_wrapper=lambda *args, **kwargs: None,
                inspect_consumption=runtime.inspect_consumption, cancel_launches=lambda *args: None)
            with ExitStack() as stack:
                stack.enter_context(mock.patch.dict(sys.modules, {'eval_driver_runtime': runtime}))
                Observer(events).attach(module, stack)
                missing = module.inspect_consumption(job, job_path, digest, fixture_only=True)
                self.assertEqual(missing['consumptionState'], 'reservation-unknown')
                runtime.save(refusal_path, refusal)
                authentic = module.inspect_consumption(job, job_path, digest, fixture_only=True)
                self.assertEqual(authentic['consumptionState'], 'not-reserved')
                self.assertEqual(authentic['chargedRoots'], 0)
                refusal['jobSha256'] = 'sha256:' + '0' * 64
                refusal_path.unlink()
                runtime.save(refusal_path, refusal)
                tampered = module.inspect_consumption(job, job_path, digest, fixture_only=True)
                self.assertEqual(tampered['consumptionState'], 'reservation-unknown')
                self.assertEqual(tampered['chargedRoots'], 1)
            rows = [json.loads(row) for path in events.glob('events-*') for row in path.read_text().splitlines()]
            self.assertEqual([row['projection'] for row in rows if row['event'] == 'accounting-return'],
                             [missing, authentic, tampered])
            self.assertEqual(sum(row['event'] == 'bound-read-return' for row in rows), 2)
            self.assertEqual(sum(row['event'] == 'bound-read-raised' for row in rows), 1)

    def test_adapter_bootstraps_original_worker_once_and_observes_original_accounting(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            events = root / 'events'
            events.mkdir()
            marker = root / 'original-writer'
            worker = root / 'eval_host_worker.py'
            worker.write_text('''import os, sys
from pathlib import Path
def save_refusal(job, job_digest, state):
    with Path(job['marker']).open('a') as output: output.write('original\\n')
def cancel_launches(value): return value
def execute_job(job, **kwargs):
    save_refusal(job, 'original-digest', 'qualification-refused-before-launch')
    return 0
def main():
    return execute_job({'remainingStage': {'ordinal': 7}, 'marker': sys.argv[1]})
''')
            original_execute = mock.Mock(side_effect=lambda command, directory, **kwargs:
                subprocess.run(command, check=False, capture_output=True,
                               timeout=kwargs['timeout_seconds']).returncode)
            projection = {'consumptionState': 'reservation-unknown', 'chargedRoots': 1,
                          'actualModelStarted': None}
            original_inspect = mock.Mock(return_value=projection)
            original_read = mock.Mock(return_value=({'state': 'original'}, 'digest'))
            original_cancel = mock.Mock(return_value=42)
            original_kill = mock.Mock(return_value=None)
            module = SimpleNamespace(HERE=root, execute_wrapper=original_execute,
                inspect_consumption=original_inspect, cancel_launches=original_cancel)
            runtime = SimpleNamespace(read_bound_json=original_read)
            with ExitStack() as stack:
                stack.enter_context(mock.patch.dict(sys.modules, {'eval_driver_runtime': runtime}))
                stack.enter_context(mock.patch.object(os, 'kill', original_kill))
                Observer(events).attach(module, stack)
                code = module.execute_wrapper([sys.executable, str(worker), str(marker)], root,
                                              timeout_seconds=10)
                self.assertEqual(code, 0)
                self.assertEqual(marker.read_text(), 'original\n')
                original_execute.assert_called_once()
                job = {'remainingStage': {'ordinal': 7}}
                self.assertIs(module.inspect_consumption(job, 'job', 'digest', fixture_only=True), projection)
                original_inspect.assert_called_once_with(job, 'job', 'digest', fixture_only=True)
                self.assertEqual(runtime.read_bound_json(root / 'launch-refusal.json'),
                                 ({'state': 'original'}, 'digest'))
                original_read.assert_called_once_with(root / 'launch-refusal.json')
                self.assertEqual(module.cancel_launches('pipe'), 42)
                original_cancel.assert_called_once_with('pipe')
                os.kill(1234, 15)
                original_kill.assert_called_once_with(1234, 15)
            rows = [json.loads(row) for path in events.glob('events-*') for row in path.read_text().splitlines()]
            self.assertEqual(sum(row['event'] == 'refusal-writer-entry' for row in rows), 1)
            self.assertEqual(sum(row['event'] == 'refusal-writer-return' for row in rows), 1)
            self.assertEqual(next(row['projection'] for row in rows if row['event'] == 'accounting-return'), projection)
            self.assertTrue(all(type(row['pid']) is int and type(row['monotonic_ns']) is int for row in rows))
            self.assertEqual(next(row['target_pid'] for row in rows
                                  if row['event'] == 'coordinator-signal-entry'), 1234)

    def test_disabled_observer_never_installs_or_writes(self):
        with mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch('composed_diagnostics.directory_fd', side_effect=AssertionError):
            self.assertIsNone(create_session(Path('/fixture'), 'clean'))
            observer = Observer(None)
            observer.attach(None, None)
            observer.emit('not-written')
            retain(None, Path('/fixture'))

    def test_delegates_once_preserves_result_and_exception(self):
        with tempfile.TemporaryDirectory() as name:
            observer = Observer(Path(name).resolve())
            result = object()
            original = mock.Mock(return_value=result)
            self.assertIs(observer.wrap(original, 'refusal-writer')(1, state='test'), result)
            original.assert_called_once_with(1, state='test')
            error = ValueError('original failure')
            original = mock.Mock(side_effect=error)
            with self.assertRaises(ValueError) as raised:
                observer.wrap(original, 'refusal-writer')()
            self.assertIs(raised.exception, error)
            original.assert_called_once_with()
            events = [json.loads(row)['event'] for row in next(Path(name).glob('events-*')).read_text().splitlines()]
            self.assertEqual(events, ['refusal-writer-entry', 'refusal-writer-return',
                                      'refusal-writer-entry', 'refusal-writer-raised'])
            original = mock.Mock(return_value=result)
            broken_description = mock.Mock(side_effect=KeyError('diagnostic field'))
            self.assertIs(observer.wrap(original, 'refusal-writer', broken_description)(), result)
            original.assert_called_once_with()

    def test_session_rejects_namespace_overlap_traversal_and_symlink(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            fixture = root / 'fixture'
            fixture.mkdir()
            link = root / 'link'
            link.symlink_to(fixture, target_is_directory=True)
            for target in (fixture / 'diagnostics', root / 'link' / 'diagnostics', root / '../bad'):
                with mock.patch.dict(os.environ, {ENVIRONMENT: str(target)}):
                    with self.assertRaises((ValueError, OSError)):
                        create_session(fixture, 'clean')
            with mock.patch.dict(os.environ, {ENVIRONMENT: str(root / 'diagnostics')}):
                session = create_session(fixture, 'clean')
                self.assertEqual(session.parent, root / 'diagnostics')

    def test_retains_raw_allowlist_before_cleanup_with_explicit_missing_and_unsafe_status(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name).resolve()
            fixture, output = root / 'fixture', root / 'diagnostics'
            output.mkdir()
            slot = fixture / 'output/cohorts/iterate/scenario/slot-1'
            slot.mkdir(parents=True)
            receipt = b'{"original": "refusal bytes"}\n'
            (slot / 'launch-refusal.json').write_bytes(receipt)
            secret = root / 'credentials'
            secret.write_text('never retain')
            (slot / 'worker-job.json').symlink_to(secret)
            (slot / 'process-start.json').write_bytes(b'x' * (MAX_FILE_BYTES + 1))
            (slot / 'HOME').mkdir()
            (slot / 'HOME/auth.json').write_text('never retain')
            (slot / 'launch-consumption.json').write_text('hardlinked, unsafe')
            os.link(slot / 'launch-consumption.json', root / 'alias')
            retain(output, fixture)
            manifest = json.loads((output / 'capture.json').read_text())
            rows = {Path(row['path']).name: row for row in manifest['files'] if 'slot-1/' in row.get('path', '')}
            self.assertEqual((output / rows['launch-refusal.json']['raw']).read_bytes(), receipt)
            self.assertEqual(rows['worker-result.json']['status'], 'absent-at-capture')
            self.assertEqual(rows['process-start.json']['status'], 'size-limit')
            self.assertEqual(rows['launch-consumption.json']['status'], 'unsafe-file')
            self.assertTrue(rows['worker-job.json']['status'].startswith('unreadable-'))
            self.assertNotIn('never retain', ''.join(path.read_text() for path in output.iterdir()))
            link = root / 'source-link'
            link.symlink_to(slot, target_is_directory=True)
            with self.assertRaises(OSError):
                directory_fd(link)


if __name__ == '__main__':
    unittest.main(verbosity=2)
