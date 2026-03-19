#!/bin/sh

set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SOURCE_DIR="$ROOT_DIR/skills"
TARGET_DIR="${CODEX_HOME:-$HOME/.codex}/skills"

mkdir -p "$TARGET_DIR"

for skill_dir in "$SOURCE_DIR"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  target_path="$TARGET_DIR/$skill_name"

  if [ -L "$target_path" ] || [ -e "$target_path" ]; then
    rm -rf "$target_path"
  fi

  ln -s "$skill_dir" "$target_path"
done

printf 'Skills linked into %s\n' "$TARGET_DIR"
