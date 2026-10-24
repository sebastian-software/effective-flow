// The detached group leader does no work before the parent publishes its PID. An IPC
// disconnect in that crash gap exits without ever starting the requested command.
import { spawn } from 'node:child_process';
import { constants } from 'node:os';

process.once('disconnect', () => process.exit(0));
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});
process.once('message', ({ command, args }) => {
  const child = spawn(command, args, { stdio: 'inherit', env: process.env });
  child.once('error', (error) => {
    process.stderr.write(`host-run: cannot start command: ${error.message}\n`);
    process.exit(127);
  });
  child.once('exit', (code, signal) => {
    process.exit(code ?? 128 + (constants.signals[signal] ?? 1));
  });
});
