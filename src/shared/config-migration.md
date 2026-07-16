## Firmo-Konfiguration (Projektsetup-ADR)

Die getrackte Wahrheit für die Firmo-Konfiguration ist eine lebende ADR „Firmo project
setup“ (Default-Slug `firmo-project-setup`, siehe Baustein „Lebendes ADR-Modell“). Sie trägt
die Config-Parameter mit minimaler Prosa als **Markdown-Tabelle**. Es gibt **keine**
`.firmo/config.json` mehr als Config-Quelle; `.firmo/` ist reines Laufzeit-Verzeichnis
(`memory.json`, `cache.json`, `review/`, `.worktrees/`) und wird komplett gitignored.

### Config-Locator (Auflösungsreihenfolge)

Beim Lesen der Konfiguration wird die Projektsetup-ADR in dieser Reihenfolge aufgelöst; der
erste greifende Schritt gewinnt:

1. **AGENTS.md-Marker.** Die kanonische Zeile `**Firmo project setup:** <pfad>` in
   `AGENTS.md`, sonst in `CLAUDE.md` bzw. einer vergleichbaren Konventionsdatei → die ADR
   unter `<pfad>` lesen. Zeigt der Marker auf einen Pfad, unter dem **keine** ADR liegt
   (toter/veralteter Marker), nicht dort stehenbleiben, sondern in dieser Reihenfolge
   weiterfallen und den veralteten Marker melden (Korrektur in {{SKILL:setup}}).
2. **Default-Pfad/Scan.** Sonst `docs/adr/firmo-project-setup.md` bzw. ein Scan des erkannten
   ADR-Verzeichnisses (`docs/adr/`, `docs/decisions/`, `adr/`) nach der Projektsetup-ADR.
3. **Übergangs-Kompatibilität.** Sonst — nur übergangsweise — eine noch vorhandene
   `.firmo/config.json` lesen und auf {{SKILL:setup}} hinweisen. Dieser Lesepfad legt
   **nichts** an und berührt **kein** Git.
4. **Eingebaute Defaults.** Sonst die Defaults der jeweiligen Quell-Skills verwenden.

Der deterministische Lesepfad beliebiger Tools ist nicht-blockierend: Er liest die ADR (bzw.
den Übergangs-Fallback), erzeugt aber selbst keine Datei und mutiert kein Git. Das Anlegen
der ADR, der Marker und die Migration passieren ausschließlich im git-berührenden Pfad von
{{SKILL:setup}}.

### Tabellen-Encoding (verbindlich für Schreiber und Leser)

Die Config-Parameter stehen als flache Markdown-Tabelle mit zwei Spalten
`| Schlüssel | Wert |`. Schreiber ({{SKILL:setup}}, Migration) und Leser (alle Tools)
interpretieren die Werte identisch nach dieser Kodierung:

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (z. B. `focused`, `origin/main`).
- **`null`** (semantisch „beim Lauf fragen“, z. B. `applyReview.defaultCommitStrategy`) →
  das Literal-Token `null`.
- **Leere Liste** → `(leer)`.
- **Gefüllte Liste** → kommagetrennt (z. B. `humanizer, distill`).
- **Verschachtelung** → dotted keys (z. B. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); ein leeres Objekt hat keine Unterzeilen.
- **Fehlende Zeile = Schlüssel nicht gesetzt → Default des Quell-Skills.** Bewusst
  verschieden von einer vorhandenen Zeile mit Wert `null` (expliziter Wert, semantisch „beim
  Lauf fragen“). Beispiel: keine `delivery.completion`-Zeile → Default `merge`; eine
  `delivery.completion | null`-Zeile → beim Lauf fragen.

Das Lesen eines einzelnen Werts ist ein trivialer Zeilen-Lookup (Zeile mit dotted key →
Wertzelle). Beispiel-Ausschnitt (Schnittstellenskizze, kein vollständiger Inhalt):

```markdown
## Konfiguration

| Schlüssel                         | Wert    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (leer)  |
| worktree.enabled                  | true    |
```

Ist die Tabelle ungültig oder mehrdeutig (fehlender Schlüssel, unbekanntes Encoding): einen
sicheren Default für den Lauf verwenden, den User über den betroffenen Schlüssel
informieren, **nicht** raten.

### Einmalige Migration `.firmo/config.json` → Projektsetup-ADR

Die Migration einer bestehenden `.firmo/config.json` in die Projektsetup-ADR ist
**git-berührend** und läuft ausschließlich im {{SKILL:setup}}-Pfad. Sie erzeugt die
ADR-Tabelle aus dem aktuellen Config-Inhalt (Encoding wie oben), schreibt den
AGENTS.md-Marker, stellt `.gitignore` auf ein einzelnes `.firmo/` um und enttrackt die
Alt-`config.json` (`git rm --cached`, Datei-Inhalt auf Platte belassen). Der genaue Ablauf
inklusive Idempotenz-Markierung steht in {{SKILL:setup}}.

Außerhalb von {{SKILL:setup}} findet **keine** Migration statt: Der deterministische
Lesepfad legt nichts an und berührt kein Git; er liest bei fehlender ADR ersatzweise eine
noch vorhandene `.firmo/config.json` und weist auf {{SKILL:setup}} hin.
