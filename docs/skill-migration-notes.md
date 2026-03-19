# Skill Migration Notes

Dieses Dokument beschreibt exakt, welche Mechaniken aus den urspruenglichen Claude-Commands und Claude-Agents nicht 1:1 in das Codex-Skill-System uebernommen werden koennen.

Hinweis: `$sf-commit` ist ein neuer Skill ohne direkten Claude-Vorgaenger und ist daher nicht Teil der Paritaetsbetrachtung gegen die alten Plugin-Dateien.

## Ziel

Die fachliche Workflow-Logik soll erhalten bleiben. Nicht voll portierbar sind nur die Mechaniken, die direkt an Claude-Code-spezifische APIs oder Agent-Metadaten gebunden waren.

## Nicht 1:1 uebernehmbare Claude-Mechaniken

### 1. `AskUserQuestion`

Original:

- strukturierte Mehrfachauswahl mit festen Optionen in der Claude-UI

Codex-Ersatz:

- direkte Rueckfrage an den User im Chat

Verlust:

- keine erzwungene Auswahl-UI
- keine garantierte Optionsstruktur

Erhalten bleibt:

- der Workflow stoppt weiterhin an denselben Entscheidungsstellen und fordert User-Input an

### 2. Explizite Agent-Calls mit festem Agent-Namen

Original:

- dedizierte Claude-Agents wie `ui-implementer`, `code-validator`, `frontend-reviewer`

Codex-Ersatz:

- explizite Skill-Wechsel wie `$sf-ui-implementer`
- internes Sub-Agent-Pattern fuer parallele oder getrennte Teilaufgaben

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

- keine 1:1-Garantie fuer exakt dieselbe Modellwahl pro Phase

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

- expliziter Fortschritt ueber eine Claude-spezifische Todo-API

Codex-Ersatz:

- Fortschritt wird ueber normale Statusupdates und Arbeitsstruktur kommuniziert

Verlust:

- keine dedizierte Todo-UI

Erhalten bleibt:

- der Workflow liefert weiterhin Phasenstatus und Zwischenstaende

### 6. Read-only- oder Tool-Grenzen aus Claude-Agenten

Original:

- einzelne Agents hatten klar deklarierte Tool-Sets und zum Teil faktische Read-only-Rollen

Codex-Ersatz:

- Skill-Regeln verbieten weiterhin unpassende Aenderungen

Verlust:

- keine identische technische Durchsetzung ueber Claude-Agent-Tool-Whitelists

Erhalten bleibt:

- dieselbe Verhaltensregel, etwa dass Review-Skills keinen Produktivcode aendern sollen

### 7. Fertig-Protokoll als Agent-Kontrakt

Original:

- jeder Agent musste mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden

Codex-Ersatz:

- dieselbe Konvention wird internen Sub-Agenten weiterhin vorgegeben

Verlust:

- keine Claude-interne Agent-Laufzeit, die dieses Muster natuerlich kapselt

Erhalten bleibt:

- dieselbe Retry- und Eskalationslogik

## Fachliche Logik, die erhalten bleiben soll

Diese Punkte sind ausdruecklich nicht als verloren zu betrachten und wurden in die Skills zurueckgezogen:

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
