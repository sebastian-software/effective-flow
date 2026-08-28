
# Effective Flow Apply Review – Remote mode

This internal sub-file is loaded by `tools/apply-review.md` as soon as the resolved tracker target is the forge or an external tool (the argument is an epic/container or finding issue). It contains the full issue-tracker integration, the external-target contract, and the tracker flow; on the `local` target it is never loaded.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" below.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

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

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides. It names a **forge** CLI and stays forge-only.

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

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `effective-flow setup` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything below in this fragment — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd`. The helper runs `git`, `gh`
and `tea` in that directory, and every provider CLI resolves its repository context from it. The
runtime root is the one checkout guaranteed to exist for the whole run, whereas an execution
worktree may already have been withdrawn by the time a completion action runs. The field is
optional for compatibility — when it is absent the helper inherits the process working directory —
but an Effective Flow workflow always sets it. A `cwd` that is not an existing directory fails with
a structured error naming the path, never as a missing-CLI error.

For `finding-build` and `epic-build`, pass the already-resolved `language.forge` as the top-level
`language: en|de`; this applies equally when the finding or epic data is nested under its named
key. The optional field defaults to `en`, and unsupported values are rejected. The helper returns
the same language-stable payload keys in either language.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`, and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user, then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable, argument vector, and redacted input preview, obtain every workflow-specific approval that still applies, and only then repeat the same operation with `--apply`. A dry run never changes Git, tracker state, memory, labels, issues, pull requests, comments, or review threads.

### Label convention

In remote mode, use these labels and create missing labels idempotently. The helper's label creation reads the repository's existing labels first and creates only what is genuinely missing, so a repeated run adds no second copy of a label; each call reports whether it created anything. Copies an earlier version already created are not removed and can still attach several times to one issue. Where the existing labels cannot be read, it aborts instead of creating:

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-issue-in-progress`                                                             | forge fallback showing issue-backed implementation has started                    |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; the helper creates it only if it is missing.
`effective-flow-issue-in-progress`, `effective-flow-issue-done`, and
`effective-flow-needs-planning` belong to the issue-driven lifecycle and are created idempotently
where needed. The in-progress label is a forge fallback for a native started state; the done label
continues to mean "implementation secured in a PR", not "tracker issue closed". Merge reconciliation
removes the in-progress label only after it freshly observes the issue as terminal.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label. `effective-flow-issue-in-progress` is new and has no legacy variant.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### Security disclosure gate

A finding classified as security relevant is **never** written to a tracker without an explicit
per-run confirmation by the user. This gate binds every publisher of review findings and
overrides `tracker.mode` as well as every other configuration value; there is no configuration key
that switches it off. Publication to a third-party tracker is a disclosure with the same
consequences as publication to a public forge, so the gate binds a forge target and an external
target alike. The producing workflow owns the classification and the confirmation
(see `effective-flow review`, Phase 3 and Phase 4).

Rules for every publisher, on whichever tracker target the run resolved:

- **Local first:** the withheld findings are persisted in a local report below
  `.effective-flow/review/` before any tracker mutation. That report is the authoritative record
  for them; it stays in the gitignored runtime state of the main checkout and is never committed.
- **Confirmation before publication:** publication happens only after an explicit user decision in
  that run, taken with knowledge of the disclosure consequence. Keeping them local is the default;
  an unanswered, skipped, or non-interactive run publishes nothing from the withheld set.
- **Silence in public artifacts:** epic bodies, issue bodies, and comments contain no count, title,
  signature, ID, or other reference to a withheld finding. A public hint that unfixed security
  findings exist is itself an exploitable signal.
- **Conservative classification:** an uncertain or missing security assessment counts as security
  relevant and stays local.
- **Scope:** the gate covers the publication of review findings. It does not sanitize branch names,
  commit subjects, or pull request bodies of a later fix; that disclosure decision belongs to the
  delivering workflow and its user.

The gate governs only the destination of a finding. It never removes a finding, changes its
severity, or narrows the active finding scope.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not. This binds every publisher on every tracker target, the forge and an external tool alike.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Sicherheit`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. The exposure
values `external`, `internal`, and `none` of the `Security`/`Sicherheit` field are machine tokens
and stay unlocalized in both forms. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see the shared `review-report-format` fragment).

