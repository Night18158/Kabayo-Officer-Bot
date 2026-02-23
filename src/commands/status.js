const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getMember, getThresholds } = require('../database');
const { getStatusEmoji, getStatusLabel, fansNeededForNext } = require('../utils/statusLogic');
const { formatFans, formatNumber } = require('../utils/formatters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check the weekly status of a member.')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Member to check (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;
    const dbMember = getMember(targetUser.id);

    if (!dbMember) {
      const isSelf = targetUser.id === interaction.user.id;
      await interaction.reply({
        content: isSelf
          ? '❌ You are not registered yet. Use `/link-profile` first.'
          : `❌ <@${targetUser.id}> is not registered yet.`,
        ephemeral: true,
      });
      return;
    }

    const thresholds = getThresholds();
    const fans = dbMember.weekly_fans_current;
    const status = dbMember.weekly_status;
    const emoji = getStatusEmoji(status);
    const label = getStatusLabel(status);
    const nextInfo = fansNeededForNext(fans, thresholds);

    const lastSub = dbMember.last_submission_timestamp
      ? new Date(dbMember.last_submission_timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Madrid' })
      : 'Never';

    await interaction.reply({
      content: [
        `${emoji} **Status for ${dbMember.in_game_name}**`,
        ``,
        `**Weekly Fans:** ${formatNumber(fans)} (${formatFans(fans)})`,
        `**Status:** ${emoji} ${label}`,
        `**Streak (≥ target):** ${dbMember.streak_target_weeks} week(s)`,
        `**Streak (elite):** ${dbMember.streak_elite_weeks} week(s)`,
        `**Consecutive RED weeks:** ${dbMember.consecutive_red_weeks}`,
        `**Last submission:** ${lastSub}`,
        ``,
        nextInfo,
      ].join('\n'),
      ephemeral: false,
    });
  },
};
