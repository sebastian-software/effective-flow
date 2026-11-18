"""Pin canonicalization contracts: one canonical() per pin, no duplicated pins inside one call.

Only helpers are imported from test_first_stage and remaining_stage_support, never a TestCase
class, so discovery does not run their cases a second time from this module.
"""
from __future__ import annotations

from collections import Counter
from contextlib import ExitStack
import ast
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock

from test_first_stage import HERE, StageFixture, TEST_TEMP_ROOT, inert_boundaries, ref, write_json
from remaining_stage_support import RemainingStageFixtureMixin

CANONICAL_MESSAGE = 'expected canonical absolute path: '
PRIVATE_BODY = '_file_digest'


def load_stage():
    spec = importlib.util.spec_from_file_location('pin_canonicalization_stage', HERE / 'eval_first_stage.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reference_canonical(value):
    """The former Path-based canonical(), kept only as the oracle of the equivalence table."""
    if not isinstance(value, str):
        raise ValueError('path must be a string')
    path = Path(value)
    if not (path.is_absolute() and str(path) == value and path.resolve() == path):
        raise ValueError(CANONICAL_MESSAGE + value)
    return path


def verdict(check, value):
    try:
        check(value)
    except ValueError as error:
        return 'reject', str(error)
    return 'accept', None


def parsed_paths(pinned):
    return Counter(call.args[0]['path'] for call in pinned.call_args_list if call.kwargs.get('json_value'))


class TemporaryRoot(unittest.TestCase):
    def setUp(self):
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        temp = tempfile.TemporaryDirectory(prefix='pin-canonicalization-', dir=str(TEST_TEMP_ROOT))
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.stage = load_stage()


class CanonicalEquivalence(TemporaryRoot):
    def test_canonical_matches_the_former_path_check_except_for_loops(self):
        base = self.base
        regular = base / 'file'
        regular.write_text('canonical\n')
        real = base / 'real'
        (real / 'inner').mkdir(parents=True)
        (base / 'link-leaf').symlink_to(regular)
        (base / 'link-dir').symlink_to(real)
        (base / 'dangling').symlink_to(base / 'nowhere')
        cases = [
            ('non-string', 42, 'reject'),
            ('relative', 'relative/path', 'reject'),
            ('root', '/', 'accept'),
            ('double root', '//', 'reject'),
            ('double-root child', '//x', 'reject'),
            ('triple-root child', '///x', 'reject'),
            ('inner double slash', str(base) + '//file', 'reject'),
            ('trailing slash', str(base) + '/', 'reject'),
            ('dot component', str(base) + '/./file', 'reject'),
            ('dot-dot component', str(base) + '/real/../file', 'reject'),
            ('symlinked leaf', str(base / 'link-leaf'), 'reject'),
            ('symlinked ancestor', str(base / 'link-dir/inner'), 'reject'),
            ('nonexistent tail', str(base / 'missing/deeper'), 'accept'),
            ('nonexistent tail below a regular file', str(regular / 'child'), 'accept'),
            ('dangling symlink leaf', str(base / 'dangling'), 'reject'),
            ('dangling symlink ancestor', str(base / 'dangling/child'), 'reject'),
            ('over-long component', str(base / ('x' * 300)), 'accept'),
            ('plain canonical', str(regular), 'accept'),
        ]
        if os.geteuid() != 0:
            locked = base / 'locked'
            (locked / 'inside').mkdir(parents=True)
            locked.chmod(0)
            self.addCleanup(locked.chmod, 0o700)
            cases.append(('unsearchable ancestor', str(locked / 'inside'), 'accept'))
        for label, value, expected in cases:
            with self.subTest(case=label):
                old = verdict(reference_canonical, value)
                self.assertEqual(verdict(self.stage.canonical, value), old)
                self.assertEqual(old[0], expected)

    def test_nul_byte_keeps_the_realpath_value_error(self):
        value = str(self.base) + '/nul\x00byte'
        with self.assertRaises(ValueError) as old:
            reference_canonical(value)
        with self.assertRaises(ValueError) as new:
            self.stage.canonical(value)
        self.assertEqual(str(new.exception), str(old.exception))
        self.assertNotIn(CANONICAL_MESSAGE, str(new.exception))

    def test_self_looping_symlink_is_rejected_on_every_python_version(self):
        loop = self.base / 'loop'
        loop.symlink_to('loop')
        for label, value in (('leaf', str(loop)), ('ancestor', str(loop / 'child'))):
            with self.subTest(case=label):
                with self.assertRaises(ValueError) as caught:
                    self.stage.canonical(value)
                self.assertEqual(str(caught.exception), CANONICAL_MESSAGE + value)


class PinReaders(TemporaryRoot):
    def test_symlinked_ancestor_is_rejected_by_every_reader_entry(self):
        real = self.base / 'real'
        pin = write_json(real / 'value.json', {'pinned': True})
        (self.base / 'alias').symlink_to(real)
        aliased = str(self.base / 'alias/value.json')
        alias_pin = {'path': aliased, 'sha256': pin['sha256']}
        refusals = (
            ('file_digest', lambda: self.stage.file_digest(aliased), CANONICAL_MESSAGE + aliased),
            ('read_bound_json', lambda: self.stage.read_bound_json(aliased),
             'noncanonical accounting metadata path'),
            ('pinned digest', lambda: self.stage.pinned(alias_pin), CANONICAL_MESSAGE + aliased),
            ('pinned json', lambda: self.stage.pinned(alias_pin, json_value=True), CANONICAL_MESSAGE + aliased),
        )
        for label, call, message in refusals:
            with self.subTest(entry=label):
                with self.assertRaises(ValueError) as caught:
                    call()
                self.assertEqual(str(caught.exception), message)
        self.assertEqual(self.stage.file_digest(pin['path']), pin['sha256'])
        self.assertEqual(self.stage.read_bound_json(pin['path']), ({'pinned': True}, pin['sha256']))
        self.assertEqual(self.stage.pinned(pin), pin)
        self.assertEqual(self.stage.pinned(pin, json_value=True), {'pinned': True})

    def test_each_pin_canonicalizes_exactly_once(self):
        pin = write_json(self.base / 'value.json', {'pinned': True})
        with mock.patch.object(os.path, 'realpath', wraps=os.path.realpath) as realpath:
            Path(TEST_TEMP_ROOT).resolve()
            resolve_calls = realpath.call_count
            realpath.reset_mock()
            self.stage.canonical(pin['path'])
            canonical_calls = realpath.call_count
            if (resolve_calls, canonical_calls) != (1, 1):
                self.fail('realpath calibration failed: Path.resolve() made %d and canonical() made %d '
                          'os.path.realpath calls instead of 1 each; this count needs Python 3.11 or newer'
                          % (resolve_calls, canonical_calls))
            for json_value in (False, True):
                with self.subTest(json_value=json_value):
                    realpath.reset_mock()
                    self.stage.pinned(pin, json_value=json_value)
                    self.assertEqual(realpath.call_count, 1)


class AuthenticatePins(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guards = ExitStack()
        inert_boundaries(cls.guards)

    @classmethod
    def tearDownClass(cls):
        cls.guards.close()

    def setUp(self):
        old_path = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), old_path))
        temp = tempfile.TemporaryDirectory(prefix='pin-canonicalization-stage-', dir=str(TEST_TEMP_ROOT))
        self.addCleanup(temp.cleanup)
        self.f = StageFixture(Path(temp.name))

    def test_each_task_record_is_parsed_once_per_authenticate(self):
        with mock.patch.object(self.f.stage, 'pinned', wraps=self.f.stage.pinned) as pinned:
            self.f.validate()
        parsed = parsed_paths(pinned)
        self.assertEqual(len(self.f.records), 155)
        for record in self.f.records:
            for key in ('state', 'runMetadata', 'buildIdentity'):
                with self.subTest(path=record[key]['path']):
                    self.assertEqual(parsed[record[key]['path']], 1)

    def test_symlinked_identity_input_is_refused_by_the_coverage_check(self):
        scenarios = self.f.source / 'evals/iterate/scenarios'
        real = scenarios.with_name('scenarios-real')
        self.assertTrue(all(path.suffix == '.md' for path in scenarios.iterdir()))
        scenarios.rename(real)
        scenarios.symlink_to(real)
        suite, = [suite for suite in self.f.corpus['suites'] if suite['name'] == 'iterate']
        prefix = str(scenarios) + os.sep
        moved = [item for item in suite['immutableInputs'] if item['path'].startswith(prefix)]
        self.assertTrue(moved)
        for item in moved:
            item['path'] = str(real / item['path'][len(prefix):])
        self.f.publish_synthetic_pins()
        with self.assertRaises(ValueError) as caught:
            self.f.validate()
        self.assertEqual(str(caught.exception), 'immutable identity coverage incomplete')


