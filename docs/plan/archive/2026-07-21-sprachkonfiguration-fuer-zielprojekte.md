# Sprachkonfiguration für Effective Flow in Zielprojekten

**Planungsstatus:** Umgesetzt
**Quelle:** $effective-flow plan
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Effective Flow soll die Sprache seiner erzeugten und bearbeiteten Inhalte nicht länger aus einem
pauschalen englischen Default und einer davon getrennten `plan.markerLanguage` ableiten. Jedes
Zielprojekt erhält stattdessen im Projektsetup-ADR eine verständliche Sprachkonfiguration mit einer
Projektsprache als Fallback und gezielten Overrides für unterschiedliche Kommunikationsflächen.

Die Änderung ist ein Feature, weil sie das Verhalten von Setup, Planung, Review, Dokumentation,
Git- und Forge-Workflows projektabhängig verändert. Der Statusmarker eines Plans wird nicht mehr
separat konfiguriert, sondern folgt immer der ermittelten Sprache des jeweiligen Plans.

Mit dem User geklärt:

- Die Einstellungen gehören in das Projektsetup des jeweiligen Zielprojekts, nicht nur in die
  Policy dieses Repositories.
- Eine Projektsprache dient als Default; einzelne Flächen dürfen sie überschreiben.
- Zunächst werden ausschließlich `de` und `en` unterstützt.
- Lokale Review-Artefakte folgen der Effective-Flow-Artefaktsprache, auf GitHub oder Forgejo
  veröffentlichte Reviews dagegen der Forge-Sprache.
- Commit-Beschreibungen und daraus erzeugte Changelog-/Release-Prosa erhalten mit
  `language.git` einen eigenständigen Override; Conventional-Commit-Typen bleiben englisch.
- Deutsche Inhalte verwenden `de-DE`, englische Inhalte `en-US` als Typografie-Locale.

Verifizierter Code-Kontext am Planungsstand `1cdd053` vom 2026-07-21:

- `src/shared/language-rules.md` setzt derzeit Code, Bezeichner, Tests und Commit-Messages auf
  Englisch und behandelt Dokumentation sowie Tool-Instruktionen pauschal als englisch mit
  möglicher deutscher Ausnahme.
- Der Shared-Include wird von allen artefakterzeugenden Tools und Agents verwendet, enthält aber
  noch keine Auflösung nach Zieloberfläche.
- `src/tools/setup.md`, `src/tools/plan.md`, `src/tools/build.md` und die Benutzerdokumentation
  behandeln `plan.markerLanguage` als eigenständigen Wert, ausdrücklich unabhängig vom
  Planinhalt.
- Planleser und -schreiber erkennen teilweise unterschiedliche Headerformen: Unter anderem
  erwarten `src/shared/plan-reference-routing.md`, `src/tools/open-plans.md`,
  `src/tools/apply-plan.md` und `src/tools/docs.md` nicht durchgängig dieselben deutschen und
  englischen Felder.
- `src/tools/review.md` und `src/shared/issue-tracker.md` besitzen feste englische
  Report-/Issue-Templates mit punktueller deutscher Lesekompatibilität; eine konfigurierte
  Ausgabesprache fehlt.
- Die Konfiguration wird als flache Tabelle im Living ADR gelesen und von `src/tools/setup.md`
  nicht-destruktiv geschrieben. Fehlende Schlüssel bedeuten bereits heute „Default verwenden“.
- Der Arbeitsbaum war bei der Planung nicht sauber. Insbesondere `AGENTS.md`, `.gitignore`, die
  Entfernung von `.effective-flow/config.json` und das neue
  `docs/adr/effective-flow-project-setup.md` stammen aus einer bereits laufenden
  Setup-Migration und dürfen bei der Umsetzung nicht überschrieben oder zurückgesetzt werden.

## Architekturentscheidungen

### Konfigurationsmodell

Die Sprachkonfiguration verwendet einen gemeinsamen Block. `language.project` ist der zentrale
logische Fallback mit Default `en`; jeder fehlende Override erbt diesen Wert.

| Schlüssel                          | Geltungsbereich                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `language.project`                 | Default für alle nicht überschriebenen menschenlesbaren Inhalte                                                  |
| `language.source`                  | Kommentare, Testbeschreibungen und In-Code-Dokumentation; nicht Bezeichner oder maschinenlesbare Verträge        |
| `language.documentation.user`      | Root-README/Marketing-Einstieg und Benutzerdokumentation                                                         |
| `language.documentation.technical` | Entwicklerdokumentation, API-Dokumentation, Operations-Dokumentation und Runbooks                                |
| `language.workflow`                | Neue Pläne, Plan-Reviews, lokale Review-Reports, Untersuchungsberichte und sonstige menschenlesbare EF-Artefakte |
| `language.forge`                   | Issues, PR-Beschreibungen, Issue-/PR-Kommentare, Remote-Reviews und Review-Thread-Antworten                      |
| `language.git`                     | Commit-Beschreibungen, Conventional-Commit-PR-Titel sowie daraus erzeugte Changelog- und Release-Note-Prosa      |

