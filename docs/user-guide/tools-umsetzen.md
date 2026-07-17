# Tool-Referenz: Eine Änderung umsetzen

Diese Gruppe führt vom geklärten Plan oder Issue zum fertigen Code. Vier der sieben Tools
(`build`, `fix`, `refactor`, `docs`) teilen dasselbe Grundmuster; `apply` ist der reine
Router, `maintain` fährt wiederkehrende Wartung ohne Plan-Eingabe (siehe unten) und
`iterate` setzt eine bereits gelieferte Änderung fort:

- Sie können direkt mit einer Anforderung gestartet werden **oder** eine bereits von
  `/effective-flow plan` erzeugte Plan-Datei referenzieren. Eine referenzierte Plan-Datei muss zuerst
  das **Klärungs-Gate** bestehen (ausreichend konkrete Akzeptanzkriterien, betroffene
  Dateien, keine offenen Kernfragen); besteht sie es nicht, verweist das Tool auf
  `/effective-flow plan` bzw. `/effective-flow review <plandatei>`.
- Bei aktivem Delivery-/Worktree-Modus läuft die eigentliche Umsetzung in einem separaten
  Liefer-Branch bzw. Worktree; am Ende steht eine Abschluss-Aktion (`pr`, `merge` oder
  `branch`). Details siehe [Worktree und Delivery](worktree-und-delivery.md).
  `/effective-flow apply` selbst implementiert nichts, sondern delegiert nur.
- Nach der Freigabe eines internen Plans bieten sie eine explizite Goal-Abfrage an
  („Autonom via `/goal`“), damit die verbleibenden Phasen autonom statt schrittweise gated
  laufen können.
- Sie sichten vor der Analyse verfügbare Host-Skills (siehe
  [Skill-Discovery](skill-discovery.md)) und respektieren dabei ihre jeweilige
  Schreibgrenze.

`<plan.dir>` ist das Plan-Verzeichnis aus `.effective-flow/config.json` → `plan.dir` (Default
`docs/plan`, siehe [Konfiguration](konfiguration.md)).

## `/effective-flow apply`

**Zweck:** Reiner Einstiegs-Router. Nimmt eine beliebige Apply-Quelle entgegen – Plan-Datei,
lokaler Review-Report, Remote-Review-Epic/-Finding oder GitHub-/Forgejo-Issue –, klassifiziert
sie über die gemeinsame Apply-Quellen-Erkennung und delegiert an das zuständige interne Tool
(intern `apply-plan`, `apply-review` oder `apply-issues`; diese sind nicht direkt über
`/effective-flow` aufrufbar). `apply` implementiert selbst nichts.

**Wann nutzen:** Als Standard-Einstieg, um eine fertige Quelle umzusetzen, ohne selbst
entscheiden zu müssen, welches Tool zuständig ist.

**Typischer Aufruf:** `/effective-flow apply [<Plan-Datei>|<Report-Pfad>|<Issue-Referenz>]`

**Ein-/Ausgabe:** Ohne Argument listet `apply` lokale Kandidaten (offene Pläne aus
`<plan.dir>/`, Report-Dateien unter `.effective-flow/review/`) sowie im Remote-Tracker-Modus zusätzlich
offene Review-Epics und fragt danach nach der konkreten Quelle. Die Ausgabe besteht aus dem
erkannten Quelltyp, dem aufgelösten Handle und dem gestarteten Ziel-Tool.

**Zusammenspiel:** Reine Klassifikations- und Routing-Schicht; Umsetzung, Validierung,
Review und Commit-Vorbereitung liegen vollständig beim jeweiligen Ziel-Tool. Bei
mehrdeutigem oder gemischtem Quelltyp fragt `apply` nach, statt heuristisch zu raten.

## `/effective-flow build`

**Zweck:** Orchestriert den kompletten Feature-Workflow: Intent-Gate, optionale Planung über
`/effective-flow plan`, Implementierung, Dokumentation, Tests, Validierung, Review und Abschluss.

**Wann nutzen:** Neue Funktionalität, neues UI-Element, neue Seite, neue Integration oder
verändertes Nutzerverhalten. Wird der Intent stattdessen als Bugfix, Refactoring oder reine
Dokumentation erkannt, verweist `build` an `/effective-flow fix`, `/effective-flow refactor` bzw. `/effective-flow docs`
und beendet sich.

**Typischer Aufruf:** `/effective-flow build <Anforderung>` oder `/effective-flow build <plandatei>`

**Ein-/Ausgabe:** Eingabe ist die Feature-Anforderung oder eine referenzierte Plan-Datei.
Ausgabe sind die Code-Änderungen samt Tests und Doku, eine aktualisierte Plan-Datei (Status
`Umgesetzt`/`Implemented`, Review-Findings-Zusammenfassung, Archiv-Move nach
`<plan.dir>/archive/`) sowie – bei aktivem Delivery-/Worktree-Modus – ein Liefer-Branch mit
PR, Merge oder belassenem Branch.

