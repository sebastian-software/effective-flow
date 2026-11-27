# Autopilot and Issue Buddy accept Forgejo and Gitea issue sources

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`effective-flow autopilot <issue>` stops in preflight on every repository whose `origin` is a
Forgejo or Gitea host. A field run against issue #13 of a Gitea repository stopped with "only
GitHub issues are accepted; the tracker helper classifies this host as `forgejo`". Plan sources
already work on any forge that `effective-flow pr` supports. Issue sources do not, because the
original autopilot plan put Forgejo out of scope while Issue Buddy was GitHub-only
(`docs/plan/archive/2026-11-16-autopilot-drive-an-issue-or-plan-to-a-pull-request-without-asking.md:74`,
`:468`).

Goal: one trusted `plain-issue` on a Forgejo or Gitea `origin` goes through the same unattended
path as a GitHub issue. Issue Buddy plans it, the deep plan review runs, the recommended workflow
implements it, and the result is a **draft** pull request. The safety boundaries do not change:

- the run stays unattended;
- it never takes a pull request out of draft and never merges;
- it admits only trusted authors;
- it publishes on a non-public repository only under the run's consent;
- it fails closed on anything it cannot prove.

Issue Buddy is autopilot's planner for issue sources and runs on the same core. Opening it to
Forgejo therefore also opens standalone `effective-flow issue-buddy` on Forgejo. That is intended
and in scope.

Workflow rationale: this is new functionality (a new supported provider for an existing tool) with
a new helper operation and one new skip reason. **Feature**.

## Outcome checkpoint

**Primary source:** this repository. Local plan from the field report in the T3 thread "Autopilot
für Issue 13" (Gitea repository, autopilot preflight stop).
**Original outcome:** autopilot and Issue Buddy accept a trusted Forgejo or Gitea `plain-issue` and
reach a pull request that is still a draft. The safety boundaries do not change, and external
trackers stay out of scope.
**Last evaluated attempt:** none (first plan).
**No-progress count:** 0
**Cumulative approach:**

- provider gates behind capability checks;
- Forgejo `repository-visibility-read` with an anonymous `curl` proof;
- adapter-enforced draft retention;
- Issue Buddy's trust check, its 403 diagnosis and the count of dropped comments;
- prose, tests and docs.

**Continuation decision:** not applicable.

## Architecture decisions

1. **The gate becomes an allow-list, not a removal.** Every site that requires `provider: github`
   instead requires `provider` ∈ {`github`, `forgejo`}. `external`, a missing provider and
   `AMBIGUOUS_HOST` keep stopping with `UNSUPPORTED_PROVIDER` before any forge read. Issue Buddy's
   `remote()` already maps `AMBIGUOUS_HOST` that way (`src/scripts/issue-buddy-core.mjs:1405-1412`).
   For `AMBIGUOUS_HOST` the message names `tracker.remoteToolOverride`. Gitea and Forgejo share the
   one `forgejo` provider (`docs/user-guide/remote-tracker.md:503`). Gitea needs no separate
   branch, and `teaForgeFlavor` stays diagnostic only.
2. **Capability evidence decides, not the provider name.** After the provider check, each path
   keeps or adds its capability requirements from the probe:
   - `repositoryVisibilityRead`, `issueCommentsRead`, `pullRequestList`,
     `collaboratorPermissionRead` and `viewerRead`;
   - for plan publication, all three of `pullRequestDraftCreate`, `pullRequestTitleUpdate` and
     `pullRequestMarkReady` (`shared/plan-publication.md`, Availability step 3). On Forgejo the
     last two hold only on a `tea` that states the WIP draft convention.

   A Forgejo installation whose `tea` lacks one of them stops with the existing
   `UNSUPPORTED_CAPABILITY` code naming the capability, never with a later runtime failure.

