# Cleanup um sichere Worktree-Bereinigung erweitern

**Planungsstatus:** Umgesetzt
**Quelle:** `$effective-flow plan`
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

`$effective-flow cleanup` soll neben Migrationsaltlasten auch die mit dem aktuellen Repository
verbundenen Git-Worktrees prüfen. Eindeutig von Effective Flow erzeugte, saubere und durch einen
abgeschlossenen Lifecycle zur Bereinigung freigegebene Worktrees sollen nach Dry-Run und
ausdrücklicher Bestätigung mit dem normalen `git worktree remove` entfernt werden können. Am Ende
jedes Cleanup-Laufs soll das Tool alle verbleibenden verknüpften Worktrees – ohne den unvermeidbaren
Haupt-Worktree – mit einem konkreten Grund ausgeben, etwa „aktiver Lauf“, „kontrolliert
abgebrochener Lauf“, „nach möglicher Unterbrechung weiterhin als aktiv registriert“, „dirty“,
„fremd- oder harnessverwaltet“, „gesperrt“ oder „Eigentum/Laufstatus nicht nachweisbar“.

Die Änderung ist ein Feature, weil sie den öffentlichen Funktionsumfang und die Ausgabe des
Cleanup-Tools erweitert. Sie bleibt bewusst konservativ: Ein Alter, ein Pfadmuster, ein
Branch-Präfix oder ein leer wirkender Worktree genügt nicht als Löschfreigabe. Es gibt weder eine
Zeitüberschreitung zur automatischen Absturzerkennung noch `--force` oder eine pauschale
`git worktree prune`-Operation.

Verifizierter Planungskontext vom 22.07.2026:

- Die lokal bekannte Delivery-Basis ist `origin/develop` bei `56e7b88`; der aktuelle Checkout
  steht bei `1cdd053` und liegt 36 Commits dahinter. Die Planung stützt sich deshalb auf die
  betroffenen Dateien aus `origin/develop`, nicht auf deren veraltete Checkout-Fassungen.
- `src/tools/cleanup.md` kennt dort ausschließlich vier Klassen von Migrationsaltlasten und beendet
  den Lauf als No-Op, wenn keine davon gefunden wird.
- `src/shared/execution-location.md` erlaubt die Entfernung nur für exakt nachgewiesene
  `effective-flow-created`-Worktrees mit passendem Receipt, Registrierung und sauberem Zustand;
  harnessverwaltete, fremde, dirty oder nicht mehr passende Worktrees müssen erhalten bleiben.
- Delivery-Worktrees entstehen in `src/shared/worktree-integration.md`, komponentenweise
  `apply-review`-Worktrees in `src/tools/apply-review-commit-mechanics.md`. Receipts und
  Ownership-Flags werden während des Laufs mitgeführt, aber noch nicht als eigenständiger,
  crash-toleranter Lifecycle-Nachweis für einen späteren Cleanup-Lauf persistiert.
- Die offizielle Git-Semantik bestätigt: `git worktree list --porcelain` liefert unter anderem
  `locked`- und `prunable`-Attribute; `git worktree remove` entfernt standardmäßig nur saubere
  Worktrees, der Haupt-Worktree ist nicht entfernbar. `prune` arbeitet dagegen breit auf fehlenden
  Working Trees. Der Plan baut deshalb auf maschinenlesbarer Inventarisierung und gezieltem,
  ungeforctem Entfernen auf.
- Im aktuellen Haupt-Checkout bestehen bereits unabhängige, uncommittete Setup-/Planänderungen.
  Keine davon gehört zum Scope dieser Umsetzung und keine darf überschrieben, bereinigt oder
  ungefragt übernommen werden.

## Architekturentscheidungen

- **Ein zentraler Lifecycle-Vertrag statt verteilter Heuristiken.** Ein neues Shared-Fragment
  definiert Erzeugung, persistierten Nachweis, Statusübergänge, Wiederaufnahme und spätere
  Bereinigung für Delivery- und `apply-review`-Worktrees. Cleanup, Delivery und Apply Review
  verwenden denselben Vertrag; die bestehenden Receipt- und Runtime-Safety-Regeln werden nicht
  dupliziert.
