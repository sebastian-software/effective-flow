# 0071: Setup-Tool als geführter Wizard

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Das Firmo-Setup-Tool (`src/tools/setup.md`, ausgeliefert als `/firmo setup`) soll deutlich
stärker wie ein **geführter Wizard** laufen und dabei vollständig an die seit Plan 0070
geänderte Struktur angepasst werden. Leitbild: Ein Nutzer, der **noch keine Ahnung von der
Arbeitsweise von Firmo** hat, soll die Konfiguration verstehen und sicher vornehmen können.

Konkrete Vorgaben (aus der Klärung):

- **Immer von „sensible defaults" starten.** Es gibt genau einen gut erklärten
  Sicher-Defaults-Startpunkt; das bisherige zweite Preset „Schneller persönlicher Workflow"
  entfällt als Preset (seine Werte bleiben über die Einzeloptionen erreichbar).
- **Express + Geführt.** Am Anfang wählt der Nutzer: **Express** („sensible defaults
  übernehmen und fertig", ein Bestätigungsschritt) oder **Geführt** („Schritt für Schritt
  durchgehen", jede Option erklärt).
- **Alle Optionen ausführlich erklären, für Neulinge.** Vor jeder Auswahl steht eine
  Klartext-Erklärung: was die Option bewirkt, warum sie relevant ist und was die Wahl
  praktisch bedeutet – ohne Firmo-Vorwissen vorauszusetzen.
- **Kern zuerst, Rest optional.** Der geführte Flow behandelt zuerst die Kern-Schalter
  (Worktree, Abschluss-Aktion, Marker-Sprache, Tracker) ausführlich; danach ein optionales
  Gate „Erweiterte Einstellungen anpassen?" für die Feinheiten (review, applyReview,
  Pfade, Branch-Präfix etc.).
- **Aktuelle Config-Werte anzeigen.** Existiert bereits eine `.firmo/config.json`, wird bei
  jeder Auswahl der aktuell festgeschriebene Wert sichtbar gemacht und vorausgewählt.

Diese Überarbeitung betrifft ausschließlich die **Interaktion und Erklärung** des Setups.
Das Config-**Schema** (die Schlüssel und ihre gültigen Werte) bleibt wie nach 0070; es
werden keine neuen Config-Schlüssel eingeführt.

Begründung der Workflow-Empfehlung: Es entsteht bewusst neues, verändertes Nutzerverhalten
(Wizard-Flow, Express/Geführt, didaktische Erklärungen, Anzeige aktueller Werte, Wegfall
eines Presets) – damit ist es ein Feature (`/firmo build`), nicht reines Refactoring. Das
korrigiert die vorläufige Refactoring-Einordnung des Platzhalter-Plans.

## Architekturentscheidungen