Alle Werte sind `de` oder `en`. Ein fehlender Override ist kein Fehler, sondern erbt
`language.project`; fehlt auch die Projektsprache, gilt `en`. `null` erhält für diese Schlüssel
keine Sonderbedeutung.

### Auflösungsreihenfolge

Für jedes neue oder bearbeitete Artefakt gilt genau eine zentrale Reihenfolge:

1. Eine ausdrückliche User-Vorgabe für das konkrete Artefakt gewinnt.
2. Beim Bearbeiten eines vorhandenen Artefakts wird dessen erkennbare Sprache beibehalten, sofern
   keine Übersetzung verlangt wurde.
3. Für neue Artefakte gilt der passende oberflächenspezifische Override.
4. Danach gilt `language.project`.
5. Ohne verwertbare Konfiguration gilt `en`.

Bei Überschneidungen entscheidet das Veröffentlichungsziel: Ein lokaler Review-Report verwendet
`language.workflow`, derselbe Review als Issue verwendet `language.forge`; ein Commit innerhalb
eines PR-Workflows verwendet `language.git`. Der Conventional-Commit-PR-Titel folgt ebenfalls
`language.git`, weil er beim Squash-Merge zum Commit-Subject wird; PR-Beschreibung und Kommentare
folgen weiterhin `language.forge`. Eingehende fremde Texte und wörtliche Zitate werden nicht
automatisch übersetzt.

Ein Orchestrator löst die benötigten Sprachen einmal pro Lauf aus User-Vorgabe, bestehendem
Artefakt und Projektsetup auf und übergibt den konkreten Wert an delegierte Agents. Agents lesen
den Projektsetup-ADR nicht jeweils erneut. Eigenständig gestartete Tools ohne aufrufenden
Orchestrator führen dieselbe Auflösung selbst durch. Dadurch bleiben parallele Writer konsistent
und die Konfiguration wird nicht in mehreren leicht abweichenden Varianten interpretiert.

### Feste und abgeleitete Sprachelemente

- Der komplette Plan – Headerfelder, Abschnittsüberschriften, Review-Teil, offene Punkte und
  Statusmarker – verwendet eine Sprache. Beim Bearbeiten bestehender Pläne bleibt diese Sprache
  erhalten.
- Deutsche und englische Plan-, Review- und Trackerformate bleiben dauerhaft lesbar. Neue
  Artefakte werden nur in der ermittelten Sprache geschrieben; gemischte Formate sind ungültig.
- In menschenlesbaren Plan- und Review-Formaten folgen Überschriften, Feldnamen und angezeigte
  Werte der Artefaktsprache. Reader ordnen beide kanonischen Sprachvarianten auf dieselben
  internen Bedeutungen ab; Routingwerte und Referenzen wie `effective-flow-fix` bleiben stabil.
- Maschinenlesbare Elemente bleiben sprachstabil und grundsätzlich englisch beziehungsweise
  ASCII: Config-Keys, Labelnamen, HTML-Idempotenzmarker, Finding-IDs, Action-Werte, Dateipfade,
  Conventional-Commit-Typen, Branch-Slugs sowie Schemas und Überschriften interner
  Runtime-/Wisdom-Dateien werden nicht lokalisiert.
- `language.source` lokalisiert keine Code-Bezeichner, öffentlichen API-Namen oder Datenformate.
  Sichtbare Produkttexte wie UI-, CLI- und Fehlermeldungen folgen den i18n-/Produktvorgaben des
  Zielprojekts und liegen außerhalb dieser Projektsprachkonfiguration.
- Interaktive, nicht persistierte Agentenantworten und Rückfragen folgen primär der Sprache des
  aktuellen Users. Die Projektkonfiguration dient nur als Fallback, wenn die Gesprächssprache
  nicht erkennbar ist.
- `de` bindet die zentrale `locale-typography`-Regel als `de-DE`, `en` als `en-US` ein. Eine
  eigenständige Locale-Konfiguration wird in diesem Schritt nicht eingeführt.
- Ein neu angelegter Projektsetup-ADR verwendet für Titelumfeld, Kontext, Status- und
  Tabellenüberschriften `language.documentation.technical`. Der bootstrap-fähige Leser erkennt
  die kanonische deutsche und englische Tabellenform, bevor er den Sprachwert auswertet.
  Config-Keys und codierte Werte bleiben in beiden Formen identisch und englisch. Ein bestehender
  Projektsetup-ADR behält beim normalen Aktualisieren seine Sprache; die Änderung der technischen
  Dokumentationssprache löst keine automatische Übersetzung aus.

### Migration und Entscheidungsdokumentation

