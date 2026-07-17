# Skill-Discovery

Effective Flow-Tools und die Agents, die sie intern aufrufen, arbeiten nicht isoliert: Bevor sie mit
Planung, Umsetzung oder Prüfung beginnen, sichten sie die in deiner Umgebung ohnehin
verfügbaren Skills (z. B. `humanizer`, `impeccable`, `context7`, `effective-german-typography-skill`)
und binden die für die konkrete Aufgabe passenden zusätzlich ein. Wo ein Skill der
**Owner seiner Domäne** ist, ist seine Guidance maßgeblich; fehlt er, bleibt die Grundfunktion
jedes Tools über einen bewusst minimalen Fallback erhalten – kein Effective Flow-Tool und kein
Effective Flow-Agent hängt in seiner Grundfunktion von einem Host-Skill ab.

## Wie die Erkennung abläuft

1. **Empfohlene Skills bevorzugen.** Viele Tools und Agents nennen im eigenen Kopf eine kurze
   Liste „Empfohlene Skills“ – Skills, die für ihre typische Aufgabe besonders passen (z. B.
   `humanizer` für Dokumentations-Prosa, `impeccable`/`frontend-design` für
   UI-Implementierung). Eine Notation `A › B` ist ein **geordneter Fallback**: Der erste
   verfügbare, nicht ausgeschlossene Skill der Gruppe wird genommen – nie beide gleichzeitig.
2. **Relevanz beurteilen.** Jeder Skill wird gegen die konkrete Aufgabe geprüft; es werden
   nur klar passende eingebunden (typisch null bis zwei), nicht „auf Verdacht“.
3. **Config berücksichtigen.** Der `skills`-Block aus `.effective-flow/config.json` steuert das
   Verhalten global sowie – feiner – pro Agent und pro Tool (siehe unten).
4. **Aktuelle Library-Doku bei Bedarf.** Bei unbekannten oder aktuellen Frameworks/Libraries
   nutzen Tools bei Bedarf Doku-Skills wie `context7`, statt aus dem Trainingsstand zu raten.
5. **Geschichtete Autorität.** Effective Flow besitzt die **Orchestrierung** (das Was/Wann:
   Routing, Plan-/Report-State, Agent-Auswahl, Worktrees, Commits, Delivery, Config) – diese
   Ebene bleibt immer maßgeblich, und kein Skill darf Scope erweitern, neue Abhängigkeiten
   einführen oder den Plan verletzen. Die **fachliche Expertise** (das Wie: Domänen-Checklisten,
   Standards, Spezialisten-Guidance) besitzen die zentralen Skills: Ist ein empfohlener Skill der
   deklarierte Owner einer Fachfrage und deckt er sie ab, ist seine Guidance **maßgeblich**, nicht
   bloß optionaler Rat. Fehlt der Skill, greift ein bewusst **minimaler Fallback** – das Tool
   bleibt funktionsfähig, nur mit geringerer Tiefe. Die genaue Zuordnung je Skill steht im
   [Developer-Guide → Skill-Ownership](../developer-guide/skill-ownership.md). In reinen
   Analyse-/Planungs-Tools bleibt die No-Code-Grenze strikt.
6. **Melden.** Am Ende meldet das Tool kurz, welche Skills genutzt wurden – oder dass keiner
   passte.

Stellt deine Umgebung kein Skill-Verzeichnis bereit oder passt keiner der verfügbaren Skills,
ist dieser gesamte Ablauf ein No-Op: Effective Flow-Tools laufen unverändert mit ihrer eingebauten
Anweisung weiter.

## Steuerung über die Konfiguration

Der Block `skills` in `.effective-flow/config.json` (vollständige Feldreferenz siehe
[Konfiguration](./konfiguration.md#block-skills)) steuert die dynamische Skill-Nutzung auf
drei Ebenen:

| Ebene  | Schlüssel                           | Wirkung                                                               |
| ------ | ----------------------------------- | --------------------------------------------------------------------- |
| Global | `skills.enabled`                    | `false` schaltet die gesamte dynamische Skill-Nutzung projektweit aus |
| Global | `skills.include` / `skills.exclude` | Skills projektweit zusätzlich bevorzugen bzw. nie anwenden            |
| Agent  | `skills.agents.<name>`              | dieselben zwei Listen, aber nur für einen bestimmten Agent            |
| Tool   | `skills.tools.<name>`               | dieselben zwei Listen, aber nur für ein bestimmtes Tool               |

`<name>` ist dabei der Quell-Agent- bzw. Quell-Tool-Name (z. B. `ui-implementer`, `plan`),
nicht ein Anzeigename. Ein per `exclude` ausgeschlossener Skill wird bei einem
Fallback-Paar (`A › B`) einfach übersprungen – der nächste Fallback in der Kette greift dann
automatisch, ohne dass der Ablauf abbricht. Ein in `include` genannter, aber nicht
installierter Skill wird still ignoriert.

Beispiel – `humanizer` global bevorzugen, aber für das Tool `docs` deaktivieren:

```json
{
  "skills": {
    "enabled": true,
    "include": ["humanizer"],
    "tools": {
      "docs": {
        "exclude": ["humanizer"]
      }
    }
  }
}
```

## Materialisierung über `/effective-flow setup`

Im geführten Weg von [`/effective-flow setup`](./tools-einrichten.md) kannst du dir die eingebauten
Fallback-Empfehlungen einzelner Agents sichtbar in die Config schreiben lassen (Abschnitt
„Erweiterte Einstellungen“). Bei einer Fallback-Empfehlung wie `impeccable › frontend-design`
wird dabei nur der **primäre** Skill materialisiert (`skills.agents.<name>.include: ["impeccable"]`)
– der eingebaute Fallback auf `frontend-design` bleibt trotzdem aktiv, falls `impeccable`
einmal nicht verfügbar ist. Eine flache Empfehlung ohne Fallback (z. B. `humanizer`) wird
unverändert übernommen. Dieser Schritt ist rein optional – ohne ihn gelten die eingebauten
Empfehlungen der Tools und Agents ohnehin bereits.

## Siehe auch

- [Konfiguration](./konfiguration.md) – vollständige Feldreferenz für `skills`
- [Tools einrichten](./tools-einrichten.md) – `/effective-flow setup`
- [Glossar](./glossar.md) – Skill, Agent, Harness
