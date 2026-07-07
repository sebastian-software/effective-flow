# 0040: docs/-Verzeichnisstruktur für Doku-Kategorien

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Aktuell landen alle Implementierungspläne in `docs/plan/`, unabhängig davon, ob sie ein Feature, einen Bugfix, ein Refactoring oder Dokumentation beschreiben. Pläne der Kategorie „Dokumentation“ produzieren am Ende ein finales Dokument, für das es bisher keine projektweite Ablagekonvention gibt. In der Praxis entstehen User-Guides, Entwickler-Guides, Betriebsdokumente und Runbooks, die je nach Projekt an unterschiedlichen Stellen abgelegt werden.

Es soll eine verbindliche Konvention etabliert werden:

- Implementierungspläne bleiben in `docs/plan/` und behalten das vierstellige NNNN-Schema.
- Die finalen, vom Plan erzeugten Dokumente landen in vier neuen Unterverzeichnissen unter `docs/`, getrennt nach Doku-Kategorie.
- Die Plugin-Skills `sf-plan`, `sf-docs`, `sf-docs-writer`, `sf-apply-plan` und die zentrale Konvention (README, Shared-Includes) werden so angepasst, dass diese Ablage automatisch erkannt, vorgeschlagen und durchgesetzt wird.

Workflow-Empfehlung „Feature“: Dies ist eine echte Erweiterung des Plugin-Verhaltens (neue Konvention, neue Skill-Schritte, neue Include-Datei). Bugfix und Refactoring passen nicht, da kein bestehendes Verhalten falsch ist oder strukturell verbessert wird. Reine Dokumentation passt ebenfalls nicht, weil die Skills selbst und ihr Build-Output mit verändert werden.

## Architekturentscheidungen

- **Vier feste Doku-Kategorien:** `user-guide`, `developer-guide`, `operations`, `runbooks`. Begründung: deckt die typischen Zielgruppen ab (End-User, Entwickler, Betrieb, Incident-Response) und passt zu der Liste, die der User explizit genannt hat. Keine offene Kategorienliste, weil das zu Fragmentierung führt.
- **Englisch ausgeschrieben:** Verzeichnisnamen `user-guide`, `developer-guide`, `operations`, `runbooks`. Begründung: konsistent mit der englischen Code-Sprache des Plugins, sprechender als `dev`/`ops` und langlebiger als deutsche Slugs in URL-Pfaden.
- **Topic-basierte Dateinamen ohne NNNN-Prefix:** Dokumente heißen z. B. `installation.md`, `architecture.md`, `restart-database.md`. Begründung: Pläne lösen einmalige Probleme und profitieren von chronologischer Nummerierung; finale Dokumente sind langlebige Referenzen, die nach Topic gesucht und verlinkt werden. NNNN würde Umsortierung erschweren, Links brechen und keine Wiederfindbarkeit bringen. Das Schema bleibt damit exklusiv für `docs/plan/` und signalisiert klar den Unterschied zwischen kurzlebigem Planungsartefakt und langlebigem Referenzdokument.
- **README.md nur in `user-guide/`:** End-User profitieren von einer kuratierten Lese-Reihenfolge und einem Einstiegspunkt. Für Entwickler, Betrieb und Runbooks reicht die Verzeichnisliste plus Topic-Slugs; eine zusätzliche README müsste sonst bei jedem neuen Dokument gepflegt werden, ohne dass die Zielgruppe sie braucht.
- **Optionale Sub-Topics in `runbooks/`:** Bei wachsender Runbook-Sammlung dürfen thematische Unterordner entstehen, z. B. `runbooks/database/restart.md`. Keine Pflicht, weil ein flaches Verzeichnis bei wenigen Runbooks übersichtlicher ist.
- **Plan-Datei nennt Ziel-Kategorie und Ziel-Pfad explizit:** Für Dokumentationspläne erweitern wir das Plan-Template um die Pflichtfelder „Doku-Kategorie“ und „Ziel-Pfad“. Damit ist beim späteren `sf-docs`-Lauf eindeutig, wohin das finale Dokument geschrieben wird. Heuristisches Erraten aus dem Plan-Text wird vermieden.
- **Shared-Include als Konventionsquelle:** Die Konvention wird einmal in `skills/_shared/doc-categories.md` beschrieben und von allen betroffenen Skills via `{{INCLUDE:doc-categories}}` eingebunden. Begründung: dieselbe Konvention darf nicht in mehreren SKILL.md-Dateien dupliziert werden, sonst driftet sie auseinander (gleiches Pattern wie `language-rules`, `plan-status`, `plan-reference-routing`).
- **Kein Auto-Anlegen leerer Doku-Verzeichnisse:** Verzeichnisse werden erst beim ersten realen Dokument erzeugt. Begründung: leere Verzeichnisse sind in Git ohnehin nicht persistierbar und würden `.gitkeep`-Rauschen erzwingen.