- `plan.markerLanguage` wird aus dem neuen Schema entfernt. Solange ein Zielprojekt nur diesen
  Altschlüssel besitzt, darf er für eine Read-/Setup-Kompatibilitätsgeneration als Fallback für
  `language.workflow` gelesen werden; dabei wird auf `$effective-flow setup` hingewiesen.
- Fehlen sowohl `language.*` als auch `plan.markerLanguage`, darf ein inhaltlich eindeutig
  deutscher oder englischer bestehender Planbestand für dieselbe
  Read-/Setup-Kompatibilitätsgeneration als
  `language.workflow`-Fallback dienen. Der Marker allein genügt wegen seiner früher getrennten
  Semantik nicht: Marker und Planprosa müssen konsistent sein, gemischte oder widersprüchliche
  Bestände liefern kein Signal. Effective Flow weist auch in diesem Fall auf
  `$effective-flow setup` hin.
- „Eine Kompatibilitätsgeneration“ bedeutet: Alte Werte und eindeutige Bestände werden gelesen und
  vom Setup migriert, aber von keinem Writer neu erzeugt. Eine spätere Entfernung dieser
  Lesepfade braucht einen eigenen Plan; dieses Feature setzt kein kalendarisches Ablaufdatum.
- `$effective-flow setup` zeigt die Umdeutung von Marker- zu kompletter Workflow-Sprache im
  Vorher-/Nachher-Vergleich und übernimmt sie nur im ohnehin vorgeschriebenen bestätigten
  Schreibschritt. Danach wird der Altschlüssel entfernt. Ein bereits gesetztes
  `language.workflow` gewinnt und wird nie überschrieben.
- Vorhandene Pläne, Reports, Issues, PRs und Dokumente werden nicht massenhaft übersetzt. Ihre
  jeweilige Sprache bleibt beim nächsten Bearbeiten erhalten.
- Die dauerhafte Begründung, Geltungsbereiche, Ausnahmen und Review-Trigger werden im Living ADR
  `docs/adr/language-policy.md` festgehalten. Die ausführbare Auflösungslogik bleibt in
  `src/shared/language-rules.md`, Setup und den jeweiligen Artefaktverträgen.

## Betroffene Dateien

