# 0012: Plattformspezifische Ask-Blöcke

## Anforderung

Skills mit Fragen an den User sollen im Claude-Code-Pfad das `AskUserQuestion`-Tool nutzen und im Codex-Pfad die Frage als Freitext stellen.

## Architekturentscheidungen

- Neue `{{ASK}}...{{/ASK}}` Block-Syntax in Source-Skills für strukturierte Fragen
- Build-Script transformiert plattformspezifisch:
  - Claude Code: Anweisung zur Nutzung des `AskUserQuestion`-Tools mit strukturierten Optionen
  - Codex: Freitext-Frage mit formatierten Optionen
- Sondertyp `type: approval` für Freigabe-Fragen: nur "Ja" + Freitext (über "Other" in Claude, direkt in Codex)
- Offene Fragen (kontextabhängig, Optionen erst zur Laufzeit bekannt) bleiben als Freitext auf beiden Plattformen
- ASK-Transformation läuft vor den SKILL/AGENT-Platzhalter-Transformationen (Perl Slurp-Mode `-0777`)

## Betroffene Dateien

| Datei                              | Beschreibung                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `build.sh`                         | Neue Funktionen `transform_ask_claude` und `transform_ask_codex` + Integration in Pipeline |
| `skills/sf-build-feature/SKILL.md` | 3 ASK-Blöcke: Intent Gate, Plan-Freigabe, ADR-Erstellung                                   |
| `skills/sf-review/SKILL.md`        | 2 ASK-Blöcke: Finding-Scope, Scope-Bestätigung                                             |
| `skills/sf-fix/SKILL.md`           | 1 ASK-Block: Fix-Strategie-Freigabe                                                        |
| `skills/sf-refactor/SKILL.md`      | 2 ASK-Blöcke: Plan-Freigabe, ADR-Erstellung                                                |
| `docs/skill-migration-notes.md`    | AskUserQuestion-Abschnitt aktualisiert                                                     |

## Implementierungsdetails

### ASK-Block-Syntax

```markdown
{{ASK}}
header: Intent
question: Welchen Typ hat diese Anforderung?
options:
  - label: Feature
    description: Neue Funktionalität
  - label: Bugfix
    description: Fehler beheben
{{/ASK}}
```

Approval-Variante (nur Ja + Freitext):

```markdown
{{ASK}}
header: Freigabe
question: Plan freigegeben?
type: approval
{{/ASK}}
```

### Build-Transformation

- Perl `-0777` Slurp-Mode für Multi-line-Block-Erkennung
- Regex: `\{\{ASK\}\}\s*\n(.*?)\{\{/ASK\}\}` mit `/gse`-Flags
- Options-Parsing begrenzt auf den `options:`-Abschnitt (nicht gierig über Block-Grenzen)
- Validierung: `die` bei fehlenden Pflichtfeldern (header, question, options)
- CR/LF-Handling: `$b =~ s/\r//g` zu Beginn jeder Substitution

### Generierte Ausgabe

Claude Code:

```
Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Intent"
- question: "Welchen Typ hat diese Anforderung?"
- multiSelect: false
- options:
  - label: "Feature", description: "Neue Funktionalität"
  - label: "Bugfix", description: "Fehler beheben"
```

Codex:

```
Frage den User: **Welchen Typ hat diese Anforderung?**
- Feature -- Neue Funktionalität
- Bugfix -- Fehler beheben
```

## Review-Findings

| #   | Schweregrad | Problem                                         | Status                                      |
| --- | ----------- | ----------------------------------------------- | ------------------------------------------- |
| 1   | Wichtig     | Regex verlangt exaktes `\n`, fragil bei CR/LF   | Behoben: `$b =~ s/\r//g` + `\s*\n`          |
| 2   | Wichtig     | Fehlende Pflichtfelder erzeugen defekten Output | Behoben: `die` bei fehlenden Feldern        |
| 3   | Kritisch    | Options-Regex matcht über Block-Grenzen         | Behoben: Options-Block separat extrahiert   |
| 4   | Wichtig     | Transform-Reihenfolge undokumentiert            | Behoben: Kommentare an allen 4 Stellen      |
| 5   | Wichtig     | `echo "$body"` statt `printf`                   | Behoben: `printf '%s\n'` an allen 4 Stellen |
