# Planning gateway for non-empty arguments

Run this gateway before plan inventory, legacy migration, follow-up questions, skill discovery, or
local artifact creation:

## Apply source detection

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

This shared building block is the single source of truth for **which
apply source type** a given argument is. It is used by `effective-flow apply`
(router) as well as by ``tools/apply-plan.md``, ``tools/apply-review.md``, and
``tools/apply-issues.md`` for the upstream argument classification. `effective-flow plan` uses only
Stage A as a planning gateway: it delegates an unambiguous `issue-reference` to
`effective-flow plan-issue` and never performs Stage B itself.

The building block only classifies and resolves the reference to a handle (file path or
issue number(s)). It makes **no** implementation decision, changes nothing, and
does not read findings/container contents deeper than necessary for classification. The
type-specific depth logic (plan status, finding parsing, container expansion) stays
in the respective skill.

Before report-source resolution, establish and verify the execution-location receipt's
`RUNTIME_STATE_ROOT` from the first porcelain worktree record. This is required even when
classification starts in a linked or native worktree and even when Stage A remains otherwise
read-only. If the main record is bare, missing, moved, unusable, or belongs to another Git common
directory, abort classification without falling back to `EXECUTION_ROOT`.

### Canonical source types

| Type              | Meaning                                                                                                       | Responsible skill                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `plan`            | plan file under `<plan.dir>/`                                                                                 | ``tools/apply-plan.md``                        |
| `review-report`   | review report file under `.effective-flow/review/`                                                            | ``tools/apply-review.md`` (local)              |
| `review-epic`     | tracking/epic issue of a `effective-flow review` run                                                               | ``tools/apply-review.md`` (remote, epic)       |
| `review-finding`  | single finding issue of a `effective-flow review` run                                                              | ``tools/apply-review.md`` (remote, issue list) |
| `container-issue` | generic issue with a sub-issue checklist, without a review label (`effective-flow-review-*`/`firmo-review-*`) | ``tools/apply-issues.md``                      |
| `plain-issue`     | freely written human issue                                                                                    | ``tools/apply-issues.md``                      |

Special results: `none` (empty/no argument) and `ambiguous` (not uniquely
resolvable). `issue-reference` is an **intermediate result** from stage A for an issue reference
not yet resolved into its subtype; stage B refines it.

### Stage A: syntactic classification (file system only)

Stage A needs no tracker I/O and is available to every skill. Determine the
type in this order (first matching rule wins):

1. **Empty/no argument** → `none`.
2. **Plan reference** → `plan`, if the argument resolves to exactly one file under
   `<plan.dir>/` or `<plan.dir>/archive/`. Permitted forms as in
   `plan-reference-routing`: full path (`<plan.dir>/YYYY-MM-DD-…md`),
   date-slug file name (`YYYY-MM-DD-…md`), legacy number without path (`NNNN`, resolved primarily
   via the H1) or — as a fallback — the title slug.
3. **Review report** → `review-report`, if the argument resolves to exactly one `*.md` file
   below absolute `<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Resolve a filename-only
   argument directly below that directory; resolve a project-relative
   `.effective-flow/review/...` argument against `RUNTIME_STATE_ROOT`; accept an absolute path
   only when it is contained there. Physically canonicalize existing paths. For a prospective
   path, canonicalize the nearest existing ancestor before appending validated missing segments.
   Reject `..`, aliases, a symlink escape, and every path outside the directory. Retain the
   resulting absolute report handle and pass it unchanged to the responsible skill.
4. **Issue reference** → `issue-reference` (continue with stage B), when the argument is an issue
   reference of the resolved tracker target. On the forge target that is what the remote helper's
   reference parser accepts: a bare issue number (`123`), `#123`, or a host-neutral issue URL for
   the current repository. On an external target it is a tool-native identifier (e.g. `ABC-123`)
   or a URL of the configured tool; a bare non-four-digit number is genuinely ambiguous there
   (leftover forge issue or tool shorthand) and is asked about instead of guessed. Multiple
   references are parsed as one list and classified individually in stage B; malformed or
   cross-repository references remain structured errors instead of heuristic matches.
