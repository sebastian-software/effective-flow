# Skill discovery

Effective Flow tools, and the agents they invoke internally, do not work in isolation: before they
begin planning, implementation or review, they survey the skills already available in your
environment (e.g. `effective-delivery`, `effective-engineering`, `effective-web`,
`effective-writing`) and additionally bring in the ones that fit the specific task. Where a
skill is the **owner of its domain**, its guidance is authoritative; if it is missing, every
tool's base function is preserved through a deliberately minimal fallback – no Effective Flow
tool and no Effective Flow agent depends on a host skill for its base function.

## How detection works

1. **Prefer recommended skills.** Many tools and agents name a short list of "Recommended
   skills" in their own header – skills that are an especially good fit for their typical
   task (e.g. `humanizer` for documentation prose, `impeccable`/`frontend-design` for
   UI implementation). A notation `A › B` is an **ordered fallback**: the first available,
   non-excluded skill in the group is taken – never both at once.
2. **Assess relevance.** Each skill is checked against the specific task; only clearly
   fitting ones are brought in (typically zero to two), not "on suspicion". A running tool
   never loads the `effective-flow` router again as a skill: nesting it would create competing
   lifecycle and delivery owners.
3. **Take configuration into account.** The `skills.*` rows in the
   [project-setup ADR](./configuration.md#block-skills) control behavior globally and, more
   finely, per agent and per tool.
4. **Current library docs when needed.** For unknown or recent frameworks/libraries,
   tools use documentation skills like `context7-mcp` when needed, instead of guessing from
   the training snapshot.
5. **Layered authority.** Effective Flow owns the **orchestration** (the what/when:
   routing, plan/report state, agent selection, worktrees, commits, delivery, config) – this
   layer always stays authoritative, and no skill may extend scope, introduce new
   dependencies or violate the plan. The **domain expertise** (the how: domain checklists,
   standards, specialist guidance) is owned by the central skills: if a recommended skill is the
   declared owner of a domain question and covers it, its guidance is **authoritative**, not
   merely optional advice. If the skill is missing, a deliberately **minimal fallback** takes
   over – the tool stays functional, only with less depth. The exact assignment per skill is in
   the [Developer Guide → Skill ownership](../developer-guide/skill-ownership.md). In pure
   analysis/planning tools, the no-code boundary stays strict.
6. **Report.** At the end, the tool briefly reports which skills were used – or that none
   fit.

If your environment provides no skill directory, or none of the available skills fit, this
entire process is a no-op: Effective Flow tools continue to run unchanged with their built-in
instruction.

## Control via configuration

The `skills.*` rows in the project-setup ADR (see the full
[configuration reference](./configuration.md#block-skills)) control dynamic skill usage on three
levels:

| Level  | Key                                 | Effect                                                   |
| ------ | ----------------------------------- | -------------------------------------------------------- |
| Global | `skills.enabled`                    | `false` turns off all dynamic skill usage project-wide   |
| Global | `skills.include` / `skills.exclude` | additionally prefer, or never apply, skills project-wide |
| Agent  | `skills.agents.<name>`              | the same two lists, but only for a specific agent        |
| Tool   | `skills.tools.<name>`               | the same two lists, but only for a specific tool         |

Here `<name>` is the source agent or source tool name (e.g. `ui-implementer`, `plan`),
not a display name. A skill excluded via `exclude` is simply skipped in a
fallback pair (`A › B`) – the next fallback in the chain then takes over
automatically, without the process breaking off. A skill named in `include` but not
installed is silently ignored.

Example – prefer `humanizer` globally, but disable it for the `docs` tool:

```md
| Key                          | Value     |
| ---------------------------- | --------- |
| skills.enabled               | true      |
| skills.include               | humanizer |
| skills.tools.docs.exclude    | humanizer |
```

## Materialization via `/effective-flow setup`

In the guided path of [`/effective-flow setup`](./tools-setup.md) you can have the built-in
fallback recommendations of individual agents written visibly into the config (section
"Advanced settings"). For a fallback recommendation like `impeccable › frontend-design`,
only the **primary** skill is materialized (row `skills.agents.<name>.include`, value `impeccable`)
– the built-in fallback to `frontend-design` still stays active in case `impeccable` is
ever unavailable. A flat recommendation without a fallback (e.g. `humanizer`) is taken over
unchanged. This step is purely optional – without it, the built-in recommendations of the
tools and agents already apply anyway.

## See also

- [Configuration](./configuration.md) – full field reference for `skills`
- [Set up tools](./tools-setup.md) – `/effective-flow setup`
- [Glossary](./glossary.md) – Skill, Agent, Harness
