## Profile-first setup

This fragment is loaded only for `{{SKILL:setup}}` with no argument or the explicit `profile`
argument. It owns the two common questions, the transient topology overlays, and the
external-only integration interview. It is never loaded by Express or Guided, introduces no
configuration key for the profile itself, and gives no write authority: the shared Step 6 preview
and confirmation remain the only authority for profile-dependent configuration, ADR, marker, and
migration writes.

### The two common questions

Ask these immediately after setup has classified the argument and resolved the entry language
read-only. They are the first two substantive configuration questions, before `.gitignore`, source,
ADR-convention, non-Git, invalid-source, duplicate-ADR, and topology handling. Do not guess either
answer in a non-interactive run; state that Profile needs both selections, that External + forge may
need integration details, point to explicit `{{SKILL:setup}} express` when the caller intentionally
wants defaults, and stop without mutation.

Entry-language resolution is silent and non-mutating. If the configuration source is missing,
invalid, or ambiguous enough that no configured chat value can be trusted without surfacing a later
diagnostic, use the recognizable conversation language for this bootstrap and defer that diagnostic
or question until after both common asks. Source discovery must never move a conditional prompt
ahead of `Chat` or `Profile`.

First ask in the language resolved at entry:

```ask
header: Chat
question: Which language should Effective Flow use in this chat?
options:
  - label: Mirror
    description: Mirror the user's recognizable language and remove any language.chat row on the confirmed write
  - label: English
    description: Use English from the next question onward and persist language.chat = en on the confirmed write
  - label: German
    description: Use German from the next question onward and persist language.chat = de on the confirmed write
```

Bind the answer for the remainder of this setup run under the setup-only exception in
`chat-language`. `Mirror` binds the user's recognizable conversation language for this run and
records an absent `language.chat` row as the pending choice; it never writes `null`. English and
German bind `en` or `de`. Render the second ask and every later setup output in that newly bound
language. The pending row addition or removal is applied only after the current values are known and
the common Step 6 confirmation succeeds.

Then ask exactly these three workflow topologies; Express and Guided are modes, not profile options:

```ask
header: Profile
question: Which workflow profile should Effective Flow apply?
options:
  - label: Fully local
    description: Planning, findings, implementation, and completion stay local without forge issues or pull requests
  - label: Forge + issues
    description: Issue-backed planning and tracking plus development use GitHub or Forgejo, with pull-request delivery
  - label: External + forge
    description: Issue-backed planning and tracking use an external tool; branches and pull requests stay on GitHub or Forgejo
```

Retain both answers unchanged across every later preflight and source re-read. The two forge-backed
profiles route issue-backed planning and tracking to their selected tracker. A natural-language
`{{SKILL:plan}}` request without an issue reference still creates a local plan file under
`plan.dir`; profile selection does not change that gateway.

### Target construction and ownership

After setup has completed Steps 1 and 2, construct the Profile target in this fixed order:
`safe defaults → freshly read existing known and unknown values → selected topology overlay → chat
choice`. Preserve all unrelated known values and every unknown row byte-for-byte. The topology
overlay intentionally wins over existing values only for the keys listed below. Dormant external
or forge-provider rows remain untouched when the selected mode ignores them.

| Profile          | Profile-owned target values                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fully local      | `tracker.mode = local`; `delivery.completion = merge`; `delivery.baseBranch = <current or retained valid local branch>`                                                                                    |
| Forge + issues   | `tracker.mode = remote`; `delivery.completion = pr`; `delivery.baseBranch = <verified origin default>`; `tracker.remoteToolOverride = auto` only when the helper classifies the origin without an override |
| External + forge | the forge delivery values above; `tracker.mode = external`; the verified external tool, sufficient connection/context hint, required started state, and optional done state described below                |

Do not write `setup.profile`, `profile`, or any equivalent identity row. Review depth, validation,
worktree policy, branch prefix, `delivery.prReview`, return branch, merge method, merge-gate policy,
plan/concept paths, skills, and artifact languages are not profile-owned and therefore remain safe
defaults or preserved existing values.

### Fully local preflight

