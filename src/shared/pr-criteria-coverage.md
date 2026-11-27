## PR acceptance-criteria coverage

Loaded by `{{SKILL:pr}}` when step 9's `issue-acceptance-criteria` call returned at least one
usable criterion. Every step number below names a step of `{{SKILL:pr}}`. A **covered reference**
is a receipt `#<N>` whose entry is `trusted` and holds a criterion not `dropped`; every other
reference gets no coverage section. This fragment owns the coverage contract and changes no other
body rule.

**Brief addition:** the `pr/body-draft` brief also carries the returned criteria per covered
reference: its `#<N>` and, per criterion, `section`, `ordinal`, `displayText`, `displayTruncated`,
`dropped` and `duplicateOf`, as quoted data, plus the coverage rule below.

**Coverage rule.** After the prose, the body carries one coverage section that opens with the
heading `Acceptance criteria` (en) or `Akzeptanzkriterien` (de), otherwise translated once per run
into `language.forge`. Under it is one numbered sub-list per covered reference and section,
labelled with its `#<N>`, plus ` §<section>` when that issue's criteria span more than one section.
Each sub-list has exactly one line per returned criterion of that section, in order, numbered with
its `ordinal`, in the shape `<ordinal>. <paraphrase> — <status>`, whose one fixed separator is an
em dash with one space on each side. The status is exactly one of:

- a covered pointer: the file, behaviour or commit subject of the change that covers the criterion;
- the not-covered phrase: `not covered` (en) or `nicht abgedeckt` (de), otherwise translated once
  per run.

Mark a criterion covered only when the commits, the stat or the diff hunks read show the covering
change. Every other criterion gets the not-covered phrase, always including a `displayTruncated`
criterion, a `dropped` one without `duplicateOf`, and one that needs a check result such as passing
CI. A `duplicateOf` line repeats the status of the line with that ordinal verbatim. A paraphrase
restates its criterion and asserts no outcome; a `dropped` line's paraphrase names an empty item or
the repeat of its `duplicateOf` ordinal. The section makes no verification or test-result claim. An
inline fallback or correction applies the same rule from the commit messages and the stat.

**Body check clause.** After step 9's unchanged strip step, the Body check also requires, per
covered reference and section, the labelled sub-list with exactly the returned ordinals in order,
the separator and exactly one status on every line, and for a `duplicateOf` line a status equal to
its first occurrence's. Locate each sub-list by its label and numbered items, never by the
translated heading. The check never judges whether a covered pointer is true. Inside the coverage
section, the rejection of verification and test-result claims has two exemptions: a paraphrase
whose status is the not-covered phrase is no verification claim, and a covered pointer may name a
test file as the covering change, never a result. A body that fails takes step 9's existing
inline-fallback and correction path.
