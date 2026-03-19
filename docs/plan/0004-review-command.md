# 0004: /review Command

## Anforderung

Neuer `/review` Command, der ein umfassendes Code-Review durchführt und einen strukturierten Bericht erstellt. Jedes Finding im Bericht soll direkt als Input für `/fix`, `/refactor` oder `/build-feature` dienen können.

## Architekturentscheidungen

- **Read-Only-Orchestrator**: Der Command verändert keinen Code, außer dem gespeicherten Report
- **Kein Wisdom Accumulation**: Nicht nötig da rein analytischer Workflow ohne phasenübergreifende Implementierung
- **Kein Intent Gate**: Anders als `/build-feature` braucht `/review` keine Intent-Klassifizierung
- **Scope-Heuristik**: Ohne Argumente werden uncommitted Changes reviewed (falls vorhanden), sonst der gesamte Code
- **User-Bestätigung vor Start**: AskUserQuestion nach Phase 1 um den Scope zu bestätigen bevor teure opus-Agents laufen
- **Findings-Qualitätsprüfung**: Adversariale Prüfung der aggregierten Findings (Konfidenz >= 80, Duplikate, Konsistenz, False Positives)
- **Prompt-Vorschlag-Muster**: Jedes Finding enthält einen copy-pastebaren Prompt für den jeweiligen Command

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `sf-frontend-workflows/commands/review.md` | NEU — Command-Definition |
| `README.md` | Commands-Tabelle ergänzt |
| `sf-frontend-workflows/.claude-plugin/plugin.json` | Description ergänzt |
| `.claude-plugin/marketplace.json` | Description ergänzt |

## Workflow-Phasen

1. **Scope & Analyse**: Explore-Agent bestimmt Projektstruktur, User bestätigt Scope
2. **Technische Validierung**: code-validator im Read-Only-Modus
3. **Qualitäts-Review**: frontend-reviewer und/oder nodejs-reviewer (je nach Projekt-Typ)
4. **Bericht erstellen**: Findings aggregieren, filtern, kategorisieren, Report-Datei speichern

## Finding-Format

Jedes Finding enthält:
- Schweregrad (Kritisch/Wichtig/Hinweis)
- Komplexität (Leicht/Mittel/Schwer)
- Bereich, Datei+Zeile, Problem, Empfehlung
- Aktion (`/fix`, `/refactor`, `/build-feature`)
- Prompt-Vorschlag (copy-pastebar)

## Review-Findings und deren Behebung

| Finding | Schweregrad | Behebung |
|---|---|---|
| code-validator könnte Dateien verändern | Kritisch | Read-Only-Anweisung in Phase 2 ergänzt |
| Scope "gesamter Code" zu vage | Wichtig | Uncommitted-Changes-Heuristik ergänzt |
| Keine User-Interaktion vor Review-Start | Wichtig | AskUserQuestion nach Phase 1 ergänzt |
| Fehlende adversariale Findings-Prüfung | Wichtig | Qualitätsprüfung in Phase 4 ergänzt |
| Prompt-Vorschlag-Qualität unspezifiziert | Hinweis | Muster-Templates für jeden Command-Typ ergänzt |
| Konfidenz-Filter fehlt | Hinweis | Konfidenz < 80 wird in Phase 4 herausgefiltert |
