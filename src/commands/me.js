const { SlashCommandBuilder } = require('discord.js');
const { getMember, getMemberStats, getMemberAllTimeBest } = require('../database');
const { formatFans } = require('../utils/formatters');
const { getStatusEmoji, getStatusLabel } = require('../utils/statusLogic');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('me')
    .setDescription('View your personal comprehensive summary.'),

  async execute(interaction) {
    const dbMember = getMember(interaction.user.id);
    if (!dbMember) {
      return interaction.reply({
        content: '❌ You are not registered. Use `/register` first.',
        ephemeral: true,
      });
    }

    const stats = getMemberStats(interaction.user.id);
    const allTimeBest = getMemberAllTimeBest(interaction.user.id);
    const statusEmoji = getStatusEmoji(dbMember.weekly_status);
    const statusLabel = getStatusLabel(dbMember.weekly_status);

    const isPR = stats.totalWeeks > 0 && dbMember.weekly_fans_current > allTimeBest && dbMember.weekly_fans_current > 0;
    const prLine = isPR ? '\n🎉 **Personal Record this week!**' : '';

    const avgLine = stats.totalWeeks > 0
      ? `📈 Your Average: **${formatFans(Math.round(stats.avg))}**`
      : '📈 Your Average: **No history yet**';

    const bestLine = stats.bestWeek
      ? `🏆 Best Week Ever: **${formatFans(stats.bestWeek.fans)}** (${stats.bestWeek.week_label})`
      : '🏆 Best Week Ever: **No history yet**';

    return interaction.reply({
      content: [
        `📋 **Your Summary — ${dbMember.in_game_name}**`,
        '',
        `**This Week:** ${formatFans(dbMember.weekly_fans_current)} ${statusEmoji} ${statusLabel}${prLine}`,
        '',
        avgLine,
        bestLine,
        '',
        `🎯 Target Streak: **${dbMember.streak_target_weeks}** week(s)`,
        `⭐ Elite Streak: **${dbMember.streak_elite_weeks}** week(s)`,
        '',
        stats.totalWeeks > 0 ? [
          `📊 History (${stats.totalWeeks} weeks):`,
          `   🟢 ${stats.greenWeeks} GREEN  🟡 ${stats.yellowWeeks} YELLOW  🔴 ${stats.redWeeks} RED`,
          `   ${stats.trend} Trend: ${stats.trend === '↗️' ? 'Improving' : stats.trend === '↘️' ? 'Declining' : 'Stable'}`,
        ].join('\n') : '',
      ].filter(l => l !== '').join('\n'),
      ephemeral: true,
    });
  },
};
