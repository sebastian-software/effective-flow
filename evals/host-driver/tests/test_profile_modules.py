"""Smoke test: the manual profiling script still resolves the slow modules' test ids.

It only resolves ids (``--list`` resolution) and never runs a profiled test, so it
catches drift in the private fixture APIs the script depends on.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'diagnostics' / 'profile_modules.py'


def load_script():
    spec = importlib.util.spec_from_file_location('host_driver_profile_modules', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ProfileModulesResolution(unittest.TestCase):
    def test_list_resolution_returns_each_default_module_test_ids(self):
        script = load_script()
        # Resolution stays inside this method: binding a profiled TestCase class as a
        # module-level name here would make unittest discovery run it a second time.
        resolved = script.resolve_test_ids(script.DEFAULT_MODULES)
        self.assertEqual(tuple(resolved), ('test_first_stage', 'test_remaining_stage_worker',
                                           'test_remaining_stage_admission'))
        for module, ids in resolved.items():
            with self.subTest(module=module):
                self.assertTrue(ids)
                self.assertTrue(all(identity.startswith(module + '.') for identity in ids), ids)
                self.assertEqual(len(ids), len(set(ids)))

    def test_list_resolution_fails_for_unresolvable_targets(self):
        script = load_script()
        for target in ('test_profile_modules_missing_module',
                       'test_first_stage.MissingProfiledClass',
                       'test_first_stage.FirstStageAuthentication.test_profile_modules_missing'):
            with self.subTest(target=target):
                with self.assertRaises(script.ResolutionError):
                    script.resolve_test_ids((target,))


if __name__ == '__main__':
    unittest.main(verbosity=2)
