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

Die angezeigte Version stammt aus `.release-please-manifest.json`. Versionen und `CHANGELOG.md` werden über release-please gepflegt; ändere die Version nicht manuell in Feature- oder Fix-Commits. Verwende aussagekräftige Conventional-Commit-Messages, damit release-please den nächsten Release-PR samt Changelog korrekt erzeugt.
