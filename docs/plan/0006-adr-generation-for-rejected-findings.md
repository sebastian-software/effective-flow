# 0006 — ADR-Generierung für nicht umgesetzte Findings

## Anforderung

Wenn vorgeschlagene Refactorings, Fixes oder andere Review-Findings bewusst nicht umgesetzt werden, sollen diese Entscheidungen als Architecture Decision Records (ADR) in `docs/adr/` dokumentiert werden. Der User wird vorher gefragt — es passiert nicht automatisch.

## Architekturentscheidungen

### User-Interaktion vor ADR-Generierung

Der User wird in zwei Schritten gefragt: (1) Welche Findings sollen abgelehnt werden? (2) Sollen dafür ADRs angelegt werden? Kein automatisches Anlegen.

**Begründung:** ADRs sind bewusste Entscheidungen und sollten nicht ohne explizite Zustimmung entstehen.

### ADR-Format (MADR-inspiriert)

Leichtgewichtiges Format mit: Status (Abgelehnt), Datum, Kontext (welcher Workflow), Entscheidungs-Sections und Quell-Finding-Referenz.

**Begründung:** Muss maschinell von der Designentscheidungs-Erkennung in `/review` gelesen werden können, gleichzeitig für Menschen verständlich sein.

### Kreislauf mit Designentscheidungs-Erkennung

ADRs in `docs/adr/` werden automatisch von der Designentscheidungs-Erkennung in `/review` Phase 1 erkannt. Dadurch werden dieselben Findings bei zukünftigen Reviews nicht erneut gemeldet.

**Begründung:** Das ist der Hauptzweck — einmal bewusst abgelehnte Findings sollen nicht wiederholt als Problem erscheinen.

### Drei Commands betroffen

ADR-Generierung wurde in `/build-feature` (Phase 6), `/refactor` (Phase 4) und `/review` (Phase 4) eingebaut. `/fix` hat keine Review-Phase mit Findings-Tracking und ist daher nicht betroffen.

### Review-spezifischer Interaktionsschritt

Da `/review` rein analytisch ist (kein Implementierungsschritt), wurde ein zusätzlicher Schritt eingefügt in dem der User gefragt wird welche Findings er ablehnen möchte. In `/build-feature` und `/refactor` entsteht der "Nicht umgesetzt"-Status organisch aus dem Review-Prozess.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `sf-frontend-workflows/commands/review.md` | Neuer Interaktionsschritt (Findings-Ablehnung), ADR-Generierungsschritt, ADR-Format-Section, angepasste "nur lesen"-Regel |
| `sf-frontend-workflows/commands/build-feature.md` | ADR-Generierungsschritt als Schritt 6 in Phase 6 |
| `sf-frontend-workflows/commands/refactor.md` | ADR-Generierungsschritt als Schritt 6 in Phase 4 |
| `README.md` | Neue Section "ADR-Generierung" |

## Review-Findings

| Finding | Status |
|---|---|
| Kontext-Feld im review.md ADR-Format war Platzhalter statt `/review` (Kritisch) | Behoben |
| Fehlender Interaktionsschritt für Findings-Ablehnung in review.md (Kritisch) | Behoben — neuer Schritt 7 eingefügt |
| Inkonsistente Terminologie "abgelehnt" vs "nicht umgesetzt" (Wichtig) | Behoben — vereinheitlicht auf "nicht umgesetzt" |
| Keine explizite Anweisung zur Verzeichniserstellung (Wichtig) | Behoben — "Erstelle docs/adr/ falls nicht vorhanden" in allen drei Dateien |
