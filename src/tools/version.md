---
description: "Zeigt die aktuelle Effective Flow-Version inklusive Git-Kurzhash an."
catalogHint: "Zeigt die installierte Effective Flow-Version."
---

# Effective Flow Version

```include
task-tracking
```

Gib die folgende Effective Flow-Version aus:

**{{VERSION}}**

## Versionspflege

Die angezeigte Version stammt aus `.release-please-manifest.json`. Versionen und `CHANGELOG.md` werden über release-please gepflegt; ändere die Version nicht manuell in Feature- oder Fix-Commits. Verwende aussagekräftige Conventional-Commit-Messages, damit release-please den nächsten Release-PR samt Changelog korrekt erzeugt.