- **Title:** `[R-XXXXXXX] <short title in language.forge>`
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

A finding published through the "Security disclosure gate" keeps its `Security`/`Sicherheit` field
in the issue body, so the accepted disclosure stays visible; an ordinary finding omits that field
instead of carrying an empty `none`.

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run. Canonical writes use `Signature`; helper reads and deduplication also accept the legacy field name `Signatur` and normalize both forms to the same identity.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]` for English or
  `Code-Review YYYY-MM-DD[-N]` for German
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- <short title> — Signature: [normalized signature] — covered by [decision reference] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. A skipped entry is identified by title, normalized signature, and decision reference; it carries no issue number and no `R-XXXXXXX` ID, and it never advances `lastFindingNumber`. The section is omitted when no such findings are present.
- Ticking off delegates the exact checklist patch to the helper, using the body hash from the preceding fresh read. It may append the PR link; a finding deliberately not implemented is marked with its decision reference.

### Tracker operations

Describe tracker access only as a helper operation: issue/PR read and list, issue/PR create,
issue state transition, native sub-issue read/create, comment read/create/update, label
create/change, PR review-thread read/reply/resolve, PR submitted-review read,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

The two native-containment operations are deliberately separate from generic issue creation:

- `issue-sub-issues-read` takes a mandatory top-level `parent` issue reference and returns a list of
  normalized issue objects. Every item additionally carries
  `parent: { number, repository }`; a child created from an Effective Flow decomposition also
  carries its normalized `decompositionKey` from the canonical marker in its body. A malformed,
  duplicated, invalid, or different-parent marker does not discard the provider-verified native
  child or abort its siblings: that child instead carries a safe structured
  `decompositionKeyError`. Planning reconciliation must fail closed on that diagnostic; lifecycle
  and merge observation still use the verified native relation and issue identity.
- `issue-sub-issue-create` is a mutation whose top-level `parent` is mandatory. Its `payload`
  contains a non-empty `title`, non-empty self-contained `body`, optional `labels`, and the stable
  lowercase `decompositionKey`. The helper validates that a parent URL belongs to the active
  repository, redacts complete recognizable secret values in titles and bodies, rejects an unsafe
  credential form it cannot transform deterministically, rejects secret-bearing labels and
  generation attribution, appends exactly
  one `<!-- effective-flow-decomposition-key:v2 <base64url> -->`
  marker as the final nonblank standalone line of the child body, and returns the normalized child
  with the same parent relation and key. The encoded payload is exactly
  `{"target":"forge|external","parent":"<identity>","key":"<key>"}`; a forge parent is stored in its
  normalized `#<number>` form and an external identity byte for byte. A `v1` marker is **not**
  parsed: it fails closed as an unsupported version reporting `version` and `supported`, never as a
  malformed marker and never rewritten. Reads recognize the marker only in that canonical appended
  position; quoted and fenced examples are ordinary issue prose. A body with an unclosed Markdown
  fence is rejected before preview, because an appended marker would remain unreadable inside that
  fence. Explicit secret forms include AWS access-key fields, refresh tokens, private-key blocks,
  client/session credentials, Authorization Bearer/token/Basic values, and common environment
  identifiers such as `GH_TOKEN`, `NPM_TOKEN`, `DATABASE_PASSWORD`, `*_SECRET`, and `*_API_KEY`.
  Quoted values, equals assignments, indented credential blocks, and single-token colon values are
  high-confidence and fully redacted. Sentence-like prose such as `Password: require …`,
  `Secret: do not log …`, or `Token: support …` remains unchanged; other multiword colon forms are
  ambiguous and fail closed with a value-free diagnostic instead of silently deleting specification
  semantics.

Canonical decomposition state uses these dependency-free local helper operations:

- `decomposition-records-build` accepts a nonempty exact record array with
  `key`, `title`, `workflow`, `body`, `status`, and `issue`, plus the artifact language, target,
  resolved target binding, and parent. It sanitizes publishable title/body text, requires exactly
  one language-matching Recommended-workflow field equal to the record workflow, validates the
  `proposed|approved|created|missing|declined` status/issue combination, enforces unique keys and
  target-aware created issue identities, binds each exact draft with a SHA-256 `draftHash`, and
  returns one complete canonical v2 section. Insert that returned section verbatim; never handwrite
  a record marker or its visible rendering.