| Datei oder Bereich                                                                                                                                                       | Geplante Änderung                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/language-rules.md`                                                                                                                                           | Zentrale Sprachdomänen, Auflösungsreihenfolge, Locale-Zuordnung und Abgrenzung von menschen- zu maschinenlesbaren Inhalten definieren.                                                                                     |
| `src/shared/config-migration.md`                                                                                                                                         | Neue `language.*`-Schlüssel, bootstrap-fähige deutsche/englische ADR-Tabellenformen und die nicht-destruktive Übergangsregel für `plan.markerLanguage` in den gemeinsamen Konfigurationsvertrag aufnehmen.                 |
| `src/tools/setup.md`                                                                                                                                                     | Express-/Guided-Setup um Projektsprache und Overrides erweitern; Markerfrage entfernen; Migration und Vorher-/Nachher-Bestätigung ergänzen.                                                                                |
| `src/shared/plan-status.md`, `src/shared/plan-reference-routing.md`, `src/shared/apply-clarity-gate.md`, `src/shared/doc-categories.md`                                  | Den vollständigen zweisprachigen Planvertrag zentralisieren: Planinhalt und Marker koppeln, deutsche und englische Header/Abschnitte lesen, gemischte Schreibformen verhindern.                                            |
| `src/tools/plan.md`, `src/tools/plan-review.md`, `src/tools/open-plans.md`, `src/tools/build.md`                                                                         | Neue Pläne und initiale Zustandspläne in `language.workflow` erzeugen; vorhandene Plansprache erhalten; alte Markerdetection auf die Migration begrenzen.                                                                  |
| `src/tools/apply-plan.md`, `src/tools/docs.md`, `src/shared/worktree-integration.md`                                                                                     | Beide kanonischen Plansprachen konsistent auslesen und beim Statusabschluss die zum Plan gehörende Markerform erhalten.                                                                                                    |
| `src/tools/review.md`, `src/shared/unresolved-review-report.md`, `src/shared/review-report-backlinks.md`, `src/shared/issue-tracker.md`                                  | Lokale Reports und spätere Statusnotizen nach der Report-/Workflow-Sprache, Remote-Findings/-Epics nach `language.forge` rendern; beide Altformate weiterhin lesen; Labels und IDs stabil halten.                          |
| `src/tools/investigate.md`                                                                                                                                               | Lokale Diagnoseberichte nach `language.workflow` erzeugen; transiente Wisdom-Strukturen davon getrennt sprachstabil halten.                                                                                                |
| `src/tools/apply-review.md`, `src/tools/apply-review-remote.md`, `src/tools/apply-issues.md`, `src/tools/plan-issue.md`                                                  | Statusnotizen, Planungs-/Umsetzungskommentare und Entscheidungsrückgaben nach Zieloberfläche schreiben und bestehende Sprache erhalten.                                                                                    |
| `src/tools/pr.md`, `src/tools/iterate.md`, `src/shared/pr-review-comments.md`                                                                                            | Conventional-Commit-PR-Titel nach `language.git`, übrige PR-Prosa und Thread-Antworten nach `language.forge` erzeugen; englischspezifische Schreib-Skills nur bei englischer Ausgabe bevorzugen.                           |
| `src/tools/commit.md`, `src/tools/apply-review-commit-mechanics.md`, `src/tools/maintain.md`, `src/shared/commit-message-rules.md`, `src/shared/worktree-integration.md` | Commit-Beschreibungen in eigenständigen und eingebetteten Commitpfaden nach `language.git` formulieren; Conventional-Commit-Typen und technische Tokens unverändert englisch lassen.                                       |
| `src/agents/marketing-writer.md`, `src/agents/docs-writer.md`, `src/agents/code-documenter.md`                                                                           | Dokumentationssprache aus Zielpfad und Sprachdomäne ableiten; bestehende Dokumente ohne Übersetzungsauftrag sprachlich fortführen.                                                                                         |
| `src/agents/test-writer.md`, `src/agents/e2e-tester.md`, `src/agents/code-validator.md`                                                                                  | Kommentare/Testbeschreibungen und Sprachvalidierung an `language.source` koppeln, während Code- und Vertragsbezeichner stabil bleiben.                                                                                     |
| `src/shared/adr-convention.md`                                                                                                                                           | Sprache neu erzeugter ADRs als technische Dokumentationssprache definieren, ohne das Living-ADR-Modell zu ändern.                                                                                                          |
| `docs/adr/language-policy.md`                                                                                                                                            | Neue Living ADR mit Entscheidung, Vererbung, Ausnahmen, Migration und Review-Triggern anlegen.                                                                                                                             |
| `AGENTS.md`                                                                                                                                                              | Repository-Regeln auf das neue Modell verweisen und die bisherige pauschale Englisch-/Markerregel ersetzen; vorhandene Setup-Markeränderung erhalten.                                                                      |
| `docs/user-guide/configuration.md`, `docs/user-guide/tools-setup.md`, `docs/user-guide/troubleshooting.md`                                                               | Schema, Setup-Ablauf, Defaults, Vererbung, Migration und Fehlerdiagnose dokumentieren; gleichzeitig die bereits veraltete `config.json`-Darstellung an den Projektsetup-ADR angleichen.                                    |
| `docs/user-guide/tools-understand.md`, `docs/user-guide/tools-quality.md`, `docs/user-guide/tools-deliver.md`, `docs/user-guide/remote-tracker.md`                       | Sichtbares Verhalten von Plan, Review, Commit, PR und Remote-Tracker je Sprachdomäne beschreiben.                                                                                                                          |
| `docs/developer-guide/plan-conventions.md`, `docs/developer-guide/terminology.md`, `docs/developer-guide/architecture.md`                                                | Bilingualen Artefaktvertrag, stabile technische Tokens und zentrale Sprachauflösung für Maintainer dokumentieren.                                                                                                          |
| `docs/adr/effective-flow-project-setup.md`                                                                                                                               | Nur falls die derzeit ungetrackte Setup-Migration bei Umsetzungsbeginn noch in diesem Stand vorliegt: als Dogfood-Konfiguration nach Bestätigung auf `language.*` migrieren, ohne andere laufende Änderungen zu verlieren. |
| `build.mjs`, `test/build-lib.test.mjs`                                                                                                                                   | Nur soweit für einen schmalen Konsistenz-Guard oder geänderte Include-Verträge nötig; keine eigene zweite Sprachlogik in JavaScript einführen.                                                                             |

## Implementierungsdetails

### Vorgehen

1. Vor Beginn den Arbeitsbaum und besonders `AGENTS.md`, `.gitignore`,
   `.effective-flow/config.json` sowie `docs/adr/effective-flow-project-setup.md` erneut lesen.
   Bei semantischem Konflikt mit der laufenden Setup-Migration anhalten; keine fremden Änderungen
   zurücksetzen.
2. Das Living ADR `language-policy.md` mit dem bestätigten Domänen- und Vererbungsmodell anlegen.
   Es erklärt die Entscheidung; exakte ausführbare Regeln bleiben in den Source-Instructions.
3. `language-rules.md` zum einzigen allgemeinen Resolver ausbauen. Jeder Consumer bestimmt zuerst
   seine Zieloberfläche und wendet danach dieselbe Präzedenz an. Orchestratoren lösen die Sprache
   einmal auf und übergeben sie als verbindlichen Delegationskontext an ihre Agents; nur
   eigenständig gestartete Tools lösen selbst auf. Bestehende Includes werden wiederverwendet;
   keine kopierten Mini-Resolver in einzelnen Tools oder Agents.
4. Das Konfigurationsschema und Setup erweitern. Express verwendet `language.project = en` und
   erbt für alle Overrides; Guided erklärt zuerst die Projektsprache und bietet danach die
   optionalen Abweichungen einschließlich „Projektsprache erben“ an. „Erben“ wird durch einen
   fehlenden Override repräsentiert; das Entfernen eines vorhandenen Overrides erscheint im
   Vorher-/Nachher-Diff und braucht dieselbe Bestätigung wie jede andere Änderung. Bereits
   vorhandene und unbekannte Schlüssel bleiben erhalten.
   Einen neuen Projektsetup-ADR in der technischen Dokumentationssprache erzeugen; beim Lesen
   zuerst beide kanonischen deutschen/englischen Tabellenhüllen erkennen und danach die stabilen
   englischen Keys/Werte auswerten. Bestehende ADR-Prosa bei normalen Config-Updates erhalten.
5. `plan.markerLanguage` kontrolliert migrieren. Ohne neue Workflow-Sprache bleibt der alte Wert
   nur übergangsweise lesbar; Setup zeigt die Verhaltensänderung explizit. Neue Konfigurationen
   schreiben den Schlüssel nicht mehr. Für vollständig unkonfigurierte Bestandsprojekte die
   bisherige Planbestandserkennung übergangsweise erhalten, aber nur bei konsistenter Planprosa
   und passendem Marker; gemischte oder widersprüchliche Bestände nicht heuristisch entscheiden.
6. Den Planvertrag so vereinheitlichen, dass nicht nur der Statusmarker, sondern alle
   menschenlesbaren Header und Abschnitte aus derselben Plansprache stammen. Alle Planleser
   akzeptieren die vollständigen deutschen und englischen kanonischen Formen; technische Werte
   wie Workflow-Typen und Pfade bleiben stabil.
7. Review- und Untersuchungsartefakte nach Ziel aufteilen: lokale Dateien verwenden Workflow-,
   Issues und Kommentare Forge-Sprache. `investigate` verwendet die Workflow-Sprache für den
   Diagnosebericht, nicht aber für interne Wisdom-Strukturen. Lesepfade akzeptieren bestehende
   deutsche und englische Reports; Writer erzeugen keine gemischten Templates.
8. Forge- und Git-Ausgaben getrennt anbinden. PR-/Issue-Prosa nutzt Forge-Sprache,
   Commit-Beschreibungen und Conventional-Commit-PR-Titel nutzen Git-Sprache. PR-Beschreibung und
   Kommentare bleiben in Forge-Sprache. Conventional-Commit-Präfixe, Labels, IDs, Marker und
   Slugs bleiben nicht lokalisiert.
9. Dokumentations- und Testagents auf die passenden Domänen umstellen: Marketing/User Guide,
   technische Guides/Operations/Runbooks, In-Code-Dokumentation und Testbeschreibungen werden
   eindeutig zugeordnet. Vorhandene Artefakte behalten ohne Übersetzungsauftrag ihre Sprache.
10. Benutzer- und Entwicklerdokumentation aktualisieren. Die Konfigurationsseite wird dabei auf
    den bereits eingeführten Projektsetup-ADR als Source of Truth korrigiert, damit nicht parallel
    ein veraltetes `config.json`-Modell dokumentiert bleibt.
11. Nur einen kleinen Build-Guard beziehungsweise Transform-Test ergänzen, falls die zentrale
    Include-Struktur sonst regressionsanfällig wäre. Sprachregeln nicht in `build.mjs`
    duplizieren.

### Rückwärtskompatibilität und Fehlerfälle

- Ungültige Sprachwerte werden nicht geraten. Der betroffene Override wird ignoriert, der nächste
  Fallback verwendet und der ungültige Schlüssel verständlich gemeldet.
- Ein existierendes Artefakt mit nicht eindeutig erkennbarer oder gemischter Sprache wird nicht
  automatisch umgeschrieben; vor einer Änderung ist die Sprache zu klären.
- Ein deutscher Plan mit englischer Statuszeile oder umgekehrt gilt weiterhin als unklar. Eine
  automatische Reparatur darf nur anhand des eindeutig erkennbaren restlichen Planformats oder
  nach User-Entscheidung erfolgen.
- Bei Remote-Reviews gewinnt `language.forge`, auch wenn `language.workflow` abweicht. Interne
  Signaturen, Labels und Action-Werte bleiben dadurch weiterhin deduplizierbar.
- Eine explizit verlangte Übersetzung darf den Erhalt-der-Dateisprache-Fallback übersteuern, muss
  aber das ganze Artefakt einschließlich Marker und kanonischer Felder konsistent umstellen.
- Repositories ohne Projektsetup-ADR funktionieren weiter mit `en`; kein Workflow darf allein
  wegen fehlender Sprachkonfiguration blockieren. Übergangsweise darf nur ein inhaltlich
  eindeutiger bestehender Planbestand den Workflow-Fallback vor `en` liefern.
- Neue Locale-Anforderungen wie `de-CH` oder `en-GB` sind nicht Teil dieses Features. Sie bleiben
  ein möglicher späterer Ausbau, ohne die `de`-/`en`-Schlüssel semantisch umzudeuten.

### Abgrenzung

- Keine Übersetzung des bestehenden Planarchivs, vorhandener Issues/PRs oder bestehender
  Dokumentation.
- Keine Produkt-i18n, keine Übersetzung von UI-/CLI-Texten und keine neue Locale-Infrastruktur im
  Zielprojekt.
- Keine Lokalisierung maschinenlesbarer Schlüssel, Labels, IDs, Pfade, Branches oder
  Conventional-Commit-Typen.
- Keine Änderung des Living-ADR-Modells, der Doc-Kategorien oder der Tracker-Modi.
- Keine manuelle Bearbeitung von `dist/`; beide Harness-Ausgaben entstehen ausschließlich über
  den Build aus `src/`.

## Akzeptanzkriterien

- [x] Ein Zielprojekt kann im Projektsetup-ADR `language.project` und jeden beschriebenen
      Override mit `de` oder `en` setzen; fehlende Overrides erben deterministisch die
      Projektsprache, vollständig fehlende Konfiguration fällt auf `en` zurück.
- [x] `$effective-flow setup` erklärt und schreibt die neue Sprachkonfiguration
      nicht-destruktiv, bietet Express und Guided an und migriert `plan.markerLanguage` nur nach
      sichtbarem Vorher-/Nachher-Vergleich, ohne unbekannte oder bereits neue Schlüssel zu
      überschreiben.
- [x] Ein neuer Projektsetup-ADR verwendet deutsche oder englische menschenlesbare
      Überschriften gemäß der technischen Dokumentationssprache, bleibt in beiden Formen lesbar
      und verwendet identische englische Config-Keys/Werte; ein vorhandener ADR wird bei einem
      normalen Setup-Update nicht beiläufig übersetzt.
- [x] Neue Pläne sind einschließlich Header, Statusmarker, Review-Abschnitt und offenen Punkten
      vollständig in `language.workflow`; vorhandene deutsche und englische Pläne werden in ihrer
      jeweiligen Sprache gelesen, bearbeitet und abgeschlossen.
- [x] Lokale Review-/Untersuchungsartefakte verwenden `language.workflow`, Remote-Issues und
      Kommentare `language.forge`, PR-Beschreibungen/-Kommentare `language.forge` und
      Commit-Beschreibungen sowie Conventional-Commit-PR-Titel `language.git`; bei abweichenden
      Werten entsteht kein gemischtes Artefakt.
- [x] Root-README und User Guide verwenden die User-Dokumentationssprache; Developer Guide,
      Operations, Runbooks und eigenständige API-Dokumentation die technische
      Dokumentationssprache; In-Code-Dokumentation und Testbeschreibungen die Source-Sprache;
      explizit erzeugte Changelog-/Release-Prosa die Git-Sprache.
- [x] Ausdrückliche User-Vorgaben und die Sprache vorhandener Artefakte haben die festgelegte
      Priorität; Produkttexte und fremde Zitate werden nicht unaufgefordert übersetzt.
- [x] Config-Keys, Labels, HTML-Marker, Finding-IDs, Action-Werte, Pfade,
      Conventional-Commit-Typen und Branch-Slugs bleiben über alle Sprachkombinationen stabil.
- [x] `plan.markerLanguage` erscheint in aktiven Writer-Regeln und der aktuellen
      Konfigurationsreferenz nicht mehr; Vorkommen bleiben ausschließlich in dokumentierter
      Migration beziehungsweise Lesekompatibilität.
- [x] Ein unkonfiguriertes Bestandsprojekt mit konsistent deutscher oder englischer Planprosa und
      passendem Marker behält diese Workflow-Sprache übergangsweise; gemischte, widersprüchliche
      oder leere Bestände werden nicht geraten und fallen auf `en` beziehungsweise eine nötige
      Klärung zurück.
- [x] Das Living ADR und die Benutzer-/Entwicklerdokumentation beschreiben dieselben Domänen,
      Defaults, Overrides, Prioritäten und Grenzen wie die Source-Instructions.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` bestehen; die generierten Claude- und
      Codex-Artefakte enthalten dieselbe Sprachauflösung, keine unaufgelösten Includes und keine
      widersprüchlichen alten Writer-Regeln.

