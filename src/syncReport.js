const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const TIER_LABELS = {
  none: 'Keine',
  stammspieler: 'Stammspieler',
  ehrenmitglied: 'Ehrenmitglied',
};

function buildDetailsText(summary) {
  if (!summary.details.length) return 'Keine Spieler mit Spielzeit-Daten gefunden.';
  return summary.details
    .map((d) => `${d.tag.padEnd(32, ' ')} ${d.hours.toFixed(1).padStart(8, ' ')}h  ${TIER_LABELS[d.tier]}`)
    .join('\n');
}

/**
 * Postet nach jedem Sync (automatisch oder manuell) eine Zusammenfassung in
 * den konfigurierten Log-Channel: wie viele Spieler ausgelesen wurden, welche
 * Spieler das im Detail sind (als Textdatei-Anhang, damit auch grosse Listen
 * die Discord-Nachrichtenlaenge nicht sprengen) und welche Rollenaenderungen
 * vorgenommen wurden.
 */
async function postSyncLog(client, config, summary, reason) {
  if (!config.logChannelId) return;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('Spielzeit-Sync')
    .setColor(summary.errors.length ? 0xe67e22 : 0x2ecc71)
    .addFields(
      { name: 'Anlass', value: reason, inline: true },
      { name: 'Geprueft', value: String(summary.checked), inline: true },
      { name: 'Mit Spielzeit-Daten', value: String(summary.withData), inline: true },
      { name: 'Rollenaenderungen', value: String(summary.updated), inline: true }
    )
    .setTimestamp(new Date());

  if (summary.changes.length) {
    const changesText = summary.changes.slice(0, 25).join('\n');
    embed.addFields({
      name: 'Aenderungen',
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

  const attachment = new AttachmentBuilder(Buffer.from(buildDetailsText(summary), 'utf8'), {
    name: 'ausgelesene-spieler.txt',
  });

  await channel.send({ embeds: [embed], files: [attachment] }).catch((err) => {
    console.error('[sync] Konnte Log-Nachricht nicht senden:', err);
  });
}

module.exports = { postSyncLog, buildDetailsText };
