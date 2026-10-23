"""Hermetic driver contract tests for qualification, pinning, and evidence."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor, wait
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[3]
DRIVER_PATH = ROOT / "evals/host-driver/run-cohorts.py"
NODE = shutil.which("node")

OPERATOR = r"""
import fs from 'node:fs';
import path from 'node:path';
const [configPath, command, suite, launchPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (command === 'qualify') {
  if (process.env.FIXTURE_OPERATOR === 'refuse' || suite === 'blocked') process.exit(9);
  if (suite === 'slow') await new Promise((resolve) => setTimeout(resolve, 250));
  const launch = JSON.parse(fs.readFileSync(launchPath, 'utf8'));
  process.stdout.write(JSON.stringify({qualificationDigest: config.qualificationDigest, profile: launch.profile}) + '\n');
} else if (command === 'seal') {
  const taskPath = launchPath;
  const artifactRoot = path.dirname(taskPath);
  const termination = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'process-termination.json'), 'utf8'));
  const {profilePath} = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'runner-profile.json'), 'utf8'));
  const profile = JSON.parse(fs.readFileSync(path.join(profilePath, 'host-profile.json'), 'utf8'));
  const cleanup = JSON.parse(fs.readFileSync(path.join(profilePath, 'host-profile-cleanup.json'), 'utf8'));
  const cachePaths = ['home/.codex/cache', 'home/.codex/plugins/cache', 'codex-home/cache', 'codex-home/plugins/cache'];
  const cachesAbsent = cachePaths.every((relative) => {
    try {
      fs.lstatSync(path.join(profilePath, relative));
      return false;
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
  });
  if (!termination.cleanupComplete || !termination.groupGone || cleanup.schema !== 1
      || cleanup.profileId !== profile.id || !Array.isArray(cleanup.caches) || cleanup.caches.length !== 4
      || !cachePaths.every((relative) => cleanup.caches.some((entry) => entry.path === relative && entry.status === 'removed'))
      || !cachesAbsent) process.exit(12);
  fs.writeFileSync(config.sealMarker, 'sealed\n');
  process.stdout.write(JSON.stringify({evaluation: {validityProblems: [], findings: []}}) + '\n');
} else process.exit(2);
"""

BINARY = r"""#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const output = args[args.indexOf('--output-last-message') + 1];
fs.writeFileSync(output, 'done\n');
fs.writeFileSync(process.env.FIXTURE_START, String(process.pid));
const mode = process.env.FIXTURE_MODE;
if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (mode === 'sleep') {
  setTimeout(() => {}, 20000);
} else if (mode === 'malformed') process.stdout.write('not-json\n');
else process.stdout.write(JSON.stringify({type: mode === 'missing-turn' ? 'turn.started' : 'turn.completed'}) + '\n');
if (mode === 'nonzero') process.exitCode = 7;
"""


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


class HostDriverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.assertIsNotNone(NODE, "node is required for fixture execution")
        self.temp = tempfile.TemporaryDirectory(
            prefix="effective-flow-host-driver-",
            dir=str(Path(tempfile.gettempdir()).resolve()),
        )
        self.work = Path(self.temp.name)
        self.source = self.work / "source"
        self.source.mkdir()
        self.project = self.work / "project"
        self.project.mkdir()
        subprocess.run(["git", "init", "-q"], cwd=self.source, check=True)
        (self.source / "README").write_text("fixture\n")
        subprocess.run(["git", "add", "README"], cwd=self.source, check=True)
        subprocess.run(
            ["git", "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"],
            cwd=self.source,
            check=True,
        )
        self.head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=self.source, text=True
        ).strip()
        self.operator = self.work / "operator.mjs"
        self.operator.write_text(OPERATOR)
        self.binary = self.work / "binary.mjs"
        self.binary.write_text(BINARY)
        self.binary.chmod(0o700)
        self.auth = self.work / "auth.json"
        self.auth.write_text("{}\n")
        self.start_marker = self.work / "model-started"
        os.environ["FIXTURE_START"] = str(self.start_marker)
        self.profiles = self.work / "profiles"
        self.output = self.work / "output"
        self.output.mkdir()
        self.config = self.work / "config.json"
        self.config.write_text(json.dumps({
            "frozenRoot": str(self.source),
            "expectedFrozenHead": self.head,
            "outputRoot": str(self.output),
            "qualificationDigest": "fixture-qualification",
            "profiles": {
                "merge-gate": {"model": "fixture", "reasoningEffort": "none"},
                "iterate": {},
                "next-steps": {},
            },
            "sealMarker": str(self.work / "seal.marker"),
        }))

    def tearDown(self) -> None:
        os.environ.pop("FIXTURE_START", None)
        self.temp.cleanup()

    def driver(self, timeout: int = 3):
        sys.path.insert(0, str(DRIVER_PATH.parent))
        spec = importlib.util.spec_from_file_location("host_driver_fixture", DRIVER_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.Driver(
            self.config,
            self.profiles,
            operator=self.operator,
            operator_sha256=digest(self.operator),
            binary=self.binary,
            auth_file=self.auth,
            node=NODE,
            timeout_seconds=timeout,
            fixture_tools=True,
        )

    def round_driver(self, name: str):
        config = json.loads(self.config.read_text())
        config["outputRoot"] = str(self.work / f"output-{name}")
        config["sealMarker"] = str(self.work / f"seal-{name}.marker")
        config_path = self.work / f"config-{name}.json"
        config_path.write_text(json.dumps(config))
        self.config = config_path
        self.output = Path(config["outputRoot"])
        self.output.mkdir()
        return self.driver()

    def task(self, name: str = "normal", slot: int = 1, suite: str = "merge-gate") -> dict:
        attempt = self.work / f"attempt-{name}"
        attempt.mkdir()
        prompt = self.work / f"{name}.prompt.txt"
        prompt.write_text("fixture\n")
        metadata = self.work / f"{name}.metadata.json"
        metadata.write_text(json.dumps({"promptDigest": digest(prompt)}))
        return {
            "suite": suite,
            "scenario": "fixture",
            "slot": slot,
            "profile": {"model": "fixture", "reasoningEffort": "none"},
            "projectRoot": str(self.project),
            "attemptRoot": str(attempt),
            "prompt": str(prompt),
            "runMetadata": str(metadata),
            "operatorSha256": digest(self.operator),
        }

    def test_success_failure_and_evidence(self) -> None:
        driver = self.driver()
        result = driver.run_slot(self.task())
        self.assertEqual(result["state"], "sealed")
        self.assertTrue(result["actualModelStarted"])
        self.assertTrue((self.work / "seal.marker").exists())
        artifact = self.output / "cohorts/merge-gate/fixture/slot-1"
        self.assertTrue((artifact / "host-receipt.json").is_file())
        self.assertTrue((artifact / "process-termination.json").is_file())
        for mode in ("nonzero", "malformed", "missing-turn", "ignore-term"):
            with self.subTest(mode=mode):
                os.environ["FIXTURE_MODE"] = mode
                try:
                    outcome = self.round_driver(mode).run_slot(self.task(mode, slot=2))
                finally:
                    os.environ.pop("FIXTURE_MODE", None)
                self.assertEqual(outcome["state"], "host-not-completed")
                self.assertTrue(outcome["actualModelStarted"])
                self.assertFalse(outcome["completed"])
                if mode == "nonzero":
                    self.assertEqual(outcome["exitCode"], 7)
                elif mode == "malformed":
                    self.assertTrue(outcome["malformedStream"])
                elif mode == "missing-turn":
                    self.assertEqual(outcome["exitCode"], 0)
                    rows = [json.loads(line) for line in (Path(outcome["raw"]) / "stdout.jsonl").read_text().splitlines()]
                    self.assertFalse(any(row.get("type") == "turn.completed" for row in rows))
                elif mode == "ignore-term":
                    self.assertTrue(outcome["timedOut"])
                    self.assertEqual(outcome["watchdogStopReason"], "timeout")

    def test_refusal_pin_and_parallel_block(self) -> None:
        driver = self.driver()
        os.environ["FIXTURE_OPERATOR"] = "refuse"
        try:
            outcome = driver.run_slot(self.task("blocked"))
        finally:
            os.environ.pop("FIXTURE_OPERATOR", None)
        self.assertFalse(outcome["actualModelStarted"])
        self.assertFalse((self.work / "seal.marker").exists())
        self.assertTrue((self.output / "cohorts/launch-blocked").is_file())
        self.operator.write_text(OPERATOR + "\n// changed\n")
        with self.assertRaisesRegex(ValueError, "pinned input changed"):
            driver.check_pins()

    def test_parallel_profiles_are_distinct(self) -> None:
        driver = self.driver()
        tasks = [self.task(f"slot-{index}", slot=index) for index in range(1, 4)]
        with ThreadPoolExecutor(max_workers=3) as pool:
            outcomes = list(pool.map(driver.run_slot, tasks))
        self.assertEqual({item["state"] for item in outcomes}, {"sealed"})
        self.assertEqual(len(list(self.profiles.glob("profile-*"))), 3)

    def test_parallel_qualification_blocker_prevents_later_launch(self) -> None:
        driver = self.driver()
        tasks = [self.task(f"blocked-{slot}", slot=slot) for slot in (1, 2)]
        os.environ["FIXTURE_OPERATOR"] = "refuse"
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                outcomes = list(pool.map(driver.run_slot, tasks))
        finally:
            os.environ.pop("FIXTURE_OPERATOR", None)
        self.assertTrue((self.output / "cohorts/launch-blocked").exists())
        self.assertTrue(any(item["state"] == "qualification-refused-before-launch" for item in outcomes))
        self.assertTrue(any(not item["actualModelStarted"] for item in outcomes))

    def test_worker_exception_blocks_before_cleanup(self) -> None:
        driver = self.driver()
        spec = importlib.util.spec_from_file_location("worker_fixture", DRIVER_PATH.with_name("eval_host_worker.py"))
        worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(worker)
        home = self.work / "profile/home"
        codehome = self.work / "profile/codex-home"
        home.mkdir(parents=True)
        codehome.mkdir()
        task = self.task("worker-exceptions")
        good = {"qualificationDigest": "fixture-qualification", "profile": task["profile"]}
        cases = (
            ("initial-pin", ValueError, json.dumps(good), [ValueError("pin changed")]),
            ("timeout", subprocess.TimeoutExpired, subprocess.TimeoutExpired("qualify", 120), [None]),
            ("malformed", json.JSONDecodeError, "not-json", [None]),
            ("missing-profile", KeyError, json.dumps({"qualificationDigest": "fixture-qualification"}), [None]),
            ("digest", ValueError, json.dumps({**good, "qualificationDigest": "changed"}), [None]),
            ("profile", ValueError, json.dumps({**good, "profile": {}}), [None]),
            ("final-pin", ValueError, json.dumps(good), [None, ValueError("pin changed")]),
        )
        for name, error, response, pins in cases:
            with self.subTest(case=name):
                directory = self.work / f"worker-{name}"
                directory.mkdir()
                job = {"artifactDir": str(directory), "profilesRoot": str(self.profiles),
                       "task": task, "node": NODE, "operator": str(self.operator),
                       "configFile": str(self.config), "source": str(self.source),
                       "qualificationDigest": "fixture-qualification", "timeoutSeconds": 125,
                       "coordinatorPid": os.getpid(),
                       "blockerPath": str(driver.blocker), "launchGatePath": str(driver.gate)}
                def cleanup(*_args):
                    # The wrapper can remain in cleanup while another slot qualifies.
                    self.assertTrue(driver.blocker.exists(), "worker cleanup started with launch gate open")
                response_args = ({"side_effect": response} if isinstance(response, Exception)
                                 else {"return_value": subprocess.CompletedProcess([], 0, response, "")})
                with mock.patch.dict(os.environ, {"HOME": str(home), "CODEX_HOME": str(codehome)}), \
                        mock.patch.object(worker, "registered_profile", return_value={"childPgid": 42, "ownerPid": 42}), \
                        mock.patch.object(worker, "assert_pins", side_effect=pins), \
                        mock.patch.object(worker, "launch_record", return_value={"stdinPath": task["prompt"]}), \
                        mock.patch.object(worker.os, "fork", return_value=42), \
                        mock.patch.object(worker.os, "waitpid", side_effect=cleanup), \
                        mock.patch.object(worker.subprocess, "run", **response_args), \
                        mock.patch.object(worker.subprocess, "Popen") as launch:
                    with self.assertRaises(error):
                        worker.execute_job(job)
                    launch.assert_not_called()
                self.assertTrue(driver.blocker.exists())
                driver.blocker.unlink()

    def test_slot_exceptions_block_before_future_collection(self) -> None:
        cases = ("preflight-pin", "wrapper", "completion", "final-pin", "seal-timeout", "seal-malformed")
        for name in cases:
            with self.subTest(case=name):
                driver = self.round_driver(name)
                task = self.task(name)
                error = ValueError(name)
                cleanup = {"groupGone": True, "cleanupComplete": True}
                def completed_wrapper(_command, directory, **_kwargs):
                    if name == "wrapper":
                        raise error
                    for filename, value in (
                        ("worker-result.json", {"exitCode": 0}),
                        ("runner-profile.json", {"profilePath": "unused-fixture-profile"}),
                        ("launch.json", {"cwd": str(self.project)}),
                        ("process-start.json", {}),
                    ):
                        (directory / filename).write_text(json.dumps(value))
                    (directory / "stdout.jsonl").write_text('{"type":"turn.completed"}\n')
                    (directory / "last-message.txt").write_text("done\n")
                    return 0
                pins = [error] if name == "preflight-pin" else [None, error] if name == "final-pin" else None
                native_run = subprocess.run
                def seal_response(command, *args, **kwargs):
                    if len(command) > 3 and command[3] == "seal":
                        if name == "seal-timeout":
                            raise subprocess.TimeoutExpired("seal", 180)
                        return subprocess.CompletedProcess(command, 0, "not-json", "")
                    return native_run(command, *args, **kwargs)
                overrides = {"execute_wrapper": completed_wrapper,
                             "verify_cleanup": mock.Mock(side_effect=error) if name == "completion" else mock.Mock(return_value=cleanup)}
                with mock.patch.dict(driver.run_slot.__func__.__globals__, overrides), \
                        mock.patch.object(driver, "check_pins", side_effect=pins), \
                        mock.patch.object(driver, "check_source"), \
                        mock.patch.object(subprocess, "run", side_effect=seal_response):
                    with ThreadPoolExecutor(max_workers=1) as pool:
                        future = pool.submit(driver.run_slot, task)
                        done, pending = wait([future], timeout=5)
                        self.assertEqual(done, {future})
                        self.assertFalse(pending)
                        # No run_all loop or caller has collected the failure yet.
                        self.assertTrue(driver.blocker.exists(), "failed slot left launch gate open")
                        self.assertTrue(driver.stop.is_set())
                        expected = subprocess.TimeoutExpired if name == "seal-timeout" else ValueError
                        with self.assertRaises(expected):
                            future.result()
                self.assertFalse(self.start_marker.exists())

    def test_driver_sigkill_allows_worker_watchdog_to_clean_profile(self) -> None:
        task = self.task("driver-kill")
        script = self.work / "coordinator.py"
        script.write_text(
            "import importlib.util, sys\n"
            f"sys.path.insert(0, {str(DRIVER_PATH.parent)!r})\n"
            f"spec=importlib.util.spec_from_file_location('driver', {str(DRIVER_PATH)!r})\n"
            "module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)\n"
            f"driver=module.Driver({str(self.config)!r}, {str(self.profiles)!r}, "
            f"operator={str(self.operator)!r}, operator_sha256={digest(self.operator)!r}, "
            f"binary={str(self.binary)!r}, auth_file={str(self.auth)!r}, node={NODE!r}, "
            "timeout_seconds=120, fixture_tools=True)\n"
            f"driver.run_slot({task!r})\n"
        )
        sys.path.insert(0, str(DRIVER_PATH.parent))
        from eval_driver_runtime import process_gone, verify_cleanup
        artifact = self.output / "cohorts/merge-gate/fixture/slot-1"
        process = None
        reference = None
        os.environ["FIXTURE_MODE"] = "ignore-term"
        try:
            process = subprocess.Popen(
                [sys.executable, "-B", str(script)],
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline and not (artifact / "process-start.json").exists():
                time.sleep(0.03)
            self.assertTrue((artifact / "process-start.json").exists())
            reference = json.loads((artifact / "runner-profile.json").read_text())
            model = json.loads((artifact / "process-start.json").read_text())
            process.kill()
            self.assertEqual(process.wait(timeout=5), -signal.SIGKILL)
            # The model timeout is much longer than this cleanup window, and the
            # fixture ignores TERM: only coordinator-loss shutdown can pass.
            deadline = time.monotonic() + 8
            cleanup = verify_cleanup(reference["profilePath"], self.profiles)
            while time.monotonic() < deadline and not cleanup["cleanupComplete"]:
                time.sleep(0.05)
                cleanup = verify_cleanup(reference["profilePath"], self.profiles)
            self.assertTrue(cleanup["groupGone"], "model group survived coordinator loss")
            self.assertTrue(cleanup["cleanupComplete"], "profile cleanup did not finish promptly")
            self.assertTrue(process_gone(model["pid"]))
            watchdog = json.loads((artifact / "watchdog-stop.json").read_text())
            self.assertEqual(watchdog["reason"], "coordinator-disconnected")
        finally:
            os.environ.pop("FIXTURE_MODE", None)
            if process is not None and process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            # Preserve wrapper ownership even when this regression fails: ask
            # the live wrapper to clean its group rather than signal a saved PGID.
            if reference is not None and not process_gone(reference["ownerPid"]):
                os.kill(reference["ownerPid"], signal.SIGTERM)
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if verify_cleanup(reference["profilePath"], self.profiles)["cleanupComplete"]:
                        break
                    time.sleep(0.05)
                self.assertTrue(verify_cleanup(reference["profilePath"], self.profiles)["cleanupComplete"])

    def test_linked_frozen_source_is_rejected_before_cohort_creation(self) -> None:
        linked = self.work / "linked-source"
        subprocess.run(
            ["git", "worktree", "add", "--detach", str(linked), self.head],
            cwd=self.source,
            check=True,
            stdout=subprocess.DEVNULL,
        )
        config = json.loads(self.config.read_text())
        config["frozenRoot"] = str(linked)
        linked_config = self.work / "linked-config.json"
        linked_config.write_text(json.dumps(config))
        try:
            with self.assertRaisesRegex(ValueError, "frozen source requires its own Git common directory"):
                spec = importlib.util.spec_from_file_location("linked_driver", DRIVER_PATH)
                module = importlib.util.module_from_spec(spec)
                sys.path.insert(0, str(DRIVER_PATH.parent))
                spec.loader.exec_module(module)
                module.Driver(
                    linked_config,
                    self.work / "linked-profiles",
                    operator=self.operator,
                    operator_sha256=digest(self.operator),
                    binary=self.binary,
                    auth_file=self.auth,
                    node=NODE,
                    fixture_tools=True,
                )
        finally:
            subprocess.run(["git", "worktree", "remove", str(linked)], cwd=self.source, check=True)


if __name__ == "__main__":
    unittest.main()
