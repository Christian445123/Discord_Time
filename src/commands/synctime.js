const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { syncGuildRoles } = require('../roleSync');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('synctime')
    .setDescription('Erzwingt einen sofortigen Abgleich der Spielzeit-Rollen (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const summary = await syncGuildRoles(interaction.guild, config);

    const lines = [
      `Geprueft: ${summary.checked} Mitglieder`,
      `Mit Spielzeit-Daten: ${summary.withData}`,
      `Rollenaenderungen: ${summary.updated}`,
    ];
    if (summary.changes.length) {
      lines.push('', ...summary.changes.slice(0, 20));
      if (summary.changes.length > 20) lines.push(`... und ${summary.changes.length - 20} weitere`);
    }
    if (summary.errors.length) {
      lines.push('', 'Fehler:', ...summary.errors.slice(0, 10));
    }

    await interaction.editReply({ content: '```\n' + lines.join('\n') + '\n```' });
  },
};
