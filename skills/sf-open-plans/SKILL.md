---
name: sf-open-plans
description: "Listet alle noch nicht umgesetzten Plan-Dateien aus docs/plan/ mit kurzer Zusammenfassung und prüft den kanonischen Planstatus-Marker."
type: utility
---

# SF Open Plans

Du listest offene Implementierungspläne aus `docs/plan/`.

## Ziel

- alle Plan-Dateien mit kanonischem Status `**Planungsstatus:** Nicht umgesetzt` finden
- pro offenem Plan eine kurze, hilfreiche Zusammenfassung ausgeben
- Pläne mit fehlendem oder unklarem Status nicht als offen ausgeben, sondern separat als „Status unklar" melden
- keine Dateien ändern
- keine Tests, Builds oder Validierungen ausführen

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

{{INCLUDE:plan-status}}

## Vorgehen

1. Prüfe, ob `docs/plan/` existiert.
2. Lies alle Markdown-Dateien unter `docs/plan/` in numerisch-lexikografischer Reihenfolge.
3. Bestimme pro Datei den Planstatus ausschließlich über die erste Zeile mit Präfix `**Planungsstatus:**`.
4. Klassifiziere:
   - **Offen:** genau `**Planungsstatus:** Nicht umgesetzt`
   - **Abgeschlossen:** genau `**Planungsstatus:** Umgesetzt`
   - **Status unklar:** keine Statuszeile, mehrere Statuszeilen oder anderer Wert
5. Ermittle für offene Pläne:
   - Plan-Nummer und Titel aus der ersten H1-Zeile
   - Pfad
   - kurze Zusammenfassung aus `## Anforderung`
   - optional wichtigste betroffene Dateien aus `## Betroffene Dateien`, falls kurz genug
6. Ausgabe:
   - Wenn offene Pläne existieren: Tabelle mit `Plan`, `Titel`, `Pfad`, `Kurzfassung`
   - Danach eine kurze Liste mit Status-unklaren Plänen, falls vorhanden
   - Wenn keine offenen Pläne existieren: klare Meldung „Keine offenen Pläne gefunden."

## Zusammenfassungsregeln

- Fasse die Anforderung in einem Satz zusammen.
- Nutze bevorzugt den ersten inhaltlichen Absatz unter `## Anforderung`.
- Wenn der Abschnitt fehlt, nutze den H1-Titel als Fallback.
- Entferne reine Meta-Sätze wie „Verifizierter Code-Kontext:" aus der Kurzfassung.
- Kürze lange Zusammenfassungen auf etwa 160 Zeichen.
- Erfinde keine Inhalte, die nicht in der Plan-Datei stehen.

## Regeln

- Ändere keine Dateien.
- Starte keine Implementierung und keine Validierung.
- Zähle Review-Finding-Status wie `Nicht umgesetzt` nicht als Planstatus.
- Gib Pfade relativ zum Projekt-Root aus.
- Wenn `docs/plan/` fehlt oder keine Markdown-Dateien enthält, melde das knapp.
