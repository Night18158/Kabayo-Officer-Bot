const { SlashCommandBuilder } = require('discord.js');
const { getAllMembers } = require('../database');
const { getStatusEmoji } = require('../utils/statusLogic');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show the top 5 members by fans this week.'),

  async execute(interaction) {
    const members = getAllMembers().slice(0, 5);

    if (members.length === 0) {
      return interaction.reply({
        content: '📭 No members registered yet.',
        ephemeral: true,
      });
    }

    const lines = members.map((m, i) => {
      const emoji = getStatusEmoji(m.weekly_status);
      return `\`${i + 1}.\` ${emoji} **${m.in_game_name}** — ${formatFans(m.weekly_fans_current)}`;
    });

    return interaction.reply({
      content: ['🏆 **Top 5 This Week**', '', ...lines].join('\n'),
      ephemeral: false,
    });
  },
};
