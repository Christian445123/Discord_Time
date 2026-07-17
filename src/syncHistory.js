const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'lastSync.json');

/**
 * Speichert die Spielzeit (Stunden) je Discord-ID aus dem jeweils letzten
 * Sync-Durchlauf, damit beim naechsten Durchlauf ermittelt werden kann, wie
 * viel Spielzeit seither dazugekommen ist.
 */
function loadLastHours() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveLastHours(hoursById) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(hoursById, null, 2), 'utf8');
}

module.exports = { loadLastHours, saveLastHours };
