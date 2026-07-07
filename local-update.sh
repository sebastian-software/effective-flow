#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
INSTALL_MODE=copy
# shellcheck source=local-common.sh
. "$ROOT_DIR/local-common.sh"

firmo_deploy
