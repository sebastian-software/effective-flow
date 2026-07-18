## Apply source detection

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

This shared building block is the single source of truth for **which
apply source type** a given argument is. It is used by `{{SKILL:apply}}`
(router) as well as by `{{SKILL:apply-plan}}`, `{{SKILL:apply-review}}`, and
`{{SKILL:apply-issues}}` for the upstream argument classification.

The building block only classifies and resolves the reference to a handle (file path or
issue number(s)). It makes **no** implementation decision, changes nothing, and
does not read findings/container contents deeper than necessary for classification. The
type-specific depth logic (plan status, finding parsing, container expansion) stays
in the respective skill.

### Canonical source types

| Type              | Meaning                                                                                                       | Responsible skill                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `plan`            | plan file under `<plan.dir>/`                                                                                 | `{{SKILL:apply-plan}}`                        |
| `review-report`   | review report file under `.effective-flow/review/`                                                            | `{{SKILL:apply-review}}` (local)              |
| `review-epic`     | tracking/epic issue of a `{{SKILL:review}}` run                                                               | `{{SKILL:apply-review}}` (remote, epic)       |
| `review-finding`  | single finding issue of a `{{SKILL:review}}` run                                                              | `{{SKILL:apply-review}}` (remote, issue list) |
| `container-issue` | generic issue with a sub-issue checklist, without a review label (`effective-flow-review-*`/`firmo-review-*`) | `{{SKILL:apply-issues}}`                      |
| `plain-issue`     | freely written human issue                                                                                    | `{{SKILL:apply-issues}}`                      |

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
3. **Review report** → `review-report`, if the argument is a `*.md` path under
   `.effective-flow/review/` (or a file name that resolves there).
4. **Issue reference** → `issue-reference` (continue with stage B), if the argument is a
   bare issue number (`123`), a `#123`, or an issue URL. Issue URLs are
   host-neutral: recognize `https://<host>/<owner>/<repo>/issues/<nr>` and comparable
   Forgejo/Gitea URL forms just like GitHub URLs. Multiple such references are
   treated as a list and classified individually in stage B.
5. **Otherwise** → `ambiguous`: the argument resolves to no category or matches
   both a plan **and** a review file at the same time. Do not guess — the caller
   asks (see "Ambiguity and fallbacks").

Distinguishing plan vs. report: primarily via the directory (`<plan.dir>/` or
`<plan.dir>/archive/` vs. `.effective-flow/review/`), secondarily via the header content
(plan status marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]` finding blocks). A four-digit number without a path is always a
(legacy) plan reference, never an issue reference.

### Stage B: issue subtype (tracker)

Stage B refines an `issue-reference` from stage A into the concrete subtype. It
requires the host/CLI detection and availability check from `issue-tracker.md`;
a skill that uses stage B therefore also embeds `issue-tracker.md`.
`{{SKILL:apply-plan}}` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read labels and body **once fresh** from the tracker and determine the subtype in
this precedence — **label before body structure**:

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but the body contains a sub-issue checklist
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. otherwise → `plain-issue`.

Secondary signal when a label is missing (e.g. removed manually): a title in the format
`[R-XXXXXXX] …` together with a `**Signature**` field in the body is treated like
`review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

Why label before body: a `review-epic` carries — like a generic
`container-issue` — a `- [ ] #NNN` checklist. The label `effective-flow-review-epic` or
`effective-flow-review-finding` (old prefix `firmo-` equivalent, see "Label convention" in
`issue-tracker.md`) is the reliable discriminator and takes precedence over the
body structure.

### Ownership and mode

From the final source type follows exactly one responsible skill and — for
`{{SKILL:apply-review}}` — the mode:

| Source type       | Responsible skill        | Mode / note                      |
| ----------------- | ------------------------ | -------------------------------- |
| `plan`            | `{{SKILL:apply-plan}}`   | –                                |
| `review-report`   | `{{SKILL:apply-review}}` | local report flow                |
| `review-epic`     | `{{SKILL:apply-review}}` | remote mode, epic mode           |
| `review-finding`  | `{{SKILL:apply-review}}` | remote mode, issue-list mode     |
| `container-issue` | `{{SKILL:apply-issues}}` | container expansion in the skill |
| `plain-issue`     | `{{SKILL:apply-issues}}` | single work item                 |

Consistency with `issue-tracker.md`: the rule there, "argument type overrides the
config mode", stays valid — a `review-report` forces `local`, a
`review-epic`/`review-finding` forces `remote`. This building block delivers exactly that
argument type.

### Ambiguity and fallbacks

- **`none` (no argument):** do not heuristically pick the "newest". The caller
  lists local candidates (open plans from `<plan.dir>/`, report files under
  `.effective-flow/review/`) and asks for the specific source. If the effective
  tracker mode is `remote`, it additionally lists open review epics (label
  `effective-flow-review-epic`, incl. old `firmo-review-epic`) as candidates, since in
  remote mode no local report files exist.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask.
- **Issue reference, but tracker CLI missing/not authenticated:** stage B cannot
  run → clear error message with a remediation hint per "Errors and edge cases" in
  `issue-tracker.md`; no silent fallback to a local type.
- **Unresolvable path:** `ambiguous` → ask or error message; note that
  `{{SKILL:open-plans}}` can list open plans.

### Use by the skills

- **Router (`{{SKILL:apply}}`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument. On `none`/`ambiguous`/mixed list: ask.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `{{SKILL:apply}}`) and end.
  - **Delegation from `{{SKILL:apply}}`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.
