#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SOURCE_DIR="$ROOT_DIR/skills"
DIST_CODEX="$ROOT_DIR/dist/codex"
DIST_CLAUDE="$ROOT_DIR/dist/claude"

CLAUDE_PLUGIN_NAME="sf-frontend-workflows"
CLAUDE_PLUGIN_DIR="$DIST_CLAUDE/$CLAUDE_PLUGIN_NAME"

rm -rf "$DIST_CODEX" "$DIST_CLAUDE"
mkdir -p "$DIST_CODEX/skills" "$DIST_CODEX/agents"
mkdir -p "$CLAUDE_PLUGIN_DIR/.claude-plugin" "$CLAUDE_PLUGIN_DIR/commands" "$CLAUDE_PLUGIN_DIR/agents"

# --- plugin.json for Claude Code ---
cat > "$CLAUDE_PLUGIN_DIR/.claude-plugin/plugin.json" <<'PJSON'
{
  "name": "sf",
  "description": "Orchestrierte Workflows (build-feature, fix, refactor, review) mit spezialisierten Agents fuer Implementierung, Review, Tests und Validierung — Frontend und Node.js Backend/CLI",
  "author": {
    "name": "Sebastian Fastner"
  }
}
PJSON

# --- Helper functions ---

# Extract raw frontmatter lines (between first and second ---)
extract_frontmatter() {
  awk '/^---$/ { n++; next } n==1 { print } n>=2 { exit }' "$1"
}

# Extract body (everything after second ---)
extract_body() {
  awk '/^---$/ { n++; next } n>=2 { print }' "$1"
}

# Get a top-level YAML field value: get_field "key" < frontmatter
get_field() {
  awk -v key="$1:" '$1 == key { sub(/^[^:]+:[[:space:]]*"?/, ""); sub(/"$/, ""); print; exit }'
}

# Get a nested YAML field: get_nested "section" "key" < frontmatter
get_nested() {
  awk -v sec="$1:" -v key="$2:" '
    $1 == sec { in_sec=1; next }
    in_sec && /^[a-z]/ { exit }
    in_sec && $1 == key { sub(/^[[:space:]]*[^:]+:[[:space:]]*"?/, ""); sub(/"$/, ""); print; exit }
  '
}

# Get a nested YAML array field as comma-separated: get_nested_array "section" "key" < frontmatter
get_nested_array() {
  awk -v sec="$1:" -v key="$2:" '
    $1 == sec { in_sec=1; next }
    in_sec && /^[a-z]/ { exit }
    in_sec && $1 == key {
      # Handle inline array [a, b, c]
      s = $0
      gsub(/.*\[/, "", s)
      gsub(/\].*/, "", s)
      gsub(/[[:space:]]/, "", s)
      print s
      exit
    }
  '
}

# Get a nested YAML list (multi-line - items): get_nested_list "section" "key" < frontmatter
get_nested_list() {
  awk -v sec="$1:" -v key="$2:" '
    $1 == sec { in_sec=1; next }
    in_sec && /^[a-z]/ { exit }
    in_sec && $1 == key {
      # Check inline array [a, b, c]
      if (index($0, "[") > 0) {
        s = $0
        gsub(/.*\[/, "", s)
        gsub(/\].*/, "", s)
        n = split(s, items, ",")
        for (i=1; i<=n; i++) {
          gsub(/^[[:space:]]+/, "", items[i])
          gsub(/[[:space:]]+$/, "", items[i])
          if (items[i] != "") print "  - " items[i]
        }
      }
      in_list=1; next
    }
    in_sec && in_list && /^[[:space:]]*- / {
      sub(/^[[:space:]]*- [[:space:]]*/, "")
      print "  - " $0
      next
    }
    in_sec && in_list { exit }
  '
}

# Strip sf- prefix: strip_prefix "sf-build-feature" -> "build-feature"
strip_prefix() {
  printf '%s' "$1" | sed 's/^sf-//'
}

# Replace placeholders for Claude Code (both -> /short-name without sf-)
transform_claude() {
  perl -pe '
    s/\{\{SKILL:sf-([^}]+)\}\}/\/$1/g;
    s/\{\{AGENT:sf-([^}]+)\}\}/\/$1/g;
  '
}

# Replace placeholders for Codex skills (SKILL->$name, AGENT->bare name)
transform_codex_skill() {
  perl -pe '
    s/\{\{SKILL:([^}]+)\}\}/\$$1/g;
    s/\{\{AGENT:([^}]+)\}\}/$1/g;
  '
}

# Replace placeholders for Codex agents (both -> bare name)
transform_codex_agent() {
  perl -pe '
    s/\{\{SKILL:([^}]+)\}\}/$1/g;
    s/\{\{AGENT:([^}]+)\}\}/$1/g;
  '
}

