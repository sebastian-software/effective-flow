## Commit message rules

`effective-delivery` owns commit-message craft and is authoritative when present: deriving the
message from the staged diff, choosing a recognized type from the actual change, the
subject-boundary test, and when a body is owed. It states classification by effect in its general
form — `chore:` is no escape hatch for a user-visible change — but neither of the two refinements
below, which therefore **override** it: deployment-effective **config/env/secrets/CI** is not
`chore:`, and the **squash PR title** is the release signal and carries the same classification.
The two bans below are scope constraints rather than a second copy: this
repository states unconditionally what the skill makes conditional on a repository, host, or user
requirement.

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- **Minimal fallback when `effective-delivery` is absent or undiscovered** — the floor that keeps such a run able to write an acceptable message, and not a second copy of the skill's guidance on choosing between types: take the type from the Conventional Commit set `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`; state concretely what was changed and why; and never settle for a generic message such as `update files` or `misc changes`. Several sources embed this fragment without recommending the skill, so the floor carries that substance itself rather than deferring it.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.
