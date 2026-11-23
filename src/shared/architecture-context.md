**Architecture-context brief.** The architecture leaf reads the repository's ADRs, README,
concepts and module layout under `CHECKOUT_ROOT`, never `.effective-flow/` or issue data, and
writes one summary of the current architecture to exactly the new file its handoff names, citing a
repository path, with a line where useful, for every claim. It returns `DONE` or `ABORT`.
