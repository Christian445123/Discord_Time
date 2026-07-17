# FiveM Playtime Discord Bot

Discord-Bot fuer ViennaStateRP, der die Spielzeit von Spielern aus der txAdmin
`playersDB.json` ausliest und automatisch Rollen vergibt:

- **Stammspieler** ab `STAMMSPIELER_HOURS` Stunden (Standard: 170h)
- **Ehrenmitglied** ab `EHRENMITGLIED_HOURS` Stunden (Standard: 340h)

Der Abgleich laeuft automatisch alle `SYNC_INTERVAL_MINUTES` Minuten (Standard: 120 = alle 2 Stunden). Werte ab 60 werden intern auf volle Stunden gerundet, da das Cron-Minutenfeld nur Schritte bis 59 zulaesst.

## Wie die Spielzeit ermittelt wird

txAdmin speichert pro Server-Profil eine `playersDB.json` (i.d.R. unter
`<FXServer-Ordner>/txData/<profil>/data/playersDB.json`). Diese Datei enthaelt
pro Spieler u.a. die Gesamtspielzeit sowie die bekannten Identifier
(License, Discord, Steam, ...). Der Bot liest diese Datei direkt vom
Dateisystem — dafuer muss der Bot **auf demselben Rechner wie txAdmin laufen**
(oder Zugriff auf die Datei per Netzlaufwerk haben).

> txAdmin bietet keine stabile, oeffentlich dokumentierte REST-API fuer
> Spielzeit-Abfragen durch Drittanwendungen. Der Datei-Zugriff ist daher der
> zuverlaessigste Weg. Falls sich das Datenbank-Schema in eurer txAdmin-Version
> unterscheidet, koennt ihr `PLAYERSDB_PLAYTIME_FIELD` und
> `PLAYERSDB_PLAYTIME_UNIT` in der `.env` anpassen und mit `DEBUG=true`
> nachsehen, wie ein Spieler-Objekt in eurer Datei tatsaechlich aussieht
> (wird beim Sync in der Konsole ausgegeben).

## Zuordnung Discord-Account <-> FiveM-Spieler

Zwei Wege, kombiniert:

1. **Automatisch**: Wenn ein Spieler seinen Discord-Account in txAdmin
   verknuepft hat (z.B. ueber die txAdmin Account-Seite mit Discord-Login),
   landet ein `discord:<id>` Identifier in dessen `ids`-Array in der
   `playersDB.json`. Der Bot erkennt das automatisch, kein Zusatzschritt noetig.
2. **Manuell (Fallback)**: Falls kein Discord verknuepft ist, kann ein Admin
   per `/link @mitglied <license>` die FiveM-License manuell mit dem
   Discord-Account verknuepfen. Die License findet man in der `playersDB.json`
   (Feld `license`, ggf. mit `license:`-Praefix).

## Setup

### 1. Voraussetzungen

- Node.js 18 oder neuer
- Eine Discord-Application/Bot unter https://discord.com/developers/applications
  - Bot-Token erzeugen
  - Unter **Privileged Gateway Intents** den **Server Members Intent** aktivieren
  - Bot mit den Scopes `bot` und `applications.commands` in den Server einladen,
    Berechtigung **Manage Roles** geben
- Die Rolle des Bots muss in der Discord-Rollenhierarchie **oberhalb** der
  Rollen "Stammspieler" und "Ehrenmitglied" stehen, sonst kann er sie nicht vergeben.

### 2. Installation

```bash
npm install
cp .env.example .env
```

