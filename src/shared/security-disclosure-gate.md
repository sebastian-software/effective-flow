## Security disclosure gate

Security findings are never published to an issue tracker automatically. An issue for an unfixed
vulnerability describes it with file, line, problem, and a ready-made reproduction prompt, is
visible to everyone with read access, and is propagated through notifications, mail, feeds, and
mirrors — deleting it later does not undo the disclosure.

This fragment owns the classification, the local-first persistence, and the publication offer. The
cross-publisher contract lives in "Issue-tracker integration (remote mode)"; the artifact
lifecycle stays with the calling workflow.

### Classification

Classify every finding that survives confidence, scope, and design-decision filtering:

- `local-only` for every security-relevant finding, `publishable` for every other finding.
- Use the `Security relevance` value reported by the reviewer as a signal and check it against the
  finding's own area, problem, and recommendation. You may **escalate** a finding the reviewer
  marked `internal` or `none`; you may **never** de-escalate one marked `external`.
- Mark each `local-only` finding as `external` (reachable through untrusted input, a network
  boundary, or an auth boundary) or `internal`.
- A missing, unknown, or uncertain value classifies as `local-only`. In doubt, hold it back.
- Classify technical findings from a validator stream too; they never pass through a reviewer.
- Classification decides only **where** a finding is recorded. It never removes a finding, changes
  its severity, or alters the active finding scope.

The classification is a judgment, not a taxonomy: it rests on the reviewer signal plus the finding
text. The conservative default is the safeguard, at the price of occasionally withholding a
harmless finding.

### Local dedup

A withheld finding was never published, so remote dedup cannot see it and a re-run would mint a
new ID for the same problem. Before the calling workflow reserves IDs, compare each `local-only`
finding's normalized `Signature` against the finding blocks of the existing reports below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. An exact match reserves no new ID and is not
written again; report it as already recorded, naming the existing report file and its finding ID.
Existing reports are read only here — this step never rewrites them, and each run writes its own
report file.

### Local-first persistence

After reservation and before any tracker mutation, persist the `local-only` findings, so a
declined offer, a CLI failure, or an interrupted session cannot lose them:

1. **Write the report.** Use the calling workflow's report path, guard, and collision mechanics,
   with the file name `review-report-YYYY-MM-DD-security[-N].md`. The `review-report-` prefix keeps
   the apply routing and the design-decision globbing intact. The report uses `language.workflow`
   even when the run's remote artifacts use `language.forge`; each artifact stays complete in its
   own language.
2. **Report fields.** Every finding block carries its `Security` field with the exposure value, and
   a report holding at least one security finding carries the disclosure banner directly below the
   header fields — for example
   `> **Security notice:** This report contains unpublished security findings. Do not paste it into public issues, pull requests, or chats.`
   or the German
   `> **Sicherheitshinweis:** Dieser Bericht enthält unveröffentlichte Sicherheitsbefunde. Nicht in öffentliche Issues, Pull Requests oder Chats einfügen.`
   The exposure values `external`, `internal`, and `none` are machine tokens and stay unlocalized.
3. **If the report cannot be written**, publish the `publishable` findings as usual, publish
   nothing from the withheld set, and output the withheld findings in the chat with an explicit
   warning that they were **not** persisted, the blocked path, the pointer to `{{SKILL:setup}}`,
   and the instruction to re-run after the repair. Do not offer publication in this state.

### Publication offer

Only when at least one `local-only` finding remains, present the withheld findings by ID,
severity, and short title, then ask. Keeping them local is the default: an unanswered, skipped, or
non-interactive run publishes nothing from the withheld set. The offer is per run and is not
remembered — a stored decision would silently suppress a finding that later grows more severe.

```ask
when: at least one local-only finding remains after the security classification
header: Security
question: Publish the withheld security findings as issues as well? They are already saved locally. A public tracker entry describes an unfixed vulnerability with file, line, and reproduction prompt, is visible to everyone with read access, and is propagated through notifications, mail, feeds, and mirrors, so deleting the issue later does not undo the disclosure.
options:
  - label: Keep local
    description: Default — the findings stay solely in the local report; no issue is created for them
  - label: Publish as issues
    description: The withheld findings are additionally created as issues in this run's epic, with the disclosure accepted
```

On `Keep local`, publish only the `publishable` findings. On `Publish as issues`, treat the
withheld findings as publishable for this run, so a single epic covers both groups and the epic
invariant "an existing epic is never extended" holds. Afterwards append to each affected finding
block of the just-written report a publication note as its last entry, in the preserved report
language and analogous to the review-report backlinks; guard the report path again immediately
before that write. The note is machine-recognizable so the local apply route can skip an
already-published finding:

- English: `🔓 Published as #<issue number> on YYYY-MM-DD`
- German: `🔓 Veröffentlicht als #<issue number> am YYYY-MM-DD`

### Silence in public artifacts

The epic body and every issue body contain no count, title, signature, ID, or other reference to a
finding that stayed local. A public "N security findings withheld" line is itself an exploitable
signal. The withheld count belongs solely in the local report and the chat summary.

### Boundary

The gate covers the publication of review findings. It does not sanitize branch names, commit
subjects, or pull request bodies of a later fix — that disclosure decision belongs to the
delivering workflow and its user.
