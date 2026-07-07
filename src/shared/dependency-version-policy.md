## Externe Dependency-Versionen

Wenn du neue externe Abhängigkeiten oder extern versionierte Referenzen in ein Projekt einbringst:

- prüfe vor dem Ändern von Manifest, Lockfile, CI-Workflow oder Tool-Konfiguration die aktuelle Stable-Version über die passende Quelle:
  - npm/pnpm/yarn/bun: Registry-Metadaten über den erkannten Paketmanager (z. B. `pnpm view <package> version`, `npm view <package> version`, `yarn npm info <package> version`, `bun pm view <package> version`, falls verfügbar)
  - Rust/Cargo: crates.io-Metadaten oder `cargo search <crate> --limit 1`; bei `cargo add` nur Stable-Releases verwenden und `Cargo.lock` über Cargo aktualisieren
  - GitHub Actions: aktuelles Stable-Release bzw. den stabilen Major-Tag der Action prüfen; keine veralteten Major-Versionen übernehmen, wenn ein neuer stabiler Major ohne bekannte Inkompatibilität verfügbar ist
  - Container-Images, Toolchains, SDKs und CLIs: offizielle Release-/Registry-Metadaten prüfen und eine stabile, dokumentierte Version pinnen
- verwende möglichst diese Stable-Version explizit statt eine veraltete oder lokal bekannte Version zu raten
- meide Pre-Releases, RCs, Betas, Canaries und Nightlies, außer die Aufgabe oder das bestehende Projekt verlangt sie ausdrücklich
- wenn ein bestehendes Framework, Plugin oder Peer-Dependency-Fenster eine ältere Version erzwingt, dokumentiere die Einschränkung kurz und wähle die höchste dazu kompatible Stable-Version
- halte Manifest und Lockfile konsistent über den erkannten Paketmanager bzw. das native Tool, nicht durch manuelles Editieren des Lockfiles