- **Persistenz ausschließlich im verifizierten Runtime-Root.** Jeder neu von Effective Flow
  erzeugte Worktree erhält unmittelbar nach erfolgreicher Receipt-Erstellung einen atomar und
  fail-closed geschriebenen Datensatz unter
  `<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/`. Der Datensatz enthält mindestens
  Schema-Version, Session/Komponente, Workflow und Zweck, kanonische Repository- und
  Worktree-Identität, Branch und Erzeugungs-OID, Ownership, Zeitpunkte, Lifecycle-Status sowie die
  gewünschte Branch-Nachbehandlung. Pfade und Maschinenwerte bleiben sprachstabil.
- **Explizite Zustandsmaschine.** `active` gilt ab Erzeugung. Erst wenn die fachliche Arbeit und
  ihre Sicherung auf dem Branch beziehungsweise die Komponenten-Integration erfolgreich
  abgeschlossen sind, wird `cleanup-ready` gesetzt. Kontrollierte Abbrüche und Fehler werden als
  `aborted` beziehungsweise `failed` festgehalten; ein fehlgeschlagener normaler Remove-Versuch
  wird als `cleanup-failed` mit Grund festgehalten. Vor einer Entfernung übernimmt genau ein
  berechtigter Akteur den Datensatz als `cleanup-in-progress`; nur dieser Akteur darf den Remove-
  Versuch abschließen. Nach vollständig erfolgreicher Worktree- und gegebenenfalls sicherer
  Branch-Bereinigung wird nur der eigene Lifecycle-Datensatz entfernt. Ein Computerabsturz
  hinterlässt typischerweise `active` oder `cleanup-in-progress`; Cleanup benennt diesen Zustand
  ehrlich als aktiv registriert beziehungsweise möglicherweise unerwartet unterbrochen und löscht
  ihn nicht.
- **Serialisierte Übernahme statt Read/Write-Rennen.** Alle Lifecycle-Schreiber – der erzeugende
  Workflow und spätere Cleanup-Läufe – verwenden denselben per Datensatz atomar angelegten Lock
  unter dem verifizierten Runtime-Root. Unter dem Lock werden Datensatz, Git-Registrierung und
  Receipt frisch gelesen und `cleanup-ready` beziehungsweise `cleanup-failed` mit Run-ID und
  Zeitstempel nach `cleanup-in-progress` überführt. Erst danach führt der Besitzer den normalen
  Remove-Versuch aus. Ein fremder oder verwaister Lock sowie ein fremdes `cleanup-in-progress`
  blockieren fail-closed und werden mit Besitzer und Zeitpunkt gemeldet; sie werden nicht durch
  Cleanup gebrochen.
- **Löschfreigabe als Schnittmenge unabhängiger Nachweise.** Ein Worktree ist nur Kandidat, wenn
  der Datensatz ihn als `effective-flow-created` und `cleanup-ready` oder `cleanup-failed`
  ausweist, ein frischer Receipt-Abgleich Repository, kanonischen Pfad, Branch, Zweck und
  Registrierung bestätigt, keine `locked`-/`prunable`-Situation vorliegt, der Checkout sauber ist
  und der aktuelle Cleanup-Lauf weder Haupt- noch eigenen Execution-Worktree als Löschziel trifft.
  Jeder fehlende Nachweis führt zu „behalten“ mit Grund. Der aktuelle verknüpfte
  Execution-Worktree bleibt dennoch Teil des Abschlussberichts und wird dort als durch den
  Cleanup-Lauf selbst belegt ausgewiesen.
- **Gezielte Git-Operationen.** Die Inventarisierung parst
  `git worktree list --porcelain -z` datensatzweise. Die tatsächliche Entfernung erfolgt erst nach
  Dry-Run und Bestätigung über `git worktree remove <path>` ohne `--force`. Ein temporärer
  `apply-review`-Branch darf anschließend nur gemäß Datensatz und mit `git branch -d` entfernt
  werden; Delivery-Branches bleiben bestehen. Cleanup führt weder `git worktree prune` noch
  `git branch -D` aus.
