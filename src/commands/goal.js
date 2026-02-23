const { SlashCommandBuilder } = require('discord.js');
const { getMember, getThresholds } = require('../database');
const { formatFans } = require('../utils/formatters');

/**
 * Build a text-based progress bar.
 * @param {number} current
 * @param {number} target
 * @param {number} [width=10]
 * @returns {string}
 */
function buildProgressBar(current, target, width = 10) {
  const pct = Math.min(1, target > 0 ? current / target : 1);
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `[${bar}] ${Math.round(pct * 100)}%`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('goal')
    .setDescription('See how many fans you need to reach the next tier.'),

  async execute(interaction) {
    const dbMember = getMember(interaction.user.id);
    if (!dbMember) {
      return interaction.reply({
        content: '❌ You are not registered. Use `/link-profile` first.',
        ephemeral: true,
      });
    }

    const thresholds = getThresholds();
    const fans = dbMember.weekly_fans_current;

    let target, label;
    if (fans >= thresholds.elite_fans) {
      return interaction.reply({
        content: [
          `🎯 **Your Goal — ${dbMember.in_game_name}**`,
          '',
          `⚡ You've already reached **ELITE** tier! (${formatFans(fans)})`,
          '🏆 Amazing work — keep it up!',
        ].join('\n'),
        ephemeral: false,
      });
    } else if (fans >= thresholds.target_fans) {
      target = thresholds.elite_fans;
      label = '⚡ ELITE';
    } else if (fans >= thresholds.min_fans) {
      target = thresholds.target_fans;
      label = '🟢 GREEN';
    } else {
      target = thresholds.min_fans;
      label = '🟡 YELLOW';
    }

    const remaining = target - fans;
    const bar = buildProgressBar(fans, target);

    return interaction.reply({
      content: [
        `🎯 **Your Goal — ${dbMember.in_game_name}**`,
        '',
        `**Current fans:** ${formatFans(fans)}`,
        `**Next tier:** ${label} (${formatFans(target)})`,
        `**Fans remaining:** +${formatFans(remaining)}`,
        '',
        bar,
      ].join('\n'),
      ephemeral: false,
    });
  },
};
