## Language resolution

Effective Flow resolves language by **target surface**: seven of these keys cover persisted,
human-readable content, and `language.chat` covers what the run says to the user. The project
setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |
| `language.chat`                    | Interactive output: what the run says to the user, never a project artifact |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, branch slugs, and the forge
auto-close keyword with its variants (`Closes #<issue>`, `Refs #<issue>`) are not localized. The
code host parses that keyword, so it stays English inside a PR body written in another language.
Product UI/CLI/error text follows the target project's product-i18n rules and is not controlled by
this configuration. Exact quotations and incoming third-party text are not translated unless
explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid, for every key in the table. For an artifact surface an invalid value
has no special meaning: report the affected key, ignore it, and continue with the next fallback. A
missing artifact-surface override means inheritance; `null` is not a language value.
`language.chat` is not an artifact surface and resolves by its own rule, for a missing **and** for
an invalid value — both mirror the user instead of falling through to `language.project`. That rule
is the "Interactive output language" fragment, which the tools that resolve it carry eagerly; the
router, `{{SKILL:version}}` and the `pr-review` notice carry none by design, and no agent carries
it, because an agent never resolves this key.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `{{SKILL:setup}}`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Typography does not live here. It follows the resolved value rather than the resolution, so it is
its own fragment (`typography-rules.md`) that every agent carries eagerly — an orchestrated agent
is handed resolved values and never loads this one. It is embedded below so that everything
reaching this fragment still reaches the rule as well.

```include
typography-rules
```
