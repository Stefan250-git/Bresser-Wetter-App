# BRESSER Wetter zuhause – iOS & Android PWA

Mobile App für die öffentliche Weathercloud-Station `d1073176104` (46499, NRW). Station: https://app.weathercloud.net/d1073176104

## Enthalten
- Aktuelle und historische Messwerte: Temperatur, bedingte gefühlte Temperatur, Niederschlagsintensität, Tages-/Wochen-/Monatssummen, Vorjahresvergleich, heutiger Wind und Richtung
- Datumsauswahl und Stundenregler von 00:00 bis zum Tagesende (24:00), standardmäßig 12:00 Uhr
- Regler mit 2 Sekunden Haltezeit bei Berührung/Maus und großer Stundenanzeige oberhalb des Fingers; Tastaturbedienung bleibt direkt möglich
- Drei-Tage-Ausblick über Open-Meteo, getrennt von eigenen Stationsmessungen
- PWA zur Installation auf iOS und Android
- Archivsammler als GitHub Action alle 10 Minuten (Best-Effort, nicht minutengenau garantiert)

## Installation über GitHub Pages
1. Neues GitHub-Repository erstellen; **alle Dateien inklusive `.github/workflows/collect.yml`** in den Repository-Stamm laden.
2. In `Settings > Pages` die Veröffentlichung aus dem Branch `main`, Ordner `/ (root)` aktivieren.
3. In `Settings > Actions > General > Workflow permissions` Schreibrechte (`Read and write permissions`) für Workflows erlauben, wenn erforderlich.
4. `Actions > BRESSER Wetterdaten archivieren > Run workflow` einmal manuell ausführen.
5. Unter `Actions` prüfen, ob der Abruf erfolgreich ist und `data/latest.json` reale Werte enthält. Erst dann zeigt die App Stationsmessungen.
6. Auf dem iPhone in Safari `Teilen > Zum Home-Bildschirm`, auf Android in Chrome `Installieren` bzw. `Zum Startbildschirm hinzufügen` wählen.

## Einschränkungen / technische Genauigkeit
- Weathercloud bietet **keine offizielle öffentliche Abruf-API**. Der Sammler verwendet die inoffizielle, rückentwickelte Open-Source-Bibliothek `weathercloud` (MauroDruwel), deren Schnittstellen sich ändern können. Ohne erfolgreiche Action bleibt das Dashboard leer.
- GitHub Actions `schedule` kann verzögert werden oder einzelne Läufe auslassen. Verpasste Werte werden nicht erfunden. Historie entsteht ab dem ersten erfolgreichen Sammellauf.
- Für jede der gewählten vollen Stunden wird eine Messung maximal 20 Minuten entfernt gewählt; sonst erscheint eine Lücke.
- Historische „gefühlte Temperatur“ nur, wenn Weathercloud Windchill bei kalten oder Heatindex bei warmen Bedingungen liefert; andernfalls `—`. Eine allgemein gültige gefühlte Temperatur kann damit nicht immer bereitgestellt werden.
- „Regen aktuell“ ist Niederschlagsintensität in mm/h, nicht kumulierte mm. Tages-/Monatssummen kommen von den Weathercloud-Statistiken. Für die Wochensumme müssen für jeden Tag dieser Woche aufgezeichnete Tageswerte vorhanden sein; bei fehlenden Tagen erscheint `—`.
- Bei noch laufenden Tagen sind Summen Zwischenstände. Ein Vorjahresvergleich zeigt nur echte Vorjahres-Stationswerte, keine modellierten Daten.
- Wind wird in der Historienansicht **ausschließlich für den heutigen Tag** eingeblendet.
- Prognose stammt aus Open-Meteo-Modellwerten (nicht aus der Wetterstation). Die Temperaturtrend-Einteilung verwendet ±2 °C, erhöhte Windböen ab 50 km/h. Das ist **keine amtliche Sturmwarnung**.
- Die in Weathercloud öffentlich sichtbaren Stationskoordinaten sind ca. 51.720833 N, 6.588056 E. Wer seinen genauen Standort nicht veröffentlichen möchte, sollte dies beachten.
- Wettercloud-Felder können abhängig vom Sensor/Account fehlen. Die Werte werden niemals durch erfundene Zahlen ersetzt.
- Die freien Open-Meteo-Endpunkte haben Nutzungsbedingungen; vor kommerziellem Betrieb die Lizenzbedingungen prüfen.

## Lokaler Test
`python -m http.server 8000` im Projektverzeichnis, dann http://localhost:8000 öffnen. Ohne laufenden Datensammler werden lediglich die Vorhersagen angezeigt.

## Aktuelles Wettersymbol

Das Symbol in der aktuellen Temperaturkarte verwendet frische Stationsdaten für Regen und Wind und ergänzend die aktuellen WMO-Wettercodes von [Open-Meteo](https://open-meteo.com/en/docs) für Sonne, Wolken, Schnee, Nebel und Gewitter. Quelle und Zeitpunkt stehen im Tooltip und im zugänglichen Namen. Daten älter als eine Stunde werden nicht als aktuelles Wetter verwendet. Bei trockener Station und modelliertem Regen lautet die Anzeige „Regen möglich“. Schnee wird nicht allein aus einer niedrigen Temperatur abgeleitet. Nachts erscheint bei klarem Himmel ein Mond.

Aktuelles Wetter und Ausblick nutzen eine gemeinsame Anfrage, werden bei manueller Aktualisierung sowie alle zehn Minuten bei sichtbarer App erneuert. Animationen beachten die Systemeinstellung für reduzierte Bewegung.

## Bedienlogik prüfen

`node scripts/test-ui.cjs` prüft ohne zusätzliche Pakete den Stundenregler, Datumsnavigation, Messwertzuordnung, Offline-Aktualisierung, Windanzeige, Prognose und Service-Worker-Versionen. Der Test verwendet eine simulierte Oberfläche; die visuelle Darstellung und Touchbedienung müssen zusätzlich im Browser bzw. auf dem Smartphone geprüft werden.

## Quellen
- https://weathercloud.net/de/faq (kein offizieller Abruf-API, 10-Minuten-Intervall)
- https://github.com/MauroDruwel/Weathercloud (inoffizieller Python-Client)
- https://open-meteo.com/en/docs (Forecast API)