Gemeinsame messbare Abschlussbedingung: Alle obigen Szenarien sind in den Source-Instructions und
der Dokumentation konsistent abgebildet, die drei CI-Befehle laufen mit Exit-Code 0 und eine
Stichprobe mit abweichenden Werten (`workflow = de`, `forge = en`, `git = en`) erzeugt pro
Zieloberfläche ausschließlich die erwartete Sprache bei stabilen technischen Tokens.

## Validierungsplan

- `pnpm agent:check` – sämtliche geänderten Markdown-/JavaScript-Dateien entsprechen oxfmt.
- `pnpm test` – bestehende Build-Transform- und Include-Verträge bleiben grün; ergänzte schmale
  Guard-Tests bestehen, falls die Include-Struktur angepasst wurde.
- `node build.mjs` – beide Harnesses werden vollständig erzeugt, alle Content-/Reference-Guards
  bestehen und die Router-Versionen bleiben identisch.
- Mit `rg` prüfen, dass `plan.markerLanguage` nur noch in expliziten Migrations- und
  Rückwärtskompatibilitätsabschnitten vorkommt und keine Writer-Anweisung es neu erzeugt.
- Mit `rg` und Sichtprüfung die generierten Plan-, Review-, PR-, Commit- und Docs-Instructions in
  `dist/claude/` und `dist/codex/` vergleichen: gleiche Präzedenz, gleiche Domänen und keine
  unaufgelösten Platzhalter/Include-Fences.
