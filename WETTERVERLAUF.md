# Wetterverlauf – Umsetzung und Prüfung

## Aktualisierung: Farbfläche und größere Achsen

Die Fläche unter der Temperaturlinie verwendet dieselben absoluten Celsius-Farben wie der aktuelle Tacho: Blau bis 1 °C, weicher Übergang bis 7 °C zu Grün, Grün bis 22 °C und Übergang bis 28 °C zu Rot. Die Farbe folgt den einzelnen Messwerten entlang der Zeitachse und bleibt unabhängig von der dynamischen Y-Skala. Messlücken teilen auch die Farbfläche. Die Temperaturkurve bleibt orange und die gefühlte Temperatur grau gestrichelt.

Beide Y-Achsen haben jetzt 14 statt 10 Pixel große, kräftigere Beschriftungen, fünf Skalenstriche und einen an die Zahlenbreite angepassten linken Rand. App- und Service-Worker-Assets verwenden Version 32. Die vorhandenen Regressionstests wurden erneut ausgeführt; die Farbzuordnung wird zusätzlich gegen sämtliche 240 Farbsegmente des aktuellen Tachos geprüft.

Die erneute visuelle Browserprüfung dieser Anpassung konnte nicht ausgeführt werden: Computer Use stoppte, weil es die aktuelle Browser-URL nicht sicher bestimmen konnte. Die neuen Browserprüfungen für Schriftgröße und Begrenzung der Achsenbeschriftungen sind vorbereitet, wurden aber nicht ausgeführt. Die oben dokumentierten zwölf erfolgreichen Browseransichten beziehen sich auf die vorherige Version.

## 1. Bestandsanalyse

- Statische GitHub-Pages-PWA ohne Buildsystem: `index.html`, `styles.css`, `app.js`, `sw.js`.
- GitHub Actions ruft `scripts/collect.py` alle zehn Minuten auf. Weathercloud liefert Stationswerte, Open-Meteo die Prognose, PEGELONLINE den Rheinpegel.
- Historie existiert bereits: `data/YYYY-MM.json` und `data/latest.json`. Bestehende Datensätze bleiben erhalten; keine rückwirkend erfundenen Messwerte.
- Bisher: Zeitstempel mit lokalem Offset, Duplikatvergleich als Zeichenfolge, Ersatzzeit bei fehlendem Stationszeitpunkt. Neue Daten verwenden echte Stationszeit in UTC; Monatsdateien bleiben nach Berliner Kalendermonat partitioniert, damit die vorhandene Tagesnavigation funktioniert.
- Vorhandene SVG-Grafiken, Dark Mode und responsive Karten werden weiterverwendet. Neue Diagramme benötigen keine Bibliothek.
- Platzierung: direkt nach der aktuellen Temperaturkarte samt Messzeitpunkt; alle vorhandenen Karten behalten ihre relative Reihenfolge.
- Die geöffnete Arbeitskopie hatte kein Git-Repository. Lokaler Branch `feature/wetterverlauf` mit vollständigem Ausgangscommit; die separate Kopie `../github-publish` wird nicht verändert. Keine Veröffentlichung.

## Arbeitsschritte

Ausgangssicherung sowie fünf getrennte lokale Commits: Analyse, Speicherung, Diagramme, responsive Prüfung, Abschlussdokumentation. Jeder Schritt ist über Git vergleichbar und reversibel.

## 2. Historische Speicherung

`collect.py` schreibt neue Stationszeitpunkte in UTC (`Z`). Die Partition richtet sich weiter nach dem Berliner Monat; dadurch bleiben Tagesauswahl und bestehende Vorjahresvergleiche kompatibel. Monatliche Roharchive werden nicht gelöscht oder verdichtet und stehen später für Monats-, Jahres- und Vorjahresauswertungen zur Verfügung.

Identität ist der UTC-Zeitpunkt, auch wenn ältere Datensätze einen lokalen Offset enthalten. Erneute Läufe verändern bereits archivierte Messungen nicht. Ein verspäteter Stationswert setzt `latest.json` nicht zurück. Temporäre Dateien mit anschließendem Ersetzen vermeiden halb geschriebene JSON-Dateien. Fehlende/ungültige Stationszeitpunkte brechen den Lauf ab; es gibt keinen Ersatz durch die Abrufzeit. Nichtendliche Zahlen bleiben `null`. Tages-/Monatssummen werden nur bei zeitlich passenden Statistikwerten und passender Berliner Kalenderperiode übernommen.

