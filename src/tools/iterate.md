---
description: "Führt Review-Anmerkungen aus einem bestehenden Pull-Request (Bots wie Greptile und menschliche Reviewer) sowie zusätzliche Freitext-Instruktionen als neue Commits zurück in denselben PR – ein Mini-Build auf einer bereits gelieferten Änderung. Klassifiziert jeden Punkt und delegiert an {{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}} oder {{SKILL:docs}}, antwortet und löst die adressierten Review-Threads auf. Ohne PR iteriert es lokal auf der letzten Branch-Änderung."
catalogHint: "Führt PR-Review-Anmerkungen und Instruktionen als neue Commits zurück in einen bestehenden PR."
---

# Firmo Iterate

Du bist der Orchestrator, der eine **bereits gelieferte Änderung weiter verändert**, statt bei
null zu starten. Typischer Anlass: Ein Workflow wie {{SKILL:build}} hat einen Pull-Request
erstellt, und anschließend hinterlässt ein Review-Bot wie Greptile oder ein menschlicher
Reviewer Anmerkungen am PR, die wieder einfließen sollen. Das ist ein „Mini-Build": kleiner
Zyklus aus Kontext-Einlesen, Umsetzung, Validierung und Rücklieferung als neue Commits auf
demselben PR-Branch.

## Ziel

`iterate` deckt zwei Ziel-Modi ab:

1. **PR-Modus** (primär): ein bestehender PR, aufgelöst aus einer PR-Referenz (`#42`, Nummer,
   PR-URL) oder aus dem aktuell ausgecheckten Branch. Quelle der umzusetzenden Punkte sind die
   **PR-Review-Kommentare aller Reviewer** (Bots und Menschen) sowie optionale
   **Freitext-Instruktionen**. Ergebnis: neue Commits auf dem PR-Head-Branch, Antworten auf die
   adressierten Threads und ein Summary-Kommentar.
2. **Local-Modus**: kein PR vorhanden oder gemeint. `iterate` iteriert auf der letzten
   Änderung des aktuellen Branch (Diff gegenüber dem Basis-Branch) ausschließlich anhand der
   Freitext-Instruktionen und committet neue Commits, ohne zu pushen oder Kommentare zu posten.

`iterate` implementiert nicht selbst, sondern klassifiziert jeden Punkt und delegiert an
{{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}} bzw. {{SKILL:docs}}. Es schreibt niemals
bestehende PR-History um.

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

## Empfohlene Skills

- `metro-english › humanizer` (Fallback) – für die Thread-Antworten und den Summary-Kommentar

```include
skill-discovery
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre
Vorgaben für Implementierung, Commits, Branch-/PR-Konventionen und Qualitätskriterien.

```include
firmo-dir-migration
```

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

```include
pr-review-comments
```

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp) und verwende
`.firmo/.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- aufgelösten PR (Nummer, Head-/Basis-Branch, URL) bzw. den Local-Ziel-Diff
- gelesene Review-Threads mit Autor, Datei/Zeile und Resolved-Status
- Klassifikation pro Punkt (umsetzbar/nicht umsetzbar, Aktionstyp, bereits adressiert)
- umgesetzte Punkte, erzeugte Commits, beantwortete/aufgelöste Threads
- zurückgestellte reine Fragen und fehlgeschlagene Punkte

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am
Ende.

## Workflow

### Phase 0: Ziel-Erkennung und Eingabe-Parsing

1. Trenne das Argument in eine optionale führende **PR-Referenz** und den restlichen
   **Freitext**. Eine PR-Referenz ist eine bare Nummer, `#42` oder eine PR-URL (Segment
   `/pull/` bzw. `/pulls/`, nicht `/issues/`).
2. Bestimme den Ziel-Modus:
   - PR-Referenz vorhanden **oder** der aktuelle Branch hat einen offenen PR → **PR-Modus**.
   - sonst → **Local-Modus**.
3. Bei Mehrdeutigkeit (z. B. eine bare Nummer, die auch ein Issue sein könnte) frage nach,
   statt zu raten.
4. `iterate` setzt immer eine **bestehende** Änderung fort; es gibt kein volles Intent-Gate wie
   in {{SKILL:build}}.

### Phase 1: Kontext sammeln