- `decomposition-records-parse` accepts the fresh stored parent-comment body and validates those
  v2 boundaries, safe-encoded full records, target binding, exact schema, body workflow, recomputed
  hash, and byte-for-byte visible rendering. Quoted and fenced examples are ignored. A changed
  visible title/body, encoded record, status, identity, or rendering fails closed. It reports
  whether records were found and whether any active (`proposed|approved|created|missing`) record
  keeps the issue a decomposition container.
- `decomposition-container-compare` combines that fresh comment body with the fresh normalized
  native children. It reports `containerOnly: true` for an active canonical decomposition even when
  the child list is empty, and returns safe discrepancy codes for incomplete, missing, duplicated,
  invalid-marker, detached, mismatched, or unexpected children.
- `decomposition-key-build` is the single canonical writer of the stable-key marker for both
  targets. It accepts `target`, the target-aware `parent`, the resolved forge `repository` binding
  when the parent is a URL, and the stable lowercase `key`, either flat or under `decomposition`.
  Without a `body` it returns `{ marker }`. With a `body` it first runs the same child-text
  sanitization the forge child payload applies — generation attribution is rejected and credential
  material is redacted — and then rejects an unclosed Markdown fence, a body that already carries a
  marker, and an appended marker it cannot read back, before returning
  `{ marker, body, parent, key }` with the marker as the final nonblank standalone line. Never
  handwrite that marker or concatenate it by hand: the four guards live only here. Fail-closed
  codes are `INVALID_PAYLOAD` for generation attribution in the body, an empty or whitespace-only
  body, credential material that cannot be safely redacted (`reason: unterminated-private-key`,
  `unterminated-quoted-secret`, `ambiguous-empty-secret-assignment`, `empty-secret-assignment`,
  `ambiguous-secret-assignment`, `ambiguous-colon-credential-assignment`,
  `residual-secret-assignment`, or `residual-private-key`), an unclosed fence
  (`reason: unclosed-markdown-fence`), a caller-supplied marker, an unreadable appended marker
  (`reason: unreadable-appended-decomposition-marker`), an unknown target, or an invalid key, and
  `INVALID_REFERENCE` for a parent that is not a valid identity of that target.
- `decomposition-key-parse` accepts the fresh stored child body plus the expected `target` and
  `parent` (flat or under `context`). It reports `{ found: false, key: null }` for an absent marker
  and `{ found: true, version, target, parent, key }` otherwise, with both parents normalized
  through the same target-aware rule the writer uses, so `42`, `'42'`, `'#42'`, and a
  repository-bound issue URL all compare equal while an external identity compares byte for byte.
  It fails closed with `AMBIGUOUS_TARGET` for more than one marker and `INVALID_PAYLOAD` for a
  marker that is not the final nonblank standalone line, an unsupported version (`version`,
  `supported`), a malformed or undecodable payload, an invalid schema, a target mismatch
  (`expectedTarget`, `actualTarget`), or a different parent (`expectedParent`, `actualParent`).
- `decomposition-child-workflow-parse` requires exactly one language-matching canonical
  Recommended-workflow field in a decomposed child's body, validates it against the parent record,
  and returns the stable workflow plus its `build|fix|refactor|docs` implementation route. It uses
  the Markdown inventory: blockquoted and fenced examples do not count, so an example-only body is
  rejected while one top-level field plus examples is accepted.

For a decomposition bound to GitHub, `decomposition-records-build` enforces the 65,536-byte UTF-8
comment ceiling on the generated section, and `planning-comment-build` enforces it again on the
complete stamped planning comment. The structured error reports `maximum`, `actual`, the unit, the
section/other-comment split, and per-record title/body/encoded-record contributions. This limit is
not applied to ordinary non-decomposition legacy planning comments; another provider may still
reject a smaller target-specific limit, which remains a fail-closed persistence error.

Forge identities are normalized only through the resolved host/repository and `parseReference`;
a URL from another host or repository never aliases `#N`. External tool-native identifiers and
URLs remain exact strings and are never collapsed by their trailing number. These operations are
local validation and reconciliation, not provider transport. Callers never parse marker data or
infer proposal identity from titles themselves. `planning-comment-build` also validates every
decomposition-bearing comment so a caller cannot bypass the canonical parser before persistence.

