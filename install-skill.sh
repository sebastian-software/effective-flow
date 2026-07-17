#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
INSTALL_MODE=copy
# shellcheck source=local-common.sh
. "$ROOT_DIR/local-common.sh"

if [ "$#" -gt 0 ]; then
  effective_flow_deploy
else
  effective_flow_install_latest_release
fi
