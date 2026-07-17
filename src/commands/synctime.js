const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { syncGuildRoles } = require('../roleSync');
const { postSyncLog } = require('../syncReport');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('synctime')
    .setDescription('Erzwingt einen sofortigen Abgleich der Spielzeit-Rollen (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const summary = await syncGuildRoles(interaction.guild, config);
    await postSyncLog(interaction.client, config, summary, `manuell von ${interaction.user.tag}`);

    const lines = [
      `Geprueft: ${summary.checked} Mitglieder`,
      `Mit Spielzeit-Daten: ${summary.withData}`,
      `Rollenaenderungen: ${summary.updated}`,
    ];
    if (summary.errors.length) {
      lines.push('', 'Fehler:', ...summary.errors.slice(0, 10));
    }
    if (config.logChannelId) {
      lines.push('', `Vollstaendige Liste wurde in <#${config.logChannelId}> gepostet.`);
    }

    await interaction.editReply({ content: '```\n' + lines.join('\n') + '\n```' });
  },
};