Both operations are provider-neutral at the workflow boundary. On GitHub, the helper maps child
reads to the paginated native sub-issues endpoint and creation to the provider's atomic
parent-aware create capability with the verified parent identity. The helper probes that create
capability before the first create preview or write. On Forgejo, both capabilities are false and the create operation returns
`UNSUPPORTED_CAPABILITY` before any write until a verified native operation exists. The helper
never routes `issue-sub-issue-create` through `issue-create`, never creates first and links later,
and never fabricates a checklist relation.

The normal mutation discipline applies: preview the exact redacted command and publishable child
payload, obtain the owning workflow's approval, then apply the identical operation. A command
failure during `issue-sub-issue-create`, or a successful command without a parseable same-repository
child URL, reports `mutationMayHaveSucceeded: true` and is non-retryable. The caller must read
`issue-sub-issues-read` fresh and reconcile the stable key before any later attempt. Zero matches
does not authorize a blind retry after an unknown outcome; one unique match recovers it; multiple
matches fail closed as ambiguous.

The targeted issue-comment update operation is `issue-comment-update`. Its input contains the
issue number, the positive `commentId` returned by `issue-comments-read`, the freshly computed
`expectedBodyHash` of that exact comment body, and `payload.body`. It is a mutation and therefore
uses the normal dry-run-first envelope. On apply, the helper reads the issue comments again,
requires exactly one matching comment ID, and compares its body hash before writing. A missing,
ambiguous, or changed comment fails with `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`;
the caller must not fall back to `issue-comment` and create a competing comment.

Provider mapping for `issue-comment-update` is fixed and owned by the helper:

- GitHub: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- Forgejo: `PATCH /repos/{owner}/{repo}/issues/{index}/comments/{id}`; Forgejo currently ignores
  `index`, but the adapter still supplies the freshly resolved issue number.

Both send a JSON object with the validated, attribution-free `body`. If probing reports that the
provider or installed CLI cannot execute this API operation, abort with `UNSUPPORTED_CAPABILITY`
before a write; never append a replacement planning comment.

Body writes, including `issue-comment-update`, require `expectedBodyHash` from the immediately
preceding fresh read. Preview the exact patch and command in dry-run mode, then apply with the same
payload. Zero or multiple semantic matches are structured errors; unchanged state is successful
and idempotent. The helper exposes whether provider-level conditional writes are available; the
expected-body precondition is mandatory regardless. GitHub returns the read ETag for diagnostics
but documents unsafe-method conditional requests as unsupported for these endpoints, so the
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header. The
fresh read therefore detects sequential re-entry and the per-draft child reads detect duplicates,
but neither is a cross-process lease: two simultaneous writers can still race between the final
read and PATCH/create. Fail closed on every duplicate observed before or after an uncertain result;
do not claim the client-side hash guard closes that provider TOCTOU window.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").
- **External target:** connection discovery, its four fail-closed failure classes (missing tool identifier, no connection, ambiguous connection, missing capability) and the write discipline live in the loaded "Tracker target" fragment. There is no fallback to the forge or to `local`.

## Issue implementation lifecycle

This fragment is the provider-neutral contract for an issue that is the implementation basis of
``tools/apply-issues.md`` or remote ``tools/apply-review.md``. It keeps three different facts separate:

- the tracker's native workflow state (unstarted, started, later active, or terminal);
- Effective Flow classifications such as `effective-flow-issue-done`, which means that delivery is
  secured in a pull request and does **not** mean that the tracker issue is closed; and
- the pull request's versioned lifecycle receipt, which is the durable handoff to
  `effective-flow merge-gate`.

### Started transition

After issue clarity and the workflow approval are established, but **immediately before the first
implementation delegation**, advance every implementable work item at least to started:

- on the forge, read the issue state fresh, ensure `effective-flow-issue-in-progress` exists through
  the helper's idempotent label creation, and add it idempotently;
- on an external target, use the freshly validated native state selected by
  `tracker.externalStartedState` under the loaded `tracker-target` contract.

Never move a terminal issue, reopen it, or move a later active state backwards. Already-started or
later-active issues are idempotent no-ops. Skipped, `wontfix`, terminal, container-only, and
failed-before-start items receive no transition. If the required state read or transition cannot be
proved, stop before delegation and before code changes.