class RemainingContextPins(RemainingStageFixtureMixin, unittest.TestCase):
    def original_job_paths(self):
        inventory = json.loads(self.f.closures_path.read_text())
        return [Path(row['job']['path']) for row in inventory['closures']]

    def test_corpus_and_original_jobs_are_parsed_once_per_remaining_call(self):
        with mock.patch.object(self.f.stage, 'pinned', wraps=self.f.stage.pinned) as pinned:
            self.f.stage.remaining_context_data(self.context, initial=True)
        parsed = parsed_paths(pinned)
        self.assertEqual(parsed[self.context['corpus']['path']], 1)
        jobs = self.original_job_paths()
        self.assertEqual(len(jobs), 5)
        for path in jobs:
            with self.subTest(job=str(path)):
                self.assertEqual(parsed[str(path)], 1)

    def test_corpus_or_original_job_changed_between_calls_is_refused(self):
        self.f.stage.remaining_context_data(self.context, initial=True)
        for path in (self.f.corpus_path, self.original_job_paths()[0]):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.write_bytes(original + b'\n')
                try:
                    with self.assertRaises(ValueError) as caught:
                        self.f.stage.remaining_context_data(self.context, initial=True)
                    self.assertEqual(str(caught.exception), 'accounting metadata digest changed')
                finally:
                    path.write_bytes(original)
        self.f.stage.remaining_context_data(self.context, initial=True)

    def test_replaced_remaining_corpus_reference_is_refused(self):
        copy = self.f.root / 'corpus-copy.json'
        shutil.copyfile(self.f.corpus_path, copy)
        other = ref(copy)
        self.assertNotEqual(other, self.context['corpus'])
        authenticate = self.f.stage.authenticate

        def replacing(*args, _remaining=None, **kwargs):
            return authenticate(*args, _remaining={**_remaining, 'corpusRef': other}, **kwargs)

        with mock.patch.object(self.f.stage, 'authenticate', replacing), \
                self.assertRaises(ValueError) as caught:
            self.f.stage.remaining_context_data(self.context, initial=True)
        self.assertEqual(str(caught.exception), 'remaining corpus reference changed')


