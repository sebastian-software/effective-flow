#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s [local|-h|--help]\n' "${0##*/}"
}

invalid_usage() {
  printf 'Invalid arguments.\n' >&2
  usage >&2
  exit 1
}

case "$#" in
  0) install_source=dalo ;;
  1)
    case "$1" in
      local) install_source=local ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) invalid_usage ;;
    esac
    ;;
  *) invalid_usage ;;
esac

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
INSTALL_MODE=copy
# shellcheck source=local-common.sh
. "$ROOT_DIR/local-common.sh"

case "$install_source" in
  local) effective_flow_deploy ;;
  dalo) effective_flow_install_through_dalo ;;
esac