`.env` ausfuellen:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`
- `PLAYERSDB_PATHS`: Pfad(e) zur `playersDB.json`
- `ROLE_STAMMSPIELER_ID`, `ROLE_EHRENMITGLIED_ID`: Rollen-IDs (Rechtsklick auf
  Rolle in Discord -> ID kopieren, Entwicklermodus muss aktiv sein)
- Optional: Stunden-Schwellenwerte, Sync-Intervall, Log-Kanal anpassen

### 3. Slash-Commands registrieren

```bash
npm run deploy-commands
```

### 4. Bot starten

```bash
npm start
```

Der Bot fuehrt direkt nach dem Start einen ersten Abgleich durch und danach
automatisch alle `SYNC_INTERVAL_MINUTES` Minuten.

## Slash-Commands

| Befehl | Beschreibung | Berechtigung |
|---|---|---|
| `/playtime [mitglied]` | Zeigt Spielzeit & Fortschritt zur naechsten Rolle | Alle |
| `/top10` | Zeigt die Top 10 Spieler nach Spielzeit mit Platzierung | Alle |
| `/link @mitglied <license>` | Verknuepft Discord-Account manuell mit FiveM-License | Manage Roles |
| `/unlink @mitglied` | Entfernt manuelle Verknuepfung | Manage Roles |
| `/synctime` | Erzwingt sofortigen Rollen-Abgleich | Manage Roles |

## Log-Channel

Nach **jedem** Sync — egal ob automatisch (alle `SYNC_INTERVAL_MINUTES`) oder
manuell per `/synctime` — postet der Bot vollstaendig (nichts wird gekuerzt,
bei Bedarf auf mehrere Nachrichten aufgeteilt) in `LOG_CHANNEL_ID`:

1. eine Zusammenfassung als Embed (gepruefte Mitglieder, Mitglieder mit
   Spielzeit-Daten, Anzahl Rollenaenderungen/Fehler, Dauer des Sync-Durchlaufs,
   insgesamt seit dem letzten Sync neu hinzugekommene Spielzeit)
2. falls vorhanden: alle erkannten Setup-Probleme (siehe unten)
3. **alle** Rollen-Aenderungen dieses Durchlaufs (wer hat welche Rolle
   bekommen/verloren)
4. **alle** aufgetretenen Fehler (z.B. wenn eine Rolle bei einem einzelnen
   Mitglied nicht vergeben werden konnte)
5. **🎮 Aktive Spieler seit dem letzten Sync**: alle Spieler, deren Spielzeit
   sich seit dem letzten Durchlauf tatsaechlich erhoeht hat, sortiert nach
   groesstem Zuwachs zuerst - so seht ihr auf einen Blick, wer aktiv dabei ist
   und Zeiten sammelt (wer nicht in dieser Liste steht, hat seit dem letzten
   Sync nicht gespielt)
6. die vollstaendige, aktuelle Liste aller ausgelesenen Spieler: Spielzeit
   gesamt und individueller Zuwachs seit dem letzten Sync-Durchlauf je Spieler

Die Vergleichswerte fuer den Zuwachs werden in `data/lastSync.json` gespeichert.
Beim allerersten Sync gibt es noch keine Vergleichsbasis ("erster Sync").

### Wenn Rollen nicht vergeben werden

Der Bot prueft bei jedem Sync automatisch die haeufigsten Ursachen dafuer, dass
Rollen nicht vergeben werden koennen, und zeigt sie oben in der Zusammenfassung
als **"⚠️ Der Bot kann Rollen (teilweise) nicht vergeben"** an:

- Die Rolle mit der konfigurierten `ROLE_STAMMSPIELER_ID` / `ROLE_EHRENMITGLIED_ID` existiert nicht (mehr) auf dem Server.
- Dem Bot fehlt die Berechtigung "Rollen verwalten".
- **Am haeufigsten**: Die eigene Rolle des Bots steht in der Server-Rollen-Hierarchie
  nicht **oberhalb** von Stammspieler/Ehrenmitglied. Discord erlaubt es Bots
  grundsaetzlich nicht, Rollen zu vergeben, die auf gleicher Hoehe oder hoeher
  stehen als ihre eigene hoechste Rolle. Beheben: Server-Einstellungen ->
  Rollen -> die Bot-Rolle per Drag&Drop **ueber** Stammspieler und Ehrenmitglied
  ziehen.

Falls trotzdem ein einzelner Spieler keine Rolle bekommt, obwohl er/sie genug
Stunden hat: mit `/playtime @spieler` pruefen, welche Spielzeit der Bot fuer
diese Person tatsaechlich ausliest (haeufigster Grund: der Discord-Account ist
in txAdmin nicht mit dem Spieler verknuepft — dann hilft `/link`).

So ist immer nachvollziehbar, welche Spieler beim letzten Durchlauf erfasst wurden.

## Verhalten bei Ehrenmitglied

Standardmaessig (`EXCLUSIVE_ROLES=false`) behalten Ehrenmitglieder zusaetzlich
die Stammspieler-Rolle. Wer stattdessen moechte, dass die Stammspieler-Rolle
beim Aufstieg zu Ehrenmitglied automatisch entfernt wird, setzt
`EXCLUSIVE_ROLES=true`.

## Laufender Betrieb

Fuer Dauerbetrieb empfiehlt sich ein Prozess-Manager wie `pm2`:

```bash
npm install -g pm2
pm2 start src/index.js --name fivem-playtime-bot
pm2 save
```