**Zusammenspiel:** Delegiert intern an projekttyp-passende Implementer-, Test-, Doku- und
Reviewer-Agents. Offene, nicht umgesetzte Review-Findings landen als externer Report unter
`.effective-flow/review/`, der später über `/effective-flow apply` bzw. den passenden Umsetzungs-Workflow
abgearbeitet werden kann.

## `/effective-flow fix`

**Zweck:** Orchestriert den Bugfix-Workflow: Investigation, Reproduktion, Gap-Analyse,
Diagnose-Validierung, minimaler Fix, Regressionstest, Validierung und Abschluss – schlanker
als `build`, da standardmäßig keine eigene Planungsphase vorgeschaltet ist.

**Wann nutzen:** Ein konkreter Fehler soll behoben werden: etwas funktioniert nicht wie
erwartet oder es liegt eine Regression vor.

**Typischer Aufruf:** `/effective-flow fix <Fehlerbeschreibung>` oder `/effective-flow fix <plandatei>`

**Ein-/Ausgabe:** Eingabe ist die Fehlerbeschreibung, eine Plan-Datei oder der Aufruf-Vorschlag
aus einem `/effective-flow investigate`-Report. Ausgabe ist der minimale Fix samt Regressionstest, die
aktualisierte Plan-Datei (falls referenziert) und – bei aktivem Delivery-/Worktree-Modus – der
übliche Liefer-Branch mit Abschluss-Aktion.

**Zusammenspiel:** Baut häufig direkt auf einem `/effective-flow investigate`-Report auf. Anders als
`investigate` schreibt `fix` in Phase 2 bewusst einen Reproduktionstest, statt nur zu
beobachten.

## `/effective-flow refactor`

**Zweck:** Orchestriert Struktur- oder Lesbarkeitsverbesserungen ohne beabsichtigte
Verhaltensänderung. Erhebt vor der Umstrukturierung eine Baseline (Tests, TypeScript, Lint,
Build) und vergleicht sie nach dem Refactoring erneut, als Sicherheitsnetz gegen
Regressionen.

**Wann nutzen:** Code soll umstrukturiert, technische Schulden abgebaut oder Performance
verbessert werden, ohne dass sich das externe Verhalten ändert.

**Typischer Aufruf:** `/effective-flow refactor <Beschreibung>` oder `/effective-flow refactor <plandatei>`

**Ein-/Ausgabe:** Eingabe ist die Refactoring-Anforderung oder eine Plan-Datei. Ausgabe ist
der umstrukturierte Code samt Bestätigung, dass Tests/TypeScript/Lint/Build gegenüber der
Baseline unverändert grün sind, plus – bei aktivem Delivery-/Worktree-Modus – Liefer-Branch
und Abschluss-Aktion.

**Zusammenspiel:** Führt keine Dokumentationsphase ein, wenn kein öffentliches Verhalten
betroffen ist, und lässt neue Features oder ungeplante Bugfixes während des Laufs bewusst
außen vor – dafür sind `/effective-flow build` bzw. `/effective-flow fix` zuständig.

## `/effective-flow docs`

**Zweck:** Orchestriert Dokumentationsänderungen: README-Dateien, Entwickler-Guides,
API-/CLI-Dokumentation, Skill-Dokumentation, Migrationshinweise, Changelogs und
In-Code-Dokumentation. Ändert Produkt- oder Codeverhalten nur, wenn die Änderung selbst
dokumentationsnah ist (z. B. CLI-Help-Text oder JSDoc/TSDoc).

**Wann nutzen:** Dokumentation fehlt, ist veraltet oder soll neu strukturiert werden, ohne
dass sich Produktverhalten ändert. Dieses Referenzdokument selbst ist über `/effective-flow docs`
entstanden.

**Typischer Aufruf:** `/effective-flow docs <Beschreibung>` oder `/effective-flow docs <Doku-Plandatei>`

**Ein-/Ausgabe:** Eingabe ist die Dokumentationsanforderung oder eine Plan-Datei mit den
Kopfzeilen `**Doku-Kategorie:**` und `**Ziel-Pfad:**`. Ausgabe ist das neue oder aktualisierte
Dokument innerhalb einer der vier Kategorien (`docs/user-guide/`, `docs/developer-guide/`,
`docs/operations/`, `docs/runbooks/`); fehlen Kategorie oder Ziel-Pfad im Plan, fragt `docs`
danach.

**Zusammenspiel:** Nutzt für User-Doku den `docs-writer`-Agent, für In-Code-Dokumentation den
`code-documenter`-Agent. Details zur Kategorie- und Namenskonvention siehe
[Plan-Konventionen](../developer-guide/plan-konventionen.md).

## `/effective-flow maintain`

**Zweck:** Orchestriert schlanke, wiederkehrende Wartung eines Node-Projekts:
Dependency-Updates, Security-/Audit-Fixes und Breaking-Change-Adaption bei Major-Bumps.
Bewusst kein Scheduler – automatisches, zeitgesteuertes Bumpen übernehmen Werkzeuge wie
Renovate oder Dependabot; `maintain` ist der interaktive „jetzt aufräumen“-Lauf.

