#!/usr/bin/env node
// JSONL operator channel; child CLIs receive only their own stdin prompt, never this channel.
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import suite from './suite.config.mjs';
import { HostCoordinator } from './_scaffold/host-coordinator.mjs';
const [root, mode, ...rest] = process.argv.slice(2);
if (!root || rest.length || (mode && !['new', 'resume'].includes(mode)))
  throw Error('usage: node evals/build-context/coordinator.mjs PRIVATE_HOST_JOURNAL [new|resume]');
const coordinator = new HostCoordinator(resolve(root), { resume: mode === 'resume', suite });
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  try {
    const request = JSON.parse(line),
      keys = Object.keys(request).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['input', 'operation']))
      throw Error('closed coordinator request is {operation,input}');
    let result;
    switch (request.operation) {
      case 'build':
        result = coordinator.build(request.input);
        break;
      case 'prepare':
        result = coordinator.prepare(request.input);
        break;
      case 'launch':
        result = coordinator.launch(request.input.launch);
        break;
      case 'resume':
        result = coordinator.launch(request.input.launch, {
          resume: true,
          args: request.input.args,
          prompt: request.input.prompt,
        });
        break;
      case 'fail':
        result = coordinator.fail(request.input.launch, request.input);
        break;
      case 'probe-helper':
        result = coordinator.probeHelper(request.input.launch, request.input);
        break;
      case 'complete':
        result = coordinator.complete(request.input.launch, request.input.manifest);
        break;
      default:
        throw Error('unsupported coordinator operation');
    }
    process.stdout.write(JSON.stringify({ ok: true, operation: request.operation, result }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n');
  }
}
