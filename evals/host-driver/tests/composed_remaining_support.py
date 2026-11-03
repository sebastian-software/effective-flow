"""Local command fixtures for the real remaining-stage wrapper/worker regression.

Only qualification, native output, and seal input are synthetic. Driver startup,
namespace authentication, D2 reservations, cleanup and the suite evaluators are real.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

from test_first_stage import (
    OriginalSealFixture, canonical_digest, digest, ref, write_json,
)


NATIVE = r'''#!PYTHON
import json, pathlib, sys, time
args = sys.argv[1:]
directory = pathlib.Path(args[args.index('--output-last-message') + 1]).parent
job = json.loads((directory / 'worker-job.json').read_text())
control = pathlib.Path(json.loads(pathlib.Path(job['configFile']).read_text())['fixtureControls'])
ordinal = job['remainingStage']['ordinal']
(control / ('ready-' + str(ordinal))).write_text('local fixture, no provider\n')
deadline = time.monotonic() + 35
while not (control / ('release-' + str(ordinal))).exists():
    if time.monotonic() >= deadline: raise RuntimeError('fixture release barrier timed out')
    time.sleep(.01)
if (control / 'unknown').exists() and ordinal == 1:
    # Actual reservation remains charged; an unbound start is deliberately unknown.
    (directory / 'process-start.json').write_text('{}\n')
(directory / 'last-message.txt').write_text('offline native fixture\n')
print(json.dumps({'type': 'turn.completed'}), flush=True)
'''

OPERATOR = r'''
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
const [configPath, operation, name, input] = process.argv.slice(2);
const config = JSON.parse(readFileSync(configPath));
const directory = dirname(input);
if (operation === 'qualify') {
  const job = JSON.parse(readFileSync(join(directory, 'worker-job.json')));
  if (job.remainingStage.ordinal > 6) {
    // The real scheduler must close every first-batch slot before admitting batch two.
    for (const task of config.fixtureFirstBatch) {
      const result = JSON.parse(readFileSync(join(task.artifactDir, 'operator-result.json')));
      if (result.state !== 'sealed') throw new Error('batch two before all six closures');
    }
    // Let all six authentic workers finish initial admission before any refusal
    // revokes the shared gate; otherwise fixture teardown could race their startup.
    writeFileSync(join(config.fixtureControls, `qualifier-ready-${job.remainingStage.ordinal}`), 'ready\n');
    const deadline = Date.now() + 30000;
    while (!Array.from({length: 6}, (_, i) => i + 7).every((ordinal) =>
      existsSync(join(config.fixtureControls, `qualifier-ready-${ordinal}`)))) {
      if (Date.now() >= deadline) throw new Error('second-batch qualification barrier timed out');
      await delay(10);
    }
    writeFileSync(join(config.fixtureControls, 'batch-two-reached'), 'all six sealed\n');
    process.exitCode = 9; // Bound the regression to six native fixture jobs.
  } else console.log(JSON.stringify({qualificationDigest: config.qualificationDigest,
    profile: config.profiles[name], expiresAt: '2099-01-01T00:00:00.000Z'}));
} else if (operation === 'seal') {
  const task = JSON.parse(readFileSync(input));
  const prepared = JSON.parse(readFileSync(join(config.outputRoot, `prepared-${name}.json`)));
  const request = join(directory, 'fixture-seal-request.json');
  const output = join(directory, 'fixture-seal-response.json');
  writeFileSync(request, JSON.stringify({operation: 'seal', output,
    suites: [{name, manifest: prepared.manifestPath, base: prepared.base, tasks: [task]}]}));
  process.argv = [process.execPath, config.fixtureBridge, config.frozenRoot, request];
  await import(pathToFileURL(config.fixtureBridge));
  const result = JSON.parse(readFileSync(output)).originalComputations[0];
  console.log(JSON.stringify({evaluation: {validityProblems: result.validityProblems,
    findings: result.findings}}));
} else throw new Error('fixture operator accepts only qualify/seal');
'''


def copy_fixture_executable(source, destination):
    """Pin private executable bytes, even when the installed runtime is shared/root-owned."""
    source = Path(source).resolve()
    if source != destination:
        shutil.copyfile(source, destination)
        shutil.copymode(source, destination)
    return destination


class ComposedRemainingFixture(OriginalSealFixture):
    def __init__(self, root):
        super().__init__(root)
        self.controls = root / 'control'
        self.controls.mkdir()
        self.node = copy_fixture_executable(shutil.which('node'), root / 'node-runtime')
        self.python = copy_fixture_executable(sys.executable, root / 'python-runtime')
        self.operator.write_text(OPERATOR)
        binary = root / 'local-native-fixture'
        binary.write_text(NATIVE.replace('#!PYTHON', '#!' + str(self.python)))
        binary.chmod(0o700)
        artifacts = self.config['toolchain']
        artifacts['binary'] = ref(binary)
        write_json(self.bundle, {'toolchain': artifacts})
        driver_root = root / 'driver-source'
        for item in self.corpus['driverFiles']:
            relative = Path(item['path']).relative_to(self.source)
            destination = driver_root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item['path'], destination)
        self.driver = driver_root / 'evals/host-driver'
        for repository in (self.source, driver_root):
            self.git(repository, 'init', '-q')
            self.git(repository, 'add', '.')
            self.git(repository, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid',
                     '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null',
                     'commit', '-qm', 'offline fixture')
        head = self.git(self.source, 'rev-parse', 'HEAD')
        tree = self.git(self.source, 'rev-parse', 'HEAD^{tree}')
        order = self.stage.remainder_tasks([r['task'] for r in self.records])
        self.config.update(node=str(self.node), python=str(self.python), driverRoot=str(driver_root),
            expectedFrozenHead=head, expectedFrozenTree=tree, qualificationDigest=digest(self.bundle),
            fixtureBridge=str(self.bridge), fixtureControls=str(self.controls),
            fixtureFirstBatch=[{'artifactDir': str(self.output / 'cohorts' / task['suite'] /
                task['scenario'] / ('slot-' + str(task['slot'])))} for task in order[:6]])
        write_json(self.config_path, self.config)
        self.corpus.update(source={'root': str(self.source), 'head': head, 'tree': tree},
            config=ref(self.config_path), operator=ref(self.operator),
            toolchain={'node': ref(self.node), 'python': ref(self.python), 'artifacts': artifacts},
            driverFiles=[ref(driver_root / Path(item['path']).relative_to(self.source))
                         for item in self.corpus['driverFiles']])
        self.corpus['qualification']['bundle'] = ref(self.bundle)
        static = canonical_digest({k: v for k, v in self.config.items() if k != 'qualificationDigest'})
        for suite in self.corpus['suites']:
            prepared_path = Path(suite['prepared']['path'])
            prepared = json.loads(prepared_path.read_text())
            prepared.update(sourceHead=head, sourceTree=tree, staticConfigDigest=static)
            write_json(prepared_path, prepared)
            suite['prepared'] = ref(prepared_path)
            manifest_path = Path(suite['roundManifest']['path'])
            manifest = json.loads(manifest_path.read_text())
            manifest['sourceRevision'] = head
            write_json(manifest_path, manifest)
            suite['roundManifest'] = ref(manifest_path)
        self.grant['config'] = self.corpus['config']
        self.publish_synthetic_pins()
        self.reload_stage()

    def git(self, root, *args):
        return subprocess.check_output(['git', *args], cwd=root, text=True).strip()

    def job(self, task, context):
        job, job_path, home, codehome = super().job(task, context)
        # Replace only this fresh synthetic profile with a genuinely completed local wrapper.
        shutil.rmtree(home.parent)
        marker = Path(job['artifactDir']) / 'fixture-original-profile.json'
        script = "require('fs').writeFileSync(process.argv[1], JSON.stringify({home:process.env.HOME}))"
        subprocess.run([str(self.node), str(self.source / 'evals/host-run.mjs'),
            '--profiles-root', str(self.profiles), '--', str(self.node), '-e', script, str(marker)],
            check=True, capture_output=True, text=True, timeout=15)
        home = Path(json.loads(marker.read_text())['home'])
        return job, job_path, home, home.parent / 'codex-home'

    def close_task(self, task, worker_result, *, compute=True):
        if compute:
            self.compute('seal', [task])
        artifact = Path(worker_result['job']['artifactDir'])
        profile = Path(json.loads((artifact / 'runner-profile.json').read_text())['profilePath'])
        cleanup = __import__('eval_driver_runtime').verify_cleanup(profile, self.profiles)
        assert cleanup['groupGone'] and cleanup['cleanupComplete']
        write_json(artifact / 'process-termination.json', cleanup)
        outcome = {**{key: task[key] for key in ('suite', 'scenario', 'slot')},
            'state': 'sealed', 'completed': True, 'consumptionState': 'reserved',
            'chargedRoots': 1, 'actualModelStarted': True, 'cleanupComplete': True, 'groupGone': True,
            'validityProblems': [], 'findings': [], 'nativeErrors': [], 'timedOut': False,
            'malformedStream': False, 'watchdogStopReason': None,
            'fixtureOnly': True, 'qualifiedHost': False}
        write_json(artifact / 'operator-result.json', outcome)
        return outcome

    def real_coordinator(self, context):
        # Both Git roots are real and distinct; retain actual source/pin checks.
        spec = importlib.util.spec_from_file_location('composed_remaining_driver', self.driver / 'run-cohorts.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        from unittest import mock
        with mock.patch.dict(sys.modules, {'eval_first_stage': self.stage}):
            driver = module.Driver(self.config_path, self.profiles, operator=self.operator,
                operator_sha256=digest(self.operator), binary=self.config['toolchain']['binary']['path'],
                auth_file=self.auth, node=str(self.node), timeout_seconds=40,
                fixture_tools=True, remaining_stage=context)
        return driver