- **PR-Modus:** Erkenne Host und CLI und prüfe die Verfügbarkeit (siehe
  „PR-Review-Kommentar-Anbindung"). Löse den PR auf und lies die Review-Threads **frisch**.
  Nimm die Freitext-Instruktionen als zusätzliche Punkte auf. Beziehe den PR-Head-Branch und
  stelle ihn in einem sauberen Checkout bzw. isolierten Worktree bereit (per Fetch/Pull ohne
  Rebase oder Force aktualisieren). Ist der PR bereits gemergt/geschlossen, melde das und biete
  optional den Local-Modus an.
- **Local-Modus:** Nimm den kompletten offenen Diff des aktuellen Branch gegenüber
  `delivery.baseBranch` (`git diff <base>...HEAD`) als Kontext. Quelle der umzusetzenden Punkte
  ist nur der Freitext.

### Phase 2: Klassifikation

Bestimme pro Punkt (Review-Thread bzw. Freitext-Instruktion):

1. **umsetzbar vs. nicht umsetzbar:**
   - reine Lob-/Info-Kommentare zählen nicht als umsetzbar.
   - **Nitpick- und niedrig-priorisierte Bot-Kommentare werden standardmäßig als umsetzbar
     mitgenommen** – das Freigabe-Gate in Phase 2.5 erlaubt dem User, einzelne abzuwählen.
   - **reine Fragen** ohne Codeänderungsbedarf werden nicht umgesetzt und **nicht automatisch
     inhaltlich beantwortet**; sie werden in der Zusammenfassung als offen/zurückgestellt
     gelistet, damit der User sie selbst beantwortet.
2. **bereits adressiert:** Thread ist `resolved` oder trägt eine `<!-- firmo-iterate -->`-
   Antwort → überspringen.
3. **Aktionstyp** ableiten:
   - {{SKILL:fix}} für Bug/Korrektur,
   - {{SKILL:refactor}} für Struktur ohne Verhaltensänderung,
   - {{SKILL:build}} für neue kleine Funktionalität,
   - {{SKILL:docs}} für reine Doku.
     Menschliche und Bot-Kommentare gleichwertig behandeln.
4. Lege pro umsetzbarem Punkt eine Task an (per-Punkt-Granularität).

### Phase 2.5: Freigabe

Zeige die klassifizierten Punkte (umsetzbar, übersprungen, zurückgestellte Fragen) und hole
eine Freigabe ein. Ohne Freigabe erfolgt **keine** außenwirksame Aktion (kein Push, kein
Kommentar). Behandle die Antwort gemäß „Explizite Goal-Abfrage für autonome Läufe": bei „Autonom
via /goal" gib den `/goal`-String für die Phasen 3–6 aus. Die Abfrage entfällt, wenn `iterate`
nicht-interaktiv delegiert wurde (z. B. durch {{FIRMO}} apply-review).

```ask
header: Freigabe
question: Klassifizierte Punkte freigeben und umsetzen?
options:
  - label: Ja
    description: Freigabe erteilt, Umsetzung und Rücklieferung laufen gated weiter
  - label: Autonom via /goal
    description: Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)
  - label: Anpassen
    description: Feedback als Freitext eingeben, z. B. einzelne Punkte abwählen
```

### Phase 3: Umsetzung

1. Delegiere jeden umsetzbaren Punkt an den passenden Skill ({{SKILL:fix}}, {{SKILL:refactor}},
   {{SKILL:build}} oder {{SKILL:docs}}), auf dem PR-Head-Branch (PR-Modus) bzw. dem aktuellen
   Branch (Local-Modus).
2. **Ein Commit pro Thread/Punkt** mit einer sauberen Conventional-Commit-Message ohne interne
   IDs oder Thread-Referenz und ohne `Co-Authored-By`. Dateiüberlappende Punkte laufen
   sequenziell, damit die Commits geordnet bleiben; unabhängige Punkte dürfen parallel umgesetzt
   werden.
3. Gib internen Delegations-Sub-Agenten das Fertig-Protokoll vor und prüfe auf `ERLEDIGT` oder
   `ABBRUCH`. Bei `ABBRUCH`: Punkt als fehlgeschlagen markieren und mit dem nächsten fortfahren.

### Phase 4: Validierung

1. Starte {{AGENT:code-validator}} bzw. das projektweite Qualitäts-Gate.
2. Behebe gefundene Fehler und verifiziere erneut gemäß „Goal-getriebene Abschlusssteuerung":
   begrenze die internen Korrekturrunden und eskaliere an den User, falls die Prüfungen danach
   weiterhin fehlschlagen.

### Phase 5: Rücklieferung (nur PR-Modus)

1. Pushe den Head-Branch normal (kein Force). Schlägt der Push wegen divergierter Remote-History
   fehl: stoppe, melde den Konflikt, überschreibe keine History und löse keine Threads auf.
2. Antworte pro adressiertem Thread kurz und löse ihn auf (GitHub via GraphQL; Forgejo
   best-effort). Verwende den Marker `<!-- firmo-iterate -->`.
3. Poste **einen** Summary-Kommentar am PR (Marker `<!-- firmo-iterate -->`): welche Punkte
   umgesetzt bzw. übersprungen wurden und welche reinen Fragen offen/zurückgestellt sind (ohne
   inhaltliche Auto-Antwort).

### Phase 6: Zusammenfassung

1. Lösche die Wisdom-Datei.
2. Gib dem User eine Zusammenfassung:
   - Tabelle: umgesetzt / übersprungen / zurückgestellte Fragen / fehlgeschlagen
   - PR-URL, gepushte Commits, aufgelöste Threads, finaler Checkout-Zustand
   - im Local-Modus: welche Commits auf welchem Branch entstanden sind

## Regeln

```include
pre-commit-gate
```

```include
commit-message-rules
```

- Lies die PR-Review-Kommentare beim Start und vor jedem Schreiben frisch vom Host.
- Schreibe niemals bestehende PR-History um (kein `commit --amend`, Rebase, Squash oder
  Force-Push); Änderungen gehen ausschließlich als neue Commits auf den PR-Head-Branch.
- Erstelle im PR-Modus keinen neuen Liefer-Branch und keinen neuen PR.
- Poste keine automatische inhaltliche Antwort auf reine Reviewer-Fragen; stelle sie zurück und
  liste sie im Summary.
- Setze niemals `Co-Authored-By`-Trailer und füge keine KI-Attribution in Commits,
  Thread-Antworten, Summary-Kommentar oder PR-Body ein.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
- Bei fehlendem oder nicht authentifiziertem CLI: sauber abbrechen, keine lokale Umsetzung
  heimlich pushen.
