require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Fehlende Umgebungsvariable: ${name}. Bitte in .env eintragen (siehe .env.example).`);
  }
  return value.trim();
}

function optionalInt(name, fallback) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Umgebungsvariable ${name} muss eine Zahl sein, ist aber "${raw}".`);
  }
  return parsed;
}

function optionalBool(name, fallback) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) return fallback;
  return ['true', '1', 'yes', 'ja'].includes(raw.trim().toLowerCase());
}

const playersDbPaths = required('PLAYERSDB_PATHS')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const playtimeUnit = (process.env.PLAYERSDB_PLAYTIME_UNIT || 'minutes').trim().toLowerCase();
if (!['minutes', 'seconds', 'hours'].includes(playtimeUnit)) {
  throw new Error('PLAYERSDB_PLAYTIME_UNIT muss "minutes", "seconds" oder "hours" sein.');
}

const webEnabled = optionalBool('WEB_ENABLED', false);
const webPort = optionalInt('WEB_PORT', 3000);
const webBaseUrl = (process.env.WEB_BASE_URL || `http://localhost:${webPort}`).trim().replace(/\/+$/, '');

const dbEnabled = optionalBool('DB_ENABLED', false);

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: required('DISCORD_GUILD_ID'),

  playersDbPaths,
  playtimeField: process.env.PLAYERSDB_PLAYTIME_FIELD || 'playTime',
  playtimeUnit,

  roleStammspielerId: required('ROLE_STAMMSPIELER_ID'),
  roleEhrenmitgliedId: required('ROLE_EHRENMITGLIED_ID'),

  stammspielerHours: optionalInt('STAMMSPIELER_HOURS', 170),
  ehrenmitgliedHours: optionalInt('EHRENMITGLIED_HOURS', 340),

  exclusiveRoles: optionalBool('EXCLUSIVE_ROLES', false),
  syncIntervalMinutes: optionalInt('SYNC_INTERVAL_MINUTES', 15),
  logChannelId: process.env.LOG_CHANNEL_ID ? process.env.LOG_CHANNEL_ID.trim() : null,
  debug: optionalBool('DEBUG', false),

  webEnabled,
  webPort,
  webBaseUrl,
  // Nur noetig, wenn WEB_ENABLED=true (fuer den Discord-OAuth2-Login des Webpanels).
  discordClientSecret: webEnabled ? required('DISCORD_CLIENT_SECRET') : (process.env.DISCORD_CLIENT_SECRET || '').trim(),
  sessionSecret: webEnabled ? required('SESSION_SECRET') : (process.env.SESSION_SECRET || '').trim(),
  // Rolle, deren Mitglieder im Webpanel den Team-Log-Bereich (alle Spieler + Zeiten) sehen duerfen.
  roleHighTeamId: webEnabled ? required('ROLE_HIGHTEAM_ID') : (process.env.ROLE_HIGHTEAM_ID || '').trim(),

  dbEnabled,
  // Nur noetig, wenn DB_ENABLED=true.
  dbHost: dbEnabled ? required('DB_HOST') : (process.env.DB_HOST || '').trim(),
  dbPort: optionalInt('DB_PORT', 3306),
  dbUser: dbEnabled ? required('DB_USER') : (process.env.DB_USER || '').trim(),
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: dbEnabled ? required('DB_NAME') : (process.env.DB_NAME || '').trim(),

  // Impressum / DSGVO
  legalName: (process.env.LEGAL_NAME || '').trim(),
  legalStreet: (process.env.LEGAL_STREET || '').trim(),
  legalCity: (process.env.LEGAL_CITY || '').trim(),
  legalEmail: (process.env.LEGAL_EMAIL || '').trim(),
  legalDiscord: (process.env.LEGAL_DISCORD || '').trim(),
  serverName: (process.env.SERVER_NAME || 'Vienna State RP').trim(),
};

if (config.stammspielerHours >= config.ehrenmitgliedHours) {
  throw new Error('STAMMSPIELER_HOURS muss kleiner als EHRENMITGLIED_HOURS sein.');
}

module.exports = config;
