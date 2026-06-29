## Investigation-Methode

Dieser Baustein beschreibt den read-only-Kern einer Fehler- und Verhaltensuntersuchung. Die hier beschriebenen Untersuchungsschritte selbst sind read-only: sie ändern keinen Code und schreiben keine Tests; eine Reproduktion erfolgt im Rahmen dieser Schritte nur durch Beobachtung – bestehende Checks ausführen, Logs und Verhalten beschreiben – oder durch eine dokumentierte Reproduktionsanleitung. Ob der einbindende Workflow darüber hinaus einen Reproduktionstest erzeugt, entscheidet dieser Workflow selbst (z. B. schreibt `{{SKILL:sf-fix}}` zusätzlich einen fehlschlagenden Test); `{{SKILL:sf-investigate}}` bleibt dagegen vollständig read-only.

### Symptom und Code untersuchen

1. Analysiere die Symptom- bzw. Fehlerbeschreibung gründlich: erwartetes gegenüber tatsächlichem Verhalten.
2. Untersuche den relevanten Code lokal oder über einen internen Explore-Sub-Agenten – ausschließlich lesend.
3. Kläre offene Fragen direkt mit dem User:
   - wann tritt das Verhalten auf
   - gibt es eine Fehlermeldung oder ein klar benennbares erwartetes gegenüber tatsächlichem Verhalten
   - seit wann besteht das Verhalten
4. Identifiziere die vermutliche Root Cause und die betroffenen Dateien.

### Diagnose-Validierung

Bewerte die Diagnose mit einer Scorecard, bevor eine Folgeentscheidung getroffen wird:

- **Clarity:** Root Cause sowie Datei und Zeile konkret benannt.
- **Verification:** Verhalten reproduzierbar oder als konkrete Reproduktionsanleitung beschrieben.
- **Context:** Annahmen explizit markiert, Ziel <= 10 % Raten.