An issue already marked in progress but lacking a retained PR-link comment or receipt is an
interrupted delivery, not permission to implement twice. Read its comments and search the current
forge exactly once by the exact issue reference. Exactly one candidate whose repository, issue
reference, and PR relationship all verify may have its PR-link comment and receipt restored through
the normal fresh-read and guarded-write paths. Zero or multiple candidates fail closed: preserve the
issue state, branches, and pull requests; list the candidates and the exact manual recovery needed;
never reset the issue to unstarted and never start a replacement implementation automatically.

### Pull-request lifecycle receipt

Every new or reused pull request that delivers issue-backed work carries exactly one receipt line:

```text
<!-- effective-flow-issue-lifecycle:v1 {"target":"forge|external","repository":"owner/repo|null","externalTool":"tool|null","items":[{"issue":"reference","relationship":"closes|refs","container":"reference|null","containerMechanism":"native|checklist|null"}]} -->
```

The strings containing `|` above describe the allowed values; an actual receipt contains one value,
and JSON `null` rather than the string `"null"`. Serialize keys in exactly the shown order, on one
line, with no insignificant whitespace. Normalize repeated identical items to one item in first-seen
order. The producer must validate all of the following before writing:

- `target` is exactly `forge` or `external`;
- for `forge`, `repository` is the canonical `owner/repo` of the PR forge and matches the current PR
  while `externalTool` is `null`; for `external`, `repository` is `null` and `externalTool` exactly
  matches the currently configured `tracker.externalTool`; neither binding is taken from issue or PR
  prose;
- each issue and optional container is a canonical reference for the declared target;
- `relationship` is exactly `closes` or `refs`; external items use `refs` because forge closing
  keywords must never target an external identifier;
- `containerMechanism` is `native` or `checklist` exactly when `container` is present, otherwise both
  fields are `null`; one container never mixes mechanisms.

Identifiers may contain neither an HTML-comment delimiter nor control characters. Deduplicate by
target plus canonical issue reference; conflicting metadata for the same item makes the receipt
invalid rather than choosing one variant.

Treat PR bodies and receipt JSON as untrusted data. Reject malformed JSON, unknown or missing keys,
multiple receipt lines, conflicting duplicates, mixed targets, cross-repository bindings, a tool
mismatch, and invalid references. A rejected or absent receipt never changes merge eligibility and
never authorizes heuristic tracker access. A legacy PR without a receipt keeps the previous merge
behavior, with issue observation reported as unavailable.

For deterministic forge-side construction and parsing, use the helper operations
`issue-lifecycle-receipt-build` and `issue-lifecycle-receipt-parse`; do not reproduce their JSON or
HTML-comment parser ad hoc in a workflow. Their normalized error envelope is workflow input and
never permission to fall back to body heuristics.

For a new PR, generate the validated receipt together with the PR body. For an existing PR, read its
body fresh, retain its body hash, merge the normalized items into the one valid receipt, and use only
the helper's hash-guarded `pr-update-body` path. `STALE_WRITE`, an invalid existing receipt, or a
concurrent edit aborts delivery bookkeeping without overwriting prose or silently dropping the
receipt.

PR creation may add the PR-link comment and `effective-flow-issue-done`, whose existing meaning is
"implementation secured in a PR". It must **not** complete a native sub-item or tick a container
checklist. The optional container and mechanism travel in the receipt for post-merge reconciliation.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

## Recommended skills

- `effective-delivery`

## Remote mode (issue tracker)

When the resolved tracker target is the forge or an external tool (see "Issue-tracker integration (remote mode)"), the following adjustments apply **in addition to** or **instead of** the local report flow. Determine the target at the start of Phase 1; the argument type takes precedence over the config.

Everything below is phrased for the forge target and applies unchanged to an external target, with the resolved connection taking the place of the helper: read epic and finding issues, comments, and classification values through it, and perform every mutation under the write discipline, classification mapping, and container mechanism of the loaded `tracker-target` contract. Determine the tracker target — not only the mode — at the start of Phase 1, name it in the summary, and abort fail-closed instead of publishing to a different target than the one resolved.

### Argument detection and mode determination

Classify the passed argument via the "apply-source detection" (stage A and — for issue references — stage B) and derive mode and sub-mode from the source type:

