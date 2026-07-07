---
description: "Zeigt die aktuelle Firmo-Version inklusive Git-Kurzhash an."
---

# Firmo Version

```include
task-tracking
```

Gib die folgende Firmo-Version aus:

**{{VERSION}}**

## Versionspflege

Die angezeigte Version stammt aus `version.txt` (Single Source of Truth). Zum Bump-Fluss gehört zwingend ein passender Eintrag in `CHANGELOG.md` (Format „Keep a Changelog“): Verschiebe vor dem Version-Bump die gesammelten Einträge aus `## [Unreleased]` unter die neue Versionsnummer mit Datum, damit Version und Changelog konsistent bleiben.
