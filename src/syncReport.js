const { EmbedBuilder } = require('discord.js');

const TIER_LABELS = {
  none: 'Keine',
  stammspieler: 'Stammspieler',
  ehrenmitglied: 'Ehrenmitglied',
};

const FIELDS_PER_EMBED = 25;
const EMBEDS_PER_MESSAGE = 10;

function formatDuration(durationMs) {
  if (typeof durationMs !== 'number') return 'unbekannt';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatDelta(deltaHours) {
  if (deltaHours === null || deltaHours === undefined) return '(erster Sync)';
  const sign = deltaHours >= 0 ? '+' : '';
  return `${sign}${deltaHours.toFixed(1)}h seit letztem Sync`;
}

function buildSummaryEmbed(summary, reason, durationMs) {
  const embed = new EmbedBuilder()
    .setTitle('Spielzeit-Sync')
    .setColor(summary.errors.length ? 0xe67e22 : 0x2ecc71)
    .addFields(
      { name: 'Anlass', value: reason, inline: true },
      { name: 'Geprueft', value: String(summary.checked), inline: true },
      { name: 'Mit Spielzeit-Daten', value: String(summary.withData), inline: true },
      { name: 'Rollenaenderungen', value: String(summary.updated), inline: true },
      { name: 'Dauer', value: formatDuration(durationMs), inline: true },
      { name: 'Neue Spielzeit insgesamt', value: `${summary.totalDeltaHours.toFixed(1)}h seit letztem Sync`, inline: true }
    )
    .setTimestamp(new Date());

  if (summary.changes.length) {
    const changesText = summary.changes.slice(0, 25).join('\n');
    embed.addFields({
      name: 'Rollen-Aenderungen',
      value: changesText.length > 1024 ? changesText.slice(0, 1000) + '\n...' : changesText,
    });
  }

  if (summary.errors.length) {
    const errorsText = summary.errors.slice(0, 10).join('\n');
    embed.addFields({
      name: 'Fehler',
      value: errorsText.length > 1024 ? errorsText.slice(0, 1000) + '\n...' : errorsText,
    });
  }

  return embed;
}

function buildPlayerEmbeds(summary) {
  if (!summary.details.length) {
    return [
      new EmbedBuilder()
        .setTitle('Ausgelesene Spieler')
        .setDescription('Keine Spieler mit Spielzeit-Daten gefunden.')
        .setColor(0x2b82ff),
    ];
  }

  const embeds = [];
  for (let i = 0; i < summary.details.length; i += FIELDS_PER_EMBED) {
    const chunk = summary.details.slice(i, i + FIELDS_PER_EMBED);
    const embed = new EmbedBuilder()
      .setColor(0x2b82ff)
      .setTitle(i === 0 ? 'Ausgelesene Spieler' : 'Ausgelesene Spieler (Fortsetzung)');

    for (const d of chunk) {
      embed.addFields({
        name: `${d.tag} — ${TIER_LABELS[d.tier]}`,
        value: `${d.hours.toFixed(1)}h  ·  ${formatDelta(d.deltaHours)}`,
        inline: true,
      });
    }
    embeds.push(embed);
  }
  return embeds;
}

/**
 * Postet nach jedem Sync (automatisch oder manuell) in den konfigurierten
 * Log-Channel: eine Zusammenfassung (Dauer, Anzahl, Rollenaenderungen, seit
 * dem letzten Sync neu hinzugekommene Spielzeit insgesamt) sowie die
 * vollstaendige, aktuelle Liste aller ausgelesenen Spieler samt Spielzeit und
 * individuellem Zuwachs seit dem letzten Durchlauf.
 */
async function postSyncLog(client, config, summary, reason, durationMs) {
  if (!config.logChannelId) return;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel.send({ embeds: [buildSummaryEmbed(summary, reason, durationMs)] }).catch((err) => {
    console.error('[sync] Konnte Zusammenfassung nicht senden:', err);
  });

  const playerEmbeds = buildPlayerEmbeds(summary);
  for (let i = 0; i < playerEmbeds.length; i += EMBEDS_PER_MESSAGE) {
    await channel.send({ embeds: playerEmbeds.slice(i, i + EMBEDS_PER_MESSAGE) }).catch((err) => {
      console.error('[sync] Konnte Spielerliste nicht senden:', err);
    });
  }
}

module.exports = { postSyncLog };
