const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeExclude } = require('../excludeStore');
const { postExcludeLog } = require('../syncReport');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('include')
    .setDescription('Nimmt ein zuvor mit /exclude entferntes Mitglied wieder in die Zeitauflistung auf (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) => opt.setName('mitglied').setDescription('Discord-Mitglied').setRequired(true)),

  async execute(interaction) {
    const member = interaction.options.getUser('mitglied');
    removeExclude(member.id);
    await postExcludeLog(interaction.client, config, {
      discordId: member.id,
      action: 'include',
      actorLabel: `${interaction.user.tag} (Discord)`,
    });
    await interaction.reply({
      content: `${member} wird wieder in der Zeitauflistung beruecksichtigt.`,
      ephemeral: true,
    });
  },
};
