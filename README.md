# 🏓 Tischtennis Hobbyturnier-Manager

Eine webbasierte Software zur flexiblen Organisation und Durchführung von Tischtennis-Turnieren für **2er-Mannschaften** im **Schweizer System** mit intuitiver Ergebniserfassung, Beamer-Monitoren, Buchholz-Feinwertung und optionaler KO-Endrunde.

---

## ✨ Features im Überblick

### 1. Turniermodus & Regeln
- **2er-Mannschaften:** Jedes Team besteht aus 2 festen Spielern (Position 1 & 2).
- **Vorrunde (Schweizer System):**
  - **4 Einzel pro Begegnung:**
    1. Überkreuz: Team A Pos. 1 vs. Team B Pos. 2
    2. Überkreuz: Team A Pos. 2 vs. Team B Pos. 1
    3. Direkt: Team A Pos. 1 vs. Team B Pos. 1
    4. Direkt: Team A Pos. 2 vs. Team B Pos. 2
  - **Feste Aufstellung:** Spieler 1 und 2 sind fest beim Team hinterlegt – kein zeitaufwändiges Erfassen der Aufstellung vor jedem Spiel.
  - **Wertung:** Direkte Zählung gewonnener Einzelspiele (z. B. 4:0, 3:1, 2:2). Unentschieden möglich.
  - **Tie-Breaker:** 1. Gewonnene Spielpunkte, 2. Buchholz-Wertung (Gegnerstärke), 3. Satzdifferenz.
  - **Rematches ausgeschlossen:** Ein Team spielt in der Vorrunde nie zweimal gegen denselben Gegner.
  - **Freilos (BYE):** Automatisches Freilos bei ungerader Teamanzahl mit Punktgutschrift.
  - **Variable Rundenanzahl:** Runden können spontan während des Turniers angepasst oder beendet werden.

### 2. Optionale KO-Endrunde
- **Qualifikation:** Top 4 (Halbfinale) oder Top 8 (Viertelfinale) aus der Schweizer-Tabelle wählbar.
- **Entscheidung:** Vorzeitiges Match-Ende bei 3 Einzelsiegen ("Best of 5 Matches" - 3:0 oder 3:1).
- **Entscheidungsdoppel:** Bei 2:2-Gleichstand nach allen 4 Einzeln wird automatisch das 5. Spiel (Doppel A vs. Doppel B) für die Entscheidung (3:2) freigeschaltet.

### 3. Smarte Ergebniserfassung
- **Authentifizierung ohne Account:** Jede Begegnung kann einfach per 4-stelliger PIN (oder QR-Code) aufgerufen und erfasst werden.
- **Eingabe per Tipp:**
  - Pro Einzel wird nur der Endstand in Sätzen erfasst – ein Tipp auf z. B. `3:1` oder `2:3` speichert das Ergebnis. Angeboten werden nur Ergebnisse, die im eingestellten Satzmodus (Best of 3 / Best of 5) möglich sind.
  - Falsch getippt? Einfach das richtige Ergebnis antippen oder das Einzel zurücksetzen.
  - Manuelle Hallen-Tischverwaltung: Tische werden flexibel vor Ort in der Halle belegt.

### 4. Hallen-Monitor & Großanzeige (Beamer / TV)
- **Split-Screen & Auto-Carousel:**
  - **Live-Begegnungen:** Anzeige aller aktiven und abgeschlossenen Spiele mit Zwischenständen in Echtzeit (WebSocket-gestützt).
  - **Tabelle:** Schweizer Gesamttabelle mit Buchholz-Feinwertung.
  - **Ergebnis-Ticker:** Durchlaufende Anzeige der beendeten Spiele.
  - **KO-Turnierbaum:** Graphische Baumansicht der Endrunde.
  - Konfigurierbarer automatischer Wechsel (z. B. alle 15 Sekunden) oder geteilter Bildschirm.

### 5. Organisation & Backup
- **CSV-Import & Export:** Schneller Import von Teams via CSV sowie vollständiger CSV-Export der Abschlusstabelle.
- **Druckbare Spielzettel:** Standardisierte DIN A4 Spielberichtsbögen für die Begegnungen als Papier-Backup.
- **Paarungstausch:** Die Turnierleitung kann vor Spielbeginn Paarungen manuell anpassen.

---

## 🚀 Schnellstart

### Option A: Lokal starten (macOS / Linux)

Voraussetzungen: Python 3.9+ und Node.js 18+.