3. **Forgejo `repository-visibility-read` proves `public` in two parts, and both must hold.**
   - **(a) Authenticated read.** `tea api --include repos/{owner}/{repo}` is a Class A read on the
     existing transport.
     - **`private`:** `private === true`, `internal === true`, or `owner.visibility` is `limited`
       or `private`.
     - **Public candidate:** only `private === false`, with `internal` `false` or absent, and
       `owner.visibility === 'public'`.
     - **`unknown`:** every other combination, namely a non-boolean `private`, a non-boolean
       `internal` when present, or an `owner.visibility` that is missing or not one of the three
       values.
   - **(b) Anonymous proof, only for a public candidate.** It runs as `curl` through the injected
     runner, the same I/O seam every helper uses, so it follows proxy variables and the system CA
     like `tea`.
     - **Base URL:** taken only from the matched `tea` login's `url` (`matchingTeaLogin`,
       `src/scripts/remote-tracker-core.mjs:612-622`), never from the Git origin, so custom ports,
       subpaths and SSH origins resolve correctly. The login URL must use `https:`.
     - **Invocation:** no credential of any kind (`-q` so no `.curlrc` is read, no netrc, no
       header, no cookie), `--proto =https`, no redirect following, and a bounded `--max-time`.
     - **Forge check first:** `GET <base>/api/v1/version` must return 200 before any 401, 403 or
       404 on the repository may count as hidden. Otherwise a wrong base would read as `private`
       and leak private data into a publicly visible PR.
     - **Then the repository:** `GET <base>/api/v1/repos/{owner}/{repo}`. HTTP 200 with a
       `full_name` that matches the authenticated read's `full_name` case-insensitively confirms
       `public`. A 401, 403 or 404 gives `private`, which covers instances with
       `REQUIRE_SIGNIN_VIEW`.
     - **`unknown`:** a missing `curl` (`CLI_MISSING`), a non-HTTPS login URL, a failed forge
       check, a redirect, any other status, a timeout or a network error.

   `repositoryVisibilityRead` on Forgejo becomes `teaApiTransport` instead of `false`
   (`remote-tracker-core.mjs:2697`). `curl` is an optional runtime dependency. Its absence makes
   the result `unknown` (fail closed) and adds no probe gate. The GitHub path stays unchanged.
   Reason: Issue Buddy's publication rule (public only; non-public only under autopilot consent;
   unknown stops) must not publish where anonymous visitors cannot read.

4. **The Forgejo draft survives `Keep draft: requested`, enforced in the adapter.** Today the "Plan
   draft finish" bullet of `src/tools/pr.md` step 8 (`:280-291`) runs `pr-update-title` on its own
   under `Keep draft` with the derived title. On Forgejo the title _is_ the draft state
   (`src/scripts/remote-tracker-forgejo-core.mjs:381-384`), so that edit would take the plan PR
   out of draft.
   - **Adapter:** Forgejo `pr-update-title` gains `payload.keepDraft: true`. The adapter strips any
     WIP prefix from the title, prepends `WIP: ` (the prefix `tea pulls create --draft` writes),
     and confirms `draft: true` with one raw `pr-read`, as `pr-mark-ready` confirms its edit
     (`remote-tracker-core.mjs:7645-7680`). A `draft: false` read-back fails the operation.
   - **Prose:** `pr.md` step 8 sends `keepDraft: true` under `Keep draft` on Forgejo.
     `src/shared/pr-automation-lines.md` keeps only its pointer.
   - **Unchanged:** the merge-gate WIP exit and the plan-title derivation already strip the prefix.
   - **Missing `draft` field:** when a Forgejo PR response lacks `draft`, the field stays missing,
     so plan publication fails with `DRAFT_UNCONFIRMED`. It is never inferred from the title.
5. **Issue Buddy decides write access with the shared `isWritePermission`.** Its own check
   accepts only `write` and `admin` (`issue-buddy-core.mjs:1581`). Gitea and Forgejo report `owner`
   for the owner of a personal repository, so every issue the owner wrote would be skipped. The
   check switches to `isWritePermission` (`src/scripts/remote-tracker-shared-core.mjs:13-24`),
   which also admits `maintain` and is what `issue-intake-core.mjs` and
   `autopilot-appendix-core.mjs` already use.
6. **An unreadable permission is diagnosed and still never trusted.**
   - **Status forwarding:** Issue Buddy's `remote()` forwards the tracker's HTTP status
     (`envelope.error.details.status`) as `trackerStatus`, as `backlog-audit-core.mjs:357` and
     `triage-core.mjs:432` already do. The permission cache holds three states (writer, non-writer,
     unreadable), following `issue-intake-core.mjs:51-75`.
   - **Issue author:** a 403 gives the new skip reason `author-permission-unreadable`. Other errors
     keep `untrusted-author`, and `TARGET_NOT_FOUND` stays a proven non-writer. The value is added to
     `SKIP_REASONS` (`issue-buddy-core.mjs:57`). Autopilot's issue-source skip list stops on it with
     a cause that names the remedy: run as a repository admin or with an admin token.
   - **Comment authors:** a comment whose author's permission is unreadable is dropped, as today.
     Issue Buddy now counts these per issue (`unreadableCommentCount`) and states the count in its
     pass report. Autopilot records a nonzero count as a recorded decision in its draft PR, so a
     maintainer's ignored comment is visible to the reviewer.
   - **Compatibility:** the pass-report counts accept the new key without a schema bump. An older
     helper that reads a newer pass record rejects it, which is acceptable because versions only
     move forward.
