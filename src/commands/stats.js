const { SlashCommandBuilder } = require('discord.js');
const { getMember, getGuildStats, getMemberStats, getAllMembers } = require('../database');
const { formatFans } = require('../utils/formatters');
const { getStatusEmoji } = require('../utils/statusLogic');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View guild or member statistics.')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('View a specific member\'s stats (defaults to guild stats)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (!targetUser) {
      // Guild stats
      const stats = getGuildStats();

      if (stats.totalWeeks === 0) {
        return interaction.reply({
          content: '📊 No historical data yet. Stats will appear after the first week close.',
          ephemeral: false,
        });
      }

      const bestLine = stats.bestWeek
        ? `${stats.bestWeek.week_label} — ${formatFans(stats.bestWeek.total)}`
        : '—';
      const worstLine = stats.worstWeek
        ? `${stats.worstWeek.week_label} — ${formatFans(stats.worstWeek.total)}`
        : '—';

      return interaction.reply({
        content: [
          '📊 **Guild Statistics**',
          '',
          `📅 Weeks Tracked: **${stats.totalWeeks}**`,
          `📈 Historical Average: **${formatFans(Math.round(stats.avgPerWeek))}** per week`,
          `🏆 Best Week: **${bestLine}**`,
          `📉 Worst Week: **${worstLine}**`,
          `${stats.trend} Trend: ${stats.trend === '↗️' ? 'Improving' : stats.trend === '↘️' ? 'Declining' : 'Stable'}`,
        ].join('\n'),
        ephemeral: false,
      });
    }

    // Individual member stats
    const dbMember = getMember(targetUser.id);
    if (!dbMember) {
      return interaction.reply({
        content: `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
    }

    const stats = getMemberStats(targetUser.id);

    if (stats.totalWeeks === 0) {
      return interaction.reply({
        content: `📊 No historical data for **${dbMember.in_game_name}** yet.`,
        ephemeral: false,
      });
    }

    const bestLine = stats.bestWeek
      ? `${stats.bestWeek.week_label} — ${formatFans(stats.bestWeek.fans)}`
      : '—';

    return interaction.reply({
      content: [
        `📊 **Stats for ${dbMember.in_game_name}**`,
        '',
        `📅 Weeks Tracked: **${stats.totalWeeks}**`,
        `📈 Historical Average: **${formatFans(Math.round(stats.avg))}**`,
        `🏆 Best Week: **${bestLine}**`,
        `🎯 Current Target Streak: **${dbMember.streak_target_weeks}** week(s)`,
        `⭐ Current Elite Streak: **${dbMember.streak_elite_weeks}** week(s)`,
        '',
        `🟢 GREEN weeks: ${stats.greenWeeks}`,
        `🟡 YELLOW weeks: ${stats.yellowWeeks}`,
        `🔴 RED weeks: ${stats.redWeeks}`,
        '',
        `${stats.trend} Trend: ${stats.trend === '↗️' ? 'Improving' : stats.trend === '↘️' ? 'Declining' : 'Stable'}`,
      ].join('\n'),
      ephemeral: false,
    });
  },
};
