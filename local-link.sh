#!/bin/sh
set -eu

# Development variant of local-update.sh: symlink the built `effective-flow`
# skill into the harness skills directories instead of copying.
ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
INSTALL_MODE=link
# shellcheck source=local-common.sh
. "$ROOT_DIR/local-common.sh"

effective_flow_deploy
