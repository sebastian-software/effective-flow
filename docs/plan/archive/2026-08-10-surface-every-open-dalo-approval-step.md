# Surface every open DALO approval step

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

Installing 1.57.1 through `./install-skill.sh` cost two aborted runs, because DALO gates an update
behind two independent acceptances and the installer names only the one it happened to hit:

1. `dalo source refresh --advance` refuses to move a pinned catalog while the staged candidate's
   audit is unaccepted. The remedy is `dalo audit '<staged-path>' --accept-risk "<reason>"`.
2. `dalo sync` refuses to materialize a skill that carries no approval record. The remedy is
   `dalo approve skill effective-flow:effective-flow --accept-risk "<reason>"`.

The two are not alternatives and neither implies the other. The run stops at the first one, the
operator resolves it, reruns, and is then stopped by the second.

The documentation is worse than silent — it is wrong. `docs/user-guide/getting-started.md:31-32`
tells consumers "Run it again after a new Effective Flow release to refresh the installation",
naming `dalo sync`. A catalog source is **pinned**: `dalo sync` never advances it, so that sentence
describes an update that does not happen. Every consumer following the documented path hits this at
every release.

This is a Bugfix: the installer's remediation output and a user-facing instruction are both
incorrect, and the change corrects them without adding capability. The work is tooling and
documentation only.

### Decisions taken during planning

| Question                     | Decision                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                        | Aggregate the installer's blocked-gate report **and** correct the documentation.                                                               |
| Documentation surface        | `docs/user-guide/getting-started.md` and `docs/developer-guide/release-and-installation.md`. `README.md` keeps its lean quick start unchanged. |
| Accepting risk automatically | Out of scope and explicitly not reopened. The reason stays the operator's own declaration.                                                     |

## Architecture decisions

- **Report state, not just the failure at hand.** When a gated command fails, the run already has
  everything it needs to answer "what else is blocking?" — `effective_flow_dalo_resolvable` reads
  `dalo --json status`, which reports `resolution.pending_approval_skills` and `blocked_skills`
  independently of any command's exit code. The blocked-advance path consults it and prints both
  remedies together.
- **Only the advance path needs aggregating, and that is not an oversight.** By the time the status
  gate runs, the advance has already succeeded or exited, so at that point there is no second
  unknown gate to report. The asymmetry follows the command order and is stated in the code so a
  later reader does not mistake it for a missing case.
- **A failed status probe must not degrade the message it is enriching.** If `dalo --json status`
  cannot be read while reporting a blocked advance, print the staged-audit remedy unchanged and say
  that the approval state could not be determined. Losing the primary remedy to a secondary probe
  would be a worse failure than the one being fixed.
- **The staged path stays DALO's own output.** It is only knowable from the failing command's
  stderr and is not reconstructed. That is why the gates cannot both be evaluated before any DALO
  mutation, and why the "evaluate both up front" option was rejected during planning.
- **The consumer update sequence is documented as a sequence, not as `dalo sync`.** The correct path
  for a pinned catalog is `dalo source refresh effective-flow --advance`, the acceptance it demands,
  then `dalo sync`. Replacing the wrong sentence with the actual commands is the point of the doc
  change; softening it to "may require approval" would leave the reader without the commands.
- **No behavioral change to the gates themselves.** What is blocked, when, and in which order stays
  exactly as it is. Only the reporting changes. This keeps the change reviewable against the
  regression that shipped in 1.57.0.

## Affected files

