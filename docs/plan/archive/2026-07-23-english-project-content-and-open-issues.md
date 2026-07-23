# Adopt English across active project content and open issues

**Plan status:** Implemented
**Source:** $effective-flow plan
**Recommended workflow:** Feature (`$effective-flow build`)

## Requirement

Effective Flow should use English consistently across its active, human-readable project
surfaces:

- the project language configuration and every language surface that inherits from it;
- maintained user, developer, operations, runbook, contributor, and source-instruction
  documentation;
- every active plan;
- the title and body of every open GitHub issue.

This is a feature because changing the project language alters future workflow, documentation,
Forge, and Git output in addition to migrating existing active content. It complements
`docs/plan/2026-07-21-sprachkonfiguration-fuer-zielprojekte.md`, which introduces the
surface-aware `language.*` configuration but deliberately excludes a bulk migration of existing
artifacts. The language configuration plan is therefore a prerequisite and must be implemented
first or integrated into the same delivery branch without duplicating its resolver logic.

Verified context originally captured on 2026-07-23 at Git commit `1cdd053`, then re-verified on
2026-07-23 against `origin/develop` at `9c78ce1` (47 commits newer). The re-verification
supersedes several original assumptions (see the 2026-07-23 re-review in the Plan review section):

- `README.md`, the maintained user and developer guides, contributor guidance, and `src/**/*.md`
  already use English prose. The remaining German terms in those maintained surfaces are
  deliberate compatibility examples, canonical bilingual tokens, or entries in
  `docs/developer-guide/terminology.md`; they are not untranslated prose.
- The project setup migration is already committed. `docs/adr/effective-flow-project-setup.md`
  already declares `language.project = en`, carries the full `language.*` surface set, and no
  longer contains `plan.markerLanguage`. The only remaining language override is
  `language.workflow = de`; resolving it to English is the single remaining ADR change (see
  Architecture decisions).
- Only one active plan remains under `docs/plan/`:
  `docs/plan/2026-07-16-0033-gemini-cli-platform-target.md`, which is already almost entirely
  English — only its `**Empfohlener Workflow:**` field label is still German. The other formerly
  active plans have been implemented and moved to `docs/plan/archive/`, so they are historical and
  out of scope under the immutable-history rule.
- The GitHub CLI is authenticated and the open-issue set is inspectable. Exactly one open,
  project-authored German issue is in scope — **#143** (author `fastner`). Issue #139 ("Dependency
  Dashboard") is a Renovate bot artifact (third-party, English) and is excluded.

The documentation scope means currently maintained project content and active workflow
artifacts. The user confirmed during the deep plan review that archived plans and changelog
history remain unchanged. Closed issues, pull requests, release history, and historical issue
comments likewise remain unchanged; for open issues, only the title and body are translated.
Existing exact quotations and third-party text are not translated.

## Architecture decisions

- **Use one inherited project-language setting.** On the current baseline the ADR already sets
  `language.project = en`, carries the full `language.*` surface set, and no longer contains
  `plan.markerLanguage`. The remaining change is to make the workflow surface English as well:
  set `language.workflow = en`, or remove that override so it inherits `en`. The deep re-review
  confirmed the deliberate migration of the workflow surface (plans, plan reviews, investigations)
  to English rather than keeping `develop`'s deliberate `language.workflow = de`. All source,
  documentation, workflow, Forge, and Git surfaces then inherit English from one source of truth.
- **Translate complete artifacts.** For each active plan, translate the title, prose, header
  fields, displayed values, section headings, tables, review section, and open-points section as
  one unit. Preserve paths, identifiers, commands, skill references, workflow values, code,
  schemas, and other machine-stable tokens.
- **Keep bilingual compatibility documentation.** German marker examples, German reader
  compatibility, the DE-to-EN terminology table, and exact quoted legacy forms remain where they
  explain supported behavior. A simple search hit for a German word is not by itself evidence of
  untranslated documentation.
- **Treat history as immutable.** Do not translate `docs/plan/archive/**`, closed issues, merged or
  closed pull requests, changelog history, or existing issue comments. Active plans and open
  issue descriptions are current work surfaces and are migrated.
- **Use a bounded live issue inventory.** After successful GitHub authentication, capture the
  complete set of open issues with number, title, body, labels, and URL. Re-read each issue
  immediately before editing, update title and body only when German or mixed project-authored
  prose is present, and run a second complete inventory before completion so issues opened during
  the migration are not missed.
