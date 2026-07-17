const { EmbedBuilder } = require('discord.js');

const TIER_LABELS = {
  none: 'Keine',
  stammspieler: 'Stammspieler',
  ehrenmitglied: 'Ehrenmitglied',
};

const MAX_CHUNK_LENGTH = 1900;

function buildDetailLines(summary) {
  if (!summary.details.length) return ['Keine Spieler mit Spielzeit-Daten gefunden.'];
  return summary.details.map(
    (d) => `${d.tag.padEnd(32, ' ')} ${d.hours.toFixed(1).padStart(8, ' ')}h  ${TIER_LABELS[d.tier]}`
  );
}

function chunkLines(lines, maxLength = MAX_CHUNK_LENGTH) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (currentLength + lineLength > maxLength && current.length) {
      chunks.push(current.join('\n'));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length) chunks.push(current.join('\n'));

  return chunks;
}

/**
 * Postet nach jedem Sync (automatisch oder manuell) in den konfigurierten
 * Log-Channel: eine Zusammenfassung (Embed) sowie die vollstaendige, aktuelle
 * Liste aller ausgelesenen Spieler samt Spielzeit als normale Textnachricht(en).
 * Bei vielen Spielern wird die Liste auf mehrere Nachrichten aufgeteilt, um
 * das Discord-Nachrichtenlimit von 2000 Zeichen nicht zu sprengen.
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

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error('[sync] Konnte Log-Nachricht nicht senden:', err);
  });

  const chunks = chunkLines(buildDetailLines(summary));
  for (const chunk of chunks) {
    await channel.send({ content: '```\n' + chunk + '\n```' }).catch((err) => {
      console.error('[sync] Konnte Spielerliste nicht senden:', err);
    });
  }
}

module.exports = { postSyncLog, buildDetailLines };
