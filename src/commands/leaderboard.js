const { SlashCommandBuilder } = require('discord.js');
const { getAllMembers, getThresholds } = require('../database');
const { getStatusEmoji } = require('../utils/statusLogic');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the guild fan leaderboard.')
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Leaderboard type (default: week)')
        .setRequired(false)
        .addChoices(
          { name: 'week', value: 'week' },
          { name: 'season', value: 'season' }
        )
    )
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('Sort order (default: top)')
        .setRequired(false)
        .addChoices(
          { name: 'top', value: 'top' },
          { name: 'bottom', value: 'bottom' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Number of entries to show (default: 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type') ?? 'week';
    const sort = interaction.options.getString('sort') ?? 'top';
    const count = interaction.options.getInteger('count') ?? 10;

    let members = getAllMembers();

    if (members.length === 0) {
      await interaction.reply({
        content: '📭 No members registered yet.',
        ephemeral: false,
      });
      return;
    }

    // Sort
    if (sort === 'top') {
      members.sort((a, b) => b.weekly_fans_current - a.weekly_fans_current);
    } else {
      members.sort((a, b) => a.weekly_fans_current - b.weekly_fans_current);
    }

    const page = members.slice(0, count);
    const thresholds = getThresholds();

    const sortLabel = sort === 'top' ? 'Top' : 'Bottom';
    const title = `📊 **${sortLabel} ${page.length} — Weekly Fan Leaderboard**`;

    const rows = page.map((m, i) => {
      const emoji = getStatusEmoji(m.weekly_status);
      const rank = sort === 'top' ? i + 1 : members.length - page.length + i + 1;
      const fans = formatFans(m.weekly_fans_current);
      return `\`${String(rank).padStart(2, ' ')}.\` ${emoji} **${m.in_game_name}** — ${fans}`;
    });

    await interaction.reply({
      content: [title, '', ...rows].join('\n'),
      ephemeral: false,
    });
  },
};
