# Effective Flow-Konfiguration

Die Effective Flow-Konfiguration liegt **nicht** mehr in `.effective-flow/config.json`, sondern in einer lebenden
Projektsetup-ADR. Dieses Dokument gibt den entwicklerorientierten Überblick; die verbindliche
Spezifikation steht in [`src/shared/config-migration.md`](../../src/shared/config-migration.md)
(Locator, Encoding, Migration) und [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md)
(lebendes ADR-Modell).

## Wo die Konfiguration liegt

Die getrackte Wahrheit ist eine lebende ADR „Effective Flow project setup" (Default-Slug
`effective-flow-project-setup`, Default-Pfad `docs/adr/effective-flow-project-setup.md`). Sie trägt die
Config-Parameter mit minimaler Prosa als **Markdown-Tabelle** (`| Schlüssel | Wert |`) mit dotted
keys. Aufgefunden wird die Datei über den Locator-Marker in `AGENTS.md`:

```md
**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md
```

## Auflösungsreihenfolge

Beim Lesen wird die Projektsetup-ADR in dieser Reihenfolge aufgelöst; der erste greifende Schritt
gewinnt:

1. **AGENTS.md-Marker** – die Zeile `**Effective Flow project setup:** <pfad>` (sonst `CLAUDE.md` bzw. eine
   vergleichbare Konventionsdatei). Ein toter Marker fällt weiter und wird gemeldet.
2. **Default-Pfad/Scan** – sonst `docs/adr/effective-flow-project-setup.md` bzw. ein Scan des erkannten
   ADR-Verzeichnisses (`docs/adr/`, `docs/decisions/`, `adr/`).
3. **Übergangs-Kompatibilität** – sonst übergangsweise eine noch vorhandene `.effective-flow/config.json`
   lesen und auf `/effective-flow setup` hinweisen.
4. **Eingebaute Defaults** – sonst die Defaults der jeweiligen Quell-Skills.

Der Lesepfad ist nicht-blockierend: Er legt nichts an und berührt kein Git.

## Tabellen-Encoding (Kurzform)

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (z. B. `focused`, `origin/main`).
- **`null`** → das Literal-Token `null` (semantisch „beim Lauf fragen").
- **Leere Liste** → `(leer)`.
- **Gefüllte Liste** → kommagetrennt (z. B. `humanizer, distill`).
- **Verschachtelung** → dotted keys (z. B. `applyReview.worktree.baseDir`).
- **Fehlende Zeile** → Schlüssel nicht gesetzt, es gilt der Default des Quell-Skills (bewusst
  verschieden von einer vorhandenen `null`-Zeile).

## `.effective-flow/` ist gitignored

`.effective-flow/` ist reines Laufzeit-Verzeichnis (`memory.json`, `cache.json`, `review/`, `.worktrees/`)
und wird **komplett** gitignored – es gibt keine getrackte `.effective-flow/config.json` mehr. Die einmalige
Migration übernimmt `/effective-flow setup`: Es erzeugt die ADR-Tabelle aus dem bestehenden Config-Inhalt,
schreibt den AGENTS.md-Marker, stellt `.gitignore` auf ein einzelnes `.effective-flow/` um und enttrackt die
Alt-`config.json`. Außerhalb von `/effective-flow setup` findet keine Migration statt.

## Lebendes ADR-Modell

Effective Flow-ADRs sind **lebende Dokumente**: mutable, nummernlos und slug-benannt; die aktuelle Datei ist
die Wahrheit, ohne Supersede-Kette. Das weicht bewusst vom Host-Skill `decision-records` ab (der
ADRs als immutabel-nach-accepted, nummeriert und ohne Config-Werte definiert) – Effective Flows Konvention
hat für Effective Flow-erzeugte ADRs Vorrang, weil sie auf kleinen LLM-Lesekontext und die Kolokation von
Wert und Kurzbegründung in einer getrackten Quelle optimiert. Details in
[`src/shared/adr-convention.md`](../../src/shared/adr-convention.md).
