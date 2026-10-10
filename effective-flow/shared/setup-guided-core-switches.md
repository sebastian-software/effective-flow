## Guided core switches

This fragment is loaded only when Step 3 entered Guided mode and the run reaches Step 4. Profile
and Express never load it. Step 4 in `effective-flow setup` keeps the hidden-mode forced values and the
**Base branch** rule.

These core switches determine the everyday behavior. **Before** each question, provide a short,
understandable explanation (what is it, why is it relevant, what does the choice mean) –
without assuming prior knowledge of Effective Flow – and state whether and with which value the
switch is currently set in the config (see Step 2); pre-select this value or the safe
default, which on a scored question means naming it in that explanation while the options keep
their order and labels. Explain technical terms in one sentence at first mention.

**Worktree.** Explain: Effective Flow implements changes by default in a separate workspace
with its own branch (a "worktree"), so that your current state stays untouched and the
work is cleanly bundled; "No" works directly in your current checkout.

Ask the user: **Should the implementation run in a separate Git worktree?**
Before asking, score each option for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Yes -- worktree.enabled = true (default) — the implementation runs in a separate worktree with its own delivery branch
- No -- worktree.enabled = false — in-place without a worktree; delivery branches are created in the main repo when needed

**Completion action.** Explain: how finished changes are brought in. `merge` brings them
directly into the target branch, `pr` opens a pull request (review before integration), `branch`
just leaves the branch; "ask at run time" decides anew each time.

Ask the user: **Which completion action should Effective Flow use by default?**
Before asking, score each option except "Ask at run time" for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Merge -- delivery.completion = merge (default) — merge the branch locally into the base branch, without a PR
- Pull request -- delivery.completion = pr
- Branch only -- delivery.completion = branch
- Ask at run time -- delivery.completion = null — the action is asked per run

**Base branch.** Ask it here, in this order, exactly as the **Base branch** paragraph of Step 4
states it.

**PR review.** Explain: when a run creates a pull request, Effective Flow can post that run's
review findings on it as comments. "Ask each time" decides per run, "Always" posts without asking,
"Never" switches the automatic step off; an explicit `effective-flow review <PR>` stays available in
every case.

Ask the user: **Should Effective Flow post its review findings on a pull request it created?**
- Ask each time -- delivery.prReview = ask (default) — a gated run asks once per delivery
- Always -- delivery.prReview = always — post the findings without asking
- Never -- delivery.prReview = off — no automatic posting; an explicit review of a PR is unaffected

**Project and surface languages.** Explain: the project language is the fallback for every new
human-readable artifact, while optional surface overrides let source prose, documentation,
workflow artifacts, Forge communication, and Git history differ. A plan is entirely in the
workflow language, including its status marker. `language.chat` is the one non-artifact surface:
it fixes the language Effective Flow speaks to the user in — replies, questions, and completion
reports — and, left unset, mirrors whatever language the user writes in. Only `de` and `en` are
supported; German maps to `de-DE` typography and English to `en-US`.

Ask the user: **Which default language should Effective Flow use for this project?**
- English -- language.project = en (default)
- German -- language.project = de

Then offer each override in turn: `language.source`, `language.documentation.user`,
`language.documentation.technical`, `language.workflow`, `language.forge`, `language.git`, and
`language.chat`. For every artifact-surface override, offer **Inherit project language** first,
then English and German; `language.chat` offers **Mirror the user's language (default)** first,
then English and German, because an absent chat row mirrors instead of inheriting. Inherit and
mirror are alike represented by an absent row, not `null`; removing an existing override is a
normal before/after change that requires confirmation. Explain the exact target surface from the
shared language table. In particular, a Conventional Commit PR title uses `language.git`, while the
PR body and comments use `language.forge`.

Before asking, detect compatibility input. If `language.workflow` is absent and a valid
`plan.markerLanguage` exists, show the old value and explain that migration changes it from a
marker-only language to the language of the complete plan/review artifact. Propose adding
`language.workflow = <legacy value>` and removing `plan.markerLanguage`; do neither before the
confirmed Step 6 write. If no `language.*` and no legacy key exist, use the existing-plan fallback
only when plan prose, canonical fields, and marker all consistently identify one language;
propose that as `language.workflow` and point to setup. Do not infer from a marker alone, and do
not guess for mixed, contradictory, empty, or unclear corpora.