- **Bestandskompatibilität ohne rückwirkende Eigentumsbehauptung.** Bereits vorhandene Worktrees
  ohne Lifecycle-Datensatz werden inventarisiert, aber nicht automatisch löschbar. Sie bleiben mit
  dem Grund „kein belastbarer Effective-Flow-Lifecycle-Nachweis“ bestehen und können außerhalb
  dieses automatischen Pfads manuell geklärt werden.
- **Abschlussbericht ist obligatorisch.** Auch wenn keine Migrationsaltlast gefunden wird, läuft
  die Worktree-Inventarisierung. Der Abschluss trennt entfernte Worktrees, fehlgeschlagene
  Löschversuche und alle verbleibenden verknüpften Worktrees. Für jeden Rest nennt er relativen
  beziehungsweise bei externem Basispfad kanonischen Pfad, Checkout-Identität, erkannten Status,
  konkreten Behaltegrund und einen sicheren nächsten Schritt. Sind keine verknüpften Worktrees
  übrig, wird das ausdrücklich gemeldet.
- **Keine neue Konfiguration oder Abhängigkeit.** Es gibt keinen TTL-, Heartbeat- oder
  Stale-After-Schlüssel und keine zusätzliche Bibliothek. Die Entscheidung bleibt deterministisch
  aus Git-Zustand, Receipt und persistiertem Lifecycle ableitbar.

## Betroffene Dateien