5. **Otherwise** → `ambiguous`: the argument resolves to no category or matches
   both a plan **and** a review file at the same time. Do not guess — the caller
   asks (see "Ambiguity and fallbacks").

Distinguishing plan vs. report: primarily via the directory (`<plan.dir>/` or
`<plan.dir>/archive/` vs. `.effective-flow/review/`), secondarily via the header content
(plan status marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]` finding blocks). A four-digit number without a path is always a
(legacy) plan reference, never an issue reference.

### Stage B: issue subtype (tracker)

Stage B refines an `issue-reference` from stage A into the concrete subtype. It requires the
resolved tracker target from "Tracker target" in `issue-tracker.md` together with its established
access — the host/CLI detection and availability check of the "Remote helper contract" on the forge
target, or the single established connection of the `tracker-target` contract on an external
target; a skill that uses stage B therefore also embeds `issue-tracker.md`.
``tools/apply-plan.md`` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read classification values, body, and comments **once fresh** from the tracker and
determine the subtype in this precedence — **classification before body structure**. Select the
newest comment that begins with `<!-- effective-flow-plan-issues -->` (or the one-generation legacy
marker) exactly as `effective-flow plan-issue` does; a quoted or embedded marker is not canonical. Parse
its decomposition records through `decomposition-records-parse`, never with ad hoc prose or JSON
matching.

On the forge target, obtain native-child evidence only through the helper operation
`issue-sub-issues-read` with the candidate issue as `parent`. GitHub's normalized result is the
authoritative native-child list. `UNSUPPORTED_CAPABILITY` on Forgejo means that this provider has no
usable native-containment signal and classification continues from labels and body structure; any
other read error stops classification instead of guessing. On an external target, use only the
resolved connection's proven native-child listing capability. For a found active canonical
decomposition, pass that comment and the fresh normalized child list to
`decomposition-container-compare`. Such a parent is a `container-issue` even when the native list
is empty; retain its integrity result for ``tools/apply-issues.md``. A malformed canonical
decomposition marker is likewise retained as an integrity-blocked container instead of being
downgraded to a plain issue. An all-`declined` record set is inactive and does not by itself make a
container. Never infer containment from issue prose, a matching title, or an unverified provider
feature.

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but an active canonical decomposition exists, the body contains a sub-issue checklist
   (`- [ ] <reference> …` / `- [x] <reference> …`, where `<reference>` is a forge `#NNN` or a
   tool-native identifier such as `ABC-123`), or the issue has native sub-items on a target that
   models containment natively → `container-issue`.
4. otherwise → `plain-issue`.

The checklist form is reference-agnostic on purpose: an external target without a native
parent/sub-issue relation carries exactly this checklist as the contract's fallback container, so a
`#NNN`-only pattern would fail to re-detect a container Effective Flow itself created.

On an external target the canonical label strings are read from whichever classification primitive
that target uses (see the `tracker-target` classification mapping); the `firmo-` variants are forge
history and are not looked up there.

