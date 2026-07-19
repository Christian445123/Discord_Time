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
      connectTimeout: 5000,
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

  await getPool().query(`
    CREATE TABLE IF NOT EXISTS login_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      discord_id VARCHAR(32) NOT NULL,
      discord_tag VARCHAR(64) NOT NULL,
      ip VARCHAR(64),
      logged_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('[db] Verbindung hergestellt, Tabellen bereit.');
}

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

async function logLogin(discordId, discordTag, ip) {
  if (!config.dbEnabled) return;
  await getPool().query(
    'INSERT INTO login_log (discord_id, discord_tag, ip, logged_at) VALUES (?, ?, ?, NOW())',
    [discordId, discordTag, ip || null]
  );
}

async function getRecentLogins(limit = 50) {
  if (!config.dbEnabled) return [];
  const [rows] = await getPool().query(
    'SELECT discord_id, discord_tag, ip, logged_at FROM login_log ORDER BY logged_at DESC LIMIT ?',
    [limit]
  );
  return rows;
}

async function getAllPlayers() {
  if (!config.dbEnabled) return null;
  const [rows] = await getPool().query(
    `SELECT discord_id, discord_tag, hours, tier, delta_hours FROM ${TABLE} ORDER BY hours DESC`
  );
  return rows.map((r) => ({
    id: r.discord_id,
    tag: r.discord_tag,
    hours: parseFloat(r.hours),
    tier: r.tier,
    deltaHours: r.delta_hours !== null ? parseFloat(r.delta_hours) : null,
  }));
}

async function getPlayerByDiscordId(discordId) {
  if (!config.dbEnabled) return null;
  const [rows] = await getPool().query(
    `SELECT discord_id, discord_tag, hours, tier, delta_hours FROM ${TABLE} WHERE discord_id = ?`,
    [discordId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.discord_id,
    tag: r.discord_tag,
    hours: parseFloat(r.hours),
    tier: r.tier,
    deltaHours: r.delta_hours !== null ? parseFloat(r.delta_hours) : null,
  };
}

module.exports = { initDb, upsertPlaytimeSnapshot, getAllPlayers, getPlayerByDiscordId, logLogin, getRecentLogins };