| File                                               | Description                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-common.sh`                                  | `effective_flow_dalo_guarded` additionally consults the resolution state on a blocked gate and prints every open acceptance step; the status gate's message is left as is.                                                                                                    |
| `test/install-dalo.test.mjs`                       | New cases: blocked advance **with** a pending approval prints both remedies; blocked advance **without** one prints only the staged-audit remedy; an unreadable status while reporting a block still prints the staged-audit remedy and discloses the unknown approval state. |
| `docs/user-guide/getting-started.md`               | Replace the incorrect `dalo sync` update sentence with the real update sequence and its acceptance step.                                                                                                                                                                      |
| `docs/developer-guide/release-and-installation.md` | Document the two independent acceptances, which one each path needs, and that the installer now reports every open step.                                                                                                                                                      |

## Implementation details

### Approach

1. In `local-common.sh`, extend `effective_flow_dalo_guarded`: after it has extracted the staged
   audit path and before it exits, consult the resolution state through the existing
   `effective_flow_dalo_resolvable` helper.
2. When the skill is additionally not resolvable, print the `dalo approve skill … --accept-risk`
   line beneath the staged-audit line, under one sentence stating that both steps are open and that
   the installer must be run again afterwards.
3. When the skill is resolvable, print only the staged-audit remedy — unchanged from today.
4. When the status probe itself fails, print the staged-audit remedy and one line saying the
   approval state could not be determined, naming `dalo status`.
5. Leave the status gate's own message unchanged; add a short comment recording why it needs no
   aggregation of its own.
6. In `getting-started.md`, replace the sentence claiming `dalo sync` refreshes the installation
   with the pinned-catalog update sequence, and state that each new release requires a fresh
   content-hash acceptance because the previous one is scoped to the old content.
7. Before writing either document, establish in an isolated store whether an existing approval
   record still covers changed content after an advance. Document what that run observes, not what
   this plan expects.
8. In `release-and-installation.md`, add the two-acceptance model to the installer section: which
   gate each path meets, what the persistence check established, and that a blocked run now reports
   every open step.

### Edge cases

- **Both gates open** — the intended new behavior; both remedies printed, exit stays non-zero.
- **Only the advance blocked, approval already recorded** — output unchanged from today, so an
  operator who is merely updating sees no new noise.
- **Status probe fails during the report** — primary remedy preserved, unknown state disclosed.
- **A gated command fails without a staged path in its output** — the existing generic
  `DALO failed during <step>` branch keeps its behavior; no status probe is attempted, because there
  is no audit block to enrich.
- **First install** — reaches the status gate, never the advance, and its message is unchanged.

## Acceptance criteria

- [ ] A blocked advance combined with a pending approval prints **both** the
      `dalo audit '<staged-path>' --accept-risk` line and the
      `dalo approve skill effective-flow:effective-flow --accept-risk` line, and exits non-zero.
- [ ] A blocked advance with the approval already recorded prints only the staged-audit line — the
      output for that case is unchanged.
- [ ] A blocked advance whose status probe fails prints the staged-audit line plus an explicit note
      that the approval state is unknown, and still exits non-zero.
- [ ] The installer still never invokes `dalo audit` or `dalo approve` itself and still supplies no
      default reason string; asserted through the stub invocation log.
- [ ] `docs/user-guide/getting-started.md` no longer claims that `dalo sync` refreshes the
      installation after a release, and names `dalo source refresh effective-flow --advance` with
      its acceptance step instead.
- [ ] `docs/developer-guide/release-and-installation.md` states both acceptances, which path needs
      which, and that an approval record persists across releases while a content-hash acceptance
      does not.
- [ ] `README.md` is unchanged.
- [ ] **Verified against the real `dalo`, not only the stub:** a blocked advance with no approval
      record is reproduced in an isolated store (`DALO_STORE`, isolated `HOME`, `CLAUDE_HOME`,
      `CODEX_HOME`) and the actual output contains both remedies. Stub results alone do not satisfy
      this criterion, and the real command output is quoted in the completion report.
- [ ] **The persistence claim is verified before it is documented:** an isolated store shows whether
      an existing approval record still covers changed content after an advance. The documentation
      states only what that run observed. If it turns out an approval record does **not** survive a
      release, the doc text says so instead, and the aggregated message is re-checked against that
      case.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`, and
      `shellcheck --severity=error install-skill.sh local-common.sh local-link.sh` all pass.

## Validation plan

- The sequence `AGENTS.md` prescribes after distribution-source edits: `pnpm agent:check`,
  `pnpm test`, `node build.mjs`, `pnpm test:distribution`, plus the shellcheck gate from
  `.github/workflows/ci.yml:51`.