7. **No new configuration.** Autopilot does not ask about `tracker.remoteToolOverride` and does
   not set it.
8. **T3 Code's failure to link a Gitea issue URL is out of scope.** That is host behaviour, not
   Effective Flow source.

## Affected files

| File                                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/autopilot-issue-source.md`                                                      | Precondition 2 becomes "**Forge origin.**": `repository-resolve` must return `provider: github` or `forgejo`. Replace "Forgejo and external trackers are out of scope…" with "External trackers are out of scope for issue sources". "one GitHub `plain-issue`" becomes "one forge `plain-issue`". The skip list (around `:79`) gains `author-permission-unreadable` with its remedy cause.                                                                                                                                                          |
| `src/tools/autopilot.md`                                                                    | Description (line 2): "one trusted GitHub issue" becomes "one trusted GitHub, Forgejo or Gitea issue". Where autopilot writes its recorded decisions, add the dropped-comment count (decision 6). `contextBudget` per the build report.                                                                                                                                                                                                                                                                                                              |
| `src/tools/issue-buddy.md`                                                                  | Description and preflight step 4: "GitHub origin" becomes "Forge origin" with the allow-list. Step 8 points to the visibility proof (decision 3). `:207` "twelve skip reasons" becomes thirteen. The report wording names the new reason and the comment count. Re-measure `contextBudget`.                                                                                                                                                                                                                                                          |
| `src/shared/issue-buddy-autopilot.md`                                                       | Align any GitHub-only wording.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/pr.md`                                                                           | Step 8, "Plan draft finish": on Forgejo under `Keep draft`, send `keepDraft: true` with `pr-update-title`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/pr-automation-lines.md`                                                         | `Keep draft: requested` bullet (`:10-12`): replace "on Forgejo `pr-update-title` runs on its own" with a pointer to `pr.md` step 8.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/scripts/issue-buddy-core.mjs`                                                          | `:2158`: allow-list, message "Issue Buddy supports GitHub and Forgejo only". `:1405-1412`: forward `trackerStatus`. `:1570-1590`: `isWritePermission` and the three-state cache. `:57`: the new skip reason. `:1608`: count dropped unreadable comments. Add the count to the pass report.                                                                                                                                                                                                                                                           |
| `src/scripts/plan-publication-core.mjs`                                                     | `:1179-1199`: rename `requireGithubDraftCapability` to a provider-neutral name, apply the allow-list, and keep `AMBIGUOUS_HOST` as `UNSUPPORTED_PROVIDER` naming the override. Update the D3 comment. The `:1301` draft read-back stays strict.                                                                                                                                                                                                                                                                                                      |
| `src/scripts/remote-tracker-forgejo-core.mjs`                                               | New `case 'repository-visibility-read'` (decision 3a). `pr-update-title` accepts `keepDraft` (decision 4).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/scripts/remote-tracker-core.mjs`                                                       | Forgejo probe: `repositoryVisibilityRead: teaApiTransport`. Forgejo visibility normalization plus the anonymous `curl` proof through the runner (decision 3b), with the base URL taken from the matched tea login. `keepDraft` read-back for Forgejo `pr-update-title`.                                                                                                                                                                                                                                                                              |
| `docs/adr/plan-only-unattended-publication.md`                                              | Line 7 "trusted GitHub issues" becomes GitHub and Forgejo. Add the Forgejo visibility proof, the new skip reason and the dropped-comment count.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/user-guide/tools-automation.md`                                                       | `:14`, `:47`, `:52`: issue sources need a GitHub or Forgejo/Gitea `origin`. Add the admin note, `author-permission-unreadable`, the comment count and the optional `curl` dependency.                                                                                                                                                                                                                                                                                                                                                                |
| `docs/user-guide/remote-tracker.md`                                                         | Capability list: `repository-visibility-read` for Forgejo with its mapping table, the anonymous proof and `curl`. `pr-update-title` `keepDraft`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Issue Buddy's user-guide section (the `docs/user-guide/` page that documents `issue-buddy`) | Provider wording, the new skip reason and the comment count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/issue-buddy.test.mjs`                                                                 | `:1305`: split into "Forgejo origin proceeds to the visibility read" and "external or ambiguous origin is refused before any forge read". Forgejo fixtures for an `owner` author (trusted), a 403 author (`author-permission-unreadable`), a `TARGET_NOT_FOUND` author (`untrusted-author`), and a 403 commenter (dropped and counted).                                                                                                                                                                                                              |
| `test/issue-buddy-contract.test.mjs`                                                        | `:53`: heading `'Forge origin.'`. `:88`: `SKIP_REASONS.length` becomes 13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/backlog-audit-contract.test.mjs`                                                      | `:333`: `SKIP_REASONS.length` becomes 13.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/workflow-contracts.test.mjs`                                                          | `:28829-28845`: heading `'2. Forge origin.'`. Invariants: the fragment names both providers and excludes external trackers, and the skip list names `author-permission-unreadable`.                                                                                                                                                                                                                                                                                                                                                                  |
| `test/plan-publication.test.mjs`                                                            | Forgejo with all three draft capabilities passes. Forgejo missing any one of them gives `UNSUPPORTED_CAPABILITY`. External and ambiguous still give `UNSUPPORTED_PROVIDER`. A Forgejo PR without `draft` gives `DRAFT_UNCONFIRMED`.                                                                                                                                                                                                                                                                                                                  |
| The Forgejo adapter test suite (`test/remote-tracker*.test.mjs`)                            | Command plan for the authenticated read. Normalization cases from decision 3a. Anonymous-proof runner fakes: 200 with matching `full_name` → `public`; 401/403/404 after a passing forge check → `private`; 404 with a failing forge check → `unknown`; redirect, timeout, non-HTTPS login URL or `CLI_MISSING` → `unknown`; base URL with port and subpath, and with an SSH origin. Assert that the `curl` argv carries `-q` and no credential. `pr-update-title` `keepDraft`: prefix written and `draft: false` read-back fails. Probe capability. |

