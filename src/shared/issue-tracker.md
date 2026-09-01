## Issue-tracker integration (remote mode)

This shared fragment connects `{{SKILL:review}}` and `{{SKILL:apply-review}}` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" in `issue-tracker-forge.md`.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`{{SKILL:investigate}}`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: this core carries the `tracker` config schema including migration, the mode determination, and the tracker-target handoff, and the sibling fragment "Issue-tracker forge mechanics" (`issue-tracker-forge.md`) carries the provider-neutral remote-helper contract, the label convention, the security disclosure gate, the remote prose language, and the canonical issue and epic body formats. Every source that reaches the forge target loads that sibling as well, eagerly or through its own deferred pointer. The actual orchestration – when issues are **created** (`{{SKILL:review}}`) and when they are **read and processed** (`{{SKILL:apply-review}}`) – stays in the respective skill.

In addition, `{{SKILL:apply-issues}}` and `{{SKILL:plan-issue}}` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `{{SKILL:review}}`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections of `issue-tracker-forge.md` (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `{{SKILL:review}}`/`{{SKILL:apply-review}}`; the checkbox-ticking mechanics for epic bodies are used by `{{SKILL:apply-issues}}` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto",
    "externalTool": null,
    "externalToolHint": null
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)
- `tracker.externalTool`: `null` (no external tool named)
- `tracker.externalToolHint`: `null` (no additional connection hint)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`, `"external"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`
- `tracker.externalTool`: a short, non-empty identifier of the tool that holds the issues. There is
  **no** whitelist; Effective Flow neither rejects an unknown tool nor infers capabilities from the
  name. Required when the mode is `external`.
- `tracker.externalToolHint`: free text that lets the run-time agent pick the right connection —
  e.g. MCP server name, workspace, team or project key, identifier convention, or state names.

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection of the "Remote helper contract" in `issue-tracker-forge.md` decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`.
2. **Per-run wish of the user:** A **generic** wish for issue/tracker work ("as issues", "publish to the tracker") activates the **configured** target and never redirects a run to a different one; without a configured target it selects `remote`. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`) selects `remote`, and only a wish that explicitly names the configured external tool selects `external`. If the user explicitly requests local work ("local", "without issues", "report only"), `local` is active — that stays the escape hatch on every target.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

```ask
header: Tracker
question: Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?
options:
  - label: Local
    description: tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
  - label: Remote
    description: tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)
```

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `{{SKILL:setup}}`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `{{SKILL:setup}}`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `{{SKILL:setup}}` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything in the sibling fragment `issue-tracker-forge.md` — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `{{SKILL:setup}}`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (`{{SKILL:apply-issues}}`, `{{SKILL:plan-issue}}`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.
