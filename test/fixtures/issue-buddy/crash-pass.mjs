// A bounded recipe for cross-helper crash evidence, not an interpreter for the Markdown tool.
import * as fs from 'node:fs/promises';
import {
  loadWorld,
  checked,
  acquire,
  collect,
  writePlan,
  publish,
  record,
  report,
  prIdentity,
} from './world.mjs';
process.once('message', async ({ container, boundary }) => {
  const checkpoint = async (stage) => {
    if (stage !== boundary) return;
    process.send({ kind: 'boundary', stage });
    await new Promise((resolve) => process.once('message', resolve));
  };
  try {
    const observedFs = {
      ...fs,
      rename: async (...args) => {
        const result = await fs.rename(...args);
        if (args[1].endsWith('/verdicts.json')) await checkpoint('after-cache');
        return result;
      },
    };
    const world = loadWorld(container, { checkpoint, observedFs });
    const passId = await acquire(world);
    process.send({ kind: 'acquired', passId });
    const collected = await collect(world, passId);
    await checkpoint('before-file');
    await writePlan(world);
    await checkpoint('after-file');
    const published = await publish(world, collected);
    await checkpoint('before-verdict');
    const verdict = await record(world, passId, collected, { pullRequest: published.pullRequest });
    await checkpoint('after-verdict');
    await checkpoint('before-report');
    await report(world, passId, collected, {
      verdicts: [verdict],
      pullRequestsOpened: [prIdentity(published)],
    });
    await checkpoint('after-report');
    checked(await world.buddy('pass-lock-release', { passId }));
    process.disconnect();
  } catch (error) {
    process.send({ kind: 'failure', message: error.stack });
    process.exitCode = 1;
    process.disconnect();
  }
});
