"""Portable host-run lifecycle tests with local POSIX fixtures."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import tempfile
import time
import unittest
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RUNNER = ROOT / "evals" / "host-run.mjs"
FIXTURE = """
import fs from 'node:fs';
const [mode, report] = process.argv.slice(2);
fs.mkdirSync(`${process.env.HOME}/.codex/cache`, {recursive:true});
fs.mkdirSync(`${process.env.CODEX_HOME}/plugins/cache`, {recursive:true});
fs.writeFileSync(report, JSON.stringify({home:process.env.HOME, codehome:process.env.CODEX_HOME, pid:process.pid}));
if (mode === 'ignore-term') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
if (mode === 'sleep') setInterval(() => {}, 1000);
if (mode === 'fail') process.exit(7);
"""


class HostRunTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(
            prefix="effective-flow-host-run-",
            dir=str(Path(tempfile.gettempdir()).resolve()),
        )
        self.work = Path(self.temp.name)
        self.profiles = self.work / "profiles"
        self.fixture = self.work / "fixture.mjs"
        self.fixture.write_text(FIXTURE)

    def tearDown(self):
        self.temp.cleanup()

    def command(self, mode, report):
        return [
            "node", str(RUNNER), "--profiles-root", str(self.profiles),
            "--", "node", str(self.fixture), mode, str(report),
        ]

    def run_host(self, mode, report, auth=None):
        command = self.command(mode, report)
        if auth:
            command[4:4] = ["--auth-file", str(auth)]
        return subprocess.run(
            command, text=True, capture_output=True, timeout=15,
        )

    def recover(self):
        return subprocess.run(
            ["node", str(RUNNER), "--profiles-root", str(self.profiles), "--recover"],
            text=True, capture_output=True, timeout=10,
        )

    def stop_group(self, group):
        self.assertNotEqual(group, os.getpgrp())
        try:
            os.killpg(group, signal.SIGKILL)
        except ProcessLookupError:
            return
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                os.killpg(group, 0)
            except ProcessLookupError:
                return
            time.sleep(0.02)
        self.fail(f"fixture process group {group} did not exit")

    @contextmanager
    def running_host(self, mode, report):
        process = subprocess.Popen(
            self.command(mode, report),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        group = None
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not report.exists():
                time.sleep(0.02)
            self.assertTrue(report.exists(), "fixture did not report startup")
            fixture = json.loads(report.read_text())
            profile = Path(fixture["codehome"]).parent
            self.assertEqual(profile.parent, self.profiles)
            record = json.loads((profile / "host-profile.json").read_text())
            group = record["childPgid"]
            self.assertEqual(os.getpgid(fixture["pid"]), group)
            self.assertNotEqual(group, os.getpgrp())
            yield process, profile
        finally:
            try:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            finally:
                if group is not None:
                    self.stop_group(group)

    def test_success_failure_auth_and_distinct_concurrent_profiles(self):
        auth = self.work / "auth.json"
        auth.write_text("{}\n")
        self.assertEqual(self.run_host("ok", self.work / "ok.json", auth).returncode, 0)
        self.assertEqual(self.run_host("fail", self.work / "fail.json").returncode, 7)
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(
                lambda i: self.run_host("ok", self.work / f"{i}.json"), range(3),
            ))
        self.assertTrue(all(item.returncode == 0 for item in results))
        profiles = sorted(self.profiles.glob("profile-*"))
        self.assertEqual(len(profiles), 5)
        self.assertTrue(any((profile / "codex-home/auth.json").is_symlink() for profile in profiles))
        for profile in profiles:
            self.assertTrue((profile / "host-profile.json").is_file())
            self.assertTrue((profile / "host-profile-cleanup.json").is_file())
            self.assertFalse((profile / "home/.codex/cache").exists())
            self.assertFalse((profile / "codex-home/plugins/cache").exists())

    def test_sigint_sigterm_and_term_ignore_cleanup(self):
        for stop, expected in ((signal.SIGINT, 130), (signal.SIGTERM, 143)):
            report = self.work / f"{stop}.json"
            with self.running_host("sleep", report) as (process, profile):
                process.send_signal(stop)
                self.assertEqual(process.wait(timeout=10), expected)
                self.assertTrue((profile / "host-profile-cleanup.json").is_file())
        report = self.work / "ignored.json"
        with self.running_host("ignore-term", report) as (process, profile):
            process.send_signal(signal.SIGTERM)
            self.assertNotEqual(process.wait(timeout=10), 0)
            self.assertTrue((profile / "host-profile-cleanup.json").is_file())

    def test_runner_sigkill_recovery_retains_live_profile(self):
        report = self.work / "live.json"
        with self.running_host("ignore-term", report) as (process, profile):
            process.kill()
            self.assertEqual(process.wait(timeout=5), -signal.SIGKILL)
            recovered = self.recover()
            self.assertEqual(recovered.returncode, 0, recovered.stderr)
            self.assertFalse((profile / "host-profile-cleanup.json").exists())
        recovered = self.recover()
        self.assertEqual(recovered.returncode, 0, recovered.stderr)
        self.assertTrue((profile / "host-profile-cleanup.json").is_file())
        self.assertFalse((profile / "home/.codex/cache").exists())
        self.assertFalse((profile / "codex-home/plugins/cache").exists())


if __name__ == "__main__":
    unittest.main()
