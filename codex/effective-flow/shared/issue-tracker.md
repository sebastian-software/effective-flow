## Issue-tracker integration (remote mode)

This shared fragment connects `$effective-flow review` and ``tools/apply-review.md`` with an external issue tracker (GitHub via `gh`, Forgejo via `tea`). It is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). In local mode both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked.

The local/remote toggle (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`$effective-flow investigate`) are exempt from it and remain purely local in every mode under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the host and CLI detection, the label convention, the canonical issue and epic body formats as well as the mapping of tracker operations onto `gh`/`tea`. The actual orchestration – when issues are **created** (`$effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `$effective-flow plan-issue` use this fragment, though only for the **tool-generic plumbing**: the host and CLI detection (below), the availability/auth check, the mapping of tracker operations onto `gh`/`tea` and the error cases. These two skills process **arbitrary** human issues instead of the finding issues produced by `$effective-flow review`; they are **inherently remote** and do **not** evaluate the `tracker.mode` toggle (local/remote) – they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `$effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; an issue reference (issue number, `#123` or an issue URL) forces `remote`.
2. **Per-run wish of the user:** If the user explicitly requests issue/tracker work, `remote` is active; if they explicitly request local work ("local", "without issues", "report only"), `local` is active.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Frage den User: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `$effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `$effective-flow setup`."

### Host and CLI detection (remote mode only)

In remote mode, determine the tool analogously to `$effective-flow pr`:

1. **Precondition:** A Git repository with an `origin` remote is present. If `origin` is missing or it is not a Git repository, remote mode is not possible: report clearly and abort.
2. **Choose tool:**
   - `tracker.remoteToolOverride: "github"` → `gh`; `"forgejo"` → `tea`.
   - otherwise (`auto`): Read the `origin` URL (`git remote get-url origin`) and extract the host from it robustly for HTTPS and SSH forms (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). If the host is exactly `github.com`, the tool is `gh`; **for any other host** Forgejo/Gitea is assumed and `tea` is used.
   - An explicit per-run hint from the user about the tool takes precedence for an ambiguous host (e.g. GitHub Enterprise). If the host is ambiguous and neither override nor per-run hint is present, ask the user for the desired tool.
3. **Check availability:** Ensure the chosen CLI is installed and authenticated (`gh auth status` or `tea` with a configured login). If the CLI or the authentication is missing: emit a clear error message with a remediation hint and abort without side effect. Do **not** silently fall back to `local`; offer a fallback to `local` only after explicit user consent.

### Label convention

In remote mode, use these labels and create missing labels idempotently (tolerate an "already exists" message, do not treat it as an error):

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `$effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`$effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in `.effective-flow/memory.json` is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). Afterwards set the marker. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see `$effective-flow review`, "Report format").

- **Title:** `[R-XXXXXXX] <short title>`
- **Labels:** `effective-flow-review-finding`, the action label and the severity label.
- **Body** (canonical template):

```markdown
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt suggestion**: [directly copy-pasteable plain text, without enclosing quotation marks, without escape sequences]
- **Epic**: #<epic number> (empty if no epic)
- **Signature**: [path:line] · [Area] · [short summary of the problem]  <!-- Dedup key -->
```

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]`
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- #<nr-or-none> [R-XXXXXXX] <short title> — covered by [DD-XXX] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. It is omitted when no such findings are present.
- Ticking off is done by toggling `- [ ]` → `- [x]` and optionally appending the PR link on the entry; a finding deliberately not implemented is marked via a slug reference as `- [x] … — nicht umgesetzt (ADR: <slug>)`.

### Tracker operations (tool mapping)

Describe all tracker accesses abstractly as an operation and choose the command by the detected tool. For Forgejo, check the exact flag names against the installed `tea` version if a call fails (as noted in `$effective-flow pr`).

| Operation                                   | GitHub (`gh`)                                                                              | Forgejo (`tea`)                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Create label (idempotent)                   | `gh label create <name> --force`                                                           | `tea labels create --name <name>`                                                                        |
| Create issue                                | `gh issue create --title … --body-file … --label …`                                        | `tea issue create --title … --body … --labels …`                                                         |
| Read issue (body + labels + status)         | `gh issue view <nr> --json title,body,labels,state`                                        | `tea issue <nr>` or `tea issue view <nr>`                                                                |
| Read comments (clarifications, idempotency) | `gh issue view <nr> --json comments`                                                       | `tea issue view <nr> --comments`, otherwise Forgejo API `GET /repos/<owner>/<repo>/issues/<nr>/comments` |
| List finding issues (for dedup)             | `gh issue list --label effective-flow-review-finding --state all --json number,title,body` | `tea issues list --labels effective-flow-review-finding --state all`                                     |
| List open epics                             | `gh issue list --label effective-flow-review-epic --state open`                            | `tea issues list --labels effective-flow-review-epic --state open`                                       |
| Update issue body (tick off epic)           | `gh issue edit <nr> --body-file …`                                                         | `tea issue edit <nr> --body …`                                                                           |
| Add comment (e.g. PR link)                  | `gh issue comment <nr> --body …`                                                           | `tea comment <nr> …`                                                                                     |
| Set/remove label                            | `gh issue edit <nr> --add-label … --remove-label …`                                        | `tea issue edit <nr> --labels …`                                                                         |
| Create pull request                         | via `$effective-flow pr`                                                                         | via `$effective-flow pr`                                                                                       |

For the epic body update it applies: read the body freshly before changing, toggle only the affected line specifically and write it back, so parallel changes are not lost.

For the listing operations (dedup, open epics) the backward compatibility from "Label convention" applies: run the query separately per prefix (`effective-flow-…` **and** `firmo-…`) and union by the issue number.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").
