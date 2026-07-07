# 0014: Review — Standard-Finding-Scope ohne Auswahl

**Planungsstatus:** Umgesetzt

## Anforderung

Der Review-Skill soll standardmässig nur kritische und wichtige Findings im Bericht auflisten. Die explizite Auswahl (ASK-Block) zwischen „nur kritisch+wichtig“ und „alle Findings“ wird entfernt. Ein umfassendes Review mit Hinweisen ist weiterhin möglich, wenn der User das explizit im Auftrag angibt.

## Architekturentscheidungen

- **Standard = nur kritisch+wichtig**: Reduziert Interaktion und liefert fokussierte Berichte
- **Kein ASK-Block**: Die Entscheidung wird aus dem User-Text abgeleitet statt explizit abgefragt
- **Opt-in für Hinweise**: Der User kann jederzeit ein umfassendes Review anfordern (z. B. „umfassendes Review“, „alle Findings“, „inklusive Hinweise“)
- **Hinweis an User**: Zu Beginn wird kurz auf die Möglichkeit eines umfassenden Reviews hingewiesen

## Betroffene Dateien

| Datei                       | Beschreibung                                               |
| --------------------------- | ---------------------------------------------------------- |
| `skills/sf-review/SKILL.md` | Finding-Scope-Abschnitt, Phase 1, Phase 3, Phase 4, Regeln |

## Implementierungsdetails

- ASK-Block für Finding-Scope-Auswahl entfernt
- Abschnitt „Finding-Scope“ umgeschrieben: Standard ist nur kritisch+wichtig, Hinweise nur bei explizitem Wunsch
- Phase 1, Schritt 6: Erkennung des User-Intents statt Abfrage
- Alle Referenzen auf „gewählten Finding-Scope“ zu „aktiven Finding-Scope“ geändert
- Hinweis-Filterung und Regeln an neuen Standard angepasst
- Bericht erwähnt bei Standard-Scope, dass umfassendes Review möglich ist