| Datei                                         | Beschreibung                                                                                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/worktree-lifecycle.md`            | Neuen gemeinsamen Vertrag für Lifecycle-Datensatz, Statusübergänge, Löschfreigabe, Retention-Gründe und sichere Nachbehandlung definieren.                                                                           |
| `src/shared/worktree-integration.md`          | Delivery- und Partial-Diff-Worktrees unmittelbar registrieren, Zustände an den bestehenden Übergabepunkten aktualisieren und den Datensatz erst nach erfolgreicher Bereinigung entfernen.                            |
| `src/tools/apply-review-commit-mechanics.md`  | Komponenten-Worktrees mit demselben Lifecycle erfassen; erfolgreiche Integration als bereinigungsbereit und Fehler/Abbrüche als nicht löschbar markieren.                                                            |
| `src/tools/cleanup.md`                        | Öffentlichen Scope, Inventarisierung, Dry-Run, Bestätigung, gezielte Worktree-Entfernung und obligatorischen Restbericht ergänzen; bisherigen Migrations-Cleanup unverändert sicher weiterführen.                    |
| `test/worktree-lifecycle-contract.test.mjs`   | Fokussierte Quell- und Render-Vertragstests für Statusmodell, Lock-/Claim-Vertrag, Consumer-Einbindung, No-Force-Regeln, Kandidatenmatrix und Abschlussausgabe ergänzen.                                             |
| `test/execution-location-git.test.mjs`        | Git-Fixtures für saubere bereinigungsbereite, aktive, abgebrochene, konkurrierend beanspruchte, dirty, gesperrte, prunable, fremde, receipt-widersprüchliche und datensatzlose Worktrees sowie Idempotenz erweitern. |
| `test/runtime-state-safety-contract.test.mjs` | Absichern, dass Lifecycle-Datensätze nur unter dem verifizierten `RUNTIME_STATE_ROOT` und unmittelbar durch den bestehenden Runtime-Safety-Guard geschrieben, aktualisiert oder entfernt werden.                     |
| `docs/user-guide/tools-setup.md`              | Cleanup-Zweck, Bestätigung, Löschgrenzen und den neuen Restbericht beschreiben.                                                                                                                                      |
| `docs/user-guide/worktree-and-delivery.md`    | Persistierten Lifecycle, Statusübergänge und das Zusammenspiel mit späterem Cleanup erklären.                                                                                                                        |
| `docs/user-guide/troubleshooting.md`          | Behaltegründe und sichere manuelle nächste Schritte für aktive, abgebrochene, dirty, gesperrte und unklare Worktrees dokumentieren.                                                                                  |
| `docs/developer-guide/architecture.md`        | Den gemeinsamen Lifecycle-Vertrag und seine Beziehung zu Execution-Location-Receipts und beiden Worktree-Erzeugungspfaden festhalten.                                                                                |
| `docs/developer-guide/configuration.md`       | `worktree-runs/` als gitignorierten Runtime-State und dessen fail-closed Schreib-/Löschgrenze dokumentieren; ausdrücklich keinen neuen Config-Key einführen.                                                         |

`dist/` bleibt generierter und gitignorierter Build-Output und wird nicht direkt bearbeitet.
`src/shared/execution-location.md` und `src/shared/runtime-state-safety.md` bleiben die kanonischen
Sicherheitsverträge; die neue Lifecycle-Datei konsumiert sie, statt eine zweite Fassung anzulegen.

## Implementierungsdetails

### Vorgehen

1. In `src/shared/worktree-lifecycle.md` den stabilen Datensatz, zulässige Statusübergänge und die
   fail-closed Kandidatenmatrix festlegen. Für jede Mutation ist der konkrete absolute Handle unter
   dem verifizierten Runtime-Root erneut zu prüfen. Ein per Datensatz atomar erworbener Lock
   serialisiert Lifecycle-Übergänge; konkurrierende oder nach Resume veraltete Zustände werden
   darunter frisch gelesen und nicht blind überschrieben. Zulässig sind nur `active` nach
   `cleanup-ready`/`aborted`/`failed`, `cleanup-ready` oder `cleanup-failed` nach
   `cleanup-in-progress` sowie `cleanup-in-progress` nach `cleanup-failed` oder die vollständige
   Entfernung des eigenen Datensatzes.
2. In `src/shared/worktree-integration.md` nach `git worktree add` und erfolgreichem Receipt den
   Lifecycle-Datensatz anlegen. Vor normaler Entfernung erst nach erfolgreicher Sicherung der
   beabsichtigten Änderungen auf `cleanup-ready` wechseln; bei Abbruch, Fehler oder
   Remove-Verweigerung den passenden Retention-Status samt Grund erhalten. Der bereits vorhandene
   Ownership- und Creation-OID-Vertrag bleibt die maßgebliche Untergrenze.
3. In `src/tools/apply-review-commit-mechanics.md` denselben Ablauf pro Komponente verwenden. Erst
   erfolgreiche Cherry-Pick-Integration und Validierung geben eine Komponente zur Bereinigung
   frei; ein fehlgeschlagener oder nicht eindeutig integrierter Bestandteil bleibt `failed` oder
   `aborted` und wird nicht vom späteren Cleanup entfernt.
4. `src/tools/cleanup.md` von einem reinen Migrationsabschluss zu einem kombinierten
   Migrations-/Worktree-Cleanup erweitern. Nach verifizierter Runtime-Root-Auflösung alle
   Porcelain-Datensätze erfassen, den Haupt-Worktree separat ausschließen, Lifecycle-Datensätze
   zuordnen und jeden verknüpften Worktree genau einer Ergebnisgruppe zuweisen:
   bereinigungsbereit, ausdrücklich behalten oder nicht verlässlich prüfbar.
5. Die bereinigungsbereiten Worktrees als eigene Artefaktklasse in Dry-Run und Bestätigung
   aufnehmen. Direkt vor jeder Entfernung den Lifecycle-Lock erwerben, Git-Registrierung, Receipt,
   Lifecycle-Status, Branch und Sauberkeit erneut prüfen und den Kandidaten mit der Cleanup-Run-ID
   als `cleanup-in-progress` beanspruchen. Bei Drift, fremder Beanspruchung oder Befehlsfehler nur
   diesen Kandidaten zurückstufen, den Teilzustand festhalten und die übrige sichere
   Bestandsaufnahme fortsetzen.
6. Den Abschlussbericht unabhängig von gefundenen Migrationsaltlasten erzeugen. Verbleibende
   Worktrees werden vollständig und ohne Sammelbegründung aufgelistet; `active` erklärt sowohl den
   registrierten Aktivstatus als auch die Möglichkeit eines unerwartet abgebrochenen Laufs.
7. Die Vertrags- und Git-Fixture-Tests ergänzen und die Nutzer- sowie Entwicklerdokumentation auf
   denselben Statuswortschatz und dieselben Sicherheitsgrenzen bringen.

### Zustandsverwaltung

- Lifecycle-Datensätze sind flüchtiger, gitignorierter Runtime-State und keine Projektkonfiguration.
- Jeder Datensatz gehört genau einem Effective-Flow-erzeugten Worktree. Delivery- und
  `apply-review`-Komponenten verwenden getrennte Datensätze, auch wenn sie denselben `baseDir`
  nutzen.
- Statusupdates erfolgen atomar mit frischem Read/Validate/Write unter Runtime-Safety; fremde oder
  schema-unbekannte Datensätze werden nicht repariert oder gelöscht, sondern als unklar gemeldet.
- Ein per Datensatz geschützter Claim stellt sicher, dass der erzeugende Workflow und ein späterer
  Cleanup-Lauf nie gleichzeitig denselben Worktree entfernen oder denselben Lifecycle-Datensatz
  abschließen. `cleanup-in-progress` enthält Cleanup-Run-ID und Zeitpunkt; ein fremder Claim wird
  nicht übernommen oder zeitbasiert gebrochen.
- Der Datensatz bleibt bestehen, solange der Worktree besteht oder seine Entfernung nur teilweise
  gelungen ist. Nach vollständig erfolgreicher, erneut verifizierter Bereinigung wird nur der
  eigene Datensatz entfernt.

### Randfälle

- Der Haupt-Worktree und der Worktree, aus dem Cleanup selbst läuft, sind niemals Löschziele. Ein
  verknüpfter aktueller Execution-Worktree erscheint trotzdem im Restbericht mit dem Grund
  „Cleanup läuft in diesem Worktree“.
- `harness-managed`, userverwaltete und wiederverwendete Worktrees erhalten keinen
  Effective-Flow-Owned-Lifecycle und bleiben außerhalb der Löschkandidaten.
- `active`, `aborted` und `failed` werden unabhängig von Alter oder letzter Änderung behalten; ein
  alter `active`-Datensatz wird als möglicherweise unerwartet unterbrochen ausgewiesen, nicht
  automatisch umklassifiziert.
- Ein dirty Worktree, unerwartete ungetrackte Dateien, Submodule, ein `locked`-Attribut, ein
  `prunable`-Datensatz, ein fehlender Pfad, ein abweichender Branch/OID oder ein Receipt-/Common-Dir-
  Widerspruch blockiert die Entfernung.
- Ein Worktree ohne Lifecycle-Datensatz bleibt erhalten, selbst wenn Pfad und Branch nach Effective
  Flow aussehen und `git status` leer ist.
- Scheitert `git worktree remove` ohne Force, bleibt der Datensatz mit exakter Fehlermeldung und
  `cleanup-failed` bestehen; andere Kandidaten dürfen nur weiterbearbeitet werden, wenn ihre
  Nachweise unabhängig gültig bleiben.
- Ist der Worktree bereits erfolgreich entfernt, bevor Datensatz- oder Branch-Nachbehandlung
  abgeschlossen ist, wird kein Worktree künstlich rekonstruiert. Cleanup gleicht Git-Registrierung,
  Pfad, Branch-Policy und Claim ab, beendet nur nach vollständigem Nachweis den eigenen Datensatz
  oder meldet die partielle Bereinigung mit verbliebenem Datensatz beziehungsweise Branch.
- Ein erfolgreich entfernter `apply-review`-Worktree mit nicht sicher löschbarem temporären Branch
  wird als partielle Bereinigung gemeldet; der Branch bleibt bestehen.
- Nicht erreichbare externe `baseDir`-Pfade und unbekannte Datensatzversionen werden als nicht
  prüfbar gemeldet, niemals übersprungen oder als sauber angenommen.
- Ein Lauf ohne Migrationsaltlasten, aber mit Worktrees ist kein No-Op. Ein echter No-Op liegt erst
  vor, wenn weder Migrationsmaßnahmen noch bereinigungsbereite Worktrees existieren; der
  Worktree-Restbericht wird dennoch ausgegeben.

## Akzeptanzkriterien

- [x] Neu erzeugte Delivery-, Partial-Diff- und `apply-review`-Komponenten-Worktrees besitzen einen
      fail-closed verwalteten Lifecycle-Datensatz im verifizierten Runtime-Root; Erfolg, kontrollierter
      Abbruch, Fehler und unvollständige Bereinigung führen zu den festgelegten Statuswerten.
- [x] Cleanup inventarisiert alle von `git worktree list --porcelain -z` gemeldeten verknüpften
      Worktrees des aktuellen Repositorys, schließt den Haupt-Worktree aus und ordnet jeden übrigen
      Datensatz deterministisch einer Lösch- oder Retention-Kategorie zu; der aktuelle
      Execution-Worktree wird behalten und im Restbericht ausgewiesen.
- [x] Nur `effective-flow-created`, receipt-konsistente, `cleanup-ready`/`cleanup-failed`, saubere,
      ungesperrte und registrierte Worktrees werden nach Dry-Run und ausdrücklicher Bestätigung mit
      einem exklusiven `cleanup-in-progress`-Claim und `git worktree remove <path>` ohne Force
      entfernt; kein Pfad verwendet `--force`, pauschales `prune` oder `git branch -D`.
- [x] Aktive, abgebrochene, fehlgeschlagene, dirty, gesperrte, prunable, fremd-/harnessverwaltete,
      mismatched und datensatzlose Worktrees bleiben erhalten, ohne dass ihr Branch oder Inhalt
      verändert wird.
- [x] Der Abschluss nennt jeden verbleibenden verknüpften Worktree mit Checkout-Identität,
      Lifecycle-/Prüfstatus, einem individuellen Behaltegrund und einem sicheren nächsten Schritt;
      bei keinem Rest wird dies ausdrücklich gemeldet.
- [x] Bestehender Migrations-Cleanup, Setup-Ownership für `.gitignore`, Runtime-State-Safety und
      der Ausschluss von `dist/` bleiben durch die vorhandenen und neuen Vertragstests erhalten.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` laufen auf der Umsetzungsbasis erfolgreich
      durch und beweisen gemeinsam genau den beschriebenen sicheren Cleanup- und Retention-Vertrag.

