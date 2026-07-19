const mysql = require('mysql2/promise');
const config = require('./config');

const TABLE = 'playtime_stats';

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.dbHost,
      port: config.dbPort,
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

/**
 * Legt die Tabelle fuer die Spielzeit-Momentaufnahme an, falls sie noch nicht
 * existiert. Wird einmal beim Start aufgerufen, sofern DB_ENABLED=true ist.
 */
async function initDb() {
  if (!config.dbEnabled) return;

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      discord_id VARCHAR(32) NOT NULL PRIMARY KEY,
      discord_tag VARCHAR(64) NOT NULL,
      hours DECIMAL(10,2) NOT NULL,
      tier VARCHAR(32) NOT NULL,
      delta_hours DECIMAL(10,2) NULL,
      updated_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('[db] Verbindung hergestellt, Tabelle "playtime_stats" bereit.');
}

/**
 * Schreibt die aktuelle Spielzeit-Momentaufnahme (ein Datensatz pro Spieler)
 * in die Datenbank. Bestehende Zeilen (gleiche discord_id) werden dabei
 * aktualisiert (Upsert) statt dupliziert.
 */
async function upsertPlaytimeSnapshot(details) {
  if (!config.dbEnabled || !details.length) return;

  const now = new Date();
  const rows = details.map((d) => [d.id, d.tag, d.hours, d.tier, d.deltaHours ?? null, now]);

  await getPool().query(
    `INSERT INTO ${TABLE} (discord_id, discord_tag, hours, tier, delta_hours, updated_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       discord_tag = VALUES(discord_tag),
       hours = VALUES(hours),
       tier = VALUES(tier),
       delta_hours = VALUES(delta_hours),
       updated_at = VALUES(updated_at)`,
    [rows]
  );
}

module.exports = { initDb, upsertPlaytimeSnapshot };
