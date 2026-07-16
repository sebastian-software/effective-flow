# 0010: Klare Validierungsgrenze fuer `$sf-commit`

**Planungsstatus:** Umgesetzt

## Anforderung

Im `sf-commit`-Skill soll explizit beschrieben werden, dass keine Projektvalidation wie Linting und Tests ausgefuehrt werden. Diese Verantwortung liegt bei den dafuer vorgesehenen Skills.

## Architekturentscheidungen

- **Commit-Skill bleibt eng geschnitten**: `$sf-commit` erzeugt nur die Commit-Message auf Basis der staged changes und fuehrt den Commit aus.
- **Validierung bleibt separat orchestriert**: Linting, Tests und aehnliche Projektpruefungen bleiben bei Skills wie `$sf-code-validator` und `$sf-test-writer`.
- **Hooks bleiben passiv respektiert**: Repository-Hooks duerfen den Commit weiter blockieren, ohne dass `$sf-commit` daraus einen eigenen Validierungsauftrag ableitet.

## Betroffene Dateien

| Datei                       | Beschreibung                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `skills/sf-commit/SKILL.md` | Ziel, Vorgehen und Regeln um die explizite Abgrenzung zu Projektvalidierung erweitert |

## Implementierungsdetails

Die Skill-Beschreibung wurde so angepasst, dass die Nicht-Zustaendigkeit fuer Projektvalidation an mehreren Stellen explizit ist: im Ziel, im Ablauf und in den Regeln. Dadurch ist klar, dass `sf-commit` keine Linting-, Test- oder Build-Schritte startet und Hook-Fehler nur knapp zurueckmeldet.

## Testergebnisse

Keine Laufzeit-Tests ausgefuehrt, da nur Skill-Dokumentation und Plan-Dokumentation angepasst wurden.

## Review-Findings und deren Behebung

| Finding                                                                                                      | Schweregrad | Status  |
| ------------------------------------------------------------------------------------------------------------ | ----------- | ------- |
| Die Abgrenzung zwischen Commit-Workflow und Projektvalidierung war im `sf-commit`-Skill nicht explizit genug | Wichtig     | Behoben |
