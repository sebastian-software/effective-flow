**Issue-assessment criteria.** These three scales are item-intrinsic: each judges one issue or one
local plan on its own, without a goal. A consumer adds its own goal or verdict rules on top and
never redefines a scale.

- **A2 architecture-fit:** `fits` / `needs-adaptation` / `contradicts`, against the current
  architecture the repository states (ADRs, README, concepts, module layout). `needs-adaptation`
  means the change works after a named adjustment of an existing boundary or contract;
  `contradicts` means it reverses an accepted decision or boundary. `contradicts` cites at least
  one repository file as `path[:line]`, never the summary alone.
- **A4 size:** `S` / `M` / `L` / `oversized`. `S` is one local change, `M` several files in one
  area, `L` several areas that one plan still delivers; `oversized` combines independent outcomes
  or is too large for one plan and must be split first. This is the only definition of "fits one
  plan": an item fits one plan exactly when A4 is not `oversized`.
- **A5 overlap:** `none` / `overlap` / `duplicate` / `already-implemented`, against other issues,
  plans and the repository. `overlap` partly covers its target, `duplicate` asks for the same
  outcome as its target, and `already-implemented` is delivered by the current base. Each of the
  last three names one target (an issue, a plan or a repository `path[:line]`) and carries
  `blocking: true|false`: `true` when the target makes the item redundant. A partial `overlap` is
  never blocking.
