## Setup status

This fragment is loaded only when Step 0 of `{{SKILL:setup}}` classified the invocation as
**Status**: exactly `{{SKILL:setup}} status`. Status is a read-only diagnosis. It poses no
question, changes no file, Git state or runtime state, and offers no inline fix; for each problem
it only names the setup form or manual step the envelope gives. A non-interactive run produces the
same report.

### The status call

Run `node <skill-root>/scripts/setup-status.mjs status` once with exactly one JSON object on
standard input, `{"cwd": "<absolute path of the checkout setup was invoked in>"}`, and nothing
else: the script resolves and verifies the runtime root itself. A missing Node, a nonzero exit, an
output other than one parseable envelope line, or `ok: false` is reported with its `error.code`
and message, and the run ends there with no next-steps block. Status makes no separate
`config-resolve` call: its chat language is `data.configuration.chatLanguage` when set, otherwise
the conversation language, otherwise `data.configuration.projectLanguage`, otherwise `en`.

### The report

Render `data` as the four sections below in the resolved chat language. Each finding's
`remediation` is the envelope's text: render it, keep encoded values, paths, keys and invocation
tokens verbatim, spell its `effective-flow setup …` invocation as `{{SKILL:setup}} …`, and add no
remediation of your own.

1. **Configuration** (`data.configuration`): the `state`; for `configured`, the source
   (`source.step`, `source.path`) and `visibility`; every `diagnostics[]` entry with its code, path
   or key, and remediation; for `not-set-up`, that the project is not set up, with the section's
   `remediation`; for `error`, the resolver failure (`code`, `detail`, message, remediation) as the
   configuration finding, while every other section still renders. Then every row of
   `data.retired[]` (beside `data.configuration`, not inside it): `key`, `successor`, the tools in
   `stop` (they would stop on it) and in `report` (they would only report it), the names in
   `unmappedTools[]` as given, and its remediation; with `conditional: reviewer-resolved`, that the
   stop applies only when a reviewer matching `normalizedLogin` is resolved; every `evaluations[]`
   entry with an `error` as "could not check" for its `tool` and `mode`; with
   `toolMapping: resolver-names`, that the tool names are the resolver's own.
2. **Ignore state** (`data.ignore`): the `state` and `visibility`; for `problem` or
   `could-not-check`, the `reason`, `detail`, any `paths[]`, and the remediation; `not-applicable`
   outside a Git repository; every `notes[]` entry with its `code`, `path` or `paths`, `detail` when
   not `null`, and remediation.
3. **Domain owners** (`data.domainOwners`): with `state: could-not-check`, report `could not check`
   with the `reason` and nothing else. Otherwise overlay this session's own available-skill list on
   `owners[]`: an owner whose `skill` that list lacks is "not installed (according to this session's
   skill list)" for every tool in its `tools[]`, with its `missingRemediation`, and no line of its
   `disabled[]` renders; for any other owner, each `disabled[]` entry disables it by configuration
   for its `tool`, naming its `causes`, with the owner's `remediation`. Render **one line per owner
   and cause**, never one per tool: the owner, the cause, and the affected tools with the
   consequence "`<tool>` runs its minimal fallback". With `configurationApplied: false`, say the
   configured skill scopes could not be applied. Close with the count of owners that are installed
   and enabled: in the skill list, with an empty `disabled[]`.
4. **Version** (`data.version`): the `state` (`current`, `outdated`, `ahead`, or `could not check`
   with its `reason`), `installed` and `latest`, the remediation for `outdated`, and the request it
   made (`request.method` and `request.url`), or that it made none. `could not check` never fails
   the run.

End the report with the next-steps block per the shared `next-steps` contract: it recommends
`{{SKILL:setup}}` only when `data.setupFixable` is true; otherwise the run emits no block. The
options follow `data.setupForms` in order, one per form and at most two: `setup` is bare
`{{SKILL:setup}}` (an empty setup argument), `setup guided` is `{{SKILL:setup}} guided`,
`setup hidden` is `{{SKILL:setup}} hidden`, and `targeted` is `{{SKILL:setup}} <request>` with the
first Targeted request the remediations name, its line saying that any others follow the same way.
With more than two forms, the second line also says that the report's remaining forms follow the
same way. Bare `{{SKILL:setup}}` is an option only for the `setup` form. An owner missing from the
session's skill list never makes the report setup-fixable.