- **Ein Sicher-Defaults-Startpunkt statt zweier Presets.** Der bisherige Preset-Auswahlschritt
  (Schritt 3 mit „Sichere Defaults" / „Schneller persönlicher Workflow" / „Alles einzeln
  anpassen") wird durch die Express/Geführt-Startfrage ersetzt. Die Werte des bisherigen
  „Sichere Defaults"-Presets werden zur einzigen, benannten Default-Basis. Das Preset
  „Schneller persönlicher Workflow" entfällt; seine bisherigen Werte (z. B. `review.profile:
fast`, `applyReview.finalValidation: changedScope`) bleiben ausschließlich über die
  Einzeloptionen im erweiterten Teil erreichbar und werden dort erklärt.
- **Zwei Startpfade.** _Express_: die Sicher-Defaults (bzw. bei vorhandener Config deren
  aktuelle Werte) werden übernommen; bei Abweichungen gegenüber dem Bestand wird die
  Vorher/Nachher-Liste gezeigt und bestätigt, dann geschrieben. _Geführt_: Kern-Schalter
  einzeln, danach optionales Erweitert-Gate.
- **Didaktisches Frageformat (Neuling-Prinzip).** Jede Auswahl bekommt einen kurzen
  Erklärabsatz **vor** der Frage: (1) Was ist das? (2) Warum ist es relevant? (3) Was
  bedeutet die Wahl praktisch? Der sichere Default wird als solcher gekennzeichnet und
  vorausgewählt. Fachbegriffe (Worktree, Liefer-Branch, Tracker, Review-Profil) werden bei
  erster Nennung in einem Satz erklärt.
- **Aktuelle Werte sichtbar machen.** Existiert `.firmo/config.json` mit gültigem JSON, wird
  je Option der aktuell festgeschriebene Wert angezeigt („aktuell in der Config: …") und als
  Vorauswahl genutzt; fehlt der Schlüssel, gilt der sichere Default als Vorauswahl. Diese
  Anzeige gilt in Express- **und** Geführt-Pfad.
- **Kern-/Erweitert-Trennung.** Kern-Schalter: `worktree.enabled`, `delivery.completion`
  (+ `delivery.baseBranch`, `delivery.returnBranch`), `plan.markerLanguage`, `tracker.mode`
  (+ ggf. `tracker.remoteToolOverride`). Erweitert (hinter einem optionalen Ja/Nein-Gate):
  `review.*`, `applyReview.*`, `plan.dir`, `delivery.branchPrefix`, `worktree.setup`,
  `worktree.baseDir`. Ohne Erweitert-Zustimmung behalten diese Schlüssel den sicheren
  Default bzw. den bestehenden Config-Wert.
- **Unveränderte Bausteine.** Der `.gitignore`-Schritt, die nicht-destruktive Merge-/Schreib-
  Logik, die Behandlung ungültigen JSONs, der `config-migration`-Include und der
  aufgeschobene Migrations-Upgrade-Dialog (`delivery.completion: null → merge`) bleiben
  erhalten und werden nur in den neuen Wizard-Ablauf eingeordnet.
- **Keine Schema-Erweiterung.** Es werden keine neuen Config-Schlüssel eingeführt; die
  Schema-Zusammenfassung wird nur an den Wegfall des zweiten Presets angepasst.
- **Konkrete Sicher-Defaults-Basis (für Express und als Vorauswahl).** Die eine benannte
  Default-Basis umfasst über die bisherigen `review.*`/`applyReview.*`-Sicher-Defaults hinaus
  auch die Kern-Schalter mit konkreten Werten: `worktree.enabled: true`,
  `delivery.completion: merge`, `delivery.baseBranch: origin/main`, `tracker.mode: local`,
  `plan.dir: docs/plan`. Für `plan.markerLanguage` gilt kein fixer Wert, sondern eine
  **Ableitung**: aus vorhandenen Plänen erkennen (bestehende Marker-Sprache-Detection aus
  `{{SKILL:plan}}`); liefert das kein eindeutiges Signal, **Fallback Englisch** (Entscheidung
  „Erkennen, sonst Englisch"). Diese Ableitung gilt sowohl als Express-Wert als auch als
  Vorauswahl im Geführt-Pfad.
- **Aufgeschobener Upgrade-Dialog in beiden Pfaden.** Der Migrations-Upgrade-Dialog
  (`delivery.completion: null → merge`) ist eine Migrations-Notwendigkeit, kein Wahlpunkt des
  Wizards. Er erscheint daher – wenn eine Alt-Config konsolidiert wird und der Fall ansteht –
  in **beiden** Startpfaden (Express wie Geführt), unmittelbar vor dem Schreiben.

## Betroffene Dateien

| Datei                          | Geplante Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/setup.md`           | Zentrale Überarbeitung: Frontmatter-`description` (Wizard statt „Presets und Detailmodus"); Ziel-Abschnitt; Config-Schema-Abschnitt (zweites Preset entfernen, Sicher-Defaults als benannte Basis behalten); Workflow-Schritte neu strukturieren (Express/Geführt-Start, Kern-Schalter mit Erklärungen, optionales Erweitert-Gate, Anzeige aktueller Werte); `.gitignore`-Schritt, Merge/Schreiben und Upgrade-Dialog erhalten und einordnen; Zusammenfassung anpassen. |
| `docs/user-guide/…` (optional) | Nur falls gewünscht: ein kurzer „Erste Schritte / Setup"-User-Guide für Neulinge. Nicht Teil des Kern-Scopes; siehe Annahmen.                                                                                                                                                                                                                                                                                                                                           |

Kein `build.mjs`-Guard betroffen (Erwartung); Ask-Header bleiben ≤ 12 Zeichen (Build-Guard).

## Implementierungsdetails

### Vorgehen

1. **Frontmatter & Ziel.** `description` und den Ziel-Abschnitt auf das Wizard-Leitbild und
   die Neuling-Zielgruppe umschreiben (Express + Geführt, sensible Defaults, aktuelle Werte
   anzeigen).
2. **Config-Schema-Abschnitt.** Das Preset „Schneller persönlicher Workflow" entfernen; die
   „Sichere Defaults"-Tabelle als einzige benannte Default-Basis behalten und erläutern,
   dass ihre Werte den Startpunkt bilden. Den Satz zu „zwei Presets" streichen.
3. **Schritt: Bestehende Config lesen.** Wie bisher lesen; zusätzlich einen internen
   „Aktuelle-Werte"-Überblick bilden (Schlüssel → aktueller Wert), der später in jeder Frage
   angezeigt wird. Ungültiges JSON: bestehende Behandlung.
4. **Schritt: Express/Geführt-Start.** Neue Startfrage. Bei **Express** die Ziel-Config aus
   Sicher-Defaults plus vorhandenen gültigen Werten bilden, die Vorher/Nachher-Liste zeigen
   (falls Abweichungen), bestätigen und zu Merge/Schreiben springen. Bei **Geführt** mit den
   Kern-Schaltern fortfahren.
5. **Schritt: Kern-Schalter (geführt).** `worktree.enabled`, `delivery.completion`
   (+ `baseBranch`/`returnBranch`), `plan.markerLanguage`, `tracker.mode` (+ ggf.
   `remoteToolOverride`) – jeweils mit Neuling-Erklärung und Anzeige des aktuellen Werts.
6. **Schritt: Erweitert-Gate.** Ja/Nein-Frage „Erweiterte Einstellungen anpassen?". Bei „Ja"
   `review.*`, `applyReview.*`, `plan.dir`, `delivery.branchPrefix`, `worktree.setup`,
   `worktree.baseDir` einzeln mit Erklärung und aktuellem Wert; bei „Nein" sichere
   Defaults/Bestandswerte behalten.
7. **Schritt: Merge, Schreiben, Upgrade-Dialog, Zusammenfassung.** Bestehende
   nicht-destruktive Merge-/Schreib-Logik, der aufgeschobene Migrations-Upgrade-Dialog und
   die Zusammenfassung – an den neuen Ablauf angepasst (Preset-Nennung raus, Express/Geführt
   und ggf. Erweitert erwähnen).

### Neuling-Erklärungen je Kern-Schalter (Inhalt, nicht Wortlaut)

Der Plan legt fest, _was_ erklärt wird; die finale Formulierung entsteht bei der Umsetzung.

- **Worktree (`worktree.enabled`):** Firmo setzt Änderungen standardmäßig in einem
  separaten Arbeitsbereich mit eigenem Branch um, damit dein aktueller Stand unberührt
  bleibt; „Nein" arbeitet direkt im aktuellen Checkout. Default: Ja.
- **Abschluss-Aktion (`delivery.completion`):** Wie fertige Änderungen eingebracht werden –
  `merge` (direkt in den Zielbranch), `pr` (Pull-Request zum Review) oder `branch` (nur
  liegen lassen); `null` fragt bei jedem Lauf. Default: `merge`. Dazu Basis-Branch
  (`baseBranch`) in einfachen Worten (der Zweig, in den geliefert wird).
- **Marker-Sprache (`plan.markerLanguage`):** Sprache der Status-Markierung in Plan-Dateien
  (Deutsch/Englisch). Betrifft nur die Marker, nicht den Planinhalt. Default: aus
  vorhandenen Plänen erkennen; ohne Signal Englisch. Der abgeleitete Wert wird als aktuelle
  Vorauswahl benannt.
- **Tracker (`tracker.mode`):** Ob Review-Findings lokal als Markdown-Report liegen
  (`local`) oder als Issues auf GitHub/Forgejo geführt werden (`remote`). Default: `local`;
  bei `remote` nur bei mehrdeutigem Host nach dem Werkzeug fragen.

### Anzeige aktueller Werte (Muster)

Bei vorhandener, gültiger Config wird pro Frage ergänzt, z. B. „aktuell in der Config:
`worktree.enabled = false`" und dieser Wert vorausgewählt. Fehlt der Schlüssel: „aktuell
nicht gesetzt – Default: …". Ask-Header bleiben kurz (≤ 12 Zeichen); die Erklärung und der
aktuelle Wert stehen im Fragetext bzw. Begleitabsatz, nicht im Header.

### Edge Cases

- **Frische Installation (keine Config):** keine „aktuellen Werte"; überall sichere Defaults
  vorausgewählt. Express schreibt direkt die Sicher-Defaults.
- **Vorhandene Config, Express:** weicht der Bestand von den Sicher-Defaults ab, nicht
  ungefragt überschreiben – Vorher/Nachher zeigen und bestätigen; unbekannte Schlüssel
  bleiben erhalten.
- **Ungültiges JSON:** bestehende Behandlung (nicht still überschreiben, informieren,
  Abbruch/Neu anlegen anbieten). Vollmigration läuft dann nicht.
- **Kein Git-Repository:** `.gitignore`-Hinweis wie bisher; Config-Wizard läuft unabhängig.
- **Erweitert übersprungen:** review/applyReview/Pfade behalten Default bzw. Bestandswert –
  keine stillen Änderungen.
- **`remote` ohne mehrdeutigen Host:** `remoteToolOverride` bleibt `auto`, keine Zusatzfrage.
- **Aufgeschobenes Upgrade (`delivery.completion: null`):** der bestehende Upgrade-Dialog
  greift weiterhin genau in `setup` (einziger Ort laut `config-migration.md`).

## Akzeptanzkriterien

- [ ] `node build.mjs` und `pnpm agent:check` laufen fehlerfrei; alle Ask-Header ≤ 12 Zeichen.
- [ ] `/firmo setup` startet mit einer Express/Geführt-Wahl; die alte
      Drei-Wege-Preset-Auswahl existiert nicht mehr, und „Schneller persönlicher Workflow"
      ist als Preset entfernt.
- [ ] Im **Express**-Pfad werden die sicheren Defaults (bzw. vorhandene Config-Werte)
      übernommen; Abweichungen gegenüber einer bestehenden Config werden als Vorher/Nachher
      gezeigt und bestätigt, bevor geschrieben wird.
- [ ] Im **Geführt**-Pfad werden zuerst die Kern-Schalter (Worktree, Abschluss-Aktion,
      Marker-Sprache, Tracker) jeweils mit einer verständlichen Erklärung für Firmo-Neulinge
      abgefragt; anschließend fragt ein Gate „Erweiterte Einstellungen anpassen?" die
      Feinheiten (review, applyReview, plan.dir, branchPrefix, worktree.setup/baseDir) ab.
- [ ] Existiert eine `.firmo/config.json`, zeigt jede Auswahl den aktuell festgeschriebenen
      Wert an und wählt ihn vor; fehlt der Schlüssel, wird der Default als Vorauswahl klar
      benannt.
- [ ] Jede angebotene Option ist ausführlich genug erklärt, dass ein Nutzer ohne
      Firmo-Vorwissen die Auswirkung versteht (was/warum/Bedeutung).
- [ ] Der Express-Pfad setzt für `plan.markerLanguage` den abgeleiteten Wert (Detection aus
      vorhandenen Plänen, sonst Englisch); im Geführt-Pfad ist dieser Wert vorausgewählt und
      als solcher benannt.
- [ ] Der aufgeschobene `delivery.completion: null → merge`-Upgrade-Dialog erscheint in
      beiden Startpfaden (Express wie Geführt), sofern eine Alt-Config konsolidiert wird.
- [ ] Es werden keine neuen Config-Schlüssel eingeführt; das Schema entspricht dem Stand nach
      Plan 0070. Unbekannte und nicht abgefragte Schlüssel bleiben nicht-destruktiv erhalten.
- [ ] Der `.gitignore`-Schritt, die nicht-destruktive Schreiblogik und der aufgeschobene
      `delivery.completion: null → merge`-Upgrade-Dialog funktionieren im neuen Ablauf
      unverändert.

## Validierungsplan

- `node build.mjs` (beide Harnesses) und `pnpm agent:check` grün.
- Manuelle Trockenprüfung des Wizard-Flows am erzeugten `dist/…/setup.md`: Express- und
  Geführt-Pfad, Kern- vor Erweitert, Anzeige aktueller Werte in beiden Pfaden.
- Prüfen an einer Beispiel-`config.json` (mit gesetzten und mit fehlenden Schlüsseln), dass
  aktuelle Werte korrekt angezeigt/vorausgewählt werden und Express nicht-destruktiv bleibt.
- Grep-Check, dass keine Referenz auf das entfernte Preset „Schneller persönlicher Workflow"
  verbleibt und keine neuen Config-Schlüssel eingeführt wurden.

## Annahmen und offene Punkte

- Annahme: Kern-Scope ist ausschließlich `src/tools/setup.md`. Ein separater
  „Erste Schritte"-User-Guide unter `docs/user-guide/` ist optional und nicht Teil dieser
  Umsetzung, außer der User wünscht ihn ausdrücklich.
- Annahme: Die konkreten Werte des entfallenden „Schnell"-Presets müssen nicht als Bündel
  erhalten bleiben; sie sind einzeln über die Erweitert-Optionen erreichbar.
- Abhängigkeit: Baut auf dem post-0070-`setup.md` (bereits auf `main`) auf. Leichte
  Frontmatter-Überschneidung mit Plan 0072 (fügt `setup.md` ein `catalogHint`-Feld hinzu) –
  bei paralleler Umsetzung nur die Frontmatter-Merge-Reihenfolge beachten.

## Testergebnisse

Umgesetzt über `/firmo apply` → `/firmo build` in-place auf dem Branch
`firmo/build/setup-wizard`, Commit `e9ea7cc` (`feat(setup): guided wizard …`). Geändert
wurde ausschließlich `src/tools/setup.md`:

- Frontmatter und Ziel auf das Wizard-Leitbild (Express + Geführt, Neuling-Zielgruppe, Anzeige aktueller Werte) umgestellt.
- Config-Schema: zweites Preset entfernt; „Sichere Defaults" als einzige benannte Basis inkl. Kern-Schalter-Werten; `plan.markerLanguage` als Ableitung (Detection, sonst Englisch).
- Neuer Ablauf: Schritt 3 Express/Geführt; Schritt 4 Kern-Schalter mit Erklärungen und aktuellem-Wert-Muster; Schritt 5 optionales Erweitert-Gate; `.gitignore`, Merge/Schreiben und der aufgeschobene `completion: null → merge`-Upgrade-Dialog erhalten; Zusammenfassung angepasst.

Validierung: `node build.mjs` grün (beide Harnesses, Guards inkl. Ask-Header-Länge ≤ 12),
`pnpm agent:check` grün (144 Dateien), Grep-Check ohne Rest­referenzen auf das entfernte
Preset. Keine Test-Suite; der Build ist die maßgebliche Prüfung.

## Review-Findings

Keine offenen kritischen Findings. Die Änderung ist reine Interaktions-/Doku-Schicht über
dem unveränderten Config-Schema; keine neuen Config-Schlüssel.

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
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Scope (Wichtig):** „Alle Optionen ausführlich erklären" könnte den Wizard aufblähen.
  Eingegrenzt über die Kern-zuerst/Erweitert-optional-Struktur (User-Entscheidung), sodass
  Neulinge nicht überladen werden und trotzdem alle Optionen erreichbar bleiben.
- **Fehlerfälle (Hinweis):** Der Express-Pfad darf eine bestehende, abweichende Config nicht
  still überschreiben – über die Vorher/Nachher-Bestätigung abgesichert.
- **Architektur/Wartbarkeit (Hinweis):** Das Schema bleibt unverändert; der Wizard ist reine
  Interaktions-/Doku-Schicht darüber. Das hält die Änderung lokal auf `setup.md`.

### Vertiefter Plan-Review – geklärte Entscheidungen

- **Sicher-Default für `plan.markerLanguage`:** aus vorhandenen Plänen erkennen; ohne Signal
  Englisch. Gilt als Express-Wert und als Vorauswahl im Geführt-Pfad.
- **Upgrade-Dialog:** der aufgeschobene `completion: null → merge`-Upgrade erscheint in beiden
  Startpfaden (Migrations-Notwendigkeit, kein Wahlpunkt).
- Bestätigt: konkrete Sicher-Defaults-Basis inkl. Kern-Schaltern (worktree an, merge,
  origin/main, tracker local, plan.dir docs/plan).

## Offene Punkte

- Keine offenen Punkte.
