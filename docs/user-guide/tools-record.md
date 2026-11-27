# Record work

## `/effective-flow capture`

Turn a problem described in the session, an idea or a pasted list of findings into tracker issues:

```text
/effective-flow capture The label reader drops the last page when there are more than 100 labels.
```

Capture supports configured GitHub and Forgejo remote trackers. Local, external, unset and hidden
tracker modes stop before tracker access. The tool is interactive only; automation cannot approve
publication. A call processes at most ten findings and reports the remaining input positions.

Each draft stands on its own: Problem, Current state (verified references), Proposal, Acceptance
criteria and Open questions. Problem and Proposal are required; empty optional sections are omitted.
The headings and prose use `language.forge`, including when you comment on an existing issue.
References are checked at the fetched delivery base; uncertain behaviour belongs in Open questions.
Originating session references, personal data and attribution are left out.

You see the full stored draft, exact existing labels, security classification and up to three
candidate links before deciding separately for each draft:

- **Create** the issue as shown.
- **Revise** once from your correction, repeating reference checks and duplicate comparison.
- **Skip** without a tracker write.
- **Comment on candidate**, when candidates exist, using the same body without the title.

Duplicate comparison is deterministic, not semantic search: open issues and closed issues updated
within 90 days are compared by normalized title tokens, with a lower threshold for shared verified
repository paths. Closed candidates are shown with their state and can receive a comment.
Third-party issue prose stays inside the helper and never enters the orchestrator's context.

Only existing repository labels are offered. Internal `effective-flow-*`, `firmo-*` and `sf-*`
labels are excluded. Missing label reads mean unlabelled drafts; no label is ever created. The
post-create read reports the labels actually applied and any difference from your approved set.

Security-relevant or uncertain drafts need a separate disclosure confirmation for creating or
commenting. The tool shows repository visibility; unknown visibility is treated as public.
Skipping is the default. Skipped security drafts are repeated in chat and never referenced by a
published artifact. Publication checks block high-confidence secret and attribution findings;
lower-confidence local paths or credential assignments need individual acknowledgements.

The helper binds the preview to a persisted write set and stamps each draft before writing. An
unknown outcome is never retried in the run. Recovery matches only the current viewer's exact title
and recent creation time; ambiguous matches stop. Temporary context, drafts, ledgers and input files
are removed on every normal ending; day-old inactive leftovers are swept on entry. These hashes
detect tampering and do not authenticate a user approval.

On T3 Code, each created issue is linked once; a failed link is reported without blocking the run.
The result lists number, title, URL and actual labels. Continue with `/effective-flow triage #<N>`
or `/effective-flow plan-issue #<N>`. A run that creates no issue recommends no follow-up.

Capture does not replace the finding format of `review` or change `retro` output. You can paste
retro results into a new capture call.
