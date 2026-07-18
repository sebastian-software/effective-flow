---
description: "Shows the current Effective Flow version including the short git hash."
catalogHint: "Shows the installed Effective Flow version."
---

# Effective Flow Version

```include
task-tracking
```

Output the following Effective Flow version:

**{{VERSION}}**

## Version maintenance

The displayed version comes from `.release-please-manifest.json`. Versions and `CHANGELOG.md` are maintained via release-please; do not change the version manually in feature or fix commits. Use meaningful Conventional Commit messages so that release-please generates the next release PR and changelog correctly.
