## Review depth

This rule sets how much review a correction receives after the first review. The loading workflow
names its first review, its further corrections, who performs the re-check and a full pass, and
where its review results go.

### Default coverage

The routed reviewers review the change, then exactly one incorporation pass corrects their
findings. The affected review checks then run once, in this order: the cumulative and delta
render, the floor classification, the scoped re-check, and a full pass only on the paths a trigger
or floor hit widens. With no incorporation pass (no findings), no re-check runs. A user's
explicit request for a full re-review is honored as user-requested depth.

### Delta render

Retain the `currentTree` of the render that fed the first review as `reviewTree`. After the
incorporation pass, render the cumulative diff first, then render again with
`sinceTree: reviewTree`; the delta path list and patch are the **changed areas**. A `reviewTree`
equal to the current tree yields an empty delta, so the re-check only confirms the corrected
findings. A failed render stops the step, as `diff-baseline` requires; a delta render refused
after a successful cumulative render is a failed render too.

Only when no `reviewTree` was retained is the review-input tree unavailable. Then there is no
scoped path: every affected routed reviewer runs a full pass on the cumulative path list, and the
review results record the reason.

### Triggers

A correction triggers a full pass when:

- (a) it changed a file that no corrected finding named — triggering paths: those unnamed files;
- (b) it touched a floor boundary (see "Fixed floor") — triggering paths: the floor-hit files;
- (c) the scoped re-check cannot confirm a corrected finding as resolved — triggering paths: that
  finding's files;
- (d) it changed a recorded assumption, an acceptance criterion, an architecture decision, or public
  behavior — triggering paths: the files that carry the changed contract or behavior.

A triggered full pass runs the routed reviewers of the triggering paths on those paths only, with
the cumulative diff as context. It never repeats the whole review; every other path keeps the
scoped re-check.

### Scoped re-check

Without a trigger, the re-check verifies each corrected finding and reports any defect the
correction introduced inside the changed areas. A re-checking reviewer receives `deltaDiffPath`,
its bucket's slice of the delta entries, its corrected findings, and `diffPath` as context. A
finding outside the changed areas names the trigger or floor boundary that justifies it. The
report has three parts:

1. **Changed areas:** the delta render's paths.
2. **Verified findings:** each corrected finding confirmed as resolved, with its evidence.
3. **Open evidence:** what could not be confirmed; an unconfirmed corrected finding is trigger (c).

An admission-`uncertain` residual keeps its bounded evidence check and its stop or block; it starts
no extra pass.

### Fixed floor

The floor applies to every correction that no later review covers: the incorporation pass, plus
each further correction or containment the loading workflow names. Before such a correction is
accepted, classify each changed path from its path **and** its hunks in the delta patch (`sinceTree`
is the `currentTree` of the last render before the correction) and record per path the boundary
hit, `none`, or `uncertain`. A floor classification of `uncertain` counts as a hit (fail closed).
A generic path decides nothing: an edited authorization check in `utils/` is a hit or `uncertain`,
never `none`. The classification record goes into the loading workflow's review results.

The boundaries:

- security, authentication and authorization;
- secrets and credentials;
- data protection and personal data;
- persistence, schema and migrations;
- destructive or irreversible data operations;
- money and billing;
- public API and cross-module contracts;
- dependency manifests and lockfiles;
- CI, release and delivery configuration.

The list is fixed: changing it is a deliberate rule change, never a per-run reviewer judgment. A
hit is trigger (b), and its full pass covers the hit paths with the reviewer the loading workflow
names for a floor hit.
