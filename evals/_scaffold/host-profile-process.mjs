import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { processState } from './host-profile-cleanup.mjs';
import { guard, RECORD, writeJson } from './host-profile-storage.mjs';

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function waitGone(pgid, milliseconds) {
  const deadline = Date.now() + milliseconds;
  do {
    if (processState(-pgid) === 'gone') return true;
    await delay(25);
  } while (Date.now() < deadline);
  return processState(-pgid) === 'gone';
}

export async function stopGroup(pgid, signal = 'SIGTERM') {
  if (processState(-pgid) === 'gone') return true;
  signalGroup(pgid, signal);
  if (await waitGone(pgid, 750)) return true;
  signalGroup(pgid, 'SIGKILL');
  return waitGone(pgid, 1250);
}

export async function runCommand(root, profile, command, args, warn) {
  let interrupted;
  let group;
  let stopping;
  const interrupt = (signal) => {
    interrupted ??= signal;
    // Retain and await the cancellation promise; signal handlers must not leave rejections.
    if (group !== undefined && stopping === undefined) {
      stopping = stopGroup(group, signal).catch((error) => {
        warn(error.message);
        return false;
      });
    }
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  try {
    const env = {
      ...process.env,
      HOME: join(profile.path, 'home'),
      CODEX_HOME: join(profile.path, 'codex-home'),
      XDG_CONFIG_HOME: join(profile.path, 'home', '.config'),
      XDG_CACHE_HOME: join(profile.path, 'home', '.cache'),
      XDG_DATA_HOME: join(profile.path, 'home', '.local', 'share'),
      XDG_STATE_HOME: join(profile.path, 'home', '.local', 'state'),
    };
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./host-profile-child.mjs', import.meta.url))],
      {
        detached: true,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        env,
      },
    );
    const exited = new Promise((resolveResult) => {
      child.once('error', (error) => resolveResult({ error }));
      child.once('exit', (code, signal) => resolveResult({ code, signal }));
    });
    group = child.pid;
    if (group === undefined) {
      const result = await exited;
      throw result.error ?? new Error('child group was not created');
    }
    try {
      // Publication precedes authorization over IPC. A killed parent can therefore never
      // leave an unregistered command writing caches. A prepared record authorized no work.
      guard(root, profile.path, profile.record);
      profile.record = { ...profile.record, phase: 'armed', childPgid: group };
      writeJson(join(profile.path, RECORD), profile.record);
      if (interrupted === undefined) {
        await new Promise((resolveResult, reject) => {
          child.send({ command, args }, (error) => (error ? reject(error) : resolveResult()));
        });
      } else {
        interrupt(interrupted);
      }
      const result = await exited;
      if (result.error) throw result.error;
      // Even a successful leader exit is not proof that its group has no descendants.
      const gone = await (stopping ?? stopGroup(group));
      if (!gone) warn('child process group still live or unknown; caches retained');
      return interrupted === undefined
        ? (result.code ?? 128 + (constants.signals[result.signal] ?? 1))
        : 128 + constants.signals[interrupted];
    } catch (error) {
      await (stopping ?? stopGroup(group));
      await exited;
      throw error;
    }
  } finally {
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
}
