# Sicherung vor Version 36

Am 27.11.2026 wurde der bisherige Stand vor folgenden Änderungen gesichert:

- Rheinpegel: Verlauf über 24 Stunden oder 7 Tage und deutlichere Tendenz.
- Mond: dunkler Hintergrund und besser erkennbare Darstellung auf dem iPhone.
- Vorhersage: einheitliche SVG-Wettersymbole auf iPhone und Android.

Git-Tag: `backup/v35-vor-rheinpegel-2026-11-27`

Gesicherter Commit: `3815bd5d51903e254e083427f08d5c69c590dc6d`

Die Sicherung enthält den bisherigen App-Code und die zum Sicherungszeitpunkt vorhandenen Wetterdaten. Der Tag wird zusammen mit Version 36 auf GitHub gespeichert.

## Alten Stand ansehen

```sh
git show backup/v35-vor-rheinpegel-2026-11-27:index.html
```

## App auf den alten Stand zurücksetzen

In einem sauberen Checkout von `main` zunächst `git pull --ff-only` ausführen. Anschließend nur die App-Dateien wiederherstellen; die inzwischen gesammelten Wetterdaten bleiben dabei erhalten:

```sh
git restore --source=backup/v35-vor-rheinpegel-2026-11-27 -- app.js index.html mobile.css sw.js scripts/test-ui.cjs
git add app.js index.html mobile.css sw.js scripts/test-ui.cjs
git commit -m "Restore app state before version 36"
git push origin main
```

Die zusätzlichen Dateien `river.js` und `scripts/test-river.cjs` werden vom alten App-Stand nicht verwendet und können für eine spätere Wiederaufnahme erhalten bleiben. Die Wiederherstellung erzeugt einen neuen Commit; die Git-Historie bleibt bestehen. Auf installierten Geräten die angebotene App-Aktualisierung übernehmen.
