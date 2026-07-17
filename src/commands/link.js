const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setLink } = require('../linkStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Verknuepft ein Discord-Mitglied manuell mit einer FiveM-License (Admin).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((opt) => opt.setName('mitglied').setDescription('Discord-Mitglied').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('license')
        .setDescription('FiveM License des Spielers (aus der playersDB, z.B. license:abcdef... oder nur abcdef...)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const member = interaction.options.getUser('mitglied');
    const license = interaction.options.getString('license');

    setLink(member.id, license);

    await interaction.reply({
      content: `${member} wurde manuell mit der License \`${license}\` verknuepft. Die Spielzeit wird beim naechsten Sync beruecksichtigt.`,
      ephemeral: true,
    });
  },
};