- `node build.mjs` also runs the consumer-script guard, which scans `README.md` and every
  `docs/user-guide/**` file; the getting-started edit must not introduce an executable
  `./install-skill.sh` command.
- Stub-driven verification of all three report shapes through `test/install-dalo.test.mjs`.
- **One manual check against the real `dalo`**, not only the stub: reproduce a blocked advance with
  no approval record in an isolated store and confirm the run prints both remedies. The regression
  this plan follows was caused by a stub that encoded an assumption about DALO nobody had checked,
  so a stub-only result is not sufficient evidence here.

## Assumptions and open points

- DALO 0.9.2 is the reference version. The two-acceptance model is its behavior, verified in this
  repository's own session: `dalo audit '<staged>' --accept-risk` advanced a pinned catalog while
  the skill remained `pending approval`, and `dalo approve skill` was needed separately before
  `dalo sync --check` passed.
- **The persistence claim is not yet established and must not be documented before it is.** One
  sandbox observation points that way: with an approval record in place and the source content
  changed, `dalo sync` complained only about the staged audit and not about a missing approval. That
  is a single observation of a tracking source, not of an advanced pinned catalog, and DALO's own
  documentation was not consulted. The implementing run verifies it and documents what it finds; see
  the acceptance criteria. Writing an unverified mechanism into user documentation is precisely the
  failure mode this whole plan exists to correct.
- The change is reporting-only. No gate is added, removed, reordered, or relaxed.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

A deep interactive review followed the initial pass. It raised two decision-requiring points — how
binding the real-`dalo` check should be, and whether the persistence claim may be written into user
documentation before it is established. Both were decided and incorporated as acceptance criteria.
No blocking open points remain.

### Findings

- **Error cases, important — a secondary probe must not weaken the primary message.** Enriching the
  blocked-advance report with a status probe introduces a new way for that report to fail. The
  fallback is specified explicitly and carries its own acceptance criterion, so the staged-audit
  remedy survives a failed probe.
- **Testability, important — a stub cannot establish DALO's behavior.** This plan's entire subject
  exists because a stub encoded an unverified assumption and the suite then confirmed it. Decided in
  the deep review: the real-`dalo` reproduction is a **binding acceptance criterion**, not a
  validation-plan recommendation, and the run quotes the actual command output. A recommendation is
  exactly what the previous run satisfied on paper while shipping the defect.
- **Testability, important — the persistence claim was about to be documented on one observation.**
  The plan originally asserted that an approval record survives a release while a content-hash
  acceptance does not, sourced from a single sandbox run against a _tracking_ source rather than an
  advanced _pinned_ catalog. Decided: establish it first, then document what was observed, with the
  fallback text if the opposite turns out to hold. Writing an unverified mechanism into user
  documentation is the failure this plan corrects; repeating it inside the correction would be
  worse than the original.
- **Architecture, note — the aggregated probe reads the pinned state, not the candidate.** When the
  advance is blocked, `dalo --json status` resolves against the still-pinned content, so an
  already-approved user is correctly reported as resolvable and sees only the staged-audit remedy.
  That is the desired behavior rather than a gap, and it is why the common update case gains no
  extra noise.
- **Architecture, note — the asymmetry between the two gates is deliberate.** Only the advance path
  aggregates, because the status gate runs after the advance has already resolved. Recorded in the
  code so it is not later "fixed" into a symmetric shape that reports nothing new.
- **Security, note — the reporting change must not become a convenience path.** Printing both
  commands makes acceptance easier to perform, which is the point, but the installer still runs
  neither and supplies no reason. An acceptance criterion asserts this against the invocation log.
- **Scope, note — `README.md` stays out.** It carries the same quick start, so it is a defensible
  target, but it is the marketing entry page and the decision was to keep it lean. Its quick start
  remains correct for a first install; only the update sentence, which lives in the user guide, was
  wrong.

## Open points

- No open points.