- **`review-report`** (report file under `.effective-flow/review/`) → `local` (existing behavior, unchanged).
- **`review-epic`** (issue with `effective-flow-review-epic` label, legacy `firmo-review-epic` equivalent) → `remote`, **epic mode**: work through all finding issues linked in the epic.
- **`review-finding`** (a single finding issue or a list of finding-issue references) → `remote`, **issue-list mode**: work through exactly these findings only. The corresponding epic per finding is retained from the sub-issue (`Epic` field/reference), if present, for the lifecycle receipt and post-merge reconciliation.
- **`remote` without argument** → list open epics and let the user choose.
- **`plan`, `container-issue` or `plain-issue`** → does not belong to ``tools/apply-review.md``: point to the responsible skill (``tools/apply-plan.md`` for plan files, ``tools/apply-issues.md`` for other issues, or `effective-flow apply` for automatic routing) and end. When delegating from `effective-flow apply` this case should not occur; the switch remains as a safeguard.

The argument type takes precedence over the config (see "Determine mode" in the tracker integration): `review-report` forces `local`, and `review-epic`/`review-finding` force the tracker target that reference belongs to — the forge for a forge reference, `external` for a tool-native one. On the forge target, detect host and CLI beforehand and check CLI availability; if the CLI is missing, abort clearly (no silent fallback to `local`). On an external target, establish the single connection and verify its base capabilities beforehand instead; a missing, ambiguous, or under-capable connection aborts just as clearly, again without falling back to `local` or to the forge. Settle the container mechanism in that same step: select a native relation only when the connection proves it can write a sub-item's completion state; otherwise select the checklist fallback. Defer its completion write until after merge. Require state-list and transition capabilities only for implementable findings immediately before their started transition; `wontfix`, container-only, and publication paths do not inherit them.

### Phase 1 remote: Read findings from issues

Replaces reading the report file. Determine the finding issues to work through (parse the epic task list or use the passed list). Read for each finding issue the full body **and the comments fresh from the tracker** ("read comments" operation) and classify:

Resolve `language.forge` once for newly authored issue comments and checklist prose, while
preserving clearly established existing thread/body language. Resolve `language.git` once for
all commits and Conventional Commit PR titles. Pass both concrete values to delegated workflows;
stable labels, IDs, action values, references, and markers are never translated.

- **Target PR present:** if the body or a non-Effective Flow comment names a target PR
  (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), note the PR number, URL,
  head branch and base branch of the PR. A target PR overrides the
  default strategy "one PR per finding" for this finding.
- **Label `wontfix`** → do not implement, create an ADR (Phase 3 remote).
- **already checked off/closed** → skip.
- **Sub-issue without target action or prompt** (manually altered) → report as not implementable, do not guess.
- **Developer comment (non-Effective Flow) present** → implement **with context**: pass the comment text as additional context to the delegation skill. This is the remote equivalent of the local "developer note" in the "Implement with context" case. Deliberate rejection in remote mode still runs **exclusively** via the label `wontfix`, not via comment text; Effective Flow comments (e.g. `<!-- … -->`-marked status or PR-link comments) do not count as a developer note.
- **otherwise** → implement.

Create the per-finding tasks as in local mode; the finding ID is the `R-XXXXXXX` ID from the issue title.

### Phase 2 remote: Commit and PR strategy

In remote mode the commit/PR strategy is by default **"one PR per finding"** — the local commit-strategy question is omitted. Every implementable finding without a target PR is its **own component** in its own delivery branch, preferably with worktree isolation. Base branch and branch naming rely on the `delivery` config block: branch `<delivery.branchPrefix>/apply-review/<R-ID-or-slug>` off `delivery.baseBranch` (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values). File-overlapping findings run sequentially to avoid working-tree conflicts.

If a finding has a target PR from Phase 1 remote, **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the finding there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the finding as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Findings with the same target PR run sequentially so that new commits are created in order on the same PR branch. Findings without a target PR keep the default strategy "one PR per finding". The stash policy is handled as in local mode.

### Phase 3 remote: Rejected finding → decision candidate

