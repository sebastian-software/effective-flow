# Project language policy

## Status

Active

## Context

Effective Flow creates and edits human-readable artifacts across several audiences and delivery
surfaces. A single documentation default and an independently configured plan status marker do
not express the needs of source prose, user and technical documentation, workflow artifacts,
forge collaboration, and Git history. Local and published artifacts can also cross these
boundaries: a remote review is both a review and a forge issue, while a pull-request title becomes
the commit subject after a squash merge.

The policy must remain usable in unconfigured projects, preserve existing artifact languages,
keep machine-readable contracts stable, and support the existing German and English artifact
formats without duplicating language-resolution rules in every tool and agent.

## Decision

Effective Flow resolves human-readable output through a project default plus surface-specific
overrides in the project-setup ADR:

| Key                                | Surface                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `language.project`                 | Fallback for human-readable content without a surface override                            |
| `language.source`                  | Comments, test descriptions, and in-code documentation                                    |
| `language.documentation.user`      | Root marketing README and user documentation                                              |
| `language.documentation.technical` | Developer, API, operations, runbook, and ADR documentation                                |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports                      |
| `language.forge`                   | Issues, pull-request bodies, comments, remote reviews, and thread replies                 |
| `language.git`                     | Commit descriptions, Conventional Commit pull-request titles, and generated release prose |
| `language.chat`                    | Interactive output: replies, questions, and reports the run speaks to the user            |

The supported values are `en` and `de`; `null` has no special inheritance meaning. A missing or
invalid artifact-surface override inherits `language.project`, and a missing or invalid project
value falls back to `en`. For an individual artifact, an explicit user instruction wins, followed
by the language of an existing artifact, the surface override, the project default, and finally
`en`.

`language.chat` is the one key that does not inherit, because it is an interaction key rather than
an artifact surface. A missing or invalid row means mirror the language the user writes in, never
`language.project`, so the key changes nothing in an already configured project until a value is
set. Where a value is set it outranks the language of the incoming message; only an explicit
in-message request beats it. The order is an explicit in-message request, the configured value,
the conversation language, `language.project`, and finally `en`.

The publishing destination resolves overlaps. Local reviews use `language.workflow`; remote
review issues use `language.forge`. Pull-request bodies and comments use `language.forge`, while
the Conventional Commit pull-request title uses `language.git` because it becomes the squash
commit subject. An orchestrator resolves the required language once per run and passes the
concrete language to delegated agents; agents do not independently reinterpret the project
configuration.

Complete plans, including status markers and human-readable headers, use one language. Existing
German and English plan and review formats remain readable. New writers emit only the resolved
language. Configuration keys and encoded values, labels, HTML idempotency markers, finding IDs,
action values, paths, Conventional Commit types, branch slugs, the forge issue-reference keywords
(the auto-close keyword with its variants and the non-closing `Refs`), and internal runtime-state
schemas remain stable English/ASCII tokens.

Project-setup readers bootstrap before language resolution by recognizing the complete English
and German ADR envelopes while keeping their keys and encoded values stable. Setup creates a new
ADR in `language.documentation.technical` and preserves the recognizable language of an existing
ADR on ordinary updates; changing the configured language does not translate it implicitly.

Visible product strings such as UI, CLI, and error messages remain governed by the target
project's product localization requirements. Interactive, non-persisted output follows
`language.chat`, and mirrors the user's language for as long as that key is unset. Its scope is
every line a run emits itself, including the questions it poses, the next-steps heading and option
descriptions, and the session-title label. Delegated output stays outside it: worker reports and
agent notices are relayed verbatim, so a run can be visibly bilingual. The tool catalog, the
`version` output, and the `pr-review` deprecation notice are emitted before any configuration read
and stay on the conversation language. Locale-specific typography is delegated to
`effective-writing`, the consolidated central skill that took over the retired `locale-typography`
skill upstream, using `en-US` for `en` and `de-DE` for `de`. Only the delegation target changed;
the typography contract itself is unchanged.

`plan.markerLanguage` is retired. During one compatibility generation, runtime readers may use it
as a workflow fallback only when neither a valid `language.workflow` nor a valid
`language.project` is available. Setup may propose converting the legacy value whenever
`language.workflow` is absent, but only through its confirmed before/after migration; an existing
workflow value always wins. An otherwise unconfigured project may use an existing plan inventory
as the same transitional fallback only when plan prose and canonical markers agree unambiguously
on one language. No new writer emits the retired key. Removing the compatibility readers requires
a separate decision.

## Consequences

- Target projects can keep English source and Git history while using German workflow or user
  documentation artifacts, or choose any other supported combination.
- Artifact writers and readers need a shared resolution contract and complete bilingual
  compatibility mappings.
- Setup gains a project-language question and optional overrides: the artifact surfaces offer
  **Inherit project language** first, `language.chat` offers **Mirror the user's language**
  first, and both states are written as an absent row. Express keeps the all-English safe
  default and writes no `language.chat` row.
- Adding `language.chat` changes nothing for an existing project until it is set, because
  mirroring is exactly the previous behaviour. The cost is that the key cannot be read off
  `language.project` the way every artifact surface can.
- Existing artifacts are not mass-translated when configuration changes. New artifacts can
  therefore coexist temporarily with older content during an intentional migration.
- Machine-readable tokens remain interoperable across language combinations.
- Additional languages or regional variants require a later decision; the initial contract is
  deliberately limited to `en`/`de` and `en-US`/`de-DE` typography.

## Validation and review triggers

Alignment is checked by the source-to-dist build, targeted compatibility scenarios, the normal
format/test/build pipeline, and inspection of both generated harnesses. Revisit this decision
when Effective Flow adds a third content language, supports region-specific locale selection,
introduces another persisted artifact surface or non-persisted interaction surface, or changes
its squash-merge/release model.

## References

- `src/shared/language-rules.md`
- `src/shared/chat-language.md`
- `src/shared/config-setup-migration.md`
- `docs/user-guide/configuration.md`
- `docs/developer-guide/plan-conventions.md`
- `docs/developer-guide/skill-ownership.md` (retired central-skill names and their successors)
- `docs/plan/archive/2026-07-21-sprachkonfiguration-fuer-zielprojekte.md`
