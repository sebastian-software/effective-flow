# Project-role detection and routing

Use this contract whenever implementation, review, testing, validation, or documentation depends on the role of an affected file. Classify the requested files or domains independently; never infer one route for the whole repository from its first manifest.

## Ordered routing table

The table between the marker comments is a build-validated runtime contract. Keep its columns and route IDs stable. Evaluate rows in ascending priority and stop at the first matching row for each affected file or domain.

<!-- project-routing-table:start -->

| Priority | Route                         | Matcher            | Implementer                                           | Reviewer                             | Decision         |
| -------: | ----------------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------ | ---------------- |
|       10 | `excluded-generated-vendored` | `excluded`         | —                                                     | —                                    | `exclude`        |
|       20 | `documentation`               | `documentation`    | `{{AGENT:code-documenter}}` / `{{AGENT:docs-writer}}` | `{{AGENT:code-validator}}`           | `route`          |
|       30 | `tooling`                     | `tooling`          | `{{AGENT:generic-implementer}}`                       | `{{AGENT:code-validator}}`           | `route`          |
|       40 | `frontend-js-ts`              | `frontend-js-ts`   | `{{AGENT:ui-implementer}}`                            | `{{AGENT:frontend-reviewer}}`        | `route`          |
|       50 | `node-backend-cli`            | `node-backend-cli` | `{{AGENT:nodejs-implementer}}`                        | `{{AGENT:nodejs-reviewer}}`          | `route`          |
|       60 | `rust`                        | `rust-product`     | `{{AGENT:rust-implementer}}`                          | `{{AGENT:rust-reviewer}}`            | `route`          |
|       70 | `generic-product`             | `generic-product`  | `{{AGENT:generic-product-implementer}}`               | `{{AGENT:generic-product-reviewer}}` | `route-degraded` |
|       80 | `ambiguous`                   | `otherwise`        | —                                                     | —                                    | `clarify`        |

<!-- project-routing-table:end -->

## Matcher contract

Apply the matchers in table order:

- **Excluded generated or vendored content:** generated outputs, vendored dependencies, third-party source, build output, and dependency caches are excluded from direct editing and review by default. If the task explicitly changes a generator or vendor-update mechanism, route the owned source or tooling operation instead of its output.
- **Documentation:** documentation-only files and domains use the code documenter or docs writer according to the requested audience and artifact. Technical validation remains repository-native.
- **Tooling:** CI/CD, build and release tooling, container configuration, dependency manifests and lockfiles, repository metadata, and formatter, linter, editor, or task-runner configuration use the tooling-only generic implementer. A language manifest does not make that manifest product code.
- **Frontend JavaScript/TypeScript:** UI components and browser-facing JavaScript/TypeScript use the UI implementer and frontend reviewer. Strong file signals include JSX/TSX, Vue or Svelte files and established frontend/client/component domains.
- **Node.js backend or CLI:** server, API, service, worker, and CLI JavaScript/TypeScript use the Node.js implementer and reviewer. Repository dependencies, entry points, and neighboring code distinguish this route from frontend code.
- **Rust product code:** Rust source and Cargo product domains use the Rust implementer and reviewer.
- **Generic product fallback:** clearly identified product code outside the specialized routes uses the generic product implementer and reviewer. This includes Python, Go, JVM, .NET, Ruby, PHP, Swift, and other or unknown languages when the task, path, manifest, or neighboring code establishes the product role.
- **Ambiguous:** if neither file role nor product/tooling ownership can be established safely, pause for one focused clarification. Never use the tooling-only generic implementer merely because no specialist language matched.

Explicit task scope and the closest repository instructions take precedence over filename heuristics. Generated, vendored, documentation, and tooling roles take precedence over language signals.

## Mixed repositories

Partition mixed changes per affected file or coherent domain. Preserve every recognized specialist bucket, route non-specialized product files through the generic product bucket, and route tooling and documentation separately. Run only the agents needed for non-empty buckets; parallelize only when the buckets are cleanly separable.

## Degraded product route

Before delegating a clearly identified generic product bucket, state visibly that Effective Flow is continuing with repository-native generalist implementation and qualitative review, with reduced language-specific specialist depth. This notice is informational and does not create a routine approval gate.

The generic product agents discover commands and conventions in this order:

1. scoped repository instructions
2. CI workflows and task runners
3. manifests and lockfiles
4. existing tests and neighboring code
5. current library documentation through an available documentation skill

Do not invent commands, install a toolchain or dependency without approval, or claim language expertise. If no safe native command or convention can be established, pause for a focused clarification. Validation and tests report unavailable checks as skipped with the reason.
