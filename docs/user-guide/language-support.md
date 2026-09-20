# Language support

Effective Flow covers the full workflow lifecycle – clarification, implementation,
documentation, testing, validation, qualitative review, and delivery. The depth of language
expertise differs by route.

## Support matrix

| Product or file scope                                                                | Implementation                              | Qualitative review                                 | Tests and validation                                     | Documentation                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Frontend JavaScript/TypeScript                                                       | Specialist `ui-implementer`                 | Specialist `frontend-reviewer`                     | Existing JS/TS and framework commands                    | JSDoc/TSDoc and repository conventions                 |
| Node.js backend or CLI                                                               | Specialist `nodejs-implementer`             | Specialist `nodejs-reviewer`                       | Existing package scripts and project commands            | JSDoc/TSDoc and repository conventions                 |
| Rust                                                                                 | Specialist `rust-implementer`               | Specialist `rust-reviewer`                         | Existing Cargo and repository commands                   | rustdoc, crate/module docs, and repository conventions |
| Other clearly identified product languages                                           | Reduced-depth `generic-product-implementer` | Reduced-depth `generic-product-reviewer`           | Repository-native commands when safely discoverable      | Established repository conventions                     |
| Tooling, CI, build/release configuration, manifests, containers, repository metadata | Tooling-only `generic-implementer`          | Technical validation; no product-language reviewer | Repository-native commands when safely discoverable      | Established repository conventions                     |
| Ambiguous file role                                                                  | Focused clarification required              | Not started until classified                       | Safe checks may continue; ambiguous commands are skipped | Not changed until classified                           |

“Complete workflow” means lifecycle coverage. It does not mean identical specialist depth for
every programming language.

The Rust and Node.js implementers draw their language depth from the central
`effective-engineering` skill instead of keeping a second copy of it. For Rust the hand-over is
complete. For Node.js it covers the TypeScript language layer only – the Node runtime rules the
skill does not reach, among them HTTP handling, processes, logging, security and shutdown, stay
with the agent. If the skill is unavailable, both fall back to a short essential core and say so:
the route stays specialist, while its depth follows the skill you have installed.

## Reduced-depth product mode

For Python, Go, Java/Kotlin, .NET, Ruby, PHP, Swift, unknown languages, and other product code
without a dedicated specialist, Effective Flow automatically emits a visible reduced-depth
notice and starts the generic product workers. They do not claim language-specific expertise.
They first discover the repository’s own evidence, in this order:

1. Scoped repository instructions.
2. CI workflows and task runners.
3. Manifests and lockfiles.
4. Existing tests and neighboring code.
5. Current library documentation through an available documentation skill.

The workers preserve established architecture and security boundaries. They do not invent
commands, install dependencies or a toolchain, or introduce a new convention merely because a
common ecosystem default exists.

## Mixed repositories

Routing happens per affected file or domain. A Rust file keeps the Rust specialists even when a
Python service in the same repository uses reduced-depth workers; CI changes remain with the
tooling-only generic implementer. The presence of one manifest never demotes recognized
specialist files or decides the role of every file in the repository.

## Clarification and skipped checks

Clearly identified product code does not add a routine approval gate. Effective Flow asks only
when the product/tooling role is genuinely ambiguous or when a required native command is unsafe
to infer. If an existing check cannot run because its runtime, network access, secrets, or other
prerequisites are unavailable, validation reports it as skipped with the reason. It never
silently replaces the check or adds tooling.

## See also

- [Implement a change](tools-implement.md) – how routing applies during implementation.
- [Ensure quality](tools-quality.md) – how specialist and reduced-depth reviews are combined.
- [Skill discovery](skill-discovery.md) – how repository work can use current documentation and domain skills.