## Validierungsplan

- `node --test test/worktree-lifecycle-contract.test.mjs test/execution-location-git.test.mjs test/runtime-state-safety-contract.test.mjs` – fokussierte Status-, Git- und Runtime-Safety-Matrix.
- `pnpm agent:check` – Format- und Quellenprüfung ohne Schreibzugriff.
- `pnpm test` – vollständige Unit-, Contract- und Git-Fixture-Suite.
- `node build.mjs` – alle drei Zielausgaben sowie Include-, Referenz-, Frontmatter- und
  Build-Guards erfolgreich erzeugen.
- `pnpm test:distribution` – isolierte Offline-Prüfung des erzeugten Distributionslayouts.
- `git diff --check` und abschließende Scope-Prüfung – keine Whitespace-Fehler, keine direkte
  `dist/`-Änderung und keine Übernahme der bereits vorhandenen fremden Working-Tree-Änderungen.

## Testergebnisse

- Die fokussierte Lifecycle-, Git- und Runtime-Safety-Matrix bestand mit 36 von 36 Tests.
- `pnpm agent:check` bestätigte die korrekte Formatierung aller 235 geprüften Dateien.
- `pnpm test` bestand mit 331 von 331 Tests.
- `node build.mjs` erzeugte die nativen Claude- und Codex-Ziele sowie das portable Ziel
  einschließlich aller Build-Guards erfolgreich.