## Implementation details

### Approach

1. **Helper: visibility.** Add the Forgejo authenticated read, its normalization and the anonymous
   `curl` proof through the runner, with adapter tests on runner fakes. No test touches the
   network.
2. **Helper: draft retention.** Add Forgejo `pr-update-title` `keepDraft` with its read-back and
   tests.
3. **Verify the remaining Forgejo reads** the issue path uses, against the existing Forgejo
   fixtures and the tea/API source. Each gap gets an adapter fix with a test in this change, never a
   workaround in workflow prose:
   - `issue-list` and `pr-list`, with `planPrMarker` and `sameRepository`;
   - `issue-comments-read` via `tea issues <n> --comments`, which must return every comment;
   - `viewer-read` and `collaborator-permission-read`, including a non-admin reading their own
     permission;
   - `pr-create` with `draft`;
   - the `draft` field in Forgejo PR JSON.
4. **Issue Buddy trust** (decisions 5 and 6): status forwarding, the three-state cache, the skip
   reason and the comment count, with core tests.
5. **Open the core gates** in `issue-buddy-core.mjs` and `plan-publication-core.mjs` with the
   allow-list, keeping the capability checks behind them.
6. **Align the prose sources** (`autopilot-issue-source.md`, `autopilot.md`, `issue-buddy.md`,
   `issue-buddy-autopilot.md`, `pr.md`, `pr-automation-lines.md`). Each contract is stated once,
   in its owning fragment.
7. **Tests, ADR, user guides.** Run the build and re-measure `contextBudget` from the
   `Always-loaded core` report.
8. **Evidence debt.** Run `pnpm eval <suite> verify` for every suite that loads an edited source
   (at least `merge-gate` and `build-context`, since they reach `pr.md`). Record the freshness debt
   in the PR, per the pragmatic test and release policy. No new eval suite.

### API integration

- **Authenticated read:** Gitea/Forgejo `GET /api/v1/repos/{owner}/{repo}` (`structs.Repository`),
  using `private` (bool), `internal` (bool), `owner.visibility` (`public` | `limited` | `private`)
  and `full_name`.
- **Anonymous proof:** `GET /api/v1/version` (forge check) and the same repository URL, both
  without credentials. Gitea answers 404 for repositories hidden from anonymous visitors, and
  401/403 on instances that require sign-in.

### Component structure

Not relevant: no UI.

### State management

Not relevant. The ledger, planning claim and pass records keep their schema version.
`ledgerRepository` is provider-neutral. The new skip reason and the comment count extend existing
records under decision 6's compatibility rule.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`AMBIGUOUS_HOST`** (self-hosted host without `tracker.remoteToolOverride`): stops before any
  forge read and names the override setting. No guess.