Require a usable Git repository with a named, born local branch. Use the current local branch for
`delivery.baseBranch` even when `origin` exists; never select a remote ref, create a pull request, or
publish issue work for this profile. A detached HEAD may reuse an already-recorded local base only
after that branch is verified to exist locally; otherwise stop and direct the user to check out a
named branch or use `{{SKILL:setup}} guided`. On an unborn branch, outside Git, or where no valid
local branch can be proved, stop before the profile-dependent configuration write. Never persist a
commit SHA as a base merely to avoid a question. Worktrees remain available because they are local
Git isolation, not forge usage.

### Forge preflight shared by both forge-backed profiles

Require an `origin` URL that names a repository on GitHub or Forgejo, an authenticated matching CLI,
and a repository-derived base. Invoke the shipped remote helper's read-only `repository-resolve`
operation so its exact host classification and authentication behavior remain authoritative. Derive
`delivery.baseBranch` from the branch named by `origin/HEAD`, falling back to `origin/main` only when
that symbolic ref is absent, and verify the resulting remote ref. Record the provider and base as
preview evidence.

When the helper classifies the origin without an override, set
`tracker.remoteToolOverride = auto`. On an ambiguous or custom host, reuse a valid recorded
`github` or `forgejo` override only when it lets the helper resolve this exact origin; otherwise stop
before writing and direct the user to `{{SKILL:setup}} guided`. A missing origin, failed
authentication, ambiguous provider, or unresolvable base never downgrades to Fully local and never
guesses a provider or branch.

### External-only integration interview

External + forge first completes the forge preflight, then sets `tracker.mode = external` and asks
only for missing or changed external integration data. Do not enter Guided's worktree, delivery,
language, tracker-mode, or advanced questions. Preselect a recorded value only after validating it
under the rules below.

1. Ask for `tracker.externalTool`, the short non-empty identifier of the tool holding the issues,
   when no valid value is recorded. There is no whitelist: the name proves no capability, state,
   connection, or identifier convention. An empty or unanswered value stops without writing.
2. Ask for an optional `tracker.externalToolHint` describing only non-secret connection identity:
   an MCP server or authenticated CLI plus workspace, team, project, or identifier convention. Use
   the recorded hint as a preselection, but never inspect environment credentials, dotfiles, or
   shell history and never echo or persist tokens.
3. From that tool and hint, discover read-only exactly one configured MCP connection or installed,
   authenticated CLI whose exposed capabilities satisfy the provider-neutral tracker contract. If
   several connections or contexts remain, show their non-secret stable identities and ask which
   exact workspace/team/project context applies. An unanswered ambiguity, no connection, or missing
   capability stops without inventing a connector or falling back to the forge/local tracker.
4. When the explicit context selection was necessary for unique discovery, merge enough stable,
   non-secret workspace/team/project identity into the proposed `tracker.externalToolHint` to make
   the same connection and context uniquely reselectable. Preview the exact resulting hint. If the
   hint cannot reproduce that selection read-only, stop rather than persisting it.
5. List writable native workflow states fresh in that exact context. Show each candidate's display
   name, stable ID—or exact accepted token only when the connection exposes no ID—normalized
   category, terminal flag, and writability. Validate a recorded started state only by stable value,
   exact context, `started` category, writability, and a non-terminal flag. Otherwise ask the user
   to select one valid candidate explicitly. Zero candidates, an unanswered selection, or an
   invalid state stops before writing; never infer one from a familiar display name or tool name.
6. From the same fresh list, validate or ask for an optional done state using stable value, exact
   context, a normalized done category, writability, and a terminal flag. Cancellation is terminal
   but not done. The user may deliberately choose no done state; propose
   `tracker.externalDoneState = null` and disclose in the common preview that the merge gate's
   post-merge transition and terminal-done reconciliation remain unavailable, leaving the issue
   open. Never infer a done state from a display name.

Retain for the pending preview only: selected connection identity, exact context identity, proposed
tool and reproducible hint, selected started/done stable values, and for both states their normalized
category, terminal flag, and writability. Retain no credential or unrelated connector metadata.
Step 6 must show this evidence and, after confirmation, freshly replay the exact proposed tool/hint,
connection/context, and every validity-affecting state property immediately before writing. Drift
invalidates the preview: stop, or rebuild the complete preview and obtain a new confirmation.