- `pnpm test:distribution` bestand mit den isolierten Offline-Distributionsprüfungen.
- `git diff --check` und die abschließende Scope-Prüfung bestanden. Verändert wurden genau die
  13 geplanten Source-, Test-, Dokumentations- und Plan-Dateien; `dist/` und die unabhängigen
  Änderungen im Haupt-Checkout blieben unberührt.

## Review-Befunde

**Datum:** 22.07.2026
**Reviewer:** `effective-flow-code-validator` (technische Review)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      3 |
| Offen / Nicht umgesetzt |      0 |

| Komplexität | Anzahl |
| ----------- | -----: |
| Niedrig     |      1 |
| Mittel      |      2 |
| Hoch        |      0 |

Die Review präzisierte den unveränderlichen Creation-OID-Ahnennachweis, glich die Git-Fixtures an
das vollständige Lifecycle-v1-Schema an und ergänzte echte dateibasierte Lock-, Claim-, Drift-,
Submodule-, Fehler- und Teilbereinigungsfälle. Alle drei wichtigen Befunde wurden umgesetzt und
in der abschließenden Re-Review als behoben bestätigt. Es bestehen keine offenen Befunde und kein
externer Review-Bericht.

## Annahmen und offene Punkte

- Die Umsetzung beginnt auf einem aktuellen Stand von `origin/develop` und prüft vor dem ersten
  Edit, ob sich die genannten Verträge seit `56e7b88` geändert haben. Bei inkompatiblem Drift wird
  der Plan vor der Umsetzung aktualisiert.
