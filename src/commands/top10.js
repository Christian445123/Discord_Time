const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { loadPlaytimeData } = require('../playtimeStore');
const { resolveMinutesForMember, computeTier, TIER_STAMMSPIELER, TIER_EHRENMITGLIED } = require('../roleSync');
const config = require('../config');

const MEDALS = ['🥇', '🥈', '🥉'];

function tierBadge(tier) {
  if (tier === TIER_EHRENMITGLIED) return ' 👑';
  if (tier === TIER_STAMMSPIELER) return ' ⭐';
  return '';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top10')
    .setDescription('Zeigt die Top 10 Spieler nach Spielzeit.'),

  async execute(interaction) {
    await interaction.deferReply();

    const playtimeData = loadPlaytimeData(config);
    await interaction.guild.members.fetch();

    const entries = [];
    for (const member of interaction.guild.members.cache.values()) {
      if (member.user.bot) continue;
      const minutes = resolveMinutesForMember(member.id, playtimeData);
      if (minutes === null) continue;
      entries.push({ member, hours: minutes / 60 });
    }

    if (!entries.length) {
      await interaction.editReply('Es wurden noch keine Spielzeit-Daten gefunden.');
      return;
    }

    entries.sort((a, b) => b.hours - a.hours);
    const top = entries.slice(0, 10);

    const lines = top.map((entry, i) => {
      const placement = MEDALS[i] || `**${i + 1}.**`;
      const tier = computeTier(entry.hours, config);
      return `${placement} ${entry.member} — **${entry.hours.toFixed(1)}h**${tierBadge(tier)}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Top 10 Spielzeit')
      .setDescription(lines.join('\n'))
      .setColor(0xf1c40f)
      .setFooter({ text: `${entries.length} Spieler insgesamt erfasst` })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