- Zwei gedanklich vollständige Setup-Szenarien anhand der generierten Instructions prüfen:
  vollständig fehlende Sprachkonfiguration → überall `en`; `project = de`, `source = en`,
  `forge = en` → deutsche neue Pläne/Dokumentation, englische Source-/Forge-Prosa und zum Plan
  passende deutsche Marker.
- Den Setup-Bootstrap mit einer deutschen und einer englischen ADR-Tabellenhülle prüfen: Beide
  liefern dieselben `language.*`-Werte; ein Update erhält die vorhandene Hüllensprache und
  unbekannte Schlüssel.
- Einen Legacy-Fall prüfen: ausschließlich `plan.markerLanguage = de` vorhanden. Lesen bleibt
  möglich, Setup zeigt die Migration auf `language.workflow = de`, entfernt den Altschlüssel erst
  nach Bestätigung und verändert keinen bestehenden Plan.
- Zwei unkonfigurierte Bestandsfälle prüfen: vollständig deutsche Planprosa mit passenden
  deutschen Markern → Übergangs-Fallback `language.workflow = de` plus Setup-Hinweis; gemischte
  Planprosa oder widersprüchliche Marker → kein Bestandssignal und keine heuristische Festlegung.
- Vor Abschluss `git diff --check` und einen gezielten Diff gegen die bei Start vorhandenen
  fremden Setup-Änderungen prüfen.

