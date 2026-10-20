#!/usr/bin/env node
import { resolve } from 'node:path';
import { sealAuxiliaryRecord } from './_scaffold/evidence.mjs';
import suite from './suite.config.mjs';
import { readRegular } from './_scaffold/transcript.mjs';
try {
  const [manifest, output, ...rest] = process.argv.slice(2);
  if (!manifest || !output || rest.length)
    throw Error('usage: node evals/build-context/record.mjs PRIVATE_MANIFEST OUTPUT_RECORD');
  process.stdout.write(
    JSON.stringify(
      sealAuxiliaryRecord(
        JSON.parse(readRegular(resolve(manifest), 256 * 1024)),
        resolve(output),
        suite,
      ),
    ) + '\n',
  );
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