Secondary signal when a label is missing (e.g. removed manually): a title in the format
`[R-XXXXXXX] …` together with a helper-parsed `Signature` field (legacy `Signatur` accepted on
read) is treated like `review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

Why label before body: a `review-epic` carries — like a generic
`container-issue` — a `- [ ] <reference>` checklist. The label `effective-flow-review-epic` or
`effective-flow-review-finding` (old prefix `firmo-` equivalent, see "Label convention" in
`issue-tracker.md`) is the reliable discriminator and takes precedence over the
body structure.

### Ownership and target

From the final source type follows exactly one responsible skill and — for
``tools/apply-review.md`` — the flow:

| Source type       | Responsible skill        | Target / note                                    |
| ----------------- | ------------------------ | ------------------------------------------------ |
| `plan`            | ``tools/apply-plan.md``   | –                                                |
| `review-report`   | ``tools/apply-review.md`` | `local` target, report flow                      |
| `review-epic`     | ``tools/apply-review.md`` | tracker target of the reference, epic mode       |
| `review-finding`  | ``tools/apply-review.md`` | tracker target of the reference, issue-list mode |
| `container-issue` | ``tools/apply-issues.md`` | container expansion in the skill                 |
| `plain-issue`     | ``tools/apply-issues.md`` | single work item                                 |

"Not `local`" never means "the forge" here: an epic or finding reference of an external tool
selects that tool, and the tracker-bound flow runs against it.

Consistency with `issue-tracker.md`: the rule there, "argument type overrides the
config mode", stays valid — a `review-report` forces `local`, a
`review-epic`/`review-finding` forces the tracker target the reference belongs to (the forge for a
forge reference, `external` for a tool-native one). This building block delivers exactly that
argument type; report which target the argument selected.

### Ambiguity and fallbacks

- **`none` (no argument):** do not heuristically pick the "newest". The caller
  lists local candidates (open plans from `<plan.dir>/`, report files under the absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory) and asks for the specific source. If the resolved
  tracker target is the forge or an external tool, it additionally lists open review epics (label
  `effective-flow-review-epic`, incl. old `firmo-review-epic`, or the target's equivalent
  container) as candidates, since on those targets no local report files exist.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask. A list that mixes a forge reference
  with an external-target reference is never resolved heuristically either: ask the user to split
  the call by tracker target.
- **Issue reference, but the target is unreachable** (forge CLI missing or not authenticated, or
  no usable external connection): stage B cannot run → clear error message with a remediation hint
  per "Errors and edge cases" in `issue-tracker.md`; no silent fallback to a local type and none to
  another target.
- **Unresolvable path:** `ambiguous` → ask or error message; note that
  `effective-flow open-plans` can list open plans.

### Use by the skills

- **Router (`effective-flow apply`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument plus the retained runtime root and, for a local report, its absolute report
  handle. On `none`/`ambiguous`/mixed list: ask.
- **Planning gateway (`effective-flow plan`):** after read-only configuration resolution has supplied
  `<plan.dir>`, runs Stage A only when an argument exists. On `issue-reference`, it passes the
  complete original argument unchanged to `effective-flow plan-issue` and ends before plan inventory,
  migration, questions, or artifact creation. Every other result stays in the existing local plan
  workflow. A bare four-digit value therefore keeps the legacy-plan precedence and is not routed
  as an issue.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `effective-flow apply`) and end.
  - **Delegation from `effective-flow apply`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.

1. Read the project-setup ADR through the shared configuration resolver and determine the concrete
   `<plan.dir>` without changing configuration or runtime state.
2. Use the included source-detection contract and execute **Stage A only** with the resolved
   `<plan.dir>`. Preserve its precedence exactly: in particular, a bare four-digit value is a legacy
   plan reference, never an issue reference.
3. If Stage A returns `issue-reference`, delegate to `effective-flow plan-issue` with the complete
   original argument unchanged, including a list of multiple references, and end the local
   `effective-flow plan` workflow immediately. Do not inspect tracker state, create or migrate a plan
   file, or perform any other write before the handoff. `plan-issue` owns all fresh tracker reads
   and decides whether each issue needs initial planning, an update, or a resumed review. Any later
   native-child decision is based on `issue-sub-issues-read` (or the external connection's proven
   equivalent), never on this Stage-A gateway or a checklist inference.
4. For `none`, `plan`, `review-report`, or `ambiguous`, do not infer an issue. Return the complete
   argument to the existing local planning workflow. Natural-language requirement text therefore
   retains the existing local-plan behavior.
