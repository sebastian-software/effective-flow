## Session title

Hosts derive a session title from the **first** message, so a run is listed as
`Effective-flow plan R-0000010` long before its subject is known. Once the running tool knows that
subject, propose a better title — once.

- **Only where sessions carry titles:** emit only when the host exposes a session-management or
  session-title capability, or an Effective Flow rename path applies — that path may be a shipped
  script and an installed hook, or a second session the user has mandated, and neither is a tool the
  model can see, so a missing tool never rules it out. Where
  sessions carry no titles at all, stay silent.
  Never call such a tool for the current session (they exclude it), never retitle another session,
  and never probe speculatively. Where the running host has an established rename path **and** the
  loaded mechanism fragment reports that path as live,
  apply the title silently instead of proposing it and report nothing further. Otherwise emit the
  suggestion line once — no established path, a path that is not live, or a run that cannot tell.
  The mechanism fragment owns what "live" means and how an outcome the host does report is judged.
  One carve-out: a session acting under its **own user's** standing rename mandate may honor a
  cross-session rename request for the session that asked. That is a mandated role its user gave it,
  not a run retitling a session of its own accord — the mechanism fragment owns that whole contract,
  and nothing here loosens the requester side.
- **Only from work-subject tools:** `concept`, `concept-review`, `plan`, `plan-issue`, `apply`,
  `apply-plan`, `apply-review`, `apply-issues`, `build`, `fix`, `refactor`, `docs`, `maintain`,
  `review`, `iterate`, and `investigate`. `version`, `open-plans`, `setup`, `cleanup`, `commit`, and `pr` stay silent, and
  internal sub-agents and workers never emit. One carve-out: `setup`'s capability probe renames the
  session once with its own fixed probe title, as the observable proof that the path works. That is
  a capability check, not a work title — `setup` still derives, emits and applies none.
- **Once, as soon as the subject exists:** the issue or pull-request title has been read, the plan
  H1 has been read, the review or maintenance scope is fixed, or the requirement is clarified —
  whichever comes first for the running tool. A delegating parent leaves the emission to its
  delegate, and a delegate never repeats a subject its parent already proposed. Restate the title
  in the completion report only if the final scope diverged from it. Deciding the title and sending
  it are separate moments: decide it here, but where a rename path applies it, send it as the run's
  **last** action, because a pending rename request expires. The mechanism fragment owns that bound.
- **Subject first:** `<Subject> · <tool>`, at most 60 characters, cut at a word boundary. Reuse an
  existing artifact title verbatim — plan H1 without a legacy number, issue title without its
  `[R-XXXXXXX]` prefix, pull-request title without its Conventional Commit type — instead of
  paraphrasing it; otherwise use a short noun phrase from the requirement. For several issues, name
  the first subject and append `+N`. Append an identifier such as `#123` only where it aids lookup,
  never in front. No workflow-name prefix, no echo of the invocation, no AI attribution.
- **One line, never blocking:** output `**Suggested session title:** <title>` and nothing else — no
  explanation, no follow-up question, and never in place of the run's own output. The label follows
  the conversation language while a reused artifact title keeps its own. Never put secrets or
  credential values in a title; the session list is a persistent visible surface.
