const { loadPlaytimeData } = require('./playtimeStore');
const { getLink } = require('./linkStore');

const TIER_NONE = 'none';
const TIER_STAMMSPIELER = 'stammspieler';
const TIER_EHRENMITGLIED = 'ehrenmitglied';

function computeTier(hours, config) {
  if (hours >= config.ehrenmitgliedHours) return TIER_EHRENMITGLIED;
  if (hours >= config.stammspielerHours) return TIER_STAMMSPIELER;
  return TIER_NONE;
}

/**
 * Ermittelt die Spielzeit (in Minuten) eines Discord-Mitglieds:
 * 1. Direkt ueber einen "discord:" Identifier in der txAdmin playersDB
 *    (automatisch, sofern der Spieler seinen Discord im Spiel verknuepft hat).
 * 2. Fallback ueber eine manuelle Verknuepfung (/link), die auf eine
 *    FiveM-License in der playersDB verweist.
 * Gibt null zurueck, wenn fuer das Mitglied ueberhaupt keine Daten vorliegen.
 */
function resolveMinutesForMember(discordId, playtimeData) {
  if (playtimeData.byDiscordId.has(discordId)) {
    return playtimeData.byDiscordId.get(discordId);
  }
  const linkedLicense = getLink(discordId);
  if (linkedLicense && playtimeData.byLicense.has(linkedLicense)) {
    return playtimeData.byLicense.get(linkedLicense);
  }
  return null;
}

/**
 * Liest die playersDB neu ein und gleicht fuer alle Mitglieder der Guild
 * die Rollen Stammspieler/Ehrenmitglied mit ihrer tatsaechlichen Spielzeit ab.
 * Mitglieder, fuer die keine Spielzeit-Daten gefunden werden (weder automatisch
 * noch per manuellem Link), werden nicht angefasst.
 */
async function syncGuildRoles(guild, config) {
  const playtimeData = loadPlaytimeData(config);

  if (config.debug) {
    console.log(`[playtime] ${playtimeData.totalPlayers} Spieler aus playersDB geladen.`);
    console.log(`[playtime] ${playtimeData.byDiscordId.size} ueber Discord-ID, ${playtimeData.byLicense.size} ueber License indiziert.`);
    if (playtimeData.debugSample) {
      console.log('[playtime] Beispiel-Spielerobjekt (erstes gefundenes):', playtimeData.debugSample);
    }
    for (const err of playtimeData.errors) console.warn(`[playtime] ${err}`);
  } else if (playtimeData.errors.length) {
    for (const err of playtimeData.errors) console.warn(`[playtime] ${err}`);
  }

  await guild.members.fetch();

  const summary = {
    checked: 0,
    withData: 0,
    updated: 0,
    errors: [],
    changes: [],
    details: [],
  };

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    summary.checked += 1;

    const minutes = resolveMinutesForMember(member.id, playtimeData);
    if (minutes === null) continue;
    summary.withData += 1;

    const hours = minutes / 60;
    const tier = computeTier(hours, config);
    summary.details.push({ id: member.id, tag: member.user.tag, hours, tier });

    const shouldHaveStammspieler = tier === TIER_STAMMSPIELER || (tier === TIER_EHRENMITGLIED && !config.exclusiveRoles);
    const shouldHaveEhrenmitglied = tier === TIER_EHRENMITGLIED;

    const hasStammspieler = member.roles.cache.has(config.roleStammspielerId);
    const hasEhrenmitglied = member.roles.cache.has(config.roleEhrenmitgliedId);

    try {
      if (shouldHaveStammspieler && !hasStammspieler) {
        await member.roles.add(config.roleStammspielerId);
        summary.updated += 1;
        summary.changes.push(`+Stammspieler: ${member.user.tag} (${hours.toFixed(1)}h)`);
      } else if (!shouldHaveStammspieler && hasStammspieler) {
        await member.roles.remove(config.roleStammspielerId);
        summary.updated += 1;
        summary.changes.push(`-Stammspieler: ${member.user.tag} (${hours.toFixed(1)}h)`);
      }

      if (shouldHaveEhrenmitglied && !hasEhrenmitglied) {
        await member.roles.add(config.roleEhrenmitgliedId);
        summary.updated += 1;
        summary.changes.push(`+Ehrenmitglied: ${member.user.tag} (${hours.toFixed(1)}h)`);
      } else if (!shouldHaveEhrenmitglied && hasEhrenmitglied) {
        await member.roles.remove(config.roleEhrenmitgliedId);
        summary.updated += 1;
        summary.changes.push(`-Ehrenmitglied: ${member.user.tag} (${hours.toFixed(1)}h)`);
      }
    } catch (err) {
      summary.errors.push(`${member.user.tag}: ${err.message}`);
    }
  }

  summary.details.sort((a, b) => b.hours - a.hours);

  return summary;
}

module.exports = {
  syncGuildRoles,
  resolveMinutesForMember,
  computeTier,
  TIER_NONE,
  TIER_STAMMSPIELER,
  TIER_EHRENMITGLIED,
};
