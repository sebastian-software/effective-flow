---
description: "Räumt die von Effective Flows Migrationen bewusst hinterlassenen Altlasten in einem Zielprojekt auf: Alt-Laufzeitverzeichnisse `.firmo/`/`.sf-plugin/`, eine enttrackte oder Legacy-`config.json`, veraltete `.gitignore`-Zeilen und `firmo-`-Labels im Remote-Issue-Tracker. Liest alle veralteten Artefakte, prüft gegen ihr neues Gegenstück, ob noch etwas übernommen werden soll, lässt jeden Übernahme-Kandidaten vom User bestätigen und löscht danach die Altdaten git-aware und nur nach expliziter Bestätigung (getrackt via `git rm`, ungetrackt/gitignored nur nach „unwiderruflich"-Bestätigung, kein Backup, kein Auto-Commit). Ist idempotent und ein No-Op, wenn keine Altlasten vorhanden sind. Verwende diesen Skill, um eine abgeschlossene Migration endgültig zu finalisieren und die Altdaten loszuwerden."
catalogHint: "Räumt Migrations-Altlasten (`.firmo/`, alte Config, `firmo-`-Labels) nach Bestätigung auf."
---

# Effective Flow Cleanup

Du räumst die Altlasten auf, die Effective Flows Migrationen bewusst hinterlassen. Alle Migrationen sind **non-destruktiv** und verweisen das eigentliche Löschen ausdrücklich an den User (siehe `effective-flow-dir-migration.md`: „das Aufräumen überlässt Effective Flow dem User"; `{{SKILL:setup}}`: die enttrackte Alt-`config.json` bleibt „auf Platte belassen"). Dieser Skill ist der sanktionierte, user-gesteuerte Pfad, der diese Finalisierung übernimmt — und die **einzige** Stelle, die Altdaten tatsächlich löscht.

## Ziel

- alle veralteten Migrations-Artefakte im aktuellen Projekt erfassen (Discovery)
- sie gegen ihr neues Gegenstück prüfen und feststellen, ob noch etwas übernommen werden soll (Carry-over)
- jeden Übernahme-Kandidaten vom User bestätigen lassen und Bestätigtes übernehmen
- die Altdaten anschließend **git-aware** und nur nach expliziter Bestätigung löschen (Dry-Run zuerst)
- niemals löschen, bevor das neue Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist
- keinen Commit erstellen und kein Backup-Verzeichnis anlegen
- ein No-Op mit klarer Meldung sein, wenn keine Altlasten vorhanden sind

```include
language-rules
```

```include
task-tracking
```

```include
effective-flow-dir-migration
```

```include
config-migration
```

