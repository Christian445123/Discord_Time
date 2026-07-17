const fs = require('fs');

/**
 * Liest eine oder mehrere txAdmin playersDB.json Dateien und baut daraus
 * Lookup-Tabellen fuer Spielzeit auf: einmal indiziert nach Discord-ID
 * (aus dem "discord:xxxx" Identifier, sofern der Spieler seinen Discord
 * in txAdmin verknuepft hat) und einmal nach FiveM-License (fuer den
 * manuellen /link Fallback).
 *
 * Minuten werden ueber mehrere Dateien hinweg pro Identifier aufsummiert,
 * falls mehrere Server-Profile ausgewertet werden.
 */
function loadPlaytimeData(config) {
  const byDiscordId = new Map();
  const byLicense = new Map();
  let totalPlayers = 0;
  let debugSample = null;
  const errors = [];

  for (const dbPath of config.playersDbPaths) {
    let raw;
    try {
      raw = fs.readFileSync(dbPath, 'utf8');
    } catch (err) {
      errors.push(`Konnte ${dbPath} nicht lesen: ${err.message}`);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      errors.push(`Konnte ${dbPath} nicht als JSON parsen: ${err.message}`);
      continue;
    }

    const players = Array.isArray(parsed?.players) ? parsed.players : Array.isArray(parsed) ? parsed : null;
    if (!players) {
      errors.push(`Unerwartetes Format in ${dbPath}: kein "players"-Array gefunden.`);
      continue;
    }

    for (const player of players) {
      totalPlayers += 1;
      if (config.debug && !debugSample) {
        debugSample = { source: dbPath, keys: Object.keys(player), sample: player };
      }

      const rawValue = Number(player[config.playtimeField]);
      if (!Number.isFinite(rawValue)) continue;

      const minutes = toMinutes(rawValue, config.playtimeUnit);

      const ids = Array.isArray(player.ids) ? player.ids : [];
      for (const id of ids) {
        if (typeof id === 'string' && id.startsWith('discord:')) {
          const discordId = id.slice('discord:'.length);
          byDiscordId.set(discordId, (byDiscordId.get(discordId) || 0) + minutes);
        }
      }

      if (typeof player.license === 'string' && player.license) {
        const license = normalizeLicense(player.license);
        byLicense.set(license, (byLicense.get(license) || 0) + minutes);
      }
    }
  }

  return { byDiscordId, byLicense, totalPlayers, debugSample, errors };
}

function toMinutes(value, unit) {
  if (unit === 'seconds') return value / 60;
  if (unit === 'hours') return value * 60;
  return value;
}

function normalizeLicense(license) {
  return license.startsWith('license:') ? license.slice('license:'.length) : license;
}

module.exports = { loadPlaytimeData, normalizeLicense };
