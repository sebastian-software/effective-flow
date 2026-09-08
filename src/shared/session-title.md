## Session title

Hosts derive a session title from the **first** message, so a run is listed as
`Effective-flow plan R-0000010` long before its subject is known. Once the running tool knows that
subject, propose a better title — once.

- **Only where sessions carry titles:** emit only when the host exposes a session-management or
  session-title capability, or an Effective Flow rename path applies. Where sessions carry no titles
  at all, stay silent. Never call such a tool for the current session except through a mechanism this
  contract explicitly establishes as a host-native path that carries **no id at all** — an omitted
  task id, or a fixed sentinel the host itself resolves to the calling session; never retitle another
  session, and never probe speculatively. Where the running host has an established
  rename path and the loaded mechanism fragment reports success, apply the title silently instead of
  proposing it and report nothing further. Otherwise emit the suggestion line once — no established
  path, an unavailable or failed path, or a run that cannot tell. The mechanism fragment owns how the
  host is identified, when the operation is sent, and how its reported outcome is judged. On the
  ChatGPT Desktop current-task path, a later automatic title may replace one the user set manually;
  do not list or read tasks to infer title ownership. On the Claude Code path the host owns that
  consent instead: it replaces a title the user set only after asking them, and an unattended session
  declines rather than being asked — both simply arrive as the call's reported outcome, and neither
  licenses reading the session back to infer who set its title.
- **Only from work-subject tools:** `concept`, `concept-review`, `plan`, `plan-issue`, `apply`,
  `apply-plan`, `apply-review`, `apply-issues`, `build`, `fix`, `refactor`, `docs`, `maintain`,
  `review`, `iterate`, `investigate`, and `deliver`. `version`, `open-plans`, `setup`, `cleanup`,
  `commit`, `pr`, and `merge-gate` stay silent. Every exposed tool sits in exactly one of those two
  lists, and internal sub-agents and workers never emit. One carve-out: `setup`'s capability probe
  renames the session once with its own fixed probe title, as the observable proof that the path
  works. That is a capability check, not a work title — `setup` still derives, emits and applies none.
- **Once, as soon as the subject exists:** the issue or pull-request title has been read, the plan
  H1 has been read, the review or maintenance scope is fixed, or the requirement is clarified —
  whichever comes first for the running tool. A delegating parent leaves the emission to a delegate
  that emits, keeps it when every delegate is silent, and a delegate never repeats a subject its
  parent already proposed. Restate the title in the completion report only if the final scope
  diverged from it. Deciding the title and applying it are separate moments: decide it here, while
  the mechanism fragment owns when its host-specific operation is sent. The subject is fixed here
  while the reference is resolved when the title is applied or emitted, so every late-applying path
  needs nothing further. An early-applying path — the ChatGPT Desktop and Claude Code native
  calls — re-derives the title when its inputs change, as when the first carried no
  reference, one now exists, and the resulting title differs. Its mechanism applies it again, as
  often as that fragment allows.
- **Reference first:** `<Reference> · <Subject> · <tool>` with the same `·` separator, and
  at most 60 characters, cut at a word boundary; no reference leaves `<Subject> · <tool>`. Reuse an
  existing artifact title verbatim — plan H1 without a legacy number, issue title without its
  `[R-XXXXXXX]` prefix, pull-request title without its Conventional Commit type — instead of
  paraphrasing it; otherwise use a short noun phrase from the requirement. A reference is a forge
  issue or pull request `#<number>`, a tracker issue's tool-native id such as `SEB-123`, or a
  finding `R-XXXXXXX` absent a tracker reference; several issues, the first one's reference plus
  `+N`; anything else, a legacy plan number included, none. Exactly one segment, tracker reference
  over finding ID. A reference token, before any `+N`, is a whitespace-free run of letters, digits,
  `#` and `-`, at most 16 characters; a non-matching candidate is omitted, never trimmed or
  sanitized into shape. Over the cap cut the subject, then the `<tool>` segment, never the
  reference; a bare reference over it yields none. No workflow-name prefix, no echo of the invocation, no AI attribution.
- **One line, never blocking:** output `**Suggested session title:** <title>` and nothing else — no
  explanation, no follow-up question, and never in place of the run's own output. Wherever it is
  emitted at all, it is printed in the run's completion report, by which time the reference is
  bound — never earlier and never twice. The label follows the conversation language while a
  reused artifact title keeps its own. Never put secrets or credential values in a title; the
  session list is a persistent visible surface.
