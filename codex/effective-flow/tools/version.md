
# Effective Flow Version

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

Gib die folgende Effective Flow-Version aus:

**1.46.0 (6b55022)**

## Versionspflege

Die angezeigte Version stammt aus `.release-please-manifest.json`. Versionen und `CHANGELOG.md` werden über release-please gepflegt; ändere die Version nicht manuell in Feature- oder Fix-Commits. Verwende aussagekräftige Conventional-Commit-Messages, damit release-please den nächsten Release-PR samt Changelog korrekt erzeugt.
