// Shared test support: the native Fast-profile declarations of build.mjs, read from its source
// because build.mjs runs the build on import. Tests that render a Fast-carrying source derive their
// render configuration here instead of copying model names or the implementer set, so a mapping or
// routing change reaches every such test at once. This module declares no test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseProjectRoutingTable } from '../../build-lib.mjs';

const BUILD_SOURCE = readFileSync(new URL('../../build.mjs', import.meta.url), 'utf8');

function declaration(name) {
  const match = BUILD_SOURCE.match(
    new RegExp(`const ${name} = Object\\.freeze\\(([\\s\\S]*?)\\);\\n`),
  );
  assert.ok(match, `build.mjs must declare ${name}`);
  return match[1];
}

// The route IDs build.mjs classifies as Fast-capable, in declaration order.
export const FAST_CAPABLE_ROUTE_IDS = Object.freeze(
  [...declaration('FAST_CAPABLE_ROUTE_IDS').matchAll(/'([^']+)'/g)].map(([, route]) => route),
);

// The native Fast mapping, in the shape `validateAgentProfileMappings` accepts.
export const AGENT_PROFILE_MAPPINGS = (() => {
  const text = declaration('AGENT_PROFILE_MAPPINGS');
  const claude = text.match(/claude: Object\.freeze\(\{ model: '([^']+)', effort: '([^']+)' \}\)/);
  const codex = text.match(
    /codex: Object\.freeze\(\{ model: '([^']+)', reasoning_effort: '([^']+)' \}\)/,
  );
  assert.ok(claude && codex, 'build.mjs must declare the Claude and Codex Fast mappings');
  return Object.freeze({
    fast: Object.freeze({
      claude: Object.freeze({ model: claude[1], effort: claude[2] }),
      codex: Object.freeze({ model: codex[1], reasoning_effort: codex[2] }),
    }),
  });
})();

// The implementation workers of the Fast-capable routes, derived exactly as build.mjs derives them
// from the shared project-routing table.
export const FAST_PROFILE_AGENTS = (() => {
  const routes = parseProjectRoutingTable(
    readFileSync(new URL('../../src/shared/project-routing.md', import.meta.url), 'utf8'),
    { context: 'shared/project-routing.md' },
  );
  return new Set(
    FAST_CAPABLE_ROUTE_IDS.map((routeId) => {
      const route = routes.find(({ route: candidate }) => candidate === routeId);
      const worker = route?.implementer.match(/^\{\{AGENT:([a-z0-9]+(?:-[a-z0-9]+)*)\}\}$/);
      assert.ok(worker, `Fast-capable route ${routeId} must name one implementation worker`);
      return worker[1];
    }),
  );
})();