- **`provider: external`** or `tracker.mode` ≠ `remote`: unchanged stop.
- **Limited organisation, internal repository, or an instance that requires sign-in:** non-public.
  Publication needs autopilot consent, and a standalone Issue Buddy pass stays a dry run.
- **SSH origin:** the base URL comes from the tea login, so the origin scheme does not matter.
- **Custom port or subpath:** comes from the tea login URL. The forge check rules out a wrong base.
- **Proxy or internal CA:** `curl` follows them as `tea` does.
- **`curl` missing:** `unknown`, so publication stops. Autopilot's consent still allows a
  non-public run.
- **`tea` too old** for `--draft`, `api --include`, title edits or the WIP wording:
  `UNSUPPORTED_CAPABILITY` naming the capability, before any write.
- **Non-admin runner, issue by another author:** `author-permission-unreadable`. Autopilot stops
  and names the remedy. Issues the runner wrote themselves stay admissible.
- **Non-admin runner, comments by others:** dropped, counted and recorded in the draft PR.
- **Personal repository owner as author:** `owner` counts as write access.
- **Plan PR finish on Forgejo:** the adapter keeps `WIP: ` and confirms the draft. A non-draft
  read-back fails the finish, and the run never marks ready.
- **Forgejo PR without a `draft` field:** `DRAFT_UNCONFIRMED`, never inferred.
- **Container issues:** Forgejo has no native sub-issues (`issue-sub-issues-read` gives
  `UNSUPPORTED_CAPABILITY`). Stage B classifies from labels and the body checklist, as already
  specified. Only `plain-issue` continues.
- **Fork pull request in `pr-list`:** `sameRepository: false` excludes it from plan restore.

## Acceptance criteria

The change is complete when every criterion below holds, each checked by the named test or command.

- [ ] Forgejo `repository-visibility-read` returns `public` only when the authenticated read is a
      public candidate **and** the anonymous `curl` proof confirms it. It returns `private` and
      `unknown` exactly as decision 3 defines them, and the `curl` argv carries no credential.
      Checked by adapter tests.
- [ ] Issue Buddy and plan publication accept `provider: forgejo`. They refuse `external` and
      `AMBIGUOUS_HOST` with `UNSUPPORTED_PROVIDER` before any forge read, and a Forgejo probe missing
      any of the three draft capabilities gives `UNSUPPORTED_CAPABILITY`. Checked by unit tests.
- [ ] Issue Buddy treats `owner` and `maintain` as write access. A 403 author permission gives
      `author-permission-unreadable`. `TARGET_NOT_FOUND` and other errors stay `untrusted-author`. A
      403 commenter is dropped and counted in the pass report. Checked by core tests, plus a contract
      test that autopilot's skip list stops on the new reason with the remedy cause.
- [ ] Forgejo `pr-update-title` with `keepDraft: true` writes a `WIP: ` title and fails on a
      `draft: false` read-back. `pr.md` step 8 sends `keepDraft` under `Keep draft` on Forgejo.
      Checked by an adapter test and a contract test.
- [ ] `autopilot-issue-source.md`, `autopilot.md` and `issue-buddy.md` name GitHub and
      Forgejo/Gitea as issue-source forges and still exclude external trackers. Checked by contract
      tests. The user guides and the ADR state the provider scope, the visibility proof, `curl`, the
      admin note, the new skip reason and the comment count.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (including the
      `contextBudget` guard), `pnpm test:distribution`. The `pnpm eval <suite> verify` freshness debt
      is recorded in the PR body. The post-merge Gitea acceptance runs below are listed there as a
      follow-up, not a merge condition.

## Validation plan

- Adapter unit tests on runner fakes:
  - the Forgejo visibility read, its normalization and the anonymous proof;
  - `pr-update-title` `keepDraft`.
- Core unit tests for Issue Buddy trust (`owner`, 403 author, 403 commenter, `TARGET_NOT_FOUND`)
  and for the gates in `issue-buddy-core.mjs` and `plan-publication-core.mjs`.
- Contract tests:
  - the prose headings and the skip list (`issue-buddy-contract`, `workflow-contracts`);
  - the `SKIP_REASONS` length (`issue-buddy-contract`, `backlog-audit-contract`);
  - the `pr.md` `keepDraft` instruction.
- Full CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `pnpm eval <suite> verify` for the suites that load the edited sources. Record the freshness debt
  in the PR.
