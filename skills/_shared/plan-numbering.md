## Plan-Nummern-Konvention

Plan-Dateien in `docs/plan/` tragen einen vierstelligen Nummern-Prefix im Schema
`NNNN-titel-slug.md`, zum Beispiel `0030-feature-name.md`. Jede Nummer ist genau
einmal vergeben. Im Normalbetrieb bleibt die Folge lückenlos: neue Pläne hängen
hinten an, abgebrochene Reservierungen bleiben als offene Pläne bestehen, und
umgesetzte Plan-Dateien werden nicht gelöscht – ihre Nummer dient als stabile
Referenz.

### Nummer reservieren (zu Beginn der Planung)

Sobald feststeht, dass ein neuer Plan geschrieben wird, reserviere die Nummer,
bevor die inhaltliche Klärung beginnt:

1. Lies alle Dateien in `docs/plan/`, die dem Muster `NNNN-…md` (vier Ziffern,
   Bindestrich) entsprechen, und bestimme die höchste vergebene Nummer.
2. Neue Nummer = höchste vergebene Nummer + 1, vierstellig mit führenden Nullen.
   Existiert noch keine Plan-Datei, ist die erste Nummer `0001`.
3. Bilde aus dem Arbeitstitel einen vorläufigen Kebab-Case-Slug (nur `a–z`, `0–9`
   und Bindestrich). Steht noch kein Titel fest, nutze `wip`.
4. Lege sofort eine temporäre Plan-Datei `docs/plan/NNNN-<slug>.md` mit minimalem
   Kopf an, um die Nummer zu belegen:

   ```markdown
   # NNNN: [Arbeitstitel] (WIP)

   **Planungsstatus:** Nicht umgesetzt
   ```

   Setze die Statuszeile in der Markersprache, die gemäß `Planstatus-Konvention`
   für das Projekt gilt (Konfiguration bzw. Detection). Steht die Markersprache
   zu diesem Zeitpunkt noch nicht fest, lass die Statuszeile zunächst weg – die
   Datei zählt dann als „Status unklar" und beeinflusst die Sprach-Detection
   nicht; die Statuszeile wird beim Befüllen ergänzt.

   Eine parallel laufende Planung in derselben Arbeitskopie sieht die Nummer
   dadurch als belegt und wählt `NNNN+1`.

Beim Befüllen des Plans wird der Inhalt vollständig ergänzt, der `(WIP)`-Zusatz
aus der H1 entfernt und – falls der endgültige Titel abweicht – der `<slug>` im
Dateinamen sowie der Titeltext der H1 auf den endgültigen Titel aktualisiert. Die
**Nummer bleibt dabei unverändert**.

Bricht die Planung nach der Reservierung ab, bleibt die Datei als erkennbarer
WIP-Stub bestehen und behält ihre Nummer, damit keine Lücke entsteht; sie sollte
später entweder fertiggestellt oder bewusst entfernt werden.

### Eindeutig und lückenlos

- Eine vierstellige Nummer ist höchstens einmal vergeben.
- Im Normalbetrieb bleibt die Folge ohne Lücken (siehe oben).
- **Stabilität vor Lückenfreiheit:** Die Nummer eines bereits umgesetzten Plans
  wird nicht verändert – auch nicht, um eine Lücke zu schließen. Routinemäßige
  Skill-Läufe nummerieren nicht selbsttätig um. Entsteht ausnahmsweise eine Lücke
  (zum Beispiel durch bewusstes Löschen), schließe sie nur durch Aufrücken noch
  **nicht** umgesetzter Pläne; umgesetzte Pläne bleiben unangetastet.

### Kollisionsauflösung in Planungsreihenfolge

Reservierung verhindert Doppelvergabe nur innerhalb derselben Arbeitskopie.
Werden Pläne auf getrennten Git-Branches erstellt, kann dieselbe Nummer doppelt
entstehen; das wird erst nach dem Zusammenführen sichtbar. Wenn ein Skill beim
Scannen von `docs/plan/` mehrere Dateien mit derselben Nummer findet, löse die
Kollision auf:

1. Bestimme je Datei den Planungsstart über den ersten Commit, der die Datei
   einführt (`git log --diff-filter=A --follow --format=%aI -- <datei>`, ältester
   Eintrag). Bei gleicher, fehlender oder nicht bestimmbarer Zeit gilt der
   lexikografisch kleinere Dateiname als früher.
2. Sortiere die kollidierenden Pläne nach Planungsstart und nummeriere die Folge
   so um, dass sie wieder eindeutig, lückenlos und in dieser Reihenfolge ist. Der
   zuerst geplante Plan behält seinen Platz; spätere werden an ihrer
   chronologisch korrekten Position eingefügt, nachfolgende Nummern rücken um eins
   auf.
3. Verschiebe bereits umgesetzte Pläne so wenig wie möglich. Lässt sich
   Eindeutigkeit nur durch Umnummerieren eines umgesetzten Plans erreichen, ist
   das zulässig; bevorzuge dann, den später geplanten Plan zu verschieben.
4. Beim Umnummerieren einer Datei:
   - benenne die Datei um (in einem Git-Repository mit `git mv`, um die Historie
     zu erhalten),
   - passe die H1-Überschrift `# NNNN: …` an die neue Nummer an,
   - ziehe Referenzen auf die alte Nummer mit (andere Plan-Dateien sowie
     Review-Reports unter `.sf-plugin/review/`).
   Führe die Umbenennungen absteigend aus (höchste Nummer zuerst), damit keine
   Zwischenkollision entsteht.
5. **Zuständigkeit:** Skills, die nur lesen dürfen (zum Beispiel `sf-plan` und
   `sf-open-plans`), melden eine erkannte Dublette, lösen sie aber nicht selbst
   auf, wenn dafür Schreibzugriffe außerhalb ihres erlaubten Bereichs nötig wären.
   Die Auflösung übernehmen die schreibenden Workflows (`sf-build`, `sf-fix`,
   `sf-refactor`, `sf-docs`).

### Referenzauflösung trotz Umnummerierung

Da eine bereits kommunizierte Plan-Nummer nach einem Merge umnummeriert werden
kann, ist der Titel-Slug der stabilere Anker. Wenn eine Plan-Referenz (siehe
`Plan-Referenzen`) über die Nummer nicht mehr auflösbar ist, ziehe den Slug als
Fallback heran.
