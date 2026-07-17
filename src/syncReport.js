const { EmbedBuilder } = require('discord.js');

const TIER_LABELS = {
  none: 'Keine',
  stammspieler: 'Stammspieler',
  ehrenmitglied: 'Ehrenmitglied',
};

const FIELDS_PER_EMBED = 25;
const EMBEDS_PER_MESSAGE = 10;
const MAX_DESCRIPTION_LENGTH = 3900;

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

/**
 * Teilt eine Liste von Zeilen in mehrere Embeds auf, sodass weder das
 * Discord-Limit fuer Embed-Beschreibungen (4096 Zeichen) noch das Limit fuer
 * Embeds pro Nachricht (10) gesprengt wird. Damit werden Aenderungen und
 * Fehler IMMER vollstaendig geloggt, egal wie viele es sind.
 */
function buildListEmbeds(title, lines, color) {
  if (!lines.length) return [];

  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    const lineLength = line.length + 1;
    if (currentLength + lineLength > MAX_DESCRIPTION_LENGTH && current.length) {
      chunks.push(current.join('\n'));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length) chunks.push(current.join('\n'));

  return chunks.map((chunk, i) =>
    new EmbedBuilder()
      .setColor(color)
      .setTitle(i === 0 ? title : `${title} (Fortsetzung)`)
      .setDescription(chunk)
  );
}

function buildSummaryEmbed(summary, reason, durationMs) {
  const hasSetupIssues = summary.setupIssues.length > 0;

  const embed = new EmbedBuilder()
    .setTitle(hasSetupIssues ? '⚠️ Spielzeit-Sync (Setup-Problem!)' : 'Spielzeit-Sync')
    .setColor(hasSetupIssues ? 0xe74c3c : summary.errors.length ? 0xe67e22 : 0x2ecc71)
    .addFields(
      { name: 'Anlass', value: reason, inline: true },
      { name: 'Geprueft', value: String(summary.checked), inline: true },
      { name: 'Mit Spielzeit-Daten', value: String(summary.withData), inline: true },
      { name: 'Rollenaenderungen', value: String(summary.updated), inline: true },
      { name: 'Fehler', value: String(summary.errors.length), inline: true },
      { name: '🎮 Aktive Spieler', value: String(summary.activePlayers.length), inline: true },
      { name: 'Dauer', value: formatDuration(durationMs), inline: true },
      { name: '⏱️ Neue Spielzeit insgesamt', value: `**${summary.totalDeltaHours.toFixed(1)}h** seit letztem Sync`, inline: true }
    )
    .setTimestamp(new Date());

  return embed;
}

/**
 * Baut Embeds fuer die Spieler, deren Spielzeit sich seit dem letzten Sync
 * tatsaechlich erhoeht hat - also alle, die zwischen den beiden Durchlaeufen
 * aktiv auf dem Server gespielt haben. Sortiert nach groesstem Zuwachs zuerst.
 */
function buildActivePlayerEmbeds(summary) {
  if (!summary.activePlayers.length) return [];

  const embeds = [];
  for (let i = 0; i < summary.activePlayers.length; i += FIELDS_PER_EMBED) {
    const chunk = summary.activePlayers.slice(i, i + FIELDS_PER_EMBED);
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(i === 0 ? '🎮 Aktive Spieler seit dem letzten Sync' : '🎮 Aktive Spieler (Fortsetzung)');

    for (const d of chunk) {
      embed.addFields({
        name: `${d.tag} — ${TIER_LABELS[d.tier]}`,
        value: `**+${d.deltaHours.toFixed(1)}h** dazugekommen\n(jetzt ${d.hours.toFixed(1)}h gesamt)`,
        inline: true,
      });
    }
    embeds.push(embed);
  }
  return embeds;
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
        value: `**${d.hours.toFixed(1)}h** gesamt\n${formatDelta(d.deltaHours)}`,
        inline: true,
      });
    }
    embeds.push(embed);
  }
  return embeds;
}

async function sendEmbedBatches(channel, embeds, errorLabel) {
  for (let i = 0; i < embeds.length; i += EMBEDS_PER_MESSAGE) {
    await channel.send({ embeds: embeds.slice(i, i + EMBEDS_PER_MESSAGE) }).catch((err) => {
      console.error(`[sync] Konnte ${errorLabel} nicht senden:`, err);
    });
  }
}

/**
 * Postet nach jedem Sync (automatisch oder manuell) ein vollstaendiges Log in
 * den konfigurierten Log-Channel: Zusammenfassung, Setup-Probleme (falls
 * vorhanden), ALLE Rollen-Aenderungen, ALLE Fehler, die Liste der Spieler,
 * deren Zeit sich seit dem letzten Sync veraendert hat (also wer aktiv war),
 * und die komplette Liste aller ausgelesenen Spieler samt Spielzeit und
 * Zuwachs seit dem letzten Durchlauf. Nichts wird gekuerzt - bei Bedarf wird
 * auf mehrere Nachrichten aufgeteilt.
 */
async function postSyncLog(client, config, summary, reason, durationMs) {
  if (!config.logChannelId) return;

  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  await channel.send({ embeds: [buildSummaryEmbed(summary, reason, durationMs)] }).catch((err) => {
    console.error('[sync] Konnte Zusammenfassung nicht senden:', err);
  });

  if (summary.setupIssues.length) {
    const setupEmbeds = buildListEmbeds('⚠️ Der Bot kann Rollen (teilweise) nicht vergeben', summary.setupIssues, 0xe74c3c);
    await sendEmbedBatches(channel, setupEmbeds, 'Setup-Probleme');
  }

  if (summary.changes.length) {
    const changeEmbeds = buildListEmbeds('Rollen-Aenderungen', summary.changes, 0x3498db);
    await sendEmbedBatches(channel, changeEmbeds, 'Rollen-Aenderungen');
  }

  if (summary.errors.length) {
    const errorEmbeds = buildListEmbeds('Fehler', summary.errors, 0xe74c3c);
    await sendEmbedBatches(channel, errorEmbeds, 'Fehler-Liste');
  }

  await sendEmbedBatches(channel, buildActivePlayerEmbeds(summary), 'Liste aktiver Spieler');
  await sendEmbedBatches(channel, buildPlayerEmbeds(summary), 'Spielerliste');
}

module.exports = { postSyncLog };