- Follow-up acceptance after merge, on a real Gitea repository (the reporting repository's issue
  #13 or a throwaway issue):
  1. An owner-authored issue: `effective-flow autopilot #<n>` passes preflight, and Issue Buddy
     plans it.
  2. That run ends with a pull request that `pr-read` reports as `draft: true`, with a `WIP: `
     title.
  3. An issue by another account, run as a non-admin: stops with `author-permission-unreadable`.

## Assumptions and open points

- Assumption: the user's Gitea host classifies as `forgejo` through `tea`, as the field run's error
  text confirms. No other Gitea-specific API difference affects the reads used here. Approach
  step 3 verifies that.
- Assumption: Gitea and Forgejo let a non-admin read their _own_ collaborator permission. If step 3
  finds otherwise, the runner proof stops with the existing cause, and the admin requirement is
  documented, not worked around.
- Assumption: the matched tea login always carries `url`. If it does not, the anonymous proof gives
  `unknown`.
- Assumption: no Forgejo-specific behavioural eval scenario is needed. The unit, adapter and
  contract layers cover the gates, trust and draft rules, and the follow-up acceptance runs cover
  the end-to-end path.
- User decision (2026-11-27): a 403 author permission gets its own skip reason (decision 6).
- User decision (2026-11-27): `public` on Forgejo needs an anonymous counter-check (decision 3b).
- User decision (2026-11-27): the counter-check runs as `curl` through the runner (decision 3b).
- User decision (2026-11-27): comments with an unreadable author permission are dropped, counted
  and recorded (decision 6).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        1 |         2 |    0 |
| Data protection |        1 |         1 |    0 |
| Error cases     |        1 |         2 |    1 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    2 |

Every finding from both rounds is incorporated. No open point remains.

### Findings

#### Internal review (2026-11-27)

- **Security, Critical:** under `Keep draft: requested`, `pr-update-title` on Forgejo would have
  dropped the WIP prefix and taken the plan PR out of draft. **Incorporated** in decision 4.
- **Error cases, Critical:** Issue Buddy's own trust check rejected Forgejo's `owner`.
  **Incorporated** in decision 5.
- **Error cases, Important:** a 403 permission read was reported as `untrusted-author`.
  **Incorporated** in decision 6 (user decision).
- **Data protection, Important:** limited-organisation and sign-in-required repositories could
  have read as public. **Incorporated** in decision 3 (user decision).
- **Testability, Important:** draft retention and `owner` trust had no test. **Incorporated** in
  the tests and acceptance criteria.
- **Architecture, Note:** a Forgejo PR could lack `draft`. **Incorporated**: never inferred,
  `DRAFT_UNCONFIRMED`.
- **Error cases, Note:** whether `issue-comments-read` returns every comment was unverified.
  **Incorporated** in approach step 3.
- **Testability, Note:** the contradictory visibility cases were undefined. **Incorporated** in
  decision 3a.
- **Maintainability, Note:** Issue Buddy's `AMBIGUOUS_HOST` path and the ADR line were missing.
  **Incorporated** in Affected files.

#### Deep review (2026-11-27)

- **Data protection, Critical:** a base URL taken from the Git origin would turn a 404 on a custom
  port or subpath into `private`. **Incorporated**: the base comes from the tea login URL, and a
  forge check runs first.
- **Error cases, Critical:** SSH origins would always have given `unknown`. **Incorporated**: the
  HTTPS check applies to the tea login URL.
- **Security, Critical:** Node `fetch` ignores the proxy and the system CA. **Incorporated**: the
  check uses `curl` through the runner (user decision).
- **Architecture, Important:** the injection seam was unnamed. **Incorporated**: the runner is the
  seam, and `full_name` is compared against the authenticated read.
- **Security, Important:** a title-derived `draft` fallback could confirm a ready PR.
  **Incorporated**: removed.
- **Security, Important:** comments from other users would be dropped silently under a 403.
  **Incorporated**: dropped, counted and recorded (user decision).
- **Error cases, Important:** the HTTP status never reached Issue Buddy. **Incorporated**:
  `trackerStatus` forwarding and the three-state cache.
- **Testability, Important:** the Keep-draft rule lived only in prose, at the wrong step.
  **Incorporated**: adapter `keepDraft` at `pr.md` step 8.
- **Maintainability, Note:** consumers of `SKIP_REASONS` were missing. **Incorporated** in Affected
  files.
- **Testability, Note:** the completion condition was split. **Incorporated**: the capability list
  is complete, and one closing criterion covers the evidence debt and the follow-up acceptance.

## Open points

- No open points.
