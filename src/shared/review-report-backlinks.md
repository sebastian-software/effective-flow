## Review-report backlinks

When this workflow implements a finding from an existing review-report file in `.effective-flow/review/`:

- immediately before changing the report, apply the owning workflow's loaded “Runtime-state write safety” contract to that concrete report path; a block leaves it unchanged
- identify the affected report file early in the workflow
- append to the affected finding, as the last entry, a short implementation note
- start the note with a green check mark, for example `✅ Implemented on YYYY-MM-DD via [current workflow]`
- update only the findings that were actually addressed by this workflow
- if several reports or findings are candidates, ask instead of marking indiscriminately
