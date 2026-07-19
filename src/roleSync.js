const { PermissionFlagsBits } = require('discord.js');
const { loadPlaytimeData } = require('./playtimeStore');
const { getLink } = require('./linkStore');
const { loadLastHours, saveLastHours } = require('./syncHistory');
const { upsertPlaytimeSnapshot } = require('./db');

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
 * Prueft die haeufigsten Gruende, warum der Bot Rollen NICHT vergeben kann,
 * bevor ueberhaupt ein Mitglied durchgegangen wird: Rolle existiert nicht
 * (mehr), Bot hat keine "Rollen verwalten"-Berechtigung, oder die Bot-Rolle
 * steht in der Rollen-Hierarchie nicht oberhalb der Ziel-Rolle (Discord
 * erlaubt es Bots grundsaetzlich nicht, Rollen zu vergeben, die gleich hoch
 * oder hoeher stehen als ihre eigene hoechste Rolle).
 */
function checkRoleSetup(guild, config) {
  const issues = [];
  const stammRole = guild.roles.cache.get(config.roleStammspielerId);
  const ehrenRole = guild.roles.cache.get(config.roleEhrenmitgliedId);

  if (!stammRole) {
    issues.push(`Rolle fuer ROLE_STAMMSPIELER_ID (${config.roleStammspielerId}) existiert auf diesem Server nicht.`);
  }
  if (!ehrenRole) {
    issues.push(`Rolle fuer ROLE_EHRENMITGLIED_ID (${config.roleEhrenmitgliedId}) existiert auf diesem Server nicht.`);
  }

  const botMember = guild.members.me;
  if (!botMember) {
    issues.push('Konnte das eigene Bot-Mitglied auf dem Server nicht ermitteln.');
    return issues;
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    issues.push('Dem Bot fehlt die Berechtigung "Rollen verwalten" (Manage Roles).');
  }

  const botHighest = botMember.roles.highest;
  if (stammRole && botHighest.comparePositionTo(stammRole) <= 0) {
    issues.push(
      `Die hoechste Bot-Rolle ("${botHighest.name}") steht in der Rollen-Hierarchie nicht oberhalb von "${stammRole.name}" - der Bot kann diese Rolle daher nicht vergeben. Bot-Rolle in den Server-Einstellungen weiter nach oben ziehen.`
    );
  }
  if (ehrenRole && botHighest.comparePositionTo(ehrenRole) <= 0) {
    issues.push(
      `Die hoechste Bot-Rolle ("${botHighest.name}") steht in der Rollen-Hierarchie nicht oberhalb von "${ehrenRole.name}" - der Bot kann diese Rolle daher nicht vergeben. Bot-Rolle in den Server-Einstellungen weiter nach oben ziehen.`
    );
  }

  return issues;
}

/**
 * Liest die playersDB und liefert fuer alle Mitglieder der Guild mit
 * Spielzeit-Daten eine sortierte Momentaufnahme (absteigend nach Stunden).
 * Im Gegensatz zu syncGuildRoles werden dabei WEDER Rollen veraendert NOCH
 * die Sync-Historie (data/lastSync.json) fortgeschrieben - rein lesend, daher
 * gefahrlos bei jedem Seitenaufruf im Webpanel aufrufbar (z.B. fuer /top10
 * und den Team-Log-Bereich).
 */
async function listAllPlayers(guild, config) {
  const playtimeData = loadPlaytimeData(config);
  if (guild.members.cache.size === 0) {
    await guild.members.list({ limit: 1000 });
  }

  const previousHours = loadLastHours();
  const list = [];

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;

    const minutes = resolveMinutesForMember(member.id, playtimeData);
    if (minutes === null) continue;

    const hours = minutes / 60;
    const tier = computeTier(hours, config);
    const previous = previousHours[member.id];
    const deltaHours = typeof previous === 'number' ? hours - previous : null;

    list.push({ id: member.id, tag: member.user.tag, hours, tier, deltaHours });
  }

  list.sort((a, b) => b.hours - a.hours);
  return list;
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

  if (guild.members.cache.size === 0) {
    await guild.members.list({ limit: 1000 });
  }

  const previousHours = loadLastHours();
  const currentHours = {};

  const summary = {
    checked: 0,
    withData: 0,
    updated: 0,
    errors: [],
    changes: [],
    details: [],
    totalDeltaHours: 0,
    setupIssues: checkRoleSetup(guild, config),
    dbSynced: null,
  };

  for (const issue of summary.setupIssues) console.warn(`[sync] Setup-Problem: ${issue}`);

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;
    summary.checked += 1;

    const minutes = resolveMinutesForMember(member.id, playtimeData);
    if (minutes === null) continue;
    summary.withData += 1;

    const hours = minutes / 60;
    const tier = computeTier(hours, config);
    currentHours[member.id] = hours;

    const previous = previousHours[member.id];
    const deltaHours = typeof previous === 'number' ? hours - previous : null;
    if (deltaHours) summary.totalDeltaHours += deltaHours;

    summary.details.push({ id: member.id, tag: member.user.tag, hours, tier, deltaHours });

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

  summary.activePlayers = summary.details
    .filter((d) => typeof d.deltaHours === 'number' && d.deltaHours > 0)
    .sort((a, b) => b.deltaHours - a.deltaHours);

  saveLastHours(currentHours);

  if (config.dbEnabled) {
    try {
      await upsertPlaytimeSnapshot(summary.details);
      summary.dbSynced = true;
    } catch (err) {
      summary.dbSynced = false;
      summary.errors.push(`Datenbank-Update fehlgeschlagen: ${err.message}`);
      console.error('[db] Konnte Spielzeit nicht speichern:', err);
    }
  }

  return summary;
}

module.exports = {
  syncGuildRoles,
  listAllPlayers,
  resolveMinutesForMember,
  computeTier,
  TIER_NONE,
  TIER_STAMMSPIELER,
  TIER_EHRENMITGLIED,
};