**Tracker.** Explain: where issue work ends up – `local` as a Markdown report in the project
(`.effective-flow/review/`), `remote` as issues on GitHub/Forgejo (useful for teamwork), or
`external` as issues in a separate project-management tool the team already uses. Mention that the
external option needs a connection that already exists on this machine (an MCP connection or an
authenticated CLI) and that Effective Flow ships no product-specific adapter, so a run aborts
rather than guessing when it cannot find exactly one usable connection. Pull requests always stay
on the Git forge, whichever option is chosen.

Ask the user: **Where should issue work live: locally as a Markdown report, remotely as issues (GitHub/Forgejo), or in an external tool?**
Before asking, score each option for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Local -- tracker.mode = local (default) — Markdown report under .effective-flow/review/
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)
- External tool -- tracker.mode = external — issues live in the project-management tool named by tracker.externalTool

For "Remote", ask for the tool override only if needed: the default `tracker.remoteToolOverride = auto` lets the shipped remote helper classify exact `github.com` origins and hosts that match a configured Forgejo `tea` login. Any other host returns `AMBIGUOUS_HOST` instead of guessing; then capture `github` or `forgejo` as free text. Otherwise leave `auto`.

For "External tool", ask the connection follow-ups and explain each before asking:

1. `tracker.externalTool` – the short, stable identifier of the tool that holds the issues. It is
   required for this mode, there is no list of supported tools, and Effective Flow derives no
   capability from the name. Without a value the mode stays unusable, so ask again instead of
   writing an empty entry.
2. `tracker.externalToolHint` – optional free text that lets a run find the right connection at
   run time: MCP server name, workspace, team or project key, the tool's identifier convention, and
   the names of its states. Explain that a precise hint is what prevents an ambiguous-connection
   abort when several candidates exist.
3. Discover exactly one configured connection from those values and list its writable native
   workflow states **fresh in the selected workspace/team/project context** before proposing
   `tracker.externalStartedState`. Show every candidate's display name and stable ID, or exact
   accepted token only when no ID exists. Validate an existing value by stable value, context,
   normalized `started` category, writability, and non-terminal state. If it is valid, keep it. If it
   is absent and exactly one candidate is normalized as `started`, propose that candidate's display
   name and stable value. With zero or multiple candidates, an unavailable/ambiguous connection, or a
   stale/read-only/terminal/cross-context configured value, propose no favorite and leave the value
   `null`; report that issue-backed implementation will fail closed until setup can verify one.
   Persist the suggestion only in the confirmed Step 6 write. Never infer a state from the tool name
   or a familiar display name.
4. `tracker.externalDoneState` – the terminal counterpart, resolved from the same fresh state list in
   the same context. Explain what it is for: the merge gate's offered post-merge transition reads it,
   and so does that gate's post-merge observation of an issue it finds already terminal, which needs
   the value to tell a completed issue from a withdrawn one. It never closes anything by itself. Validate an existing value by stable value,
   context, normalized done category, terminal flag, and writability. If it is valid, keep it. If it
   is absent and exactly one writable, terminal candidate is normalized as a done category, propose
   that candidate's display name and stable value. Terminal alone is not that filter: a tracker that
   spells cancellation as a terminal state offers a writable, terminal candidate that means the
   opposite of done. With zero or multiple candidates, an unavailable/ambiguous connection, or a
   stale/read-only/non-terminal/cross-context configured value or one whose category is not done,
   propose no favorite and leave the value
   `null`; report that the post-merge transition will be offered as unavailable until setup can
   verify one, which leaves the issue open rather than failing a run. Persist the suggestion only in
   the confirmed Step 6 write. Never infer a state from the tool name or a familiar display name.

`tracker.remoteToolOverride` stays a forge setting and is not asked for in this mode. Keep an
already recorded
`externalTool`/`externalToolHint`/`externalStartedState`/`externalDoneState` when the mode is `local`
or `remote`: they document intent, are preserved unchanged, and are simply ignored for routing.