- Die vom User bestätigte konservative Policy gilt verbindlich: Es gibt keine zeitbasierte
  automatische Freigabe und keinen Versuch, einen Computerabsturz als sicher beendeten Lauf zu
  erraten.
- Vor Einführung des Lifecycle-Datensatzes erzeugte Worktrees bleiben automatisch unlöschbar und
  werden nur diagnostiziert. Eine separate Legacy-Adoption oder manuelle Force-Cleanup-Funktion
  ist nicht Teil dieses Plans.
- Branch-Löschung bleibt eine nachgelagerte, typabhängige Operation: Delivery-Branches werden
  erhalten; temporäre `apply-review`-Branches dürfen nur mit nachgewiesener Integration und
  `git branch -d` entfernt werden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       0 |
| Sicherheit  |        0 |       1 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Wichtig – Architektur/Sicherheit (eingearbeitet):** Atomare Datensatzschreibvorgänge allein
  verhinderten nicht, dass der erzeugende Workflow und ein parallel gestarteter Cleanup-Lauf
  denselben `cleanup-ready`-Worktree gleichzeitig entfernen oder anschließend einen bereits
  gelöschten Datensatz neu erzeugen. Der Plan serialisiert jetzt alle Lifecycle-Übergänge per
  Datensatz-Lock und exklusivem `cleanup-in-progress`-Claim; fremde oder verwaiste Claims werden
  nicht gebrochen.
- **Wichtig – Scope (eingearbeitet):** Der aktuelle Execution-Worktree war vollständig aus der
  Inventarisierung ausgeschlossen, obwohl die Anforderung jeden verbleibenden verknüpften
  Worktree mit Grund verlangt. Er ist jetzt nur als Löschziel ausgeschlossen und erscheint im
  Abschlussbericht als vom Cleanup-Lauf selbst belegt.
- **Hinweis – Fehlerfälle (eingearbeitet):** Für einen Absturz zwischen erfolgreichem
  Worktree-Remove und Datensatz-/Branch-Nachbehandlung fehlte ein expliziter Reconciliation-Pfad.
  Der Plan verlangt nun den erneuten Abgleich von Registrierung, Pfad, Branch-Policy und Claim und
  meldet nicht vollständig beweisbare Fälle als partielle Bereinigung.

## Offene Punkte

- Keine offenen Punkte.