## Implementierungsdetails

- Der zentrale Resolver und die sieben `language.*`-Schlüssel sind in den gemeinsamen
  Source-Verträgen verankert; Orchestratoren geben konkrete Sprachen an Agents weiter.
- Plan-, Review-, Untersuchungs-, Dokumentations-, Forge- und Git-Writer verwenden vollständige
  deutsche oder englische Artefaktformen. Bestehende Artefakte behalten ihre erkennbare Sprache.
- Setup liest und schreibt deutsche sowie englische ADR-Hüllen mit stabilen englischen Keys und
  Werten. `plan.markerLanguage` bleibt ausschließlich als begrenzter Lese-/Migrationspfad erhalten.
- Der Remote-Tracker-Helper rendert Findings und Epics mit `language: en|de`; Maschinenfelder und
  Enum-Eingaben bleiben stabil. `build`, `docs` und `review` laden den umfangreichen Resolver am
  Entscheidungspunkt lazy, damit das Always-loaded-Budget eingehalten wird.
- Das Living ADR `docs/adr/language-policy.md` dokumentiert die dauerhafte Policy; Benutzer- und
  Entwicklerdokumentation sowie das Projektsetup dieses Repositories sind darauf abgestimmt.

## Testergebnisse

- `pnpm agent:check`: bestanden, 222 Dateien geprüft.
- `pnpm test`: bestanden, 278 von 278 Tests; darin 36 Remote-Tracker-Tests für englische und
  deutsche Payloads sowie ungültige Sprachwerte.
- `node build.mjs`: bestanden für Claude, Codex und Portable; alle Always-loaded-Kerne liegen im
  700-Zeilen-Budget (`review` exakt 700), keine unaufgelösten Includes oder Platzhalter.
- `git diff --check` und die gezielte Suche nach aktiven `plan.markerLanguage`-Writer-Regeln:
  bestanden. E2E-Tests entfallen, weil das Repository keinen ausführbaren UI-/CLI-Produktfluss
  enthält; das Verhalten wird durch Source-Verträge, Helper-Tests und generierte Harnesses geprüft.

## Review-Befunde

- Der unabhängige Review fand vier wichtige Inkonsistenzen: englisch fest verdrahtete
  Remote-Tracker-Payloads, abweichende Planüberschriften/-ergebnisse, eine veraltete
  englisch-exklusive Setup-Dokumentation und eine unklare Legacy-Fallback-Formulierung. Alle vier
  wurden korrigiert und durch Tests beziehungsweise Source-Verträge abgesichert.
- Der Schlussvalidator fand zusätzlich fehlende Resolver-Includes im eigenständigen Commit-Tool,
  eine zu breite englische Schreib-Skill-Empfehlung im PR-Tool und eine zu späte Sprachauflösung
  im Review-Orchestrator. Alle Punkte wurden korrigiert.