```bash
# Repository klonen oder in den Projektordner wechseln
cd tt-hobbyturnier

# Turniermodus: installiert Abhängigkeiten bei Bedarf, baut das Frontend und startet den Server
./run.sh
```

- 🏓 **Turnier:** **[http://localhost:8000](http://localhost:8000)** – das Skript zeigt zusätzlich die Adresse im Netzwerk an, über die Handys, Beamer und Tablet den Server erreichen.

Für die Entwicklung gibt es `./dev.sh`: Backend mit Auto-Reload und Vite mit Live-Reload (HMR) auf **[http://localhost:5173](http://localhost:5173)**. Nicht am Turniertag verwenden – jede gespeicherte Datei startet das Backend neu und trennt alle Live-Verbindungen.

---

### Option B: Mit Docker / Docker-Compose

```bash
docker compose up --build -d
```

Der Server ist danach auf Port 8000 verfügbar. Die Spieldaten liegen im Docker-Volume `tt-data`. Mit `TT_ADMIN_PIN=...` in der Umgebung bekommt ein neues Turnier diese Admin-PIN statt `admin123`.

### Option C: Auf einem Server unter eigener Subdomain

Push auf `main` geht auf Staging, ein Release per release-please auf Produktion, hinter dem gemeinsamen Traefik auf dem Hetzner-Server, siehe [`deploy/README.md`](deploy/README.md).

---

## 🧪 Tests ausführen

Das Backend verfügt über eine vollständige automatisierte Testsuite:

```bash
PYTHONPATH=. backend/venv/bin/pytest backend/tests/ -v
```

Getestet werden:
- Schweizer-System-Paarungen und strikter Ausschluss von Rematches
- Buchholz-Zahlenberechnung & Tie-Breaker
- Freilos-Logik (BYE) bei ungerader Mannschaftszahl
- KO-Endrunden-Fortschritt & Entscheidungsdoppel bei 2:2
- End-to-End API Lifecycle (Teams, Runden, Match-PINs, Hallenmonitore)

### E2E-Test (kompletter Turniertag im Browser)

```bash
cd frontend && npm run test:e2e
```

Playwright spielt zwei Turniere mit je 17 Teams und 7 Runden Schweizer System komplett über die Oberfläche durch, eines davon mit KO Top 8 bis zum Finale. Ein weiteres Szenario prüft die QR-Codes: Hallen-Monitor und Spielzettel zeigen auf die LAN-Adresse, und der Code vom Spielzettel öffnet am Handy direkt die Begegnung zur Ergebniseingabe. Teamnamen, Spielernamen, Aufstellungen und Ergebnisse sind zufällig; nach jeder Runde wird die Tabelle gegen die selbst mitgerechneten Werte geprüft. Der Seed steht in der Ausgabe, `E2E_SEED=<seed> npm run test:e2e` spielt einen Lauf exakt nach.

Screenshots (Tabelle und Rundenergebnisse nach jeder Runde, bei Fehlern zusätzlich Screenshot und Trace) landen in `frontend/e2e-results/`, der HTML-Report unter `frontend/e2e-results/report`. In CI hängen sie als Artifact `e2e-results` am Lauf. Der Test nutzt eine eigene Datenbank (`e2e_turnier.db`) auf Port 8001.

---

## 📱 Navigation der Software

- 📊 **Hallen-Monitor (`/`):** Für Beamer / Fernseher in der Halle (mit Vollbildmodus und Live-Ticker).
- 🏓 **Ergebniserfassung:** Für Tablets/Smartphones zur schnellen Ergebniserfassung.
- 📈 **Tabelle:** Vollständige Schweizer Rangliste mit Buchholz-Feinwertung und CSV-Download.
- 🏆 **KO-Baum:** Visualisierung der Halbfinals und Finals mit Siegerweiterleitung.
- ⚙️ **Turnierleitung:** Anlegen von Teams, CSV-Import, Runden-Auslosung, PIN-Übersicht und Einstellungen.
- 🖨️ **Spielzettel:** Druckansicht für Spielberichtsbögen.

**Standard Admin-PIN:** `admin123`. Die Turnierleitung (und damit Runden auslosen, Teams und Einstellungen ändern) ist nur mit der Admin-PIN zugänglich – vor dem Turnier unter „Einstellungen“ unbedingt ändern, sonst kann jeder im Turnier-WLAN sie öffnen. Die Ergebniseingabe bleibt bewusst für alle offen.
