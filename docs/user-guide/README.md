# User Guide

This guide is for everyone who **uses** Effective Flow in a project – via
`/effective-flow <tool>` in Claude Code or Codex. For the architecture, build, and how to
contribute to the Effective Flow repo itself, see the
[Developer Guide](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/README.md) instead.

## Recommended reading order

New to Effective Flow? Read in this order:

1. [Getting started](getting-started.md) – installation, profile-first setup, first invocation,
   and the typical flow from planning to pull request.
2. Tool reference, grouped by intent:
   - [Record work](tools-record.md) – `capture`, from a description to approved tracker issues.
   - [Understand what needs doing](tools-understand.md) – `concept`, `investigate`,
     `plan`, `open-plans`, `plan-issue`, `issue-buddy`, `backlog-audit`.
   - [Implement a change](tools-implement.md) – `apply`, `build`, `fix`,
     `refactor`, `docs`, `maintain`, `iterate`.
   - [Ensure quality](tools-quality.md) – `review`, `retro`, `focus`.
   - [Deliver changes](tools-deliver.md) – `deliver`, `commit`, `pr`, `merge-gate`.
   - [Automation](tools-automation.md) – `autopilot`, unattended from an issue or plan to a draft
     pull request.
   - [Set up & info](tools-setup.md) – profile-first `setup`, explicit Express/Guided modes, the read-only
     `setup status` diagnosis, `cleanup`, and `version`.
3. In-depth guides:
   - [Tool flow](tool-flow.md) – how a completed run follows its associated plan and selects a
     valid next step, with the generic fallback table.
   - [Configuration](configuration.md) – the complete project-setup ADR reference and profile
     overlay mappings.
   - [Model-tiering pilot data and privacy](model-tiering-pilot.md) – local evidence, detailed
     consent, review, retention, deletion, and publication boundaries.
   - [Worktree and delivery](worktree-and-delivery.md) – parallel work in
     Git worktrees, delivery branch, pull request/merge/branch completion.
   - [Remote tracker](remote-tracker.md) – keep issue-backed work on GitHub/Forgejo or an
     external planning tool instead of locally.
   - [Skill discovery](skill-discovery.md) – how Effective Flow detects host skills and how
     to control that.
   - [Language support](language-support.md) – specialist depth, reduced-depth product
     routing, and repository-native checks.
4. Running into problems? [Troubleshooting](troubleshooting.md).
5. Unfamiliar term? [Glossary](glossary.md).

## All documents in this category

| Document                                             | Content                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [getting-started.md](getting-started.md)             | Installation, workflow profiles, typical flow, recipes  |
| [tool-flow.md](tool-flow.md)                         | Next-step recommendations after a completed run         |
| [tools-record.md](tools-record.md) | Tool reference: capture tracker issues |
| [tools-understand.md](tools-understand.md)           | Tool reference: analysis & planning                     |
| [tools-implement.md](tools-implement.md)             | Tool reference: implementation                          |
| [tools-quality.md](tools-quality.md)                 | Tool reference: review, retro, and focus                 |
| [tools-deliver.md](tools-deliver.md)                 | Tool reference: local delivery, commit, PR & merge gate |
| [tools-automation.md](tools-automation.md)           | Tool reference: unattended autopilot to a draft PR      |
| [tools-setup.md](tools-setup.md)                     | Tool reference: profiles, setup, cleanup & version      |
| [configuration.md](configuration.md)                 | Project-setup ADR and profile overlay reference         |
| [model-tiering-pilot.md](model-tiering-pilot.md)     | Pilot data, privacy, retention, and deletion            |
| [worktree-and-delivery.md](worktree-and-delivery.md) | Worktree, delivery branch, completion types             |
| [remote-tracker.md](remote-tracker.md)               | Forge and external issue routing                        |
| [skill-discovery.md](skill-discovery.md)             | Host skill detection and control                        |
| [language-support.md](language-support.md)           | Specialist and reduced-depth language support           |
| [troubleshooting.md](troubleshooting.md)             | FAQ and common problems                                 |
| [glossary.md](glossary.md)                           | Terms from tool to skill discovery                      |