def calls_named(tree, name):
    """Every call of name per top-level owner: (owner, call), owner '<module>' outside functions."""
    found = []
    for statement in tree.body:
        owner = statement.name if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)) else '<module>'
        for node in ast.walk(statement):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == name:
                found.append((owner, node))
    return found


def uses(tree, name):
    """Every use of name per top-level owner: (owner, kind), owner '<module>' outside functions."""
    found = []
    for statement in tree.body:
        owner = statement.name if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef)) else '<module>'
        for node in ast.walk(statement):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
                found.append((owner, 'def'))
            elif isinstance(node, ast.Name) and node.id == name:
                found.append((owner, 'name'))
            elif isinstance(node, ast.Attribute) and node.attr == name:
                found.append((owner, 'attribute'))
            elif isinstance(node, ast.alias) and name in (node.name, node.asname):
                found.append((owner, 'import'))
            elif isinstance(node, ast.Constant) and node.value == name:
                found.append((owner, 'string'))
    return sorted(found)


class PrivateReaderBoundary(unittest.TestCase):
    def setUp(self):
        self.tree = ast.parse((HERE / 'eval_first_stage.py').read_text())
        self.pinned, = [node for node in self.tree.body
                        if isinstance(node, ast.FunctionDef) and node.name == 'pinned']
        bound, = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Assign)
                  and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
                  and node.value.func.id == 'canonical']
        self.assertEqual(ast.unparse(bound.value), "canonical(ref['path'])")
        target, = bound.targets
        self.assertIsInstance(target, ast.Name)
        self.assertNotIn(target.id, [argument.arg for argument in ast.walk(self.pinned.args)
                                     if isinstance(argument, ast.arg)])
        stores = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Name)
                  and node.id == target.id and not isinstance(node.ctx, ast.Load)]
        self.assertEqual(stores, [target])
        self.bound, self.canonical_name = bound, target.id

    def test_private_file_digest_body_is_reached_only_from_its_entry_and_pinned(self):
        self.assertEqual(uses(self.tree, PRIVATE_BODY),
                         [(PRIVATE_BODY, 'def'), ('file_digest', 'name'), ('pinned', 'name')])
        for filename in ('eval_driver_runtime.py', 'run-cohorts.py', 'eval_host_worker.py'):
            with self.subTest(file=filename):
                self.assertEqual(uses(ast.parse((HERE / filename).read_text()), PRIVATE_BODY), [])
        calls = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Name) and node.func.id == PRIVATE_BODY]
        self.assertEqual(len(calls), 1)
        call, = calls
        self.assertEqual([ast.unparse(argument) for argument in call.args], [self.canonical_name])
        self.assertEqual(call.keywords, [])
        self.assertGreater(call.lineno, self.bound.lineno)

    def test_only_pinned_reads_json_relative_to_the_canonical_parent(self):
        relative = [(owner, node) for owner, node in calls_named(self.tree, 'read_bound_json')
                    if any(keyword.arg == 'directory_fd' for keyword in node.keywords)]
        self.assertEqual([owner for owner, _ in relative], ['pinned'])
        (_, call), = relative
        self.assertGreater(call.lineno, self.bound.lineno)
        self.assertEqual(ast.unparse(call.args[0]), self.canonical_name + '.name')
        descriptor, = [keyword.value for keyword in call.keywords if keyword.arg == 'directory_fd']
        self.assertIsInstance(descriptor, ast.Name)
        opened, = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Assign)
                   and [ast.unparse(target) for target in node.targets] == [descriptor.id]]
        self.assertEqual(ast.unparse(opened.value),
                         f'os.open({self.canonical_name}.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)')
        self.assertGreater(opened.lineno, self.bound.lineno)
        closes = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Try)
                  and any(ast.unparse(statement) == f'os.close({descriptor.id})' for statement in node.finalbody)]
        self.assertEqual(len(closes), 1)
        stores = [node for node in ast.walk(self.pinned) if isinstance(node, ast.Name)
                  and node.id == descriptor.id and not isinstance(node.ctx, ast.Load)]
        self.assertEqual(len(stores), 1)


if __name__ == '__main__':
    unittest.main()
