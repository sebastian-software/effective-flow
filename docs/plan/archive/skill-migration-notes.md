# Skill Migration Notes

Dieses Dokument beschreibt exakt, welche Mechaniken aus den ursprünglichen Claude-Commands und Claude-Agents nicht 1:1 in das Codex-Skill-System übernommen werden können.

Hinweis: Das `commit`-Tool (`/firmo commit`) ist neu, ohne direkten Claude-Vorgänger, und daher nicht Teil der Paritätsbetrachtung gegen die alten Plugin-Dateien.

## Ziel

Die fachliche Workflow-Logik soll erhalten bleiben. Nicht voll portierbar sind nur die Mechaniken, die direkt an Claude-Code-spezifische APIs oder Agent-Metadaten gebunden waren.

## Nicht 1:1 übernehmbare Claude-Mechaniken

### 1. `AskUserQuestion`

Original:

- strukturierte Mehrfachauswahl mit festen Optionen in der Claude-UI

Lösung:

- `{{ASK}}...{{/ASK}}` Block-Syntax in den Source-Skills
- Build transformiert plattformspezifisch:
  - Claude Code: Anweisung, das `AskUserQuestion`-Tool mit strukturierten Optionen zu verwenden
  - Codex: Freitext-Frage mit formatierten Optionen im Chat
- Sonderfall `type: approval`: nur "Ja" als explizite Option, Freitext-Feedback über "Other" (Claude) bzw. direkten Text (Codex)

Erhalten bleibt:

- der Workflow stoppt weiterhin an denselben Entscheidungsstellen und fordert User-Input an
- Claude Code nutzt jetzt die native strukturierte UI
- Codex behält die bewährte Chat-basierte Interaktion

### 2. Explizite Agent-Calls mit festem Agent-Namen

Original:

- dedizierte Claude-Agents wie `ui-implementer`, `code-validator`, `frontend-reviewer`

Codex-Ersatz:

- interne Subagent-Delegation an genestete Agents wie `ui-implementer` (unter `agents/` im Firmo-Skill)
- internes Sub-Agent-Pattern für parallele oder getrennte Teilaufgaben

Verlust:

- keine Claude-spezifische Agent-Registry

Erhalten bleibt:

- dieselbe Rollenlogik und dieselben fachlichen Verantwortungen

### 3. Model-Routing (`opus`, `sonnet`, `haiku`)

Original:

- pro Agent war ein konkretes Claude-Modell vorgegeben

Codex-Ersatz:

- Skill-Routing und internes Sub-Agent-Pattern

Verlust:

- keine 1:1-Garantie für exakt dieselbe Modellwahl pro Phase

Erhalten bleibt:

- die Trennung nach komplexen, strukturierten und mechanischen Phasen

### 4. Agent-Metadaten im Frontmatter

Original:

- Felder wie `model`, `color`, `tools`, `skills`

Codex-Ersatz:

- Codex-Skill-Frontmatter mit `name` und `description`

Verlust:

- keine 1:1-Nutzung dieser Claude-spezifischen Metadaten

Erhalten bleibt:

- die fachliche Beschreibung des Rollenverhaltens

### 5. `TodoWrite`

Original:

- expliziter Fortschritt über eine Claude-spezifische Todo-API

Codex-Ersatz:

- Aufgabenverfolgung ist als Skill-Regel in den Source-Skills verankert.
- Wenn ein TODO- oder Task-Tracking-Tool verfügbar ist, verwenden die Workflows dieses Tool mit expliziten Statuswechseln (`pending`, `in_progress`, `completed` oder äquivalent).
- Falls kein Task-Tool verfügbar ist, fällt der Workflow auf normale Statusupdates und eine klare Arbeitsstruktur im Chat zurück.

Verlust:

- keine Garantie auf dieselbe Claude-spezifische `TodoWrite`-UI oder exakt identische UI-Darstellung in jeder Codex-Umgebung

Erhalten bleibt:

- der Workflow liefert weiterhin Phasenstatus, Zwischenstände und bei komplexen Workflows eine sichtbare Aufgabenliste, sofern die Laufzeit ein Task-Tool bereitstellt

### 6. Read-only- oder Tool-Grenzen aus Claude-Agenten

Original:

- einzelne Agents hatten klar deklarierte Tool-Sets und zum Teil faktische Read-only-Rollen

Codex-Ersatz:

- Skill-Regeln verbieten weiterhin unpassende Änderungen

Verlust:

- keine identische technische Durchsetzung über Claude-Agent-Tool-Whitelists

Erhalten bleibt:

- dieselbe Verhaltensregel, etwa dass Review-Skills keinen Produktivcode ändern sollen

### 7. Fertig-Protokoll als Agent-Kontrakt

Original:

- jeder Agent musste mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden

Codex-Ersatz:

- dieselbe Konvention wird internen Sub-Agenten weiterhin vorgegeben

Verlust:

- keine Claude-interne Agent-Laufzeit, die dieses Muster natürlich kapselt

Erhalten bleibt:

- dieselbe Retry- und Eskalationslogik

## Fachliche Logik, die erhalten bleiben soll

Diese Punkte sind ausdrücklich nicht als verloren zu betrachten und wurden in die Skills zurückgezogen:

- Intent Gate
- initiale Zustandsdokumentation
- Wisdom Accumulation
- Retry-/Eskalationslogik
- Gap Analysis
- Plan- und Diagnose-Validierung
- Projekt-Typ-Erkennung
- parallele Phasen
- ADR-Optionen
- Review-Bericht-Format
- validator-, implementer-, reviewer-, docs- und test-spezifische Fachregeln
