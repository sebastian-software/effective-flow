## PR review publication

This shared building block publishes Effective Flow's own review findings onto an existing pull
request. Both entry points use it: the explicit `{{SKILL:review}} <PR>` invocation and the automatic
step that runs after a delivery created a pull request. It owns **which** findings are published,
which gates run first and in what order, the judgment handoff to `effective-delivery`, the
trigger, and the idempotency key.

Three of its four call sites — the delivery completion action, `{{SKILL:apply-issues}}`, and
`{{SKILL:apply-review-remote}}` — carry neither the PR plumbing nor the security gate in their own
context. This fragment therefore loads both itself instead of assuming a host supplied them:

```include
pr-review-comments
```

```include
pr-review-thread-writes
```

```include
security-disclosure-gate
```

The loaded "PR review comment integration" owns PR resolution, the fresh thread and comment reads,
the review submission with its marker and its provider fallbacks, the summary comment, the
`language.forge` rule, and the "No AI attribution" rule — and through it the host detection, CLI
probing, envelope, dry-run, redaction, and error contract of the "Remote helper contract" in
`issue-tracker.md`. The loaded "Security disclosure gate" owns the security classification, the
local-first persistence, and the per-run publication offer. None of that is restated here. Pull
requests stay on the forge behind `origin` regardless of `tracker.mode`.

### Inputs

The caller supplies a **resolved pull request** (number, head ref, base ref, URL, state), its **run
state** — gated or non-interactive delegation — and exactly one of these three **input states**:

- **`finding-set`** — the caller's residual findings: what survived its own correction rounds, not
  its full finding history. Publish the survivors of the handoff and the gates below.
- **`reviewed-empty`** — the caller reviewed and nothing survived. Publish nothing and do **not**
  fall back to a fresh review; an empty result is a result, not a missing input.
- **`no-review-capability`** — the caller has no reviewer phase that could produce such a set. This
  fragment reviews the pull request itself and then publishes.

Resolve the state from the caller's declaration, not from the size of the set it handed over: an
**empty** set from a review that did run is `reviewed-empty`, while a declaration that the workflow
supplies **no complete finding set** is `no-review-capability`. `{{SKILL:fix}}` and `{{SKILL:docs}}`
make that declaration deliberately — `fix` routes only `{{AGENT:generic-product-reviewer}}` for
degraded buckets, so its specialist buckets carry no reviewer findings, and `docs` has no review
phase at all. The three state names are stable identifiers and are never translated.

A merged or closed pull request, or one belonging to another repository, is reported read-only; no
comment is written.

### Rooted ref reads

Resolve all reviewed content from explicit refs, run from `RUNTIME_STATE_ROOT` — the verified main
checkout of the execution-location receipt — and never from `EXECUTION_ROOT` and never from a
working tree:

- `git diff <base>...<head>` for the change set, `--name-only` for the file list;
- `git show <head>:<path>` for file content.

By the time the automatic trigger fires, the delivery contract has already **withdrawn an Effective
Flow-owned worktree** in its step 4, so `EXECUTION_ROOT` may no longer exist at all, and its step 6
**restores the checkout** to the base branch, so working-tree content would be base-branch content.
The retained delivery branch stays in the main checkout, so `RUNTIME_STATE_ROOT` resolves both refs.
If a ref does not resolve there, report that and publish nothing rather than reading a different
tree.

### Reviewing the pull request (`no-review-capability` only)

This is the only input state in which this fragment starts reviewers. Both callers that reach it
already carry the project-routing contract: partition the pull request's changed files with that
ordered routing table and start, in parallel, the reviewer the table assigns to each non-empty
bucket, with the file content resolved through the rooted `git show` reads above. The resulting
findings then enter the same pipeline as a `finding-set` — same handoff, same gates, same
publication — and the scope rule below applies to them too.

### Order of operations

Regardless of entry point, run exactly this order and publish nothing before it completes:

1. **Finding scope.** Apply `{{SKILL:review}}`'s active finding scope — critical and important by
   default — to the incoming set. This binds every entry point: `{{SKILL:build}}`,
   `{{SKILL:refactor}}`, and `{{SKILL:maintain}}` deliberately collect **all** severities including
   notes for their internal correction rounds, and that deeper set must not reach a public pull
   request unmodified. Mention the notes this filter removes in the run summary, never on the pull
   request.
2. **Judgment handoff** to `effective-delivery`.
3. **Design-decision filter** — a finding covered by a documented design decision is not published.
   Which side runs it depends on the caller, so the caller declares it: `{{SKILL:review}}` filters
   centrally in its Phase 3 and hands over an already-filtered set. `{{SKILL:build}}`,
   `{{SKILL:refactor}}`, and `{{SKILL:maintain}}` run **no** such filter in their review phases, so
   for their sets this fragment performs the filter itself before publishing — search the ADR
   directories, the plan directory, and the repository convention files for documented decisions and
   drop every finding one of them covers, recording the source reference in the run summary. Do not
   assume `{{SKILL:review}}` Phase 3 is loaded here; at the automatic call sites it is not.
4. **Security classification and the loaded "Security disclosure gate".**
5. **Publication.**

### Judgment handoff to effective-delivery

`effective-delivery` is the declared domain owner for PR-level review-item judgment. Pack each
finding as a Mode C item with its stable ID, its location, and surrounding-code evidence resolved
from the refs above. Supply the caller constraints: Effective Flow owns authority, approval,
publication, and delivery; the analysis performs no discovery, implementation, Git, CI, or forge
action and may only classify the supplied context.

Consume the returned `pr-review-handoff/v1` object and require exactly one returned item per
supplied ID. Map its classifications:

- `valid_in_scope` + `caller_fix` → earns a comment on this pull request.
- `valid_out_of_scope` → a noted follow-up in the run summary, never a comment.
- `unsupported` → a rejected false positive; record the returned rationale and publish nothing.
- `question_or_information` → reported to the user, never posted as a defect.
- `needs_evidence` → dropped, with the exact missing proof recorded.

**These five are `effective-delivery`'s judgment vocabulary, and no workflow returns them as an
outcome.** They sit **behind** the outcome vocabularies of the workflows that consume this handoff
– `unsupported` is where `{{SKILL:iterate}}`'s `skipped` is produced, for one – so a caller that
consumes a per-item outcome from a delegated run reads that run's own closed vocabulary instead,
never these values. Keeping the two apart is what stops a third set from being mistaken for the
agreed one.

**The "exactly one returned item per supplied ID" requirement above is a sibling of the same
requirement on a workflow handoff, not the same contract.** This one binds a skill's analysis handoff,
where the caller holds both ends within a single run. The one on the `{{SKILL:merge-gate}}` →
`{{SKILL:iterate}}` channel binds a workflow handoff whose key set the caller pre-commits before
delegating, and whose receiver counts an outcome only for a key it recorded; that contract lives in
those two tools and is not restated here.

If `effective-delivery` is unavailable (not installed, `skills.enabled: false`, excluded), publish
the findings that survive the remaining steps and disclose that the PR-level judgment was
unavailable. Never invent the missing classification.

### Security binding

Step 4 runs the loaded "Security disclosure gate" on every finding still standing. A finding set
that arrives **without a recorded security classification** is classified there before anything is
published: `build`, `refactor`, and `maintain` hand over residual findings that never passed through
that classification, and an unclassified finding is never treated as publishable. A finding that
already carries a recorded class from the caller's own aggregation keeps it and is not re-derived.

A `local-only` finding reaches a pull request only after the gate's explicit per-run confirmation,
and **no configuration key changes that** — `delivery.prReview` included. Withheld findings stay in
the local security report, and nothing published here carries a count, title, signature, or ID of a
withheld finding.

### Publication

The loaded "Submit a review with inline comments" performs the submission; this fragment decides its
content. The helper's payload builder stamps the marker — never hand-write it.

- Each inline comment is anchored to the finding's `file:line` **inside the diff**.
- A finding on a line **outside the diff** cannot be anchored onto a wrong line. It does not go into
  the review body either: the idempotency check below reads the review threads and the pull-request
  comments and nothing else, so a finding parked in a review body would be invisible to it and
  republished on every rerun. The ground is that **scope**, not a missing capability — the review
  body is readable, through the plumbing's review read — and the conclusion is unchanged: widening
  the check to a third surface buys nothing that publishing on a surface it already reads does not. Publish those findings as one additional marked pull-request comment instead, built through
  the loaded `pr-review-comment-build` operation, under a clearly labelled section. The review body
  stays human-facing prose and carries no idempotency key.
- **Every published finding, inline or outside the diff, carries its key.** Below the stamped
  marker, its body holds the finding's stable ID, its severity, its problem and recommendation
  prose, and — as its last line — the idempotency key in the canonical finding-issue form of
  `issue-tracker.md`:
  `- **Signature**: <path:line> · <Area> · <short summary of the problem>`. A finding published
  without that line cannot be recognized next run and is posted a second time.
- **Empty result:** on the explicit `{{SKILL:review}} <PR>` entry point, publish one short summary
  anyway so the reviewed state is visible; on the automatic trigger, publish nothing and report the
  clean result in chat instead. A submission with no inline comment at all — also the case when every
  survivor lies outside the diff — stays a review submission with an empty comment array; the loaded
  plumbing requires a review body and accepts the comment array as optional, so no separate
  publication path is needed for it.

### Idempotency

Read **fresh before every write**, and read both surfaces this fragment publishes to: the inline
review threads and the ordinary pull-request comments. Together they cover every published finding,
because outside-diff findings are published as a marked pull-request comment rather than in the
review body — this check reads those two surfaces only, so a finding in a review body would silently
escape it.

Parse the `Signature` lines of the marked results with the helper's `signature-parse` operation and
compare the normalized values it returns; never hand-roll the normalization. A finding whose
normalized signature already appears under this fragment's marker is not published again. No new
persistence is introduced — the pull request itself is the state.

### Automatic trigger after delivery

Governed by the configuration key `delivery.prReview` with the values `ask` (default), `always`, and
`off`:

- `always` — publish after PR creation without asking, in every run state.
- `off` — no automatic publication. This disables the automatic trigger only; an explicit
  `{{SKILL:review}} <PR>` invocation is never affected.
- `ask` — resolved by the run state:
  - **gated** — ask exactly once with the question below.
  - **non-interactive delegation** — the state any higher-level orchestrator creates when it
    delegates a workflow non-interactively; the authoritative list of those orchestrators is the
    one in the documentation-sync contract. Publish nothing and report that the question could not be posed, naming
    `delivery.prReview: always` as the setting that would authorize publication in such a run. This
    follows the loaded gate, where an unanswered, skipped, or non-interactive run publishes nothing.

```ask
when: a delivery created or reused a pull request, `delivery.prReview` is `ask` or unset, and the run is gated
header: PR review
question: Publish this run's review findings as comments on the pull request?
options:
  - label: Yes
    description: Submit the surviving findings as inline comments plus a summary on the pull request
  - label: No
    description: Leave the pull request without comments; the findings stay in this run's report
```

Run nothing when the push or the PR creation failed — there is nothing to comment on. When
`{{SKILL:pr}}` reused an existing pull request rather than creating one, the trigger still runs; the
fresh read above decides what is genuinely new.