# Strip frontmatter from description (remove placeholder markup for clean text)
clean_description() {
  printf '%s' "$1" | perl -pe '
    s/\{\{SKILL:([^}]+)\}\}/$1/g;
    s/\{\{AGENT:([^}]+)\}\}/$1/g;
  '
}

# --- Build loop ---

for skill_dir in "$SOURCE_DIR"/sf-*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  short_name="$(strip_prefix "$skill_name")"
  src="$skill_dir/SKILL.md"

  fm="$(extract_frontmatter "$src")"
  body="$(extract_body "$src")"

  skill_type="$(echo "$fm" | get_field "type")"
  description="$(echo "$fm" | get_field "description")"

  case "$skill_type" in
    orchestrator|utility)
      # --- Codex: Skill (SKILL.md) ---
      codex_dir="$DIST_CODEX/skills/$skill_name"
      mkdir -p "$codex_dir"
      {
        printf '%s\n' "---"
        printf 'name: %s\n' "$skill_name"
        printf 'description: "%s"\n' "$(clean_description "$description")"
        printf '%s\n' "---"
        echo "$body" | transform_codex_skill
      } > "$codex_dir/SKILL.md"

      # --- Claude Code: Command ---
      claude_desc="$(clean_description "$description")"
      {
        printf '%s\n' "---"
        printf 'description: %s\n' "$claude_desc"
        printf '%s\n' "---"
        echo "$body" | transform_claude
      } > "$CLAUDE_PLUGIN_DIR/commands/$short_name.md"
      ;;

    agent)
      # --- Codex: Custom Agent (TOML) ---
      codex_model="$(echo "$fm" | get_nested "codex" "model")"
      codex_effort="$(echo "$fm" | get_nested "codex" "model_reasoning_effort")"
      codex_sandbox="$(echo "$fm" | get_nested "codex" "sandbox_mode")"
      toml_desc="$(clean_description "$description")"
      toml_body="$(echo "$body" | transform_codex_agent)"

      {
        printf 'name = "%s"\n' "$skill_name"
        printf 'description = "%s"\n' "$toml_desc"
        [ -n "$codex_model" ] && printf 'model = "%s"\n' "$codex_model"
        [ -n "$codex_effort" ] && printf 'model_reasoning_effort = "%s"\n' "$codex_effort"
        [ -n "$codex_sandbox" ] && printf 'sandbox_mode = "%s"\n' "$codex_sandbox"
        printf "developer_instructions = '''\n%s\n'''\n" "$toml_body"
      } > "$DIST_CODEX/agents/$skill_name.toml"

      # --- Claude Code: Agent ---
      claude_model="$(echo "$fm" | get_nested "claude" "model")"
      claude_color="$(echo "$fm" | get_nested "claude" "color")"
      claude_tools="$(echo "$fm" | get_nested_array "claude" "tools")"
      claude_skills="$(echo "$fm" | get_nested_list "claude" "skills")"

      {
        printf '%s\n' "---"
        printf 'name: %s\n' "$short_name"
        printf 'description: %s\n' "$(clean_description "$description")"
        [ -n "$claude_model" ] && printf 'model: %s\n' "$claude_model"
        [ -n "$claude_color" ] && printf 'color: %s\n' "$claude_color"
        if [ -n "$claude_tools" ]; then
          printf 'tools: '
          # Convert comma-separated to space-separated
          echo "$claude_tools" | tr ',' '\n' | while IFS= read -r tool; do
            tool="$(echo "$tool" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
            [ -n "$tool" ] && printf '%s, ' "$tool"
          done | sed 's/, $//'
          printf '\n'
        fi
        if [ -n "$claude_skills" ]; then
          printf 'skills:\n'
          printf '%s\n' "$claude_skills"
        fi
        printf '%s\n' "---"
        echo "$body" | transform_claude
      } > "$CLAUDE_PLUGIN_DIR/agents/$short_name.md"
      ;;

    *)
      printf 'WARNING: Unknown type "%s" for %s, skipping\n' "$skill_type" "$skill_name" >&2
      ;;
  esac
done

# --- Summary ---
codex_skills=$(ls -1 "$DIST_CODEX/skills/" 2>/dev/null | wc -l | tr -d ' ')
codex_agents=$(ls -1 "$DIST_CODEX/agents/"*.toml 2>/dev/null | wc -l | tr -d ' ')
claude_commands=$(ls -1 "$CLAUDE_PLUGIN_DIR/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
claude_agents=$(ls -1 "$CLAUDE_PLUGIN_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')

printf 'Built:\n'
printf '  Codex:      %s skills, %s agents  -> dist/codex/\n' "$codex_skills" "$codex_agents"
printf '  Claude Code: %s commands, %s agents -> dist/claude/%s/\n' "$claude_commands" "$claude_agents" "$CLAUDE_PLUGIN_NAME"