**Wann nutzen:** Veraltete Dependencies oder Security-Findings sollen aufgeräumt werden.
Nicht geeignet für allgemeines Refactoring (→ `/effective-flow refactor`), Bugfixes ohne
Dependency-Bezug (→ `/effective-flow fix`) oder neue Funktionalität (→ `/effective-flow build`).

**Typischer Aufruf:** `/effective-flow maintain`

**Ein-/Ausgabe:** Keine Eingabe nötig; das Tool erkennt den Paketmanager am Lockfile. Ausgabe
ist eine Gruppenübersicht (Safe-Batch, Major einzeln, Security) zur Auswahl, danach ein
eigener Commit je umgesetzter Gruppe und eine Zusammenfassung der zurückgestellten
„manuellen“ Updates.

**Zusammenspiel:** `maintain` ist ein **dünner Adapter** um den zentralen Skill
`smart-dependency-updater` – dieser liefert die eigentliche Update-Mechanik (Ecosystem-Erkennung,
Risiko-Gruppierung, Changelog-Research, Kompatibilitäts-Anpassung, Validierungsstrategie,
Update-Reporting), `maintain` besitzt nur die Orchestrierung und Delivery (Scope-Gate, grüne
Baseline, ein Commit pro Gruppe, Worktree/PR-Handback) und gibt dem Skill „Effective Flow besitzt
Delivery“ vor, damit nicht zwei Delivery-Schleifen laufen. Fehlt der Skill, greift ein bewusst
minimaler Fallback. `maintain` verweigert das Aktualisieren, solange die Vorher-Baseline bereits
rot ist, und verweist stattdessen auf `/effective-flow fix`. Bei Code-Anpassungen für Breaking
Changes läuft ein Reviewer-Pass wie bei `build`/`refactor`.

## `/effective-flow iterate`

**Zweck:** Führt Review-Anmerkungen aus einem bestehenden Pull-Request – Review-Bots wie
Greptile **und** menschliche Reviewer – sowie zusätzliche Freitext-Instruktionen als neue
Commits zurück in denselben PR. Ein „Mini-Build“ auf einer bereits gelieferten Änderung:
klassifiziert jeden Punkt, delegiert an `/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build` bzw.
`/effective-flow docs`, antwortet auf die adressierten Review-Threads und löst sie auf.

**Wann nutzen:** Ein Workflow wie `/effective-flow build` hat bereits einen PR erstellt, und danach sind
Anmerkungen eingegangen (Greptile-/Reviewer-Kommentare), die einfließen sollen – oder eine
bestehende Änderung soll gezielt per Freitext-Instruktion nachgebessert werden. Für eine neue
Änderung von Grund auf sind stattdessen `/effective-flow build`, `/effective-flow fix`, `/effective-flow refactor` bzw.
`/effective-flow docs` zuständig.

**Typischer Aufruf:** `/effective-flow iterate [<PR-Referenz>] [<Freitext-Instruktionen>]` – die
PR-Referenz ist optional (`#42`, bare Nummer oder PR-URL); ohne sie versucht `iterate`, den
offenen PR des aktuellen Branch aufzulösen.

**Ein-/Ausgabe:** Im **PR-Modus** liest `iterate` die Review-Threads aller Reviewer frisch,
klassifiziert jeden Punkt (umsetzbar, bereits adressiert oder reine Frage) und holt eine
Freigabe. Ausgabe ist **ein Commit pro umgesetztem Punkt** auf dem PR-Head-Branch (nur neue
Commits – kein Force-Push, Amend oder Rebase), eine kurze Antwort samt Auflösen je adressiertem
Thread und ein Summary-Kommentar. Reine Reviewer-Fragen werden zurückgestellt und im Summary
gelistet, nicht automatisch inhaltlich beantwortet. Ohne PR (**Local-Modus**) iteriert `iterate`
anhand der Freitext-Instruktionen auf dem Diff des aktuellen Branch gegenüber dem Basis-Branch
und committet lokal, ohne zu pushen oder zu kommentieren.

**Zusammenspiel:** Ergänzt die Apply-Kette um die bislang fehlende Quelle
„PR-Review-Kommentare“: `/effective-flow apply` liest Effective Flow-eigene Reports bzw. Issues, `iterate` liest
die direkt am PR hinterlassenen Threads. Die eigentliche Umsetzung übernehmen die bestehenden
Umsetzungs-Tools; bestehende PRs werden ausschließlich über neue Commits aktualisiert. GitHub
(`gh`) und Forgejo (`tea`) werden unterstützt – das Auflösen von Threads nutzt auf GitHub die
GraphQL-Mutation, auf Forgejo best-effort (sonst nur Antwort, Vermerk im Summary).

## Weiterführend

- [Worktree und Delivery](worktree-und-delivery.md) – Liefer-Branch, Worktree,
  PR/Merge/Branch-Abschluss
- [Konfiguration](konfiguration.md) – `delivery.*`, `worktree.*`, `plan.*`
- [Skill-Discovery](skill-discovery.md) – wie diese Tools Host-Skills nutzen
- [Tools: Qualität sichern](tools-qualitaet.md) – wie Review-Reports entstehen, die hier
  eingearbeitet werden