- **Keep a recoverable remote-change record.** Before the first issue edit, write the complete
  pre-migration issue inventory to an ignored, timestamped runtime file under
  `.effective-flow/`. After each successful edit, append the issue number and post-edit title/body
  hash. This local record is a recovery aid, not a tracked planning system or published artifact.
- **Preserve tracker contracts.** In issue bodies, retain finding IDs, signatures, labels,
  checklist state, issue and PR references, code spans and blocks, links, mentions, HTML markers,
  and machine-readable action values. Translate only human-readable headings and prose into the
  canonical English forms supported by the tracker readers.
- **Avoid a new language linter.** The central resolver and project configuration prevent future
  drift. Validation uses a scoped language audit with reviewed exceptions instead of a brittle
  repository-wide ban that would reject supported German compatibility examples and historical
  artifacts.

## Affected files

| File or surface                                                                                                                                                                                                                                        | Description                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/effective-flow-project-setup.md`                                                                                                                                                                                                             | `language.project = en` and the `plan.markerLanguage` removal are already committed. The remaining change is to resolve `language.workflow = de` to English (set `language.workflow = en` or remove the override so it inherits `en`). Preserve every unrelated setup value. |
| `docs/plan/2026-07-16-0033-gemini-cli-platform-target.md`                                                                                                                                                                                              | The only remaining active plan and already almost entirely English. Normalize the German `**Empfohlener Workflow:**` field label to `**Recommended workflow:**` (and any other stray German field), preserving all implementation decisions. Do not rename the plan path.    |
| Formerly active plans now under `docs/plan/archive/` (`codex-goals-direkt-starten`, `plan-issue-review-und-plan-gateway`, `sprachkonfiguration-fuer-zielprojekte`, `cleanup-worktree-bereinigung`, `sichtbare-fortschrittsmeldungen-fuer-goal-laeufe`) | Implemented and archived on `develop`. Historical under the immutable-history rule, therefore **out of scope** (no translation-only diff).                                                                                                                                   |
| Open GitHub issue **#143** in `sebastian-software/effective-flow`                                                                                                                                                                                      | The single open project-authored German issue. Translate its title and body to English, preserving tracker structure and machine-stable content.                                                                                                                             |
| `README.md`, `CHANGELOG.md`, `AGENTS.md`, `CLAUDE.md`, `.github/**/*.md`                                                                                                                                                                               | Audit maintained root and contributor documentation; change only verified German prose, not compatibility literals or historical release text.                                                                                                                               |
| `docs/adr/**/*.md`, `docs/user-guide/**/*.md`, `docs/developer-guide/**/*.md`, `docs/operations/**/*.md`, `docs/runbooks/**/*.md`                                                                                                                      | Audit maintained documentation and translate only verified German prose; preserve bilingual reference material that documents supported contracts.                                                                                                                           |
| `src/**/*.md`                                                                                                                                                                                                                                          | Audit the shipped router, tool, agent, and shared-instruction prose; translate only verified German prose and preserve German read-compatibility examples.                                                                                                                   |
| Open GitHub issues in `sebastian-software/effective-flow`                                                                                                                                                                                              | Translate project-authored German or mixed-language titles and bodies while preserving tracker structure and machine-stable content.                                                                                                                                         |

The implementation-time active-plan inventory is authoritative. If an active plan is added,
implemented, or archived after this plan was written, apply the active-versus-historical rule
instead of relying only on the six paths listed above.

## Implementation details

### Approach

1. Re-read the working tree, this plan, the project setup ADR, and
   `docs/plan/2026-07-21-sprachkonfiguration-fuer-zielprojekte.md`. Compare in-scope files with
   commit `1cdd053` and preserve compatible uncommitted changes. Stop if the prerequisite plan's
   language schema or current setup migration has changed incompatibly. Capture the baseline
   result of `pnpm agent:check`, `pnpm test`, and `node build.mjs`; stop if a pre-existing failure
   prevents later attribution.
2. Ensure the surface-aware language resolver and setup schema from the prerequisite plan are
   present on the implementation branch. Reuse them; do not introduce another resolver or write
   language behavior directly into JavaScript build logic.
3. Update the living project setup ADR non-destructively: add `language.project | en`, remove
   `plan.markerLanguage`, and remove surface overrides only when they are redundant or conflict
   with the all-English policy. Keep the existing English ADR envelope and every unrelated key.
4. Inventory every non-archived plan under the configured `plan.dir`. Translate each German or
   mixed active plan as a complete artifact using the canonical English plan contract. Preserve
   implementation meaning, checkboxes, finding IDs, commands, code, links, paths, and stable
   workflow values. Do not rename plan paths merely to localize their slugs.
5. Audit maintained Markdown surfaces for German prose. Review each match in context and edit
   only genuine prose. Record deliberate exceptions such as canonical German plan markers,
   bilingual terminology mappings, read-compatibility examples, exact quotations, and locale
   examples; do not rewrite files merely to eliminate search hits.
6. Before remote work, require a successful `gh auth status` for the repository host. Then list
   all open issues with number, title, body, labels, and URL using pagination until the complete
   set is proven. Save that pre-migration inventory to an ignored, timestamped file under
   `.effective-flow/` and use it as the migration checklist and recovery source. If
   authentication, repository access, complete pagination, or the backup write fails, stop before
   any issue mutation and report the remediation without falling back to an incomplete source.
7. For every open issue with German or mixed project-authored title/body prose, fetch it again
   immediately before editing, translate the complete title and body to English, preserve the
   tracker contracts named above, and update only that issue. Do not add attribution footers or
   migration comments. Skip an issue that closed after the inventory rather than reopening or
   rewriting it. Re-read the edited issue immediately, verify the intended title/body and stable
   contracts, and append its number and post-edit title/body hash to the recovery record. Stop on
   the first failed or ambiguous update so the run can resume from the verified record without
   overwriting newer remote content.
8. Repeat the open-issue inventory after the first pass. Process newly opened or previously
   missed non-English issues once, then stop and report if continuous tracker churn prevents a
   stable final set.
9. Run the repository validation sequence and a final reviewed language audit. Inspect the
   source-to-dist output to confirm that the English project setting and translated source prose
   produce equivalent English Claude and Codex artifacts without changing supported German
   read compatibility.

### Edge cases

- A plan with mixed German and English fields is translated from its full semantic content into
  the complete English contract; do not repair only the status marker.
- A German token inside a code block, schema, path, label, issue reference, exact quotation, or
  compatibility example remains unchanged unless it is demonstrably human-readable project
  prose.
- The DE-to-EN tables in `docs/developer-guide/terminology.md` necessarily retain German source
  terms and are compliant with English documentation.
- If an issue body is a review epic or finding, preserve its checklist relationships, signature,
  finding ID, severity/action values, and idempotency markers while translating headings and
  explanations.
- Existing issue comments are historical conversation. Do not edit, delete, or reproduce them,
  and do not translate text authored by third parties.
- If an issue changes between inventory and edit, merge the translation into the fresh body
  instead of overwriting newer content. Stop for user direction when the new content changes the
  issue's meaning or scope.
- The plan archive remains readable through the permanent bilingual contracts. The English
  project setting affects new artifacts but does not authorize rewriting archived history.

## Acceptance criteria

- [ ] The living project setup ADR contains `language.project | en`, contains no
      `plan.markerLanguage`, and contains no effective `language.*` override that makes a project
      surface non-English.
- [ ] Every plan that is active under the configured `plan.dir` at final validation uses exactly
      one complete English plan contract; `docs/plan/archive/**` has no translation-only diff.
- [ ] Maintained root, user, developer, operations, runbook, ADR, contributor, and shipped
      instruction prose is English. Every remaining German match in those surfaces is reviewed
      and justified as a compatibility token, bilingual reference entry, exact quotation,
      machine-stable value, or locale example.
- [ ] Every GitHub issue that is open at final validation has an English project-authored title
      and body, while labels, IDs, signatures, checklist state, references, code, links, mentions,
      and machine-readable values remain unchanged.
- [ ] Closed issues, pull requests, archived plans, changelog history, and existing issue comments
      have no translation-only changes.
- [ ] `pnpm agent:check`, `pnpm test`, and `node build.mjs` complete successfully, and generated
      Claude and Codex artifacts remain equivalent with no unresolved placeholders.

Together these criteria define one completion condition: every active human-readable project
surface named by the user is English, historical and machine-stable content is preserved, and
the repository's full validation sequence passes.

## Validation plan

- `git diff --check` to reject whitespace damage in translated Markdown.
- `pnpm agent:check` to verify formatting without broad formatter writes.
- `pnpm test` to verify transforms and bilingual reader contracts.
- `node build.mjs` to run both harness builds and all build-time guards.
- A scoped German-language search across maintained documentation, active plans, and `src/**/*.md`,
  followed by contextual review of every match against the documented exception classes.
- A diff check proving that `docs/plan/archive/**` and other historical surfaces have no
  translation-only changes.
- A paginated GitHub issue inventory before and after the migration, with the returned count and
  page completion checked and a contextual language review of every final title and body.
- Targeted comparison of any edited review finding or epic against its pre-edit copy to prove
  that signatures, IDs, labels, checklists, references, and action values are unchanged.
- Recovery-record reconciliation proving that each issue marked as edited was re-read
  successfully and its recorded post-edit hash matches the final remote body.

## Assumptions and open points

- Confirmed decision: "all documentation" means maintained documentation and active plans, not
  archived workflow history or changelog history.
- Confirmed decision: "open issues" means issue titles and bodies. Existing comments and pull
  requests remain historical records.
- English uses the project's established en-US terminology and typography. German compatibility
  literals remain supported and are not treated as a second prose language.
- The issue inventory is intentionally resolved at implementation time because authentication is
  currently unavailable and the open set can change after planning.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         3 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Error cases (Important, incorporated):** Editing multiple remote issues without a durable
  pre-edit snapshot and per-write verification could leave an unrecoverable partial migration.
  The approach now requires a complete ignored runtime backup, immediate post-edit reads and
  hashes, and a fail-closed resume point.
- **Error cases (Note):** The current GitHub authentication failure prevents a reliable issue
  inventory during planning. The plan incorporates a fail-closed authentication gate, fresh
  per-issue reads, and a final inventory so implementation cannot silently migrate only a
  partial set.
- **Scope (Note):** A literal ban on every German token would break permanent bilingual reader
  documentation and rewrite history. The plan instead distinguishes maintained English prose
  from compatibility examples, machine-stable contracts, exact quotations, and archived
  artifacts, with a reviewed exception model.
- **Scope (Important, incorporated):** The user confirmed that "all documentation" covers active
  maintained surfaces and active plans; the archived plan corpus and changelog history remain
  unchanged.
- **Scope (Important, incorporated):** The user confirmed that open-issue translation covers the
  editable title and body only. Existing comments and pull requests remain historical records.

#### 2026-07-23 re-review against `origin/develop` at `9c78ce1`

- **Scope (Important, incorporated):** The original "Verified context" baseline at `1cdd053` is 47
  commits stale, and much of the described scope is already resolved on `develop`: the ADR already
  sets `language.project = en` and dropped `plan.markerLanguage`; five of the six originally listed
  active plans are implemented and archived (out of scope); the working-tree/setup-migration and
  GitHub-auth blockers are gone; and exactly one open project-authored German issue (#143) remains.
  The Verified context, Architecture decisions, and Affected files were corrected to this baseline.
  Net remaining scope: resolve `language.workflow` in the ADR, normalize one field label in the
  single remaining active plan (`0033-gemini`), audit maintained docs, and translate issue #143.
- **Scope (decision, resolved):** `develop` deliberately kept `language.workflow = de` while every
  other surface is English. The user confirmed migrating the workflow surface to English as well
  (full all-English intent), so `language.workflow` is set to `en` (or the override removed) and
  future plans, plan reviews, and investigations are English. Acceptance criterion #1 is retained
  unchanged.

## Open points

- No open points.

## Test results

**Date:** 2026-07-23

- `git diff --check`: clean (no whitespace damage).
- `pnpm agent:check`: passed after formatting the changed files.
- `pnpm test`: 344 passed, 0 failed.
- `node build.mjs`: exit 0; all build-time guards passed and Claude/Codex artifacts remained equivalent.
- Scoped German-language audit across maintained docs, active plans, and `src/**/*.md`: no genuine
  untranslated German prose. Every remaining match is a canonical bilingual token (e.g.
  `## Annahmen und offene Punkte` in the plan-contract tables) or a `docs/developer-guide/terminology.md`
  entry — reviewed exceptions per the plan.
- Open-issue inventory (before and after): only #143 (project-authored, translated to English) and
  #139 ("Dependency Dashboard", Renovate bot, English, excluded). All open issues are English.

## Review findings

**Date:** 2026-07-23
**Reviewer:** technical validation (`effective-flow-code-validator` checks) plus user content review of the issue #143 translation

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     0 |
| Open / Not implemented |     0 |

No findings found. The change set is documentation/config text (one ADR config value, one plan
field label, and a scoped audit) plus a token-preserving translation of issue #143 that the user
reviewed and approved; technical validation is green and no product code was touched.