- Abschließender Validator: keine Fehler oder Warnungen, keine offenen kritischen oder
  blockierenden Befunde.

## Annahmen und offene Punkte

- Annahme: `language.documentation.technical` bündelt Entwickler-, Operations- und
  Runbook-Dokumentation; ein eigener Operations-Override ist zunächst nicht erforderlich.
- Entscheidung (im vertieften Review bestätigt): `language.git` ist eine eigenständige Domäne,
  weil Commit-Prosa über release-please Changelog und Release Notes beeinflusst; der
  Conventional-Commit-Typ bleibt unabhängig davon englisch.
- Entscheidung (im vertieften Review bestätigt): Der Conventional-Commit-PR-Titel verwendet
  `language.git`, weil er beim Squash-Merge zum Commit-Subject wird. PR-Beschreibung und
  Kommentare verwenden weiterhin `language.forge`.
- Entscheidung (im vertieften Review bestätigt): Ein unkonfiguriertes Zielprojekt mit einem
  inhaltlich eindeutigen deutschen oder englischen Planbestand darf diese Sprache für eine
  Übergangsgeneration als `language.workflow` verwenden. Marker und Prosa müssen konsistent sein;
  der Lauf verweist auf `$effective-flow setup`.
- Annahme: Die laufende Setup-Migration im Arbeitsbaum wird vor der Umsetzung entweder committed
  oder weiterhin als fremde Änderung erhalten. Der Plan autorisiert kein Zurücksetzen dieser
  Arbeit.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       2 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Wichtig – Architektur (eingearbeitet):** Ein PR-Titel gehört sichtbar zur Forge, wird bei
  einem Squash-Merge aber zum Commit-Subject. Der User hat entschieden: Der
  Conventional-Commit-PR-Titel folgt `language.git`; PR-Beschreibung und Kommentare folgen
  `language.forge`.
- **Wichtig – Rückwärtskompatibilität (eingearbeitet):** Ein bislang unkonfiguriertes Projekt kann
  sich heute bei neuen Plänen auf die eindeutige Sprache seines Planbestands stützen. Der User hat
  entschieden, diese Erkennung für eine Übergangsgeneration als Workflow-Fallback zu erhalten.
  Wegen der früher getrennten Markersprache verlangt der Plan konsistente Planprosa und Marker;
  gemischte oder widersprüchliche Bestände werden nicht geraten.
- **Hinweis – Architektur/Wartbarkeit:** Die Sprachentscheidung betrifft viele Writer und Reader.
  Der Plan begrenzt Drift durch einen zentralen Resolver in `language-rules.md`, einen
  vollständigen bilingualen Planvertrag und zielbezogene Overrides statt lokaler Sonderregeln.
  Im vertieften Review ergänzt: Orchestratoren lösen die Sprache einmal je Lauf auf und geben den
  konkreten Wert an Agents weiter; Agents parsen die Konfiguration nicht parallel erneut.
- **Hinweis – Fehlerfälle:** `plan.markerLanguage` hatte bisher eine engere Semantik als die neue
  Workflow-Sprache. Die Migration wird deshalb nicht stillschweigend überschrieben, sondern über
  Lesefallback, sichtbaren Setup-Diff und bestätigten Schreibschritt abgesichert.
- **Hinweis – Testbarkeit:** Effective Flow besteht überwiegend aus Instruktions-Markdown; das
  Laufzeitverhalten lässt sich nicht wie eine normale Funktion unit-testen. Der Plan kombiniert
  bestehende Transformtests, Build-Guards, generierte Harness-Inspektion und konkrete
  Konfigurationsszenarien.
- **Hinweis – Scope:** Produkt-i18n, Gesprächssprache und maschinenlesbare Tokens sind explizit
  abgegrenzt. Damit bleibt die Änderung auf persistierte Engineering-Artefakte und deren
  Projektsetup beschränkt.
- **Hinweis – Entscheidungsbestand:** `decision-records` bestätigt die ADR-Würdigkeit der
  projektweiten, kanalübergreifenden Policy. Das geplante Living ADR folgt der im Repository
  definierten nummernlosen und veränderbaren Konvention.
- **Hinweis – vertiefter Review:** Der User hat `language.git` als eigenständigen Override
  bestätigt und den Conventional-Commit-PR-Titel dieser Domäne zugeordnet. Außerdem wurde
  `src/tools/investigate.md` als zuvor fehlender Writer ergänzt und die Grenze zwischen
  lokalisiertem Diagnosebericht und sprachstabiler Wisdom-Struktur präzisiert. Für
  unkonfigurierte Bestandsprojekte wurde die bisherige Planbestandserkennung als begrenzte,
  inhaltsgeprüfte Übergangsregel erhalten.

## Offene Punkte

- Keine offenen Punkte.