For each `wontfix` finding, the same ownership rule as in Phase 3 (local) applies: delegate the candidate to `effective-product` (the skill decides whether an ADR is justified and authors it per the discovered repo convention; minimal living-slug fallback from `adr-convention.md` if the skill is missing). The candidate's context here references the **issue number and epic** (`Issue #<nr>` and `Epic #<nr>`) instead of a report finding; the `wontfix` rationale replaces the developer note. The ADR file name follows the convention resolved by `project-adr-convention`, not a form this workflow assumes. If a permanent ADR arises, mark the finding in the epic later via slug reference as `- [x] … — not implemented (ADR: <slug>)`; if the skill classifies the rejection as non-permanent, it stays documented without an ADR on the issue/epic (`- [x] … — not implemented (see issue rationale)`).

### Phase 4 remote: Implementation, PR and deferred epic completion

Per implementable finding, in its verified execution root:

1. Immediately before the first implementation delegation, transition the finding at least to
   started under "Issue implementation lifecycle": add `effective-flow-issue-in-progress` on the
   forge, or freshly validate and apply `tracker.externalStartedState` on an external target. A
   terminal finding is skipped and a later-active finding is preserved. Missing, stale, ambiguous,
   or unavailable lifecycle capabilities stop before code. An already-started finding without
   delivery bookkeeping enters the one-search fail-closed recovery and is never reimplemented on
   zero or multiple matches.
2. Pre-analysis and implementation as in Phase 4.1/4.3 via the matching delegation skill
   (`effective-flow fix`, `effective-flow refactor`, `effective-flow build`, `effective-flow docs`). Pass a
   developer comment detected in Phase 1 remote as additional context, together with the
   delegated workflow's absolute execution root and receipt. Do not rely on inherited CWD or
   nest an Effective Flow worktree around a reused harness-native one.
3. Commit the changes (Conventional Commit message, no internal finding IDs, no `Co-Authored-By`), push the branch.
4. If a target PR is present: **do not create a new PR**, but use the existing PR link and extend its
   body only through a fresh body read plus hash-guarded `pr-update-body`. If no target PR is present:
   create exactly one PR against the base branch via `effective-flow pr`. Choose the reference form by
   tracker target: `Closes #<sub-issue>` or `Refs #<sub-issue>` on the forge, and a plain non-closing
   reference on external. Add exactly one validated versioned lifecycle receipt carrying the issue,
   relationship, and optional epic/mechanism. Reject malformed, duplicate, mismatched, or stale
   receipt state rather than overwriting body prose or dropping the handoff.
5. **Immediately after a successful push or PR creation**, optionally write the PR link through the
   helper's comment payload/mutation, or through the external connection's create-comment
   capability. Do **not** set a native sub-item to done or tick an epic checklist. The receipt retains
   that relationship, and `effective-flow merge-gate` completes it only after merge and freshly observed
   terminal issue state. Never mix native and checklist mechanisms. The pull request stays on the
   forge behind `origin`.

6. **If transition, push, PR creation, or receipt persistence fails**: mark the finding as failed, do
   not complete the epic, preserve any started state, and continue with the next finding.
7. **If an assigned epic is missing** (issue-list mode): implement the finding anyway and create a PR; container reconciliation is omitted and reported to the user.

This path creates its pull requests without the delivery completion action, so it invokes the
automatic review itself: after step 3 created a pull request, run "PR review publication" with that
pull request, whether the run is gated or a non-interactive delegation, and the residual finding set the
delegated workflow reported — or its explicit declaration that it has none.
Because this path creates one pull request per finding, ask the gated question only for the first
pull request and reuse that answer for every further pull request of this run — deliberately unlike
the security disclosure gate, whose offer is per run and never remembered, because this question
governs comment noise rather than disclosure.

**Load on demand:** Read `shared/pr-review-integration.md`, when the completion action created or reused a pull request and the automatic PR review may run.

### Phase 5 remote: Tracking surface instead of report

No report file is updated. Ensure comments and classifications reflect delivery, but keep an
implemented finding's epic checkbox or native sub-item incomplete until merge reconciliation.
`wontfix` findings keep their existing decision path: permanent decision → checked off with ADR
reference; non-permanent decision → checked off with the issue rationale.

### Phase 7/8 remote

Final validation and summary as in local mode; the summary additionally names the resolved tracker target (with the tool identifier and connection for `external`), the container mechanism used, the epic URL or identifier, the created PRs, and the findings retained for post-merge reconciliation.
