# 0004: /review Command

## Anforderung

Neuer `/review` Command, der ein umfassendes Code-Review durchfuehrt und einen strukturierten Bericht erstellt. Jedes Finding im Bericht soll direkt als Input fuer `/fix`, `/refactor` oder `/build-feature` dienen koennen.

## Architekturentscheidungen

- **Read-Only-Orchestrator**: Der Command veraendert keinen Code, ausser dem gespeicherten Report
- **Kein Wisdom Accumulation**: Nicht noetig da rein analytischer Workflow ohne phasenuebergreifende Implementierung
- **Kein Intent Gate**: Anders als `/build-feature` braucht `/review` keine Intent-Klassifizierung
- **Scope-Heuristik**: Ohne Argumente werden uncommitted Changes reviewed (falls vorhanden), sonst der gesamte Code
- **User-Bestaetigung vor Start**: AskUserQuestion nach Phase 1 um den Scope zu bestaetigen bevor teure opus-Agents laufen
- **Findings-Qualitaetspruefung**: Adversariale Pruefung der aggregierten Findings (Konfidenz >= 80, Duplikate, Konsistenz, False Positives)
- **Prompt-Vorschlag-Muster**: Jedes Finding enthaelt einen copy-pastebaren Prompt fuer den jeweiligen Command

## Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `sf-frontend-workflows/commands/review.md` | NEU — Command-Definition |
| `README.md` | Commands-Tabelle ergaenzt |
| `sf-frontend-workflows/.claude-plugin/plugin.json` | Description ergaenzt |
| `.claude-plugin/marketplace.json` | Description ergaenzt |

## Workflow-Phasen

1. **Scope & Analyse**: Explore-Agent bestimmt Projektstruktur, User bestaetigt Scope
2. **Technische Validierung**: code-validator im Read-Only-Modus
3. **Qualitaets-Review**: frontend-reviewer und/oder nodejs-reviewer (je nach Projekt-Typ)
4. **Bericht erstellen**: Findings aggregieren, filtern, kategorisieren, Report-Datei speichern

## Finding-Format

Jedes Finding enthaelt:
- Schweregrad (Kritisch/Wichtig/Hinweis)
- Komplexitaet (Leicht/Mittel/Schwer)
- Bereich, Datei+Zeile, Problem, Empfehlung
- Aktion (`/fix`, `/refactor`, `/build-feature`)
- Prompt-Vorschlag (copy-pastebar)

## Review-Findings und deren Behebung

| Finding | Schweregrad | Behebung |
|---|---|---|
| code-validator koennte Dateien veraendern | Kritisch | Read-Only-Anweisung in Phase 2 ergaenzt |
| Scope "gesamter Code" zu vage | Wichtig | Uncommitted-Changes-Heuristik ergaenzt |
| Keine User-Interaktion vor Review-Start | Wichtig | AskUserQuestion nach Phase 1 ergaenzt |
| Fehlende adversariale Findings-Pruefung | Wichtig | Qualitaetspruefung in Phase 4 ergaenzt |
| Prompt-Vorschlag-Qualitaet unspezifiziert | Hinweis | Muster-Templates fuer jeden Command-Typ ergaenzt |
| Konfidenz-Filter fehlt | Hinweis | Konfidenz < 80 wird in Phase 4 herausgefiltert |