```include
issue-tracker
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Aufräumen und beachte ihre Vorgaben für Dateiformate, Konfiguration und projektweite Konventionen.

## Harte Abgrenzung

- **Nur das aktuelle Projekt.** Dieser Skill fasst **keine** globale Skill-Installation an (z. B. `~/.claude/skills/effective-flow` oder `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*`-Agents). Das Entfernen alter installierter Skills/Agents erledigen die Deploy-Skripte, nicht dieses Tool.
- **Neues nie löschen.** Das aktive Laufzeitverzeichnis `.effective-flow/` (bis auf einen ausdrücklich als veraltet erkannten Legacy-Inhalt darin, siehe Altlast-Klassen) und die Projektsetup-ADR werden **nie** gelöscht.
- **Kein Auto-Commit.** Der Skill staged höchstens `git rm`-Änderungen und entfernt ungetrackte Dateien physisch; er committet nicht. Das Committen übernimmt der User oder `{{SKILL:commit}}`.
- **Kein Backup.** Für nicht git-wiederherstellbare Artefakte wird bewusst kein Backup-Verzeichnis angelegt; das Sicherheitsnetz ist die explizite Bestätigung.
- **Keine Config schreiben.** Übernahme von Config-Werten schreibt dieser Skill nicht selbst in die Projektsetup-ADR — dafür ist `{{SKILL:setup}}` zuständig (siehe Phase 3).
- **Nur mit Zustimmung löschen.** Jede Löschung erfolgt erst nach Dry-Run und ausdrücklicher Bestätigung.

## Altlast-Klassen

Der Skill kennt genau diese vier Klassen von Migrations-Altlasten und je ihr neues Gegenstück:

| Klasse                       | Altlast                                                                                                                                    | Neues Gegenstück                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Runtime-Verzeichnisse        | `.firmo/`, `.sf-plugin/` (nach Migration bewusst belassen)                                                                                 | `.effective-flow/`                             |
| Legacy-`config.json`         | enttrackte `.firmo/config.json` bzw. eine Legacy-`config.json` in einem Runtime-Verzeichnis                                                | Projektsetup-ADR (siehe `{{SKILL:setup}}`)     |
| Legacy-`.gitignore`-Einträge | veraltete Ignore-Zeilen für `.firmo/`/`.sf-plugin/` bzw. das alte Zwei-Zeilen-Pattern `.effective-flow/*` + `!.effective-flow/config.json` | die eine Zeile `.effective-flow/`              |
| `firmo-`-Labels              | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` am Issue | die `effective-flow-`-Variante am selben Issue |

`sf-`-Labels sind **kein** eigenständiges Ziel: Sie werden bereits durch die einmalige `sf-`-Label-Migration (siehe „Label-Konvention" in `issue-tracker.md`) auf `effective-flow-` gezogen. Dieser Skill räumt nur noch verbliebene `firmo-`-Labels ab.

## Workflow

### Phase 1: Discovery / Bestandsaufnahme

1. Erfasse die vorhandenen Altlasten im Projekt-Root:
   - **Runtime-Verzeichnisse:** existiert `.firmo/` und/oder `.sf-plugin/`?
   - **Legacy-`config.json`:** existiert `.firmo/config.json`, `.sf-plugin/config.json` oder eine als veraltet erkennbare `config.json` in `.effective-flow/` (Übergangs-Fallback, dessen Werte in die ADR gehören)?
   - **`.gitignore`:** enthält sie veraltete Zeilen für `.firmo/`/`.sf-plugin/` oder das alte Zwei-Zeilen-Pattern?
   - **`firmo-`-Labels:** nur im Remote-Modus mit authentifiziertem CLI (siehe „Host- und CLI-Erkennung" in `issue-tracker.md`) — liste Issues mit `firmo-`-Labels je Präfix getrennt auf. Fehlt Remote-Modus, Git-Repository, `origin` oder ein authentifiziertes CLI, überspringe diese Klasse und melde das knapp.
2. Bestimme je vorhandener Altlast, ob ihr **neues Gegenstück** existiert (`.effective-flow/`, Projektsetup-ADR bzw. `effective-flow-`-Labels).
3. Sind keine Altlasten vorhanden, ist der Lauf ein **No-Op**: melde das klar und beende.
4. Gib dem User eine kompakte Bestandsaufnahme aus (Klasse → gefundene Artefakte → ob ein neues Gegenstück existiert).

### Phase 2: Carry-over-Prüfung (lesen + vergleichen)

Lies die Altlasten und ermittle, ob noch etwas übernommen werden muss, bevor gelöscht wird:

- **Runtime-Verzeichnisse:** Vergleiche den Inhalt des Legacy-Verzeichnisses (bevorzugt `.firmo/` vor `.sf-plugin/`) mit `.effective-flow/`. Sammle Dateien, die im Legacy-Verzeichnis vorhanden sind, in `.effective-flow/` aber **fehlen** (oder inhaltlich abweichen/neuer sind), als Übernahme-Kandidaten. Reine Laufzeit-Artefakte (`cache.json`, `.worktrees/`) sind in der Regel verzichtbar; benenne sie als solche.
- **Legacy-`config.json`:** Parse sie. Ist sie kein gültiges JSON, ist sie **keine** Carry-over-Quelle: melde Pfad und Fehler und behandle die Datei nur als Löschkandidat (nach Bestätigung). Bei gültigem JSON vergleiche jeden gesetzten Wert mit der Projektsetup-ADR; nicht abgebildete Werte sind Übernahme-Kandidaten.
- **`.gitignore`/Labels:** kein Datei-Carry-over. Für Labels gilt der add-before-remove-Schritt in Phase 5.

### Phase 3: Carry-over bestätigen und übernehmen

Lege dem User die Übernahme-Kandidaten gruppiert vor und hole je Gruppe die Entscheidung ein. Übernimm nur ausdrücklich bestätigte Kandidaten.

```ask
when: es gibt Runtime-Datei-Kandidaten, die in `.effective-flow/` fehlen oder abweichen
header: Übernehmen
question: Welche Dateien aus dem Alt-Laufzeitverzeichnis sollen nach `.effective-flow/` übernommen werden, bevor es gelöscht wird?
options:
  - label: Alle übernehmen
    description: Jede aufgelistete Datei nach .effective-flow/ kopieren (vorhandene Dateien im Ziel nicht überschreiben)
  - label: Einzeln auswählen
    description: Pro Datei entscheiden, welche übernommen und welche verworfen wird
  - label: Nichts übernehmen
    description: Keine Datei übernehmen — der gesamte Alt-Inhalt wird zur Löschung freigegeben
```

- **Runtime-Dateien:** Bestätigtes nach `.effective-flow/` kopieren (nicht verschieben); eine im Ziel bereits vorhandene Datei **nicht** überschreiben. Abgelehntes bleibt Löschkandidat.
- **Config-Werte:** Schreibe abweichende Werte **nicht selbst** in die ADR. Lege sie offen und verweise auf `{{SKILL:setup}}` zur Übernahme. Gib die betroffenen Schlüssel konkret aus, damit der User sie in `{{SKILL:setup}}` bestätigen kann. Erst wenn die Werte in der ADR stehen oder der User sie ausdrücklich verwirft, gilt die Legacy-`config.json` als übernahmefrei und damit löschbar.
- **Labels:** kein Datei-Carry-over; die Übernahme erfolgt in Phase 5 als add-`effective-flow-`-vor-remove-`firmo-`.

### Phase 4: Dry-Run-Vorschau

Liste vor jeder Löschung genau auf, was entfernt wird — **ohne** schon zu löschen:

1. Je Artefakt: Pfad bzw. Label und die Klasse.
2. Je Datei/Verzeichnis den Git-Status: **getrackt**, **ungetrackt** oder **gitignored**. Getrackte sind über die Git-Historie wiederherstellbar; ungetrackte/gitignorte Artefakte (`.effective-flow/`, `.firmo/`, `.sf-plugin/` sind gitignored) sind **nicht** über Git wiederherstellbar.
3. Warne bei dirty Working Tree und empfehle, vorher zu committen/stashen, damit ein `git rm`-Staging sauber ist.
4. Weise für jede Altlast nach, dass ihr neues Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist. Fehlt das neue Gegenstück (z. B. `.effective-flow/` existiert nicht, weil die Migration noch nicht lief), biete diese Altlast **nicht** zur Löschung an: melde das und verweise darauf, dass ein normaler Tool-Lauf die Migration nach `.effective-flow/` auslöst.
5. **Verschachtelte Klassen koppeln:** Eine Legacy-`config.json` liegt physisch **innerhalb** eines Runtime-Verzeichnisses (z. B. `.firmo/config.json` in `.firmo/`). Biete das enthaltende Runtime-Verzeichnis (Klasse „Runtime-Verzeichnisse") **nicht** zur Löschung an, solange die enthaltene Legacy-`config.json` (Klasse „Legacy-`config.json`") noch offenen Carry-over hat — sonst nähme das Löschen des Verzeichnisses die noch nicht übernommene `config.json` mit. Erst wenn deren Werte in der ADR stehen oder ausdrücklich verworfen sind, gilt auch das enthaltende Verzeichnis als löschbar.

### Phase 5: Löschung bestätigen und git-aware ausführen

Hole die Bestätigung **artefakt-klassen-weise** ein und führe die Löschung erst danach aus.

```ask
header: Löschen
question: Die oben gelisteten Altlasten jetzt entfernen? Getrackte Dateien via `git rm` (über die Historie wiederherstellbar), ungetrackte/gitignorte Verzeichnisse werden physisch und unwiderruflich entfernt.
options:
  - label: Ja, wie gelistet entfernen
    description: Getrackte via git rm (gestaged, kein Commit); ungetrackte/gitignorte physisch löschen; firmo-Labels vom Issue lösen
  - label: Nur getrackte entfernen
    description: Nur die git-wiederherstellbaren, getrackten Artefakte via git rm; ungetrackte Verzeichnisse und Labels vorerst behalten
  - label: Abbrechen
    description: Nichts löschen; die Bestandsaufnahme bleibt bestehen
```

Führe je Klasse aus:

- **Getrackte Dateien:** via `git rm` entfernen (staged, **kein** Commit). Bei ungetrackt/gitignored greift `git rm` nicht.
- **Ungetrackte/gitignorte Verzeichnisse** (`.firmo/`, `.sf-plugin/`, eine gitignorte Legacy-`config.json`): physisch entfernen — nur nach der ausdrücklichen „unwiderruflich"-Bestätigung oben, ohne Backup.
- **`.gitignore`:** entferne nur eindeutig veraltete Zeilen (`.firmo/`, `.sf-plugin/`, altes Zwei-Zeilen-Pattern). Stelle sicher, dass `.effective-flow/` weiterhin ignoriert bleibt; Fremdzeilen unangetastet lassen. Die kanonische `.gitignore`-Normalisierung ist Sache von `{{SKILL:setup}}`; entferne hier nur die Alt-Reste.
- **`firmo-`-Labels:** nur im Remote-Modus mit CLI. Ergänze zuerst `effective-flow-<x>` am Issue, **dann** löse `firmo-<x>` vom Issue (add-new vor remove-old, damit bei Abbruch kein Issue unklassifiziert bleibt). Die Label-**Definition** im Tracker bleibt bestehen — führe **kein** `label delete` aus. Nutze das Werkzeug-Mapping aus `issue-tracker.md` (`--add-label`/`--remove-label` bzw. `tea issue edit`).

Brich bei jedem Fehler (z. B. `git rm` scheitert, Tracker nicht erreichbar) kontrolliert ab: melde den Teilzustand und lösche nichts, dessen neues Gegenstück nicht gesichert ist.

### Phase 6: Abschluss

Melde dem User:

- was übernommen wurde (Dateien nach `.effective-flow/`) und welche Config-Werte an `{{SKILL:setup}}` verwiesen wurden
- was gelöscht wurde, getrennt nach getrackt (via `git rm`, gestaged) und physisch entfernt
- welche `.gitignore`-Zeilen entfernt wurden
- welche `firmo-`-Labels von wie vielen Issues gelöst wurden (bzw. dass die Label-Klasse übersprungen wurde)
- was bewusst verbleibt und warum
- dass **kein** Commit erstellt wurde; verweise für die gestageten Änderungen auf `{{SKILL:commit}}`

## Regeln

- Lösche niemals ohne Dry-Run und ausdrückliche Bestätigung.
- Lösche kein Artefakt, bevor sein neues Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist.
- Lösche ein Runtime-Verzeichnis nicht, solange es eine Legacy-`config.json` mit offenem Carry-over enthält; erst nach Übernahme in die ADR oder bewusstem Verwerfen ist es löschbar.
- Fasse `.effective-flow/` (aktives Verzeichnis) und die Projektsetup-ADR nicht an, ebenso wenig eine globale Skill-Installation.
- Erstelle keine Commits und keine Backup-Verzeichnisse.
- Schreibe keine Config selbst; Config-Übernahme läuft über `{{SKILL:setup}}`.
- Beim Label-Cleanup zuerst `effective-flow-` ergänzen, dann `firmo-` vom Issue lösen; die Label-Definition bleibt bestehen.
- Ist keine Altlast vorhanden, ist der Lauf ein No-Op.
- Gib Pfade relativ zum Projekt-Root aus.
