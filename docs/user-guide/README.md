# User Guide

This guide is for everyone who **uses** Effective Flow in a project – via
`/effective-flow <tool>` in Claude Code or Codex. For the architecture, build, and how to
contribute to the Effective Flow repo itself, see the
[Developer Guide](../developer-guide/README.md) instead.

## Recommended reading order

New to Effective Flow? Read in this order:

1. [Getting started](getting-started.md) – installation, first invocation, the typical
   flow from planning to pull request.
2. Tool reference, grouped by intent:
   - [Understand what needs doing](tools-understand.md) – `investigate`, `plan`,
     `open-plans`, `plan-issue`.
   - [Implement a change](tools-implement.md) – `apply`, `build`, `fix`,
     `refactor`, `docs`, `maintain`, `iterate`.
   - [Ensure quality](tools-quality.md) – `review`.
   - [Deliver changes](tools-deliver.md) – `deliver`, `commit`, `pr`, `merge-gate`.
   - [Set up & info](tools-setup.md) – `setup`, `cleanup`, `version`.
3. In-depth guides:
   - [Tool flow](tool-flow.md) – how a completed run recommends its own next step, and every
     tool's possible follow-ups in one table.
   - [Configuration](configuration.md) – the complete project-setup ADR reference.
   - [Worktree and delivery](worktree-and-delivery.md) – parallel work in
     Git worktrees, delivery branch, pull request/merge/branch completion.
   - [Remote tracker](remote-tracker.md) – keep findings and issues on GitHub or
     Forgejo instead of locally.
   - [Skill discovery](skill-discovery.md) – how Effective Flow detects host skills and how
     to control that.
   - [Language support](language-support.md) – specialist depth, reduced-depth product
     routing, and repository-native checks.
4. Running into problems? [Troubleshooting](troubleshooting.md).
5. Unfamiliar term? [Glossary](glossary.md).

## All documents in this category

| Document                                             | Content                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [getting-started.md](getting-started.md)             | Installation, first invocation, typical flow, recipes   |
| [tool-flow.md](tool-flow.md)                         | Next-step recommendations after a completed run         |
| [tools-understand.md](tools-understand.md)           | Tool reference: analysis & planning                     |
| [tools-implement.md](tools-implement.md)             | Tool reference: implementation                          |
| [tools-quality.md](tools-quality.md)                 | Tool reference: review                                  |
| [tools-deliver.md](tools-deliver.md)                 | Tool reference: local delivery, commit, PR & merge gate |
| [tools-setup.md](tools-setup.md)                     | Tool reference: setup, cleanup & version                |
| [configuration.md](configuration.md)                 | Complete project-setup ADR reference                    |
| [worktree-and-delivery.md](worktree-and-delivery.md) | Worktree, delivery branch, completion types             |
| [remote-tracker.md](remote-tracker.md)               | Remote issue mode (GitHub/Forgejo)                      |
| [skill-discovery.md](skill-discovery.md)             | Host skill detection and control                        |
| [language-support.md](language-support.md)           | Specialist and reduced-depth language support           |
| [troubleshooting.md](troubleshooting.md)             | FAQ and common problems                                 |
| [glossary.md](glossary.md)                           | Terms from tool to skill discovery                      |
