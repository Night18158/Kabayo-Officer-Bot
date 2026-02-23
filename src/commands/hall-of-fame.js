const { SlashCommandBuilder } = require('discord.js');
const { getHallOfFame } = require('../database');
const { formatFans } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hall-of-fame')
    .setDescription('View the all-time guild hall of fame.'),

  async execute(interaction) {
    const hof = getHallOfFame();

    const lines = ['🏛️ **Hall of Fame** — All-Time Records', ''];

    if (hof.mvpCounts) {
      lines.push(`🏆 **Most MVPs:** ${hof.mvpCounts.in_game_name} (${hof.mvpCounts.mvp_count} MVP weeks)`);
    }

    if (hof.highestFans) {
      lines.push(`⚡ **Highest Single Week:** ${hof.highestFans.in_game_name} — ${formatFans(hof.highestFans.fans)} (${hof.highestFans.week_label})`);
    }

    if (hof.longestTargetStreak && hof.longestTargetStreak.streak_target_weeks > 0) {
      lines.push(`🎯 **Longest Target Streak:** ${hof.longestTargetStreak.in_game_name} — ${hof.longestTargetStreak.streak_target_weeks} week(s)`);
    }

    if (hof.longestEliteStreak && hof.longestEliteStreak.streak_elite_weeks > 0) {
      lines.push(`⭐ **Longest Elite Streak:** ${hof.longestEliteStreak.in_game_name} — ${hof.longestEliteStreak.streak_elite_weeks} week(s)`);
    }

    if (hof.mostGreen) {
      lines.push(`🟢 **Most GREEN Weeks:** ${hof.mostGreen.in_game_name} — ${hof.mostGreen.green_weeks} weeks`);
    }

    if (lines.length === 2) {
      lines.push('No records yet. Complete a week to start building the Hall of Fame!');
    }

    return interaction.reply({
      content: lines.join('\n'),
      ephemeral: false,
    });
  },
};