Die bestehende Workflow-Serialisierung und der Zehn-Minuten-Cron bleiben erhalten. Tests laufen vor dem Sammeln. Zugangsdaten werden nicht benötigt und nicht im Frontend abgelegt.

## 3. Diagramme und Berechnungen

- `history.js` trennt Datenmodell und SVG-Darstellung, ohne neue Laufzeitabhängigkeit.
- Standard: rollierende 24 Stunden bis zur aktuellen Gerätezeit, mit originalen Messungen im Stationsintervall. 7 Tage entsprechen exakt 168 Stunden; Temperaturpunkte sind arithmetische Stundenmittel vorhandener Originalwerte.
- Min/Max stammen in beiden Ansichten aus den Originalmessungen. Fehlende Temperaturen und Abstände über 20 Minuten unterbrechen die Kurven. Einzelne Messungen erscheinen als Punkte. Unvollständige Stundenmittel sind in der Einzelwertanzeige gekennzeichnet.
- Regen wird aus nichtnegativen Differenzen des Monatszählers, ersatzweise des Tageszählers in derselben Kalenderperiode berechnet. Die Intensität in mm/h wird ausschließlich separat angezeigt und niemals in eine angebliche Regenmenge umgerechnet.
- Rückwärts springende Zähler, fehlende Zähler, Abstände über 20 Minuten und nicht rekonstruierbare Monatswechsel bleiben unbekannt. Positive Intervalle, die eine Stunden-/Tages-/Fenstergrenze überschreiten, werden vorsichtig ausgelassen, statt die Menge zeitlich zu erfinden. Gemessene Null-Differenzen können grenzübergreifend als trockenes Intervall berücksichtigt werden.
- Folglich können Regenmengen auch bei regelmäßigen Messungen **Teilsummen** sein, insbesondere bei nicht exakt zur vollen Stunde gemessenen positiven Intervallen. Die Oberfläche bezeichnet sie als „Erfasste Teilmenge“. Die genaue Niederschlagssumme ist aus den vorhandenen Zählerständen in diesen Fällen nicht bestimmbar.
- 24 Stunden: Stundenbalken. 168 Stunden: Balken nach Berliner Kalendertagen; reale Tageslängen sind bei Zeitumstellungen 23 bzw. 25 Stunden. Ein rollierender Zeitraum berührt häufig acht Kalendertage. Angeschnittene Tage und Tage mit Lücken erhalten `*`.
- Wochenmittel: erfasste Regenmenge geteilt durch sieben (mm pro 24 Stunden); bei Teilsummen gilt auch dieses Mittel ausschließlich für den erfassten Anteil.
- Beide Diagramme verwenden dieselbe Zeitabbildung und identische Beschriftungen. Auf schmalen Bildschirmen wird in der Wochenansicht nur jede zweite Tagesbeschriftung ausgegeben.
- Einzelwerte: Mouseover, Antippen und Pfeiltasten; Home/End springen zum Anfang/Ende. Gefühlt wird nur angezeigt, wenn tatsächlich vorhanden.
- Der aktuelle Temperaturwert ist derselbe Stationswert wie in der vorhandenen Karte und trägt seinen Messzeitpunkt. Alte Messungen werden im Verlauf nicht auf den heutigen Tag verschoben.

`app.js` lädt für den Verlauf die betroffenen Berliner Monatsarchive mit. Der Umschalter benötigt keinen Netzwerkabruf. Die bestehende Aktualisierung lädt bei sichtbarer App alle zehn Minuten sowie bei Rückkehr zur App auch die Stationsarchive neu. Manuelles Aktualisieren verwendet denselben Ablauf. Bereits vorhandene Messungen bleiben bei Abruffehlern erhalten.

## 4. Responsive Darstellung und tatsächlich durchgeführte Tests

Durchgeführt am 25.11.2026, lokal auf Windows:

| Prüfung | Ergebnis |
| --- | --- |
| Vorhandene Tests vor Änderungen: `node scripts/test-ui.cjs` | Bestanden |
| Erweiterte Regression: `node scripts/test-ui.cjs` | Bestanden; bestehende Tachos, Navigation, Regler, Wind, Mond, Pegel, Prognose und Service Worker; zusätzlich Umschalter ohne Abrufe, Zehn-Minuten-Aktualisierung, Pause bei ausgeblendeter App und Neuladen bei Rückkehr |
| `node scripts/test-history.cjs` | Bestanden: 24/168 Stunden, Stundenmittel, rohe Extremwerte, Regenmengen/Mittel, fehlende Werte, Duplikate, Zählerrücksetzungen, Monatswechsel und beide Zeitumstellungen |
| `python -m unittest discover -s scripts -p 'test_*.py'` | 5 Tests bestanden: reale Dateischreibvorgänge in temporären Verzeichnissen, identische UTC-Zeitpunkte, Berliner Monatsgrenzen, doppelte Herbststunde, ungültige Daten, Statistikperioden, vollständiger Sammlerablauf mit simulierten API-Antworten und Abbruch bei fehlender Stationszeit |
| `node --check` für `app.js`, `history.js`, `sw.js`, `scripts/serve-qa.cjs` | Bestanden |
| `git diff --check` | Bestanden |
| Edge, 320 / 360 / 390 / 412 / 768 / 1440 CSS-Pixel, jeweils hell und dunkel | Alle 12 Kombinationen bestanden: kein horizontaler Überlauf, gleiche Kartenbreite, korrekte Position, zwei SVGs, synchroner Umschalter, Mittelanzeige, Tastatur- und synthetische Touch-Abfrage, keine JS-Fehler |
| Sichtprüfung im Edge-Fenster | Mobile Karten und Desktop/Dark-Mode-Diagramme kontrolliert |
| Zusätzliche YAML-Parserprüfung | Nicht ausgeführt: lokales Python hat kein `yaml`-Modul; versuchter Aufruf meldete `ModuleNotFoundError`. Workflow wurde gelesen, aber nicht auf GitHub ausgeführt. |

Die Browserprüfung verwendet echte lokale Archivdaten mit einer **nur im Test gesetzten Uhrzeit** auf dem letzten archivierten Zeitpunkt. Externe API-Anfragen sind im Browsertest absichtlich deaktiviert. Es wurden weder künstliche Messwerte in `data/` geschrieben noch die vorhandenen JSON-Dateien verändert. Die Rechentests verwenden ausdrücklich isolierte Testdatensätze für Grenzfälle.

Reproduzieren: `node scripts/serve-qa.cjs` starten und `http://127.0.0.1:8765/scripts/test-browser.html` öffnen. „Prüfbericht“ enthält die Ergebnisse. Der lokale Server hält den JSON-Bericht zusätzlich unter `/qa/result` bereit; eine lokale Kopie liegt in der ignorierten `qa-results.json`. Die Seite testet echte Browserlayouts über unterschiedlich breite Iframes; sie ersetzt keine Geräteprüfung. Der Preview-Server bindet ausschließlich an `127.0.0.1`.

## 5. Abschlussprüfung, Dateien und Betrieb

### Geändert

| Datei | Änderung |
| --- | --- |
| `index.html` | Gemeinsame Verlaufskarte nach dem aktuellen Messzeitpunkt, vor allen weiteren Karten; zwei Zeiträume; `history.js`; Assetversion 31 |
| `styles.css` | Kompakte Karte, flexible SVG-Breiten, Touchflächen ab 44 Pixel, kleine Displays und Dark Mode |
| `app.js` | Verlauf aus vorhandenen Archiven, Synchronisierung und automatische Stationsaktualisierung |
| `sw.js` | Cacheversion `bresser-v31`, neues Skript im Offline-App-Shell; Messdaten bleiben vom Cache ausgeschlossen |
| `scripts/collect.py` | UTC, persistente idempotente Archivierung, Validierung, atomare Dateiersetzung |
| `.github/workflows/weather-update.yml` | Automatische Python-/JS-Tests und optionaler Pages-Deploy nach dem Sammeln |
| `scripts/test-ui.cjs` | Integration und Regression einschließlich Verlauf und Aktualisierung |
| `README.md` | Verweis auf diese Dokumentation |

### Neu

`history.js`, `scripts/test-history.cjs`, `scripts/test_collect.py`, `scripts/test-browser.html`, `scripts/serve-qa.cjs`, `.gitignore`, `WETTERVERLAUF.md`. `.gitignore` schließt Python-Cachedateien und den lokalen Prüfbericht aus. Keine Änderung an Messdaten, Manifest, Bildern oder bestehenden Bibliothekslizenzen.

### Wiederherstellung und Commits

Der lokale Branch `feature/wetterverlauf` enthält den vollständigen Ausgangsstand `0bea96f` und getrennte Schritte:

1. `b719026`: Bestandsanalyse.
2. `d64e399`: Historische Speicherung.
3. `8a13f8b`: Diagramme und Umschalter.
4. `963de45`: Responsive Tests, Korrekturen und vorbereiteter Workflow.
5. Abschließender Commit: Dokumentation und ergänzende Sammlerprüfung.

Mit `git log --oneline` und `git show <Commit>` lassen sich alle Schritte prüfen. Zum Wiederherstellen einzelner Schritte kann nach Sicherung eigener Änderungen `git revert <Commit>` verwendet werden; der Ausgangsstand ist außerdem vollständig über `git show 0bea96f:<Datei>` lesbar. Die Arbeitskopie `../github-publish` und deren produktiver Branch bleiben unberührt. Es erfolgte kein Push und kein Deploy.

### Manuelle GitHub-Einstellungen nach Review und Übernahme

1. Geprüfte Änderungen in das tatsächliche Repository übernehmen. Für geplante Läufe muss der Workflow auf dessen Standardbranch vorhanden und GitHub Actions aktiviert sein. Der Workflow benötigt `contents: write`; Branchschutz muss dem bereits bestehenden Datenbot das Schreiben erlauben.
2. Unter **Settings → Pages → Source** „GitHub Actions“ wählen, wenn der vorbereitete Deploy genutzt werden soll. Unter **Settings → Secrets and variables → Actions → Variables** die Repository-Variable **`WEATHER_PAGES_DEPLOY` auf `true`** setzen. Standardmäßig ist dieser Deploy deaktiviert. Keine neuen Secrets nötig.
3. Die Umgebung `github-pages` auf den Standardbranch begrenzen. Erforderliche Freigaben dort können den unbeaufsichtigten Zehn-Minuten-Deploy anhalten. Der Deploy-Job fordert nur `pages: write` und `id-token: write` an und veröffentlicht ausschließlich App-Dateien, Assets und Daten.
4. „BRESSER Wetterdaten archivieren“ einmal manuell starten. Danach ein neuer UTC-Messwert im Monatsarchiv, passendes `latest.json`, erfolgreicher Testlauf und Pages-Deploy prüfen. Nach einem weiteren tatsächlich neuen Stationswert die automatische Ergänzung kontrollieren. GitHub kann Cronläufe verzögern; ein Stationswert wird auch bei wiederholtem Abruf nur einmal gespeichert.
5. Auf der veröffentlichten URL die aktuellen JSON-Dateien und den Wechsel von Cache v30 auf v31 kontrollieren. PWA anschließend schließen und neu öffnen; Installations- und Offline-App-Shell auf einem echten iPhone und Galaxy S23 testen. Der Service Worker speichert Stationsdaten weiterhin nicht offline; nach vollständigem Offline-Neustart steht deshalb keine dauerhaft gecachte Messhistorie zur Verfügung.

Hintergrund: Ein mit `GITHUB_TOKEN` geschriebener Commit startet keinen branchbasierten Pages-Build. Der vorbereitete optionale Deploy veröffentlicht deshalb das nach dem Sammellauf erzeugte Pages-Artefakt direkt. [GitHub-Dokumentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

### Verbleibende Einschränkungen

- Das mitgelieferte Archiv enthält nur zwei tatsächliche Messungen vom 23.11.2026. Eine vollständige Sieben-Tage-Historie entsteht erst durch erfolgreiche weitere Sammelläufe. Ältere Messungen wurden nicht nachgeladen oder erfunden.
- Persistenz und automatische Clientaktualisierung sind lokal getestet. Live-Weathercloud-Zugriff, geplanter GitHub-Lauf und Pages-Deploy wurden nicht ausgeführt; die produktive Wirkung ist erst nach Übernahme und Einrichtung nachweisbar.
- Echte Touchgesten/Skalierung auf Galaxy S23 und iPhone, Safari, PWA-Installation, Offline-Neustart und produktiver Cachewechsel müssen noch manuell geprüft werden. Die getesteten CSS-Breiten allein belegen diese Geräteeigenschaften nicht.
- Regenmengen bleiben bei nicht eindeutig zuordenbaren Intervallen Teilsummen; der Verlauf behauptet hierfür keine vollständige Menge. Der vorhandene Weathercloud-Client 0.1.5 bleibt unverändert; seine [Feld- und Einheitenbeschreibung](https://pypi.org/project/weathercloud/0.1.5/) wurde geprüft. Das öffentliche, inoffizielle Weathercloud-Interface kann sich ändern.
