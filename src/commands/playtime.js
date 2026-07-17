const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadPlaytimeData } = require('../playtimeStore');
const { resolveMinutesForMember, computeTier, TIER_EHRENMITGLIED, TIER_STAMMSPIELER } = require('../roleSync');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playtime')
    .setDescription('Zeigt die Spielzeit und den Rollen-Fortschritt eines Mitglieds an.')
    .addUserOption((opt) =>
      opt.setName('mitglied').setDescription('Optional: anderes Mitglied anzeigen').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('mitglied') || interaction.user;

    const playtimeData = loadPlaytimeData(config);
    const minutes = resolveMinutesForMember(target.id, playtimeData);

    if (minutes === null) {
      await interaction.reply({
        content: `Fuer ${target} wurde keine Spielzeit gefunden. Entweder wurde der Discord-Account nicht mit dem FiveM-Account verknuepft, oder es gibt noch keine Sessions auf dem Server. Ein Admin kann mit \`/link\` manuell verknuepfen.`,
        ephemeral: true,
      });
      return;
    }

    const hours = minutes / 60;
    const tier = computeTier(hours, config);

    let nextTierText;
    if (tier === TIER_EHRENMITGLIED) {
      nextTierText = 'Hoechste Stufe erreicht (Ehrenmitglied).';
    } else if (tier === TIER_STAMMSPIELER) {
      const remaining = config.ehrenmitgliedHours - hours;
      nextTierText = `Noch ${remaining.toFixed(1)}h bis Ehrenmitglied (${config.ehrenmitgliedHours}h).`;
    } else {
      const remaining = config.stammspielerHours - hours;
      nextTierText = `Noch ${remaining.toFixed(1)}h bis Stammspieler (${config.stammspielerHours}h).`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Spielzeit von ${target.username}`)
      .addFields(
        { name: 'Spielzeit', value: `${hours.toFixed(1)} Stunden`, inline: true },
        { name: 'Aktuelle Stufe', value: tier === 'none' ? 'Keine' : tier === TIER_STAMMSPIELER ? 'Stammspieler' : 'Ehrenmitglied', inline: true },
        { name: 'Fortschritt', value: nextTierText }
      )
      .setColor(0x2b82ff);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
