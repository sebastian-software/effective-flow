#!/usr/bin/env bash
# `context.scaffold_script` names this file, and the harness runs it only under `--scaffold`. It
# lives inside the case directory rather than beside `scaffold.mjs` so the path the harness resolves
# never leaves the case directory. The provisioning itself is in `../_scaffold/scaffold.mjs`.
set -euo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")/../_scaffold" && pwd)/scaffold.mjs" guard-blocks-merge
