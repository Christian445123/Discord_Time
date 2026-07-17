const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const cron = require('node-cron');
const config = require('./config');
const { syncGuildRoles } = require('./roleSync');
const { postSyncLog } = require('./syncReport');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

/**
 * node-cron Minutenfelder erlauben nur Schrittwerte bis 59. Ab 60 Minuten
 * wird daher auf das Stundenfeld ausgewichen (z.B. 120 Min. -> "alle 2 Stunden").
 * Intervalle, die weder glatt in Minuten (<60) noch glatt in Stunden aufgehen,
 * werden auf die naechstliegende volle Stunde gerundet.
 */
function buildCronExpression(intervalMinutes) {
  if (intervalMinutes < 60) {
    return `*/${intervalMinutes} * * * *`;
  }
  const hours = Math.max(1, Math.round(intervalMinutes / 60));
  return `0 */${hours} * * *`;
}

async function runSync(reason) {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    console.log(`[sync] Starte Rollen-Abgleich (${reason}) ...`);
    const startedAt = Date.now();
    const summary = await syncGuildRoles(guild, config);
    const durationMs = Date.now() - startedAt;
    console.log(
      `[sync] Fertig in ${durationMs}ms: ${summary.checked} geprueft, ${summary.withData} mit Daten, ${summary.updated} Rollenaenderungen, ${summary.errors.length} Fehler.`
    );
    for (const change of summary.changes) console.log(`[sync]   ${change}`);
    for (const err of summary.errors) console.warn(`[sync]   Fehler: ${err}`);
    for (const d of summary.details) console.log(`[sync]   gelesen: ${d.tag} - ${d.hours.toFixed(1)}h - ${d.tier}`);

    await postSyncLog(client, config, summary, reason, durationMs);
  } catch (err) {
    console.error('[sync] Unerwarteter Fehler beim Rollen-Abgleich:', err);
  }
}

client.once('ready', async () => {
  console.log(`Eingeloggt als ${client.user.tag}.`);

  const cronExpression = buildCronExpression(config.syncIntervalMinutes);
  cron.schedule(cronExpression, () => runSync('geplant'));
  console.log(`Automatischer Sync geplant: alle ${config.syncIntervalMinutes} Minuten (Cron: "${cronExpression}").`);

  await runSync('start');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Fehler beim Ausfuehren von /${interaction.commandName}:`, err);
    const payload = { content: 'Beim Ausfuehren des Befehls ist ein Fehler aufgetreten.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.login(config.token);
