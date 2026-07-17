const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { removeLink } = require('../linkStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Entfernt die manuelle Verknuepfung eines Discord-Mitglieds (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) => opt.setName('mitglied').setDescription('Discord-Mitglied').setRequired(true)),

  async execute(interaction) {
    const member = interaction.options.getUser('mitglied');
    removeLink(member.id);
    await interaction.reply({ content: `Manuelle Verknuepfung von ${member} wurde entfernt.`, ephemeral: true });
  },
};
