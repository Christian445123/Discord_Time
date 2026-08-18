const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addExclude } = require('../excludeStore');
const { deletePlayerRecord } = require('../db');
const { postExcludeLog } = require('../syncReport');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exclude')
    .setDescription('Entfernt ein Mitglied komplett aus der Zeitauflistung (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) => opt.setName('mitglied').setDescription('Discord-Mitglied').setRequired(true)),

  async execute(interaction) {
    const member = interaction.options.getUser('mitglied');
    addExclude(member.id);
    await deletePlayerRecord(member.id).catch(() => null);
    await postExcludeLog(interaction.client, config, {
      discordId: member.id,
      action: 'exclude',
      actorLabel: `${interaction.user.tag} (Discord)`,
    });
    await interaction.reply({
      content: `${member} wurde aus der Zeitauflistung entfernt und wird bei /playtime, /top10 sowie dem naechsten Sync nicht mehr beruecksichtigt. Mit \`/include\` kann das rueckgaengig gemacht werden.`,
      ephemeral: true,
    });
  },
};
