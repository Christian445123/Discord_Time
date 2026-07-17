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
};

if (config.stammspielerHours >= config.ehrenmitgliedHours) {
  throw new Error('STAMMSPIELER_HOURS muss kleiner als EHRENMITGLIED_HOURS sein.');
}

module.exports = config;