## Betroffene Dateien

| Datei                              | Beschreibung                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/doc-categories.md` | Neuer Shared-Include mit Kategorien, Verzeichnisnamen, Dateinamen-Konvention und README-Regel                                                                        |
| `skills/sf-plan/SKILL.md`          | Bei Klassifikation „Dokumentation“ zusätzlich Doku-Kategorie und Ziel-Pfad bestimmen und im Plan-Template fordern; bindet `doc-categories` ein                       |
| `skills/sf-docs/SKILL.md`          | Liest aus dem Plan die Doku-Kategorie und den Ziel-Pfad, legt das Verzeichnis bei Bedarf an, übergibt den Ziel-Pfad an `sf-docs-writer`; bindet `doc-categories` ein |
| `skills/sf-docs-writer/SKILL.md`   | Schreibt in den im Auftrag genannten Ziel-Pfad innerhalb der gültigen Kategorien-Verzeichnisse, kein Schreiben außerhalb erlaubt; bindet `doc-categories` ein        |
| `skills/sf-apply-plan/SKILL.md`    | Erkennt Doku-Pläne weiterhin am Workflow-Marker; gibt im Hand-off-Hinweis zusätzlich die im Plan genannte Doku-Kategorie und den Ziel-Pfad mit                       |
| `skills/sf-open-plans/SKILL.md`    | Listet bei Doku-Plänen zusätzlich die Ziel-Kategorie als Spalte, damit offene Doku-Pläne nach Zielgruppe erkennbar sind                                              |
| `README.md`                        | Beschreibt die neue Konvention im Abschnitt „Struktur“ und ggf. im Abschnitt zur Plan-Statuszeile                                                                    |
| `docs/skill-migration-notes.md`    | Falls historisch relevant: kurzer Hinweis, dass die Konvention ab dieser Plugin-Version gilt                                                                         |

Hinweis zu generierten Artefakten: `build.mjs` selbst muss nicht angepasst werden; durch die Verwendung der bestehenden Platzhalter und des neuen Includes propagiert die Konvention automatisch in `dist/codex/` und `dist/claude/`.

## Implementierungsdetails

### Vorgehen

1. Neuen Shared-Include `skills/_shared/doc-categories.md` anlegen mit:
   - Liste der vier Kategorien inkl. Zielgruppe
   - Verbindliche Verzeichnisnamen relativ zum Projekt-Root
   - Dateinamen-Konvention (topic-basiert, Kebab-Case, eindeutig, ohne NNNN-Prefix)
   - Sub-Topic-Regel für `runbooks/`
   - README-Regel für `user-guide/`
   - Klare Aussage, dass diese Verzeichnisse die einzig erlaubten Zielorte für finale Doku aus dem Doku-Workflow sind
2. `sf-plan` erweitern:
   - In Phase 1 bei Klassifikation „Dokumentation“ zusätzlich die Doku-Kategorie bestimmen.
   - In Phase 2 fehlt: bei Unsicherheit der Kategorie oder des Topic-Slugs explizit nachfragen.
   - Plan-Template erhält für Doku-Pläne zwei zusätzliche Felder im Kopf:
     - eine Zeile `**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks`
     - eine Zeile `**Ziel-Pfad:** docs/<kategorie>/<topic-slug>.md`
   - Plan-Validierung (Phase 5) prüft bei Doku-Plänen, dass beide Felder gesetzt und konsistent sind und der Ziel-Pfad zur Kategorie passt.
3. `sf-docs` erweitern:
   - In der Routing-Phase aus der referenzierten Plan-Datei `Doku-Kategorie` und `Ziel-Pfad` lesen.
   - Wenn kein Plan referenziert ist, in Phase 1 die Kategorie zusammen mit dem Doku-Plan klären und den Ziel-Pfad festlegen.
   - Vor Phase 2 sicherstellen, dass das Zielverzeichnis existiert; bei Fehlen ohne Rückfrage anlegen.
   - In Phase 4 prüfen, dass `sf-docs-writer` ausschließlich innerhalb der gültigen Doku-Kategorien geschrieben hat. Bei Abweichung als Fehler markieren.
4. `sf-docs-writer` anpassen:
   - Im Regelwerk explizit nur in `docs/user-guide/`, `docs/developer-guide/`, `docs/operations/`, `docs/runbooks/` und deren Unterordnern schreiben, plus README-Sonderfall in `docs/user-guide/`.
   - Bestehende projekteigene Doku außerhalb dieser Verzeichnisse (z. B. eine Top-Level-`README.md`) bleibt erlaubt, wenn ein Plan diese Datei ausdrücklich nennt.
5. `sf-apply-plan` anpassen:
   - Im Übergabehinweis an `sf-docs` neben Plan-Pfad zusätzlich `Doku-Kategorie` und `Ziel-Pfad` aus dem Plan extrahieren und mitgeben, damit `sf-docs` ohne erneutes Parsen weiß, wohin geschrieben wird.
6. `sf-open-plans` anpassen:
   - Bei Doku-Plänen die Spalte `Kurzfassung` um die erkannte `Doku-Kategorie` ergänzen oder eine separate Spalte `Kategorie` hinzufügen.
7. `README.md` aktualisieren:
   - Im Struktur-Block die vier neuen Verzeichnisse mit Zielgruppe nennen.
   - Im Abschnitt zur Plan-Statuszeile auf die zusätzlichen Felder `Doku-Kategorie` und `Ziel-Pfad` für Doku-Pläne hinweisen.
8. Build erneut laufen lassen und prüfen, dass alle generierten Codex-Skills und Claude-Commands die Include-Inhalte enthalten.

### Komponenten-Struktur

Nicht relevant. Es entstehen keine neuen Code-Komponenten, sondern eine projektweite Ablage- und Skill-Konvention.

### State-Management

Nicht relevant.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant.

### Barrierefreiheit

Nicht relevant. Die Konvention betrifft Markdown-Ablagepfade, keine UI.

### Edge Cases

- **Mehrdeutige Zielkategorie:** Ein Dokument beschreibt sowohl Deployment (operations) als auch eine Step-by-Step-Notfallprozedur (runbooks). Erwartetes Verhalten: `sf-plan` fragt den User; das Dokument wird in genau einer Kategorie abgelegt; Querverweise per Link.
- **Bestehende Dokumente außerhalb der Konvention:** In Bestandsprojekten existieren bereits Doku-Dateien an anderen Stellen. Erwartetes Verhalten: bestehende Pfade bleiben unverändert, Migration nur auf ausdrücklichen Wunsch über einen separaten Plan; neue Dokumente folgen der Konvention.
- **Slug-Kollision:** Zwei Dokumente in derselben Kategorie wollen denselben Slug benutzen. Erwartetes Verhalten: `sf-plan` prüft Existenz des Ziel-Pfads und fordert einen eindeutigen Slug oder eine bewusste Überschreibung im Plan.
- **Runbook-Sub-Topic später ausgliedern:** Aus einem flachen `docs/runbooks/restart-database.md` soll später `docs/runbooks/database/restart.md` werden. Erwartetes Verhalten: gilt als Refactoring der Doku-Struktur, eigener Plan via `/refactor` oder erneutem `/docs`-Lauf.
- **Plan ohne Doku-Kategorie:** Ein bestehender Doku-Plan aus der Zeit vor dieser Konvention hat keine Kategorie. Erwartetes Verhalten: `sf-docs` erkennt das fehlende Feld, fragt den User nach Kategorie und Ziel-Pfad und ergänzt die Felder in der Plan-Datei vor der Umsetzung.
- **Schreibversuch außerhalb der Doku-Verzeichnisse:** `sf-docs-writer` soll versehentlich in `docs/plan/` oder `src/` schreiben. Erwartetes Verhalten: `sf-docs` validiert nach Phase 2 den Schreibpfad und meldet das als Fehler.

## Akzeptanzkriterien

- [ ] `skills/_shared/doc-categories.md` existiert und definiert die vier Kategorien, Verzeichnisnamen, Dateinamen-Konvention, Sub-Topic-Regel für Runbooks und README-Regel für User-Guide.
- [ ] `sf-plan` erzeugt für Doku-Pläne zusätzlich die Kopfzeilen `**Doku-Kategorie:**` und `**Ziel-Pfad:**` mit gültigen Werten.
- [ ] `sf-plan` weist Pläne mit unklarer oder fehlender Doku-Kategorie zurück oder fragt nach, bevor der Plan abgeschlossen wird.
- [ ] `sf-docs` legt fehlende Doku-Verzeichnisse vor der Umsetzung an und delegiert das Schreiben mit explizitem Ziel-Pfad an `sf-docs-writer`.
- [ ] `sf-docs-writer` schreibt finale Doku-Dokumente nur innerhalb der vier Doku-Kategorien-Verzeichnisse, mit Ausnahme einer expliziten Bestands-Datei-Referenz im Plan.
- [ ] `sf-apply-plan` übergibt Doku-Kategorie und Ziel-Pfad als Kontext an `sf-docs`.
- [ ] `sf-open-plans` listet die Doku-Kategorie offener Doku-Pläne an.
- [ ] `README.md` beschreibt die neue Verzeichnisstruktur und die zusätzlichen Plan-Kopfzeilen.
- [ ] `node build.mjs` läuft fehlerfrei durch, alle generierten Codex- und Claude-Artefakte enthalten den neuen Include.
- [ ] Manueller End-to-End-Test: ein neuer Doku-Plan via `/plan` produziert eine korrekt strukturierte Plan-Datei in `docs/plan/`; eine anschließende Umsetzung via `/docs` legt das Zieldokument am richtigen Pfad ab.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass die generierten Dateien in `dist/codex/` und `dist/claude/` den Inhalt von `doc-categories` an den erwarteten Stellen enthalten.
- Inspektion der generierten Skill-Texte für `sf-plan`, `sf-docs`, `sf-docs-writer`, `sf-apply-plan`, `sf-open-plans`.
- Trockenlauf: in einem Sandbox-Projekt einen Doku-Plan erzeugen, manuell prüfen, dass die Kopfzeilen korrekt gesetzt sind, anschließend `sf-docs` mit der Plan-Datei aufrufen und prüfen, dass das finale Dokument im richtigen Verzeichnis landet.
- Negativ-Test: Plan ohne `Doku-Kategorie` erzeugen, `sf-docs` aufrufen, prüfen, dass nachgefragt wird statt ungefragt in `docs/plan/` zu schreiben.
- Lese-Test: bestehende Doku-Pläne unter `docs/plan/` öffnen und prüfen, dass `sf-open-plans` und `sf-apply-plan` nicht abstürzen, wenn die neuen Felder fehlen.

## Annahmen und offene Punkte

- Annahme: deutsche Doku-Sprache bleibt für die Inhalte erhalten; die Verzeichnisnamen sind bewusst englisch, weil sie strukturelle Bezeichner sind, nicht Inhalte.
- Annahme: Es gibt aktuell in `docs/plan/` keine Doku-Pläne, die wegen fehlender neuer Felder beim ersten Apply scheitern könnten. Falls doch, fallen sie in den Edge Case „Plan ohne Doku-Kategorie“.
- Offener Punkt: Sub-Topic-Konvention für `runbooks/` ist bewusst „erlaubt aber nicht erzwungen“. Wenn sich später ein Muster etabliert (z. B. immer nach betroffenem System), kann das in einem späteren Plan in eine harte Regel überführt werden.
- Offener Punkt: ob der Plugin-eigene `docs/`-Baum (also dieses Repository selbst) initial mit `developer-guide/` und ggf. `operations/` befüllt werden soll, ist nicht Teil dieses Plans; das ist eigenständige Doku-Arbeit über `/docs` nach Konvention.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- Architektur (Hinweis): Der neue Shared-Include `doc-categories` koppelt fünf Skills an dieselbe Konventionsquelle. Das ist gewollt; sollte sich die Konvention je nach Projekt unterscheiden müssen, wäre eine projektlokale Überschreibung (z. B. via `.sf-plugin/config.json`) ein späterer Erweiterungspunkt — bewusst nicht jetzt umgesetzt, weil keine konkrete Anforderung dafür existiert.
- Fehlerfälle (Hinweis): Der Negativ-Test im Validierungsplan deckt nur den Fall ab, dass `Doku-Kategorie` fehlt. Andere Fehlbildungen (z. B. Kategorie vorhanden, Ziel-Pfad inkonsistent) sollten in der Skill-Anpassung von `sf-plan` und `sf-docs` mitgedacht werden. Akzeptanzkriterium dafür ist über „prüft Konsistenz“ abgedeckt.
- Scope (Hinweis): Der Plan ändert bewusst keine Bestandsdokumente und plant keine Migration vorhandener Doku-Pfade. Migration ist ein eigenständiger Folgeplan, falls gewünscht. Damit bleibt der Scope eng.
- Wartbarkeit (Hinweis): Die Topic-basierte Slug-Konvention setzt voraus, dass Slugs disziplinär gewählt werden. Über die Slug-Kollisions-Prüfung in `sf-plan` ist das maschinell abgesichert, eine zentrale Liste „bereits vergebener Slugs“ pro Kategorie ist nicht nötig.

## Testergebnisse

- `node build.mjs` lief fehlerfrei durch und erzeugte 11 Codex-Skills, 9 Codex-Agents, 11 Claude-Commands und 9 Claude-Agents.
- Stichprobenprüfung der generierten Artefakte:
  - `dist/codex/skills/sf-plan/SKILL.md`, `dist/codex/skills/sf-docs/SKILL.md` und `dist/codex/agents/sf-docs-writer.toml` enthalten den neuen Include-Inhalt `## Doku-Kategorien`.
  - Die korrespondierenden Claude-Outputs (`commands/plan.md`, `commands/docs.md`, `agents/docs-writer.md`) enthalten den Include ebenfalls.
  - `commands/apply-plan.md` und `commands/open-plans.md` enthalten die neuen Hinweise zur Doku-Kategorie und zum Ziel-Pfad.
  - Die generierte TOML-Datei für `sf-docs-writer` bleibt syntaktisch gültig (Description in `"…"`, Body in `'''…'''`).
- Manueller Negativ-Test bewusst nicht ausgeführt: ein End-to-End-Lauf eines Doku-Plans gegen ein Sandbox-Projekt ist nicht Teil dieses Plan-Abschlusses; das Akzeptanzkriterium dazu wurde durch die Skill-Anpassung mit Pflichtfeld-Prüfung und Schreibgrenze adressiert.

## Review-Findings

**Datum:** 2026-06-15
**Reviewer:** keiner

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine Findings gefunden. Diese Änderung betrifft ausschließlich Skill-Workflow-Dokumente (Markdown) und den generierten Build-Output. Eine separate Reviewer-Phase wurde nicht gestartet, weil weder Produktionscode noch Tests geändert wurden; die Validierung erfolgte über den erfolgreichen Build und gezielte Inspektion der generierten Outputs.
